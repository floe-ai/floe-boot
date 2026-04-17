# floe-boot

Shared documentation for how Floe products should be structured, installed, and maintained.

This repo also contains the shared bootstrap installer runtime used by Floe apps.

## Core Model

- `floe/` is the product.
- `install/` contains installer and packaging logic only.
- `docs/` contains documentation only.
- `tests/` contains tests, fixtures, and mocks only.
- Root dotfolders such as `.github/`, `.agents/`, `.claude/`, `.codex/`, `.ai/`, and `.floe/` are integration or runtime surfaces, not canonical product source.

## Purpose

This repository defines reusable conventions for:
- the canonical product tree
- installer behavior
- build and packaging boundaries
- integration/runtime surfaces at repo root

These docs are intended to be consumed by Floe-family product repos that need a shared bootstrap installer and manifest contract.

## Documents

- `docs/app-structure.md`
- `docs/build-and-delivery.md`
- `docs/installer-behavior.md`
- `docs/manifest-contract.md`

## Current Direction

- Repos should share a common bootstrap installer experience where possible.
- The shared part is the user-facing contract and CLI behavior, not necessarily identical installation internals.
- The shared bootstrap implementation lives in this repo and is configured per app through `install/manifest.yml`.

## Bootstrap Runtime

- CLI entrypoint: `floe-bootstrap`
- Manifest path: `install/manifest.yml`
- Fixed modes: `project`, `global`
- Default project root: current working directory
- Default shared install root: `.floe`
- Default app install root: `.floe/<appRoot>`

The bootstrap reads canonical product files from each app's `floe/` tree and performs install actions according to manifest-defined mappings, prerequisites, prompts, hooks, and outputs.

Each consuming app should declare its namespace through `app.appRoot` in `install/manifest.yml` and depend on `floe-boot` as a package instead of copying the bootstrap runtime.

## Consuming From Another Repo

For any consuming Floe-family product repo, the integration model is:

1. Add `floe-boot` as a dependency.
2. Keep canonical product files under `floe/`.
3. Add `install/manifest.yml`.
4. Optionally add install hook scripts under `install/`.
5. Expose an app-specific install command that invokes `floe-bootstrap`.

The consuming repo should not copy bootstrap code out of this repo.

### Typical Consumer Shape

```text
your-app/
├── floe/                    # canonical shipped product files
├── install/
│   ├── manifest.yml
│   └── <optional hook scripts>
├── package.json
└── ...
```

### Dependency

Use `floe-boot` as a normal package dependency. Until it is published to a package registry, consume it from Git.

Example:

```json
{
  "dependencies": {
    "floe-boot": "git+https://github.com/floe-ai/floe-boot.git"
  }
}
```

### Installer Entry Point

The consuming repo should expose its own install command or bin entry, but delegate the actual bootstrap flow to `floe-bootstrap`.

Example `package.json` script:

```json
{
  "scripts": {
    "install:bootstrap": "floe-bootstrap --manifest ./install/manifest.yml"
  }
}
```

Example direct dev usage:

```bash
npx floe-bootstrap --manifest ./install/manifest.yml
```

### Minimal Manifest

```yaml
app:
  id: your-app
  name: Your App
  appRoot: your-namespace

defaults:
  installRoot: .floe
  mode: project

mappings:
  - from: .
    to: .
```

### What The Consumer Repo Owns

- canonical product files under `floe/`
- manifest configuration under `install/manifest.yml`
- optional install hook scripts under `install/`
- app-specific wrapper command, package script, or bin entry

### What `floe-boot` Owns

- manifest parsing and validation
- install root resolution
- app namespace resolution under `.floe/<appRoot>`
- prerequisite checks
- rich terminal flow
- mapping-based install execution
- lifecycle hook invocation
- dry-run and non-interactive handling

### Integration Surfaces

A consuming app may still target integration or runtime surfaces outside its namespaced `.floe/<appRoot>` path when required.

Typical examples include:
- agent integration folders such as `.agents/`, `.github/`, or `.claude/`
- runtime data folders required by the installed product
- explicitly shared top-level `.floe/` paths when the product truly owns them
