# Research Notes and Design Decisions

## 1. Source package inspected

The uploaded archive was extracted without modifying its contents and is maintained in the sibling [`asset-contract`](../../asset-contract/) package.

### Files

| File | Purpose |
|---|---|
| [`README.md`](../../asset-contract/README.md) | Package overview and reading order |
| [`SPEC_DESIGN.md`](../../asset-contract/SPEC_DESIGN.md) | Design paper for the Generative Entity-Component Graph |
| [`VALIDATION_REPORT.md`](../../asset-contract/VALIDATION_REPORT.md) | Integrity results for the detailed fixture |
| [`schemas/generative-scene-contract.schema.json`](../../asset-contract/schemas/generative-scene-contract.schema.json) | Top-level JSON Schema |
| [`schemas/component-catalog.json`](../../asset-contract/schemas/component-catalog.json) | 43 components, 14 relationships, merge metadata, and system phases |
| [`blue_winter_grove.scene.json`](../../asset-contract/blue_winter_grove.scene.json) | Detailed 5,038-line scene contract |
| [`examples/blue-winter-grove.scene.contract.json`](../../asset-contract/examples/blue-winter-grove.scene.contract.json) | Byte-identical copy of the detailed fixture |
| [`quiet_canal_market.scene.json`](../../asset-contract/quiet_canal_market.scene.json) | Earlier compact model, not yet upgraded to the GECG shape |

### SHA-256 checksums

Paths in this table are relative to [`../asset-contract/`](../../asset-contract/).

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

## 2. Findings from the source contract

### 2.1 The conceptual model is already strong

The source package has the right core abstractions:

- one-parent ownership tree for scope and regeneration boundaries
- typed relationship graph for composition, ecology, influence, and dependency
- declarative, prototype, and derived entity categories
- namespaced components with schemas and merge behavior
- ordered generation/validation systems with reads, writes, dependencies, versions, and random streams
- structural, compositional, visual, and human-review validation
- explicit artifact and provenance outputs

The DSL should preserve these semantics rather than flatten them into generic “scene settings.”

### 2.2 The pain is authoring duplication and scale

The detailed Blue Winter Grove fixture has:

- 38 authored entities
- 9 prototypes
- 7 palettes
- 8 materials
- 18 relationships
- 18 systems
- 43 catalog component types
- 14 relationship types

The JSON repeats IDs across map keys, record fields, parent links, tree nodes, relationships, and systems. This is excellent for a resolved boundary but expensive as the primary authoring experience.

The DSL should therefore optimize:

- nested ownership
- definition references
- reusable prototype and population helpers
- imports
- generated catalog types
- concise diagnostics

### 2.3 Top-level and component validation are separate

The top-level schema validates the container and graph record shapes. Component payload schemas live in [`component-catalog.json`](../../asset-contract/schemas/component-catalog.json) and are not directly wired into the top-level schema.

Implication: a production compiler must perform two validation layers:

1. validate the top-level scene contract
2. iterate every component and validate it against the registered component schema, including allowed entity kind

Passing the top-level JSON Schema alone is insufficient.

### 2.4 The detailed fixture is the right integration oracle, not the first authoring port

Porting all 5,038 lines into TypeScript as the first task would mostly test transcription effort. It would also encourage the agent to design helpers around one large example before compiler invariants are proven.

Better use:

- full JSON as a read-only validator/integrity fixture
- a compact TypeScript scene that exercises every important compiler path
- later migrate the full scene after authoring APIs stabilize

### 2.5 The compact canal market should remain deferred

[`quiet_canal_market.scene.json`](../../asset-contract/quiet_canal_market.scene.json) uses an older compact shape and is explicitly not upgraded. Supporting it in Goal 1 would mix DSL/compiler work with migration design.

Use it later as a migration test after the GECG compiler is stable.

## 3. Gaps the DSL/compiler must close

### 3.1 Type-safe references

Current references are strings. The DSL can use definition objects and generated refs while still emitting exact strings.

### 3.2 Ownership normalization

Authors should write nesting once. The compiler should generate both parent fields and `entityTree`, then verify consistency.

### 3.3 Prototype merge semantics

The catalog defines merge policies, but a compiler must implement, test, and version them.

### 3.4 Component payload type generation

The catalog is JSON Schema, while TypeScript authors need autocomplete and compile-time feedback. Generate type bindings rather than hand-maintaining them.

### 3.5 Canonical bytes and hashes

The source design calls for stable hashes, but the package does not define the canonical serializer. Goal 1 must document ordering and hashing behavior.

### 3.6 Source-to-output navigation

The source package defines provenance for generated artifacts, but a DSL compiler also needs indexes and generated refs so implementation code can join the same graph.

### 3.7 Artifact existence and staleness

The contract declares expected outputs, but no receipt model proves whether each tangible artifact exists for the current contract hash. This becomes Goal 2.

## 4. External agent-tool research

### 4.1 Shared repository instructions are viable

- Codex loads `AGENTS.md` files and supports layered repository guidance.
- OpenCode uses `AGENTS.md` and supports Agent Skills.
- Claude Code uses `CLAUDE.md`, and its official documentation recommends a `CLAUDE.md` that imports `@AGENTS.md` when a repository already uses `AGENTS.md`.

Decision: maintain one shared `AGENTS.md`, a thin Claude adapter, and task-specific `GOAL.md` files.

### 4.2 Skills are the right home for repeated procedures

Codex, Claude Code, and OpenCode all support skill-style reusable instruction bundles. Current paths and extensions differ, but the shared `SKILL.md` convention is mature enough to plan around.

Decision: do not make a skill for one initial task. Create an `antiky-artifact` skill only after the work-item and receipt workflow has been used successfully more than once.

### 4.3 Agent-specific prompts should be adapters

All three tools can read repository files, edit code, and run commands. Their durable-instruction and invocation mechanisms differ, but the task semantics do not need to differ.

Decision: core planning emits neutral work-item data and Markdown. Vendor adapters add only tool-specific context or invocation guidance.

## 5. Design decisions

### Decision 1 — Separate package from the engine

**Choice:** `@antiky/contracts` lives in its own workspace package.

**Reason:** The engine should consume stable IR without importing TypeScript module loaders, schema code generation, CLIs, or agent tooling.

### Decision 2 — One package with subpath exports first

**Choice:** start with one workspace package and strong internal/subpath boundaries.

**Reason:** This preserves architecture without creating package-management overhead before APIs stabilize.

**Revisit when:** independent release cadence, dependency weight, or build graph performance justifies a split.

### Decision 3 — JSON remains the engine boundary

**Choice:** TypeScript is authoring; canonical JSON is resolved IR.

**Reason:** portable, inspectable, diffable, schema-validatable, and usable outside Node/TypeScript.

### Decision 4 — Catalog is the component source of truth

**Choice:** derive component names, relationship names, schemas, allowed scopes, and merge policies from the catalog.

**Reason:** avoids drift between runtime validation and TypeScript autocomplete.

### Decision 5 — Nested authoring, explicit resolved tree

**Choice:** authors nest entities; compiler emits flat map plus explicit tree.

**Reason:** removes duplicate parent bookkeeping while preserving engine-friendly IR.

### Decision 6 — Trusted build-time TypeScript only in v0.1

**Choice:** local repository authoring modules are trusted; output is aggressively serialized and validated.

**Reason:** a hardened untrusted-code sandbox is important but orthogonal to proving the authoring model.

### Decision 7 — Typed refs in Goal 1, trace scanner later

**Choice:** generate `contract.refs.ts` immediately; implement code scanning and bidirectional trace manifests in Goal 4.

**Reason:** stable refs are cheap and prevent more raw-string spread. A scanner requires additional conventions and should follow real implementation examples.

### Decision 8 — Requirements/receipts before prompts

**Choice:** implement artifact requirements and receipts before automatic prompt generation.

**Reason:** the system must know what is missing, stale, or satisfied before it can create trustworthy work queues.

### Decision 9 — Prompts are rendered views

**Choice:** vendor-specific prompts are adapters over neutral work items.

**Reason:** avoids coupling contract semantics to one agent and allows deterministic tests.

### Decision 10 — Full fixture validates; compact fixture authors

**Choice:** validate the full Blue Winter Grove JSON, but author a much smaller TypeScript fixture.

**Reason:** proves compatibility and compiler behavior without turning Goal 1 into a data-porting project.

## 6. Open questions after Goal 1

These questions should be answered with implementation evidence, not before coding:

1. Should `@antiky/contracts` remain one package or split catalog/compiler/IR after build profiling?
2. Which JSON Schema-to-TypeScript approach gives acceptable compile performance for all 43 components?
3. Should authoring source maps use an AST transform, builder call-site capture, or explicit source metadata?
4. How much component-level reference knowledge belongs in schemas versus a separate reference-extractor registry?
5. Should custom components be permitted to define reference fields declaratively for dependency analysis?
6. What canonical JSON standard or project serializer should be adopted long-term?
7. Should generated refs include ergonomic aliases in addition to lossless ID-keyed maps?
8. What is the smallest useful artifact-requirement vocabulary across voxel assets, code modules, renders, and reports?
9. Which validation results are sufficient for automatic promotion, and which always require human review?
10. How should contract command/events and branch promotion integrate with the monorepo and engine session model?

## 7. Official external sources

- OpenAI Codex `AGENTS.md`: https://developers.openai.com/codex/agent-configuration/agents-md
- OpenAI Codex best practices: https://developers.openai.com/codex/learn/best-practices
- OpenAI Codex Agent Skills: https://developers.openai.com/codex/build-skills
- Anthropic Claude Code project memory: https://code.claude.com/docs/en/memory
- Anthropic Claude Code skills: https://code.claude.com/docs/en/skills
- OpenCode rules: https://opencode.ai/docs/rules/
- OpenCode Agent Skills: https://opencode.ai/docs/skills/
- OpenCode agents: https://opencode.ai/docs/agents/
