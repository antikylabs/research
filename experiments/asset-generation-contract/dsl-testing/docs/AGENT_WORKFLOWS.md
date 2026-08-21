# Using the Antiky Contract Work with Coding Agents

**Research checked:** August 20, 2026

## 1. One portable handoff, not three separate specifications

The repository should contain one authoritative task and one authoritative set of durable engineering instructions:

```text
AGENTS.md      # durable repository/package guidance
GOAL.md        # bounded task with acceptance criteria
CLAUDE.md      # thin adapter that imports AGENTS.md
```

Generated artifact work should follow the same pattern:

```text
artifact-requirement.json   # neutral source of truth
work-item.json              # neutral bounded task
work-item.md                # human/agent-readable rendering
```

Do not maintain separate semantic task definitions for Codex, Claude Code, and OpenCode. Vendor-specific wrappers should add invocation details, not change the goal, constraints, or acceptance criteria.

## 2. Durable instructions versus task instructions

### Put in `AGENTS.md`

- repository layout
- package boundaries
- build, lint, test, and typecheck commands
- architecture invariants
- coding conventions
- generated-file policy
- rules such as “engine may import IR but not compiler”
- how an agent must report completion

### Put in `GOAL.md`

- one goal
- context files
- in-scope deliverables
- explicit non-goals
- expected files
- acceptance criteria
- required tests
- definition of done

### Put in an agent skill later

- a repeated multi-step procedure, such as “fulfill one Antiky artifact requirement and write a receipt”
- scripts or templates used across many tasks
- workflow details that do not need to occupy every session's initial context

## 3. Codex

Current Codex tooling reads `AGENTS.md` before work begins and layers guidance from the repository root down toward the current working directory. For Goal 1, explicitly read `experiments/asset-generation-contract/dsl-testing/AGENTS.md` because the implementation target is its sibling `packages/contracts/` directory.

Codex also supports repository-local Agent Skills under `.agents/skills/`, which is a good later home for a repeatable “implement one Antiky work item” procedure.

### Recommended Goal 1 invocation

From the `research` repository root, start Codex and give it this task:

```text
Read experiments/asset-generation-contract/dsl-testing/GOAL.md and the referenced design files.
Implement only in experiments/asset-generation-contract/packages/contracts/, plus minimal workspace metadata under experiments/asset-generation-contract/.
Treat experiments/asset-generation-contract/asset-contract/ as read-only fixtures.
Produce a plan, then implement only Goal 1.
Run every repository-standard verification command.
In the final response, report each acceptance criterion as PASS, FAIL, or NOT RUN.
```

For a non-interactive workflow, pass the same instruction to the supported Codex execution command in your environment rather than pasting the entire design into the prompt. Keep `GOAL.md` version-controlled so the task is reviewable.

### Codex guidance

- Start in plan mode for the initial repository inventory and package-boundary decision.
- Keep `AGENTS.md` concise; link to detailed architecture docs rather than copying them.
- Use a dedicated worktree for parallel tasks once later artifact requirements are independent.
- Do not let a subagent broaden Goal 1 into model generation or engine integration.
- Ask the final reviewer to compare the implementation against the acceptance table, not merely summarize changed files.

## 4. Claude Code

Claude Code uses `CLAUDE.md` for project instructions. Its documentation explicitly supports importing another file with `@path` syntax, including using a small `CLAUDE.md` that imports `AGENTS.md`.

This package includes:

```text
AGENTS.md
CLAUDE.md
```

The adapter contains `@AGENTS.md`, allowing the same durable instructions to serve Claude Code without duplication.

Claude Code also supports skills, subagents, hooks, and path-scoped rules. Use them only when the workflow becomes repetitive:

- skill: fulfill one artifact requirement
- subagent: inspect a large contract slice or validator logs without flooding the main context
- hook: block writes outside allowed paths or require a verification command
- path-scoped rule: apply compiler-specific standards only under `experiments/asset-generation-contract/packages/contracts/**`

### Recommended Goal 1 invocation

```text
Read experiments/asset-generation-contract/dsl-testing/GOAL.md and every file in its “Start here” list.
Implement in experiments/asset-generation-contract/packages/contracts/ and treat the sibling asset-contract/ directory as read-only.
First inspect the research experiment conventions and propose a plan.
After the plan is coherent, implement only Goal 1.
Run build, lint, typecheck, unit, integration, and determinism tests.
Report every acceptance criterion explicitly.
```

## 5. OpenCode

OpenCode reads project `AGENTS.md` files and supports Agent Skills. It also supports Claude-compatible instruction and skill locations as fallbacks, making the same repository guidance portable.

OpenCode provides separate planning and building agent modes. Use the planning agent to inspect the repository and review the proposed package structure before switching to a write-enabled build agent.

### Recommended Goal 1 invocation

```text
Read experiments/asset-generation-contract/dsl-testing/GOAL.md.
Implement only in experiments/asset-generation-contract/packages/contracts/, plus minimal workspace metadata under experiments/asset-generation-contract/.
Treat experiments/asset-generation-contract/asset-contract/ as read-only fixtures.
Use the plan agent to inspect repository conventions and produce a scoped implementation plan.
Then use the build agent to implement only the approved plan.
Verify every acceptance criterion and report the exact commands and results.
```

A later `.agents/skills/antiky-artifact/SKILL.md` can be shared by Codex and OpenCode. If Claude Code must use the same skill, mirror or link it under `.claude/skills/` according to repository policy.

## 6. Agent-neutral work-item design

A generated work item should be usable without knowing which agent will run it.

Required sections:

1. **Identity** — requirement ID, kind, contract refs, source hash
2. **Goal** — one observable outcome
3. **Context** — minimal resolved contract slice and existing dependency artifacts
4. **Allowed changes** — packages and paths the agent may edit
5. **Expected outputs** — exact files or exports
6. **Acceptance** — tests, metrics, render checks, or human review
7. **Trace** — required implementation declaration or artifact receipt
8. **Non-goals** — what must not be changed
9. **Completion report** — required final response format

The work item should be small enough that an agent can reason about it without loading the entire game contract.

## 7. How generated prompts should be used

The compiler/planner can create a queue:

```text
ready requirements
  → generate work-items
  → select one work-item
  → run agent in a clean worktree
  → agent writes implementation + tests + receipt/trace
  → run validators
  → ingest receipt
  → recompute requirement status
```

A prompt should never directly mark an artifact as complete. Completion requires:

- expected files exist
- file hashes are recorded
- source hash is current
- required tests/validators pass
- receipt or implementation trace is valid

## 8. Parallel agent policy

Parallel work is safe when requirements have no overlapping write paths and their dependency artifacts are already satisfied.

Good parallel candidates:

- independent prototype generators
- separate validators
- separate documentation or test fixtures
- render adapters that consume the same stable IR

Poor parallel candidates:

- compiler core and catalog type generation touching the same files
- a prototype generator and the schema it depends on
- scene layout and a concurrently changing ownership model
- multiple agents editing one central manifest manually

Use worktrees and one requirement per branch. Merge dependency work before starting dependent artifact tasks.

## 9. Review protocol

Require the implementing agent to provide:

- concise summary of behavior delivered
- files added/changed
- architecture decisions and deviations
- commands run
- test/typecheck/lint results
- acceptance table with PASS/FAIL/NOT RUN
- unresolved risks
- explicitly deferred follow-up

Then run a separate review pass focused on:

- scope creep
- deterministic behavior
- schema weakening
- silent coercion
- duplicate sources of truth
- engine/compiler dependency violations
- tests that assert snapshots without asserting semantics
- generated output that contains timestamps or machine paths

## 10. Suggested future Agent Skill

After the artifact-requirement and receipt schemas exist, create one portable skill:

```text
.agents/skills/antiky-artifact/SKILL.md
```

Its job should be narrowly described:

> Fulfill one ready Antiky artifact work item, modify only allowed paths, run declared validators, write the required trace or receipt, and report acceptance criteria.

The skill should read the work item supplied to it. It should not choose arbitrary requirements, rewrite contracts, or promote artifacts without an explicit task.

## 11. Official sources

The recommendations above were checked against current official documentation:

- OpenAI Codex `AGENTS.md`: https://developers.openai.com/codex/agent-configuration/agents-md
- OpenAI Codex best practices: https://developers.openai.com/codex/learn/best-practices
- OpenAI Codex Agent Skills: https://developers.openai.com/codex/build-skills
- Anthropic Claude Code project memory and `CLAUDE.md` imports: https://code.claude.com/docs/en/memory
- Anthropic Claude Code skills: https://code.claude.com/docs/en/skills
- Anthropic Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- OpenCode rules: https://opencode.ai/docs/rules/
- OpenCode Agent Skills: https://opencode.ai/docs/skills/
- OpenCode agents: https://opencode.ai/docs/agents/
