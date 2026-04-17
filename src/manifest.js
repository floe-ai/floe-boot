import { readFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import YAML from "yaml";

const ALLOWED_DEST_ROOTS = new Set(["appInstallRoot", "installRoot", "projectRoot", "home"]);
const ALLOWED_MODES = new Set(["project", "global"]);
const ALLOWED_HOOKS = ["preflight", "postinstall", "validate"];

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  if (isAbsolute(value)) return false;
  const normalized = value.replace(/\\/g, "/");
  if (normalized === "." || normalized === "./") return false;
  return !normalized.split("/").some((part) => part === "" || part === "." || part === "..");
}

function normalizeTargets(value, label) {
  return asArray(value).map((entry, index) => {
    if (typeof entry === "string") {
      return { id: entry, label: entry };
    }

    assertObject(entry, `${label}[${index}]`);
    if (!entry.id || typeof entry.id !== "string") {
      throw new Error(`${label}[${index}].id must be a string`);
    }

    return {
      id: entry.id,
      label: typeof entry.label === "string" ? entry.label : entry.id,
      description: typeof entry.description === "string" ? entry.description : "",
    };
  });
}

function normalizeHooks(value) {
  const normalized = {
    preflight: [],
    postinstall: [],
    validate: [],
  };

  if (value == null) return normalized;
  assertObject(value, "hooks");

  for (const key of Object.keys(value)) {
    if (!ALLOWED_HOOKS.includes(key)) {
      throw new Error(`hooks.${key} is not a supported hook`);
    }

    normalized[key] = asArray(value[key]).map((entry, index) => {
      if (typeof entry !== "string" || !entry.trim()) {
        throw new Error(`hooks.${key}[${index}] must be a non-empty string`);
      }
      return entry;
    });
  }

  return normalized;
}

function normalizePrompts(value) {
  if (value == null) return {};
  assertObject(value, "prompts");

  const normalized = {};
  for (const key of ["intro", "confirm", "completion"]) {
    if (value[key] != null && typeof value[key] !== "string") {
      throw new Error(`prompts.${key} must be a string`);
    }
    if (typeof value[key] === "string") {
      normalized[key] = value[key];
    }
  }
  return normalized;
}

function normalizeOutputs(value) {
  if (value == null) return { nextSteps: [] };
  assertObject(value, "outputs");

  if (value.successMessage != null && typeof value.successMessage !== "string") {
    throw new Error("outputs.successMessage must be a string");
  }

  const nextSteps = asArray(value.nextSteps);
  for (const [index, step] of nextSteps.entries()) {
    if (typeof step !== "string") {
      throw new Error(`outputs.nextSteps[${index}] must be a string`);
    }
  }

  return {
    successMessage: value.successMessage,
    nextSteps,
  };
}

function normalizePrerequisites(value) {
  if (value == null) return [];

  const entries = Array.isArray(value)
    ? value
    : Object.entries(value).map(([id, entry]) => ({ id, ...entry }));

  return entries.map((entry, index) => {
    assertObject(entry, `prerequisites[${index}]`);

    const id = entry.id || entry.name;
    if (typeof id !== "string" || !id.trim()) {
      throw new Error(`prerequisites[${index}].id must be a non-empty string`);
    }

    if (typeof entry.command !== "string" || !entry.command.trim()) {
      throw new Error(`prerequisites[${index}].command must be a non-empty string`);
    }

    if (entry.minVersion != null && typeof entry.minVersion !== "string") {
      throw new Error(`prerequisites[${index}].minVersion must be a string`);
    }

    if (entry.versionCommand != null && typeof entry.versionCommand !== "string") {
      throw new Error(`prerequisites[${index}].versionCommand must be a string`);
    }

    if (entry.versionRegex != null && typeof entry.versionRegex !== "string") {
      throw new Error(`prerequisites[${index}].versionRegex must be a string`);
    }

    const installCommands = entry.installCommands ?? {};
    if (installCommands && typeof installCommands !== "object") {
      throw new Error(`prerequisites[${index}].installCommands must be an object`);
    }

    const instructions = entry.instructions ?? {};
    if (instructions && typeof instructions !== "object") {
      throw new Error(`prerequisites[${index}].instructions must be an object`);
    }

    return {
      id,
      displayName: typeof entry.displayName === "string" ? entry.displayName : id,
      command: entry.command,
      required: entry.required !== false,
      minVersion: entry.minVersion,
      versionCommand: entry.versionCommand ?? `${entry.command} --version`,
      versionRegex: entry.versionRegex,
      autoInstall: Boolean(entry.autoInstall),
      installCommands,
      instructions,
    };
  });
}

function normalizeModes(value, defaultsInstallRoot) {
  const normalized = {
    project: { enabled: true, installRoot: defaultsInstallRoot, targets: [] },
    global: { enabled: true, installRoot: defaultsInstallRoot, targets: [] },
  };

  if (value == null) return normalized;
  assertObject(value, "modes");

  for (const [modeName, entry] of Object.entries(value)) {
    if (!ALLOWED_MODES.has(modeName)) {
      throw new Error(`modes.${modeName} is not supported`);
    }
    assertObject(entry, `modes.${modeName}`);

    if (entry.installRoot != null && typeof entry.installRoot !== "string") {
      throw new Error(`modes.${modeName}.installRoot must be a string`);
    }

    normalized[modeName] = {
      enabled: entry.enabled !== false,
      installRoot: typeof entry.installRoot === "string" ? entry.installRoot : defaultsInstallRoot,
      targets: normalizeTargets(entry.targets, `modes.${modeName}.targets`),
    };
  }

  return normalized;
}

function normalizeMappings(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("mappings must be a non-empty array");
  }

  return value.map((entry, index) => {
    assertObject(entry, `mappings[${index}]`);

    if (typeof entry.from !== "string" || !entry.from.trim()) {
      throw new Error(`mappings[${index}].from must be a non-empty string`);
    }
    if (typeof entry.to !== "string") {
      throw new Error(`mappings[${index}].to must be a string`);
    }
    if (isAbsolute(entry.from)) {
      throw new Error(`mappings[${index}].from must be relative to floe/`);
    }
    if (entry.to && isAbsolute(entry.to)) {
      throw new Error(`mappings[${index}].to must be relative`);
    }

    const modes = asArray(entry.modes ?? entry.mode ?? []);
    for (const mode of modes) {
      if (!ALLOWED_MODES.has(mode)) {
        throw new Error(`mappings[${index}] has unsupported mode '${mode}'`);
      }
    }

    const destRoot = entry.destRoot ?? "appInstallRoot";
    if (!ALLOWED_DEST_ROOTS.has(destRoot)) {
      throw new Error(`mappings[${index}].destRoot must be one of ${Array.from(ALLOWED_DEST_ROOTS).join(", ")}`);
    }

    const platforms = asArray(entry.platforms ?? []);
    for (const platform of platforms) {
      if (typeof platform !== "string") {
        throw new Error(`mappings[${index}].platforms must contain strings`);
      }
    }

    const targets = asArray(entry.targets ?? entry.target ?? []);
    for (const target of targets) {
      if (typeof target !== "string") {
        throw new Error(`mappings[${index}].targets must contain strings`);
      }
    }

    return {
      from: entry.from,
      to: entry.to,
      destRoot,
      modes,
      platforms,
      targets,
    };
  });
}

export function loadManifest(manifestPath) {
  const resolvedPath = resolve(manifestPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Manifest not found: ${resolvedPath}`);
  }

  const raw = readFileSync(resolvedPath, "utf8");
  const parsed = YAML.parse(raw);
  assertObject(parsed, "manifest");

  assertObject(parsed.app, "app");
  if (typeof parsed.app.id !== "string" || !parsed.app.id.trim()) {
    throw new Error("app.id must be a non-empty string");
  }
  if (typeof parsed.app.name !== "string" || !parsed.app.name.trim()) {
    throw new Error("app.name must be a non-empty string");
  }
  if (!isSafeRelativePath(parsed.app.appRoot)) {
    throw new Error("app.appRoot must be a safe relative path");
  }

  const defaults = parsed.defaults ?? {};
  if (defaults && typeof defaults !== "object") {
    throw new Error("defaults must be an object");
  }
  if (defaults.installRoot != null && typeof defaults.installRoot !== "string") {
    throw new Error("defaults.installRoot must be a string");
  }
  if (defaults.mode != null && !ALLOWED_MODES.has(defaults.mode)) {
    throw new Error("defaults.mode must be 'project' or 'global'");
  }

  const manifestDir = dirname(resolvedPath);
  const repoRoot = resolve(manifestDir, "..");
  const productRoot = resolve(repoRoot, "floe");

  return {
    path: resolvedPath,
    manifestDir,
    repoRoot,
    productRoot,
    app: {
      id: parsed.app.id,
      name: parsed.app.name,
      appRoot: parsed.app.appRoot,
      versionSource: typeof parsed.app.versionSource === "string" ? parsed.app.versionSource : undefined,
    },
    defaults: {
      installRoot: defaults.installRoot ?? ".floe",
      mode: defaults.mode ?? "project",
    },
    prerequisites: normalizePrerequisites(parsed.prerequisites),
    modes: normalizeModes(parsed.modes, defaults.installRoot ?? ".floe"),
    mappings: normalizeMappings(parsed.mappings),
    prompts: normalizePrompts(parsed.prompts),
    hooks: normalizeHooks(parsed.hooks),
    outputs: normalizeOutputs(parsed.outputs),
  };
}
