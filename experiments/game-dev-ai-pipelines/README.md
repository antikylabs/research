# Game-development AI pipeline research

This experiment asks which game-development workflows are reliable enough to teach to AI agents.
It studies public skills, tools, repositories, papers, and project reports; preserves the available
evidence; and turns concrete working methods into pipelines that can be inspected and evaluated.

The ultimate goal is to convert the strongest pipelines into:

- portable skills that guide agents through real game-development work;
- reference documentation that records inputs, outputs, constraints, tools, and failure modes; and
- tutorials that teach agents a complete, verified path through representative game-building tasks.

```text
source research -> pipeline extraction -> reliability evaluation -> skills, docs, and tutorials
```

## Research tracks

| Track | Purpose |
| --- | --- |
| [Skill-library research](skill-research/README.md) | Studies public agent skills, engine integrations, production disciplines, orchestration, safety, and evaluation to identify capabilities worth developing. |
| [Pipeline library](pipelines/README.md) | Extracts source-faithful workflows with explicit triggers, ordered actions, artifacts, review gates, feedback paths, and stop conditions. |

The [compact pipeline index](pipelines/PIPELINE_INDEX.md) is the quickest way to browse the current
catalog. The [researcher guide](pipelines/RESEARCHER.md) defines how sources are frozen, candidates
are admitted or rejected, evidence is labelled, and pipeline pages are checked.

## What reliable means here

A useful pipeline must do more than list tools or produce a successful screenshot. It should have:

- a repeatable trigger and a named game-development outcome;
- observable intermediate artifacts and clear ownership;
- acceptance, failure, feedback, and stop conditions;
- evidence that can be traced to frozen primary sources;
- explicit authority, provenance, licensing, and recovery boundaries; and
- representative evaluation against known tasks, failures, and preferably a no-skill baseline.

Publication in the pipeline catalog establishes that a workflow is source-supported and auditable.
It does **not** by itself establish that the workflow is effective, portable, production-ready, or
independently validated. Those claims require separate experiments and evidence.

## From research to skills and docs

Promising pipelines are evaluated before they become agent guidance. The parts that survive that
evaluation can be separated into the form that best serves an agent:

- **Skills** encode operational procedures, decision points, tool boundaries, and verification.
- **Reference docs** preserve stable facts, contracts, limits, and failure meanings.
- **Tutorials** exercise one complete path and prove that an agent can reach the intended result.
- **Evaluations** keep those materials honest by checking outcomes, regressions, safety, and failure
  recovery on representative game-development work.

The objective is not to copy external systems wholesale or synthesize one universal pipeline. It is
to build a tested library of narrow, composable ways of working that help agents make better games
and make their results easier to inspect.
