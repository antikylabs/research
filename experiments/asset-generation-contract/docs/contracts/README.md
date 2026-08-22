# `@antiky/contracts`

> This Goal 1 package summary is retained with the implementation report. For current tutorials,
> how-to guides, language explanations, and scan-friendly API reference, start with the
> [usage documentation](../usage-docs/README.md).

`@antiky/contracts` is the Goal 1 semantic scene-contract package. Authors describe experience,
visual and gameplay direction, reusable things, placed regions and populations, relationships,
variation, rules, references, and acceptance in declarative TypeScript. The compiler lowers that
authoring graph deterministically into validated, canonical engine-facing data.

The ordinary API is a semantic DSL. Raw ECS component, reference, relationship, and system
construction is intentionally not an authoring path.

## Smallest scene

```ts
import {
  between,
  frames,
  population,
  region,
  scene,
  thing,
} from '@antiky/contracts/dsl';

const pine = thing({
  name: 'Mature snow pine',
  identity: ['tall and old', 'visible branch structure'],
  variation: {
    vary: ['height', 'lean', 'snow load'],
    preserve: ['mature proportions'],
  },
});

const clearing = region({
  name: 'Sheltered clearing',
  purpose: ['visual breathing room', 'player movement'],
  shape: 'irregular oval',
});

const oldGrowth = population({
  name: 'Old-growth pines',
  of: pine,
  amount: between(22, 34),
  placement: { around: clearing, pattern: 'loose clusters' },
});

export default scene({
  key: 'blue-winter-grove',
  name: 'Blue Winter Grove',
  experience: { fantasy: 'Enter a quiet, sheltered winter grove.' },
  visual: { language: 'rich, dense voxel diorama', density: 'medium-high' },
  gameplay: { purpose: 'quiet exploration', playerCan: ['inspect the trees'] },
  definitions: { pine },
  cast: { clearing, oldGrowth },
  composition: [frames(oldGrowth, clearing)],
  rules: { avoid: ['uniform scatter'] },
  acceptance: { review: ['Does the clearing read immediately?'] },
});
```

The entry file must end in `.contract.ts`, export only the scene as its default export, and may use
ordinary imports and pure TypeScript helpers. A larger scene can split references, definitions, and
layout into focused modules.

For complete source/output pairs, compare the contracts in
[`packages/examples/src/`](../../packages/examples/src/) with their five generated files in
[`packages/examples/compiled/`](../../packages/examples/compiled/).

## Semantic authoring reference

| Export | Meaning |
| --- | --- |
| `scene(input)` | Owns the root key, profiles, semantic direction, definitions, cast, composition, rules, and acceptance. |
| `thing(input)` | Declares a reusable prototype, specialization, named parts, identity, shape, gameplay role, and variation. |
| `region(input)` | Declares a placed area, its purpose and size, named thing features, and keep/avoid direction. |
| `population(input)` | Places a generated collection of one thing in or around a region. |
| `referenceImage(path)` | Creates a reusable reference to a project-local image. Each declaration supplies its own `use` statement. |
| `frames(population, region, options?)` | Declares the Goal 1 composition relationship. The endpoint kinds are checked by TypeScript and again at runtime. |
| `between(min, max)` | Creates an inclusive finite numeric range and rejects `min > max`. |
| `meters(value)` / `meters(min, max)` | Creates an explicit distance value or range. |
| `voxelDiorama` | Selects the named `voxel-diorama@0.1.0` project profile. |

Constructors clone author-owned containers and return deeply readonly, runtime-frozen declarations.
Passing an already constructed declaration preserves its object identity so it can act as a typed
reference. Constructors do not allocate engine entities, mutate a registry, or retain callbacks.

### Identity and direct references

The scene key and keyed owning records determine identity:

```text
scene.<scene-key>
prototype.<scene-key>.<definitions-key>
region.<scene-key>.<cast-key>
population.<scene-key>.<cast-key>
rel.<scene-key>.frames.<source-cast-key>.<target-cast-key>
```

`scene.definitions` owns reusable things. `scene.cast` owns placed regions and populations. Pass the
declaration value through `basedOn`, `parts`, region `features`, `population.of`, `placement.around`,
scene `playAs`, acceptance checks, and `frames(...)`; do not write an engine ID. A declaration must
have exactly one keyed owner. Invalid keys, duplicate bindings, unbound or unreachable definitions,
wrong endpoint kinds, and specialization or part cycles are blocking diagnostics.

Changing a display name or local TypeScript variable does not change identity. Changing a scene,
definition, or cast key does.

### Reference images

`referenceImage(path)` paths are resolved relative to the `.contract.ts` entry, must remain inside
the configured project root, and must exist. The compiler hashes each distinct file once and keeps
every item-specific use in provenance and the contract index. Absolute filesystem paths are not
emitted.

### Profiles and precedence

`voxelDiorama` is inspectable, immutable data. Omitting `profiles` selects it as the Goal 1 default;
using `profiles: [voxelDiorama]` records an explicit selection. Either route records the selection,
ID, version, expanded policy, and content hash in compiler output. The profile supplies coordinate
and unit policy, deterministic seed policy, schema and catalog versions, ordered technical systems,
validation and render defaults, and the five canonical output names.

Goal 1 supports this one project profile; arbitrary user-defined profiles are deferred. Expansion is
deterministic. Explicit semantic direction is authoritative, the profile fills technical policy, and
a compatible validated technical override may add local detail. Incompatible profiles or explicit
direction produce blocking diagnostics instead of a silent winner.

Profile selection is an installed, exact-identity capability. The ordinary DSL does not export raw
project-profile, system-phase, or project-system construction types. A forged profile value is still
checked against the installed profile contents at runtime.

Subjective prose is preserved as intent or human-review criteria. Compilation does not call an AI or
infer undocumented numbers, algorithms, camera vectors, or runtime behavior from prose.

## Compile a TypeScript contract

Build from the experiment root, then run the package binary:

```sh
npm run build
npm exec -- antiky-contract compile \
  packages/examples/src/blue-winter-grove/blue-winter-grove.contract.ts \
  --out generated/blue-winter-grove
```

The equivalent library entry point is exported from `@antiky/contracts/compiler`:

```ts
import { compileContract } from '@antiky/contracts/compiler';

const result = await compileContract('scene.contract.ts', {
  outputDirectory: 'generated/scene',
  projectRoot: '.',
});

if (!result.ok) {
  for (const diagnostic of result.diagnostics) {
    console.error(diagnostic.code, diagnostic.semanticPath, diagnostic.message);
  }
}
```

`compileContract` also accepts an in-memory `scene(...)` declaration. File-based compilation uses
the input path to resolve imported sources and reference images. For an in-memory declaration,
`entryPath` supplies the equivalent reference-image base. The promise resolves to `{ ok,
diagnostics, files, resolvedContract? }`; `resolvedContract` is absent after a blocking failure. The
CLI and library use the same compiler passes. A successful command exits `0`; blocking diagnostics
produce a non-zero exit code.

## Validate resolved JSON

Validate canonical JSON independently of the TypeScript authoring path:

```sh
npm exec -- antiky-contract validate \
  docs/asset-contract/blue_winter_grove.scene.json
```

The equivalent library API is `validateResolvedContract(input, options)` from
`@antiky/contracts/compiler`. `input` is treated as `unknown` and narrowed only after validation;
the result is `{ valid, diagnostics, systemOrder }`. Validation covers the top-level JSON Schema,
catalog component payloads and allowed entity kinds, ownership completeness and acyclicity,
prototype references and inheritance, component references, relationship kinds and endpoints, and
the system dependency DAG. Schema and catalog IDs, versions, and locators are bound to the supplied
validator inputs; the supplied fixture's relative schema/catalog paths match their canonical file
names without making emitted output depend on a workspace path.

The validator can validate detailed engine-facing JSON that was not produced by the semantic Goal 1
lowerer. Passing the top-level schema alone is not equivalent to passing the resolved-contract
validator.

## Compiler outputs

A successful compile emits exactly five deterministic files:

| File | Contents and consumer |
| --- | --- |
| `resolved-contract.json` | Canonical engine-facing IR with resolved IDs, profile policy, entities, ownership, relationships, systems, validation, and preserved semantic intent. It contains no authoring objects or executable values. |
| `diagnostics.json` | Deterministically ordered diagnostics for CI, tools, and authors. Version 0.1.0 emits only blocking errors, so a successful compile contains an empty array. |
| `contract-index.json` | Exact ID, dependency, relationship, image-use, hash, and semantic-to-technical provenance indexes. It is derived and can be regenerated. |
| `contract.refs.ts` | Generated, collision-safe ID-keyed maps of exact entity, prototype, relationship, and system references for implementation code. Ordinary DSL modules do not import it. |
| `build-manifest.json` | Compiler, input, image, profile, schema, catalog, lowerer, pass, resolved-IR, and output hashes plus diagnostic counts. It has no timestamp and does not hash itself. |

Objects use deterministic key order; intentionally ordered author arrays retain their order. Output
uses UTF-8, LF endings, and a final newline. Generated JSON hashes use canonical bytes; source and
reference-image hashes use original input bytes. The compiler does not inject timestamps, random
UUIDs, absolute filesystem paths, current-working-directory values, or host-specific data. Authored
strings are preserved.

If compilation has a blocking diagnostic, it does not emit a misleading
`resolved-contract.json`. When an output directory is available, machine-readable diagnostics remain
available for repair.

Compiler outputs describe the contract. They do not prove that assets, renders, gameplay code, or
other downstream artifacts exist.

## Diagnostics

A diagnostic has this public shape:

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

Use `semanticPath` first when repairing authoring input, for example
`$.cast.oldGrowth.placement.around`. `technicalPath` identifies a lowered JSON location when one is
available. Codes and ordering are stable for machine use; messages and hints explain the repair.
Errors are blocking. Warnings and information are not.

## Advanced: validated technical override

Use a technical override only when a real requirement cannot be expressed by the semantic DSL. It
is available locally on `thing`, `region`, and `population` declarations:

```ts
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

This is an advanced backend boundary, not an alternative ordinary authoring API. Each component name
must be registered in the supplied catalog, its payload must pass that component's schema, and the
component must allow the declaration's lowered entity kind. The override cannot add systems or
bypass resolved-contract validation. Its semantic source path and schema/lowerer provenance appear
in the contract index. An unknown, malformed, wrong-kind, or conflicting override is blocking.

## Trusted-TypeScript boundary

A `.contract.ts` entry is trusted repository build code. Importing it can execute arbitrary
module-level TypeScript/JavaScript before the compiler validates its default export. Deep freezing
the returned declaration does not sandbox module execution.

- Do not compile network-supplied or user-uploaded TypeScript.
- Run compilation with repository build privileges, not engine/runtime privileges.
- Keep authoring modules declarative and free of side effects.
- Treat JSON and other external data as untrusted `unknown` input.
- Never pass authoring modules, functions, or compiler objects into the engine.

An untrusted-code sandbox is outside Goal 1.

## Package subpaths and dependency boundary

| Subpath | Public role | May depend on |
| --- | --- | --- |
| `@antiky/contracts/dsl` | Semantic types, pure constructors, units, relationships, and `voxelDiorama`. | Authoring-only utilities; not the compiler or engine. |
| `@antiky/contracts/compiler` | Trusted module loading, semantic collection, profile expansion, lowering, technical validation, canonicalization, hashing, emission, and CLI behavior. | `dsl`, `catalog`, `ir`, and internal technical code. |
| `@antiky/contracts/ir` | Portable resolved-contract types and exact branded contract references for engine/tool consumers. | No TypeScript loader or compiler dependency. |
| `@antiky/contracts/catalog` | Supplied schema/catalog loading, merge policy, and technical validator support. | Technical schema and IR support. |

The Antiky runtime may consume canonical JSON and import `@antiky/contracts/ir`. It must not import or
execute `@antiky/contracts/dsl` or `@antiky/contracts/compiler`. This package does not import the
Antiky runtime.

The catalog subpath exposes backend validation support; it does not promote raw component,
relationship, or system builders into the normal scene-authoring language. Its lower-level resolved
validator returns `{ ok, errors, systemOrder }`; the compiler subpath adapts those errors to the
public `{ valid, diagnostics, systemOrder }` compiler result.
