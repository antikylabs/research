# Antiky Declarative Contract Roadmap

This roadmap grows the semantic TypeScript language from one proven scene slice. Each goal must leave a useful, deterministic system with a real fixture and evidence. The sequence is not permission to design every future abstraction during Goal 1.

The public language direction comes from [DSL_REDESIGN.md](docs/DSL_REDESIGN.md). The detailed technical ECS remains the resolved boundary throughout the roadmap.

## Goal 1 — Semantic scene slice and deterministic compiler

**Outcome:** A short TypeScript scene written in game-design vocabulary compiles into validated, canonical JSON compatible with the existing technical scene contract.

**Includes:**

- `scene`, `thing`, `region`, `population`, and reusable reference images
- experience, visual, gameplay, variation, rules, and acceptance direction
- reusable thing specialization and named whole-part composition
- separate definition and placed-cast identity with direct definition references
- item-level reference-image uses and an indexed semantic dependency graph
- one meaningful `frames(...)` relationship
- one named, versioned voxel-diorama profile
- deterministic semantic lowerers and provenance
- schema/catalog/graph validation and canonical compiler outputs
- a semantic Blue Winter Grove scene entry under 120 readable lines with focused compositional modules
- validation of the existing full technical JSON fixture

**Excludes:** the raw technical ECS as the primary DSL, asset planning, generation, game/world/scenario roots, runtime behavior, and editor UI.

**Exit criterion:** Every acceptance criterion in [GOAL.md](GOAL.md) passes.

## Goal 2 — Semantic scene breadth

**Outcome:** The author-facing scene language covers recurring Antiky direction without exposing backend catalog plumbing.

**Includes:**

- composition, narrative, and audio semantic components
- a small proven set of spatial, ecological, narrative, and gameplay relationship helpers
- reusable typed profiles and explicit profile-composition/conflict rules
- additional thing/region/population forms driven by at least two distinct fixtures
- acceptance views and measurable checks expressed semantically
- an expert technical override with strict schema validation and provenance
- migration of selected intent from the detailed fixture, without a mechanical full-file port

**Exit criterion:** Two substantially different scenes compile through the same semantic catalog and profiles without adding one-off aliases for backend components.

## Goal 3 — Artifact requirements and receipts

**Outcome:** The planner can answer what tangible outputs should exist and whether each is missing, blocked, ready, satisfied, stale, or invalid.

**Includes:**

- agent-neutral artifact requirements derived from lowered intent, profiles, systems, acceptance, and declared outputs
- receipts containing exact source slices, producer versions, file hashes, and validation evidence
- deterministic status resolution and minimal invalidation
- trace from every requirement back through lowered records to semantic authoring paths

**Excludes:** vendor-specific prompts and automatic generation.

**Exit criterion:** A fixture with valid, stale, missing, blocked, and invalid artifacts produces exact statuses and explanations.

## Goal 4 — Game, world, and scenario language

**Outcome:** The same semantic ECS expresses experience and gameplay direction above a single scene.

**Includes:**

- `game`, `world`, and `scenario` constructors
- game pillars, player role, verbs, loop, pressure, scope, and non-goals
- world identity, shared rules, regions, and scene bindings
- scenario triggers, objectives, flow, outcome, and expected player experience
- artifact requirements for gameplay modules, tests, UI, and content
- typed references across game/world/scene/scenario scopes

**Exit criterion:** A small inspect-the-tree scenario compiles into stable scene and gameplay requirements without embedding per-frame callbacks or runtime code in the DSL.

## Goal 5 — Agent work items and prompt adapters

**Outcome:** Ready, stale, or invalid artifact requirements become bounded tasks usable by different implementation agents or deterministic generators.

**Includes:**

- agent-neutral work-item data and Markdown rendering
- minimal contract slices rather than entire contracts
- dependency-aware ordering
- exact allowed paths, outputs, validation commands, trace/receipt requirements, and non-goals
- thin Codex, Claude Code, and OpenCode adapters that do not change task semantics

**Excludes:** an autonomous multi-agent scheduler.

**Exit criterion:** One requirement renders into semantically equivalent tasks for supported agents and cannot be marked complete without valid evidence.

## Goal 6 — Implementation and artifact trace graph

**Outcome:** Users can navigate from semantic direction to lowered technical records, implementation code, tests, generated artifacts, and reports—and back.

**Includes:**

- source-code trace declarations using generated exact refs
- receipt ingestion
- `fulfills`, `relatesTo`, `generatedFrom`, `validates`, `producedBy`, and `dependsOn` links
- bidirectional trace manifest
- stale-link, orphan, and coverage diagnostics
- a query/editor API

**Exit criterion:** A semantic pine declaration, its lowered prototype and system requirements, generator module, tests, voxel artifact, and validation report are connected in both directions.

## Goal 7 — First tangible generator: old-growth winter tree

**Outcome:** The semantic old-growth winter-tree family produces a deterministic, inspectable voxel-tree artifact with validation and provenance.

**Includes:**

- one versioned tree-geometry implementation
- deterministic seed handling
- semantic material roles
- a narrow snow-receiver integration
- artifact receipt and source-to-output provenance
- structural checks for silhouette, taper, negative space, and duplicate output
- an acceptance render when rendering infrastructure already exists

**Exit criterion:** Repeated equal inputs match; controlled seed changes produce valid rounded-crown and conifer-spire variation; all evidence traces back to the semantic thing, visual references, and selected profile.

## Goal 8 — Blue Winter Grove scene slice

**Outcome:** The scene declaration produces terrain, one pine population, a protected clearing, a useful view, renders, and validation.

**Includes:**

- narrow terrain form
- old-growth placement
- clearing preservation and traversal
- profile-derived camera/render policy
- a scene bundle
- structural, compositional, and human-review evidence
- incremental regeneration and trace checks

**Exit criterion:** A semantic edit can be compiled, minimally regenerated, validated, and traced without hand-editing generated artifacts.

## Gate between goals

Do not advance because an API seems plausible. Advance only when the current goal has:

- an ordinary author-facing fixture
- deterministic outputs
- tests that can fail for semantic reasons
- source-to-lowered provenance
- a review against the design anchor
- no raw technical vocabulary leaking back into the normal DSL merely to make the fixture pass
