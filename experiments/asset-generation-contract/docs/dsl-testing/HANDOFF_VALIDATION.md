# Handoff validation report

This is the historical validation snapshot for the pre-implementation design handoff. Current Goal
1 implementation evidence is in the
[`@antiky/contracts` implementation report](../contracts/IMPLEMENTATION_REPORT.md), and the active
source/output pairs are in [`packages/examples`](../../packages/examples/).

## Redesign bundle checks

| Check | Result | Evidence |
|---|---:|---|
| Design anchor integrity | **PASS** | feedback-aligned `docs/DSL_REDESIGN.md` SHA-256 is `f08ff58dd0ef7d911d21297d936d075126b5bc0e1247aac61e64e4d381dc6e4e` |
| All local Markdown links resolve | **PASS** | 16 Markdown files and 60 local links checked; 0 missing local targets |
| Stale contract-reference paths | **PASS** | 0 stale content links target the former local `references/` folder; contract sources resolve to sibling `docs/asset-contract/` |
| Example JSON syntax | **PASS** | requirement and receipt examples parse with `jq` |
| Semantic TypeScript syntax | **PASS** | all 6 conceptual fixture modules parse/transpile with TypeScript 5.9.3 |
| Compact scene entry | **PASS** | 114 physical lines; required maximum is 119 |
| Fixture readability | **PASS** | 505 physical lines across 6 focused modules; longest source line is 119 characters |
| Fixture vocabulary | **PASS** | 0 direct raw component/system/ref calls, catalog names, schema versions, camera vectors, or output paths found across the module graph |
| Definition composition | **PASS** | 3 characters specialize one shared character, the party names all 3 as parts, rounded crown/trunk parts are reused, regions name features, and scene gameplay directly selects the placed party |
| Generated visual references | **PASS** | 3 active 1536×1024 RGB scene PNGs and 1 RGBA party anchor exist, decode, and match their recorded SHA-256 hashes; 3 unversioned first-attempt images remain, and the intermediate `v2` and `v3` PNGs are absent |
| Contract-to-image references | **PASS** | all 4 typed entry-relative image paths resolve; the module graph contains 38 item-specific reference-use edges |
| Handoff target | **PASS** | Goal and agent docs consistently target `experiments/asset-generation-contract/packages/contracts/` |
| Primary-language boundary | **PASS** | README, goal, detailed design, roadmap, workflows, trace/output docs, and examples identify semantic declarative TypeScript as primary |
| Unsupported prose claims/time estimates | **PASS** | anti-slop prose checker: 0 findings across the Markdown bundle |
| Orphan/directory-shape structure | **PASS** | anti-slop structure checker: 0 findings over 32 files; test collection was not checked because this handoff has no test-runner configuration |

The TypeScript module graph is intentionally not type-checked against `@antiky/contracts/dsl`; Goal 1 creates that package. Syntax/transpile success only proves that the conceptual source is valid TypeScript grammar.

## Preserved reference-fixture evidence

The source files still match the hashes used by the earlier technical validation. The structural results below were not recomputed during this documentation-only redesign; unchanged hashes preserve the inputs to the recorded checks.

| Recorded check | Result | Evidence |
|---|---:|---|
| Top-level JSON Schema validation | **PASS** | 0 recorded errors |
| Catalog component payload and entity-kind validation | **PASS** | 135 payloads checked; 0 recorded errors |
| Map key equals record ID | **PASS** | 38 entities and 9 prototypes checked |
| Ownership completeness and one-parent invariant | **PASS** | 38 tree nodes; root `scene.blue-winter-grove`; 0 recorded errors |
| Prototype reference and inheritance DAG | **PASS** | 9 prototypes; 2 inheritance edges |
| Relationship reference, kind, and rule validation | **PASS** | 18 relationships; 0 recorded errors |
| System IDs, phases, dependencies, and DAG | **PASS** | 18 systems across 11 phases; 0 recorded errors |
| Selected cross-references | **PASS** | prototype, material, palette, and anchor refs; 0 recorded errors |
| Detailed fixture copy integrity | **PASS** | 131,703 bytes; source and example copy remain byte-identical |

Verified source metrics remain:

- 38 authored entities
- 9 prototypes
- 7 palettes
- 8 materials
- 18 relationships
- 18 systems
- 43 catalog component types
- 14 catalog relationship types
- 11 catalog system phases

All eight files in the [Research Notes checksum table](docs/RESEARCH_NOTES.md#sha-256-checksums) match the preserved files in [`../asset-contract/`](../asset-contract/).

## Result

**PASS** — the handoff consistently specifies the first semantic TypeScript DSL slice, all contract-source links target the actual `docs/asset-contract/` directory, and the readable fixture models a player-controlled party, reusable character and environment definitions, named dependency edges, and item-level reference evidence. The active image set combines the intended soft voxel-miniature environment with a production-quality original HD-2D party.

At the time of this snapshot, Goal 1 build, type-level, lowering, schema, CLI, provenance, and
determinism acceptance were **NOT RUN**. See the current implementation report for executed results.
