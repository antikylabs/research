# Implementing the Antiky Contract Goal with Coding Agents

This is a how-to guide for handing [Goal 1](../GOAL.md) to Codex, Claude Code, OpenCode, or another repository-capable coding agent. It does not define the DSL; [DSL_REDESIGN.md](DSL_REDESIGN.md) does.

## Use one portable specification

Keep durable rules and the bounded task in repository files:

```text
AGENTS.md              durable package and engineering rules
docs/DSL_REDESIGN.md   public-language design anchor
GOAL.md                bounded deliverables and acceptance
CLAUDE.md              thin adapter importing AGENTS.md
```

Do not maintain separate semantic goals for different agents. Tool-specific prompts may explain invocation or permissions, but they must not change the public API, scope, fixture, or acceptance criteria.

## Start from the correct repository boundary

Run the agent from the `research` repository root. The implementation target is:

```text
experiments/asset-generation-contract/packages/contracts/
```

Minimal workspace metadata may go directly under `experiments/asset-generation-contract/`. The
`experiments/asset-generation-contract/docs/asset-contract/` directory is read-only. The
`experiments/asset-generation-contract/docs/dsl-testing/` directory is a design/handoff package,
not the implementation destination.

## Required reading order

Tell the agent to read, rather than pasting a shortened restatement:

1. every applicable repository `AGENTS.md`
2. `experiments/asset-generation-contract/docs/dsl-testing/docs/DSL_REDESIGN.md`
3. `experiments/asset-generation-contract/docs/dsl-testing/GOAL.md`
4. the remaining files in the goal's “Read before editing” list
5. nearby experiment package/tooling conventions

The order matters because the earlier raw typed-ECS proposal is retained only as historical context. The public surface is now semantic, declarative TypeScript.

## Recommended neutral invocation

```text
Read experiments/asset-generation-contract/docs/dsl-testing/AGENTS.md,
experiments/asset-generation-contract/docs/dsl-testing/docs/DSL_REDESIGN.md,
and experiments/asset-generation-contract/docs/dsl-testing/GOAL.md, then every
file in the goal's reading list.

Implement Goal 1 in experiments/asset-generation-contract/packages/contracts/.
Add only minimal workspace metadata under experiments/asset-generation-contract/.
Treat experiments/asset-generation-contract/docs/asset-contract/ as read-only.

Before editing, inspect repository conventions and write a plan mapped to AC-01
through AC-22. Preserve TypeScript as the primary object-shaped semantic DSL;
do not restore raw component/ref/system builders as the ordinary authoring API.

Run the complete verification matrix. In the final report, mark every acceptance
criterion PASS, FAIL, or NOT RUN and cite commands or files as evidence.
```

## Planning review before implementation

The initial plan should name concrete modules or responsibilities for:

- semantic declaration types and pure constructors
- units/ranges and archetype type tests
- keyed definition/cast identity, direct reference resolution, and dependency-cycle validation
- reference-image reuse, per-declaration use edges, path validation, and hashing
- profile representation, expansion, precedence, and conflicts
- versioned semantic lowerers and derivation maps
- technical graph validation shared with full-JSON validation
- canonicalization, hashing, outputs, and CLI
- compositional fixture modules and readability/vocabulary guards
- full-fixture, negative, provenance, and determinism tests

Reject or revise a plan that begins by generating all backend component types as the public API, re-creates the 414-line fixture, or spends Goal 1 on future game/world/scenario frameworks.

## Codex

Use the neutral invocation above from the research root. Useful task-specific guidance:

- keep the active plan mapped to the acceptance table
- inspect exact schema/catalog shapes before choosing lowerings
- treat the scene-entry line count, module line width, compositional coverage, reference tags, and forbidden vocabulary as automated acceptance, not taste
- review changes for package-boundary and fixture mutations before completion
- use a separate read-only review pass after implementation when practical

The final review should compare observable behavior with AC-01 through AC-22, not merely summarize files changed.

## Claude Code

The handoff includes a thin `CLAUDE.md` that imports `AGENTS.md`. Use the same neutral task. Ask Claude Code to read the redesign before the goal and keep source fixtures read-only.

If hooks or path-scoped rules already exist, they can enforce:

- writes only within the allowed experiment paths
- required verification before completion
- no content edits under `docs/asset-contract/`

Do not introduce a hook framework solely to complete Goal 1.

## OpenCode

Use the same repository files and task semantics. If the environment separates planning and building modes, use planning to inspect conventions and map the acceptance table, then build only the agreed Goal 1 slice.

An OpenCode-specific wrapper may describe agent-mode syntax. It must not substitute raw technical builders for the semantic API or weaken the test matrix.

## What belongs in durable instructions

Keep these in `AGENTS.md`:

- repository and fixture boundaries
- semantic-versus-technical architecture
- identity, profile, provenance, and determinism invariants
- build/test discipline
- forbidden scope expansion
- completion-report format

Keep these in `GOAL.md`:

- the exact vertical slice
- required public behavior and compiler passes
- fixtures and invalid cases
- acceptance criteria
- explicit non-goals

Create a reusable skill only for a procedure that has occurred successfully more than once. Goal 1 itself is a bounded implementation task, not yet a recurring artifact-fulfillment procedure.

## Verification protocol

Require the implementation agent to run the repository-standard equivalents of:

1. dependency/workspace integrity
2. build
3. strict typecheck, including negative type fixtures
4. lint/format checks
5. unit tests
6. semantic lowering and profile tests
7. full resolved-contract fixture validation
8. CLI compile and validate integration tests
9. provenance/derivation assertions
10. repeated-output byte comparison
11. fixture readability, composition/reference coverage, and forbidden-vocabulary guard

The report must distinguish `NOT RUN` from `PASS`. A generated snapshot is not sufficient evidence unless tests also assert identity, lowering, validation, provenance, and deterministic semantics.

## Review checklist

After tests pass, review specifically for:

- raw catalog/system plumbing leaking into the normal fixture or package README
- semantic fields silently ignored because no backend component exists
- prose converted into invented thresholds or algorithms
- IDs derived from labels, variable names, traversal order, random values, or lossy sanitization
- specialization, part, feature, gameplay, or image-reference edges missing from the semantic projection and index
- hidden profile defaults or last-one-wins merging
- lowered records missing source/lowerer/profile evidence
- schema weakening, silent coercion, or use of `any` at validation boundaries
- loaders or paths coupled to the current working directory
- engine imports from DSL/compiler code or vice versa
- outputs containing time, absolute paths, host data, or noncanonical ordering
- tests that cannot fail or snapshots with no semantic assertions

Any intentional deviation from the goal must be named and justified in the completion report. The agent must not redefine an unmet criterion as satisfied.

## Later artifact work items

After requirements and receipts exist, a generated work item should remain agent-neutral and contain:

1. identity and current source hashes
2. one observable outcome
3. the minimal semantic and resolved technical slice
4. allowed changes
5. exact expected files
6. acceptance and validation
7. required trace or receipt evidence
8. explicit non-goals
9. completion-report format

The later queue is:

```text
ready requirement
  → bounded work item
  → implementation in an isolated worktree when useful
  → declared tests and validators
  → receipt/trace verification
  → recomputed status
```

A prompt must never mark its own requirement complete.

## Parallel work policy for later goals

Parallel implementation is safe only when work items have disjoint write paths and satisfied dependencies. Compiler core, semantic types, catalog generation, and shared test infrastructure usually overlap during Goal 1, so split them only with explicit ownership and an integration plan.

Independent generators, validators, documentation, or render adapters become better parallel candidates after stable IR and requirement boundaries exist.

## Suggested future skill

After the artifact workflow has been proven, a narrow shared skill may be useful:

```text
.agents/skills/antiky-artifact/SKILL.md
```

Its job should be: fulfill one ready work item, modify only allowed paths, run declared validators, write the required trace or receipt, and report acceptance. It should not choose arbitrary requirements, rewrite semantic contracts, or promote artifacts without an explicit task.

## Workflow references recorded by the research

- OpenAI Codex `AGENTS.md`: https://developers.openai.com/codex/agent-configuration/agents-md
- OpenAI Codex best practices: https://developers.openai.com/codex/learn/best-practices
- OpenAI Codex Agent Skills: https://developers.openai.com/codex/build-skills
- Anthropic Claude Code memory/imports: https://code.claude.com/docs/en/memory
- Anthropic Claude Code skills: https://code.claude.com/docs/en/skills
- OpenCode rules: https://opencode.ai/docs/rules/
- OpenCode Agent Skills: https://opencode.ai/docs/skills/

These references explain tool handoff. Repository files remain the authoritative task and design sources.
