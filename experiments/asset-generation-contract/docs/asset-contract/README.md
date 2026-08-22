# Antiky Generative Contract Design Package

This package turns the earlier image-to-contract discussion into a concrete starting point for an Antiky generative world specification.

The central model is a **Generative Entity-Component Graph**:

- one ownership tree determines scope, inheritance, deletion, and regeneration boundaries
- entities carry small namespaced components
- prototype entities describe reusable asset grammars
- population entities describe groups rather than hand-placed instances
- typed relationship edges describe ecology, composition, influence, and dependency
- ordered systems query the graph and create derived entities or artifacts
- validation suites measure structure, composition, rendering, and anti-patterns
- generated artifacts retain provenance back to the source entity, component, system, and seed stream

## Files

### Design

- `SPEC_DESIGN.md` - 3,600-word design paper covering the contract's purpose, ECS-like model, ownership tree, relationship graph, entities, components, prototypes, populations, systems, determinism, validation, visual comparison, event-sourced editing, preview worlds, promotion, versioning, and an implementation sequence.

### Schemas

- `schemas/generative-scene-contract.schema.json` - JSON Schema for the top-level contract container, entity records, tree nodes, relationships, systems, and validation container.
- `schemas/component-catalog.json` - draft catalog containing 43 component types and 14 typed relationship definitions, including merge behavior, allowed scopes, readers, writers, invalidation effects, and payload schemas.

### Detailed example

- `blue_winter_grove.scene.json` - the expanded blue winter grove contract.
- `examples/blue-winter-grove.scene.contract.json` - identical example stored under a conventional examples directory.

The winter grove currently contains:

- 38 authored entities in one ownership tree
- 9 reusable asset prototypes
- 7 semantic palettes
- 8 semantic material definitions
- 18 typed relationship edges
- 18 ordered generation, rendering, validation, and publishing systems
- structural, compositional, visual, and human-review acceptance criteria
- stable preview and diagnostic cameras
- explicit output and provenance contracts

### Earlier compact example

- `quiet_canal_market.scene.json` - the earlier compact canal-town example. It has not yet been upgraded to the full entity-component graph used by the winter grove.

## How to read the winter grove contract

The file is intentionally verbose. Start in this order:

1. `contract`, `qualityProfile`, and `coordinateSystem` define the scene boundary and quality bar.
2. `definitions.prototypes` describes reusable trees, shrubs, grass, rocks, logs, and twig clusters.
3. `entityTree` shows ownership and regeneration scope.
4. `entities` contains the descriptive components for every authored scene entity.
5. `relationships` explains how populations and compositional anchors affect one another.
6. `systems` defines the ordered generation pipeline and dependency DAG.
7. `validation` defines measurable acceptance and human review.
8. `outputs` defines artifacts, reports, provenance, and promotion targets.

## Ownership tree

```text
scene.blue-winter-grove
├── group.environment
│   ├── environment.sky
│   ├── environment.lighting
│   ├── environment.atmosphere
│   └── environment.wind
├── group.terrain
│   ├── terrain.base
│   ├── region.clearing.primary
│   ├── region.ridge.northwest
│   ├── region.hollow.southeast
│   └── region.path.wildlife
├── group.ecology
│   ├── group.canopy
│   │   ├── population.pine.old-growth
│   │   ├── population.pine.secondary
│   │   ├── population.pine.young
│   │   └── population.birch.edge
│   ├── group.understory
│   │   └── population.shrub.winter
│   └── group.ground-cover
│       ├── population.grass.scoured
│       ├── population.grass.canopy
│       ├── population.rocks.glacial
│       ├── population.deadwood.logs
│       └── population.detail.twigs
├── group.composition
│   ├── anchor.hero-pine
│   ├── anchor.clearing-negative-space
│   ├── anchor.frame-left
│   ├── anchor.frame-right
│   └── anchor.background-depth
└── group.cameras
    ├── camera.hero
    ├── camera.top-down
    ├── camera.tree-detail
    ├── camera.ground-detail
    └── camera.snow-detail
```

The tree is not expected to contain every generated tree, branch, snow cap, or grass tuft. Population and synthesis systems create those as derived entities. The derived entities retain source and seed provenance but are not directly hand-authored.

## Important representation decision

This example is an **authoring IR**. It allows readable descriptions and prototype inheritance. A compiler should resolve it into a canonical engine IR that has:

- no unresolved inheritance
- normalized units
- explicit defaults
- canonical references
- stable hashes
- system and component versions
- a dependency and invalidation graph

The TypeScript DSL discussed for Antiky can become the primary authoring interface and compile into this JSON shape.

## Validation status

The expanded winter grove was checked against `generative-scene-contract.schema.json` and passed additional integrity checks for:

- map key and record ID agreement
- complete one-parent ownership tree
- tree and entity parent agreement
- prototype, material, palette, and relationship reference resolution
- system dependency resolution
- acyclic system dependency graph

See `VALIDATION_REPORT.md` for the exact package counts and validation result.
