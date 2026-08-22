---
status: current
type: how-to
audience: contract authors maintaining multi-file scenes
applies-to: "@antiky/contracts@0.1.0"
---

# Organize a large contract

Split declarations by responsibility, then assemble their exact object values into keyed `definitions` and `cast`
records in one `.contract.ts` entry.

## Use a focused module layout

```text
scene-name/
  scene-name.contract.ts
  scene-name.definitions.ts
  scene-name.layout.ts
  scene-name.references.ts
  references/
    composition.png
```

Keep the entry as the ownership boundary:

```ts
import { scene } from '@antiky/contracts/dsl';
import { definitions } from './scene-name.definitions';
import { cast } from './scene-name.layout';
import { references } from './scene-name.references';

export default scene({
  key: 'scene-name',
  name: 'Scene Name',
  references,
  definitions,
  cast,
});
```

The entry module must export only the default scene. Imported modules can use named exports.

## Preserve declaration identity across modules

Create each `thing`, `region`, and `population` once and import that same frozen object wherever a direct reference is
needed. For example, the object passed to `population({ of: tree })` must be the same object owned by a key in
`scene.definitions`.

Do not reconstruct an equal-looking object at each use. Do not bind one declaration under two keys. The compiler uses
object identity to resolve authoring references before it assigns stable contract IDs.

## Separate reusable definitions from placed cast

- Put only `thing(...)` values in `scene.definitions`.
- Put only `region(...)` and `population(...)` values in `scene.cast`.
- Keep every definition reachable from cast through `of`, `features`, `parts`, or `basedOn` references.
- Put `frames(...)` values in `scene.composition`; version 0.1.0 has no other relationship constructor.

Use explicit records when a module has many exports:

```ts
import type { ThingDefinition } from '@antiky/contracts/dsl';
import { tree, trunk, crown } from './environment';

export const definitions = {
  tree,
  trunk,
  crown,
} satisfies Readonly<Record<string, ThingDefinition>>;
```

The keys in these records, not local variable names or display names, establish stable identity. Treat a key rename as
an ID migration.

## Keep the entry graph declarative

Pure TypeScript helpers and ordinary local imports are supported, but the compiler executes the trusted module graph
while loading it. Keep module initialization free of network calls, process mutation, and other side effects. Do not
compile uploaded or otherwise untrusted TypeScript.

The build manifest records hashes for local source files inside the project root. Package code, `node_modules`, and
files outside the root are excluded from that source inventory. An imported module outside the root can still execute;
`projectRoot` is not an import sandbox.

For a complete working split, use
[Compose a scene from modules](../tutorials/compose-a-scene.md). For the larger shipped pattern, inspect the
[Blue Winter Grove source directory](../../../packages/examples/src/blue-winter-grove/).
