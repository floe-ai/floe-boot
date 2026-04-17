import { loadManifest } from "./manifest.js";
import { runBootstrap } from "./bootstrap.js";

function takeValue(argv, index, flag) {
  if (index + 1 >= argv.length) {
    throw new Error(`${flag} requires a value`);
  }
  return argv[index + 1];
}

function appendTargets(args, rawValue) {
  const values = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  args.targets.push(...values);
}

export function parseArgs(argv) {
  const args = {
    yes: false,
    force: false,
    nonInteractive: false,
    dryRun: false,
    targets: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    switch (token) {
      case "--mode":
        args.mode = takeValue(argv, index, token);
        index += 1;
        break;
      case "--project-root":
        args.projectRoot = takeValue(argv, index, token);
        index += 1;
        break;
      case "--target":
        appendTargets(args, takeValue(argv, index, token));
        index += 1;
        break;
      case "--manifest":
        args.manifest = takeValue(argv, index, token);
        index += 1;
        break;
      case "--force":
        args.force = true;
        break;
      case "--yes":
        args.yes = true;
        break;
      case "--non-interactive":
        args.nonInteractive = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function helpText() {
  return [
    "Usage: floe-bootstrap [options]",
    "",
    "Options:",
    "  --mode <project|global>",
    "  --project-root <path>",
    "  --target <name[,name]>", 
    "  --manifest <path>",
    "  --force",
    "  --yes",
    "  --non-interactive",
    "  --dry-run",
    "  --help",
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(helpText());
    return;
  }

  const manifestPath = args.manifest ?? `${args.projectRoot ?? process.cwd()}/install/manifest.yml`;
  const manifest = loadManifest(manifestPath);
  const result = await runBootstrap(manifest, args);

  if (!process.stdout.isTTY || args.nonInteractive || args.yes) {
    const body = {
      mode: result.mode,
      target: result.target,
      targets: result.targets,
      projectRoot: result.projectRoot,
      installRoot: result.installRoot,
      appInstallRoot: result.appInstallRoot,
      actions: result.actions,
    };
    console.log(JSON.stringify(body, null, 2));
  }
}
