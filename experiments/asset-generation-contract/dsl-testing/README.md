# Antiky Contract DSL v0.1

**Design package and bounded implementation handoff**

This package turns the Antiky generative-contract research into a practical TypeScript DSL design and a first implementation goal that can be handed to Codex, Claude Code, OpenCode, or another coding agent.

The central decision is simple:

> Humans and agents author intent in TypeScript. The compiler emits strict, deterministic JSON IR. The Antiky engine consumes the IR, never the authoring code.

The DSL is not a runtime scripting language, renderer, shader graph, mesh editor, or gameplay implementation. It is a typed authoring layer for contracts: entities, prototypes, components, relationships, systems, validation, outputs, and eventually game/world/scenario definitions.

## What the uploaded source package established

The sibling [`asset-contract`](../asset-contract/) package already defines a strong scene-level model:

- a **Generative Entity-Component Graph** with one ownership tree and a typed relationship graph
- declarative entities, reusable prototype entities, and generated derived entities
- 43 component types and 14 relationship types
- deterministic seed streams and 11 ordered system phases
- structural, compositional, visual, and human-review validation
- provenance from generated artifacts back to contract entities, prototypes, systems, versions, and seed streams
- a detailed Blue Winter Grove fixture with 38 authored entities, 9 prototypes, 18 relationships, and 18 systems

The problem is not a lack of expressiveness. The problem is authoring ergonomics: the detailed example is more than 5,000 lines of JSON. The TypeScript DSL should preserve the model while replacing repetitive maps, parent declarations, stringly typed references, and hand-managed inheritance with composition, imports, autocomplete, and compiler diagnostics.

## Repository boundary

Implement this work in the experiment-local package, separate from the Antiky runtime framework:

```text
experiments/asset-generation-contract/
├── asset-contract/         # Read-only source specs, schemas, and fixtures
├── dsl-testing/            # This design and implementation handoff
└── packages/
    └── contracts/          # DSL, catalog, compiler, IR types, and later planning/trace tools
        ├── src/dsl/
        ├── src/ir/
        ├── src/catalog/
        ├── src/compiler/
        └── src/trace/      # Later phase
```

For the first release, one workspace package with subpath exports is simpler than creating five publishable packages:

```text
@antiky/contracts/dsl
@antiky/contracts/ir
@antiky/contracts/catalog
@antiky/contracts/compiler
```

The dependency rule is more important than the folder count:

```text
engine ───────────────▶ contracts/ir
contracts/dsl ────────▶ contracts/ir + contracts/catalog
contracts/compiler ───▶ contracts/ir + contracts/catalog
engine ── must not ───▶ contracts/dsl or contracts/compiler
```

## Representation pipeline

```text
*.contract.ts
  │  typed, composable authoring
  ▼
Authoring model
  │  collect → normalize → resolve → validate → canonicalize → hash
  ▼
Resolved JSON IR
  ├── resolved-contract.json
  ├── diagnostics.json
  ├── contract-index.json
  ├── contract.refs.ts
  └── build-manifest.json
  │
  ├──▶ Antiky generation systems create voxel assets and scene bundles
  ├──▶ validators create reports and acceptance renders
  └──▶ artifact planner creates agent-neutral work items for missing/stale artifacts
          │
          ├──▶ Codex adapter
          ├──▶ Claude Code adapter
          └──▶ OpenCode adapter
```

The first goal ends at the resolved IR and reference outputs. Artifact planning, generated prompts, implementation trace scanning, and actual voxel generation are deliberately separate goals.

## What the compiler creates versus what downstream systems create

The compiler creates **descriptions, indexes, diagnostics, references, and build metadata**. It does not create a believable snowy pine or a playable scene by itself.

Downstream Antiky systems and agents may create tangible artifacts such as:

- voxel prototype bundles and generated variants
- terrain and population layouts
- a scene bundle containing terrain, instances, materials, lighting, cameras, and runtime entity mappings
- beauty and diagnostic renders
- structural and visual validation reports
- gameplay TypeScript modules and tests for later game/scenario contracts
- provenance receipts and promotion manifests

See [Compiler Outputs and Artifact Planning](docs/COMPILER_OUTPUTS.md) for the full distinction and the proposed missing-artifact workflow.

## First implementation goal

[GOAL.md](GOAL.md) is the handoff-ready task. It asks an agent to implement one bounded vertical slice:

1. a separate `@antiky/contracts` workspace package
2. a composable scene-contract authoring API
3. catalog-backed component and relationship validation
4. ownership-tree flattening and prototype resolution
5. reference and system-DAG validation
6. deterministic canonical JSON output
7. typed generated contract references
8. a small Blue Winter Grove TypeScript example
9. validation of the full existing Blue Winter Grove JSON fixture

It explicitly does **not** ask the agent to generate assets, implement the Antiky engine, port all 5,000 lines of the example to TypeScript, or build the prompt/receipt pipeline.

## Documentation map

| File | Purpose |
|---|---|
| [GOAL.md](GOAL.md) | Bounded Codex-ready implementation task with acceptance criteria |
| [ROADMAP.md](ROADMAP.md) | Sequenced goals that avoid boiling the ocean |
| [DSL Design](docs/DSL_DESIGN.md) | Authoring model, APIs, extensibility, compilation, and boundaries |
| [Compiler Outputs](docs/COMPILER_OUTPUTS.md) | Core outputs, tangible artifacts, requirements, receipts, and prompts |
| [Traceability](docs/TRACEABILITY.md) | Stable IDs, typed refs, implementation links, provenance, and navigation |
| [Agent Workflows](docs/AGENT_WORKFLOWS.md) | How to use the work with Codex, Claude Code, and OpenCode |
| [Research Notes](docs/RESEARCH_NOTES.md) | Findings from the uploaded package, external research, and decisions |
| [Handoff Validation](HANDOFF_VALIDATION.md) | Integrity, schema, catalog, graph, TypeScript syntax, JSON, and link checks performed on this bundle |
| [Conceptual DSL Example](examples/blue-winter-grove.contract.ts) | A compact authoring example based on the source fixture |
| [Artifact Requirement Example](examples/artifact-requirement.example.json) | Proposed neutral description of a missing tangible artifact |
| [Artifact Receipt Example](examples/artifact-receipt.example.json) | Proposed proof that an artifact fulfills contract requirements |
| [Generated Work Item Example](examples/work-item.example.md) | Example prompt rendered from a neutral artifact requirement |
| [Agent Instructions](AGENTS.md) | Portable durable instructions for Codex and OpenCode |
| [Claude Adapter](CLAUDE.md) | Imports the shared agent instructions for Claude Code |
| [`../asset-contract/`](../asset-contract/) | Source specs, schemas, and examples shared with this DSL work |

## How to hand this to a coding agent

1. Start the agent at the `research` repository root.
2. Tell it to read [`GOAL.md`](GOAL.md) and [`AGENTS.md`](AGENTS.md).
3. State that implementation belongs in `experiments/asset-generation-contract/packages/contracts/` and that [`../asset-contract/`](../asset-contract/) is read-only.
4. Require the agent's final response to report every acceptance criterion as pass, fail, or not run.

## Design rules to preserve

- Contracts describe intent and constraints; systems implement behavior.
- TypeScript is a trusted build-time authoring surface; the engine never executes contract modules.
- Every compiled value must be JSON-serializable.
- Stable IDs are the backbone of references, incremental generation, provenance, and traceability.
- Ownership is a tree; meaning and dependency are graphs.
- Composition should be preferred over deep inheritance.
- Custom components must be namespaced, schema-backed, versioned, and registered.
- The core compiler should emit agent-neutral data. Vendor-specific prompts belong in adapters.
- A prompt is not proof that work exists. Artifact receipts and validation results are proof.
