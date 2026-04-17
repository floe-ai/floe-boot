# Installer Behavior

This document defines expected behavior for Floe app installers.

## Installer Responsibilities

- Resolve canonical product files from `floe/` or from a package derived from `floe/`.
- Copy/install required runtime assets into target locations.
- Create missing target directories as needed.
- Report success/failure per install target.

## Shared Bootstrap Experience

Floe products should aim for a consistent bootstrap installer experience across repos even when the installed assets differ.

The shared layer should standardize:
- CLI flag shape
- interactive confirmation flow
- target selection UX
- overwrite semantics
- non-interactive behavior
- success and failure reporting
- prerequisite checks and error style

The shared layer should not force identical installation internals when products have different responsibilities.

Examples of acceptable divergence include:
- global home installation versus repo-local installation
- single-target versus multi-target installs
- runtime bootstrapping versus skill or asset copying

The contract is consistency of experience, not identical file operations.

## Shared Root Layout

Floe apps should install into a shared `.floe/` root using app-specific namespaces by default.

Examples:
- one app installs under `.floe/app-one`
- another app installs under `.floe/app-two`

The shared bootstrap should treat these namespaced paths as the default destination for product-owned files. Mappings may still target integration or runtime surfaces explicitly when needed.

## Shared Bootstrap Runtime

The shared bootstrap implementation lives in `floe-boot` and is configured by each app through `install/manifest.yml`.

The shared runtime owns:
- CLI parsing
- rich terminal UI flow
- mode selection
- prerequisite checks
- manifest validation
- mapping-based file installation
- lifecycle hook execution
- install summaries and errors

App repos own:
- canonical product files under `floe/`
- manifest configuration under `install/manifest.yml`
- optional lifecycle hook scripts under `install/`

Apps should consume this bootstrap runtime as a package dependency rather than copying bootstrap code into each repo.

## Recommended Common Flags

Where applicable, bootstrap installers should prefer a common vocabulary such as:
- `--mode <project|global>`
- `--project-root`
- `--target`
- `--manifest`
- `--force`
- `--yes`
- `--non-interactive`
- `--dry-run`

Products may add more flags, but the shared flags should keep the same meaning across repos.

When `--project-root` is omitted, installers should default to the current working directory.

## Target Behavior Contract

- Installers must use explicit, documented target paths.
- Installer behavior must be idempotent:
  - repeated install with same version should not corrupt layout
  - existing installs should either be preserved or replaced according to explicit flags
- Overwrite behavior must be opt-in (for example `--force`) and clearly surfaced to users.

## Safety And Predictability

- Do not silently skip required assets.
- Fail with actionable errors when prerequisites are missing.
- Do not modify unrelated project files as part of install.

## Post-Install Expectations

A successful install leaves the target in a runnable state:
- required files are present
- command entrypoints resolve
- shipped product assets are available at documented paths
