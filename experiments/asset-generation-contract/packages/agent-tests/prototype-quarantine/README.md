# Quarantined contract-authoring runner prototype

> **Status: quarantined. Do not execute this package as a benchmark.**
>
> The runner below was implemented before the experiment design was approved. It is retained as a
> recoverable record and is not an active npm workspace. The proposed experiment and the decisions
> required before implementation are in [PIPELINE_PLAN.md](../PIPELINE_PLAN.md).

## Unapproved prototype notes

The remainder of this page records what the prototype currently does. It is not a runbook or an
approved experiment protocol.

This private workspace package measures one shipped capability: whether a coding agent can author
or make a bounded revision to a semantic TypeScript scene contract, and leave compiler-verifiable
evidence. It does not plan future artifacts, generate game assets, run an engine, or demonstrate
that a downstream asset generator can consume the contract.

The two tasks are:

- `author-quiet-canal-market`: author from the preserved compact brief. Preparation creates no
  submission and does not copy the repository's Quiet Canal Market example or evaluator manifest
  into the run workspace.
- `revise-blue-winter-grove`: revise a prepared copy of the six source modules and four reference
  images while preserving the rest of the resolved graph.

Agents receive the same byte-identical `TASK.md`, submission scaffold, seed inputs, and three
oracle-free files copied from the [usage documentation](../../../docs/usage-docs/README.md): the DSL
reference, compile-and-validate how-to, and large-contract organization how-to. The machine oracle
in `tasks/*/task.json` is frozen under run evidence and is never copied into the agent workspace.

## Historical prototype workflow

These commands document the prototype only. Do not run them as an approved benchmark.

```text
npm run build --workspace @antiky/contracts
npm run build --workspace @antiky/contracts-agent-tests
node packages/agent-tests/dist/cli.js tasks
node packages/agent-tests/dist/cli.js doctor
```

Prepare one run. `prepare` prints the run id:

```text
node packages/agent-tests/dist/cli.js prepare author-quiet-canal-market --adapter codex --model MODEL
node packages/agent-tests/dist/cli.js prepare revise-blue-winter-grove --adapter claude --model MODEL
node packages/agent-tests/dist/cli.js prepare author-quiet-canal-market --adapter opencode --model PROVIDER/MODEL
```

Use that literal id for the remaining commands:

```text
node packages/agent-tests/dist/cli.js execute RUN_ID
node packages/agent-tests/dist/cli.js evaluate RUN_ID
node packages/agent-tests/dist/cli.js review RUN_ID --input REVIEW.json
```

`execute` requires the run to have an explicit model. It is append-only: after one execution record
exists, a retry requires a newly prepared run. `execute` is the only command that invokes a model.
`doctor` checks the required local compiler, type, documentation, and task inputs and probes adapter
commands with their version argv; it does not invoke a model or prove authentication/model access.
Preparation, evaluation, and review are local.

A prepared workspace can also be edited by hand to test the evaluator. Mark that intent explicitly:

```text
node packages/agent-tests/dist/cli.js evaluate RUN_ID --manual
node packages/agent-tests/dist/cli.js review RUN_ID --input REVIEW.json --manual
```

Manual results retain overall status `manual`; they never masquerade as completed agent evidence.
Default agent-mode `evaluate` and `review` exit nonzero when execution is absent or failed. A
successful execution with passing machine checks may exit zero while human review is still pending;
explicit manual commands use the machine result for their exit code.

## Adapter and model matrix

The harness passes the model string through without translating aliases or reasoning levels.

| Adapter | Process invoked directly | `--model` value | Provider boundary |
| --- | --- | --- | --- |
| Codex | `codex exec` | A Codex model id or configured alias | The installed Codex CLI and its configured provider |
| Claude | `claude --print` | A Claude model id or alias such as `opus` | The installed Claude Code CLI and its configured Anthropic environment |
| OpenCode | `opencode run` | `provider/model` | Any provider/model already available in the local OpenCode configuration |
| Other provider through OpenCode | `opencode run` | That OpenCode provider's `provider/model` id | Authentication, model availability, and routing remain OpenCode concerns |

The adapter layer only selects argv, working directory, transcript format, and final-response
extraction. It does not emulate one vendor's tools, prompt policy, context window, or reasoning
controls on another vendor.

## Evidence and evaluation

Each ignored `runs/RUN_ID/` directory contains:

```text
run.json
workspace/                  agent-visible task, guidance, seeds, and submission
evidence/
  task-manifest.json        strict evaluator oracle frozen when the run is prepared
  protected-inputs.json     SHA-256 inventory made before execution
  execution-attempt.json    exclusive reservation written before adapter probing/execution
  transcript.stdout.raw     unprocessed adapter stdout
  transcript.stderr.raw     unprocessed adapter stderr
  final-response.txt        adapter-specific final-response extraction
  post-execution-protection.json  protected-input/allowed-write result at execution end
  post-execution-workspace.json   full workspace byte inventory at execution end
  execution.json            requested command/argv, versions, prompt, model, and exit status
evaluation/
  compile-first/            first compiler output
  compile-second/           second compiler output
  typecheck.stdout
  typecheck.stderr
  evaluation.json           machine-readable result and human-review state
  evaluation.md             matching readable report
```

Machine evaluation checks the protected-file inventory and allowed-write boundary, strict
TypeScript, two independent compilations, byte parity for every emitted file, resolved-contract
validation, exact graph/reference expectations, declared resolved paths, source text rules, and —
for the revision task — parity with the prepared baseline outside the four permitted changes.
For agent-executed runs it also verifies that every workspace byte still matches the inventory made
immediately after execution, including files the task allowed the agent to write. Machine checks are
hard gates. The pass count is descriptive within a task; it is not a normalized quality score for
comparing unlike tasks.

Execution provenance is `not-run`, `manual`, `failed`, or `succeeded`. An exclusive attempt record
is created before adapter probing or invocation. If probing, launch, or evidence capture stops after
that reservation, evaluation reports `failed`; the run cannot be retried or converted to manual.

The evaluator and reviewer load `evidence/task-manifest.json`, not the package's current task file.
Changing `tasks/*/task.json` therefore affects newly prepared runs only. A legacy run without this
snapshot must be prepared again before it can be evaluated.

Human judgement remains explicitly pending after `evaluate`. A review must score every listed
criterion with an integer from 0 through 4 and include notes:

```json
{
  "reviewer": "reviewer name",
  "scores": [
    {
      "criterionId": "brief-fidelity",
      "score": 3,
      "notes": "The scene preserves the brief, with one awkwardly placed direction."
    }
  ]
}
```

Use the criterion ids emitted in that run's `evaluation.json`; the example above is intentionally
incomplete. `review` rejects a missing, duplicate, unknown, non-integer, or out-of-range score. It
reports the human subtotal out of `4 × criterion count` separately from machine gates. The 0–4
scores describe quality; zero is not an automatic failure and four is not an extra machine pass.
Overall `complete` means evidence completeness: the recorded agent execution succeeded, its
post-execution workspace is unchanged, all machine checks pass, and every human criterion has a
score and notes. It does not assert a minimum human quality score.

## Fairness and isolation limits

- Every adapter receives the same shared prompt and byte-identical `TASK.md`; adapter and model
  metadata live outside the workspace. Tests compare prepared inputs across adapters.
- Each run has a separate workspace. Protected inputs are hashed before execution, and evaluation
  rejects changed/deleted protected files or new files outside the declared write paths. A full
  post-execution inventory also prevents later edits from being attributed to the recorded agent.
- This is instruction-level read isolation, not OS-level read isolation. Runs live below the source
  repository, and a CLI that ignores the shared instruction may be able to inspect parent paths.
  Agent child processes receive `GIT_CEILING_DIRECTORIES` set to the run workspace so Git does not
  discover the ancestor repository, but this does not block ordinary filesystem reads. Strong read
  isolation requires an external container or sandbox applied consistently to every CLI.
- The Codex, Claude, and OpenCode permission models are not identical. Local configuration, cached
  instructions, tool availability, authentication, network access, provider routing, and CLI
  versions can change outcomes. Record `doctor`, `run.json`, and `execution.json` with results.
- Run one model/adapter pair per prepared workspace. Never reuse a submission across matrix cells.
  Keep temperature, reasoning settings, budgets, and retry policy with the benchmark record when
  those controls exist outside this harness.
- Raw transcripts can contain model or tool output that should not be published without review.
  The ignored `runs/` directory is evidence storage, not a release artifact.

For the authoring language itself, start with the [quick start](../../../docs/usage-docs/quick-start.md),
the [DSL reference](../../../docs/usage-docs/reference/dsl.md), and the
[compiler/output workflow](../../../docs/usage-docs/how-to/compile-and-validate.md). The shipped source
examples remain available separately in [`@antiky/contracts-examples`](../../examples/README.md); they
are evidence for the compiler package, not inputs to the Quiet Canal Market benchmark run.
