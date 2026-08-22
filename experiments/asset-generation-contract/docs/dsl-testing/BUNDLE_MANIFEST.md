# Bundle manifest

## Design and implementation handoff

- `README.md` — entry point, representation boundary, package target, and reading map
- `docs/DSL_REDESIGN.md` — authoritative declarative TypeScript language direction
- `GOAL.md` — bounded semantic-scene compiler implementation and acceptance criteria
- `docs/DSL_DESIGN.md` — detailed types, identity, profiles, lowering, provenance, and compiler architecture
- `ROADMAP.md` — evidence-gated follow-on goals
- `docs/COMPILER_OUTPUTS.md` — deterministic outputs and later artifact planning
- `docs/TRACEABILITY.md` — semantic-to-technical-to-implementation trace model
- `docs/RESEARCH_NOTES.md` — source findings, superseded raw-API experiment, decisions, and open questions
- `docs/AGENT_WORKFLOWS.md` — implementation-agent handoff procedure
- `HANDOFF_VALIDATION.md` — checks performed on the bundle and preserved fixtures

## Implemented contract examples

- [`../../packages/examples/src/blue-winter-grove/`](../../packages/examples/src/blue-winter-grove/) — Blue Winter Grove TypeScript module graph and four active references
- [`../../packages/examples/compiled/blue-winter-grove/`](../../packages/examples/compiled/blue-winter-grove/) — canonical Blue Winter Grove compiler output
- [`../../packages/examples/src/quiet-canal-market/`](../../packages/examples/src/quiet-canal-market/) — compact Quiet Canal Market TypeScript contract
- [`../../packages/examples/compiled/quiet-canal-market/`](../../packages/examples/compiled/quiet-canal-market/) — canonical Quiet Canal Market compiler output

## Historical and downstream examples

- `examples/blue-winter-grove-reference-prompts.md` — source roles, exact generation/edit prompts, version history, and hashes
- `examples/first-try/` — retained unversioned initial generated set and prompts
- `examples/artifact-requirement.example.json` — proposed later agent-neutral artifact requirement
- `examples/artifact-receipt.example.json` — proposed later evidence for a tangible artifact
- `examples/work-item.example.md` — proposed later bounded task rendered from a requirement

The intermediate `v2` and `v3` PNGs are intentionally absent. Their prompts, filenames, and hashes
remain in `examples/blue-winter-grove-reference-prompts.md` as generation lineage.

The JSON/work-item examples use exact resolved technical IDs because they live downstream of compilation. They are not examples of ordinary DSL references.

## Agent instruction adapters

- `AGENTS.md` — shared durable repository/task instructions
- `CLAUDE.md` — thin Claude Code adapter importing the shared instructions

## Reference inputs

- [`../asset-contract/`](../asset-contract/) — read-only technical specification, schemas, catalog, and fixtures
- [Research Notes checksum table](docs/RESEARCH_NOTES.md#sha-256-checksums) — integrity hashes for the eight source files

Files containing `EXAMPLE_*` values are illustrative drafts, not production schemas, hashes, receipts, or generated outputs.
