# Build And Delivery

This document defines how a Floe product is built and delivered when `floe/` is the sole canonical product tree.

## Core Rule

There is no second canonical payload tree.

Build and packaging steps operate from `floe/` directly. Delivery may transform, copy, or select files from `floe/`, but it must not introduce a second editable source of truth.

## Build Objectives

- preserve a single canonical product tree
- keep install shape understandable from repository structure
- avoid duplicated authored files
- make delivery reproducible from a specific source revision

## Build Contract

- The build entrypoint must be explicit, such as a documented `npm`, `bun`, or shell command.
- Build steps may validate, stage, bundle, or package files from `floe/`.
- Build steps must not require manual editing of staged output.
- Generated artifacts may exist temporarily, but they are not canonical product source.

## Delivery Contract

A valid delivery artifact is derived from `floe/` and includes the files required for installed behavior.

Depending on the product, this may include:
- executable entrypoints
- runtime code
- product assets and templates
- installer-consumed canonical assets
- integration-specific files selected for a target environment

## What Delivery Must Not Do

- create a second editable product tree that can drift from `floe/`
- rely on tests, fixtures, docs, or workspace state as product inputs
- hide product-critical files outside the canonical tree

## Checked-In Product Files

Checked-in product files belong under `floe/` if they are part of delivered behavior, even when they are:
- used only by specific targets
- copied conditionally during install
- consumed by installer validation rather than copied verbatim

## Validation Expectations

Before a release is considered valid:
- installable behavior can be explained from `floe/` plus `install/`
- staged or packaged output matches the canonical source revision
- no delivered file depends on an unversioned local workspace artifact
