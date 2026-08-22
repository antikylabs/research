---
status: current
type: how-to
audience: contract authors repairing failed builds
applies-to: "@antiky/contracts@0.1.0"
---

# Repair compiler diagnostics

Use the diagnostic's semantic or technical path to change the source of truth, then compile again. Do not repair a
generated file by hand.

## 1. Read the machine-readable result

When the CLI fails, it writes concise diagnostics to standard error. If `--out` was supplied, the output directory
contains `diagnostics.json`. A blocking failure removes stale known outputs and leaves only this diagnostics file.

With the library API, read `result.diagnostics` when `result.ok` is false.

## 2. Start at the most useful location

Use locations in this order:

1. `semanticPath` — a location in the authored scene graph, such as `$.cast.grove.placement.around`.
2. `technicalPath` — a location in resolved JSON, common for schema and catalog validation failures.
3. `contractId` — the stable record involved when a narrower path is unavailable.
4. `related` — the other end of a collision, cycle, or conflicting selection.

The `hint` can name the supported replacement. The message is explanatory text; use `code` for automation.

## 3. Apply the repair for the failure class

| Failure class | Repair |
| --- | --- |
| `DSL_ENTRY_*` | Use an existing `.contract.ts` file inside the project root with only a default `scene(...)` export. |
| `DSL_BINDING_*` or `DSL_DUPLICATE_BINDING` | Keep things in `definitions`, regions/populations in `cast`, and bind each object once. |
| `DSL_REFERENCE_*` | Pass the owned declaration object of the required kind; fix image paths from the entry directory. |
| `DSL_INVALID_SCOPED_KEY` or an ID collision | Rename the keyed owner to match the supported key pattern and make the resulting ID unique. |
| `DSL_DECLARATION_UNREACHABLE` | Connect the thing to cast through `of`, `features`, `parts`, or `basedOn`, or remove it. |
| `DSL_DEFINITION_DEPENDENCY_CYCLE` | Break the combined `basedOn`/`parts` cycle. |
| `DSL_PROFILE_*` | Omit `profiles` for the default or import the exact `voxelDiorama` value once. |
| `DSL_UNSUPPORTED_SEMANTIC_*` | Move the value to a documented field and use an accepted finite enum value. |
| `DSL_TECHNICAL_OVERRIDE_*` or `CONTRACT_COMPONENT_*` | Use a registered, allowed component with a schema-valid payload and no semantic-field conflict. |
| `CONTRACT_OWNERSHIP_*`, `CONTRACT_REFERENCE_*`, or `CONTRACT_SYSTEM_*` | Repair the technical fixture at `technicalPath`; semantic compiler output should not be hand-edited. |

## 4. Compile from clean semantic input

Run the same compile command again. A successful result restores all five known outputs; each file is written
atomically:

```sh
npm exec -- antiky-contract compile \
  path/to/scene.contract.ts \
  --out generated/scene
```

Then validate the restored `resolved-contract.json` at the consumer boundary. Diagnostics are sorted deterministically,
so repeated runs of unchanged input retain their order.

See the [diagnostic reference](../reference/diagnostics.md) for every package-defined current code, the exact
diagnostic shape, and the external-code boundary.
