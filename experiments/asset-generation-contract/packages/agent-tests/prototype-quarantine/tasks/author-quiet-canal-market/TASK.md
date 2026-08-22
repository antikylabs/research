# Author Quiet Canal Market

Create `src/quiet-canal-market.contract.ts` as a readable semantic TypeScript contract using the
public `@antiky/contracts/dsl` API and its `voxelDiorama` profile. Export the scene as the default
export. Do not author raw technical ECS components, systems, IDs, or resolved JSON.

Use this preserved compact brief exactly as the source direction:

- Name: Quiet Canal Market.
- Identity: a fantasy canal town inspired by layered JRPG towns.
- Canals are the primary streets. Bridges are arched stone. The named districts are market,
  residential, and dock.
- Facades must have depth; flat walls are forbidden.
- Architecture uses stucco, brick, wood, and stone. Closer detail includes window boxes, lanterns,
  cracked plaster, moss, and trim.
- Cobblestone size varies over the source range 2–7 (the source gives no unit), height varies, and
  cracks and moss are present. Tiling is forbidden.
- Props include boats, crates, barrels, awnings, signs, and plants.
- Human review asks whether shopfront density is high, empty facades are absent, Minecraft style is
  avoided, and generic German cottage style is avoided.

The scene key must be `quiet-canal-market`. The machine-evaluated authoring shape is deliberately
narrow:

- Use exactly four cast entries named `canals`, `market`, `residential`, and `dock`. Each entry is a
  region. Do not add other cast entries or entities. This task has zero population entities.
- Do not add definitions. This task has zero prototypes.
- Do not add composition edges. This task has zero relationships.
- Do not add reference images. This task has zero references.
- Give `canals` exactly one purpose item: `primary streets`.
- Supply exactly four human-review questions, covering the four review subjects in the brief. The
  wording of those questions is yours.

Keep bridges, architecture, ground, and props as scene-level semantic prose, rules, or review
direction. Do not turn them into extra entities, definitions, relationships, or references.
Preserve subjective direction as semantic prose or human-review questions; do not invent
measurements or algorithms.

Only `src/quiet-canal-market.contract.ts` is writable. The benchmark will typecheck it, compile it
twice, validate the resolved contract, and inspect exact semantic and graph results.
