# Goal: harvest AI game-development pipelines

Use this prompt to process every unresearched target in the pipeline intake.

```text
Read and follow these files before doing any research:

- research/experiments/game-dev-ai-pipelines/pipelines/RESEARCHER.md
- research/experiments/game-dev-ai-pipelines/pipelines/PIPELINE_TEMPLATE.md
- research/experiments/game-dev-ai-pipelines/pipelines/README.md
- research/experiments/game-dev-ai-pipelines/pipelines/PIPELINE_INTAKE.txt

Also read every AGENTS.md that governs files you inspect or change.

For every repository or source listed under the unresearched section of PIPELINE_INTAKE.txt:

1. Freeze the exact source revision. Record the canonical target, full commit SHA or paper version,
   retrieval date, authorship, licenses and separate reuse boundaries, inspected artifacts, and
   execution boundary.
2. Inventory the complete relevant source. Inspect more than the README: include instructions,
   documentation, skills, routers, source code, schemas, scripts, tests, fixtures, examples,
   history, licenses, and directly relevant primary sources.
3. Enumerate every workflow-shaped candidate. Give every candidate an explicit admit, reject,
   duplicate, defer, or subsumed disposition under the admission rules in RESEARCHER.md. Do not
   stop after finding the first viable workflow.
4. Publish one source-faithful `pipeline-<group-name>-<name>.md` page for every distinct candidate
   that passes the admission gate. Do not invent a generalized house workflow, weaken the gate,
   publish setup or capability catalogs as pipelines, or split parent workflows into subloops that
   lack independent triggers and outcomes.
5. Preserve source order, gates, feedback paths, failure conditions, outputs, stop conditions,
   contradictions, inference labels, evidence limits, and license boundaries. Use frozen, direct
   primary-source links. Do not claim effectiveness, production use, or independent validation
   without the required evidence.
6. Add every accepted page exactly once to the pipeline table in README.md, with matching scope and
   evidence signals. Update PIPELINE_INDEX.md so it remains a compact title-and-description index
   of every `pipeline-*.md` page in the folder.
7. After a target is fully researched and all accepted pages pass validation, move its exact URL
   from the unresearched section of PIPELINE_INTAKE.txt to the researched section. Preserve the
   remaining queue verbatim.

Before reporting completion, prove from the current worktree that:

- every intake candidate has a disposition and no required target remains unresearched;
- every admitted workflow has a page and every rejected, duplicate, deferred, or subsumed
  candidate does not have an improper page;
- every pipeline page has all six evidence-capsule fields, all required template sections, exactly
  one Mermaid diagram, and no more than nine main nodes;
- every diagram node and edge is source-supported or explicitly labelled as inference in both the
  diagram and prose;
- README.md and PIPELINE_INDEX.md each index every pipeline file exactly once, with matching titles,
  scopes, and evidence signals where applicable;
- all Markdown links resolve, every Mermaid diagram parses with the pinned CLI, and
  `git diff --check` passes; and
- unrelated worktree changes remain untouched.

Do not install or execute target repositories, services, skills, or dependencies unless the
assignment explicitly authorizes it. Reading source and history is allowed. Keep a material
harvest record and report frozen references, inspected source inventory, the complete candidate
ledger, created filenames, evidence signals, contradictions, validation results, and anything
unresolved.
```
