---
status: current
type: how-to
audience: advanced contract authors working at the catalog boundary
applies-to: "@antiky/contracts@0.1.0"
---

# Use a technical override

Add a technical override only when the shipped semantic fields cannot express a required registered component. The
override remains subject to catalog and resolved-contract validation.

## 1. Inspect the installed catalog entry

Use the catalog subpath to confirm the component's entity kinds, schema, and inheritance policy:

```ts
import { loadComponentCatalog } from '@antiky/contracts/catalog';

const catalog = loadComponentCatalog();
console.dir(catalog.componentTypes['style.detailProfile'], { depth: null });
```

The source catalog is also available at
[`component-catalog.json`](../../asset-contract/schemas/component-catalog.json).

## 2. Add a schema-valid payload

`technical` is available on `thing`, `region`, and `population`. This example adds a component allowed on a lowered
prototype:

```ts
import { thing } from '@antiky/contracts/dsl';

const pine = thing({
  name: 'Mature pine',
  technical: {
    components: {
      'style.detailProfile': {
        macro: ['asymmetrical crown envelope'],
        meso: ['visible branch tiers'],
        micro: ['localized frost'],
      },
    },
  },
});
```

Use JSON data only. Functions, `undefined`, symbols, bigints, plain-object accessors, class instances, cycles, and
non-finite numbers are rejected. Use ordinary indexed arrays without accessors or extra properties; constructors clone
their indexed values rather than preserving descriptors.

## 3. Compile and inspect provenance

Compile normally. The override is blocking when:

- the component is absent from the catalog;
- the lowered owner kind is not in `allowedEntityKinds`;
- the payload fails the component schema;
- a semantic field already derived a component with the same type; or
- prototype inheritance cannot apply the catalog's merge policy.

On success, `contract-index.json` records the override's semantic path and the `technical-override` lowerer. The
resolved component appears on the owning prototype or entity.

A technical override cannot add systems, relationships, or profiles, bypass validation, or turn the compiler into an
artifact generator. Prefer the [semantic DSL fields](../reference/dsl.md) whenever one expresses the requirement.
