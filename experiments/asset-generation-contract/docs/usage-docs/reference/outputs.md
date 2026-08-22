---
status: current
type: reference
audience: compiler consumers, engine integrators, and provenance tools
applies-to: "@antiky/contracts@0.1.0"
---

# Compiler output reference

A successful compile returns and, when `outputDirectory` is set, writes exactly five known files. These files describe
and index a validated contract. They do not prove that downstream assets, renders, gameplay code, or other artifacts
exist.

## Output set

| File | Format | Primary consumer |
| --- | --- | --- |
| `resolved-contract.json` | Canonical JSON object | Engines, technical tools, and independent validation |
| `diagnostics.json` | Canonical JSON array | Authors, editors, and CI |
| `contract-index.json` | Canonical JSON object | Provenance, navigation, dependency, and impact-analysis tools |
| `contract.refs.ts` | Generated ESM TypeScript | Engine and implementation code needing exact branded IDs |
| `build-manifest.json` | Canonical JSON object | Reproducibility, cache, audit, and build tools |

On a blocking failure, `CompilationResult.files` contains only `diagnostics.json`. If an output directory is supplied,
the emitter removes stale copies of the other four known files.

Current source/output pairs are committed for
[Quiet Canal Market](../../../packages/examples/compiled/quiet-canal-market/) and
[Blue Winter Grove](../../../packages/examples/compiled/blue-winter-grove/). The examples test recompiles both scenes
and compares every emitted byte.

## Canonical file rules

JSON files use:

- recursively sorted object keys;
- original order for arrays whose order is intentional;
- normalized negative zero as `0`;
- two-space JSON indentation;
- UTF-8 text;
- LF line endings; and
- one final newline.

Canonicalization rejects non-JSON values and non-finite numbers. Hashes of JSON values and generated JSON files use
canonical bytes. Source-module and reference-image hashes use each input file's original bytes. The compiler does not
inject timestamps, random UUIDs, absolute filesystem paths, host data, or current-working-directory values. Authored
strings are preserved even when their text resembles one of those values.

## `resolved-contract.json`

This file conforms to the exported `ResolvedContract` type and the installed resolved-contract schema.

### Top-level fields

| Field | Type | Contents |
| --- | --- | --- |
| `$schema` | `string` | Installed contract schema ID. |
| `schemaVersion` | `string` | Installed contract schema version; `0.2.0` for the current profile. |
| `contract` | `ContractMetadata` | Contract identity, intent, state, and authoring provenance. |
| `imports` | `readonly ContractImport[]` | Required installed component-catalog import. |
| `coordinateSystem` | `CoordinateSystem` | Profile-supplied axes, handedness, meter unit, origin meaning, and voxel size. |
| `determinism` | `DeterminismPolicy` | Scene-key-derived root seed, stream policy, stable inputs, and stream names. |
| `definitions` | `ResolvedDefinitions` | Empty palette/material maps, resolved prototypes, and selected profile records. |
| `entityTree` | `EntityTreeNode` | Scene root and its cast children. |
| `entities` | `Record<string, ResolvedEntity>` | Root scene plus lowered region and population entities. |
| `relationships` | `readonly ResolvedRelationship[]` | Lowered `composition.frames` records. |
| `systems` | `readonly ResolvedSystem[]` | Technical systems supplied by the selected profile. |
| `validation` | `JsonObject` | Schema and semantic suites, human review, and promotion policy. |
| `outputs` | `JsonObject` | Canonical filename, required render-pass policy, and profile-policy hash. |

The portable IR types also allow optional `qualityProfile` and optional `imports`; the current semantic compiler emits
`imports` and does not emit `qualityProfile`.

### `contract`

| Field | Current compiler value |
| --- | --- |
| `id` | `antikylabs.scene.<scene-key>` |
| `kind` | `generative-scene` |
| `name` | Authored scene name |
| `revision` | `1` |
| `status` | `draft` |
| `intent` | `experience.fantasy`, else `gameplay.purpose`, else scene name |
| `provenance.compiler` | `@antiky/contracts/compiler@0.1.0` |
| `provenance.profiles` | Selected profile ID, version, and `default` or `explicit` selection |
| `provenance.authoring.semantic` | JSON-normalized semantic projection with direct references replaced by IDs |
| `provenance.authoring.referenceImages` | Portable paths, content hashes, and every owner/use edge |

### Resolved record types

| Type | Required fields | Optional fields |
| --- | --- | --- |
| `ResolvedPrototype` | `id`, `kind: 'prototype'`, `name`, `components` | `extends`, `tags` |
| `ResolvedEntity` | `id`, `kind`, `name`, `components` | `enabled`, `parent`, `prototype`, `tags` |
| `ResolvedRelationship` | `id`, `source`, `type` | `description`, `priority`, `required`, `rule`, `target`, `targetSelector` |
| `ResolvedSystem` | `id`, `phase`, `implementation`, `implementationVersion`, `reads`, `writes`, `query`, `dependsOn` | `randomStream`, `parameters`, `invalidation`, `produces` |

The complete portable interfaces are exported from `@antiky/contracts/ir`; see
[Package subpaths](package-subpaths.md).

## `diagnostics.json`

This file is a deterministically ordered array of `Diagnostic` objects. The public severity type reserves `warning` and
`info` for forward compatibility, but version 0.1.0 emits only blocking errors. A successful compile therefore contains
`[]` plus the final newline.

See [Diagnostics](diagnostics.md) for the object shape, ordering, and complete code set.

## `contract-index.json`

The index is derived from `resolved-contract.json` and the semantic collection graph. It is a navigation aid, not an
authoring source of truth.

| Field | Value | Index direction |
| --- | --- | --- |
| `byId` | `Record<string, JsonObject>` | Contract ID to record kind and JSON path |
| `bySemanticPath` | `Record<string, readonly string[]>` | Authored semantic path to derived output IDs |
| `derivationsByOutputId` | `Record<string, readonly Derivation[]>` | Output ID to technical path, semantic paths, lowerer, profile, and optional override path |
| `childrenByParent` | `Record<string, readonly string[]>` | Entity parent ID to child entity IDs |
| `incomingRelationshipsById` | `Record<string, readonly string[]>` | Target ID to relationship IDs |
| `outgoingRelationshipsById` | `Record<string, readonly string[]>` | Source ID to relationship IDs |
| `dependenciesBySourceId` | `Record<string, readonly JsonObject[]>` | Semantic source ID to dependency edges |
| `dependentsByTargetId` | `Record<string, readonly JsonObject[]>` | Semantic target ID to reverse dependency edges |
| `referenceUsesByImageHash` | `Record<string, readonly JsonObject[]>` | Image SHA-256 to path, owner, semantic path, and use text |
| `prototypesByAncestor` | `Record<string, readonly string[]>` | Base prototype ID to direct and transitive specializations |
| `systemsByReadType` | `Record<string, readonly string[]>` | Read resource string to system IDs |
| `systemsByWriteType` | `Record<string, readonly string[]>` | Written resource string to system IDs |
| `hashById` | `Record<string, string>` | Contract record ID to canonical SHA-256 |

### Derivation shape

| Field | Type | Meaning |
| --- | --- | --- |
| `outputId` | `string` | ID of the record or derived component. |
| `outputPath` | `string` | JSON path in `resolved-contract.json`. |
| `semanticPaths` | `readonly string[]` | Authored paths that contributed to the output. |
| `lowerer` | `{ id: string; version: string }` | Versioned lowering rule. |
| `profile` | `{ id: string; version: string }` | Present when profile policy contributed. |
| `overridePath` | `string` | Present for a technical override. |

## `contract.refs.ts`

The generated module imports `contractRef` from `@antiky/contracts/ir` and exports one readonly object:

```ts
export const refs = {
  entities: { /* exact ID-keyed ContractRef<'entity'> values */ },
  prototypes: { /* exact ID-keyed ContractRef<'prototype'> values */ },
  relationships: { /* exact ID-keyed ContractRef<'relationship'> values */ },
  systems: { /* exact ID-keyed ContractRef<'system'> values */ },
} as const;
```

Map keys are exact contract IDs, so punctuation never needs conversion into a JavaScript identifier and sanitized-name
collisions cannot occur. IDs within each map are sorted. The file is generated; do not edit it or import it from
semantic DSL modules.

## `build-manifest.json`

| Field | Contents |
| --- | --- |
| `compiler` | Compiler ID and version. |
| `passes` | Ordered pass IDs and versions. |
| `lowerers` | Installed semantic lowerer IDs and versions. |
| `inputs.entry` | Project-relative entry path. |
| `inputs.sourceFiles` | Project-relative local source paths and byte hashes; empty for in-memory input. |
| `inputs.semanticSha256` | Hash of the normalized semantic projection. |
| `inputs.referenceImages` | Each image path, byte hash, and sorted use edges. |
| `profiles` | Selected profile ID, version, selection mode, and content hash. |
| `schema` | Schema ID, version, and canonical content hash. |
| `catalog` | Catalog ID, version, and canonical content hash. |
| `resolvedContractSha256` | Canonical hash of `resolved-contract.json`. |
| `systemOrder` | Dependency-first validated system IDs. |
| `outputHashes` | Hashes of the other four successful output files. |
| `diagnostics` | Counts for total, errors, warnings, and information. |

The manifest does not hash itself and has no timestamp. `resolvedContractSha256` matches the corresponding entry in
`outputHashes` because both are calculated from the canonical resolved-contract bytes.
