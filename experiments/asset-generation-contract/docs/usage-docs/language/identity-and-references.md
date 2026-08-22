---
status: current
type: explanation
audience: authors reasoning about stable IDs and declaration graphs
applies-to: "@antiky/contracts@0.1.0"
---

# Identity and direct references

Contract identity comes from a scene key and keyed ownership records, while connections in TypeScript use the exact
declaration objects. Keeping identity and references separate lets display prose change without breaking technical IDs.

## Ownership creates IDs

The scene owns reusable things through `definitions` and placed declarations through `cast`. Version 0.1.0 derives IDs
with these forms:

| Owner | Derived ID |
| --- | --- |
| Root scene | `scene.<scene-key>` |
| Thing under `definitions.<key>` | `prototype.<scene-key>.<key>` |
| Region under `cast.<key>` | `region.<scene-key>.<key>` |
| Population under `cast.<key>` | `population.<scene-key>.<key>` |
| Frames relationship | `rel.<scene-key>.frames.<source-cast-key>.<target-cast-key>` |

The scene key, definition keys, cast keys, and acceptance-check keys must match
`^[a-z][a-zA-Z0-9-]*$`. Invalid keys are rejected; the compiler does not sanitize them into a different identity.

A local variable or declaration `name` is not part of the ID. Renaming `pine` to `oldPine` as a local variable changes
nothing if the owning record remains `{ tree: pine }`. Renaming the owning `tree` key changes the prototype ID and every
technical reference to it.

This is the central stability tradeoff: display language can evolve freely, but a keyed-owner rename is an explicit ID
migration.

## References are values before they become IDs

Authoring code passes built declaration values instead of spelling technical strings:

- `thing.basedOn` points to a thing in `scene.definitions`.
- Entries in `thing.parts` point to things in `scene.definitions`.
- Entries in `region.features` point to things in `scene.definitions`.
- `population.of` points to a thing in `scene.definitions`.
- `population.placement.around` points to a region in `scene.cast`.
- `scene.gameplay.playAs` and acceptance-check `subject` point to populations in `scene.cast`.
- `frames(source, target)` points from a cast population to a cast region.

The compiler first binds owned objects to exact IDs, then resolves these object-reference edges. A newly constructed
object with the same fields is a different object and remains unbound. A declaration object owned under two keys is
ambiguous and fails as a duplicate binding.

Direct values give TypeScript enough information to prevent many wrong endpoint kinds and avoid a parallel string-ID
namespace in authoring code. The cost is that the source graph cannot be treated as plain JSON before collection. The
compiler normalizes every reference to an exact ID in its preserved semantic projection and technical output.

## Reachability keeps the graph intentional

A thing in `definitions` must be reachable from placed cast. Reachability can flow through `population.of`, region
`features`, thing `parts`, and `basedOn` specialization. An unreachable definition fails rather than becoming an unused
technical prototype.

The combined `basedOn` and `parts` graph must also be acyclic. The compiler reports every relevant edge as related
evidence when it finds a dependency cycle.

These rules make keyed ownership meaningful: `definitions` is not a general registry of possible things. It is the
reusable subgraph required by this scene.

## Relationship identity follows its endpoints

`frames` is the only current relationship kind. Its ID contains the source and target cast keys, so two relationships
with the same population and region collide even if their option prose differs. Distinct endpoint pairs produce distinct
relationships; Blue Winter Grove currently uses three.

This endpoint-derived identity avoids arbitrary relationship keys, but it means version 0.1.0 cannot express two
independent `frames` statements for one source/target pair. Combine their `coverage`, `opening`, and `avoid` direction
in one relationship.

## Generated references belong to implementation code

After compilation, `contract.refs.ts` exposes ID-keyed branded references for entities, prototypes, relationships, and
systems. These references are for engine and tool code that consumes the resolved contract. They do not replace direct
declaration references inside semantic authoring modules.

The [output reference](../reference/outputs.md) describes the generated maps, and the
[DSL reference](../reference/dsl.md) lists every field that accepts a direct declaration value.
