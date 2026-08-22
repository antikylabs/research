# Work item: Generate the old-growth winter-tree voxel prototype

**Work item ID:** `work-item.prototype.blue-winter-grove.oldGrowthWinterTree.voxel-model`

**Requirement:** `artifact-requirement.prototype.blue-winter-grove.oldGrowthWinterTree.voxel-model`

**Status at creation:** `ready`

This is a proposed later artifact-workflow example. Its exact IDs are compiler outputs; ordinary DSL authors refer to the `oldGrowthWinterTree` definition value at `$.definitions.oldGrowthWinterTree`.

## Goal

Use the Antiky tree-geometry capability to produce one deterministic old-growth winter-tree voxel asset that satisfies the supplied semantic and resolved contract slices and emits a valid artifact receipt.

## Why this exists

No current receipt satisfies the current slice hash for:

- semantic source `$.definitions.oldGrowthWinterTree`
- resolved prototype `prototype.blue-winter-grove.oldGrowthWinterTree`

The requirement was derived using `antikylabs.profile.voxel-diorama@0.1.0`. This task does not authorize unrelated scene, engine, renderer, compiler, profile, or DSL changes.

## Read before editing

1. repository `AGENTS.md`
2. the generated requirement JSON
3. the normalized semantic slice and its derivation map
4. the resolved prototype slice
5. the existing generator interface and tests
6. the artifact receipt schema

## Allowed scope

Adapt these paths to repository conventions before editing:

```text
packages/generation/src/tree/**
packages/generation/test/tree/**
generated/blue-winter-grove/assets/prototype.blue-winter-grove.oldGrowthWinterTree/**
```

Do not modify the semantic source contract, profile, compiler, unrelated generators, or engine APIs unless a demonstrated defect blocks the task. Report the blocker instead of widening scope silently.

## Inputs

- semantic input hash: `sha256:EXAMPLE_SEMANTIC_INPUT_HASH`
- resolved prototype slice hash: `sha256:EXAMPLE_PROTOTYPE_SLICE_HASH`
- generator capability: `antikylabs.synthesis.tree-geometry`
- generator version target: `0.1.0`
- profile: `antikylabs.profile.voxel-diorama@0.1.0`
- deterministic seed stream: `asset/<derived-instance-id>/tree-geometry`
- height direction: 9–18 meters
- identity: rounded snow-heavy crowns, occasional conifer spires, and readable roots/branches
- preserved variation: mature scale, visible structure, and family resemblance
- forbidden outcomes: cone-only crowns, perfect symmetry, and smooth snow blobs

Do not infer new numeric thresholds from the prose. Implement only profile-defined mappings and the validation methods named by the requirement.

## Required outputs

```text
generated/blue-winter-grove/assets/prototype.blue-winter-grove.oldGrowthWinterTree/<artifact-id>/source.vox.json
generated/blue-winter-grove/assets/prototype.blue-winter-grove.oldGrowthWinterTree/<artifact-id>/metrics.json
generated/blue-winter-grove/assets/prototype.blue-winter-grove.oldGrowthWinterTree/<artifact-id>/artifact-receipt.json
```

Create an acceptance render when the repository already has the necessary renderer. Do not introduce a renderer solely for this task.

## Acceptance criteria

- [ ] Equal contract slice, profile, implementation version, and seed produce byte-identical voxel source and metrics.
- [ ] The generated tree is at least 90 voxels high, as derived from the authored minimum height and profile scale.
- [ ] Trunks, branch forks, root flares, and crown gaps remain readable.
- [ ] The family can produce rounded snow crowns and occasional conifer spires without collapsing into one cone-only form.
- [ ] Mature scale and recognizable family resemblance survive controlled variation.
- [ ] No numeric geometry rule is invented from free prose.
- [ ] All relevant unit, type, lint, and artifact-validation commands pass.
- [ ] `artifact-receipt.json` records exact files/hashes, semantic and technical refs, source hashes, profile, producer version, seed, and validation results.
- [ ] The final response lists changed files and reports each criterion as pass, fail, or not run.

## Non-goals

- full forest population placement
- terrain or scene composition
- runtime gameplay
- changing semantic direction or technical lowering
- generating every winter-tree variant

## Completion evidence

A textual claim is not completion. Completion requires the tangible files, exact hashes, current source/profile versions, validation results, and a verified receipt.
