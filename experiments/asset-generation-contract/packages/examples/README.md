# `@antiky/contracts-examples`

This package pairs readable declarative TypeScript scene contracts with the exact canonical files
emitted by `@antiky/contracts`. Use it to compare authoring intent in `src/` with engine-facing data
in `compiled/`.

## Examples

| Scene | TypeScript source | Compiled output | Reference evidence |
| --- | --- | --- | --- |
| Blue Winter Grove | [`src/blue-winter-grove/`](src/blue-winter-grove/) | [`compiled/blue-winter-grove/`](compiled/blue-winter-grove/) | Four active images in [`references/`](src/blue-winter-grove/references/) |
| Quiet Canal Market | [`src/quiet-canal-market/quiet-canal-market.contract.ts`](src/quiet-canal-market/quiet-canal-market.contract.ts) | [`compiled/quiet-canal-market/`](compiled/quiet-canal-market/) | None supplied by the [preserved source fixture](../../docs/asset-contract/quiet_canal_market.scene.json) |

Each compiled directory contains:

```text
resolved-contract.json
diagnostics.json
contract-index.json
contract.refs.ts
build-manifest.json
```

The files are committed so the DSL and its lowering can be reviewed side by side. Do not edit them
by hand.

## Regenerate the outputs

Run from the experiment root:

```sh
npm run build --workspace @antiky/contracts-examples
```

Regenerate one scene with either `compile:blue-winter-grove` or
`compile:quiet-canal-market`. `npm run test --workspace @antiky/contracts-examples` compiles both
sources into temporary directories and compares every emitted byte with the committed outputs.

See the [current usage documentation](../../docs/usage-docs/README.md) for tutorials and the DSL and
compiler API.
