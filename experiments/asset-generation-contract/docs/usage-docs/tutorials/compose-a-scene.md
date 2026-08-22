---
status: current
type: tutorial
audience: contract authors who have completed the quick start
applies-to: "@antiky/contracts@0.1.0"
---

# Compose a scene from modules

This tutorial builds one scene from definition, layout, and entry modules. The result is still one declaration graph and
one compiled contract.

Run every command from the `research/experiments/asset-generation-contract` directory.

## 1. Create a scene directory

```sh
mkdir -p composed-scene
```

## 2. Define reusable things

Create `composed-scene/definitions.ts`:

```ts
import { thing } from '@antiky/contracts/dsl';

export const tree = thing({
  name: 'Winter tree',
  identity: ['visible trunk', 'snow-loaded crown'],
});

export const bentTree = thing({
  name: 'Bent winter tree',
  basedOn: tree,
  identity: ['low arching limb'],
});
```

## 3. Place the definitions

Create `composed-scene/layout.ts`:

```ts
import { between, population, region } from '@antiky/contracts/dsl';
import { bentTree } from './definitions';

export const path = region({
  name: 'Snow path',
  purpose: ['lead into the grove'],
});

export const landmarks = population({
  name: 'Bent trees beside the path',
  of: bentTree,
  amount: between(2, 3),
  placement: { around: path },
});
```

## 4. Own the graph from the entry

Create `composed-scene/composed-scene.contract.ts`:

```ts
import { frames, scene } from '@antiky/contracts/dsl';
import { bentTree, tree } from './definitions';
import { landmarks, path } from './layout';

export default scene({
  key: 'composed-scene',
  name: 'Composed Scene',
  experience: { fantasy: 'Follow a path beneath old winter trees.' },
  definitions: { tree, bentTree },
  cast: { path, landmarks },
  composition: [
    frames(landmarks, path, { opening: 'keep the center of the path clear' }),
  ],
});
```

The entry exports only the default scene. The other modules can have named exports because the compiler loads their
values through the entry's module graph.

## 5. Compile and validate

```sh
npm run build --workspace @antiky/contracts
npm exec -- antiky-contract compile \
  composed-scene/composed-scene.contract.ts \
  --out generated/composed-scene
npm exec -- antiky-contract validate \
  generated/composed-scene/resolved-contract.json
```

Compilation reports five files and validation reports zero errors. In `contract-index.json`, the `based-on`,
`population-of`, `frames-source`, and `frames-target` edges retain the connections made across the three source
modules.

Compare this small layout with the shipped
[Blue Winter Grove entry](../../../packages/examples/src/blue-winter-grove/blue-winter-grove.contract.ts), which
composes six focused modules without duplicating its declarations.
