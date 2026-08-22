# Antiky Declarative TypeScript Contract DSL

> **Historical design handoff.** This directory records the design and acceptance work that led to
> `@antiky/contracts@0.1.0`. Use the [current usage documentation](../usage-docs/README.md) to write
> or compile contracts. Where a proposal here differs from shipped types and tests, the shipped API
> is authoritative.

This directory is the design and implementation handoff for a typed, declarative ECS language for game and scene direction.

The primary authoring language is TypeScript. Authors describe experience, visual direction, gameplay direction, important things and regions, meaningful relationships, allowed variation, rules, and acceptance. A deterministic compiler lowers that semantic model into the detailed entity-component graph used by generators, validators, editors, and the engine.

> The DSL should feel like designing a game in TypeScript, not serializing the engine in TypeScript.

Read [DSL_REDESIGN.md](docs/DSL_REDESIGN.md) first. It is the design anchor for the public authoring language. [GOAL.md](GOAL.md) turns that design into the first bounded implementation task.

## The boundary

```text
declarative TypeScript       deterministic lowering        canonical JSON IR

scene                        semantic components           entities
thing                        scoped identity               components
region              ───▶     definition dependency graph ───▶ relationships
population                   reference-image uses          systems
basedOn + parts              named project profiles        validation + hashes
frames(...)                  provenance                    exact indexes
```

The semantic and technical layers are both ECS-shaped and declarative, but they serve different readers:

- Authors use game-development vocabulary.
- The compiler owns catalog component names, long engine IDs, system phases, coordinate policy, deterministic streams, render plumbing, and output paths.
- The engine consumes canonical JSON IR. It never imports or executes authoring modules.

The raw typed-ECS operations explored in the earlier design—`component(...)`, `ref(...)`, `defineSystem(...)`, and similar builders—may survive as internal lowering tools or a clearly marked expert escape hatch. They are not the primary DSL and are not required in ordinary scene contracts.

## First implementation

Implementation belongs here:

```text
experiments/asset-generation-contract/packages/contracts/
```

The sibling [`asset-contract`](../asset-contract/) directory is the read-only backend specification, schema, catalog, and compatibility-fixture source. Do not copy it into this handoff or implement the package inside `docs/dsl-testing/`.

Goal 1 proves one narrow vertical slice:

- `scene`, `thing`, `region`, and `population` constructors
- reusable things bound in `definitions`, with `basedOn` specialization and named `parts`
- placed regions and populations bound in `cast`
- semantic `experience`, `visual`, `gameplay`, `variation`, `rules`, and `acceptance` fields
- reusable project-local reference images tagged on individual declarations with stated design uses and deterministic content hashes
- playable thing roles plus scene-level `playAs`, loop, actions, pace, and spatial direction
- record-key scoped identity and references created by passing definition values
- the `frames(...)` relationship helper
- one named, versioned project profile
- deterministic semantic lowering into the supplied schema and component catalog
- a Blue Winter Grove scene entry under 120 readable lines, supported by focused compositional modules
- validation of both compiled semantic input and the existing full JSON fixture
- canonical outputs, diagnostics, indexes, exact generated refs, provenance, and hashes

Game, world, scenario, narrative, audio, additional relationships, artifact planning, and generation remain planned extensions. They share the same semantic model, but Goal 1 does not need to implement them to prove the boundary.

## Package boundary

The initial workspace package is `@antiky/contracts`, with separation by subpath rather than premature package proliferation:

```text
@antiky/contracts/dsl       author-facing semantic declarations
@antiky/contracts/compiler  loading, lowering, validation, and emission
@antiky/contracts/ir        engine-facing resolved types
@antiky/contracts/catalog   backend schema and catalog support
```

The dependency rule is:

```text
engine ───────────────▶ contracts/ir
dsl ──────────────────▶ semantic authoring types
compiler ─────────────▶ dsl + catalog + ir
engine ── must not ───▶ dsl or compiler
```

## Compiler outputs

A successful compile emits five deterministic files:

```text
resolved-contract.json
diagnostics.json
contract-index.json
contract.refs.ts
build-manifest.json
```

These files describe and index the contract. They do not prove that voxel assets, renders, gameplay code, or other downstream artifacts exist. See [Compiler Outputs and Artifact Planning](docs/COMPILER_OUTPUTS.md) for that distinction.

## Documentation map

| Read | Purpose |
|---|---|
| [DSL redesign](docs/DSL_REDESIGN.md) | Authoritative public-language direction and usability acceptance |
| [Goal 1](GOAL.md) | Executable implementation specification and acceptance table |
| [Detailed DSL design](docs/DSL_DESIGN.md) | Representations, types, lowering, profiles, identity, diagnostics, and package boundaries |
| [Roadmap](ROADMAP.md) | Sequenced extensions after the first semantic slice |
| [Compiler outputs](docs/COMPILER_OUTPUTS.md) | Resolved artifacts and later artifact-requirement planning |
| [Traceability](docs/TRACEABILITY.md) | Semantic-source, lowered-record, code, and generated-artifact links |
| [Research notes](docs/RESEARCH_NOTES.md) | Source findings, superseded assumptions, decisions, and open questions |
| [Agent workflows](docs/AGENT_WORKFLOWS.md) | How to hand Goal 1 to an implementation agent |
| [Blue Winter Grove source](../../packages/examples/src/blue-winter-grove/) | Compact compositional TypeScript module graph tied to the generated Blue Winter Grove image set |
| [Quiet Canal Market source](../../packages/examples/src/quiet-canal-market/) | Faithful semantic migration of the preserved compact scene direction |
| [Clearing](../../packages/examples/src/blue-winter-grove/references/blue-winter-grove-reference-01-clearing-v4.png), [frozen creek](../../packages/examples/src/blue-winter-grove/references/blue-winter-grove-reference-02-frozen-creek-v4.png), [tree detail](../../packages/examples/src/blue-winter-grove/references/blue-winter-grove-reference-03-frost-tree-detail-v4.png) | Active reference set: soft voxel miniatures with a production-quality HD-2D adventuring party |
| [Party anchor](../../packages/examples/src/blue-winter-grove/references/blue-winter-grove-party-sprite-anchor-v1.png) | Original vanguard, scholar, and scout identity and pixel-craft reference |
| [Visual-reference prompts](examples/blue-winter-grove-reference-prompts.md) | Source roles, exact generation and edit prompts, version history, and output hashes |
| [First attempt](examples/first-try/) | Retained unversioned first-attempt images and prompts; intermediate `v2` and `v3` PNGs were removed |
| [Handoff validation](HANDOFF_VALIDATION.md) | Checks performed on this documentation bundle and source fixtures |

## Handing off Goal 1

Start the implementation agent at the `research` repository root and tell it to:

1. Read `experiments/asset-generation-contract/docs/dsl-testing/AGENTS.md`, `experiments/asset-generation-contract/docs/dsl-testing/GOAL.md`, and every item in the goal's reading list.
2. Implement only under `experiments/asset-generation-contract/packages/contracts/`, plus minimal workspace metadata under `experiments/asset-generation-contract/`.
3. Treat `experiments/asset-generation-contract/docs/asset-contract/` as read-only.
4. Run the complete verification matrix and report every acceptance criterion as `PASS`, `FAIL`, or `NOT RUN` with evidence.

## Rules that survive every phase

- TypeScript is the trusted, declarative authoring surface; canonical JSON is the engine boundary.
- Compilation is deterministic and contains no AI or natural-language interpretation step.
- Builders are pure, immutable, JSON-safe declarations. They do not register globals or embed runtime callbacks.
- Scoped authoring identity expands losslessly into stable engine IDs.
- Reusable things form an acyclic specialization and named-part graph; region features and gameplay use the same direct-reference model.
- Reference-image values are reusable, while each declaration records what the image controls there.
- Semantic relationships express creative meaning; the compiler derives technical graph records.
- Named, versioned profiles supply inspectable technical defaults. Conflicts produce diagnostics.
- Every lowered technical record traces to author input, a selected profile, or an explicit technical override.
- Ownership is a tree. Meaning and dependency are graphs.
- A compiler result or prompt is not proof that a tangible artifact exists; files, hashes, validation, and receipts provide that evidence.
