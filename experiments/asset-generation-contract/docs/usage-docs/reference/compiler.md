---
status: current
type: reference
audience: build-tool authors, CI maintainers, and validator consumers
applies-to: "@antiky/contracts@0.1.0"
---

# Compiler and validator reference

The compiler subpath exports the trusted TypeScript compiler and the public resolved-contract validator. The package
requires Node.js 22 or later and uses ESM.

```ts
import {
  compileContract,
  validateResolvedContract,
} from '@antiky/contracts/compiler';
```

## `compileContract`

```ts
function compileContract(
  input: string | SceneDefinition,
  options?: CompileContractOptions,
): Promise<CompilationResult>
```

### Inputs

| Input | Behavior |
| --- | --- |
| `string` | Path to a trusted local `.contract.ts` entry. The path is resolved from the current working directory. |
| `SceneDefinition` | An already constructed in-memory scene. No source modules are loaded or hashed. |

### `CompileContractOptions`

| Field | Type | Default | Behavior |
| --- | --- | --- | --- |
| `outputDirectory` | `string` | None | If supplied, writes the returned files to this directory. |
| `projectRoot` | `string` | File entry directory, or in-memory entry directory | Bounds a file entry and all image paths and defines the source-inventory boundary. Resolved absolutely. |
| `entryPath` | `string` | `<projectRoot>/in-memory.contract.ts` | Reference-image base for in-memory input; ignored for file input. |

An in-memory scene with at least one reference image must set `entryPath` explicitly. It can be a notional entry file;
referenced image files must exist. An in-memory compile records no `sourceFiles` entries.

### File-entry contract

| Requirement | Failure code |
| --- | --- |
| Entry name ends in `.contract.ts` | `DSL_ENTRY_EXTENSION` |
| Entry is inside `projectRoot` | `DSL_ENTRY_OUTSIDE_PROJECT` |
| Entry exists and is a file | `DSL_ENTRY_MISSING` or `DSL_ENTRY_NOT_FILE` |
| Bundled module namespace has exactly one export named `default` | `DSL_ENTRY_EXPORT` |
| Default export is a `scene(...)` declaration | `DSL_ENTRY_DEFAULT` |

The loader bundles the complete local module graph to temporary ESM with esbuild, targets Node 22, then imports it.
Package imports are bundled. Local source hashes include files inside the project root, but exclude the contracts
package, `node_modules`, and paths outside the root. An imported source module outside `projectRoot` can still be
bundled and executed; it is omitted from the source inventory. Treat `projectRoot` as a file-entry/image/inventory
boundary, not an execution sandbox. An in-memory `entryPath` is a reference-image base and can be outside the root when
the scene has no images.

Bundling does not run the TypeScript type checker. Run `tsc --noEmit` or the consuming project's equivalent as a
separate check.

### `CompilationResult`

| Field | Type | Success | Blocking failure |
| --- | --- | --- | --- |
| `ok` | `boolean` | `true` | `false` |
| `diagnostics` | `readonly Diagnostic[]` | Empty in 0.1.0; the public type reserves non-error severities | Ordered and contains at least one error |
| `files` | `CompilationFiles` | All five canonical files as UTF-8 strings | Only `diagnostics.json` |
| `resolvedContract` | `ResolvedContract \| undefined` | Present | Absent |

The promise reports expected loading, collection, profile, image, lowering, and validation failures through the result.
`DSL_COMPILATION_FAILED` is the fallback for an otherwise unclassified exception.

When `outputDirectory` is set, emission creates the directory, writes known files atomically, and removes stale known
compiler files that are absent from the current result. Therefore a blocking failure leaves only `diagnostics.json`
among the five known output names.

### Compiler stages

Compilation runs these observable stages in order:

1. Load or accept the semantic scene.
2. Guard serializability and collect keyed ownership, direct-reference edges, relationships, and image uses.
3. Select and expand an installed project profile.
4. Resolve and hash reference images.
5. Lower semantic direction and record derivations.
6. Validate the resolved contract against schema, catalog, ownership, references, relationships, and the system DAG.
7. Canonicalize files, create indexes and hashes, and optionally emit them.

An error diagnostic stops later stages that require valid earlier output.

## `validateResolvedContract`

```ts
function validateResolvedContract(
  input: unknown,
  options?: ValidateResolvedContractOptions,
): Promise<ContractValidationResult>
```

This compiler-subpath function validates compiler output or a complete hand-authored technical fixture. It adapts
catalog validator errors into the public `Diagnostic` shape.

### `ValidateResolvedContractOptions`

| Field | Type | Default |
| --- | --- | --- |
| `catalog` | `ComponentCatalog` | Installed component catalog |
| `schema` | `JsonSchema` | Installed resolved-contract schema |
| `expectedCatalogUri` | `string` | `voxelDiorama.schema.catalog.uri` |
| `expectedSchemaId` | `string` | `voxelDiorama.schema.contract.id` |
| `expectedSchemaVersion` | `string` | `voxelDiorama.schema.contract.version` |

Supplied option values replace these defaults.

### `ContractValidationResult`

| Field | Type | Meaning |
| --- | --- | --- |
| `valid` | `boolean` | `true` only when the backend validator reports no errors. |
| `diagnostics` | `readonly Diagnostic[]` | Deterministically ordered error diagnostics with technical paths. |
| `systemOrder` | `readonly string[]` | Dependency-first deterministic system IDs; empty when top-level schema validation cannot proceed or the dependency graph contains a cycle. Other system errors can coexist with an order. |

Validation covers:

- top-level JSON Schema;
- exact schema ID and version;
- required catalog import identity, URI, and version;
- component registration, payload schema, and allowed entity kind;
- record-map key/ID agreement;
- complete, unique, acyclic entity ownership;
- prototype inheritance and component-reference resolution;
- relationship type, endpoints, selectors, IDs, and rule schemas; and
- system phases, resources, unique IDs, and acyclic dependencies.

The lower-level `@antiky/contracts/catalog` validator is synchronous and returns `{ ok, errors, systemOrder }`. Its
errors use `ResolvedContractValidationError` rather than `Diagnostic`. See
[Package subpaths](package-subpaths.md).

## CLI

The package installs the `antiky-contract` binary.

```text
antiky-contract compile <entry.contract.ts> --out <directory>
antiky-contract validate <resolved-contract.json>
```

### Exit codes and streams

| Exit | Meaning | Output |
| --- | --- | --- |
| `0` | Command succeeded, or help was requested. | Summary on standard output. |
| `1` | Compilation, file reading, JSON parsing, or validation failed. | Diagnostics or error on standard error. |
| `2` | Command missing, required argument missing, or command unknown. | Usage on standard error, except no command prints usage on standard output. |

Top-level `antiky-contract --help` and `antiky-contract -h` print usage and exit `0`; command-position help flags are
not recognized. The `compile` command requires `--out`; the library API does not require an output directory. Version
0.1.0 does not reject trailing arguments after the recognized command arguments and `compile --out` pair.

## Trust and side effects

A file entry is trusted repository build code. Its imported modules execute before the compiler can inspect the default
export. The loader is not a sandbox. Do not compile network-supplied or user-uploaded TypeScript, and do not grant the
compile process runtime or production privileges it does not need.

Use the resolved JSON validator for untrusted data and keep its input typed as `unknown`. Compiler output describes a
scene contract; it does not run an artifact, asset, render, world, scenario, or gameplay generator.

See [Compiler outputs](outputs.md) for the emitted files and principal fields, the exported IR plus installed schema and
catalog for complete nested shapes, and [Diagnostics](diagnostics.md) for package-defined codes and the external-code
boundary.
