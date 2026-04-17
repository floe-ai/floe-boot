import { existsSync, cpSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve, relative } from "node:path";
import { homedir, platform } from "node:os";
import { spawnSync } from "node:child_process";
import * as prompts from "@clack/prompts";

function shellName() {
  return process.platform === "win32" ? "powershell" : "bash";
}

function commandExists(command) {
  const checker = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(checker, [command], { stdio: "ignore" });
  return result.status === 0;
}

function extractVersion(text, regexSource) {
  const regex = regexSource ? new RegExp(regexSource) : /\d+(?:\.\d+){0,2}/;
  const match = `${text}`.match(regex);
  return match ? match[0] : null;
}

function compareVersions(actual, minimum) {
  const toParts = (value) =>
    value
      .split(".")
      .map((part) => Number.parseInt(part, 10))
      .filter((part) => Number.isFinite(part));

  const actualParts = toParts(actual);
  const minimumParts = toParts(minimum);
  const max = Math.max(actualParts.length, minimumParts.length);

  for (let index = 0; index < max; index += 1) {
    const a = actualParts[index] ?? 0;
    const b = minimumParts[index] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

function ensureInside(baseDir, candidate, label) {
  const base = resolve(baseDir);
  const target = resolve(candidate);
  const rel = relative(base, target);

  if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error(`${label} escapes its allowed root`);
  }

  return target;
}

function resolveInstallRoot(mode, installRoot, projectRoot) {
  if (isAbsolute(installRoot)) return installRoot;
  return mode === "global" ? resolve(homedir(), installRoot) : resolve(projectRoot, installRoot);
}

function resolveAppInstallRoot(installRoot, appRoot) {
  return ensureInside(installRoot, resolve(installRoot, appRoot), "app install root");
}

function normalizeTargetId(modeConfig, targetId) {
  if (!targetId) return null;
  const target = modeConfig.targets.find((entry) => entry.id === targetId);
  if (!target) {
    throw new Error(`Unknown target '${targetId}' for selected mode`);
  }
  return target.id;
}

function formatSummary(context) {
  return [
    `App: ${context.manifest.app.name}`,
    `Mode: ${context.mode}`,
    `Project root: ${context.projectRoot}`,
    `Shared install root: ${context.installRoot}`,
    `App install root: ${context.appInstallRoot}`,
    `Target: ${context.target ?? "default"}`,
    `Manifest: ${context.manifest.path}`,
  ].join("\n");
}

async function selectMode(context) {
  if (context.args.mode) return context.args.mode;

  const choices = ["project", "global"]
    .filter((mode) => context.manifest.modes[mode].enabled)
    .map((mode) => ({
      value: mode,
      label: mode,
      hint: mode === "project" ? "current repo/project context" : "user-level home install",
    }));

  if (choices.length === 0) {
    throw new Error("Manifest does not enable any install modes");
  }
  if (choices.length === 1 || !context.interactive) {
    return context.manifest.defaults.mode;
  }

  const selection = await prompts.select({
    message: "Select install mode",
    options: choices,
    initialValue: context.manifest.defaults.mode,
  });

  if (prompts.isCancel(selection)) {
    throw new Error("Installation cancelled");
  }
  return selection;
}

async function selectTarget(context, modeConfig) {
  if (!modeConfig.targets.length) return null;
  if (context.args.target) return normalizeTargetId(modeConfig, context.args.target);
  if (modeConfig.targets.length === 1 || !context.interactive) {
    return modeConfig.targets[0].id;
  }

  const selection = await prompts.select({
    message: "Select target",
    options: modeConfig.targets.map((entry) => ({
      value: entry.id,
      label: entry.label,
      hint: entry.description,
    })),
  });

  if (prompts.isCancel(selection)) {
    throw new Error("Installation cancelled");
  }
  return selection;
}

function createContext(manifest, args) {
  const interactive = process.stdout.isTTY && !args.nonInteractive && !args.yes;

  if (!process.stdout.isTTY && !args.nonInteractive && !args.yes) {
    throw new Error("Interactive installation requires a modern terminal. Use --yes or --non-interactive for scripted use.");
  }

  return {
    manifest,
    args,
    interactive,
    projectRoot: resolve(args.projectRoot ?? process.cwd()),
    platform: platform(),
  };
}

function summarizeIssue(prerequisite, details) {
  const base = `${prerequisite.displayName} (${prerequisite.command})`;
  return details ? `${base}: ${details}` : base;
}

function runShellCommand(command, cwd) {
  return spawnSync(command, {
    cwd,
    stdio: "inherit",
    shell: shellName(),
  });
}

async function ensurePrerequisites(context) {
  const failures = [];

  for (const prerequisite of context.manifest.prerequisites) {
    const installed = commandExists(prerequisite.command);
    let version = null;
    let versionOk = true;

    if (installed && prerequisite.minVersion) {
      const versionResult = spawnSync(prerequisite.versionCommand, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: shellName(),
        encoding: "utf8",
      });

      const combined = `${versionResult.stdout ?? ""}\n${versionResult.stderr ?? ""}`;
      version = extractVersion(combined, prerequisite.versionRegex);
      versionOk = Boolean(version) && compareVersions(version, prerequisite.minVersion) >= 0;
    }

    if (installed && versionOk) continue;

    const reason = !installed
      ? "not installed"
      : `version ${version ?? "unknown"} does not satisfy minimum ${prerequisite.minVersion}`;

    const installCommand = prerequisite.installCommands?.[context.platform];
    const instruction = prerequisite.instructions?.[context.platform] ?? prerequisite.instructions?.default;

    if (prerequisite.autoInstall && installCommand) {
      if (context.interactive) {
        const approved = await prompts.confirm({
          message: `Install missing prerequisite ${summarizeIssue(prerequisite, reason)}?`,
          initialValue: true,
        });

        if (prompts.isCancel(approved)) {
          throw new Error("Installation cancelled");
        }

        if (!approved) {
          failures.push(`${summarizeIssue(prerequisite, reason)}\n${instruction ?? "No automatic install approved."}`);
          continue;
        }
      } else if (!context.args.yes) {
        failures.push(`${summarizeIssue(prerequisite, reason)}\nUse --yes to allow scripted auto-install.`);
        continue;
      }

      if (context.args.dryRun) {
        context.actions.push({
          type: "install-prerequisite",
          command: installCommand,
          prerequisite: prerequisite.id,
        });
        continue;
      }

      const result = runShellCommand(installCommand, context.projectRoot);
      if (result.status !== 0) {
        failures.push(`${summarizeIssue(prerequisite, reason)}\nAuto-install failed: ${installCommand}`);
      }
      continue;
    }

    failures.push(`${summarizeIssue(prerequisite, reason)}${instruction ? `\n${instruction}` : ""}`);
  }

  if (failures.length) {
    throw new Error(`Prerequisite check failed:\n- ${failures.join("\n- ")}`);
  }
}

function resolveExecutableForHook(scriptPath) {
  const extension = extname(scriptPath).toLowerCase();
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return [process.execPath, [scriptPath]];
  }
  if (extension === ".ts") {
    if (!commandExists("bun")) {
      throw new Error(`Cannot run TypeScript hook without Bun: ${scriptPath}`);
    }
    return ["bun", ["run", scriptPath]];
  }
  if (extension === ".sh") {
    return ["bash", [scriptPath]];
  }
  if (extension === ".ps1") {
    const exe = commandExists("pwsh") ? "pwsh" : "powershell";
    return [exe, ["-File", scriptPath]];
  }
  return [scriptPath, []];
}

function runHookScripts(hookName, scripts, context) {
  for (const entry of scripts) {
    const scriptPath = ensureInside(context.manifest.manifestDir, resolve(context.manifest.manifestDir, entry), `hooks.${hookName}`);
    const [command, args] = resolveExecutableForHook(scriptPath);

    if (context.args.dryRun) {
      context.actions.push({
        type: "hook",
        hook: hookName,
        script: scriptPath,
      });
      continue;
    }

    const result = spawnSync(command, args, {
      cwd: context.projectRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        FLOE_BOOTSTRAP_CONTEXT: JSON.stringify({
          appId: context.manifest.app.id,
          appName: context.manifest.app.name,
          appRoot: context.manifest.app.appRoot,
          mode: context.mode,
          target: context.target,
          projectRoot: context.projectRoot,
          installRoot: context.installRoot,
          appInstallRoot: context.appInstallRoot,
          manifestPath: context.manifest.path,
          platform: context.platform,
          dryRun: context.args.dryRun,
        }),
      },
    });

    if (result.status !== 0) {
      throw new Error(`Hook '${hookName}' failed: ${scriptPath}`);
    }
  }
}

function mappingApplies(mapping, context) {
  if (mapping.modes.length && !mapping.modes.includes(context.mode)) return false;
  if (mapping.platforms.length && !mapping.platforms.includes(context.platform)) return false;
  if (mapping.targets.length && !mapping.targets.includes(context.target)) return false;
  return true;
}

function copyDirectoryContents(sourceDir, destinationDir, force) {
  mkdirSync(destinationDir, { recursive: true });

  for (const child of readdirSync(sourceDir)) {
    const sourceChild = join(sourceDir, child);
    const destinationChild = join(destinationDir, child);
    copyMappingEntry(sourceChild, destinationChild, force);
  }
}

function copyMappingEntry(sourcePath, destinationPath, force) {
  const sourceStats = statSync(sourcePath);

  if (existsSync(destinationPath)) {
    if (!force) {
      throw new Error(`Destination already exists: ${destinationPath}`);
    }
    rmSync(destinationPath, { recursive: true, force: true });
  }

  mkdirSync(dirname(destinationPath), { recursive: true });
  cpSync(sourcePath, destinationPath, { recursive: sourceStats.isDirectory(), force: true });
}

function executeMappings(context) {
  const roots = {
    appInstallRoot: context.appInstallRoot,
    installRoot: context.installRoot,
    projectRoot: context.projectRoot,
    home: homedir(),
  };

  for (const mapping of context.manifest.mappings) {
    if (!mappingApplies(mapping, context)) continue;

    const sourcePath = ensureInside(context.manifest.productRoot, resolve(context.manifest.productRoot, mapping.from), "mapping source");
    if (!existsSync(sourcePath)) {
      throw new Error(`Mapping source not found: ${sourcePath}`);
    }

    const destinationBase = roots[mapping.destRoot];
    const destinationPath = ensureInside(destinationBase, resolve(destinationBase, mapping.to || "."), "mapping destination");

    context.actions.push({
      type: "copy",
      from: sourcePath,
      to: destinationPath,
      destRoot: mapping.destRoot,
    });

    if (context.args.dryRun) continue;

    const sourceStats = statSync(sourcePath);
    if (sourceStats.isDirectory() && (!mapping.to || mapping.to === ".")) {
      copyDirectoryContents(sourcePath, destinationPath, context.args.force);
      continue;
    }

    copyMappingEntry(sourcePath, destinationPath, context.args.force);
  }
}

function note(message, title) {
  if (!message) return;
  prompts.note(message, title);
}

function defaultCompletionMessage(context) {
  return `Installed ${context.manifest.app.name} to ${context.appInstallRoot}`;
}

export async function runBootstrap(manifest, args) {
  const baseContext = createContext(manifest, args);
  const mode = await selectMode(baseContext);
  const modeConfig = manifest.modes[mode];

  if (!modeConfig?.enabled) {
    throw new Error(`Mode '${mode}' is disabled in manifest`);
  }

  const target = await selectTarget(baseContext, modeConfig);
  const installRoot = resolveInstallRoot(mode, modeConfig.installRoot ?? manifest.defaults.installRoot, baseContext.projectRoot);
  const appInstallRoot = resolveAppInstallRoot(installRoot, manifest.app.appRoot);

  const context = {
    ...baseContext,
    mode,
    target,
    installRoot,
    appInstallRoot,
    actions: [],
  };

  if (context.interactive) {
    prompts.intro(manifest.prompts.intro ?? `Bootstrap ${manifest.app.name}`);
  }

  const summary = formatSummary(context);
  if (context.interactive) {
    note(summary, "Install plan");
  }

  if (!context.args.yes && context.interactive) {
    const approved = await prompts.confirm({
      message: manifest.prompts.confirm ?? "Proceed with installation?",
      initialValue: true,
    });

    if (prompts.isCancel(approved) || !approved) {
      throw new Error("Installation cancelled");
    }
  }

  await ensurePrerequisites(context);
  runHookScripts("preflight", manifest.hooks.preflight, context);
  executeMappings(context);
  runHookScripts("postinstall", manifest.hooks.postinstall, context);
  runHookScripts("validate", manifest.hooks.validate, context);

  if (context.interactive) {
    const completion = manifest.prompts.completion ?? manifest.outputs.successMessage ?? defaultCompletionMessage(context);
    prompts.outro(completion);
    if (manifest.outputs.nextSteps.length) {
      note(manifest.outputs.nextSteps.join("\n"), "Next steps");
    }
  }

  return {
    summary,
    actions: context.actions,
    installRoot: context.installRoot,
    appInstallRoot: context.appInstallRoot,
    projectRoot: context.projectRoot,
    mode: context.mode,
    target: context.target,
  };
}
