# Manifest Contract

Each Floe app configures the shared bootstrap installer through `install/manifest.yml`.

## Core Rules

- The manifest lives at `install/manifest.yml`.
- Canonical product files still live under `floe/`.
- The manifest describes install behavior; it does not replace the product tree.
- App-specific variation should be expressed in manifest data first and only fall back to custom installer hooks when needed.

## Required Sections

```yaml
app:
  id: app-id
  name: App Name
  appRoot: app-namespace

mappings:
  - from: some/path
    to: some/path
```

## Supported Top-Level Sections

- `app`
- `defaults`
- `prerequisites`
- `modes`
- `mappings`
- `prompts`
- `hooks`
- `outputs`

## Section Overview

`app`
- `id`: stable app identifier
- `name`: human-facing product name
- `appRoot`: required namespace under the shared `.floe/` root
- `versionSource`: optional pointer to where version should be read from

`defaults`
- `installRoot`: defaults to `.floe`
- `mode`: defaults to `project`

`prerequisites`
- tool/runtime requirements
- command names
- minimum versions
- optional auto-install commands
- optional platform-specific instructions

`modes`
- fixed mode names are `project` and `global`
- each mode may be enabled or disabled
- each mode may override `installRoot`
- each mode may declare named `targets`

`mappings`
- source paths under `floe/`
- destination paths relative to a resolved root
- optional filtering by mode, target, or platform
- optional destination root selection

`prompts`
- app-specific intro, confirmation, and completion copy

`hooks`
- optional lifecycle scripts under `install/`
- supported hook names: `preflight`, `postinstall`, `validate`

`outputs`
- success message
- next-step commands or notes

## Destination Roots

Mappings may target one of these resolved roots:
- `appInstallRoot`
- `installRoot`
- `projectRoot`
- `home`

If omitted, `destRoot` defaults to `appInstallRoot`.

## Target Selection

Targets are optional mapping-group selectors. They do not determine filesystem locations.

- `projectRoot`, `installRoot`, and `appInstallRoot` resolve where files go
- `targets` determine which mappings are active for a run

The bootstrap supports:
- repeated `--target` flags
- comma-separated target values
- interactive multi-select when the terminal supports it

If a mode declares targets and the user does not specify any, all declared targets for that mode are selected by default.

## Shared Root vs App Root

The bootstrap resolves two separate install roots:
- `installRoot`: the shared Floe root, default `.floe`
- `appInstallRoot`: the app namespace under that root, computed as `<installRoot>/<app.appRoot>`

Examples:
- `appRoot: app-one` -> `.floe/app-one`
- `appRoot: app-two` -> `.floe/app-two`

## Fixed Mode Semantics

`project`
- installs into the current project context
- when `--project-root` is omitted, the current working directory is used
- relative `installRoot` values resolve under the project root
- `appInstallRoot` resolves under the shared project install root

`global`
- installs into a user-level location
- relative `installRoot` values resolve under the user's home directory
- `appInstallRoot` resolves under the shared global install root

## Minimal Example

```yaml
app:
  id: floe-example
  name: Floe Example
  appRoot: core

defaults:
  installRoot: .floe
  mode: project

mappings:
  - from: .
    to: .
```
