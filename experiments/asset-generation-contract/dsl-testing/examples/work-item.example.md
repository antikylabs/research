# Work item: Generate the mature snow-pine voxel prototype

**Work item ID:** `work-item.prototype.tree.snow-pine.mature.voxel-model`  
**Requirement:** `artifact-requirement.prototype.tree.snow-pine.mature.voxel-model`  
**Status at creation:** `ready`

## Goal

Implement or use the Antiky tree-geometry generator to produce one deterministic mature snow-pine voxel asset that satisfies the supplied contract slice and emits a valid artifact receipt.

## Why this exists

No current receipt satisfies the required prototype slice hash for:

- `prototype.tree.snow-pine.mature`
- inherited base `prototype.tree.conifer.base`

The requested artifact is part of the Blue Winter Grove generation pipeline. This task does not authorize unrelated scene, engine, renderer, or DSL changes.

## Read before editing

1. repository `AGENTS.md`
2. the generated requirement JSON
3. the resolved contract slice for `prototype.tree.snow-pine.mature`
4. the existing generator interface and tests
5. the artifact receipt schema

## Allowed scope

Adapt these paths to repository conventions before editing:

```text
packages/generation/src/tree/**
packages/generation/test/tree/**
generated/blue-winter-grove/assets/prototype.tree.snow-pine.mature/**
```

Do not modify the source contract, compiler, unrelated generators, or engine APIs unless the task is blocked by a demonstrated defect. Report a blocker instead of widening scope silently.

## Inputs

- contract slice hash: `sha256:EXAMPLE_PROTOTYPE_SLICE_HASH`
- generator capability: `antikylabs.synthesis.tree-geometry`
- generator version target: `0.1.0`
- deterministic seed stream: `asset/<derived-instance-id>/tree-geometry`
- semantic material slots: `trunk`, `branches`, `foliage`, `snow`

## Required outputs

```text
generated/blue-winter-grove/assets/prototype.tree.snow-pine.mature/<artifact-id>/source.vox.json
generated/blue-winter-grove/assets/prototype.tree.snow-pine.mature/<artifact-id>/metrics.json
generated/blue-winter-grove/assets/prototype.tree.snow-pine.mature/<artifact-id>/artifact-receipt.json
```

Create an acceptance render when the repository already has the necessary renderer. Do not introduce a renderer solely for this work item.

## Acceptance criteria

- [ ] The same contract slice, implementation version, and seed produce byte-identical voxel source and metrics.
- [ ] The generated tree is at least 115 voxels high.
- [ ] Crown negative-space ratio is between 0.18 and 0.34 inclusive.
- [ ] The silhouette is not a single cone, cube blob, or perfectly radial stack.
- [ ] Trunk taper and at least eight readable branch tiers are present.
- [ ] Material slots remain semantic; no shader implementation is embedded in the contract or receipt.
- [ ] All repository unit, type, lint, and artifact-validation commands relevant to the changed paths pass.
- [ ] `artifact-receipt.json` records exact file hashes, contract refs, source hash, generator version, seed stream, and validation results.
- [ ] The final response lists changed files and reports each criterion as pass, fail, or not run.

## Non-goals

- full forest population placement
- terrain generation
- scene composition correction
- runtime gameplay logic
- changing the contract DSL
- generating every snowy-pine variant

## Completion evidence

A textual claim that generation succeeded is not completion. Completion requires the tangible files, their hashes, validation results, and a receipt tied to the current requirement hash.
