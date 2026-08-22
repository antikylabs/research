# Antiky Declarative TypeScript DSL Redesign

**Status:** Proposed replacement for the authoring API in [DSL_DESIGN.md](DSL_DESIGN.md)

TypeScript should remain Antiky's primary contract language. The redesign is not a natural-language document that an AI interprets. It is a small, typed, declarative ECS for game design: authors describe experience, visual direction, gameplay direction, reusable parts, the important things in a game or scene, how those things relate, what may vary, and how success is judged.

The compiler still emits the detailed entity-component graph, schemas, IDs, system dependencies, validation records, indexes, hashes, and artifact requirements. Those are compiler concerns. The primary DSL should expose the creative model, not ask the author to assemble the production model by hand.

## The smallest useful contract

```ts
import { scene } from '@antiky/contracts/dsl';

export default scene({
  key: 'blue-winter-grove',
  name: 'Blue Winter Grove',

  experience: {
    fantasy: 'Enter a sheltered winter grove that feels ancient and still.',
    feel: ['quiet', 'cold', 'safe', 'slightly mysterious'],
    firstRead: [
      'an open clearing',
      'one memorable mature pine',
      'deep forest beyond',
    ],
    closerLook: ['branch forks', 'bark', 'snow shelves', 'roots', 'twigs'],
  },

  visual: {
    language: 'rich, dense voxel diorama',
    lighting: 'painterly blue hour',
    density: 'dense',
    silhouettes: 'layered, irregular, and clearly separated',
    avoid: ['Minecraft-like cubes', 'single-cone trees', 'uniform scatter'],
  },

  gameplay: {
    purpose: 'quiet exploration and close observation',
    playerCan: ['move through the clearing', 'approach the focal pine', 'inspect details'],
    pace: 'unhurried',
    spaceMust: ['keep the clearing readable and traversable'],
  },

  rules: {
    must: ['old pines frame the clearing without closing it off'],
    avoid: ['repeated silhouettes', 'obvious grids', 'flat painted-on snow'],
  },

  acceptance: {
    review: [
      'Does the scene immediately read as a quiet blue-hour winter grove?',
      'Does closer inspection reveal deliberate detail without visual noise?',
    ],
  },
});
```

This is TypeScript, but it reads as game direction. It has autocomplete, imports, reusable values, ordinary refactoring, comments, and compile-time errors. It does not require the author to know component catalog names, entity kinds, relationship IDs, system phases, camera vectors, schema versions, or generation implementation names.

This is also a valid minimal scene. The compiler supplies the technical defaults selected by the project profile and emits a root scene contract. The author adds reusable definitions, cast, spatial structure, exact ranges, and specialized validation only when those details matter to the direction.

## The design rule

The primary DSL is a **semantic ECS**. The compiled contract is a **technical ECS**.

```text
declarative TypeScript          semantic lowering             resolved contract

game                            experience                     entities
world                           visual direction               components
scene                           gameplay direction             relationships
scenario            ───▶       cast and spatial roles  ───▶   systems
thing                           creative rules                 validation
region                          acceptance                     stable IDs
population                     project profiles               hashes and indexes
```

Both layers are declarative. They serve different readers.

- The semantic ECS uses the vocabulary of game development and creative direction.
- The technical ECS uses the vocabulary required by generators, validators, editors, and the engine.

One semantic component may lower into several technical components, relationships, and validators. That is the abstraction doing useful work.

## Why the current API is still too close to JSON

The current compact fixture is 414 lines. It contains 17 direct `component(...)` calls plus explicit prototypes, refs, relationships, systems, schemas, deterministic stream configuration, render passes, camera vectors, and output paths.

The current helpers improve syntax safety, but they leave the author responsible for the same model as the JSON:

```ts
component('population.distribution', {
  algorithm: 'clustered-poisson-with-composition-masks',
  avoidGrid: true,
  minimumSpacingM: [2.2, 4.8],
});
```

A game developer should write the decision instead:

```ts
placement: {
  pattern: 'loose clusters',
  spacing: meters(2.2, 4.8),
  avoid: ['grids', 'a continuous tree wall'],
},
```

The lowerer selects the installed placement implementation, writes the catalog payloads, creates required relationships and masks, and attaches validators. The implementation remains versioned and inspectable, but it is not part of ordinary creative direction.

## What declarative means here

Authoring modules declare immutable data. They do not run the game or imperatively mutate a contract.

- `scene(...)` and the other constructors return authoring records.
- Object fields are semantic components.
- Arrays preserve intentional ordering.
- Imported definitions are reusable values.
- `basedOn` specializes a reusable thing; named `parts` compose things into a larger thing.
- `definitions` binds reusable things; `cast` binds placed scene subjects.
- Passing one definition to another creates a typed reference.
- `referenceImage(...)` creates one reusable image value that declarations tag with a specific use.
- Relationship helpers return declarative edges.
- No builder mutates global registration state.
- No callback becomes runtime gameplay or generation code.
- Compiler defaults come from named, versioned profiles.

Ordinary pure TypeScript helpers may return authoring data. This keeps composition without turning the DSL into a fluent API or a runtime scripting language.

## Reusable things form a dependency graph

Important subparts need their own definitions when another author, lowerer, planner, or generator must
know what they mean. A crown should not be an unexplained string embedded in a tree, and three named
characters should not disappear into one party description.

```ts
const partyAnchor = referenceImage('./party-anchor.png');

const character = thing({
  name: 'Playable field character',
  references: [{ image: partyAnchor, use: 'shared sprite craft and proportions' }],
  gameplay: {
    playable: true,
    role: 'explore through movement, observation, and inspection',
  },
});

const vanguard = thing({
  name: 'Indigo-hooded vanguard',
  basedOn: character,
  references: [{ image: partyAnchor, use: 'left character identity and equipment' }],
});

const scholar = thing({ name: 'Rust-coated scholar', basedOn: character });
const scout = thing({ name: 'Moss-cloaked scout', basedOn: character });

const party = thing({
  name: 'Winterbound party',
  parts: { vanguard, scholar, scout },
});

const roundedCrown = thing({
  name: 'Rounded snow-loaded crown',
  identity: ['branch-supported snow clusters', 'irregular gaps'],
});

const warmForkedTrunk = thing({ name: 'Warm forked trunk' });
const frostBentTrunk = thing({ name: 'Frost-bent trunk', basedOn: warmForkedTrunk });

const groveTree = thing({
  name: 'Rounded-canopy winter tree',
  parts: { crown: roundedCrown, trunk: warmForkedTrunk },
});

const landmarkTree = thing({
  name: 'Frost-bent landmark tree',
  parts: { crown: roundedCrown, trunk: frostBentTrunk },
});
```

`basedOn` means prototype specialization. `parts` is a record of semantic role to direct thing
reference. The same part may be reused by several composites. The record key says what the part does
in that whole; the referenced definition says what the part is.

The compiler rejects specialization and part cycles. It lowers `basedOn` through prototype
inheritance. It preserves the exact part graph and its source paths in canonical semantic provenance
and the contract index even when the current technical catalog has no honest operational mapping for
a part. It must never flatten an unexplained part name back into prose or pretend to generate assembly
logic that the backend does not implement.

## The primary vocabulary

The first version needs a small set of entity archetypes:

| Constructor | Describes |
|---|---|
| `game` | The experience promise, core loop, global direction, and scope |
| `world` | Shared fiction, rules, visual identity, regions, and scenes |
| `scene` | One place, its cast, composition, local gameplay, and acceptance |
| `scenario` | A situation, trigger, player objective, flow, and expected outcome |
| `thing` | A reusable prop, part, creature, character, party, material family, or composite asset identity |
| `region` | A meaningful area, volume, route, boundary, or piece of terrain |
| `population` | A generated collection of things with amount, placement, roles, and variation |

These are author-facing archetypes over the same ECS. They are not separate runtimes or separate compiler architectures.

The common semantic components are:

| Component | Author controls |
|---|---|
| `references` | Which source images govern a definition or scene, and what each image controls there |
| `experience` | Fantasy, emotion, first read, closer read, and player understanding |
| `visual` | Visual language, shape, palette, lighting, density, detail, and anti-direction |
| `gameplay` | Player verbs, loop, pace, pressure, affordances, and spatial needs |
| `narrative` | Premise, meaning, environmental story, voice, and exclusions |
| `audio` | Soundscape, rhythm, emphasis, silence, and exclusions |
| `composition` | Focus, framing, negative space, depth, rhythm, and flow |
| `variation` | What changes, how much it changes, and what identity must survive |
| `rules` | Non-negotiable requirements and forbidden outcomes |
| `acceptance` | Measurable checks, reference views, and human-review questions |

Not every archetype accepts every component. TypeScript should reject a gameplay loop attached to a material definition or population placement attached to a game root.

This author-facing catalog should stay small. It must not become a friendly alias for every technical component in the backend catalog.

## Adding definitions, cast, and spatial direction

The author introduces entities only for subjects that matter creatively. Local `definitions` and `cast` keys provide stable, readable identity without repeating long IDs.

```ts
import {
  between,
  frames,
  meters,
  population,
  region,
  scene,
  thing,
} from '@antiky/contracts/dsl';

const matureSnowPine = thing({
  name: 'Mature snow pine',
  identity: [
    'tall and old',
    'visible trunk and branch structure',
    'irregular crown with gaps through the foliage',
  ],
  shape: {
    height: meters(11.5, 17.5),
    crown: 'asymmetrical and layered',
  },
  variation: {
    vary: ['height', 'lean', 'branch loss', 'silhouette', 'snow load'],
    preserve: ['mature proportions', 'readable branch tiers', 'family resemblance'],
  },
  avoid: ['single-cone crowns', 'perfect symmetry', 'uniform branches'],
});

const clearing = region({
  name: 'Sheltered clearing',
  purpose: ['visual breathing room', 'player entry and movement'],
  shape: 'irregular oval',
  width: meters(18, 22),
  keep: ['the middle open', 'a visible route into deep forest'],
});

const oldGrowth = population({
  name: 'Old-growth pines',
  of: matureSnowPine,
  amount: between(22, 34),
  placement: {
    around: clearing,
    pattern: 'loose clusters',
    spacing: meters(3.2, 5.8),
    leave: ['several perimeter gaps', 'an open view toward deep forest'],
  },
  role: ['frame the clearing', 'establish height', 'create depth layers'],
  variation: {
    vary: ['cluster size', 'tree height', 'snow load'],
    avoid: ['grid spacing', 'neighbouring duplicate silhouettes'],
  },
});
```

The scene attaches those definitions and declares only the relationship that carries creative meaning:

```ts
export default scene({
  key: 'blue-winter-grove',
  name: 'Blue Winter Grove',

  // experience, visual, gameplay, rules, and acceptance from the small example

  definitions: { matureSnowPine },
  cast: { clearing, oldGrowth },

  composition: [
    frames(oldGrowth, clearing, {
      coverage: 'most, but not all, of the clearing edge',
      opening: 'toward deep forest',
      avoid: 'a continuous tree wall',
    }),
  ],
});
```

The compiler derives scoped IDs from `blue-winter-grove`, `matureSnowPine`, `clearing`, and `oldGrowth`. `definitions` owns reusable `thing` identities; `cast` owns placed region and population identities. The author passes those values directly, so there is no `ref('region.clearing.primary')` bookkeeping and no unresolved string reference after a normal refactor.

## Game and gameplay direction use the same model

The DSL is not limited to visual scenes. Game, world, scene, and scenario definitions use the same semantic components at different scopes.

```ts
import { game } from '@antiky/contracts/dsl';
import { winterWorld } from './worlds/winter-world.contract.ts';

export default game({
  key: 'the-long-winter',
  name: 'The Long Winter',

  experience: {
    fantasy: 'Find warmth and signs of life in a frozen, beautiful world.',
    pillars: ['quiet exploration', 'strong first reads', 'details worth approaching'],
  },

  gameplay: {
    playerRole: 'a solitary traveller who survives by observing the world',
    verbs: ['move', 'observe', 'inspect', 'interact'],
    loop: ['enter a place', 'read it', 'notice a landmark', 'approach', 'discover'],
    pace: 'deliberate and curious',
    pressure: 'weather and uncertainty, not constant combat',
    avoid: ['loot treadmills', 'checklist exploration', 'disposable scenery'],
  },

  visual: {
    language: 'dense handcrafted voxel worlds with clear composition',
    detail: 'simple at first read, rich at inspection distance',
  },

  worlds: {
    winter: winterWorld,
  },
});
```

This is gameplay direction, not gameplay implementation. A scenario or artifact planner may turn it into requirements for controls, state, interactions, UI, tests, or engine systems. The DSL does not embed per-frame callbacks or arbitrary behavior code.

## A contract is a playable design artifact

A scene contract is not an image description with implementation metadata attached. It should let a
game designer explain who the player is, what they do, what draws their attention, and why the place
rewards play. It should let an artist trace each important form and character to visual evidence. It
should let a producer identify reusable definitions, placed subjects, dependencies, constraints, and
the evidence needed to call the result complete.

That shared artifact keeps disciplines consistent:

- `experience` states the promise made to the player.
- scene `gameplay` names the controlled subject, local loop, actions, pace, and spatial needs.
- thing `gameplay` explains how a playable character or interactive prop contributes to play.
- definitions, parts, features, populations, and relationships state what production must keep
  coherent.
- reference uses and acceptance state how humans judge whether the result still matches the design.

The contract may direct gameplay without claiming that controls, interactions, or runtime systems
already exist. Those become downstream requirements and tangible artifacts with their own evidence.

## TypeScript is the grammar; prose is intent

The redesign keeps the useful boundary between structured and subjective direction.

Typed fields carry facts the compiler must understand deterministically:

- entity scope and archetype
- local identity
- references between definitions
- counts, ranges, units, and allowed enums
- relationship type and endpoints
- required versus optional direction
- profile selection
- acceptance method

Strings carry creative intent that should remain readable:

- fantasy and emotional target
- visual language
- player read
- purpose and role
- desired or forbidden forms
- human-review questions

The compiler must not secretly convert “cinematic,” “dense,” or “fun” into arbitrary numeric thresholds. A typed semantic field may have a documented lowering, and a project profile may supply a named default. Otherwise the phrase remains descriptive intent or human-review criteria.

There is no model-driven interpretation step in the build. An AI may help a developer author or edit the TypeScript, but compilation remains ordinary deterministic program execution followed by validation and lowering.

## Deterministic lowering

Semantic components lower through versioned rules.

| Author declaration | Example technical output |
|---|---|
| `experience` | `description.intent`, player-read metadata, human-review criteria |
| `visual` | visual-language, detail-profile, forbidden-form, palette, and lighting components |
| `gameplay` | game/scenario intent, player affordance, loop, spatial requirement, and artifact requirements |
| `thing` | prototype entity, specialization, preserved part graph, bounds, form grammar, material roles, and variation components |
| `region` | region entity, bounds or mask, clearance, purpose, and ownership records |
| `population` | prototype mix, quantity, distribution, variation, and composition-role components |
| `frames(a, b)` | typed relationship, composition constraints, and relevant validators |
| `acceptance` | automated validation rules, acceptance views, and human-review records |

Lowerers may use named project profiles for technical policy such as coordinate systems, seed streams, default render passes, system implementations, and canonical output paths.

Every lowered record should retain provenance to:

- the authoring file and semantic field
- the lowerer and version
- the selected project profile and version
- any explicit technical override

This preserves creative traceability without inserting technical configuration into the authoring file.

## Defaults should be named and inspectable

The small example works because the project supplies a default profile, not because the compiler guesses.

```ts
export default scene({
  key: 'blue-winter-grove',
  name: 'Blue Winter Grove',
  profiles: [voxelDiorama, blueHour, exploratoryScene],
  // creative direction...
});
```

A profile may select:

- units and coordinate policy
- deterministic seed policy
- renderer and output passes
- standard camera intents
- generation and validation systems
- default density or detail ranges
- artifact requirements

Profiles are reusable typed values. Their expansion is visible in compiler output and provenance. Explicit scene direction wins over profile defaults; incompatible explicit directions produce a diagnostic rather than a silent winner.

## Stable identity without long IDs everywhere

Stable identity remains necessary. The authoring model makes it local.

- A root contract has one short stable `key`.
- Entries in `definitions`, `cast`, `worlds`, `scenes`, and similar records use their property key as scoped identity.
- Imported definition records receive identity from their explicit `definitions` key; a future packaged contract library may provide its own contract key.
- Passing a definition value creates a typed reference.
- The compiler expands scoped keys into exact engine-facing IDs.
- Renaming a scoped key is an identity migration and should use an explicit rename tool.
- Renaming labels, prose, or variables does not change identity.

Generated indexes still expose full IDs for engine code and advanced tooling. The primary DSL does not repeat them.

## Relationships should express meaning

Authors should declare relationships that affect creative direction:

```ts
composition: [
  frames(oldGrowth, clearing),
  reveals(path, shrine, { timing: 'after the second bend' }),
  shelters(ridge, village, { from: prevailingWind }),
];
```

The first version should provide a small typed vocabulary for common spatial, compositional, ecological, narrative, and gameplay relationships. A generic advanced relationship API may exist, but the main DSL should not require raw catalog strings and rule payloads.

Do not create a bespoke helper for every possible sentence. Add a relationship helper when it has stable domain meaning and a deterministic lowering used by more than one contract.

## Diagnostics should use semantic paths

Good author-facing diagnostics point to the declaration the developer wrote:

```text
oldGrowth.placement surrounds clearing, but scene.rules requires an open view.
Add an opening to the placement direction or make enclosure optional.
```

The compiler may also include a stable error code and the resolved JSON path for tooling. It should not make the author debug `/relationships/17/rule/openViewAzimuthDegrees` when the source concept is `oldGrowth.placement.leave`.

TypeScript catches local shape and reference errors. Runtime compilation still catches cross-record conflicts, invalid ranges, unsupported lowerings, cycles, schema failures, and non-serializable values.

## Progressive disclosure

The common path stays small:

1. Start with experience, visual, gameplay, rules, and acceptance.
2. Add named definitions and cast only for subjects or parts that need control, reuse, or traceability.
3. Add exact ranges and relationships only for intentional constraints.
4. Select or define reusable profiles for repeated technical policy.
5. Use a technical override only when the semantic DSL cannot express a real requirement.

An expert escape hatch may attach validated backend components:

```ts
technical: {
  components: {
    'antikylabs.snow.windCarving': {
      ridgeScaleM: 1.8,
      intensity: 0.62,
    },
  },
},
```

This is deliberately more technical. It belongs near the specific definition that needs it, remains schema-validated, and must never become necessary for ordinary visual or gameplay direction.

## Alternatives considered

### Raw typed ECS builders

This is the current direction. It has excellent schema safety and maps cleanly to the output, but it makes the game developer author the compiler's model. It should survive as an internal or advanced core API, not the primary DSL.

### Markdown or free-form natural language

This makes the first example extremely readable, but it moves grammar, references, reuse, ambiguity, autocomplete, and deterministic meaning into a resolver. It is useful for briefs and agent input, not the primary contract language.

### Fluent sentence-like TypeScript

Calls such as `place.inClusters().around(clearing).withGaps()` can read well in a demo. At scale they create a large method vocabulary, awkward conditional composition, and complex type machinery. Plain object-shaped declarations are easier to scan, diff, generate, and extend.

### Chosen: object-shaped semantic TypeScript

TypeScript provides the grammar, structure, imports, references, and type safety. Semantic fields use game-development vocabulary. Pure constructors and relationship helpers add only the places where types or identity matter. The lowerer absorbs the technical graph expansion.

The cost is maintaining two related models: the semantic authoring catalog and the technical backend catalog. That cost is justified only if semantic declarations regularly lower into several technical records. A semantic component that merely renames one backend field is a shallow abstraction and should not be added.

## What remains from the existing design

Keep:

- TypeScript as the trusted primary authoring language
- pure declarative builders and ordinary imports
- canonical JSON as the engine boundary
- schema and component-catalog validation
- ownership and relationship graphs in resolved IR
- prototype and reference resolution
- deterministic canonicalization, hashing, and emission
- generated exact refs, indexes, provenance, and artifact requirements
- the full Blue Winter Grove JSON as a backend compatibility fixture

Replace or demote:

- direct `component(type, payload)` calls in the normal DSL
- `defineSystem` in creative authoring
- manual ownership groups that exist only for compiler structure
- raw relationship catalog names and rule payloads
- explicit coordinate, determinism, render-pass, and output plumbing in every scene
- the current 414-line compact fixture as the usability target

## First implementation boundary

[GOAL.md](../GOAL.md) operationalizes this authoring boundary alongside the compiler and validation requirements. If it drifts back toward raw technical authoring, this redesign remains authoritative.

The first vertical slice should implement:

1. `scene`, `thing`, `region`, `population`, and `referenceImage` authoring types.
2. `experience`, `visual`, `gameplay`, `rules`, `variation`, and `acceptance` semantic components.
3. Reusable thing specialization through `basedOn` and named whole-part composition through `parts`.
4. Scoped identity through root, `definitions`, and `cast` record keys.
5. Direct typed references by passing definition and reference-image values.
6. Archetype-specific gameplay direction for the scene and playable things.
7. One `frames` relationship helper.
8. One named project profile for technical defaults.
9. Deterministic lowerers into the supplied scene schema and component catalog.
10. A compact Blue Winter Grove scene entry under 120 lines, supported by focused readable modules.
11. Type-level, runtime, schema, reference, and deterministic-output tests.
12. Validation of the existing full JSON fixture without modifying it.

This slice should prove the semantic boundary before implementing all backend components or every game/world/scenario concept.

## Acceptance tests for the redesign

### Primary authoring experience

- The primary source file is TypeScript.
- A game developer can understand the compact fixture without reading the backend component catalog.
- The scene entry is under 120 lines without compressed multi-field formatting; focused sibling modules hold reusable definitions and remain ordinary readable TypeScript.
- The complete fixture module set contains no direct `component(...)`, `ref(...)`, `defineSystem`, raw catalog component names, system phases, camera vectors, schema versions, or long engine IDs.
- Experience, visual direction, gameplay direction, definitions, cast, composition, variation, rules, and acceptance are discoverable through autocomplete.
- Each adventurer has a definition based on a shared character; the party names those characters as parts; at least one tree part is defined once and reused.
- Important definitions, regions, populations, and the scene carry image-reference uses rather than relying on one unscoped image list.
- Changing mood, first read, player verbs, density, focal subject, forbidden style, or acceptance requires one local edit.

### Declarative ECS behavior

- Builders return immutable authoring data and do not mutate global state.
- Entity archetypes accept only semantic components valid for their scope.
- `definitions` and `cast` record keys provide stable scoped identity.
- Passing definition values creates lossless typed references.
- `basedOn`, `parts`, and region features form an acyclic, indexed semantic dependency graph.
- Semantic relationships lower into validated technical graph edges.
- Pure TypeScript composition and imports work without embedding runtime behavior.

### Technical integrity

- The same TypeScript input, profiles, schemas, catalog, and compiler version produce byte-identical output.
- No AI or natural-language resolver runs during compilation.
- Every expanded technical record traces to a semantic field, named profile, or explicit override.
- The resolved contract passes schema, catalog, ownership, reference, relationship, and system validation.
- Existing verbose engine-facing artifacts remain plain, canonical, versioned, and hashable.

## The new key rule

The DSL should feel like designing a game in TypeScript, not serializing the engine in TypeScript.

The author chooses the experience, visual identity, gameplay direction, important entities, meaningful relationships, variation, constraints, and definition of success. The semantic ECS expresses those choices clearly. The compiler owns the technical expansion.
