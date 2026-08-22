---
status: current
type: reference
audience: contract authors, editor integrations, and CI maintainers
applies-to: "@antiky/contracts@0.1.0"
---

# Diagnostic reference

Compiler diagnostics use one public shape for semantic compilation and adapted resolved-contract validation errors.

## Shape

```ts
type DiagnosticSeverity = 'error' | 'warning' | 'info';

interface DiagnosticLocation {
  readonly semanticPath?: string;
  readonly technicalPath?: string;
  readonly contractId?: string;
  readonly message?: string;
}

interface Diagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly semanticPath?: string;
  readonly technicalPath?: string;
  readonly contractId?: string;
  readonly hint?: string;
  readonly related?: readonly DiagnosticLocation[];
}
```

| Field | Meaning |
| --- | --- |
| `code` | Package-defined `DSL_*` or `CONTRACT_*` category, or a preserved external error code. |
| `severity` | `error` blocks compilation; `warning` and `info` do not. |
| `message` | Human-readable detail for this occurrence. |
| `semanticPath` | Path in the authored scene graph. Prefer this when changing DSL source. |
| `technicalPath` | Path in the resolved contract. Common on backend validation errors. |
| `contractId` | Stable ID of the involved record. |
| `hint` | Optional repair direction. |
| `related` | Other locations involved in a collision, cycle, reference, or conflict. |

Diagnostics are sorted by severity (`error`, `warning`, `info`), then semantic path, technical path, contract ID, code,
message, hint, and related evidence. Missing locations sort after present locations. Repeated diagnostics are retained.

## Entry loading and compilation

| Code | Condition |
| --- | --- |
| `DSL_ENTRY_EXTENSION` | File entry does not end in `.contract.ts`. |
| `DSL_ENTRY_OUTSIDE_PROJECT` | File entry is outside the configured project root. |
| `DSL_ENTRY_MISSING` | File entry does not exist or cannot be statted. |
| `DSL_ENTRY_NOT_FILE` | Entry path exists but is not a regular file. |
| `DSL_ENTRY_EXPORT` | Entry module does not export exactly one value named `default`. |
| `DSL_ENTRY_DEFAULT` | Default export is not a `scene(...)` declaration. |
| `DSL_ENTRY_LOAD_FAILED` | esbuild bundling or module evaluation failed. |
| `DSL_COMPILATION_FAILED` | An otherwise unclassified compiler exception reached the public boundary. |

## Serialization boundary

These codes are most often reachable when static types or constructors are bypassed. Constructors reject most of the
same classes immediately. Array inputs are instead cloned from indexed values, so named or symbol properties are not
preserved and an indexed accessor is read during cloning. The serialization guard diagnoses these shapes only when a
forged array reaches compilation without passing through a constructor.

| Code | Condition |
| --- | --- |
| `DSL_SERIALIZATION_ACCESSOR` | Declaration data has a getter or setter. Accessors are not invoked. |
| `DSL_SERIALIZATION_ARRAY_HOLE` | An array has a sparse slot that JSON would turn into `null`. |
| `DSL_SERIALIZATION_ARRAY_PROPERTY` | An array has a named property that JSON would omit. |
| `DSL_SERIALIZATION_BIGINT` | Declaration data contains a bigint. |
| `DSL_SERIALIZATION_CYCLE` | Plain declaration data contains an arbitrary object cycle. Typed direct references are excluded. |
| `DSL_SERIALIZATION_FUNCTION` | Declaration data contains a runtime function. |
| `DSL_SERIALIZATION_INSPECTION` | A declaration value threw or failed during safe reflection. |
| `DSL_SERIALIZATION_NON_ENUMERABLE` | Declaration data has a non-enumerable property that JSON would omit. |
| `DSL_SERIALIZATION_NON_FINITE_NUMBER` | Declaration data contains `NaN`, positive infinity, or negative infinity. |
| `DSL_SERIALIZATION_SYMBOL` | Declaration data contains a symbol value or symbol-keyed property. |
| `DSL_SERIALIZATION_UNDEFINED` | Declaration data contains `undefined`; omit an optional field instead. |
| `DSL_SERIALIZATION_UNSUPPORTED_PROTOTYPE` | Value is not a plain object, ordinary array, or supported frozen DSL value. |

## Ownership, references, and semantic shape

| Code | Condition |
| --- | --- |
| `DSL_BINDING_RECORD` | `definitions` or `cast` is not a keyed plain-object record. |
| `DSL_BINDING_KIND` | A `definitions` value is not a thing, or a `cast` value is not a region or population. |
| `DSL_DUPLICATE_BINDING` | The same declaration object is owned under more than one key. |
| `DSL_ID_COLLISION` | Two scoped owners or acceptance checks produce the same exact ID. |
| `DSL_INVALID_SCOPED_KEY` | Scene, definition, cast, or acceptance key does not match `^[a-z][a-zA-Z0-9-]*$`. |
| `DSL_INVALID_SEMANTIC_SHAPE` | Required semantic data has the wrong container, primitive, declaration kind, or field shape. |
| `DSL_REFERENCE_KIND` | A direct reference or image use has the wrong declaration/value kind or an empty `use`. |
| `DSL_REFERENCE_UNBOUND` | Referenced thing or region is not owned exactly once in the required scene record. |
| `DSL_REFERENCE_OUTSIDE_SCENE` | Scene-level reference is external, or a target is owned in the wrong scope. |
| `DSL_DECLARATION_UNREACHABLE` | An owned thing cannot be reached from any placed cast declaration. |
| `DSL_DEFINITION_DEPENDENCY_CYCLE` | The combined thing `basedOn` and `parts` graph contains a cycle. |
| `DSL_RELATIONSHIP_ID_COLLISION` | Two `frames` declarations have the same source and target and therefore the same ID. |

## Values, fields, profiles, and lowering

| Code | Condition |
| --- | --- |
| `DSL_RANGE_INVALID` | Range is not a `between(...)` value, has non-finite endpoints, or has `min > max`. |
| `DSL_UNIT_INVALID` | Distance is not a `meters(...)` value or contains invalid range data. |
| `DSL_UNSUPPORTED_SEMANTIC_FIELD` | Declaration or nested direction contains a field outside the current finite language. |
| `DSL_UNSUPPORTED_SEMANTIC_VALUE` | Finite semantic enum has an unsupported value, such as `density: 'dense'`. |
| `DSL_PROFILE_INVALID` | Profile lacks valid identity or one of its required policy containers. |
| `DSL_PROFILE_DUPLICATE` | The same profile identity is selected more than once. |
| `DSL_PROFILE_UNSUPPORTED` | Profile identity is not installed; 0.1.0 supports only `voxel-diorama@0.1.0`. |
| `DSL_PROFILE_CONTENT_MISMATCH` | Profile has an installed identity but its contents differ from the installed frozen value. |
| `DSL_PROFILE_CONFLICT` | Selected profiles supply incompatible values for the same policy path. |
| `DSL_PROFILE_DIRECTION_CONFLICT` | Explicit direction prohibits voxel art while the voxel profile is selected. |
| `DSL_PROFILE_REQUIRED` | No supported profile remains to supply required technical policy. |
| `DSL_TECHNICAL_OVERRIDE_CONFLICT` | Override component type is already produced from semantic direction on the same owner. |
| `DSL_PROTOTYPE_MERGE` | Catalog component inheritance could not merge a based-on prototype. |

## Reference images

| Code | Condition |
| --- | --- |
| `DSL_REFERENCE_ENTRY_REQUIRED` | In-memory scene uses images without an explicit `entryPath`. |
| `DSL_REFERENCE_PATH` | Image path is empty or absolute instead of entry-relative. |
| `DSL_REFERENCE_MISSING` | Image path does not resolve to an existing file. |
| `DSL_REFERENCE_OUTSIDE_PROJECT` | Image path leaves the project root lexically or after resolving symbolic links. |

Image-use kind and non-empty-use failures use `DSL_REFERENCE_KIND`.

## Resolved-contract schema and catalog

These codes come from `@antiky/contracts/catalog`. The compiler validator adapts them to error diagnostics without
changing the code or technical path.

| Code | Condition |
| --- | --- |
| `CONTRACT_SCHEMA_INVALID` | Input fails the top-level resolved-contract JSON Schema. Further graph validation stops. |
| `CONTRACT_SCHEMA_ID` | `$schema` does not match the expected schema reference. |
| `CONTRACT_SCHEMA_VERSION` | `schemaVersion` does not match the expected version. |
| `CONTRACT_CATALOG_IMPORT_MISSING` | Contract has no import matching the loaded catalog ID. |
| `CONTRACT_CATALOG_IMPORT_DUPLICATE` | Loaded catalog ID appears more than once in `imports`. |
| `CONTRACT_CATALOG_IMPORT_REQUIRED` | Matching loaded catalog import is incorrectly marked optional. |
| `CONTRACT_CATALOG_IMPORT_UNRESOLVED` | A non-optional import names a catalog other than the loaded catalog. |
| `CONTRACT_CATALOG_IMPORT_URI` | Matching catalog import URI differs from the expected URI or accepted relative form. |
| `CONTRACT_CATALOG_IMPORT_VERSION` | Matching catalog import version differs from the loaded catalog version. |
| `CONTRACT_COMPONENT_UNKNOWN` | Component type is absent from the loaded catalog. |
| `CONTRACT_COMPONENT_KIND` | Catalog does not allow the component on this entity or prototype kind. |
| `CONTRACT_COMPONENT_SCHEMA` | Component payload fails its catalog JSON Schema. |
| `CONTRACT_PROTOTYPE_INHERITANCE_SCHEMA` | Effective inherited prototype payload fails a component schema after merge. |

## Resolved record maps, prototypes, and references

| Code | Condition |
| --- | --- |
| `CONTRACT_MAP_ID_MISSING` | A keyed technical record lacks a string `id` equal to its map key. |
| `CONTRACT_MAP_ID_MISMATCH` | Technical record `id` differs from its containing map key. |
| `CONTRACT_PROTOTYPE_CYCLE` | Prototype `extends` references contain an inheritance cycle. |
| `CONTRACT_REFERENCE_UNRESOLVED` | Entity, prototype, parent, system, validation suite, or other exact ID does not resolve. |
| `CONTRACT_REFERENCE_KIND` | Resolved entity reference exists but has a disallowed kind for that field. |

## Resolved ownership

| Code | Condition |
| --- | --- |
| `CONTRACT_OWNERSHIP_ROOT` | Entity-tree root declares a parent. |
| `CONTRACT_OWNERSHIP_DUPLICATE` | An entity appears more than once in the ownership tree. |
| `CONTRACT_OWNERSHIP_INCOMPLETE` | An entity map record is absent from the ownership tree. |
| `CONTRACT_OWNERSHIP_PARENT` | Entity `parent` does not agree with its parent in `entityTree`. |
| `CONTRACT_OWNERSHIP_CYCLE` | Entity `parent` references form a cycle. |

## Resolved relationships

| Code | Condition |
| --- | --- |
| `CONTRACT_RELATIONSHIP_ID_DUPLICATE` | Two resolved relationship records have the same ID. |
| `CONTRACT_RELATIONSHIP_TYPE_UNKNOWN` | Relationship type is absent from the loaded catalog. |
| `CONTRACT_RELATIONSHIP_ENDPOINT_KIND` | Source, target, or selector target kind is disallowed for the relationship type. |
| `CONTRACT_RELATIONSHIP_SELECTOR` | Target selector is empty or cites an unknown component or invalid reference. |
| `CONTRACT_RELATIONSHIP_RULE_SCHEMA` | Relationship rule fails the catalog rule schema for its type. |

Unresolved source or target IDs use `CONTRACT_REFERENCE_UNRESOLVED`.

## Resolved systems

| Code | Condition |
| --- | --- |
| `CONTRACT_SYSTEM_ID_DUPLICATE` | Two resolved systems have the same ID. |
| `CONTRACT_SYSTEM_PHASE_UNKNOWN` | System phase is absent from the catalog's phase order. |
| `CONTRACT_SYSTEM_RESOURCE_UNKNOWN` | Read, write, query, or invalidation resource matches no supported path, component, relationship, derived value, or artifact namespace. |
| `CONTRACT_SYSTEM_CYCLE` | System `dependsOn` graph contains a cycle; `systemOrder` is empty. |

An unresolved `dependsOn` ID uses `CONTRACT_REFERENCE_UNRESOLVED`.

## Code completeness

The tables above cover every package-defined `DSL_*` code emitted by the shipped compiler and every value of the
exported `ResolvedContractErrorCode` union in 0.1.0. `Diagnostic.code` remains typed as `string`. An unexpected
filesystem or tool failure can preserve an external code such as `EISDIR`, and later releases can add package-defined
codes. Treat the listed package-defined codes as stable and preserve unknown codes together with their messages.

For task-oriented repair steps, see [Repair compiler diagnostics](../how-to/repair-diagnostics.md).
