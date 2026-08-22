---
status: current
type: reference
audience: semantic contract authors and tool authors
applies-to: "@antiky/contracts@0.1.0"
---

# DSL reference

Import the semantic authoring API from `@antiky/contracts/dsl`. The package has no root export.

```ts
import {
  between,
  frames,
  meters,
  population,
  referenceImage,
  region,
  scene,
  thing,
  voxelDiorama,
} from '@antiky/contracts/dsl';
```

## Current language limits

| Capability | Version 0.1.0 |
| --- | --- |
| Declaration constructors | `scene`, `thing`, `region`, `population` |
| Relationship constructors | `frames` only |
| Installed profiles | `voxelDiorama` only; default when `profiles` is omitted or empty |
| Visual density values | `low`, `medium`, `medium-high`, `high`, `very-high` |
| Unsupported density | `dense` |
| Unavailable constructors | `game`, `world`, `scenario` |
| Artifact generation | None; compilation describes a contract but does not create assets or renders |

A scene can contain multiple `frames` relationships when their endpoint pairs differ. Repeating the same source and
target produces the same relationship ID and is a blocking collision.

## Constructor behavior

Declaration constructors have the form:

```ts
scene(input: SceneInput): SceneDefinition
thing(input: ThingInput): ThingDefinition
region(input: RegionInput): RegionDefinition
population(input: PopulationInput): PopulationDefinition
```

Each constructor:

- adds its own literal `kind` field;
- rejects an author-supplied `kind`;
- clones author-owned plain objects and arrays;
- preserves already-built DSL values so direct-reference identity is retained;
- returns deeply readonly, runtime-frozen data; and
- rejects functions, `undefined`, symbol values, bigints, non-finite numbers, plain-object accessors or symbol keys,
  non-enumerable plain-object properties, sparse arrays, arbitrary object cycles, and non-plain object prototypes.

Arrays are cloned from their indexed values. Do not attach named or symbol properties to an input array: those
properties are outside the DSL shape and are not preserved. An indexed array accessor is read while the constructor
clones that slot, so use ordinary array data only. The compiler serialization guard reports these array shapes when a
forged value bypasses the constructors and reaches the compilation boundary.

Extra fields on fresh object literals are normally rejected by TypeScript, and declaration constructors add exact-input
checks for the supported nested direction objects. Structurally aliased values can bypass some TypeScript excess-field
checks, including on reference uses, acceptance checks, and `frames` options; compilation still diagnoses unsupported
fields at runtime. Omit an optional property instead of setting it to `undefined`.

## `scene(input)`

`scene` owns the graph and is the only valid contract entry default export.

### `SceneInput`

| Field | Type | Required | Default or constraint |
| --- | --- | --- | --- |
| `key` | `string` | Yes | Must match `^[a-z][a-zA-Z0-9-]*$`; forms root and descendant IDs. |
| `name` | `string` | Yes | Display name; does not affect identity. |
| `profiles` | `readonly ProjectProfile[]` | No | Omitted or empty selects `voxelDiorama`; runtime input must match the installed identity and complete contents. |
| `references` | `readonly ReferenceUse[]` | No | Scene-level reference evidence. |
| `experience` | `ExperienceDirection` | No | Overall experience direction. |
| `visual` | `VisualDirection` | No | Overall visual direction. |
| `gameplay` | `SceneGameplayDirection` | No | Overall player and space direction. |
| `definitions` | `Readonly<Record<string, ThingDefinition>>` | No | Keyed owners of reusable things. |
| `cast` | `Readonly<Record<string, RegionDefinition \| PopulationDefinition>>` | No | Keyed owners of placed subjects. |
| `composition` | `readonly FramesRelationship[]` | No | Only `frames(...)` values are accepted. |
| `rules` | `RulesDirection` | No | Required and forbidden outcomes. |
| `acceptance` | `AcceptanceDirection` | No | Human review questions and population-count checks. |

Keys in `definitions`, `cast`, and acceptance checks use the same key pattern as the scene. One declaration object can
have exactly one keyed owner. Every owned thing must be reachable from cast.

### `ExperienceDirection`

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `fantasy` | `string` | Yes | The scene-level experience promise. |
| `feel` | `readonly string[]` | No | Emotional targets. |
| `firstRead` | `readonly string[]` | No | What must read immediately. |
| `closerLook` | `readonly string[]` | No | What must reward inspection. |

### `SceneGameplayDirection`

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `playAs` | `PopulationDefinition` | No | Direct reference to a population owned by this scene's `cast`. |
| `purpose` | `string` | Yes | Gameplay purpose of the scene. |
| `loop` | `readonly string[]` | No | Intended activity loop. |
| `playerCan` | `readonly string[]` | No | Intended player capabilities. |
| `pace` | `string` | No | Intended pace. |
| `spaceMust` | `readonly string[]` | No | Spatial requirements. |

### `AcceptanceDirection`

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `review` | `readonly string[]` | No | Human review questions. |
| `checks` | `readonly PopulationCountCheck[]` | No | Exact supported machine-checkable semantic checks. |

### `PopulationCountCheck`

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `key` | `string` | Yes | Must match the scoped-key pattern and be unique among checks. |
| `subject` | `PopulationDefinition` | Yes | Direct reference to a population in this scene's `cast`. |
| `measure` | `'population count'` | Yes | No other measure is supported. |
| `expected` | `NumericRange` | Yes | Inclusive range created by `between`. |

## `thing(input)`

`thing` declares a reusable prototype. A thing becomes owned when placed under a key in `scene.definitions`.

### `ThingInput`

| Field | Type | Required | Meaning or constraint |
| --- | --- | --- | --- |
| `name` | `string` | Yes | Display name. |
| `basedOn` | `ThingDefinition` | No | Direct reference to an owned base thing. |
| `parts` | `Readonly<Record<string, ThingDefinition>>` | No | Named direct references to owned things. |
| `references` | `readonly ReferenceUse[]` | No | Item-specific visual evidence. |
| `identity` | `readonly string[]` | No | Features that make the thing recognizable. |
| `shape` | `ThingShapeDirection` | No | Form and exact distance values. |
| `visual` | `VisualDirection` | No | Visual direction for this prototype. |
| `gameplay` | `ThingGameplayDirection` | No | Playability and role direction. |
| `variation` | `VariationDirection` | No | What may change and what must remain. |
| `rules` | `RulesDirection` | No | Required and forbidden outcomes. |
| `avoid` | `readonly string[]` | No | Additional forbidden forms. |
| `technical` | `TechnicalOverride` | No | Validated registered component payloads. |

`basedOn` and `parts` together must form an acyclic definition dependency graph.

### `ThingShapeDirection`

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `form` | `string` | No | Semantic form description. |
| `width` | `Meters` | No | Exact width value or inclusive range. |
| `height` | `Meters` | No | Exact height value or inclusive range. |
| `depth` | `Meters` | No | Exact depth value or inclusive range. |
| `length` | `Meters` | No | Exact length value or inclusive range. |

All dimensions are preserved in semantic provenance. The 0.1.0 lowerer maps `height` and `length` to `core.bounds`;
`width` and `depth` do not currently get a dedicated technical component.

### `ThingGameplayDirection`

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `playable` | `boolean` | No | Whether the thing is intended to be playable. |
| `role` | `string` | Yes | Gameplay role. |
| `playerCan` | `readonly string[]` | No | Capabilities associated with the thing. |

## `region(input)`

`region` declares a placed area. A region becomes owned when placed under a key in `scene.cast`.

### `RegionInput`

| Field | Type | Required | Meaning or constraint |
| --- | --- | --- | --- |
| `name` | `string` | Yes | Display name. |
| `references` | `readonly ReferenceUse[]` | No | Item-specific visual evidence. |
| `purpose` | `readonly string[]` | No | Uses of the space. |
| `shape` | `string` | No | Semantic shape description. |
| `width` | `Meters` | No | Exact width value or inclusive range. |
| `height` | `Meters` | No | Exact height value or inclusive range. |
| `depth` | `Meters` | No | Exact depth value or inclusive range. |
| `length` | `Meters` | No | Exact length value or inclusive range. |
| `features` | `Readonly<Record<string, ThingDefinition>>` | No | Named direct references to owned things. |
| `keep` | `readonly string[]` | No | Outcomes the region must retain. |
| `avoid` | `readonly string[]` | No | Outcomes the region must exclude. |
| `rules` | `RulesDirection` | No | Required and forbidden outcomes. |
| `technical` | `TechnicalOverride` | No | Validated registered component payloads. |

Region dimensions are preserved in semantic provenance in 0.1.0; the region lowerer does not currently derive a bounds
component from them.

## `population(input)`

`population` declares a placed collection of one reusable thing. A population becomes owned when placed under a key in
`scene.cast`.

### `PopulationInput`

| Field | Type | Required | Meaning or constraint |
| --- | --- | --- | --- |
| `name` | `string` | Yes | Display name. |
| `of` | `ThingDefinition` | Yes | Direct reference to an owned thing. |
| `amount` | `NumericRange` | Yes | Inclusive count range created by `between`. |
| `placement` | `PlacementDirection` | No | Placement relative to an owned region. |
| `references` | `readonly ReferenceUse[]` | No | Item-specific visual evidence. |
| `role` | `readonly string[]` | No | Composition or gameplay roles. |
| `variation` | `VariationDirection` | No | Population variation direction. |
| `rules` | `RulesDirection` | No | Required and forbidden outcomes. |
| `technical` | `TechnicalOverride` | No | Validated registered component payloads. |

Without `placement`, population quantity uses scene sampling scope and no distribution component is emitted.

### `PlacementDirection`

| Field | Type | Required | Default or constraint |
| --- | --- | --- | --- |
| `around` | `RegionDefinition` | Yes | Direct reference to a region owned by this scene's `cast`. |
| `pattern` | `'loose clusters'` | No | Omitted uses the general around-region lowering. No other literal is supported. |
| `spacing` | `Meters` | No | Exact spacing value or inclusive range. |
| `leave` | `readonly string[]` | No | Gaps or areas to preserve. |
| `avoid` | `readonly string[]` | No | Placement outcomes to avoid. |

## Shared direction types

### `ReferenceUse`

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `image` | `ReferenceImage` | Yes | Value created by `referenceImage(path)`. |
| `use` | `string` | Yes | Must be non-empty at compile time; states how this owner uses the image. |

### `VisualDirection`

| Field | Type | Required | Meaning or constraint |
| --- | --- | --- | --- |
| `language` | `string` | Yes | Primary visual language. |
| `lighting` | `string` | No | Lighting direction. |
| `density` | `VisualDensity` | No | `low`, `medium`, `medium-high`, `high`, or `very-high`; not `dense`. |
| `silhouettes` | `string` | No | Silhouette direction. |
| `detail` | `string` | No | Detail direction. |
| `avoid` | `readonly string[]` | No | Visual styles or forms to avoid. |

All fields are preserved in semantic provenance. The current `style.visualLanguage` component maps `language` to
`primary`, retains `density`, and maps `avoid` to `antiStyles`; `lighting`, `silhouettes`, and `detail` do not get
dedicated technical fields in 0.1.0.

### `VariationDirection`

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `vary` | `readonly string[]` | Yes | Properties allowed or expected to vary. |
| `preserve` | `readonly string[]` | No | Properties that variation must retain. |
| `avoid` | `readonly string[]` | No | Variation outcomes to exclude. |

### `RulesDirection`

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `must` | `readonly string[]` | No | Required outcomes; lowered to human-review criteria. |
| `avoid` | `readonly string[]` | No | Forbidden outcomes; lowered to human-review criteria and, where applicable, forbidden forms. |

### `TechnicalOverride`

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `components` | `Readonly<Record<string, JsonObject>>` | Yes | Names and JSON payloads must pass the installed catalog and cannot conflict with semantic lowering. |

Technical overrides are available only on things, regions, and populations. They cannot add systems or bypass final
validation. See [Use a technical override](../how-to/use-technical-overrides.md).

## Relationships

### `frames(source, target, options?)`

```ts
frames(
  source: PopulationDefinition,
  target: RegionDefinition,
  options?: FramesOptions,
): FramesRelationship
```

| Parameter or field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `source` | `PopulationDefinition` | Yes | Population owned by this scene's `cast`. |
| `target` | `RegionDefinition` | Yes | Region owned by this scene's `cast`. |
| `options.coverage` | `string` | No | Desired edge coverage. |
| `options.opening` | `string` | No | Desired opening. |
| `options.avoid` | `string` | No | Framing outcome to avoid. |

The returned value has `kind: 'frames'`. It lowers to relationship type `composition.frames`, marked `required: true`.

## Value constructors

### `between(min, max)`

```ts
between(min: number, max: number): NumericRange
```

Returns frozen `{ kind: 'range', min, max }` data branded at compile time. Endpoints must be finite and `min <= max`.
The range is inclusive when used for population count and acceptance checks.

### `meters(value)` and `meters(min, max)`

```ts
meters(value: number): Meters
meters(min: number, max: number): Meters
```

Returns frozen `{ kind: 'meters', value }` data. One argument is an exact distance. Two arguments create an inclusive
`NumericRange`. Inputs must be finite and a range minimum must not exceed its maximum.

### `referenceImage(path)`

```ts
referenceImage(path: string): ReferenceImage
```

Returns frozen `{ kind: 'reference-image', path }` data. Construction rejects an empty string. During compilation, the
path must also be relative to the `.contract.ts` entry, exist, and resolve inside `projectRoot`. See
[Use reference images](../how-to/use-reference-images.md).

### `voxelDiorama`

`voxelDiorama` is the only installed `ProjectProfile` value. Its identity is `voxel-diorama@0.1.0`. It is deeply frozen
and exposes coordinate, seed, schema, catalog, systems, validation, render, and output policy for inspection. Profile
construction types are not exported from the public DSL subpath; import the installed value instead of recreating it.
At the runtime boundary, an exact structural copy with the installed identity and contents is accepted, while modified
or unsupported contents are diagnosed.

## Public exported types

| Group | Exported types |
| --- | --- |
| Scene | `SceneInput`, `SceneDefinition`, `ExperienceDirection`, `SceneGameplayDirection`, `AcceptanceDirection`, `PopulationCountCheck` |
| Thing | `ThingInput`, `ThingDefinition`, `ThingShapeDirection`, `ThingGameplayDirection` |
| Region | `RegionInput`, `RegionDefinition` |
| Population | `PopulationInput`, `PopulationDefinition`, `PlacementDirection` |
| Shared direction | `ReferenceUse`, `VisualDirection`, `VisualDensity`, `VariationDirection`, `RulesDirection`, `TechnicalOverride` |
| Relationships | `FramesOptions`, `FramesRelationship` |
| Values | `Range`, `NumericRange`, `Meters`, `ReferenceImage` |
| Unions | `CastDefinition`, `Definition`, `DslValue` |
| JSON utilities | `JsonPrimitive`, `JsonValue`, `JsonObject`, `DeepReadonly` |

The exact package boundary is listed in [Package subpaths](package-subpaths.md).
