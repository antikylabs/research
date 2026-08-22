---
status: current
type: tutorial
audience: contract authors learning compiler provenance
applies-to: "@antiky/contracts@0.1.0"
---

# Trace source direction to compiler output

This tutorial compiles a small scene and follows its population amount from a semantic path to the derived technical
component.

Run every command from the `research/experiments/asset-generation-contract` directory.

## 1. Create the traced scene

Create `trace-grove.contract.ts` with this complete source:

```ts
import {
  between,
  frames,
  population,
  region,
  scene,
  thing,
} from '@antiky/contracts/dsl';

const tree = thing({ name: 'Winter tree' });
const clearing = region({ name: 'Clearing' });
const trees = population({
  name: 'Clearing trees',
  of: tree,
  amount: between(4, 7),
  placement: { around: clearing },
});

export default scene({
  key: 'trace-grove',
  name: 'Trace Grove',
  definitions: { tree },
  cast: { clearing, trees },
  composition: [frames(trees, clearing)],
});
```

## 2. Compile it

```sh
npm run build --workspace @antiky/contracts
npm exec -- antiky-contract compile \
  trace-grove.contract.ts \
  --out generated/trace-grove
```

## 3. Find the output ID for the source path

The semantic path for `amount` is `$.cast.trees.amount`. Ask the index which output records were derived from it:

```sh
node --input-type=module -e "
  import { readFile } from 'node:fs/promises';
  const index = JSON.parse(await readFile(
    'generated/trace-grove/contract-index.json',
    'utf8',
  ));
  console.log(index.bySemanticPath['$.cast.trees.amount']);
"
```

The result contains:

```text
population.trace-grove.trees#population.quantity
```

## 4. Inspect the derivation

Use that exact ID to read its provenance record:

```sh
node --input-type=module -e "
  import { readFile } from 'node:fs/promises';
  const index = JSON.parse(await readFile(
    'generated/trace-grove/contract-index.json',
    'utf8',
  ));
  const id = 'population.trace-grove.trees#population.quantity';
  console.log(index.derivationsByOutputId[id]);
"
```

The derivation names `$.cast.trees.amount`, the technical `outputPath`, and the versioned `population` lowerer.

## 5. Read the derived value

```sh
node --input-type=module -e "
  import { readFile } from 'node:fs/promises';
  const contract = JSON.parse(await readFile(
    'generated/trace-grove/resolved-contract.json',
    'utf8',
  ));
  console.log(
    contract.entities['population.trace-grove.trees']
      .components['population.quantity'],
  );
"
```

The component contains `count: [4, 7]` and `samplingScope: 'region'`. You have followed one authored range through the
semantic path index and its versioned derivation to the resolved technical value.

For a production-sized trace surface, compare the
[Blue Winter Grove index](../../../packages/examples/compiled/blue-winter-grove/contract-index.json) with its
[source modules](../../../packages/examples/src/blue-winter-grove/).
