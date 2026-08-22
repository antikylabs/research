---
status: current
type: tutorial
audience: first-time contract authors
applies-to: "@antiky/contracts@0.1.0"
---

# Compile your first scene

This tutorial creates one semantic scene, compiles it into five deterministic files, and validates the resolved JSON.
You need Node.js 22 or later and an installed copy of this experiment's workspace dependencies.

Run every command from the `research/experiments/asset-generation-contract` directory.

## 1. Build the compiler

```sh
npm run build --workspace @antiky/contracts
```

## 2. Create the contract

Create `first-grove.contract.ts` with this complete source:

```ts
import {
  between,
  population,
  region,
  scene,
  thing,
} from '@antiky/contracts/dsl';

const pine = thing({
  name: 'Snow pine',
  identity: ['old trunk', 'layered branches'],
});

const clearing = region({
  name: 'Open clearing',
  purpose: ['give the player room to move'],
});

const grove = population({
  name: 'Pines around the clearing',
  of: pine,
  amount: between(8, 12),
  placement: { around: clearing, pattern: 'loose clusters' },
});

export default scene({
  key: 'first-grove',
  name: 'First Grove',
  experience: { fantasy: 'Walk into a quiet grove.' },
  definitions: { pine },
  cast: { clearing, grove },
});
```

The omitted `profiles` field selects the installed `voxelDiorama` profile by default.

## 3. Compile the scene

```sh
npm exec -- antiky-contract compile \
  first-grove.contract.ts \
  --out generated/first-grove
```

The command reports five files and zero errors. The output directory contains:

```text
build-manifest.json
contract-index.json
contract.refs.ts
diagnostics.json
resolved-contract.json
```

Open `generated/first-grove/resolved-contract.json`. The semantic declarations now have stable IDs such as
`scene.first-grove`, `prototype.first-grove.pine`, and `population.first-grove.grove`.

## 4. Validate the resolved contract

```sh
npm exec -- antiky-contract validate \
  generated/first-grove/resolved-contract.json
```

The validator reports zero errors and the number of technical systems supplied by the selected profile. You now have a
semantic TypeScript source and a separately validated engine-facing contract.

Next, [compose a scene from modules](tutorials/compose-a-scene.md) or consult the
[complete DSL reference](reference/dsl.md).
