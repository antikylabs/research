# Asset Generation Contract

This experiment provides a declarative TypeScript language for game and scene direction. Authors
describe experience, visual and gameplay intent, reusable definitions, placed subjects,
relationships, variation, references, rules, and acceptance. `@antiky/contracts` compiles that
semantic graph into deterministic, validated engine-facing data.

## Start here

- Learn or look up the language in the [current usage documentation](docs/usage-docs/README.md).
- Compare TypeScript with canonical output in the [examples package](packages/examples/README.md).
- Review the proposed agent-evaluation questions and pipeline in the
  [agent-evaluation plan](packages/agent-tests/README.md).
- Inspect the implementation in [`packages/contracts`](packages/contracts/).

The preserved backend schemas, catalog, and detailed JSON fixtures live in
[`docs/asset-contract`](docs/asset-contract/). The completed Goal 1 design and implementation
handoff remains under [`docs/dsl-testing`](docs/dsl-testing/) as historical and design evidence; it
is not the current API reference.

## Current boundary

The shipped language supports scene contracts built from `scene`, `thing`, `region`, and
`population`, one `frames` relationship, reference images, ranges and meter values, and the
installed `voxelDiorama` profile. It does not yet generate game assets, runtime gameplay, artifact
requirements, or agent work items from the contract.

## Verify the workspace

From this directory:

```sh
npm run check
```
