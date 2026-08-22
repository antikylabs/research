# Antiky declarative contract agent instructions

These instructions apply when maintaining the historical Goal 1 handoff in this directory. Merge
them with every applicable `AGENTS.md` from the workspace root toward the file being changed;
stronger or more local instructions win. For current authoring and compiler usage, start at
[`../usage-docs/README.md`](../usage-docs/README.md). Shipped exports, types, tests, and current usage
reference are authoritative when they differ from a proposal in this handoff.

## Read first

1. Read `docs/DSL_REDESIGN.md` completely. It is the Goal 1 design anchor, not a current API reference.
2. Read `GOAL.md` completely.
3. Read `README.md`, `docs/DSL_DESIGN.md`, and the other documents named by the goal.
4. Inspect workspace, package-manager, TypeScript, test, lint, and formatting conventions before proposing paths or commands.
5. Produce a concise plan mapped to the goal's acceptance criteria before editing.

If documents in this handoff conflict, preserve the historical record and call out the conflict.
Do not change shipped behavior to match an obsolete example without a separate implementation goal.

## Scope

- Implement compiler and library code only in `../../packages/contracts/`.
- Keep runnable contract examples and their canonical output in `../../packages/examples/`.
- Add only minimal workspace metadata under `../..` when required.
- Treat `../asset-contract/` as read-only schemas, catalog, specifications, and fixtures.
- Do not implement package code in `docs/dsl-testing/` or the separate `antiky` repository.
- Do not broaden Goal 1 into asset generation, engine/runtime work, artifact planning, game/world/scenario roots, or a full fixture port.

## Authoring-language rules

- TypeScript is the primary DSL. It is typed, object-shaped, semantic, and declarative.
- Ordinary authors describe experience, visual direction, gameplay direction, important definitions, meaningful relationships, variation, rules, and acceptance.
- `scene`, `thing`, `region`, and `population` are author-facing semantic archetypes over the technical ECS.
- Reusable things bind under `scene.definitions`; placed regions and populations bind under `scene.cast`.
- `thing.basedOn` expresses specialization. Named `thing.parts` and region features create direct, reusable definition dependencies.
- Builders are pure and immutable. They must not depend on mutable global registration or embed runtime callbacks.
- Passing a definition value creates a typed reference. Keyed definition/cast records provide scoped stable identity.
- `referenceImage(...)` values are reusable; declarations tag them with item-specific uses.
- Preserve record keys exactly when expanding IDs. Never derive identity from display labels, variable names, traversal order, random values, or lossy sanitization.
- Keep `component(...)`, `ref(...)`, raw catalog names, `defineSystem`, system phases, schema plumbing, camera vectors, and output paths out of the normal DSL and compact fixture.
- A technical override is an explicit, schema-validated, provenance-bearing escape hatch, not the default authoring path.
- Do not translate subjective prose into invented numeric or algorithmic meaning. Preserve it as intent or human-review criteria unless a typed field/profile defines a deterministic mapping.
- Compilation contains no AI or natural-language resolver.

## Compiler rules

- The semantic DSL lowers deterministically into the supplied technical entity-component graph.
- The engine consumes canonical JSON or IR types; it must not execute/import authoring modules or compiler code.
- Every lowered record traces to a semantic source path, a versioned lowerer, a named profile, or an explicit override.
- Named, versioned profiles provide inspectable technical defaults. Diagnose incompatible direction instead of applying a silent winner.
- Ownership is a tree. Meaning, reference, and dependency are graphs.
- Derive backend component, relationship, schema, and phase knowledge from the supplied catalog rather than duplicating lists by hand.
- Keep compiler passes explicit and independently testable.
- Validate normalized output at runtime even when TypeScript accepted the authoring input.
- Emit only plain canonical data. Reject functions, cycles, non-finite numbers, unsupported instances, and other non-normalizable values with semantic paths.
- Deterministic outputs must not contain timestamps, random UUIDs, absolute paths, working-directory values, or host-specific data.
- Preserve exact engine IDs in generated refs and indexes; sanitized aliases cannot be the only representation.
- Preserve and index specialization, part, feature, gameplay, and image-reference edges even when the backend can only retain their semantic projection.
- Keep vendor-specific prompts outside the core compiler.
- Do not claim tangible artifacts exist without files, hashes, validation, and receipts.

## Implementation discipline

- Follow existing repository tooling; do not introduce a parallel build or test stack.
- Use strict TypeScript. Use `unknown` and validation at JSON boundaries; do not use `any` to bypass the model.
- Prefer small deep modules and explicit data flow over classes, fluent mutation, or speculative abstraction layers.
- Add focused positive, negative, type-level, integration, full-fixture, provenance, CLI, and determinism tests, including dependency-kind and cycle cases.
- Do not weaken supplied schemas or silently coerce/discard invalid intent to make a fixture pass.
- Resolve fixtures from stable package/module locations, not the current working directory or machine-specific paths.

## Before completion

- Run the relevant build, typecheck, lint, unit, integration, full-fixture, CLI, provenance, and determinism checks.
- Compile the same input twice and compare every emitted byte.
- Enforce the compact scene entry's under-120-line guard, the fixture module set's 120-column guard, compositional/reference coverage, and forbidden-vocabulary constraints with deterministic checks.
- Review the diff for source-fixture edits, generated debris, raw technical vocabulary in ordinary authoring docs, and package-boundary violations.
- Report every acceptance criterion as `PASS`, `FAIL`, or `NOT RUN` with evidence.
- List changed files, commands/results, unresolved risks, and deliberate deviations.
