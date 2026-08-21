# Bundle manifest

## Handoff documents

- `README.md` — architecture summary and entry point
- `GOAL.md` — bounded Goal 1 implementation specification and acceptance criteria
- `ROADMAP.md` — sequenced follow-on goals
- `docs/DSL_DESIGN.md` — DSL and package design
- `docs/COMPILER_OUTPUTS.md` — compiler outputs, tangible artifacts, requirements, receipts, and prompts
- `docs/TRACEABILITY.md` — contract-to-code-to-artifact trace graph
- `docs/AGENT_WORKFLOWS.md` — Codex, Claude Code, and OpenCode handoff patterns
- `docs/RESEARCH_NOTES.md` — source analysis, external research, decisions, and open questions
- `HANDOFF_VALIDATION.md` — checks performed on the bundle and preserved source fixture

## Examples

- `examples/blue-winter-grove.contract.ts` — conceptual compact DSL fixture
- `examples/artifact-requirement.example.json` — agent-neutral missing-artifact requirement
- `examples/artifact-receipt.example.json` — evidence that a tangible artifact satisfies a requirement
- `examples/work-item.example.md` — bounded task rendered from a requirement

## Agent instruction adapters

- `agent/AGENTS.md` — shared portable repository instructions
- `agent/CLAUDE.md` — Claude Code adapter importing the shared instructions

## Reference inputs

- [`../asset-contract/`](../asset-contract/) — source package extracted from the uploaded archive and shared with this DSL work
- [Research Notes checksum table](docs/RESEARCH_NOTES.md#sha-256-checksums) — integrity hashes for the source files

The conceptual examples marked `draft` or containing `EXAMPLE_*` placeholders are documentation artifacts, not production schemas or generated outputs.
