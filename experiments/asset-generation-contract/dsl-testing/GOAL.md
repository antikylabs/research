# Goal 1: Implement the Antiky Scene Contract DSL and Deterministic Compiler v0.1

## Agent mission

Implement one bounded vertical slice of the Antiky contract architecture: a separate TypeScript package that lets humans and agents author a generative scene contract compositionally and compile it into deterministic, validated JSON IR compatible with the supplied Antiky scene schema and component catalog.

Do not implement the Antiky engine, voxel generation, gameplay logic, prompt generation, artifact receipts, or the full Blue Winter Grove scene in TypeScript.

## Start here

Run this goal from the `research` repository. The implementation target is exactly:

```text
experiments/asset-generation-contract/packages/contracts/
```

From this handoff directory, that target is `../packages/contracts/`. Do not implement this goal in the separate `antiky` repository.

All paths below are relative to this handoff directory. Read these files before changing code:

1. `AGENTS.md`
2. `README.md`
3. `docs/DSL_DESIGN.md`
4. `docs/COMPILER_OUTPUTS.md`, especially the “Goal 1 outputs” section
5. `docs/RESEARCH_NOTES.md`
6. [`../asset-contract/SPEC_DESIGN.md`](../asset-contract/SPEC_DESIGN.md)
7. [`../asset-contract/schemas/generative-scene-contract.schema.json`](../asset-contract/schemas/generative-scene-contract.schema.json)
8. [`../asset-contract/schemas/component-catalog.json`](../asset-contract/schemas/component-catalog.json)
9. [`../asset-contract/blue_winter_grove.scene.json`](../asset-contract/blue_winter_grove.scene.json)
10. `examples/blue-winter-grove.contract.ts`

Before implementation, inspect package, TypeScript, and test conventions in the other `research/experiments/` workspaces. The `asset-generation-contract` experiment does not yet have workspace metadata. Create only the minimal npm workspace files required under `experiments/asset-generation-contract/`, with `packages/*` as the workspace pattern, and keep the package implementation under `packages/contracts/`.

Use the source fixtures directly from [`../asset-contract/`](../asset-contract/) and treat them as read-only. Resolve fixture paths from stable module or package locations, not the current working directory or an absolute machine path. Do not copy the fixtures into `packages/contracts/` and do not modify them.

## Desired outcome

A developer can author a small scene contract in TypeScript using imports and reusable definitions, run one compile command, and receive:

```text
resolved-contract.json
diagnostics.json
contract-index.json
contract.refs.ts
build-manifest.json
```

The resolved contract must contain no functions, unresolved prototype inheritance, duplicate identities, broken references, invalid component payloads, or cyclic system dependencies. Recompiling identical inputs must produce byte-identical deterministic files, except for explicitly non-deterministic console output that is not stored in the build directory.

## Package boundary

Create the package at this exact path relative to the experiment root:

```text
packages/contracts/
```

Preferred package name:

```text
@antiky/contracts
```

Preferred subpath exports:

```text
@antiky/contracts/dsl
@antiky/contracts/ir
@antiky/contracts/catalog
@antiky/contracts/compiler
```

Use these dependency rules:

- the Antiky runtime may depend on IR types
- the runtime must not depend on the DSL loader or compiler
- the DSL and compiler may depend on the catalog and IR types
- the package must not import the runtime engine

Workspace-level `package.json`, lockfile, and shared TypeScript configuration may be added at `experiments/asset-generation-contract/` when required. Do not place implementation code outside `packages/contracts/`.

## Required public authoring API

Provide equivalent typed APIs; exact overloads and file organization may follow repository conventions.

```ts
defineSceneContract(input)
definePrototype(input)
defineEntity(input, children?)
defineRelationship(input)
defineSystem(input)
defineComponentType(input)
component(typeOrDefinition, payload)
ref(idOrDefinition)
compileSceneContract(input, options)
validateResolvedSceneContract(input, options)
```

### Behavioral expectations

- Builders are declarative and return authoring records; they do not mutate global state.
- `defineEntity` accepts nested children so parent links and the ownership tree do not need to be duplicated by authors.
- `ref(definition)` resolves to the definition's stable ID. Raw stable IDs remain available as an escape hatch.
- Built-in component names and relationship types are typed string-literal unions generated from or derived from the supplied catalog.
- Built-in component payloads provide useful compile-time typing from the supplied schemas. At minimum, tests must prove compile-time rejection for representative closed-schema mistakes in:
  - `description.intent`
  - `style.visualLanguage`
  - `population.prototypeMix`
- Runtime compiler validation remains mandatory even when TypeScript typing succeeds.
- `defineComponentType` supports a namespaced, versioned, schema-backed custom component and returns a typed component factory or equivalent definition object.
- Every builder output is JSON-serializable after normalization.

Do not create a specialized helper for every one of the 43 component types by hand. Prefer generated catalog bindings or one generic typed component factory.

## Required compiler passes

Implement the following passes with structured diagnostics:

1. **Load and collect**
   - load the trusted local TypeScript authoring entry or accept an in-memory authoring model
   - register the built-in catalog and custom components
   - reject duplicate definition IDs

2. **Serialization guard**
   - reject functions, symbols, bigints, cyclic objects, class instances that do not lower to plain JSON, and non-finite numbers
   - report a diagnostic path to the offending value

3. **Ownership normalization**
   - flatten nested entities into the IR `entities` map
   - emit the one-parent `entityTree`
   - assign parent IDs from nesting
   - reject multiple parents, missing parents, cycles, duplicate tree membership, or a root that is not a scene entity

4. **Prototype resolution**
   - resolve `extends`
   - reject missing parents and inheritance cycles
   - apply the catalog's declared inheritance/merge policy where available
   - emit fully resolved prototype components
   - omit unresolved `extends` from resolved IR, while preserving provenance in the index or build manifest

5. **Reference resolution**
   - validate prototype references
   - validate component-level references needed by the supplied fixture, including population prototype references
   - validate relationship source and target or target selector shape
   - validate system dependencies
   - make the resolver extensible rather than hard-coding only one example ID

6. **Schema and catalog validation**
   - validate the top-level container with [`../asset-contract/schemas/generative-scene-contract.schema.json`](../asset-contract/schemas/generative-scene-contract.schema.json)
   - validate every component payload with its registered component schema from [`../asset-contract/schemas/component-catalog.json`](../asset-contract/schemas/component-catalog.json)
   - validate component allowed entity kinds
   - validate relationship source and target kinds against the relationship catalog
   - reject unknown required components
   - preserve unknown optional custom components only when registered and valid

7. **System graph validation**
   - validate unique system IDs and resolvable dependencies
   - reject dependency cycles
   - preserve declared system order when it is valid, while recording or exposing a deterministic topological order

8. **Canonicalization and hashing**
   - use explicit, documented ordering rules
   - sort map keys and unordered ID sets deterministically
   - preserve arrays whose order is semantically meaningful, such as system declarations and acceptance views
   - normalize defaults required by the schema/compiler
   - calculate stable hashes from canonical content
   - do not place wall-clock timestamps, random UUIDs, absolute machine paths, or environment-specific values in deterministic outputs

9. **Emission**
   - write the five required outputs atomically when practical
   - do not write partial resolved output when blocking diagnostics exist
   - return the same structured result from the programmatic API that the CLI uses

## Required output files

### `resolved-contract.json`

Canonical engine-facing JSON IR with:

- all required top-level sections
- flattened entity map and complete ownership tree
- resolved prototype components
- normalized references and defaults
- no executable values
- compiler/schema version fields and stable hashes where appropriate

### `diagnostics.json`

A stable array of records equivalent to:

```ts
interface Diagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  path?: string;
  contractId?: string;
  hint?: string;
  related?: Array<{ path?: string; contractId?: string; message: string }>;
}
```

Diagnostics should be useful to both humans and coding agents. Use stable error codes and actionable hints.

### `contract-index.json`

An ID-keyed navigation index containing, at minimum:

- record ID and kind
- parent ID when applicable
- prototype ancestry when applicable
- component type list
- outgoing and incoming relationship IDs
- systems that read or write matching component types when derivable
- canonical record hash

Source file/line mapping is desirable but not required in Goal 1 unless the chosen loader already exposes it reliably.

### `contract.refs.ts`

A generated TypeScript module with lossless ID-keyed references. Do not rely only on sanitized property names because sanitization can collide.

An acceptable shape is:

```ts
export const refs = {
  entities: {
    'scene.blue-winter-grove': contractRef<'scene'>('scene.blue-winter-grove'),
  },
  prototypes: {
    'prototype.tree.snow-pine.mature': contractRef<'prototype'>(
      'prototype.tree.snow-pine.mature',
    ),
  },
  relationships: {},
  systems: {},
} as const;
```

The generated module must type-check and preserve the exact IDs.

### `build-manifest.json`

Include only deterministic build facts:

- compiler version
- schema version
- catalog version and hash
- authoring input hash
- resolved contract hash
- hashes for the other four deterministic outputs: `resolved-contract.json`, `diagnostics.json`, `contract-index.json`, and `contract.refs.ts`
- ordered compiler passes and their versions
- warnings count and blocking error count

The manifest must not contain a hash of itself. If a caller needs the manifest's hash, it calculates that hash after emission and stores it outside the manifest. Do not include a timestamp in the deterministic manifest. A separate human-facing log may include timing and timestamps.

## CLI

Provide repository-conventional commands equivalent to:

```text
antiky-contract compile <entry.contract.ts> --out <directory>
antiky-contract validate <resolved-contract.json>
```

The exact binary name may change to fit the repo. Both CLI paths must call the same programmatic compiler/validator used by tests.

Expected exit behavior:

- `0` when no blocking diagnostics exist
- non-zero when compilation or validation has one or more errors
- readable console summary plus machine-readable `diagnostics.json` when an output directory is available

## Required fixtures

### Minimal TypeScript authoring fixture

Create a compileable fixture based on `examples/blue-winter-grove.contract.ts`. It must exercise:

- scene root and nested groups
- one base prototype and one extending mature-pine prototype
- one population referencing the mature-pine prototype
- one typed relationship
- one system with declared reads, writes, and dependencies
- one camera
- validation and outputs sections
- at least one custom namespaced component

It should be small enough to understand in one screen or a few short files. Do not port the entire detailed scene.

### Existing full JSON validation fixture

Use the supplied [`../asset-contract/blue_winter_grove.scene.json`](../asset-contract/blue_winter_grove.scene.json) in place as a read-only integration fixture. The validator must accept it and reproduce the integrity guarantees already described in the supplied [`VALIDATION_REPORT.md`](../asset-contract/VALIDATION_REPORT.md).

The identical file under [`../asset-contract/examples/`](../asset-contract/examples/) need not be tested twice.

### Invalid fixtures

Include focused invalid cases for:

- duplicate entity ID
- entity with multiple parents or duplicate tree membership
- missing parent
- ownership cycle
- unresolved prototype
- prototype inheritance cycle
- invalid built-in component payload
- component attached to a disallowed entity kind
- unresolved relationship endpoint
- relationship source/target kind mismatch
- unresolved system dependency
- system dependency cycle
- non-serializable authoring value
- non-finite number

## Acceptance criteria

Report each criterion as **PASS**, **FAIL**, or **NOT RUN** in the final implementation summary.

| ID | Criterion |
|---|---|
| AC-01 | `experiments/asset-generation-contract/packages/contracts/` builds under the experiment-local npm workspace's strict TypeScript configuration. |
| AC-02 | The required public APIs and subpath exports, or documented equivalents, are available. |
| AC-03 | Builder results are declarative; non-serializable values produce blocking diagnostics with useful paths. |
| AC-04 | Nested authoring entities compile into a complete one-parent ownership tree and matching flat entity map. |
| AC-05 | Duplicate IDs, missing parents, multiple parents, duplicate tree membership, and ownership cycles are rejected. |
| AC-06 | The full supplied Blue Winter Grove JSON passes top-level schema, catalog payload, reference, ownership, prototype, and system-DAG validation. |
| AC-07 | Built-in component names and relationship types autocomplete as literal unions, and representative payload mistakes fail TypeScript tests. |
| AC-08 | A registered custom namespaced component is typed, runtime validated, preserved in IR, and rejected on invalid payload. |
| AC-09 | Prototype inheritance resolves according to documented merge policies, and resolved IR has no unresolved inheritance. |
| AC-10 | Missing prototype parents and inheritance cycles produce stable blocking diagnostics. |
| AC-11 | Population prototype references, relationship endpoints, and system dependencies are validated. |
| AC-12 | Component allowed-entity-kind and relationship source/target-kind rules are enforced. |
| AC-13 | System dependency cycles are rejected and a deterministic valid execution order is available. |
| AC-14 | Compiling identical inputs twice produces byte-identical deterministic outputs and identical hashes. |
| AC-15 | Successful compilation emits all five required files; blocking failure does not emit a misleading resolved contract. |
| AC-16 | Generated `contract.refs.ts` type-checks and preserves exact IDs without alias collisions. |
| AC-17 | The minimal TypeScript Blue Winter Grove fixture compiles successfully and exercises every required fixture feature. |
| AC-18 | Unit, integration, type-level, and golden/determinism tests pass using repository-standard commands. |
| AC-19 | The contracts package does not import the Antiky runtime engine, and the runtime does not need the DSL/compiler to consume IR. |
| AC-20 | Package-level README documents authoring, compile, validate, output files, and the trust boundary for TypeScript modules. |

## Explicitly out of scope

Do not implement any of the following in this goal:

- voxel geometry or model generation
- terrain or population generation
- renderer, camera execution, or image output
- visual metric implementations
- Antiky runtime ECS or game loop
- gameplay logic, controls, inventory, combat, or scenarios
- `defineGame`, `defineWorld`, or `defineScenario`
- automatic artifact existence detection or artifact receipts
- missing-artifact prompt generation
- vendor-specific Codex, Claude Code, or OpenCode orchestration
- source-code trace scanning
- editor UI or graph visualization
- command/event editing or preview-world promotion
- conversion of the entire detailed Blue Winter Grove JSON into TypeScript
- modernization of the compact Quiet Canal Market fixture

Create clean extension points where practical, but do not add speculative abstractions solely for deferred features.

## Implementation constraints

- Prefer existing repository dependencies and conventions.
- Do not add a large framework when a small schema validator and deterministic serializer are sufficient.
- Do not hand-maintain duplicate lists of all component and relationship names when they can be generated from the catalog.
- Do not silently coerce invalid data merely to make fixtures pass.
- Do not weaken the supplied schemas.
- Keep generated files clearly marked and reproducible.
- Preserve the supplied reference files unchanged.
- Avoid `any`; where untyped JSON must enter, use `unknown` and validate/narrow it.
- Add comments for non-obvious canonicalization, merge, and hash behavior.

## Definition of done

The goal is complete only when:

1. all acceptance criteria are reported
2. repository-standard build, lint, test, and typecheck commands pass
3. the minimal TypeScript fixture compiles through the CLI
4. the full supplied JSON fixture validates
5. deterministic outputs are demonstrated by an automated test
6. package documentation explains how to run and extend the implementation
7. the final agent response lists changed files, commands run, test results, deviations, and any intentionally deferred follow-up

If a criterion cannot be met, do not redefine it as complete. Report the exact blocker and leave the repository in a coherent, testable state.
