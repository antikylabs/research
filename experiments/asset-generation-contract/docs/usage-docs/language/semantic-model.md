---
status: current
type: explanation
audience: authors and integrators building a mental model of the contract language
applies-to: "@antiky/contracts@0.1.0"
---

# The semantic model

`@antiky/contracts` separates what a scene must mean from the technical records an engine needs. Authors work in a
small semantic TypeScript language; the compiler supplies project policy, lowers exact declarations, validates the
result, and emits portable data.

## Two contracts serve different readers

The semantic contract speaks in terms such as a grove's intended feeling, a reusable tree, a placed population, and a
relationship between that population and a clearing. This vocabulary is useful to artists, designers, reviewers, and
agents because it preserves direction before a backend implementation is chosen.

The resolved contract speaks in IDs, entities, prototypes, component payloads, ownership, system dependencies,
coordinate policy, and deterministic seeds. This vocabulary is useful to engines and tools because it is finite,
validated, and independent of executable authoring objects.

```text
trusted semantic TypeScript
          |
          v
collect identity and direct-reference edges
          |
          v
expand installed project policy
          |
          v
lower exact fields and retain provenance
          |
          v
validate schema, catalog, ownership, references, and systems
          |
          v
canonical JSON + indexes + typed ID references + manifest
```

Treating the detailed ECS-shaped JSON as the primary authoring language would expose backend structure everywhere.
Treating free prose as executable policy would make compilation subjective and non-repeatable. Version 0.1.0 chooses a
narrow middle: semantic prose is preserved, while only documented, typed values produce documented technical effects.

## Constructors build data, not engine objects

`scene`, `thing`, `region`, and `population` return plain, deeply readonly, runtime-frozen declarations. Constructors
clone author-owned arrays and records, preserve already-built DSL values as direct references, and retain no registry or
callbacks. A declaration is a node in an immutable authoring graph, not a spawned engine entity.

That choice makes source composition ordinary TypeScript while keeping the compiler boundary data-oriented. Its cost is
that object identity matters while the graph is being collected. Equal-looking objects are not interchangeable
references; ownership and identity are explained in [Identity and direct references](identity-and-references.md).

## The profile supplies policy that prose cannot

Semantic direction does not invent coordinate systems, random-stream rules, system implementations, schema versions,
catalog versions, required render passes, or output encodings. The installed `voxelDiorama` profile supplies those
decisions as inspectable frozen data.

Omitting `profiles` selects `voxelDiorama` by default. Explicitly selecting `[voxelDiorama]` records an explicit rather
than default choice, but uses the same policy. An unsupported, duplicated, or modified profile fails instead of
silently merging unknown policy. Runtime validation compares the installed identity and complete contents, so an exact
structural copy is accepted. The public nominal type rejects ordinary object-literal or spread reconstruction, but a
typed API such as `structuredClone(voxelDiorama)` can retain the capability type because runtime validation is
content-based.

The benefit is deterministic expansion. The cost is that version 0.1.0 cannot express a second project policy. A wider
profile system is not implied by the array-shaped field.

## Prose is retained, not interpreted

Fields such as `fantasy`, `feel`, `identity`, `role`, `keep`, `avoid`, and human review questions remain useful semantic
evidence. The compiler can lower some of them into descriptive or validation components and preserves the semantic
projection in provenance. It does not call an AI, infer camera vectors, invent dimensions, generate meshes, or translate
subjective wording into undocumented algorithms.

Explicit value objects mark the places where exact meaning matters. `between(4, 7)` is an inclusive numeric range,
`meters(3, 5)` is a distance range, and a direct declaration reference is an exact graph edge.

## Technical overrides are a narrow escape hatch

A registered component payload can be attached to a thing, region, or population when the semantic language has a real
gap. The compiler still checks the catalog schema, allowed owner kind, conflicts, inheritance, and the complete resolved
contract.

This preserves an escape route without making raw component construction the ordinary language. The cost is coupling:
an override knows a backend component name and schema, so it is more sensitive to catalog evolution than semantic
direction.

## The current language is deliberately finite

Version 0.1.0 has these hard boundaries:

- Definitions are `thing` values; placed cast members are `region` or `population` values; `scene` owns the graph.
- `frames(population, region)` is the only relationship constructor. A scene can contain several distinct `frames`
  relationships, but the same source/target pair produces an ID collision.
- `voxelDiorama` is the only installed profile and is the default when `profiles` is omitted or empty.
- Visual density is `low`, `medium`, `medium-high`, `high`, or `very-high`. The value `dense` is not in the type or the
  runtime-supported enum.
- There are no `game`, `world`, or `scenario` constructors.
- Compilation emits a contract description and provenance. It does not generate artifacts, assets, renders, gameplay
  systems, or receipts proving that downstream work exists.

These limits make current behavior checkable. Names found in design proposals or historical notes are not part of the
shipped language unless they appear in the [package subpath reference](../reference/package-subpaths.md).
