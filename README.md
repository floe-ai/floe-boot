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

These docs are intended to be consumed by multiple repos such as `floe-core`, `floe-mem`, and future Floe products.

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
