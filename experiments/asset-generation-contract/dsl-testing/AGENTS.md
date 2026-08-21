# Antiky Contract DSL agent instructions

These instructions apply to the Antiky contract DSL implementation goal. Merge them with stronger repository-local guidance rather than overwriting existing instructions.

## Read first

1. Read `GOAL.md` completely.
2. Read `README.md` and the linked design documents.
3. Inspect the repository's workspace, package manager, TypeScript, test, lint, and formatting conventions before proposing paths or commands.
4. Produce a concise implementation plan mapped to the acceptance criteria before editing.

## Architecture rules

- Keep the contract package separate from the Antiky runtime engine.
- The engine may consume IR types and resolved JSON; it must not execute or import authoring modules.
- Builders return declarative records and must not rely on mutable global registration.
- Compiled output contains plain JSON only.
- Preserve stable IDs exactly. Never silently rename or sanitize IDs in a lossy way.
- Ownership is a tree. Relationships and dependencies are graphs.
- Derive built-in component and relationship knowledge from the supplied catalog rather than duplicating it by hand.
- Prefer composition and pure helpers over classes, inheritance-heavy APIs, or fluent mutable builders.
- Do not place vendor-specific agent prompts in the core compiler.
- Do not claim tangible artifacts exist without files, hashes, validation, and receipts.

## Implementation discipline

- Follow existing repository conventions; do not introduce a second build or test toolchain.
- Use strict TypeScript. Do not use `any` to bypass contract typing or validation.
- Keep compiler passes explicit and testable.
- Make diagnostics stable, structured, and actionable.
- Deterministic outputs must not contain timestamps, random UUIDs, absolute paths, or environment-specific values.
- Add focused tests for positive behavior and every required failure mode.
- Do not expand scope into the engine, voxel generation, prompt generation, or the full fixture port.
- Treat the reference contracts and schemas as read-only fixtures.

## Before completion

- Run the repository's relevant build, type-check, lint, unit, integration, and determinism checks.
- Re-run the compiler twice on identical input and compare emitted bytes.
- Review the diff for accidental generated files, source fixture edits, or package-boundary violations.
- Report every acceptance criterion as `pass`, `fail`, or `not run` with evidence.
- List changed files, commands executed, unresolved risks, and deliberate deviations from `GOAL.md`.
