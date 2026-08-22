---
status: current
type: reference
audience: contract authors, compiler users, engine integrators, and coding agents
applies-to: "@antiky/contracts@0.1.0"
---

# `@antiky/contracts` usage documentation

Use this documentation to author semantic scene contracts, compile them into validated technical data, and consume the
result. Each page has one primary Diataxis purpose so that learning, task instructions, concepts, and API facts stay
separate.

## Start here

- New to the package: [compile your first scene](quick-start.md).
- Building a larger source graph: [compose a scene from modules](tutorials/compose-a-scene.md).
- Investigating provenance: [trace source direction to compiler output](tutorials/trace-source-to-output.md).
- Working on a specific task: use the [how-to guides](#how-to-guides).
- Looking up an exact field, result, code, or export: use the [reference](#reference).
- Trying to understand the design: read the [language explanations](#language-explanations).
- Acting as a coding agent: begin at the [agent task map](agents/README.md).

## Current boundary

Version 0.1.0 provides four semantic constructors: `scene`, `thing`, `region`, and `population`. A scene can use one
relationship kind, `frames`, and one installed project profile, `voxelDiorama`. The profile is selected by default when
`profiles` is omitted.

The `VisualDensity` values are `low`, `medium`, `medium-high`, `high`, and `very-high`; `dense` is not valid. There are
no `game`, `world`, or `scenario` constructors, and the compiler does not generate artifacts, assets, renders, or
gameplay code.

## Tutorials

- [Quick start](quick-start.md) — compile and validate a small scene.
- [Compose a scene](tutorials/compose-a-scene.md) — split a working contract across focused TypeScript modules.
- [Trace source to output](tutorials/trace-source-to-output.md) — follow one semantic field through the
  provenance index.

## How-to guides

- [Compile and validate](how-to/compile-and-validate.md)
- [Use reference images](how-to/use-reference-images.md)
- [Organize large contracts](how-to/organize-large-contracts.md)
- [Repair compiler diagnostics](how-to/repair-diagnostics.md)
- [Use technical overrides](how-to/use-technical-overrides.md)

## Language explanations

- [The semantic model](language/semantic-model.md)
- [Identity and direct references](language/identity-and-references.md)

## Reference

- [DSL field reference](reference/dsl.md)
- [Compiler and validator reference](reference/compiler.md)
- [Compiler output reference](reference/outputs.md)
- [Diagnostic reference](reference/diagnostics.md)
- [Package subpath reference](reference/package-subpaths.md)

## Shipped examples

The examples package pairs current TypeScript sources with byte-checked compiler output. Use
[Quiet Canal Market](../../packages/examples/src/quiet-canal-market/quiet-canal-market.contract.ts) for a compact scene
and [Blue Winter Grove](../../packages/examples/src/blue-winter-grove/blue-winter-grove.contract.ts) for a composed
scene with definitions, cast, relationships, and reference images. Their generated files are under
[`packages/examples/compiled`](../../packages/examples/compiled/).
