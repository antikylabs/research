# Handoff validation report

This report records checks performed on the documentation bundle and its preserved reference fixtures. It is not a substitute for the Goal 1 implementation tests.

## Reference-fixture checks

| Check | Result | Evidence |
|---|---:|---|
| Top-level JSON Schema validation | **PASS** | 0 error(s) |
| Catalog component payload and entity-kind validation | **PASS** | 135 component payloads checked; 0 error(s) |
| Map key equals record ID | **PASS** | 38 entities and 9 prototypes checked |
| Ownership tree completeness and one-parent invariant | **PASS** | 38 tree nodes; root scene.blue-winter-grove; 0 error(s) |
| Prototype reference and inheritance DAG validation | **PASS** | 9 prototypes; 2 inheritance edge(s) |
| Relationship reference, kind, and rule validation | **PASS** | 18 relationships; 0 error(s) |
| System IDs, phases, dependencies, and DAG validation | **PASS** | 18 systems across 11 phases; 0 error(s) |
| Selected cross-reference validation | **PASS** | prototype, material, palette, and anchor references checked; 0 error(s) |
| Detailed fixture copy integrity | **PASS** | 131703 bytes; source and examples copy are byte-identical |

## Verified source metrics

- Authored entities: **38**
- Prototypes: **9**
- Palettes: **7**
- Materials: **8**
- Relationships: **18**
- Systems: **18**
- Catalog component types: **43**
- Catalog relationship types: **14**
- Catalog system phases: **11**

## Bundle checks

- Example JSON files parse successfully.
- The conceptual TypeScript example parses and transpiles with TypeScript 5.8.3; it is not type-checked against an implementation that does not yet exist.
- All local Markdown links resolve.
- All eight source files listed in the [Research Notes checksum table](docs/RESEARCH_NOTES.md#sha-256-checksums) match the files in [`../asset-contract/`](../asset-contract/).

## Result

**PASS** — the handoff bundle is internally consistent and the detailed reference fixture passes the checks above.
