import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "../src/cli.js";
import { loadManifest } from "../src/manifest.js";
import { runBootstrap } from "../src/bootstrap.js";

function makeAppTree() {
  const root = mkdtempSync(join(tmpdir(), "floe-boot-"));
  mkdirSync(join(root, "floe"), { recursive: true });
  mkdirSync(join(root, "install"), { recursive: true });
  writeFileSync(join(root, "floe", "tool.txt"), "hello\n", "utf8");
  return root;
}

function writeManifest(root, body) {
  writeFileSync(join(root, "install", "manifest.yml"), body, "utf8");
  return join(root, "install", "manifest.yml");
}

test("loadManifest normalizes defaults and mappings", () => {
  const root = makeAppTree();
  const manifestPath = writeManifest(
    root,
    `
app:
  id: test-app
  name: Test App
  appRoot: memory
mappings:
  - from: tool.txt
    to: tool.txt
`
  );

  const manifest = loadManifest(manifestPath);
  assert.equal(manifest.defaults.installRoot, ".floe");
  assert.equal(manifest.defaults.mode, "project");
  assert.equal(manifest.mappings.length, 1);
  assert.equal(manifest.productRoot, resolve(root, "floe"));
  assert.equal(manifest.app.appRoot, "memory");
});

test("runBootstrap dry-run defaults projectRoot to current directory", async () => {
  const root = makeAppTree();
  const manifestPath = writeManifest(
    root,
    `
app:
  id: test-app
  name: Test App
  appRoot: memory
defaults:
  mode: project
mappings:
  - from: tool.txt
    to: copied/tool.txt
`
  );

  const manifest = loadManifest(manifestPath);
  const originalCwd = process.cwd();
  process.chdir(root);

  try {
    const result = await runBootstrap(manifest, {
      yes: true,
      dryRun: true,
      force: false,
      nonInteractive: false,
    });

    assert.equal(result.projectRoot, resolve(root));
    assert.equal(result.installRoot, resolve(root, ".floe"));
    assert.equal(result.appInstallRoot, resolve(root, ".floe", "memory"));
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].to, resolve(root, ".floe", "memory", "copied", "tool.txt"));
  } finally {
    process.chdir(originalCwd);
  }
});

test("runBootstrap installs files and lifecycle hooks", async () => {
  const root = makeAppTree();
  writeFileSync(join(root, "install", "mark.js"), "import { writeFileSync } from 'node:fs'; writeFileSync(new URL('./hook-ran.txt', import.meta.url), process.env.FLOE_BOOTSTRAP_CONTEXT);", "utf8");
  const manifestPath = writeManifest(
    root,
    `
app:
  id: test-app
  name: Test App
  appRoot: memory
hooks:
  postinstall: ./mark.js
mappings:
  - from: tool.txt
    to: copied/tool.txt
`
  );

  const manifest = loadManifest(manifestPath);
  const result = await runBootstrap(manifest, {
    yes: true,
    force: false,
    dryRun: false,
    nonInteractive: true,
    projectRoot: root,
  });

  assert.equal(readFileSync(join(result.appInstallRoot, "copied", "tool.txt"), "utf8"), "hello\n");
  assert.equal(existsSync(join(root, "install", "hook-ran.txt")), true);
});

test("loadManifest requires app.appRoot", () => {
  const root = makeAppTree();
  const manifestPath = writeManifest(
    root,
    `
app:
  id: test-app
  name: Test App
mappings:
  - from: tool.txt
    to: tool.txt
`
  );

  assert.throws(() => loadManifest(manifestPath), /app\.appRoot must be a safe relative path/);
});

test("parseArgs accepts repeated and csv targets", () => {
  const parsed = parseArgs(["--target", "codex,copilot", "--target", "claude"]);
  assert.deepEqual(parsed.targets, ["codex", "copilot", "claude"]);
});

test("runBootstrap applies multiple selected targets in one run", async () => {
  const root = makeAppTree();
  writeFileSync(join(root, "floe", "codex.txt"), "codex\n", "utf8");
  writeFileSync(join(root, "floe", "copilot.txt"), "copilot\n", "utf8");
  writeFileSync(join(root, "floe", "claude.txt"), "claude\n", "utf8");

  const manifestPath = writeManifest(
    root,
    `
app:
  id: test-app
  name: Test App
  appRoot: memory
modes:
  project:
    targets:
      - codex
      - copilot
      - claude
mappings:
  - from: codex.txt
    to: .agents/codex.txt
    destRoot: projectRoot
    targets: [codex]
  - from: copilot.txt
    to: .github/copilot.txt
    destRoot: projectRoot
    targets: [copilot]
  - from: claude.txt
    to: .claude/claude.txt
    destRoot: projectRoot
    targets: [claude]
`
  );

  const manifest = loadManifest(manifestPath);
  const result = await runBootstrap(manifest, {
    yes: true,
    force: false,
    dryRun: false,
    nonInteractive: true,
    projectRoot: root,
    targets: ["codex", "copilot"],
  });

  assert.deepEqual(result.targets, ["codex", "copilot"]);
  assert.equal(existsSync(join(root, ".agents", "codex.txt")), true);
  assert.equal(existsSync(join(root, ".github", "copilot.txt")), true);
  assert.equal(existsSync(join(root, ".claude", "claude.txt")), false);
});

test("runBootstrap defaults to all declared targets when none are specified", async () => {
  const root = makeAppTree();
  writeFileSync(join(root, "floe", "codex.txt"), "codex\n", "utf8");
  writeFileSync(join(root, "floe", "copilot.txt"), "copilot\n", "utf8");

  const manifestPath = writeManifest(
    root,
    `
app:
  id: test-app
  name: Test App
  appRoot: memory
modes:
  project:
    targets:
      - codex
      - copilot
mappings:
  - from: codex.txt
    to: .agents/codex.txt
    destRoot: projectRoot
    targets: [codex]
  - from: copilot.txt
    to: .github/copilot.txt
    destRoot: projectRoot
    targets: [copilot]
`
  );

  const manifest = loadManifest(manifestPath);
  const result = await runBootstrap(manifest, {
    yes: true,
    force: false,
    dryRun: true,
    nonInteractive: true,
    projectRoot: root,
    targets: [],
  });

  assert.deepEqual(result.targets, ["codex", "copilot"]);
  assert.equal(result.actions.length, 2);
});
