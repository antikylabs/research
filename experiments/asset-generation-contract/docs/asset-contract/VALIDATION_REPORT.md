# Contract Package Validation Report

## Result

**PASS**

The expanded blue winter grove contract is valid JSON and passes the draft top-level Antiky JSON Schema.

## Integrity checks

- Every entity-map key equals the entity's `id`.
- Every prototype-map key equals the prototype's `id`.
- Every material-map key equals the material's `id`.
- Every palette-map key equals the palette's `id`.
- All 38 authored entities occur exactly once in the ownership tree.
- Every entity's declared parent matches its parent in the ownership tree.
- All prototype inheritance references resolve.
- All prototype material slots resolve to declared materials.
- All material palette references resolve.
- All population prototype references resolve.
- All relationship sources and explicit targets resolve.
- All system dependencies resolve.
- The system dependency graph is acyclic.

## Contract counts

| Record type | Count |
|---|---:|
| Authored entities | 38 |
| Tree nodes | 38 |
| Prototypes | 9 |
| Materials | 8 |
| Palettes | 7 |
| Relationships | 18 |
| Systems | 18 |
| Component types in catalog | 43 |
| Relationship types in catalog | 14 |

## Important limitation

The component catalog is a draft design catalog. The top-level JSON Schema validates the contract container and graph records, while individual component payloads are represented by catalog schema fragments. A production compiler should resolve and validate each component payload against its registered component schema, then emit canonical resolved IR.
