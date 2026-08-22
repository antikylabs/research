---
status: current
type: reference
audience: package consumers and repository agents
applies-to: "@antiky/contracts@0.1.0"
---

# Package subpaths

`@antiky/contracts@0.1.0` is a private workspace package, requires Node.js 22 or later, and exposes ESM subpath exports.
It has no root `@antiky/contracts` export. Import one of the four declared subpaths.

| Subpath | Public role |
| --- | --- |
| `@antiky/contracts/dsl` | Semantic scene authoring values, constructors, and types |
| `@antiky/contracts/compiler` | Trusted TypeScript compilation and public resolved-contract validation |
| `@antiky/contracts/ir` | Portable technical contract types and branded exact IDs |
| `@antiky/contracts/catalog` | Installed schema/catalog access, component merge policy, and lower-level validation |

The package also installs the `antiky-contract` binary. Internal source and `dist` paths are not package exports.

## `@antiky/contracts/dsl`

### Values

```text
between
frames
meters
population
referenceImage
region
scene
thing
voxelDiorama
```

### Types

```text
AcceptanceDirection
CastDefinition
DeepReadonly
Definition
DslValue
ExperienceDirection
FramesOptions
FramesRelationship
JsonObject
JsonPrimitive
JsonValue
Meters
NumericRange
PlacementDirection
PopulationCountCheck
PopulationDefinition
PopulationInput
Range
ReferenceImage
ReferenceUse
RegionDefinition
RegionInput
RulesDirection
SceneDefinition
SceneGameplayDirection
SceneInput
TechnicalOverride
ThingDefinition
ThingGameplayDirection
ThingInput
ThingShapeDirection
VariationDirection
VisualDensity
VisualDirection
```

The DSL does not export raw profile, system, component, engine entity, game, world, scenario, or artifact-generator
builders. See the [field-level DSL reference](dsl.md).

## `@antiky/contracts/compiler`

### Values

```ts
compileContract(
  input: string | SceneDefinition,
  options?: CompileContractOptions,
): Promise<CompilationResult>

validateResolvedContract(
  input: unknown,
  options?: ValidateResolvedContractOptions,
): Promise<ContractValidationResult>
```

### Types

```text
CompilationResult
CompileContractOptions
ContractValidationResult
Diagnostic
DiagnosticLocation
DiagnosticSeverity
ValidateResolvedContractOptions
```

The compiler subpath does not export internal collectors, lowerers, canonicalizers, emitters, profile expanders, or
diagnostic helper functions. See the [compiler reference](compiler.md).

## `@antiky/contracts/ir`

### Values

```ts
contractRef<Kind extends string = string>(value: string): ContractRef<Kind>
isContractId(value: unknown): value is string
```

`contractRef` preserves the runtime string and adds a compile-time kind brand. It rejects values shorter than three
characters or values that do not match `^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$`. `isContractId` applies the same runtime test.

### Types

```text
ComponentMap
ContractImport
ContractMetadata
ContractRef
CoordinateSystem
DeterminismPolicy
EntityKind
EntityTreeNode
JsonObject
JsonPrimitive
JsonValue
ResolvedContract
ResolvedDefinitions
ResolvedEntity
ResolvedPrototype
ResolvedRelationship
ResolvedSystem
SystemPhase
```

`EntityKind` is:

```text
abstract | camera | composition-anchor | environment | group | population |
region | scene | terrain | validation-target
```

`SystemPhase` is:

```text
composition | detail | layout | population | publish | render | resolve |
surface | synthesis | terrain | validate
```

The IR subpath contains no TypeScript loader or compiler dependency. Its shapes are summarized in the
[output reference](outputs.md).

## `@antiky/contracts/catalog`

### Values

```ts
contractSchemaUrl(): URL
componentCatalogUrl(): URL
loadContractSchema(): JsonSchema
loadComponentCatalog(): ComponentCatalog

getComponentMergePolicy(
  componentType: string,
  catalog?: ComponentCatalog,
): ComponentMergePolicy | undefined

mergeComponentPayload(
  componentType: string,
  parent: JsonObject,
  child: JsonObject,
  catalog?: ComponentCatalog,
): JsonObject

validateResolvedContract(
  input: unknown,
  options?: ValidateResolvedContractOptions,
): ResolvedContractValidationResult
```

The two loaders return cached, deeply frozen installed JSON data. The merge helpers default to the installed catalog and
do not mutate either payload. `ComponentMergePolicy` is `append-unique`, `deep-merge`, `non-inheritable`, or `replace`.
An unknown component passed to `mergeComponentPayload` throws `TypeError`.

The catalog validator is synchronous. Its result is:

```ts
interface ResolvedContractValidationResult {
  readonly errors: readonly ResolvedContractValidationError[];
  readonly ok: boolean;
  readonly systemOrder: readonly string[];
}
```

The compiler subpath wraps this result in an asynchronous `{ valid, diagnostics, systemOrder }` API.

### Types

```text
CatalogComponentAuthoring
CatalogComponentType
CatalogRelationshipType
ComponentCatalog
ComponentMergePolicy
JsonSchema
ResolvedContractErrorCode
ResolvedContractValidationError
ResolvedContractValidationResult
ValidateResolvedContractOptions
```

Catalog access supports backend validation and tooling. It does not make raw components or systems the normal semantic
authoring API.

## Binary

```text
antiky-contract compile <entry.contract.ts> --out <directory>
antiky-contract validate <resolved-contract.json>
```

See the [compiler reference](compiler.md#cli) for exit behavior.

## Dependency boundary

| Consumer | Supported dependency |
| --- | --- |
| Semantic authoring modules | `@antiky/contracts/dsl` |
| Build and CI tools | `@antiky/contracts/compiler`; optionally `catalog` and `ir` |
| Engine/runtime code | Canonical JSON and `@antiky/contracts/ir` |
| Backend schema/catalog tools | `@antiky/contracts/catalog` and `ir` |

Engine code must not load semantic `.contract.ts` modules or depend on the compiler. The contracts package does not
import an Antiky runtime. There is no `@antiky/contracts/trace` subpath and no root export.
