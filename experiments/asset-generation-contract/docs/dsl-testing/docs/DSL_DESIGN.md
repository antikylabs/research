# Declarative TypeScript DSL: Detailed Design

**Status:** Supporting technical design for [DSL_REDESIGN.md](DSL_REDESIGN.md)

**Goal boundary:** [Goal 1](../GOAL.md)

The redesign document owns the public-language direction. This document specifies how the first semantic scene slice can be represented, lowered, validated, and packaged. If these documents conflict about what an ordinary author writes, the redesign wins.

## 1. Purpose

Antiky needs two related declarative models:

1. a **semantic ECS** that game developers and design agents author in TypeScript
2. a **technical ECS** that generators, validators, tools, and the engine consume as canonical JSON

The semantic model describes choices: intended experience, visual identity, player activity, important subjects, spatial roles, meaningful relationships, allowed variation, forbidden outcomes, and evidence of success.

The technical model describes production: exact entities, prototypes, catalog components, relationships, systems, dependencies, schemas, IDs, validation records, outputs, hashes, and indexes.

A useful semantic field must either:

- lower into more than one technical concern,
- remove technical policy that a named profile can provide, or
- preserve important creative intent for downstream planning and review.

A field that merely renames one backend property without improving the design vocabulary should not enter the semantic catalog.

## 2. Representation pipeline

```text
trusted *.contract.ts
        │
        ▼
immutable semantic declarations
        │  collect identity and direct definition references
        ▼
normalized semantic graph
        │  expand named profiles; diagnose conflicts
        ▼
technical authoring IR + derivation map
        │  resolve ownership, prototypes, refs, and systems
        ▼
validated resolved technical ECS
        │  canonicalize, hash, index, emit
        ▼
JSON IR + diagnostics + exact refs + manifest
```

There is no model call, prompt execution, or natural-language interpretation step in this pipeline. An AI may edit the TypeScript just as a human may. Compilation remains deterministic software.

## 3. Public Goal 1 vocabulary

Goal 1 exposes these constructors and helpers:

```ts
scene(input)
thing(input)
region(input)
population(input)
referenceImage(path)
frames(source, target, options?)
between(min, max)
meters(value)
meters(min, max)
voxelDiorama
```

It also exposes compiler entry points from the compiler subpath:

```ts
compileContract(input, options)
validateResolvedContract(input, options)
```

`game`, `world`, `scenario`, additional relationship helpers, narrative, and audio belong to later goals. Their future existence must not force speculative abstractions into the scene slice.

### 3.1 Object-shaped declarations

The public grammar is ordinary TypeScript object literals rather than fluent mutation:

```ts
const pine = thing({
  name: 'Mature snow pine',
  identity: ['tall and old', 'visible branch structure'],
  shape: {
    height: meters(11.5, 17.5),
    crown: 'asymmetrical and layered',
  },
  variation: {
    vary: ['height', 'lean', 'branch loss', 'snow load'],
    preserve: ['mature proportions', 'readable branch tiers'],
  },
  avoid: ['single-cone crowns', 'perfect symmetry'],
});
```

The constructor supplies a readonly archetype discriminant for the type system and compiler. It does not allocate an engine entity, register a global, or execute generation behavior.

Reusable things may specialize or compose other things without introducing a constructor per game-domain noun:

```ts
const character = thing({ name: 'Playable field character' });
const vanguard = thing({ name: 'Vanguard', basedOn: character });
const scholar = thing({ name: 'Scholar', basedOn: character });
const party = thing({ name: 'Party', parts: { vanguard, scholar } });

const crown = thing({ name: 'Rounded snow-loaded crown' });
const trunk = thing({ name: 'Warm forked trunk' });
const bentTrunk = thing({ name: 'Frost-bent trunk', basedOn: trunk });
const groveTree = thing({ name: 'Grove tree', parts: { crown, trunk } });
const landmarkTree = thing({ name: 'Landmark tree', parts: { crown, trunk: bentTrunk } });
```

`basedOn` is prototype specialization. `parts` keys are named roles in the whole and values are direct
thing references. Reusing the same `crown` value keeps one definition identity while creating two
dependency edges.

### 3.2 Semantic value types

Units and ranges must not be ambiguous tuples:

```ts
type Range<T> = Readonly<{
  kind: 'range';
  min: T;
  max: T;
}>;

type Meters = Readonly<{
  kind: 'meters';
  value: number | Range<number>;
}>;
```

`between(34, 22)` and non-finite values are errors. Unit-bearing fields accept the relevant unit type rather than a bare number. These wrappers normalize to ordinary JSON values during lowering.

Use finite string unions only when the meaning and lowering are stable. For example, Goal 1 may type scene density as the backend-supported set and population placement pattern as a small semantic set such as `'loose clusters'`. Free-form fields remain strings when their job is readable creative direction.

### 3.3 Semantic components

Representative Goal 1 shapes follow. Exact naming may evolve during implementation, but the separation and scope rules are normative.

```ts
interface ExperienceDirection {
  fantasy: string;
  feel?: readonly string[];
  firstRead?: readonly string[];
  closerLook?: readonly string[];
}

interface VisualDirection {
  language: string;
  lighting?: string;
  density?: 'low' | 'medium' | 'medium-high' | 'high' | 'very-high';
  silhouettes?: string;
  detail?: string;
  avoid?: readonly string[];
}

interface ReferenceImage {
  readonly kind: 'reference-image';
  path: string;
}

interface ReferenceUse {
  image: ReferenceImage;
  use: string;
}

interface SceneGameplayDirection {
  playAs?: PopulationDefinition;
  purpose: string;
  loop?: readonly string[];
  playerCan?: readonly string[];
  pace?: string;
  spaceMust?: readonly string[];
}

interface ThingGameplayDirection {
  playable?: boolean;
  role: string;
  playerCan?: readonly string[];
}

interface VariationDirection {
  vary: readonly string[];
  preserve?: readonly string[];
  avoid?: readonly string[];
}

interface RulesDirection {
  must?: readonly string[];
  avoid?: readonly string[];
}

interface AcceptanceDirection {
  review?: readonly string[];
  checks?: readonly PopulationCountCheck[];
}
```

Goal 1 needs one structured measurable-check form to prove the extension point:

```ts
interface PopulationCountCheck {
  key: string;
  subject: PopulationDefinition;
  measure: 'population count';
  expected: Range<number>;
}
```

Additional metrics should be added only with a validator and a deterministic technical mapping.

### 3.4 Archetype scope

The public types enforce which components belong where.

| Archetype | Goal 1 author controls |
|---|---|
| `scene` | key, name, profiles, references, experience, visual, gameplay, definitions, cast, composition, rules, acceptance |
| `thing` | name, `basedOn`, named parts, references, identity, shape, visual, thing gameplay, variation, rules/avoidance, technical override |
| `region` | name, references, purpose, shape, size, named features, keep/avoid direction, technical override |
| `population` | name, references, `of`, amount, placement, role, variation, rules, technical override |

A `thing` accepts character/prop gameplay direction, but not a scene loop, pace, spatial requirements, or `playAs`. `population.of`, `thing.basedOn`, `thing.parts`, and `region.features` accept things rather than arbitrary declarations. Scene `playAs` accepts a placed population. Goal 1 `frames` accepts a population source and region target. TypeScript catches these local mistakes; runtime validation catches forged/untyped input and cross-record conflicts.

## 4. Identity and direct definition references

### 4.1 Keyed bindings are identity

Identity is assigned at explicit keyed boundaries:

- `scene.key` identifies the root contract.
- keys in `scene.definitions` identify reusable things and composite prototypes within that scene.
- keys in `scene.cast` identify placed regions and populations within that scene.
- later roots use equivalent records such as `worlds`, `scenes`, or `scenarios`.
- a future reusable package-level definition may declare an explicit contract key.

For Goal 1, every referenced thing must appear exactly once in `scene.definitions`; every referenced
region and population must appear exactly once in `scene.cast`.

```ts
scene({
  key: 'blue-winter-grove',
  definitions: {
    pine,
    crown,
  },
  cast: {
    clearing,
    oldGrowth,
  },
  // ...
});
```

The TypeScript variable `oldGrowth` is not identity. The display name is not identity. The record keys `pine`, `crown`, and `oldGrowth` are identity.

### 4.2 Goal 1 full-ID expansion

Use a documented, reversible format. One acceptable v0.1 policy is:

```text
scene.<root-key>
prototype.<root-key>.<definition-key> thing
region.<root-key>.<cast-key>         region
population.<root-key>.<cast-key>     population
rel.<root-key>.frames.<source-key>.<target-key>
```

The engine-facing prototype ID does not encode the author-facing `definitions` container name. Root,
definition, cast, part-role, and feature-role keys must
satisfy a restrictive syntax such as `^[a-z][a-zA-Z0-9-]*$`. Reject invalid keys instead of silently
sanitizing them. If a different exact format is implemented, document it and test the same invariants.

Renaming prose, a variable, or an import alias leaves IDs unchanged. Renaming a root, definition, or cast key is an identity migration and changes the corresponding ID and dependent slice hashes.

### 4.3 Definition values are references

The author writes:

```ts
const oldGrowth = population({
  of: pine,
  placement: { around: clearing },
  // ...
});

frames(oldGrowth, clearing);
```

The normalized semantic graph stores exact reference tokens resolved from the keyed bindings. It does not infer a variable name and does not ask the author for `ref('prototype...')`.

The same rule applies to composite and gameplay references:

```ts
const vanguard = thing({ basedOn: character });
const party = thing({ parts: { vanguard, scholar, scout } });
const clearing = region({ features: { surfaces, groundDetails } });
scene({ gameplay: { playAs: travellingParty }, definitions, cast });
```

Collection must distinguish shared references from object cycles:

- seeing the same definition object again through `basedOn`, `parts`, `features`, `of`, `around`,
  `playAs`, acceptance, or a relationship is valid
- binding the same object under two definition/cast keys is an error
- referencing a definition that has no keyed binding is an error
- specialization and part dependency cycles are errors
- arbitrary cyclic objects are errors
- two separate objects with the same eventual identity are errors

These diagnostics use semantic paths such as `$.cast.oldGrowth.of`, not only resolved JSON pointers.

## 5. Purity, immutability, and serialization

Constructors return plain declarative records with a plain internal discriminant. Use readonly TypeScript types and a documented runtime policy such as recursive freezing in development/test builds. Tests must demonstrate that a declaration cannot be mutated unnoticed after construction.

Allowed:

- plain objects and arrays
- finite strings, numbers, booleans, and null where typed
- semantic unit/range records
- reference-image records created by `referenceImage(...)`
- shared definition objects used as typed references
- pure helper functions that return declaration data before construction

Rejected in declaration data:

- runtime callbacks
- functions stored as values
- symbols and bigints
- `NaN`, positive infinity, and negative infinity
- dates, maps, sets, class instances, or other unsupported prototypes
- arbitrary object cycles
- accessors or side-effectful values that make loading depend on observation order

Builder values become plain JSON only after reference normalization and lowering. “Declarative” does not mean the raw JavaScript object graph can be passed directly to `JSON.stringify` before that normalization.

## 6. Project profiles

The compact DSL is possible because profiles provide technical policy explicitly and version it.

Goal 1 ships one inspectable `voxelDiorama` profile. A representative internal shape is:

```ts
interface ProjectProfile {
  readonly id: string;
  readonly version: string;
  readonly coordinatePolicy: CoordinatePolicy;
  readonly seedPolicy: SeedPolicy;
  readonly schema: VersionedSchemaSelection;
  readonly systems: readonly TechnicalSystemTemplate[];
  readonly validation: ValidationPolicy;
  readonly render: RenderPolicy;
  readonly outputs: OutputPolicy;
}
```

It is data consumed by a profile lowerer, not a magic `if (profileName)` branch scattered through the compiler.

Precedence is:

1. explicit semantic direction is authoritative
2. selected profiles fill absent technical policy
3. a local technical override may add registered technical detail that does not contradict semantic direction
4. incompatible explicit direction, profiles, or overrides produce a blocking diagnostic

The compiler must not silently pick the last profile in an array. Profile expansion order, merge behavior, and conflicts are deterministic and visible in provenance.

## 7. Goal 1 lowering map

Lowering is versioned. It may create several technical records from one semantic path.

| Semantic source | Required technical effect |
|---|---|
| scene key/name | contract metadata, root scene entity, ownership root |
| declaration reference use | validated entry-relative image path, content hash, intended use, source path, and semantic-to-image index edge |
| `experience` | `description.intent` fields and human-review context |
| `visual.language` | `style.visualLanguage.primary` |
| visual lighting/silhouettes/detail | supported visual-language/detail records when the mapping is exact; otherwise canonical semantic provenance |
| visual/rules `avoid` | `style.forbiddenForms` and review rules |
| scene gameplay | player-controlled population reference, player-read/intent, loop, and spatial-review data; canonical semantic provenance for the full declaration |
| thing gameplay | playable/role intent and capabilities preserved on that prototype for planning and review |
| `thing` | one prototype with intent, supported bounds/form, forbidden forms, variation, and override components |
| `thing.basedOn` | exact technical prototype `extends` reference plus dependency/provenance index entries |
| `thing.parts` | canonical role-to-prototype dependency graph and source paths; operational grammar only where an exact lowerer exists |
| `region` | one region entity with intent plus `layout.regionMask`, `composition.negativeSpace`, or `layout.clearance` where fields map exactly |
| region features | canonical role-to-prototype dependency graph and source paths; technical placement only where an exact lowerer exists |
| `population.of` | `population.prototypeMix` with the resolved prototype ID |
| population amount | `population.quantity` |
| population placement | profile-selected `population.distribution`, exact region refs, and preserved placement direction |
| population role | `composition.populationRole` |
| population variation | `population.variation` with a derived stable stream plus authored variation direction |
| `frames(a, b)` | one `composition.frames` relationship and related validation context |
| `acceptance.review` | ordered top-level human-review records |
| supported acceptance check | deterministic validation-suite rule with exact subject ID and range |
| `voxelDiorama` | coordinate, seed, schema/catalog, system, validation, render, and output defaults |

### 7.1 Preserve without pretending

The supplied technical scene catalog does not have a direct component for every semantic game-design field. Goal 1 must not discard those fields or invent a false numeric interpretation.

The resolved contract should retain a canonical normalized semantic projection under an allowed provenance location, for example:

```text
contract.provenance.authoring.semantic
```

The projection uses resolved scoped IDs rather than JavaScript object references. It includes the
`basedOn`, part, feature, and `playAs` dependency edges and is part of the resolved hash.
`contract-index.json` maps semantic paths to technical records and indexes each dependency edge.

Preservation is not a substitute for lowering. Fields with a defined mapping must produce the corresponding technical records. Fields without one remain visible to downstream planners and human reviewers until the technical catalog gains an honest representation.

### 7.2 Typed prose mappings

Free prose does not choose algorithms. A typed semantic enum may do so through a versioned table.

For example, the typed placement value `'loose clusters'` may map through `voxelDiorama@0.1.0` to one installed distribution implementation. The profile and lowerer version record that decision. An arbitrary string such as “natural but dramatic” may not select an algorithm.

### 7.3 Technical override

Goal 1 may expose one explicit escape hatch near a definition:

```ts
technical: {
  components: {
    'antikylabs.snow.windCarving': {
      ridgeScaleM: 1.8,
      intensity: 0.62,
    },
  },
}
```

An override:

- is never required by the compact fixture
- is validated against a registered namespaced schema and allowed entity kind
- records its semantic source path and schema version
- cannot add systems or bypass normal validation in Goal 1
- cannot contradict semantic direction without a diagnostic

The generic backend component builder, raw relationship builder, and system builder remain internal. Do not document them next to `scene(...)` as equivalent primary choices.

## 8. Compiler architecture

### 8.1 Semantic front end

Responsibilities:

- validate trusted module export shape
- resolve and hash reusable entry-relative reference images without exposing absolute paths
- guard serializability and supported declaration prototypes
- collect keyed definitions and relationships
- validate specialization, part, feature, and gameplay dependency kinds and cycles
- assign scoped IDs
- resolve definition-object references
- expand profiles and diagnose conflicts
- lower semantic fields with derivation evidence

This layer knows authoring types and semantic paths. It should not write files directly.

### 8.2 Technical core

Responsibilities:

- normalize the flat entity map and one-parent tree
- resolve technical prototype inheritance
- resolve technical component, relationship, and system references
- validate schema/catalog rules and system DAGs
- canonicalize and hash

This layer also powers `validateResolvedContract`, so the full existing JSON fixture remains a compatibility oracle. It may use internal raw technical record factories, but those are not the public creative language.

### 8.3 Emission

Responsibilities:

- create the five Goal 1 outputs
- emit only after blocking diagnostics are known
- use canonical bytes and atomic replacement when practical
- return the same result to the CLI and programmatic API

See [Compiler Outputs](COMPILER_OUTPUTS.md) for normative file contents.

## 9. Diagnostics and derivation evidence

A diagnostic should include both author and technical locations when known:

```ts
interface Diagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  semanticPath?: string;
  technicalPath?: string;
  contractId?: string;
  hint?: string;
  related?: readonly DiagnosticLocation[];
}
```

Example:

```text
DSL_RELATIONSHIP_ENDPOINT_KIND at $.composition[0]
frames(...) requires a population source and region target; received region → population.
```

Every lowered record has one or more derivation entries:

```ts
interface Derivation {
  outputId: string;
  outputPath: string;
  semanticPaths: readonly string[];
  lowerer: { id: string; version: string };
  profile?: { id: string; version: string };
  overridePath?: string;
}
```

File/line source maps are desirable later. Goal 1's semantic paths are required and must not depend on absolute machine paths.

## 10. Canonicalization and hashing

Canonicalization happens after all semantic references, profiles, technical defaults, prototypes, and graph edges are resolved.

Rules:

- recursively sort object keys by Unicode code-point order or another documented total order
- sort semantically unordered sets by exact stable ID
- preserve ordered author arrays such as first reads, loop steps, composition edges, and review questions
- normalize unit/range wrappers to their technical JSON representation
- normalize negative zero if the serializer treats it inconsistently
- reject non-finite numbers before serialization
- use UTF-8, LF endings, and one documented final-newline rule
- hash canonical bytes, not in-memory object iteration order
- include referenced-image content hashes and entry-relative paths in semantic input identity
- never include time, duration, random UUIDs, absolute source paths, current working directory, locale-dependent formatting, or host metadata

Hashes should distinguish:

- authoring input/normalized semantic graph
- selected profile set and versions
- schema and catalog bytes
- lowerer/pass versions
- resolved contract
- each emitted output

## 11. Package shape

One package with subpath boundaries is sufficient for v0.1:

```text
packages/contracts/
├── src/
│   ├── dsl/          semantic types, constructors, units, relationships, profiles
│   ├── compiler/     loader, collection, profiles, lowerers, technical passes, CLI
│   ├── catalog/      supplied catalog loading, generated internal bindings, validators
│   ├── ir/           engine-facing resolved types and exact ref type
│   └── internal/     raw technical factories not exported as the primary DSL
├── test/
└── package.json
```

Dependency direction:

```text
dsl                 no engine/compiler dependency
catalog             schema/catalog support
ir                  portable engine-facing types
compiler  ───────▶  dsl + catalog + ir + internal technical core
engine    ───────▶  ir only
```

Keep the TypeScript module loader and CLI dependencies out of `ir` exports.

## 12. Trusted TypeScript boundary

Goal 1 loads local repository TypeScript as trusted build-time code. Importing a module can execute arbitrary module-level code; deep-freezing the exported declaration does not sandbox that execution.

Therefore:

- document that authoring entries are trusted repository code
- do not load network-supplied or user-uploaded modules
- run compilation with ordinary repository privileges, not engine/runtime privileges
- immediately validate and normalize the default export
- never carry executable values into resolved IR

An untrusted-code sandbox is a separate security project and not Goal 1.

## 13. Extension rules

Add a semantic field or relationship helper only when:

1. it uses stable game-development vocabulary
2. its valid scopes are clear
3. it has deterministic preservation and, where claimed, lowering
4. at least two contracts need it or one contract proves a fundamental archetype capability
5. diagnostics can point to the author's semantic path

Add a backend component by updating the technical catalog or registering a namespaced override schema. Do not automatically promote every backend component into the semantic API.

Add a project profile only when its defaults are named, versioned, inspectable, conflict-checked, and included in hashes/provenance.

## 14. Testing strategy

The test pyramid follows the representation boundary:

- **type tests:** archetype fields, image-reference uses, specialization/part/feature references, gameplay references, relationships, units, ranges, and forbidden raw fields
- **visual-reference tests:** entry-relative resolution, reuse across declarations, missing/out-of-project rejection, byte hashing, and path-independent deterministic output
- **constructor tests:** purity, immutability, and plain declaration shape
- **identity tests:** definition/cast binding, direct refs, reused parts, dependency cycles, collisions, label/variable stability, key migrations
- **lowerer tests:** one semantic path produces exact technical records and derivation evidence
- **profile tests:** default expansion, merge order, conflicts, and version hashing
- **technical validator tests:** ownership, prototypes, components, relationships, systems, schema, and full fixture
- **integration tests:** compact TypeScript entry through CLI to all five outputs
- **determinism tests:** repeated emission is byte-identical and host-independent
- **usability guard:** compact scene-entry line count, readable formatting, compositional module coverage, and absence of raw technical vocabulary across the module set

Snapshots may supplement semantic assertions, but a snapshot alone is not evidence that a lowerer or diagnostic is correct.

## 15. Boundary for Goal 1

Goal 1 proves that a small semantic TypeScript source can lower honestly into the existing technical ECS. It does not need to prove every future game-design concept.

Success means:

- the source is recognizably game and scene direction
- the compiler owns technical expansion
- unsupported meaning is preserved visibly, not guessed or dropped
- the complete backend validator still accepts the detailed source fixture
- stable identity, provenance, schema integrity, and deterministic bytes are real and tested

The raw technical ECS remains valuable as the compiler's deep internal model. It is no longer the ordinary author's job.
