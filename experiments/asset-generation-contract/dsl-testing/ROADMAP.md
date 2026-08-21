# Antiky Contract DSL Roadmap

This roadmap deliberately separates authoring, compilation, traceability, artifact planning, and generation. Each goal should be independently useful and small enough for one focused agent task or pull request.

## Goal 1 — Scene DSL and deterministic compiler

**Outcome:** A TypeScript authoring module compiles into validated, canonical JSON IR compatible with the uploaded scene-contract model.

**Includes:**

- separate `@antiky/contracts` package
- scene, prototype, entity, relationship, system, and custom-component builders
- catalog-backed typing and payload validation
- nested ownership-tree authoring
- prototype inheritance resolution
- reference and system-DAG validation
- deterministic output and hashes
- `resolved-contract.json`, `diagnostics.json`, `contract-index.json`, `contract.refs.ts`, and `build-manifest.json`
- minimal Blue Winter Grove DSL fixture
- full existing Blue Winter Grove JSON validation fixture

**Excludes:** actual asset generation, artifact receipts, prompt packs, runtime trace scanning, game/world/scenario DSLs.

**Exit criterion:** Every acceptance criterion in [GOAL.md](GOAL.md) passes.

---

## Goal 2 — Artifact requirements and receipts

**Outcome:** The compiler/planner can answer, “What tangible things should exist, and which are missing or stale?”

**Includes:**

- neutral `artifact-requirements.json`
- schema for artifact receipts
- content hashes tying receipts to contract slices and implementation versions
- states: `missing`, `blocked`, `ready`, `satisfied`, `stale`, and `invalid`
- requirements derived from prototypes, systems, acceptance views, validators, and declared outputs
- deterministic status calculation

**Excludes:** vendor-specific prompts and actual generation.

**Exit criterion:** A fixture with one valid receipt, one stale receipt, and one missing artifact produces the expected statuses and explanations.

---

## Goal 3 — Agent work-item and prompt adapters

**Outcome:** Missing or stale artifact requirements become small, bounded tasks usable by different coding agents.

**Includes:**

- agent-neutral `work-items.json`
- minimal contract slices rather than entire contracts
- dependency-aware ordering
- Markdown renderer shared by all agents
- optional Codex, Claude Code, and OpenCode wrappers
- one work item per artifact or tightly coupled artifact group
- explicit allowed paths, expected outputs, validation commands, and trace requirements

**Excludes:** automatic multi-agent orchestration and engine generation.

**Exit criterion:** The same requirement renders into semantically equivalent tasks for all supported agents without embedding vendor-specific concepts in core IR.

---

## Goal 4 — Implementation trace graph

**Outcome:** Users can navigate from a contract node to implementation code and generated artifacts, and back again.

**Includes:**

- static TypeScript trace declarations using generated refs
- scanner/indexer for `fulfills`, `relatesTo`, `generatedFrom`, `validates`, and `dependsOn`
- generated-artifact receipt ingestion
- bidirectional `trace-manifest.json`
- stale-link and orphan detection
- editor/query API

**Excludes:** visual graph UI unless it is trivial to add.

**Exit criterion:** The snowy-pine prototype, its generator module, its tests, its generated voxel artifact, and its validation report are connected in both directions.

---

## Goal 5 — First tangible generator: mature snowy pine

**Outcome:** One prototype contract produces a deterministic, inspectable voxel tree artifact and validation metrics.

**Includes:**

- one versioned tree-geometry implementation
- deterministic seed handling
- semantic materials
- snow-receiver pass integration or a narrow stubbed equivalent
- artifact receipt and provenance
- structural validation for silhouette, taper, negative space, and duplicate output
- one acceptance render/crop if rendering infrastructure exists

**Excludes:** full scene population, terrain, complete snow simulation, other asset classes.

**Exit criterion:** Two runs with the same inputs match; controlled seed changes produce valid variation; the artifact receipt links back to the mature-pine prototype and generator version.

---

## Goal 6 — Blue Winter Grove scene slice

**Outcome:** The scene contract produces terrain, one pine population, a protected clearing, a hero camera, renders, and validation.

**Includes:**

- narrow terrain form
- old-growth pine population placement
- clearing exclusion/preservation
- hero camera
- scene bundle
- acceptance render(s)
- structural and compositional validators
- preview-world promotion flow if the engine already supports it

**Exit criterion:** The contract can be changed, recompiled, incrementally regenerated, validated, and traced without hand-editing generated artifacts.

---

## Goal 7 — Game, world, and scenario contracts

**Outcome:** The same authoring and trace model expands above scenes to game intent and gameplay scenarios.

**Includes:**

- `defineGame`, `defineWorld`, and `defineScenario`
- experience pillars, camera/control intent, core loop, vertical-slice scope, and explicit non-goals
- scenario objectives and expected player experience
- artifact requirements for gameplay modules, tests, UI, and content
- links from gameplay implementation to scenario and objective refs

**Exit criterion:** A small inspect-the-tree scenario compiles into requirements for logic and tests, and implementation trace links navigate both directions.

## Sequencing rule

Do not start the next goal merely because the API seems obvious. Start it when the prior goal has a real fixture, deterministic outputs, tests, and a reviewable example. The purpose of this sequence is to accumulate proven contracts rather than a large speculative framework.
