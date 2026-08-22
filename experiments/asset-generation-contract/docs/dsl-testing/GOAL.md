# Goal 1: Implement the Declarative TypeScript Scene DSL and Compiler v0.1

## Mission

Implement the first vertical slice of Antiky's semantic contract language in:

```text
experiments/asset-generation-contract/packages/contracts/
```

The primary DSL is typed, object-shaped, declarative TypeScript for game and scene direction. It lets authors describe a scene's intended experience, visual and gameplay direction, reusable parts and composite things, important definitions and placed subjects, meaningful composition, variation, rules, reference evidence, and acceptance. A deterministic compiler lowers that semantic model into validated JSON compatible with the supplied technical scene schema and component catalog.

Do not implement the earlier raw typed-ECS surface as the ordinary authoring API. Direct `component(...)`, `ref(...)`, `defineSystem(...)`, explicit system phases, long engine IDs, camera vectors, schema versions, and output paths belong to compiler internals or a deferred expert API.

Do not implement the Antiky engine, asset generation, gameplay runtime, prompt generation, artifact receipts, or a full TypeScript port of the 5,038-line technical Blue Winter Grove fixture. The compositional TypeScript module graph is a semantic design slice, not that port.

## Read before editing

Run this goal from the `research` repository. Read these files completely, in order:

1. `experiments/asset-generation-contract/docs/dsl-testing/AGENTS.md`
2. `experiments/asset-generation-contract/docs/dsl-testing/docs/DSL_REDESIGN.md` — authoritative public-language direction
3. `experiments/asset-generation-contract/docs/dsl-testing/README.md`
4. `experiments/asset-generation-contract/docs/dsl-testing/docs/DSL_DESIGN.md` — implementation-level detail
5. `experiments/asset-generation-contract/docs/dsl-testing/docs/COMPILER_OUTPUTS.md`, especially “Goal 1 outputs”
6. `experiments/asset-generation-contract/docs/dsl-testing/docs/RESEARCH_NOTES.md`
7. `experiments/asset-generation-contract/docs/asset-contract/SPEC_DESIGN.md`
8. `experiments/asset-generation-contract/docs/asset-contract/schemas/generative-scene-contract.schema.json`
9. `experiments/asset-generation-contract/docs/asset-contract/schemas/component-catalog.json`
10. `experiments/asset-generation-contract/docs/asset-contract/blue_winter_grove.scene.json`
11. `experiments/asset-generation-contract/packages/examples/src/blue-winter-grove/blue-winter-grove.contract.ts` and its five imported `blue-winter-grove.*.ts` support modules

Also read every applicable `AGENTS.md` from the workspace root to the implementation directory. Inspect package-manager, TypeScript, test, lint, and formatting conventions in nearby `research/experiments/` packages before selecting tools.

## Repository and fixture boundaries

Create the package at this exact path:

```text
experiments/asset-generation-contract/packages/contracts/
```

Minimal workspace metadata may be added directly under:

```text
experiments/asset-generation-contract/
```

Use `packages/*` as the workspace pattern. Do not put implementation code in `docs/dsl-testing/` or the separate `antiky` repository.

Treat `experiments/asset-generation-contract/docs/asset-contract/` as read-only. Resolve its schema, catalog, and fixtures from stable module/package locations, never from the process working directory or an absolute machine path. Do not copy those files into the implementation package.

## Desired authoring experience

The conceptual fixture at [`blue-winter-grove.contract.ts`](../../packages/examples/src/blue-winter-grove/blue-winter-grove.contract.ts) is the usability target. Its scene entry remains under 120 physical lines without compressed multi-field formatting. Focused sibling modules hold reusable references, character/environment definitions, and placed layout declarations. The implemented equivalent should look like this shape:

```ts
import {
  between,
  frames,
  meters,
  population,
  referenceImage,
  region,
  scene,
  thing,
  voxelDiorama,
} from '@antiky/contracts/dsl';

const pine = thing({
  name: 'Mature snow pine',
  identity: ['tall and old', 'visible branch structure'],
  variation: {
    vary: ['height', 'lean', 'branch loss', 'snow load'],
    preserve: ['mature proportions', 'family resemblance'],
  },
  avoid: ['single-cone crowns', 'perfect symmetry'],
});

const crownReference = referenceImage('./winter-grove.png');

const crown = thing({
  name: 'Rounded snow-loaded crown',
  references: [{ image: crownReference, use: 'crown mass and snow treatment' }],
  identity: ['branch-supported snow clusters', 'irregular gaps'],
});

const tree = thing({
  name: 'Rounded-canopy winter tree',
  basedOn: pine,
  parts: { crown },
});

const clearing = region({
  name: 'Sheltered clearing',
  purpose: ['visual breathing room', 'player movement'],
  width: meters(18, 22),
  keep: ['the middle open'],
});

const oldGrowth = population({
  name: 'Old-growth pines',
  of: tree,
  amount: between(22, 34),
  placement: { around: clearing, pattern: 'loose clusters' },
});

export default scene({
  key: 'blue-winter-grove',
  name: 'Blue Winter Grove',
  profiles: [voxelDiorama],
  experience: { fantasy: 'Enter a sheltered winter grove.', feel: ['quiet', 'cold'] },
  visual: { language: 'rich, dense voxel diorama', density: 'dense' },
  gameplay: { purpose: 'quiet exploration', playerCan: ['inspect the focal pine'] },
  definitions: { pine, crown, tree },
  cast: { clearing, oldGrowth },
  composition: [frames(oldGrowth, clearing)],
  rules: { must: ['keep the clearing open'] },
  acceptance: { review: ['Does the clearing read immediately?'] },
});
```

The exact prose and module boundaries are fixture choices. Named reusable definitions, direct
dependencies, item-level image-reference uses, readable formatting, and the absence of raw technical
authoring vocabulary are requirements.

## Package and dependency boundary

Preferred package name:

```text
@antiky/contracts
```

Required subpath exports, or documented equivalents with the same dependency boundary:

```text
@antiky/contracts/dsl
@antiky/contracts/compiler
@antiky/contracts/ir
@antiky/contracts/catalog
```

Dependency rules:

- `dsl` contains author-facing semantic declarations and pure constructors.
- `compiler` may depend on `dsl`, `catalog`, and `ir`.
- the Antiky runtime may depend on `ir` and consume resolved JSON.
- the runtime must not depend on or execute `dsl` or `compiler`.
- this package must not import the Antiky runtime engine.

One workspace package with strong internal/subpath boundaries is preferred for v0.1.

## Required primary API

Export typed equivalents of:

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
compileContract(input, options)
validateResolvedContract(input, options)
```

Names may vary only when repository conventions require it; document every variation. Do not replace the object-shaped declarations with fluent mutable builders.

### Constructor behavior

- Constructors are pure and do not mutate global registration state.
- Results are deeply readonly authoring records. The implementation must prevent or diagnose mutation in a documented, testable way.
- No author callback becomes runtime gameplay, generation, or validation behavior.
- Ordinary pure TypeScript helpers may construct and return declarations.
- The authoring graph may contain shared definition and reference-image values; normalization must produce plain JSON with no functions, classes, symbols, or unsupported object cycles.
- Semantic fields use narrow types where a stable vocabulary exists and readable strings where intent is subjective.
- TypeScript must reject semantic fields on invalid archetypes and invalid relationship endpoints.

### First-slice semantic types

Implement enough typed fields to express the conceptual fixture and prove these author-facing components:

- `experience`: fantasy, emotional feel, first read, closer read
- `references`: reusable entry-relative image values tagged on scenes and declarations with a stated use
- `visual`: language, lighting, density, silhouettes, detail, and avoided styles
- scene `gameplay`: player-controlled population, purpose, loop, player abilities/verbs, pace, and spatial requirements
- thing `gameplay`: playable identity, gameplay role, and player capabilities appropriate to that thing
- `variation`: what may vary, what identity must survive, and forbidden variation
- `rules`: required and forbidden outcomes
- `acceptance`: human-review questions and at least one structured measurable check

The types may share reusable semantic component interfaces, but each archetype must expose only appropriate fields. At minimum:

- `scene` accepts references, experience, visual, scene gameplay, rules, acceptance, profiles, definitions, cast, and composition.
- `thing` accepts `basedOn`, named parts, references, identity, shape, visual direction, thing gameplay, variation, rules/avoidance, and an optional validated technical override.
- `region` accepts references, purpose, shape/size, named thing features, composition or clearance direction, and rules about what to keep or avoid.
- `population` accepts references, a direct `thing` definition, amount, placement, role, variation, and rules.
- `frames` accepts a population source and region target for Goal 1 and returns a declarative semantic edge.

Do not reproduce all 43 backend component types in the semantic catalog. Backend catalog bindings may be generated for lowerers and advanced validation without becoming ordinary author-facing fields.

### Identity and references

- The scene's short `key` is its stable root identity.
- Keys in `definitions` are stable scoped identities for reusable things; keys in `cast` identify placed regions and populations.
- A definition value passed through `basedOn`, `parts`, region features, `population.of`, `placement.around`, scene `playAs`, acceptance, or `frames(...)` creates a typed reference; authors do not write raw IDs.
- Every referenced definition must be bound exactly once in a keyed owning record for this slice. Reject anonymous, multiply bound, or unreachable definitions with semantic-path diagnostics.
- Reusing the same bound definition object from several declarations resolves to one identity.
- Reject `basedOn` cycles, part cycles, invalid part/feature kinds, and disconnected definitions that no cast or reachable definition uses.
- The compiler expands scoped keys into documented, exact engine-facing IDs without using labels, prose, variable names, object traversal accidents, random UUIDs, or lossy sanitization.
- Renaming a label or TypeScript variable must not change identity. Renaming a keyed binding is an identity change.

### Project profile

Provide one named, versioned `voxelDiorama` profile that deterministically supplies the technical policy needed for a valid resolved scene, including:

- coordinate and unit policy
- root-seed derivation policy
- required catalog/schema versions
- standard technical systems and dependency order
- default render/acceptance policy where the backend schema requires it
- canonical output policy

The profile is inspectable data, not hidden compiler branching. Its name and version appear in provenance and the build manifest. Explicit semantic direction overrides compatible defaults; incompatible directions produce diagnostics rather than an undocumented winner.

## Required lowering behavior

Implement versioned lowerers for the first-slice declarations. The detailed mapping and precedence rules are in [`docs/DSL_DESIGN.md`](docs/DSL_DESIGN.md).

At minimum, compilation must deterministically lower:

- a `scene` into the root scene entity and required top-level contract sections
- `experience` into intent/player-read data and review criteria
- declaration reference uses into validated entry-relative paths, content hashes, intended uses, semantic provenance, and contract-index edges
- `visual` into supported visual-language/detail/forbidden-form records without inventing numeric meaning for subjective prose
- scene and thing `gameplay` into preserved semantic intent, exact `playAs` identity, and spatial/acceptance metadata supported by the v0.1 backend mapping
- a `thing` into one prototype record
- `thing.basedOn` into exact prototype inheritance
- `thing.parts` into an indexed canonical role-to-prototype dependency graph, plus operational grammar only where an exact lowerer exists
- a `region` into one region entity and appropriate bounds/mask or clearance records; preserve and index named feature dependencies
- a `population` into one population entity with prototype mix, quantity, distribution, variation, and role data
- `frames(source, target)` into one valid `composition.frames` technical relationship
- `rules` and `acceptance` into supported validation and human-review records
- `voxelDiorama` into all required technical defaults and system declarations

Do not add an AI or natural-language interpretation step. If a phrase has no deterministic mapping, preserve it as descriptive intent or a human-review question. Do not fabricate thresholds, algorithms, camera vectors, or gameplay implementation from prose.

Every generated technical record must carry derivation evidence in `contract-index.json` or another required Goal 1 output:

- semantic source path
- lowerer name and version
- selected profile and version when applicable
- explicit technical override path when applicable

## Required compiler passes

Keep passes explicit, ordered, independently testable, and represented in the deterministic build manifest.

1. **Load and serialization guard**
   - load a trusted local `.contract.ts` entry or accept an in-memory declaration
   - reject unexpected exports and side-effect-dependent registration
   - reject functions in declaration data, symbols, bigints, non-finite numbers, unsupported class instances, object cycles, and other non-normalizable values
   - resolve reference-image files from the contract entry, reject missing or out-of-project paths, and hash their bytes once without emitting absolute paths
   - report the semantic path of the offending value

2. **Semantic collection and scoped identity**
   - collect the root and all keyed definitions
   - resolve definition-object and reference-image values
   - reject duplicate bindings, key collisions, unbound references, invalid archetype placement, unreachable declarations, and specialization/part cycles
   - assign stable full IDs from documented root and record keys

3. **Profile expansion and conflict analysis**
   - expand named profiles deterministically
   - apply documented precedence
   - reject incompatible explicit directions or profile combinations
   - record profile provenance

4. **Semantic lowering**
   - lower semantic entities, fields, relationships, rules, and acceptance into technical authoring IR
   - retain a source-to-lowered-record map
   - reject unsupported structured semantics rather than silently dropping them

5. **Technical graph resolution**
   - normalize the one-parent ownership tree and flat entity map
   - resolve prototype records and any inheritance present in technical/full-JSON inputs
   - resolve component, relationship, and system references
   - validate system dependencies and calculate deterministic execution order

6. **Schema and catalog validation**
   - validate the top-level result with the supplied scene JSON Schema
   - validate every component payload against the supplied component catalog
   - enforce component entity kinds and relationship endpoint kinds
   - reject unknown required components and unregistered technical overrides

7. **Canonicalization and hashing**
   - document ordering rules
   - sort map keys and semantically unordered ID sets
   - preserve intentionally ordered arrays
   - calculate stable hashes from canonical bytes
   - exclude timestamps, random UUIDs, absolute paths, working-directory values, and host-specific data

8. **Emission**
   - atomically write the required outputs when practical
   - do not emit a misleading resolved contract when blocking diagnostics exist
   - return the same structured result through the CLI and programmatic API

## Full resolved-contract validator

`validateResolvedContract` is not limited to records produced by the semantic slice. It must validate the existing full Blue Winter Grove JSON fixture in place, including:

- top-level JSON Schema
- all catalog component payloads and allowed entity kinds
- one-parent ownership completeness and acyclicity
- prototype references, inheritance, and inheritance cycles
- component-level references needed by the fixture
- relationship endpoints and kind rules
- system IDs, phases, dependencies, and dependency cycles

This preserves compatibility with the detailed technical ECS while the ordinary authoring API becomes smaller.

## Required outputs

Successful compilation emits:

```text
resolved-contract.json
diagnostics.json
contract-index.json
contract.refs.ts
build-manifest.json
```

Follow the normative Goal 1 descriptions in [`docs/COMPILER_OUTPUTS.md`](docs/COMPILER_OUTPUTS.md).

In particular:

- `resolved-contract.json` is canonical engine-facing IR and contains no authoring objects, functions, or unresolved semantic references.
- `diagnostics.json` uses stable codes and includes semantic paths plus technical paths when available.
- `contract-index.json` includes exact IDs, graph indexes, hashes, and semantic-lowering provenance.
- `contract.refs.ts` preserves exact generated IDs in collision-safe ID-keyed maps; it is for implementation/tooling code, not ordinary DSL authoring.
- `build-manifest.json` contains deterministic compiler, input, profile, schema, catalog, lowerer, pass, and output hashes; it contains no timestamp and no hash of itself.

## CLI

Provide repository-conventional commands equivalent to:

```text
antiky-contract compile <entry.contract.ts> --out <directory>
antiky-contract validate <resolved-contract.json>
```

Both commands must call the same programmatic compiler/validator used by tests.

Exit behavior:

- `0` when no blocking diagnostics exist
- non-zero when compilation or validation has at least one error
- a readable console summary
- machine-readable `diagnostics.json` when an output directory is available

## Required fixtures and tests

### Semantic TypeScript fixture

Implement the complete module graph rooted at [`blue-winter-grove.contract.ts`](../../packages/examples/src/blue-winter-grove/blue-winter-grove.contract.ts) so that:

- the scene entry is fewer than 120 physical lines, including imports and comments
- supporting modules remain focused and readable; no fixture source line exceeds 120 characters
- contains scene experience, visual, gameplay, rules, and acceptance
- cites the three project-local Blue Winter Grove scene images and party anchor with distinct intended uses
- tags important definitions, regions, populations, and the scene with item-specific reference uses
- defines a shared character, three character specializations, and one party composed from those characters
- defines named tree parts and reuses at least one part in more than one composite tree
- binds all things through `definitions` and all placed regions/populations through `cast`
- uses direct definition values for `basedOn`, `parts`, region features, `of`, `around`, `playAs`, acceptance, and `frames`
- selects the named project profile
- contains variation and a meaningful composition relationship
- describes a player-controlled party, local gameplay loop, player actions, spatial needs, and human-review questions
- compiles successfully through the public CLI
- no file in the fixture module graph contains direct `component(...)`, `ref(...)`, `defineSystem`, raw catalog component/relationship names, system phases, camera vectors, schema versions, long engine IDs, or explicit output paths

### Existing full JSON fixture

Validate the read-only `docs/asset-contract/blue_winter_grove.scene.json` in place. Do not port it or test its byte-identical copy twice.

### Type-level tests

Prove compile-time rejection for representative mistakes:

- attaching scene-only gameplay fields such as `loop`, `pace`, or `playAs` to a `thing`
- passing a population to `thing.basedOn` or a region to a named `parts` slot
- passing a thing to scene `playAs` instead of a placed population
- passing a `region` to `population.of`
- reversing the Goal 1 `frames(population, region)` endpoints
- using an unsupported density enum or malformed range/unit
- adding raw backend component names to the primary declaration shape

### Runtime invalid fixtures

Include focused cases for:

- duplicate or multiply bound scoped identity
- unbound and unreachable definition values
- reference to a definition outside the scene declaration graph
- specialization and part dependency cycles
- conflicting profile and explicit direction
- unsupported semantic data that would otherwise be dropped
- invalid technical override payload or entity kind
- relationship endpoint mismatch
- non-serializable value, object cycle, and non-finite number
- ownership error, unresolved prototype, and prototype inheritance cycle in resolved/full-JSON validation
- unresolved system dependency and system dependency cycle in resolved/full-JSON validation

### Determinism and provenance tests

- compile the same semantic module twice and compare every emitted byte
- change author prose that is preserved in IR and prove the appropriate hashes change
- rename a local TypeScript variable or display `name` and prove stable IDs do not change
- rename a `definitions` or `cast` key and prove the identity change is visible
- reuse one part definition in two composites and prove both edges retain one exact target identity
- prove each lowered record has source/lowerer/profile provenance
- prove no output contains an absolute machine path, timestamp, random UUID, or environment-dependent value

## Acceptance criteria

The implementation report must mark every criterion **PASS**, **FAIL**, or **NOT RUN** and cite evidence.

| ID | Criterion |
|---|---|
| AC-01 | `packages/contracts/` builds in an experiment-local npm workspace under strict TypeScript settings. |
| AC-02 | The primary API, CLI, and required subpath boundaries are available and documented. |
| AC-03 | The Blue Winter Grove module graph is valid TypeScript; its readable scene entry is under 120 physical lines, no fixture line exceeds 120 characters, and no fixture module contains forbidden raw technical vocabulary. |
| AC-04 | Constructors are pure, immutable declarations with no global registry or embedded runtime callbacks. |
| AC-05 | Type-level tests reject invalid archetype fields, specialization/part/feature/playable reference kinds, relationship endpoints, enum values, ranges, and raw backend fields. |
| AC-06 | Root, `definitions`, and `cast` record keys produce documented, stable scoped IDs; display-name and variable renames do not change them. |
| AC-07 | Direct definition values resolve losslessly; specialization and named-part graphs remain acyclic and indexed; duplicate bindings, unbound refs, unreachable definitions, and identity collisions are rejected with semantic paths. |
| AC-08 | The named versioned profile expands deterministically, appears in provenance, and reports conflicts instead of silently overriding incompatible direction. |
| AC-09 | Experience, item-level reference uses, visual direction, scene/thing gameplay, thing specialization/parts, region features, population, variation, rules, and acceptance lower or remain visibly preserved without silently dropping supported intent. |
| AC-10 | `frames(population, region)` lowers into a valid typed technical relationship with exact endpoints and provenance. |
| AC-11 | Subjective prose is preserved as intent or review criteria; no AI resolver or undocumented prose-to-number/algorithm inference runs during compilation. |
| AC-12 | The lowered contract passes top-level schema, component-payload, entity-kind, reference, relationship-kind, ownership, prototype, and system-DAG validation. |
| AC-13 | The full supplied Blue Winter Grove JSON passes the same resolved-contract validator without modifying or copying the fixture. |
| AC-14 | Serialization failures, unsupported semantics, invalid overrides, graph errors, and profile conflicts produce stable blocking diagnostics with useful semantic paths. |
| AC-15 | Identical inputs and referenced-image bytes produce byte-identical outputs and hashes; outputs contain no time, random, absolute-path, or host-specific data. |
| AC-16 | Successful compilation emits all five required files; blocking failure does not emit a misleading resolved contract. |
| AC-17 | Every lowered technical record traces to a semantic source, a lowerer version, a profile version, or an explicit override. |
| AC-18 | Generated `contract.refs.ts` type-checks and preserves exact engine-facing IDs without alias collisions. |
| AC-19 | Unit, type-level, integration, resolved-fixture, CLI, golden, provenance, and determinism tests pass with repository-standard commands. |
| AC-20 | The package does not import the Antiky runtime; an engine consumer can use IR without importing the DSL loader or compiler. |
| AC-21 | Package documentation explains semantic authoring, profiles, compile/validate commands, outputs, diagnostics, advanced overrides, and the trusted-TypeScript boundary. |
| AC-22 | The earlier raw ECS API is absent from the primary example and ordinary API docs; any retained core API is explicitly internal or advanced. |

## Explicitly out of scope

- `game`, `world`, or `scenario` constructors
- narrative and audio semantic components
- relationship helpers other than `frames`
- a public raw component/system/catalog authoring API
- general custom component authoring beyond one validated technical-override path
- arbitrary user-defined project profiles
- AST source maps beyond semantic paths already known to builders/loaders
- runtime gameplay logic, controls, UI, inventory, combat, or simulation
- voxel, terrain, population, render, or image generation
- visual metric implementations
- artifact requirements, receipts, work-item generation, or vendor adapters
- source-code trace scanning or a graph UI
- editing commands, preview-world promotion, or engine integration
- converting the full detailed Blue Winter Grove JSON to TypeScript
- migrating the older Quiet Canal Market fixture

Add extension interfaces only where the implemented slice calls them. Do not add speculative framework layers for deferred goals.

## Implementation constraints

- Follow existing repository tooling and conventions.
- Prefer a small schema validator and deterministic serializer over a large framework.
- Derive technical catalog knowledge from the supplied catalog; do not hand-maintain a second list of all backend component or relationship names.
- Do not weaken schemas, silently coerce invalid data, silently discard declarations, or fabricate technical meaning from prose.
- Use `unknown` at untrusted JSON boundaries and validate/narrow it; avoid `any` as an escape hatch.
- Keep generated files marked and reproducible.
- Add comments for non-obvious identity, precedence, canonicalization, merge, and hashing behavior.
- Preserve all source fixtures unchanged.

## Definition of done

Goal 1 is complete only when:

1. all 22 acceptance criteria have evidence-backed statuses
2. build, typecheck, lint, unit, integration, resolved-fixture, CLI, provenance, and determinism checks pass
3. the complete semantic fixture module graph compiles through the CLI and meets its readability, composition, reference-tag, and vocabulary constraints
4. the full supplied JSON fixture validates in place
5. repeated compilation proves byte-identical output
6. package documentation explains how to author, compile, validate, inspect provenance, and use the technical escape hatch
7. the final implementation report lists changed files, commands/results, deviations, risks, and deliberately deferred follow-up

If a criterion cannot be met, do not redefine it. Report the blocker and leave the package coherent and testable.
