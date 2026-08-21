# Antiky TypeScript Contract DSL Design

## 1. Purpose

The Antiky DSL is a TypeScript authoring layer for expressing **what should exist, why it should exist, how it relates to the rest of the game or world, how it may vary, and how success is evaluated**.

It compiles to a strict intermediate representation (IR) that generation systems, validators, editors, and the runtime engine can consume without executing authoring code.

The DSL should make a large contract feel like a codebase rather than one enormous configuration document:

- definitions can be imported and reused
- references are typed and refactorable
- common patterns can be composed with ordinary pure helper functions
- component payloads are guided by schemas and autocomplete
- ownership can be authored by nesting rather than by duplicating parent IDs and tree maps
- compiler diagnostics explain broken references, invalid payloads, cycles, and non-deterministic values

The DSL does not contain per-frame game behavior, shaders, arbitrary procedural mesh code, or runtime ECS systems.

## 2. The three representations

Antiky should distinguish three representations instead of trying to make one format serve every purpose.

### 2.1 Authoring model

The TypeScript-facing model is optimized for humans and agents:

- imports and exports
- typed builders
- local constants
- pure composition helpers
- comments and documentation
- nested ownership
- definition references rather than raw strings where possible
- concise defaults and reusable profiles

The authoring model may retain shorthand, inheritance, and semantic helpers.

### 2.2 Resolved JSON IR

The compiler-facing and engine-facing model is optimized for portability and determinism:

- plain JSON only
- no functions or class instances
- explicit IDs and normalized references
- fully resolved prototype inheritance
- explicit defaults
- canonical ordering
- stable component, schema, system, and compiler versions
- stable content hashes
- complete ownership and dependency graphs

The uploaded Blue Winter Grove JSON is close to this representation, although it intentionally retains extra descriptions for readability.

### 2.3 Generated and implemented artifacts

Generation systems and coding agents create tangible outputs from the IR:

- voxel or mesh asset bundles
- terrain and population instances
- scene bundles
- materials and render profiles
- runtime TypeScript logic for later game/scenario contracts
- tests and validators
- renders and reports
- provenance and promotion manifests

These artifacts are not embedded in the DSL and are not created merely because TypeScript type-checks.

## 3. Contract layers

The broader Antiky model can eventually support several layers:

```text
game
└── world
    └── scene
        ├── prototypes/assets
        ├── populations and environment
        ├── scenarios
        └── validation and outputs
```

A practical semantic split is:

| Layer | Describes |
|---|---|
| Game | experience pillars, genre, camera/control intent, core loop, vertical-slice scope, non-goals |
| World | global fiction, semantic palettes, world rules, regions, shared systems |
| Scene | one place, its ownership graph, populations, composition, cameras, generation, and validation |
| Scenario | a situation, trigger, objective, expected player experience, and implementation requirements |
| Prototype/asset | reusable grammar for a thing; not one placed instance |
| Implementation/artifact | code, generated models, bundles, renders, reports, and tests that fulfill contract nodes |

**Goal 1 implements only the generative scene layer**, because the uploaded schemas and detailed fixture define that layer precisely. Game, world, and scenario APIs should be designed after the first scene compiler is proven.

## 4. The central scene model

The uploaded specification defines a **Generative Entity-Component Graph (GECG)**. The DSL should preserve this model rather than replacing it with a generic nested object tree.

### 4.1 Ownership tree

Every authored entity has exactly one logical parent, except the root scene. Ownership determines:

- scope and inheritance
- deletion behavior
- seed and coordinate scope
- regeneration boundaries
- local invalidation

The authoring DSL should make the tree visually obvious through nesting:

```ts
defineEntity(
  {
    id: 'group.ecology',
    kind: 'group',
    name: 'Forest Ecology',
    components: [/* ... */],
  },
  [
    defineEntity(
      {
        id: 'group.canopy',
        kind: 'group',
        name: 'Canopy Layer',
        components: [/* ... */],
      },
      [oldGrowthPines],
    ),
  ],
);
```

The compiler lowers this to both:

- the flat `entities` map required by IR
- the explicit `entityTree`

Authors should not have to write and keep both representations synchronized.

### 4.2 Relationship graph

Containment cannot express ecology, composition, influence, or dependency. Relationships remain separate, typed graph edges:

```ts
defineRelationship({
  id: 'rel.old-growth.frames-clearing',
  type: 'composition.frames',
  source: ref(oldGrowthPines),
  target: ref(primaryClearing),
  required: true,
  priority: 900,
  rule: {
    preferredArcCoverageDegrees: [190, 280],
    avoidContinuousTreeWall: true,
  },
});
```

The catalog validates allowed source and target kinds. The compiler indexes incoming and outgoing edges for navigation and later trace queries.

### 4.3 Declarative, prototype, and derived entities

The DSL directly authors:

- declarative entities such as scenes, terrain regions, populations, cameras, and anchors
- prototype definitions such as a mature snowy pine or glacial boulder

Derived entities are produced later by systems. They are not manually inserted into the authoring tree. Their receipts and provenance should point back to:

- the source declarative entity
- the resolved prototype
- the producing system and version
- the deterministic seed stream
- the contract revision and hash

## 5. Package and dependency design

Use a separate `@antiky/contracts` workspace package. One package with subpath exports provides strong boundaries without prematurely creating many separately versioned packages.

### 5.1 `@antiky/contracts/ir`

Contains only stable, serializable types and small value helpers:

- IDs and typed references
- resolved contract records
- diagnostics
- compiler manifest records
- JSON value types
- no TypeScript module loading
- no schema validator dependency exposed to the engine

The engine may depend on this subpath.

### 5.2 `@antiky/contracts/catalog`

Contains:

- built-in component schemas and metadata
- relationship type definitions
- merge and inheritance policies
- system phase order
- generated literal unions and payload types
- custom component registry interfaces

### 5.3 `@antiky/contracts/dsl`

Contains pure builders and authoring types. It depends on IR and catalog types, not the Antiky runtime.

### 5.4 `@antiky/contracts/compiler`

Contains:

- trusted local module loader or in-memory compile entry
- normalization passes
- schema and graph validation
- canonical serialization and hashing
- output emitters
- CLI

The engine must not import this subpath.

### 5.5 Later subpaths

Future work can add:

- `@antiky/contracts/artifacts`
- `@antiky/contracts/trace`
- `@antiky/contracts/agent`

Do not add them to Goal 1 unless needed to avoid a genuine architectural dead end.

## 6. Core authoring types

The exact implementation can vary, but the type model should make category errors hard.

```ts
type EntityKind =
  | 'scene'
  | 'group'
  | 'environment'
  | 'terrain'
  | 'region'
  | 'population'
  | 'composition-anchor'
  | 'camera'
  | 'validation-target'
  | 'abstract';

type DefinitionKind = EntityKind | 'prototype' | 'relationship' | 'system';

type ContractId<K extends DefinitionKind = DefinitionKind> = string & {
  readonly __contractKind?: K;
};

interface ContractRef<K extends DefinitionKind = DefinitionKind> {
  readonly id: ContractId<K>;
  readonly kind?: K;
}
```

Branding is a compile-time aid, not an IR field. Resolved JSON stores exact string IDs.

References should accept either a definition object or an explicit ID:

```ts
ref(maturePine);
ref<'prototype'>('prototype.tree.snow-pine.mature');
```

The compiler remains authoritative because raw IDs can come from imported data.

## 7. Proposed public DSL

The smallest useful API is:

```ts
defineSceneContract(input)
definePrototype(input)
defineEntity(input, children?)
defineRelationship(input)
defineSystem(input)
defineComponentType(input)
component(typeOrDefinition, payload)
ref(idOrDefinition)
```

### 7.1 `defineSceneContract`

Collects the top-level scene boundary:

- schema version
- contract metadata
- imports
- coordinate system
- determinism
- quality profile
- palettes, materials, profiles, and prototypes
- root entity tree
- relationships
- systems
- validation
- outputs

It must not perform global registration or compilation when imported. It returns a declarative authoring record.

### 7.2 `definePrototype`

Defines one reusable asset grammar:

```ts
const maturePine = definePrototype({
  id: 'prototype.tree.snow-pine.mature',
  name: 'Mature Snow-Laden Pine',
  extends: ref(coniferBase),
  tags: ['asset', 'tree', 'mature', 'snow-receiver'],
  components: [
    component('core.bounds', {
      heightM: [11.5, 17.5],
      crownRadiusM: [2.7, 5.1],
    }),
    component('geometry.treeGrammar', {
      trunk: { centerlineSegments: [10, 18] },
      branchTiers: { count: [8, 14] },
      foliageVolumes: { construction: 'branch-attached-lobed-clusters' },
    }),
  ],
});
```

The authoring form uses a component list so duplicate component types can be rejected deliberately. The compiler emits the IR component map.

### 7.3 `defineEntity`

Defines one authored scene entity and its optional children:

```ts
const oldGrowth = defineEntity({
  id: 'population.pine.old-growth',
  kind: 'population',
  name: 'Old-Growth Pine Clusters',
  tags: ['population', 'canopy'],
  components: [
    component('population.prototypeMix', {
      entries: [{ prototype: ref(maturePine), weight: 1 }],
    }),
    component('population.quantity', {
      count: [22, 34],
      samplingScope: 'scene',
    }),
    component('population.distribution', {
      algorithm: 'clustered-poisson-with-composition-masks',
      avoidGrid: true,
    }),
  ],
});
```

The component helper should lower `ContractRef` values to exact IDs recursively before validation and serialization.

### 7.4 `defineRelationship`

Defines a typed graph edge. It accepts either a target ref or a target selector, but not both.

### 7.5 `defineSystem`

Describes a generation or validation pass, not runtime update code:

```ts
defineSystem({
  id: 'system.synthesis.tree-geometry',
  phase: 'synthesis',
  implementation: 'antikylabs.synthesis.tree-geometry',
  implementationVersion: '0.1.0',
  reads: ['geometry.treeGrammar', 'variation.parameters'],
  writes: ['derived.voxelGeometry', 'derived.assetMetrics'],
  query: { kind: 'population', has: ['population.prototypeMix'] },
  dependsOn: [ref(populationLayoutSystem)],
  randomStream: 'asset/<derived-instance-id>/tree-geometry',
  produces: ['voxel-asset', 'asset-metrics'],
});
```

The implementation identifier is a stable contract-facing name. It does not embed executable code.

## 8. Catalog-backed component typing

The component catalog should be the source of truth for:

- component names
- allowed entity kinds
- authored versus derived status
- inheritance/merge policy
- schemas
- common readers and writers
- invalidation effects

Do not hand-copy 43 names into a union and then maintain a separate schema map.

A code-generation step can turn the catalog into a TypeScript module:

```ts
export const builtInComponentSchemas = {
  'description.intent': /* schema */,
  'core.bounds': /* schema */,
  // ...
} as const;

export type BuiltInComponentType = keyof typeof builtInComponentSchemas;
export type BuiltInComponentPayload<K extends BuiltInComponentType> =
  PayloadFromSchema<(typeof builtInComponentSchemas)[K]>;
```

The exact schema-to-TypeScript mechanism may use an existing repository dependency or a small generated declaration layer. The design requirement is behavioral: closed schemas must provide useful compile-time errors, and all schemas must still be enforced at runtime.

## 9. Custom components

Extensibility should be schema-backed, namespaced, and explicit.

```ts
const windCarving = defineComponentType({
  id: 'antikylabs.snow.windCarving',
  version: '1.0.0',
  allowedEntityKinds: ['terrain', 'prototype'],
  inheritance: 'deep-merge',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ridgeScaleM: { type: 'number', exclusiveMinimum: 0 },
      intensity: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['ridgeScaleM', 'intensity'],
  } as const,
});

component(windCarving, {
  ridgeScaleM: 1.8,
  intensity: 0.62,
});
```

Rules:

- IDs must use a non-core namespace unless part of the built-in catalog.
- A version is required.
- The component must declare allowed entity kinds and merge behavior.
- The schema must be registered before compilation.
- Unknown unregistered components fail compilation.
- The compiler validates both the payload and the entity kind to which it is attached.
- Custom component data survives round-tripping and canonicalization.

## 10. Composition and helpers

Ordinary TypeScript functions may produce declarative definitions:

```ts
function populationFromPrototype(options: {
  id: string;
  name: string;
  prototype: ContractRef<'prototype'>;
  count: readonly [number, number];
}) {
  return defineEntity({
    id: options.id,
    kind: 'population',
    name: options.name,
    components: [
      component('population.prototypeMix', {
        entries: [{ prototype: options.prototype, weight: 1 }],
      }),
      component('population.quantity', {
        count: options.count,
        samplingScope: 'scene',
      }),
    ],
  });
}
```

This is where TypeScript provides real value. The helper itself is not emitted. Only its returned data enters the authoring model.

Prefer composition over deep class inheritance or fluent mutable builders. Pure data-returning functions are easier for agents to write, test, diff, and refactor.

## 11. High-level intent versus low-level engine data

The DSL should not become a graphics or shader language.

Good authoring concepts include:

- semantic material roles
- visual language and forbidden forms
- macro/meso/micro detail targets
- prototype grammar and variation ranges
- population distributions
- semantic camera intent or stable acceptance cameras
- relationships and validation targets

Low-level implementation details should remain behind versioned systems or renderer profiles:

- shader source
- GPU resource bindings
- mesh-buffer mutation
- per-frame callbacks
- physics solver internals
- arbitrary procedural modeling scripts

The existing IR contains explicit meter-based positions for cameras and anchors. Those values remain valid when a contract needs a stable diagnostic view. The design rule is not “never use a coordinate”; it is “do not make raw vectors and renderer internals the primary authoring vocabulary.” Semantic helpers can be added later without changing the IR.

## 12. Trusted TypeScript boundary

A TypeScript DSL is executable at build time. Therefore “no arbitrary code execution” must be interpreted precisely:

- the **engine never executes** authoring modules
- compiled IR never contains executable code
- Goal 1 loads only trusted local repository modules
- the compiler rejects non-serializable output
- untrusted third-party contract execution is not supported in Goal 1

A later hardened loader may evaluate authoring modules in a worker or sandbox with restricted file-system, process, and network access. That is a security feature, not a prerequisite for the first local developer workflow.

## 13. Compiler pipeline

The compiler should operate as explicit passes so diagnostics and future incremental invalidation remain understandable.

```text
load
  → collect definitions and registries
  → lower refs and semantic shorthands
  → serialization guard
  → flatten ownership
  → resolve prototype inheritance
  → validate component payloads and allowed scopes
  → resolve graph references
  → validate relationships
  → validate system dependency DAG
  → apply defaults and canonical ordering
  → calculate hashes and indexes
  → emit deterministic outputs
```

Each pass should have a stable name and version in the build manifest. A pass should not silently “repair” semantically invalid authoring.

## 14. Prototype inheritance and merge policies

Prototype inheritance should remain shallow and explicit. The catalog declares one of these merge policies:

- `replace`
- `deep-merge`
- `append-unique`
- `non-inheritable`

Resolution rules should be documented and tested. A sensible baseline is:

1. Resolve parent prototypes first.
2. Copy inherited components according to each component's policy.
3. Apply child components.
4. Reject attempts to inherit a `non-inheritable` component.
5. Deduplicate `append-unique` arrays by canonical JSON identity or a documented key.
6. Record ancestry and source hashes in the contract index.
7. Emit no unresolved `extends` in engine IR.

The compiler must detect inheritance cycles before recursively resolving payloads.

## 15. Determinism and canonicalization

Determinism is a product feature, not just a test convenience.

Rules:

- sort map keys lexicographically
- sort unordered ID collections
- preserve semantic list order
- normalize `ContractRef` values to exact IDs
- reject `NaN`, positive/negative infinity, and negative zero if the serializer does not normalize it explicitly
- use one documented UTF-8 canonical JSON serializer
- never include wall-clock timestamps or absolute paths in deterministic files
- hash canonical bytes rather than in-memory objects
- include compiler, schema, catalog, and pass versions in the manifest

A fixture compiled twice in separate temporary directories must produce byte-identical output files.

## 16. Diagnostics

Diagnostics should be designed for agent repair:

```json
{
  "code": "ANTIKY_REF_UNRESOLVED",
  "severity": "error",
  "message": "Population references an unknown prototype.",
  "path": "/entities/population.pine.old-growth/components/population.prototypeMix/entries/0/prototype",
  "contractId": "population.pine.old-growth",
  "hint": "Define prototype.tree.snow-pine.mature or update the reference.",
  "related": []
}
```

Use stable codes, precise JSON-pointer-like paths, associated contract IDs, and actionable hints. Avoid stack traces as the primary user experience.

## 17. Future game and scenario DSLs

After Goal 1 is proven, the same primitives can support higher-level contracts without forcing them into the scene schema.

A future game definition might express:

```ts
defineGame({
  id: 'game.antiky.winter-grove',
  experience: {
    pillars: ['quiet exploration', 'dense handcrafted worlds'],
    perspective: 'three-quarter',
    coreLoop: ['enter scene', 'observe', 'inspect', 'discover'],
  },
  verticalSlice: {
    includes: ['snowy clearing', 'movement', 'camera follow', 'inspect tree'],
    excludes: ['combat', 'inventory', 'multiplayer', 'full dialogue'],
  },
  worlds: [ref(winterWorld)],
});
```

A future scenario contract can then create artifact requirements for gameplay code and tests while reusing the same stable IDs, reference module, trace graph, diagnostics, and artifact planner.

The scene compiler should not invent these schemas in Goal 1. It should establish reusable foundations: IDs, refs, registries, diagnostics, canonicalization, and deterministic output.
