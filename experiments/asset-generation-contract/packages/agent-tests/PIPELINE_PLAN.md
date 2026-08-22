# Contract DSL agent-evaluation plan

Status: **proposed; not approved for implementation or execution**

This document defines the decisions and evidence needed before AntikyLabs builds or runs an agent
benchmark for `@antiky/contracts`. It does not approve the existing prototype runner, any provider
spend, or any external-agent execution.

Lifecycle state: **not started**. There is no approved benchmark objective or goal contract. If the
owner approves the decisions in this document, the next planning action is to create a bounded goal
for the selected first-pilot shape—not to execute the current prototype.

## Intended decision

The experiment should help us decide whether the semantic TypeScript DSL and its documentation are
usable by coding agents for real contract-authoring work, and what must change before the DSL is
treated as a reliable authoring interface.

The primary question is:

> Given only an explicit task packet and the public DSL documentation, can an agent produce a
> readable semantic TypeScript contract that preserves the requested game, visual, and composition
> direction and passes the shipped compiler boundaries?

Secondary questions are:

- Can an agent make a narrow revision without damaging unrelated intent, identity, references, or
  generated output?
- Which failures come from the DSL, which come from its documentation, and which come from the
  agent or execution environment?
- What evidence would make a human comfortable accepting or revising the authored contract?

The experiment is not intended to rank general model intelligence, prove asset-generation quality,
test a game engine, or claim that a valid contract produces a good game or image.

## What “good” must mean

The benchmark needs three separate result classes. Combining them into one score would hide the
reason a run succeeded or failed.

### Mechanical correctness

These are objective gates derived from disclosed task requirements:

- the submission is valid strict TypeScript against the public DSL;
- it uses semantic DSL concepts instead of authored resolved JSON, ECS components, or systems;
- it compiles without blocking diagnostics;
- the resolved contract validates against the shipped schema and catalog;
- repeated compilation of unchanged input produces identical output bytes;
- required identities, relationships, reference-image lineage, and bounded edits are present;
- protected inputs remain unchanged and writes stay inside the disclosed task boundary.

A machine check must only enforce a requirement stated in the task packet. Hidden structural
preferences are not fair evaluator criteria.

### Semantic and editorial quality

These require human judgement:

- fidelity to the supplied brief and references;
- preservation of ambiguity when the brief is intentionally subjective;
- absence of invented requirements, measurements, algorithms, or lore;
- readable placement of direction in the appropriate scene, thing, region, population, rule, or
  review fields;
- scope discipline and preservation of unrelated authored intent.

Human reviewers should score named criteria and explain their evidence. Human scores describe
quality; the first pilot should calibrate them before anyone chooses a pass threshold.

### Experimental integrity

A run is usable evidence only when its task packet, documentation version, DSL/compiler version,
agent adapter, model identifier, settings, retry policy, transcript, final response, submission,
and evaluation are retained together. A manually edited submission can test an evaluator, but it
must not be reported as an agent result.

## Candidate experiment shapes

| Shape | What it buys | Cost and risk | Reversal cost |
| --- | --- | --- | --- |
| Manual protocol | Exposes task and rubric mistakes before tooling hardens them. Lowest initial complexity. | More operator work and less convenient repetition. | Low; the protocol remains useful input to later automation. |
| Thin runner | Automates workspace preparation, command invocation, evidence capture, and compiler checks after the protocol stabilizes. | Encodes assumptions that must remain visible and reviewable. | Moderate; file formats and adapter boundaries become compatibility surfaces. |
| Full benchmark harness | Supports larger matrices, strict schemas, reports, retries, and multiple providers. | Highest maintenance cost and greatest risk of measuring the harness instead of the DSL. | High; tasks and historical results become coupled to the harness format. |

Recommendation: start with the manual protocol. Move to a thin runner only after one human dry run
and a deliberately small agent pilot reveal that the task packet, evidence bundle, and review rubric
are stable. Do not approve a full harness until repeated runs make its additional machinery useful.

## Proposed task portfolio

The first pilot should use two different authoring operations. Their outcomes should be reported
separately.

1. **Greenfield authoring — Quiet Canal Market.** Start from a compact design brief and public
   documentation. This tests concept selection, information placement, restraint, and basic DSL
   discoverability.
2. **Bounded revision — Blue Winter Grove.** Start from the existing modular contract and reference
   images. Request a few exact semantic edits while requiring everything else to remain unchanged.
   This tests navigation, identity preservation, reference lineage, and change discipline.

A diagnostic-repair task is a useful later candidate, but it should not enter the first pilot. It
tests a different skill and would make early results harder to interpret.

The existing task briefs are drafts, not approved benchmark inputs. Before use, each must pass a
human dry run in which the reviewer can satisfy every machine gate using only disclosed
requirements. Evaluator-only files must not be visible to the agent, and public guidance supplied to
the agent must not contain the target answer.

## Proposed pipeline

```text
approved charter
      |
      v
task packet + frozen docs/compiler/model settings
      |
      v
human dry run -----> revise task or rubric if any requirement is ambiguous
      |
      v
isolated agent run -----> transcript + final response + authored files
      |
      +-------------> mechanical checks
      |
      +-------------> blinded human review
                              |
                              v
                 per-run evidence and findings
                              |
                              v
                    DSL/docs/task decision
```

### 1. Approve an experiment charter

Record the primary question, non-goals, task set, model/adapter cells, run count, retry policy,
resource ceiling, isolation level, reviewer process, and evidence-retention rules. Nothing should
execute before this approval.

### 2. Build task packets as documents

Each packet should contain:

- a task brief written for the agent;
- the exact writable boundary and supplied inputs;
- the public documentation set and version;
- disclosed objective requirements;
- a separate machine-check specification;
- a separate human-review rubric;
- the intended diagnosis when each check fails.

Machine checks may be hidden from the agent to prevent answer leakage, but their requirements may
not be hidden. Subjective preferences belong in the disclosed brief or human rubric, not in a secret
oracle.

### 3. Perform a no-model dry run

A human who did not author the evaluator completes each task from the same packet an agent would
receive. Any unmet check caused by missing or ambiguous instructions invalidates the packet. Revise
and repeat the dry run before spending provider resources.

### 4. Freeze an experiment cell

One cell is one task, agent adapter, model, model settings, tool policy, and attempt number. Give
each cell a fresh workspace. Record versions and settings outside the agent-visible task unless they
are relevant to the work.

### 5. Execute without silent retries

Capture the exact invocation, start and finish records, raw transcript streams, final response, and
post-run workspace. A failed attempt remains an attempt. A retry uses a new cell and must follow the
approved retry policy.

### 6. Evaluate in two lanes

Run mechanical gates from frozen task requirements. Separately, have a human review the semantic
source without being told which model produced it when practical. Report both lanes; do not convert
the human rubric into an undocumented machine threshold.

### 7. Analyze failure ownership

For every failure, classify the most likely boundary:

- task ambiguity or undisclosed evaluator preference;
- documentation gap or contradiction;
- DSL/API expressiveness or usability problem;
- compiler/validator defect;
- agent reasoning or scope failure;
- adapter, tool, permission, or environment failure;
- inconclusive.

The output of the pilot is a prioritized set of DSL, documentation, and experiment-design changes.
It is not a model leaderboard.

### Why this order matters

| Boundary | Why it cannot come earlier | What breaks when it is skipped |
| --- | --- | --- |
| Charter before task design | The intended decision determines which tasks and evidence are relevant. | The task accumulates checks that answer no agreed question. |
| Task packets before tooling | The packet is the experiment interface; tooling should encode a reviewed protocol. | An implementation silently turns its own conveniences into benchmark rules. |
| Human dry run before model execution | It distinguishes ambiguous instructions from agent failures without provider cost. | Hidden or impossible requirements are misreported as model or DSL failures. |
| Frozen cell before execution | Versions, permissions, settings, and retry rules affect the outcome. | Runs cannot be reproduced or compared honestly. |
| Execution before evaluation | Evaluation must bind to the exact attempt and post-run submission. | Manual edits or overwritten attempts can be mistaken for agent evidence. |
| Mechanical and human review before analysis | The two lanes explain different failure classes. | A single score hides whether syntax, semantics, or judgement failed. |
| Analysis before automation expansion | Pilot failures reveal which repeated work is actually worth automating. | The harness grows around assumptions that have not survived a real protocol. |

## Evidence bundle

The proposed durable bundle for each approved run is:

```text
run-metadata.json           task, adapter, model, versions, settings, attempt
task/                       exact agent-visible packet
evaluator/                  frozen machine checks and human rubric
execution/                  invocation, transcript, final response, exit record
submission/                 exact post-run workspace or content-addressed inventory
evaluation/
  mechanical.json           one result and evidence item per disclosed requirement
  human-review.json         criterion scores, notes, reviewer identity or pseudonym
  findings.md               failure ownership and observations
```

The repository should define retention and redaction rules before transcripts are collected.
Transcripts can contain credentials, local paths, or other material that should not be published
automatically.

## Reporting rules

- Report every run, including infrastructure failures and zero-output attempts.
- Keep task results separate; do not average Greenfield and Bounded Revision into one score.
- Keep mechanical outcomes separate from human quality scores.
- Do not compare providers unless task packets, permissions, tool access, settings, retry policy,
  and evidence capture are equivalent enough for the intended claim.
- Report raw counts and failure categories before producing any aggregate.
- Treat the first pilot as calibration. Do not set a universal pass threshold from uncalibrated
  rubric scores.

## Owner decisions required before implementation

| Decision | Options to consider | Planning recommendation |
| --- | --- | --- |
| Primary use | Improve the DSL/docs; compare model choices; establish a release gate | Start with DSL/docs improvement. A comparison or release gate needs stronger calibration. |
| First task set | Quiet only; Blue only; both | Use both and report them separately because they test different authoring operations. |
| Execution shape | Manual; thin runner; full harness | Approve a manual protocol first. |
| Model and adapter matrix | One configured agent; selected providers; broad matrix | Choose deliberately after task dry runs; do not infer a matrix from locally installed CLIs. |
| Attempts and retries | Single attempt; fixed repeats; conditional retries | Define before execution. Never silently overwrite or discard a failed attempt. |
| Tool and network policy | Repository tools only; network allowed; provider defaults | Freeze one policy per comparison and record it. |
| Isolation | Instruction-only workspace; OS sandbox/container | Choose based on the claim and sensitivity of local data. Instruction-only isolation cannot prove outside reads did not occur. |
| Human review | Named reviewer; blinded reviewer; multiple reviewers | Use blinded review when feasible; decide how disagreements are resolved before scoring. |
| Success threshold | Mechanical-only; rubric threshold; release gate | Calibrate first. Mechanical validity alone does not prove semantic quality. |
| Evidence retention | Local ignored data; private artifact store; publish redacted bundles | Decide before collecting transcripts. |
| Prototype disposition | **Chosen: quarantine** | The prototype is preserved under `prototype-quarantine/` and removed from active workspace hooks. |

The largest planning uncertainty is rubric calibration: we do not yet know whether independent
reviewers will interpret semantic fidelity and invented direction consistently. That uncertainty is
why the plan does not set a quality threshold or justify a broad model matrix yet.

## Approval gate

Implementation may start only after the owner approves:

1. the intended decision and non-goals;
2. the initial task packets and their disclosed requirements;
3. the human-review rubric and reviewer process;
4. the model/adapter cells, settings, attempt count, and retry policy;
5. the isolation, provider-resource, privacy, and evidence-retention boundaries;
6. whether the first executable form is manual, thin, or full;
7. confirmation that the quarantined prototype should remain reference-only or be removed before
   implementation begins.

After those decisions, the next plan should be limited to the minimum mechanism needed for the
approved first pilot. No external agent run is authorized by this document.

## Prototype quarantine

The implementation created before this plan was approved is quarantined under
`prototype-quarantine/`. It is not an npm workspace, is absent from root build, lint, test, and
typecheck scripts, and must not be treated as a baseline. The quarantine preserves:

- the runner source, tests, generated files, and package configuration;
- draft task briefs and evaluator manifests;
- local run evidence, including the unauthorized Codex attempt, as an incident record;
- prototype documentation describing what was built.

Nothing in the quarantine is approved for reuse. A later implementation goal must select any useful
idea independently from the approved experiment plan.
