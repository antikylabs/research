# Research Notes and Design Decisions

This page records the source-package findings and the decisions that led to the declarative TypeScript redesign. The authoritative public-language proposal is [DSL_REDESIGN.md](DSL_REDESIGN.md); implementation detail is in [DSL_DESIGN.md](DSL_DESIGN.md).

## 1. Source package inspected

The preserved source material is in the sibling [`asset-contract`](../../asset-contract/) directory. It is the technical-ECS specification and compatibility-fixture source, not a folder to copy into this handoff.

| File | Purpose |
|---|---|
| [`README.md`](../../asset-contract/README.md) | Package overview and reading order |
| [`SPEC_DESIGN.md`](../../asset-contract/SPEC_DESIGN.md) | Generative Entity-Component Graph design paper |
| [`VALIDATION_REPORT.md`](../../asset-contract/VALIDATION_REPORT.md) | Integrity results for the detailed fixture |
| [`schemas/generative-scene-contract.schema.json`](../../asset-contract/schemas/generative-scene-contract.schema.json) | Top-level technical JSON Schema |
| [`schemas/component-catalog.json`](../../asset-contract/schemas/component-catalog.json) | Technical components, relationships, merge metadata, and phases |
| [`blue_winter_grove.scene.json`](../../asset-contract/blue_winter_grove.scene.json) | Detailed 5,038-line technical scene contract |
| [`examples/blue-winter-grove.scene.contract.json`](../../asset-contract/examples/blue-winter-grove.scene.contract.json) | Byte-identical detailed-fixture copy |
| [`quiet_canal_market.scene.json`](../../asset-contract/quiet_canal_market.scene.json) | Earlier compact shape, not upgraded to the GECG model |

### SHA-256 checksums

Paths are relative to [`asset-contract/`](../../asset-contract/).

```text
6baf990a7993c45d66698fed6e132d73e6efb7db5107ab6a61bf9e456b9716db  README.md
44da0bd87553b460c0baa67fa1d96ebd80d98fc9877057fa90f5e71d38913701  SPEC_DESIGN.md
a5dd4feb839161e4f169d7c4bb861fc808bcb0e9b9317b2c5e3acf1b0670815c  VALIDATION_REPORT.md
17b542c17796ed24fc6474073dfdcc0078acfea14b18683ffcf2ebf3c69ec3ad  schemas/generative-scene-contract.schema.json
b691efaa62f6dbed6827fae0e5abfb6d4a17d2f3d992cc58d2c33c70bcc35c91  schemas/component-catalog.json
51bd5de9e9b79151e32e2cd801d07cca4a2a59f818a7187a78e6e37d0e7afe47  blue_winter_grove.scene.json
51bd5de9e9b79151e32e2cd801d07cca4a2a59f818a7187a78e6e37d0e7afe47  examples/blue-winter-grove.scene.contract.json
6975aad0ba1f93572ae682d5efa90afb7efccd9318e0cea970492e6a59c47184  quiet_canal_market.scene.json
```

## 2. Findings from the technical contract

### 2.1 The backend model is strong

The source package already has the production concepts a resolved contract needs:

- a one-parent ownership tree plus typed relationship graph
- authored, prototype, and derived entities
- namespaced components with schemas and merge behavior
- ordered generation and validation systems with dependencies, versions, and seed streams
- structural, compositional, visual, and human-review validation
- explicit outputs and artifact provenance

The redesign does not replace this model. It changes who is responsible for assembling it: semantic lowerers and project profiles, rather than every ordinary scene author.

### 2.2 The detailed fixture is a backend oracle

Blue Winter Grove contains:

- 38 authored entities
- 9 prototypes
- 7 palettes
- 8 materials
- 18 relationships
- 18 systems
- 43 catalog component types
- 14 catalog relationship types

That scale makes it valuable for full resolved-contract validation. It makes it a poor first semantic authoring fixture: porting 5,038 lines would measure transcription, not whether the language is good.

Decision: keep the full JSON fixture read-only and validate it with the technical core. Use a compact TypeScript scene entry under 120 readable lines, with focused sibling modules for reusable declarations, to judge the authoring boundary without compressing the design into dense formatting.

### 2.3 Top-level and component validation are separate

The top-level JSON Schema validates the container and graph record shapes. Component payload schemas and allowed entity kinds live in the component catalog; they are not automatically enforced by the top-level schema.

A complete technical validator must:

1. validate the top-level scene schema
2. validate each component payload against its catalog schema
3. enforce allowed entity kinds
4. validate references, ownership, relationship kinds, prototype ancestry, and system dependencies

Passing the top-level schema alone is not sufficient.

### 2.4 The compact canal fixture remains deferred

Quiet Canal Market uses an older compact model. Supporting it during the first semantic compiler slice would mix authoring-language proof, technical validation, and migration design.

Decision: revisit it as a migration case only after the semantic-to-technical boundary is stable.

## 3. What the first TypeScript experiment taught us

The first proposed TypeScript layer wrapped the backend records with helpers such as `component(...)`, `defineEntity(...)`, `defineSystem(...)`, and `ref(...)`. It improved autocomplete and reference safety but left the author responsible for the same technical graph:

- raw catalog component names and payloads
- long IDs and reference bookkeeping
- explicit systems, phases, and dependencies
- coordinate and seed policy
- render passes and output paths
- manual technical ownership groups

Its “compact” Blue Winter Grove fixture grew to 414 lines and still required knowledge of the backend catalog. That is a valid internal typed-ECS API, but it does not meet the desired game-design authoring experience.

Decision: TypeScript remains primary. The public grammar changes from a raw typed technical ECS to an object-shaped semantic ECS. The raw helpers are demoted to compiler internals or a later advanced surface.

## 4. Design decisions

### Decision 1 — TypeScript remains the primary DSL

**Choice:** trusted declarative TypeScript modules.

**Reason:** imports, composition, refactoring, comments, autocomplete, typed references, and ordinary tooling remain valuable. Markdown/free prose would move identity and deterministic meaning into an ambiguous resolver.

### Decision 2 — Semantic ECS authors; technical ECS resolves

**Choice:** `scene`, `thing`, `region`, and `population` plus semantic components lower into the existing entity-component graph.

**Reason:** authors choose creative/gameplay direction; compilers and profiles own production plumbing.

### Decision 3 — No model-driven build step

**Choice:** prose remains readable intent or human-review criteria unless a typed field/profile defines a deterministic mapping.

**Reason:** compilation must be reproducible, inspectable, and testable. An AI can help write source but does not interpret it during the build.

### Decision 4 — Scoped keys and definition values replace raw refs

**Choice:** root and record keys provide identity; passing a definition object creates a typed reference.

**Reason:** local identity is readable and refactorable without repeated long strings. Engine-facing IDs remain exact in generated outputs and refs.

### Decision 5 — Named profiles provide defaults

**Choice:** versioned project profiles supply coordinate, seed, system, render, validation, and output policy.

**Reason:** the small DSL must be explicit about where defaults originate. Profiles are inspectable inputs, not hidden guesses.

### Decision 6 — Preserve unsupported semantics visibly

**Choice:** canonical resolved provenance retains normalized semantic fields that the current backend catalog cannot represent directly.

**Reason:** dropping gameplay or creative intent would be dishonest; fabricating backend numbers would be worse. Derivation maps distinguish operational lowering from preservation.

### Decision 7 — Catalog remains the technical source of truth

**Choice:** derive backend component names, schemas, allowed kinds, relationships, merge policies, and phases from the supplied catalog.

**Reason:** internal lowerers and the full validator must not drift from engine-facing contracts. This does not mean exposing all catalog entries as public semantic fields.

### Decision 8 — Canonical JSON remains the engine boundary

**Choice:** the engine consumes resolved JSON/IR, never authoring modules.

**Reason:** the boundary is portable, inspectable, schema-validatable, diffable, and usable outside TypeScript.

### Decision 9 — One contracts package first

**Choice:** implement `@antiky/contracts` with strong `dsl`, `compiler`, `catalog`, and `ir` subpath boundaries.

**Reason:** this preserves dependency direction without premature release/package overhead.

### Decision 10 — Trusted local modules only in v0.1

**Choice:** repository authoring modules are trusted build-time code; their output is aggressively normalized and validated.

**Reason:** an untrusted-code sandbox is important but orthogonal to proving the language.

### Decision 11 — Exact generated refs serve implementation code

**Choice:** Goal 1 emits `contract.refs.ts`, but ordinary contract authors use direct definition values.

**Reason:** implementation code needs lossless stable IDs; feeding generated technical refs back into semantic authoring would collapse the two layers.

### Decision 12 — Requirements and receipts precede prompts

**Choice:** later planning first establishes what should exist and what evidence is current; vendor-specific prompt rendering follows.

**Reason:** a plausible task description is not proof of completed work.

### Decision 13 — Reusable definitions compose into gameplay subjects

**Choice:** bind reusable things under `scene.definitions`, placed regions and populations under
`scene.cast`, specialize things with `basedOn`, and compose them through named `parts`. Use the same
direct-reference model for region features and the scene's player-controlled population.

**Reason:** a crown, character, or party member must remain an addressable concept when its identity,
reuse, gameplay role, reference evidence, or downstream generation matters. A single `thing`
constructor plus typed dependencies is smaller and more general than adding noun-specific builders.

### Decision 14 — Reference images carry local meaning

**Choice:** `referenceImage(...)` creates a reusable typed image value. Scenes and declarations cite
that value with an item-specific `use` statement.

**Reason:** one scene-level image list cannot say which source governs a character, crown, surface,
region, or population. Local use edges keep art direction traceable without duplicating image bytes
or turning visual interpretation into a build-time model call.

## 5. Technical gaps Goal 1 must close

### 5.1 Semantic-to-technical derivation

The compiler needs explicit versioned lowerers and tests for each supported semantic field. Every output record must carry source, lowerer, and profile evidence.

### 5.2 Scoped identity collection

The compiler must bind definitions through record keys, resolve repeated definition-object references, reject multiple/unbound bindings, and expand exact IDs without relying on JavaScript variable names or display labels.

### 5.3 Honest preservation

The current scene schema lacks a direct technical component for some game-design direction. Goal 1 needs a canonical semantic projection in allowed provenance plus clear “lowered” versus “preserved only” classifications.

### 5.4 Profile expansion and conflicts

Defaults require a deterministic merge/precedence model, conflict diagnostics, hashes, and provenance.

### 5.5 Technical graph integrity

Ownership normalization, prototype merging, reference validation, relationship endpoint validation, system ordering, and component payload validation remain necessary after semantic lowering.

### 5.6 Canonical bytes and hashes

The source design calls for stable hashes but does not choose one complete canonical serializer. Goal 1 must document and test ordering, encoding, newline, and hash inputs.

### 5.7 Artifact existence and staleness

The technical contract declares expected outputs, but no receipt proves that each artifact exists for the current semantic/technical slice. This is a later goal, after stable derivations and hashes exist.

## 6. Portable agent handoff findings

- Repository `AGENTS.md` guidance is a suitable shared instruction source for Codex and OpenCode.
- A thin `CLAUDE.md` can import the shared instructions for Claude Code.
- Repeated artifact-fulfillment procedures may become a skill after requirements and receipts have been exercised more than once.
- Core tasks should remain agent-neutral; vendor adapters may add invocation guidance without changing goal or acceptance.

Decision: this handoff keeps one `AGENTS.md`, one `GOAL.md`, and a thin Claude adapter. [AGENT_WORKFLOWS.md](AGENT_WORKFLOWS.md) contains operational examples.

## 7. Open questions after Goal 1

Answer these with implementation and fixture evidence:

1. Which semantic fields recur across a second, substantially different scene?
2. Does the technical catalog need first-class gameplay-direction components, or should those enter with game/scenario schemas?
3. Which relationship helpers have stable meaning across multiple contracts?
4. Should reusable imported things always carry an explicit package key, or can a keyed library record own them?
5. What source-map technique gives useful repository-relative file/line locations without instrumenting ordinary TypeScript excessively?
6. Should `@antiky/contracts` split only after dependency weight or release cadence demonstrates the need?
7. What long-term canonical JSON standard best matches current deterministic requirements?
8. How should technical override schemas be registered without expanding the ordinary semantic catalog?
9. What is the smallest artifact-requirement vocabulary shared by voxel assets, code, renders, and reports?
10. Which validation evidence permits automatic promotion, and which always needs human review?

## 8. External workflow sources recorded by the original research

- OpenAI Codex `AGENTS.md`: https://developers.openai.com/codex/agent-configuration/agents-md
- OpenAI Codex best practices: https://developers.openai.com/codex/learn/best-practices
- OpenAI Codex Agent Skills: https://developers.openai.com/codex/build-skills
- Anthropic Claude Code memory: https://code.claude.com/docs/en/memory
- Anthropic Claude Code skills: https://code.claude.com/docs/en/skills
- OpenCode rules: https://opencode.ai/docs/rules/
- OpenCode Agent Skills: https://opencode.ai/docs/skills/
- OpenCode agents: https://opencode.ai/docs/agents/

These links explain the handoff format; they do not define the DSL.
