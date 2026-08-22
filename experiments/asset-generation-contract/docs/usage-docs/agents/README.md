---
status: current
type: reference
audience: coding agents authoring, compiling, reviewing, or consuming contracts
applies-to: "@antiky/contracts@0.1.0"
---

# Agent task map

Use this page to route work to the same current documentation humans use. Do not infer shipped behavior from proposals,
roadmaps, old Goal 1 instructions, or hand-written facsimiles of compiler output.

## Authority order

When facts conflict, use this order:

1. Public exports and executable behavior under [`packages/contracts/src`](../../../packages/contracts/src/), plus the
   package tests.
2. This current `docs/usage-docs` set for `@antiky/contracts@0.1.0`.
3. Current source/output pairs under [`packages/examples`](../../../packages/examples/).
4. The installed schema and component catalog under [`docs/asset-contract/schemas`](../../asset-contract/schemas/).
5. Historical implementation reports, research notes, redesigns, and proposals only as evidence of past intent.

Generated files are evidence, not authoring sources. Do not edit committed files under `packages/examples/compiled` by
hand; regenerate them from their semantic entries.

## Route by task

- **Author a first scene:** [Quick start](../quick-start.md), then the
  [DSL reference](../reference/dsl.md).
- **Split a scene across modules:** [Organize large contracts](../how-to/organize-large-contracts.md), then the
  [composition tutorial](../tutorials/compose-a-scene.md).
- **Add or reuse image evidence:** [Use reference images](../how-to/use-reference-images.md), then inspect
  [output provenance](../reference/outputs.md#contract-indexjson).
- **Compile or validate:** [Compile and validate](../how-to/compile-and-validate.md), then use the
  [compiler reference](../reference/compiler.md).
- **Repair a failure:** [Repair diagnostics](../how-to/repair-diagnostics.md), then look up
  [diagnostic codes](../reference/diagnostics.md).
- **Trace authored intent:** [Trace tutorial](../tutorials/trace-source-to-output.md), then use the
  [output indexes](../reference/outputs.md).
- **Add a backend-only field:** [Use technical overrides](../how-to/use-technical-overrides.md), then inspect the
  installed component catalog.
- **Consume technical output:** [Output reference](../reference/outputs.md), then check
  [package subpaths](../reference/package-subpaths.md).
- **Reason about stable IDs:** [Identity and references](../language/identity-and-references.md), then check the
  [DSL ownership fields](../reference/dsl.md).
- **Reason about architecture:** [Semantic model](../language/semantic-model.md), then check the
  [package boundary](../reference/package-subpaths.md).

## Current capability guardrails

Before generating or editing source, retain these exact limits:

- The semantic constructors are only `scene`, `thing`, `region`, and `population`.
- The only relationship constructor is `frames(population, region, options?)`. Multiple distinct endpoint pairs are
  supported; duplicate endpoint pairs collide.
- The only installed profile is `voxelDiorama`. Omitted or empty `profiles` selects it by default.
- `VisualDensity` is `low | medium | medium-high | high | very-high`; never write `dense`.
- There are no `game`, `world`, or `scenario` constructors.
- There is no artifact, asset, render, gameplay, world, or scenario generator. Compiler output is contract data and
  provenance only.
- There is no package root export and no `@antiky/contracts/trace` subpath.

## Authoring invariants

- A file entry ends in `.contract.ts` and exports only one default `scene(...)` value.
- `scene.definitions` owns things; `scene.cast` owns regions and populations.
- Pass the exact owned declaration objects through `basedOn`, `parts`, `features`, `of`, `placement.around`, `playAs`,
  acceptance `subject`, and `frames`. Do not substitute technical ID strings.
- Bind each declaration object under exactly one key. Keep every thing reachable from cast.
- Treat scene, definition, cast, and acceptance-check keys as stable ID inputs.
- Keep reference-image paths relative to the entry and inside `projectRoot`; attach a non-empty item-specific `use`.
- Keep declaration data plain, finite, JSON-normalizable, and side-effect-free at module initialization.
- Use a technical override only for a schema-valid catalog component that does not conflict with semantic lowering.

## Verification sequence

First run a TypeScript check whose configured inputs include the contract entry. For source owned by this workspace, run
from the experiment root:

```sh
npm run typecheck
```

That root command covers the three workspace packages; it does not automatically include an arbitrary loose contract
elsewhere. Use the consuming project's typecheck for such an entry. Then build, compile, and validate:

```sh
npm run build --workspace @antiky/contracts
npm exec -- antiky-contract compile \
  path/to/scene.contract.ts \
  --out generated/scene
npm exec -- antiky-contract validate \
  generated/scene/resolved-contract.json
```

The compiler bundles TypeScript but does not typecheck it; keep the typecheck as a separate gate. For committed example
changes, run the examples package build and test so generated bytes are compared with the sources:

```sh
npm run build --workspace @antiky/contracts-examples
npm run test --workspace @antiky/contracts-examples
```

On failure, report the diagnostic `code`, `semanticPath` or `technicalPath`, and relevant `related` evidence. Do not
claim success from the presence of stale generated files: a current successful compile has all five outputs and a valid
resolved contract.
