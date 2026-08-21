# Designing the Antiky Generative World Contract

## 1. What the specification is for

Antiky needs a language that can describe what a world should be, how it should be constructed, and how the engine can determine whether the result is acceptable.

A reference image is useful, but it is not enough. An image shows the final pixels without exposing the decisions that produced them. It does not tell a coding agent:

- which forms are primary and which are decoration
- which relationships create the composition
- which details must vary and which must remain consistent
- which parts should be generated procedurally
- which constraints prevent the result from becoming blocky, repetitive, sparse, or generic
- how to measure whether the generated scene matches the intended visual language

The contract closes that gap. It converts visual and design intent into structured, versioned, testable data.

The contract should become the stable boundary between four concerns:

1. **Authoring**: humans and agents describe the intended world.
2. **Generation**: systems turn descriptions into terrain, assets, placements, materials, and scene instances.
3. **Rendering**: the engine produces preview and final images from generated artifacts.
4. **Validation**: structural and visual checks determine whether the result satisfies the contract.

The contract is not the renderer, the runtime ECS, a shader graph, or a procedural modeling language. It describes intent and constraints. Implementations are free to evolve behind that boundary.

## 2. The central model: a Generative Entity-Component Graph

The most useful shape is an ECS-like descriptive model. For clarity, this document calls it a **Generative Entity-Component Graph**, or **GECG**.

It borrows the useful parts of ECS:

- entities have stable identities
- components hold structured data
- systems query components and produce results
- behavior is not embedded in every entity
- new component types can be added without redesigning the entire hierarchy

It is different from the runtime ECS in important ways:

- it is optimized for authoring, generation, traceability, and validation rather than per-frame execution
- entities can represent abstract things such as a biome, a clearing, a population, a palette, or a compositional anchor
- components describe intent, distributions, constraints, and desired relationships
- systems are generation or validation passes, not gameplay update loops
- many entities resolve into generated entities or baked artifacts rather than becoming runtime entities directly

The authoring model should contain both a tree and a graph.

### 2.1 The ownership tree

Every entity has one logical parent. This forms the primary ownership tree:

```text
world
  region
    biome
      scene
        environment
        terrain
        ecology
        composition
        cameras
```

The tree answers:

- Where does this thing belong?
- Which settings does it inherit?
- What should be removed when its parent is removed?
- Which seed and coordinate scope does it live inside?
- Which subtree should be regenerated when it changes?

### 2.2 The relationship graph

The world cannot be described by containment alone. Entities also need typed relationships:

- a shrub population clusters near mature trees
- exposed grass appears where snow depth is low
- deadwood is associated with old-growth trees
- a camera frames a hero tree and preserves a clearing as negative space
- a material palette is shared by multiple archetypes
- snow accumulation is influenced by wind and occlusion
- two populations exclude each other within a minimum distance

These are graph edges. They should be explicit, typed, queryable, and validatable.

The result is a tree for ownership plus a graph for meaning.

## 3. Three levels of entity

The contract should distinguish three categories of entity. Treating all entities as equivalent creates confusion about what should be hand-authored and what should be generated.

### 3.1 Declarative entities

Declarative entities are authored directly. Examples include:

- a scene
- a terrain region
- a central clearing
- an old-growth pine population
- a blue-hour lighting profile
- a hero camera
- a validation crop

They describe intent and remain stable across generations.

### 3.2 Prototype entities

Prototype entities describe reusable archetypes. Examples include:

- mature snowy pine
- young snowy pine
- bare winter birch
- snow-buried shrub
- glacial boulder
- frozen grass tuft

A prototype contains generation grammar, material roles, variation ranges, attachment slots, snow behavior, and validation targets. It does not represent one placed object.

### 3.3 Derived entities

Derived entities are produced by systems. Examples include:

- pine instance 41 within the northwest cluster
- one generated branch hierarchy
- one snow cap mesh
- one patch of exposed grass
- one material assignment for a generated rock

Derived entities must retain provenance:

- the source declarative entity
- the prototype used
- the system and system version that produced them
- the random stream and seed
- the contract revision

This traceability allows an agent to connect a bad rendered result back to the rule that produced it.

## 4. Components describe facts, intent, and constraints

Components should be small, namespaced, schema-backed records. A component should answer one coherent question.

Good component examples:

- `core.transform`
- `core.bounds`
- `description.intent`
- `style.visualLanguage`
- `layout.regionMask`
- `layout.compositionAnchor`
- `population.spawnDistribution`
- `vegetation.clusterGrammar`
- `geometry.treeGrammar`
- `surface.snowReceiver`
- `material.assignment`
- `render.camera`
- `validation.metricTargets`

Avoid components that become unstructured dumping grounds, such as `scene.settings` or `asset.options`.

Each component type should define:

- a stable type name
- a schema version
- required and optional fields
- units and coordinate assumptions
- inheritance behavior
- merge behavior
- whether it is authorable or derived
- systems that commonly read it
- systems that are allowed to write it
- validation rules for the component itself

### 4.1 Components contain data, not implementation code

A contract can name an algorithm or implementation profile, but it should not contain arbitrary scripts.

Prefer:

```json
{
  "algorithm": "poisson-clustered",
  "minimumSpacingM": 1.8,
  "clusterRadiusM": [5.0, 11.0]
}
```

Avoid embedding executable generation logic inside the contract. The engine should map the algorithm identifier to a versioned implementation.

This keeps contracts portable, inspectable, testable, and safe for agent editing.

### 4.2 Components should separate hard constraints from preferences

A useful contract distinguishes:

- **required**: generation fails if the rule is violated
- **target**: the generator should optimize toward this value
- **allowed range**: values outside the range fail or warn
- **preference**: a weighted choice when multiple valid results exist
- **forbidden**: explicit anti-patterns

For example, a mature pine might require a tapered trunk, target five to eight visible branch tiers, allow 8 to 16 percent trunk lean, prefer asymmetrical snow loading, and forbid a single conical canopy shell.

## 5. Archetypes are composable prototypes

An archetype should not be a monolithic asset prompt. It should be a prototype entity composed from components.

A mature snowy pine can combine:

- bounds and scale
- silhouette grammar
- trunk grammar
- branch grammar
- foliage volume grammar
- material roles
- palette mapping
- snow-receiver behavior
- variation parameters
- attachment points
- forbidden forms
- asset-level validators

Archetypes can inherit from other archetypes. A `snow-pine.mature` archetype might extend `conifer.base`, while `snow-pine.young` extends the same base with different scale, branch density, and snow loading.

Inheritance should be explicit and shallow. Deep inheritance chains make it difficult for agents and humans to understand the resolved result. Composition is usually safer than extensive inheritance.

The compiler should produce a fully resolved prototype before generation. Generated artifacts should record the resolved prototype hash.

## 6. Population entities describe groups and ecological roles

A scene should not list 140 individual pine trees by hand. It should describe populations.

A population entity references one or more prototypes and declares:

- count or density range
- spatial mask
- cluster grammar
- size and age distribution
- variation policy
- relationships to other populations
- exclusion zones
- slope and elevation preferences
- visibility and composition preferences
- regeneration scope

For example, an old-growth pine population might prefer the perimeter of a clearing, cluster in groups of three to seven, preserve sight lines through the central negative space, and produce more deadwood nearby.

Population systems resolve these rules into derived instances.

This is where the contract becomes more than a scene graph. It describes not just what exists, but why entities appear together.

## 7. Relationships are first-class contract data

Relationships should use stable types with structured payloads rather than prose notes.

Useful relationship families include:

### 7.1 Spatial relationships

- `inside`
- `near`
- `farFrom`
- `adjacentTo`
- `alignedWith`
- `facesToward`
- `frames`
- `occludes`
- `preservesViewTo`

### 7.2 Ecological and generative relationships

- `clustersWith`
- `growsUnder`
- `avoidsCanopyOf`
- `spawnsNear`
- `spawnsFrom`
- `inheritsSnowFrom`
- `influencedByWindField`
- `createsGroundDetail`

### 7.3 Compositional relationships

- `anchorsComposition`
- `balances`
- `framesCamera`
- `preservesNegativeSpace`
- `createsDepthLayer`
- `guidesEyeToward`

### 7.4 Dependency relationships

- `usesPrototype`
- `usesPalette`
- `usesMaterialSet`
- `generatedBy`
- `validatedBy`
- `dependsOn`

Each edge should have an identifier, source, target, type, strength or priority when useful, and a structured rule payload.

## 8. Systems turn the contract into artifacts

Systems are ordered generation and validation passes. A system declares:

- the phase it runs in
- the components and relationship types it reads
- the components or artifacts it writes
- the entity query it operates on
- its implementation identifier and version
- its deterministic random stream
- dependencies on other systems
- parameters supplied by the scene
- invalidation rules

A winter grove pipeline might use these phases:

1. **Resolve**: load imports, resolve prototypes, apply inheritance, and validate schemas.
2. **Layout**: generate scene masks, clearing boundaries, ridges, hollows, and protected sight lines.
3. **Terrain**: generate terrain form, snow base depth, exposed patches, and surface variation.
4. **Population layout**: place old-growth clusters, young pines, birch edges, shrubs, rocks, and deadwood.
5. **Asset synthesis**: generate trunks, branches, foliage volumes, rocks, and ground-cover geometry.
6. **Surface simulation**: apply snow accumulation, wind exposure, dampness, frost, moss, and material breakup.
7. **Micro-detail**: add roots, twigs, grass blades, bark variation, snow clumps, and small debris.
8. **Composition correction**: preserve focal anchors, negative space, foreground framing, and depth layers.
9. **Render**: build preview views, validation crops, normal/depth/object-id passes, and final beauty images.
10. **Validate**: run structural metrics, distribution checks, anti-pattern detection, and visual comparison.
11. **Publish**: bake accepted artifacts and record provenance.

Systems should not silently change authored data. They write derived components or artifacts. If a correction should become permanent, an agent should propose a contract patch.

## 9. Determinism and controlled variation

The contract needs deterministic generation without eliminating variation.

The recommended policy is hierarchical random streams. A root seed is combined with stable identifiers:

```text
root seed
  + scene id
  + entity id
  + system id
  + purpose key
```

Examples of purpose keys include `trunk-centerline`, `branch-tier-4`, `snow-clumps`, and `ground-scatter`.

This gives three important properties:

- the same contract and seed reproduce the same result
- changing one population does not reshuffle every other population
- a failed detail can be regenerated locally without destroying the whole scene

Every distribution should specify its type and parameters. Do not rely on ambiguous statements such as "random height." Use explicit choices such as uniform, normal, log-normal, weighted categorical, blue-noise, Poisson disk, clustered Poisson, or noise-field sampling.

The contract should also declare whether a range is sampled per scene, per cluster, per instance, or per sub-part.

## 10. Quality should be represented at multiple scales

The common "Minecraft" failure happens because the generator satisfies object labels but misses density and structure across scales.

The contract should explicitly describe three scales of detail:

### 10.1 Macro detail

Macro detail controls the first read of the scene:

- terrain silhouette
- large clearings
- tree-line height rhythm
- major architecture or landmarks
- foreground, midground, and background separation
- dominant compositional anchors

### 10.2 Meso detail

Meso detail gives assets believable construction:

- branch tiers and forks
- roof layers and overhangs
- facade recesses
- boulder fractures
- shrub lobes
- snow shelves
- windows, sills, awnings, and stairs

### 10.3 Micro detail

Micro detail prevents large surfaces from feeling empty or synthetic:

- bark fissures
- chipped plaster
- small snow clumps
- grass tips
- moss lines
- cracks between stones
- twigs, rope, baskets, and window plants

A quality profile should define expected density at all three scales. More micro detail cannot rescue a weak silhouette, and a strong silhouette still looks crude without meso structure.

## 11. Materials should be semantic before they are technical

The contract should refer to semantic material roles:

- `snow.fresh`
- `snow.compacted`
- `bark.pine.dark`
- `bark.pine.exposed`
- `foliage.conifer.cold`
- `stone.glacial.dry`
- `stone.glacial.wet`

A renderer profile maps those roles to concrete shaders, palette ramps, texture procedures, and render parameters.

This allows the same world contract to target:

- a voxel palette renderer
- a mesh and PBR renderer
- a low-resolution preview renderer
- an offline path-traced renderer

The visual contract remains stable even when rendering implementation changes.

## 12. Snow is a system, not a white material swap

Snow should be modeled as a surface process influenced by:

- surface normal
- exposure to sky
- wind direction and strength
- occlusion by branches and nearby objects
- local temperature or melt masks
- material adhesion
- slope
- object scale

The contract should specify accumulation behavior and desired visual outcomes. It should not require the author to place every snow voxel.

A good snow contract can require:

- accumulation on upward-facing branch and rock surfaces
- reduced accumulation beneath dense canopy
- windward scouring and leeward deposition
- rounded but irregular edges
- limited overhang thickness
- contact compression around trunks and rocks
- exposed grass where snow depth falls below a threshold

This is a clear example of descriptive data driving a deterministic generative system.

## 13. Validation is part of the specification

A contract without acceptance criteria is only a prompt.

Validation should operate at four levels.

### 13.1 Schema validation

Checks that the contract is structurally valid:

- component payloads match schemas
- references resolve
- units are present
- entity identifiers are unique
- tree ownership has no cycles
- system dependencies are valid

### 13.2 Structural validation

Checks generated data:

- counts and density ranges
- minimum spacing
- cluster sizes
- slope limits
- snow coverage ratios
- hierarchy depth
- silhouette variance
- duplicate geometry hashes

### 13.3 Compositional validation

Checks scene-level relationships:

- central clearing remains open
- focal tree occupies an intended screen region
- foreground elements frame rather than block the camera
- background density produces depth
- no uniform grid or repeated spacing rhythm is visible

### 13.4 Visual validation

Checks rendered output:

- reference-image embedding or feature similarity
- palette histogram and value distribution
- edge-density targets by image region
- segmentation coverage by asset class
- depth-layer separation
- repeated-patch detection
- crop-level comparison for bark, snow, ground cover, and silhouettes

Visual metrics should support human review, not replace it. A result can satisfy numerical thresholds and still look wrong. The contract should support explicit approval or rejection with a reason that can be converted into a new rule.

## 14. The render-and-compare loop

The intended workflow is iterative:

1. A human or agent creates or edits a contract.
2. The contract is compiled into resolved IR.
3. A preview `EngineSession` generates the affected subtree.
4. The engine renders standard acceptance views and crops.
5. Validators produce a report tied to entities, components, and systems.
6. An agent proposes a small contract patch.
7. The preview regenerates only the invalidated scope.
8. A human approves the result.
9. The accepted contract and generated artifact are promoted.

The validator report should be concrete. Instead of "the trees look bad," it should report findings such as:

- mature pine silhouettes have 4 percent variation, below the 18 percent target
- 63 percent of trees resolve to a single cone-like canopy envelope
- snow shelves repeat the same geometry hash across 21 instances
- central clearing occupancy is 34 percent, above the 12 percent maximum
- foreground branch occlusion covers 29 percent of the hero subject

These findings give the agent a specific place to modify the contract or implementation.

## 15. Authoring format and compiled IR

The long-term authoring experience should be a TypeScript DSL because it supports composition, imports, reusable helpers, editor tooling, and schema-backed custom components.

The DSL should compile to strict JSON IR. JSON is useful as the engine boundary because it is portable, serializable, diffable, and straightforward to validate.

The two layers should have different goals:

### 15.1 Authoring DSL

Optimized for humans and agents:

- typed builders
- reusable archetypes and profiles
- imports
- comments and documentation
- helper functions that expand to declarative data
- clear error messages

### 15.2 Resolved JSON IR

Optimized for the engine:

- no functions
- no unresolved inheritance
- explicit units
- explicit defaults
- stable identifiers
- normalized references
- canonical ordering where practical
- schema version and hashes

The example JSON files in this package are close to resolved IR, but they retain readable labels and descriptions so they can also serve as authoring examples.

## 16. Editing should use commands and events

Agents should not mutate arbitrary files without a traceable operation model. The contract layer fits naturally with Antiky's command and event approach.

Useful commands include:

- `CreateEntity`
- `DeleteEntity`
- `AttachEntity`
- `DetachEntity`
- `SetComponent`
- `PatchComponent`
- `RemoveComponent`
- `CreateRelationship`
- `DeleteRelationship`
- `SetPrototype`
- `RunGenerationScope`
- `RenderAcceptanceViews`
- `EvaluateValidationSuite`
- `PromoteGeneratedArtifact`

Each accepted command produces an event with:

- actor
- timestamp
- source session
- affected contract revision
- before and after hashes
- reason
- validation status

This gives Antiky the ability to replay, audit, branch, compare, and revert agent-authored world changes.

## 17. Preview worlds and promotion

The contract should be generated inside an `EngineSession` that owns a preview `World`. The preview world can use the same command API and renderer as the primary world without directly mutating production state.

A practical promotion flow is:

1. branch the contract revision
2. apply agent commands
3. compile the branch
4. generate in a preview world
5. render and validate
6. approve the contract diff and artifact hashes
7. promote through the command API
8. record a promotion event

This supports safe AI experimentation and keeps the runtime world deterministic and auditable.

## 18. Invalidation and incremental generation

Every component and system should participate in dependency tracking.

Examples:

- changing `environment.windField` invalidates snow accumulation and some vegetation orientation, but not terrain topology
- changing a tree prototype invalidates only populations that reference it
- changing the central clearing mask invalidates population layout and composition validation, but not material definitions
- changing a camera invalidates renders and camera-specific validation, not geometry generation

The compiler should build a dependency graph from system reads and writes. A contract patch can then regenerate the smallest safe scope.

This is important for agent workflows. Full-scene regeneration is slow, expensive, and makes visual comparison noisy.

## 19. Versioning and extensibility

Every contract, component type, system implementation, and generated artifact should carry a version.

Recommended rules:

- semantic version the top-level contract schema
- independently version component schemas
- version system implementations separately from contract data
- preserve migration functions between schema versions
- reject unknown required components
- preserve unknown optional components when round-tripping
- allow custom namespaced components such as `antikylabs.snow.windCarving`

Custom components should be schema-backed and registered before compilation. Agents should be allowed to propose a component definition, but it must pass schema, permission, and compatibility checks before use.

## 20. What belongs in the first version

The first implementation should be intentionally narrow.

### Include in version 0.1

- stable entity IDs
- one-parent ownership tree
- typed relationship edges
- namespaced components
- prototype references
- population entities
- deterministic seed streams
- ordered systems with read/write declarations
- structural validators
- standard render views and crops
- provenance from generated artifacts to source entities
- JSON Schema validation
- TypeScript authoring helpers that compile to JSON

### Defer

- arbitrary behavior scripting
- full physical simulation
- automatic aesthetic scoring without human review
- general-purpose node-based procedural modeling
- cross-game marketplace compatibility
- deeply dynamic runtime ecology
- complex multiplayer synchronization of generation state

The goal of version 0.1 is to prove that a scene contract can consistently produce and improve one high-quality vertical slice.

## 21. Recommended implementation order

1. Define the top-level contract container and entity record.
2. Implement the ownership tree and typed relationships.
3. Define a small component catalog for scene, terrain, populations, archetypes, snow, camera, and validation.
4. Implement schema validation and reference resolution.
5. Add hierarchical deterministic random streams.
6. Build one terrain system and one population placement system.
7. Build one detailed snowy pine generator.
8. Add snow accumulation as a separate surface pass.
9. Render object ID, depth, normal, and beauty passes.
10. Implement structural validators and acceptance crops.
11. Add command/event editing and preview-world promotion.
12. Only then generalize the contract for the canal town and other biomes.

The blue winter grove should be the proving ground. It is constrained enough to finish, but rich enough to test hierarchy, populations, relationships, asset grammars, surface systems, composition, and visual validation.

## 22. The key design rule

The contract should describe enough that two competent generation implementations produce scenes that clearly belong to the same visual and structural family, while still allowing meaningful seeded variation.

If the contract only produces one exact scene, it is a serialized level rather than a generative specification. If it allows any snowy forest, it is only a prompt. The useful space lies between those extremes: constrained, composable, deterministic intent.
