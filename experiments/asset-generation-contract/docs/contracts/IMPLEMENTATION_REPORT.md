# Goal 1 implementation report

**Package:** `@antiky/contracts`

**Goal:** Declarative TypeScript Scene DSL and Compiler v0.1

**Report status:** Complete; all 22 acceptance criteria pass

This report uses only three acceptance states:

- `PASS`: the criterion was exercised successfully and the evidence is recorded here.
- `FAIL`: the criterion was exercised and did not pass.
- `NOT RUN`: the criterion lacks current evidence, even if relevant code or tests exist.

The evidence below combines executable checks with direct inspection. A test name alone is not used
as proof.

## Acceptance criteria

| ID | Status | Criterion | Evidence |
| --- | --- | --- | --- |
| AC-01 | PASS | `packages/contracts/` builds in an experiment-local npm workspace under strict TypeScript settings. | Clean `npm ci`, then `npm run check`; strict package, negative-type, fixture-type, and build projects all exited 0. |
| AC-02 | PASS | The primary API, CLI, and required `dsl`, `compiler`, `ir`, and `catalog` subpaths are available and documented. | `test/package-boundary.test.ts` imports all four built subpaths; the installed binary help, compile, and validate commands passed; `docs/contracts/README.md` documents each boundary. |
| AC-03 | PASS | The Blue Winter Grove module graph is valid TypeScript; the scene entry is under 120 physical lines, every fixture line is at most 120 columns, and no fixture module contains forbidden raw technical vocabulary. | Fixture typecheck passed. The examples package's `test/fixture-guard.test.ts` passed; direct measurement found 114 entry lines and a 119-column maximum across the six modules. |
| AC-04 | PASS | Constructors are pure, immutable declarations with no global registry or embedded runtime callbacks. | `test/dsl.test.ts` proves deep freeze, caller-container cloning, preserved reference identity, independent declarations, forged frozen-shell repair, and callback rejection; public-export checks exclude raw builders. |
| AC-05 | PASS | Type-level tests reject invalid archetype fields, reference kinds, relationship endpoints, enums, ranges, units, and raw backend fields. | `npm run test:types` passed inline and aliased negative cases, exact nested archetype shapes, branded ranges/units, the installed-profile capability, and raw backend rejection. |
| AC-06 | PASS | Root, `definitions`, and `cast` keys produce documented stable IDs; display-name and variable renames do not change them. | Identity tests in `test/compiler-frontend.test.ts` and `test/lowering-provenance.test.ts` prove exact IDs, rename stability, and visible key migrations. |
| AC-07 | PASS | Direct definition references resolve losslessly; dependency graphs are indexed and acyclic; duplicate, unbound, unreachable, and colliding identities are rejected with semantic paths. | Front-end and runtime-invalid suites cover all reference edges, reused parts, mixed dependency cycles, duplicate ownership, unbound/external references, unreachable definitions, acceptance-key collisions, and scope-safe review IDs. |
| AC-08 | PASS | The named versioned profile expands deterministically, appears in provenance, and diagnoses incompatible direction. | Profile tests prove default and explicit selection, stable expansion/provenance, duplicates, conflicts, unsupported or malformed records, exact installed identity, and counterfeit-content rejection. |
| AC-09 | PASS | Required semantic direction lowers or remains visibly preserved without silently dropping supported intent. | The integration test asserts fixture experience, visual, gameplay, parts, features, variation, rules, and acceptance in normalized semantic provenance; 38 item-specific image uses and every dependency edge remain indexed. Unsupported structured fields block. |
| AC-10 | PASS | `frames(population, region)` lowers to one valid technical relationship with exact endpoints and provenance. | Front-end, integration, catalog-validator, and derivation tests prove exact typed endpoints, catalog-valid `composition.frames` rules, and relationship derivation evidence. |
| AC-11 | PASS | Subjective prose remains intent or review criteria; compilation uses no AI resolver or undocumented prose-to-number/algorithm inference. | Resolved-output inspection and lowering tests show prose in semantic provenance, intent components, and human-review records. The package dependency and source scan found no AI resolver or prompt/model dependency. |
| AC-12 | PASS | Lowered output passes schema, catalog payload, entity-kind, reference, relationship, ownership, prototype, and system-DAG validation. | Public CLI compile emitted zero errors; compiler validation returned zero errors and seven ordered systems. Backend mutations reject each listed invariant, schema/catalog identity and locator drift, every supported invalidation reference, and system cycles. |
| AC-13 | PASS | The supplied full Blue Winter Grove JSON passes the same validator in place without modification or copying. | Public CLI validation of the 5,038-line `docs/asset-contract/blue_winter_grove.scene.json` returned zero errors and 18 systems; a content comparison against the original tracked files confirmed that the directory move changed no contract bytes. |
| AC-14 | PASS | Serialization, unsupported semantics, overrides, graph errors, and profile conflicts produce stable blocking diagnostics with semantic paths. | Front-end and runtime-invalid tests cover hostile values, cycles, malformed runtime shapes, forged root/range/unit data, unsupported nested values, graph failures, profile conflicts, and three invalid override classes without uncaught compiler failures. |
| AC-15 | PASS | Identical source and image bytes produce byte-identical outputs and hashes without time, random, absolute-path, or host data. | Two clean public-CLI compiles compared equal for all five files. Tests verify raw-byte image hashes, path independence, and locale-independent UTF-16 ordering; artifact scans reject machine-specific output. |
| AC-16 | PASS | Success emits all five required files; blocking failure does not emit a misleading resolved contract. | CLI and integration tests assert the exact five-file success set; a failing compile replaces stale output with `diagnostics.json` only and omits `resolvedContract`. |
| AC-17 | PASS | Every lowered technical record traces to a semantic source, lowerer version, profile version, or explicit override. | Provenance tests cover policies, catalog import, profiles, suites, ownership, reviews, prototypes, entities, components, relationships, systems, and overrides. Final fixture audit found zero missing records, dangling output paths, or duplicate review/rule IDs across 186 derivation IDs. |
| AC-18 | PASS | Generated `contract.refs.ts` type-checks and preserves exact IDs without alias collisions. | `test/artifacts.test.ts` parses the generated TypeScript, compares every key/value with resolved IDs, proves global key uniqueness and exact branded kinds, then compiles the file strictly. |
| AC-19 | PASS | Unit, type-level, integration, resolved-fixture, CLI, golden, provenance, and determinism tests pass with repository-standard commands. | `npm run check` passed lint, all strict type projects, build, and 14 Vitest files/113 tests across the contracts and examples packages. `test/golden.test.ts` pins representative lowering; the examples suite pins both committed five-file outputs byte for byte. |
| AC-20 | PASS | The package does not import the Antiky runtime; an engine consumer can use IR without loading the DSL or compiler. | `test/package-boundary.test.ts` scans every source import and the built IR import graph; all stay inside the declared package boundary and IR loads independently. |
| AC-21 | PASS | Package documentation covers authoring, profiles, compile/validate, outputs, diagnostics, overrides, and the trusted-TypeScript boundary. | Final accuracy review of `docs/contracts/README.md` against built exports, result shapes, installed CLI behavior, failure semantics, and override validation found no mismatch. Prose anti-slop lint returned zero findings. |
| AC-22 | PASS | The raw ECS API is absent from the primary example and ordinary API docs; any retained technical core is internal or advanced. | Fixture vocabulary guard and built-export tests exclude `component`, `ref`, and `defineSystem`; `docs/contracts/README.md` presents only semantic authoring and labels technical override/catalog use as advanced. |

## Changed-file categories

This is the Goal 1 implementation surface. Generated `dist/`, dependency installs, and ignored
acceptance output under `.tmp/` are not source changes.

| Category | Paths | Purpose |
| --- | --- | --- |
| Experiment workspace | `.gitignore`; `package.json`; `package-lock.json`; `tsconfig.base.json` | Local npm workspace, pinned tools, and shared strict TypeScript policy. |
| Documentation layout | `docs/README.md`; `docs/asset-contract/`; `docs/contracts/`; `docs/dsl-testing/` | Separates specifications, fixtures, handoff material, and package reference pages from the executable workspace packages. |
| Package metadata and build | `packages/contracts/package.json`; `tsconfig.json`; `tsconfig.build.json`; `tsconfig.fixture.json`; `tsconfig.types.json` | Subpath exports, CLI binary, build, lint, typecheck, fixture, and test commands. |
| Semantic DSL | `src/dsl/declarations.ts`; `guards.ts`; `immutable.ts`; `index.ts`; `profile.ts`; `relationships.ts`; `types.ts`; `values.ts` | Author-facing types, immutable constructors, direct-reference helpers, and the named profile. |
| Catalog | `src/catalog/index.ts`; `load.ts`; `merge.ts`; `types.ts`; `validator.ts` | Module-relative read-only schema/catalog loading, merge policy, and full technical validation. |
| Portable IR | `src/ir/index.ts`; `ref.ts`; `types.ts` | Engine-safe resolved types and exact branded references. |
| Compiler and CLI | `src/cli.ts`; `src/compiler/canonical.ts`; `collect.ts`; `compile.ts`; `contract-index.ts`; `diagnostics.ts`; `emission.ts`; `index.ts`; `load.ts`; `lower.ts`; `profiles.ts`; `reference-images.ts`; `serialization.ts`; `versions.ts` | Trusted entry loading, collection, profiles, lowering, validation, canonicalization, emission, and CLI. |
| Tests | `test/artifacts.test.ts`; `backend-validator.test.ts`; `canonical.test.ts`; `cli.test.ts`; `compiler-frontend.test.ts`; `compiler-invalid.test.ts`; `dsl.test.ts`; `golden.test.ts`; `integration.test.ts`; `lowering-provenance.test.ts`; `package-boundary.test.ts`; `reference-images.test.ts`; `types/dsl-invalid.ts` | Unit, negative/type-level, integration, CLI, golden, full-validator, artifact, provenance, boundary, image, and determinism evidence. |
| Examples package | `packages/examples/package.json`; `README.md`; `tsconfig.json`; `src/`; `compiled/`; `test/` | Readable Blue Winter Grove and Quiet Canal Market TypeScript sources, local reference evidence, reproducible canonical outputs, fixture guards, and byte-parity tests. |
| Semantic fixture readability | `packages/examples/src/blue-winter-grove/blue-winter-grove.contract.ts`; `blue-winter-grove.references.ts` | Expanded acceptance records and moved repeated scene-reference use records behind one readable exported value while preserving the same six-module fixture graph and reference-image bytes. |
| Contract documentation | `docs/contracts/README.md`; `docs/contracts/IMPLEMENTATION_REPORT.md` | User reference and evidence ledger, kept outside the publishable TypeScript package. |

Read-only inputs whose content must remain unchanged:

- `docs/asset-contract/schemas/generative-scene-contract.schema.json`
- `docs/asset-contract/schemas/component-catalog.json`
- `docs/asset-contract/blue_winter_grove.scene.json`
- `docs/asset-contract/quiet_canal_market.scene.json`

The semantic fixture under `packages/examples/src/blue-winter-grove/` is the user-supplied Goal 1
input and usability target. Its existing working-tree edits and image bytes were preserved. Active
images now live in the example's `references/` folder, and generated files live only in the paired
`packages/examples/compiled/blue-winter-grove/` directory.

## Commands and results

Commands ran from `research/experiments/asset-generation-contract/` on 2026-08-21.

| Check | Command | Result |
| --- | --- | --- |
| Install state | `npm ci` | PASS — exit 0; 58 packages installed from the lockfile. |
| Lint | `npm run lint` | PASS — Oxlint reported no findings in package source or tests. |
| Strict package and fixture typecheck | `npm run typecheck` | PASS — contracts, examples, negative-type, generated-ref, and complete six-module fixture projects exited 0. |
| Negative type cases | `npm run test:types` | PASS — the negative compile oracle exited 0. |
| Build and subpath declarations | `npm run build` | PASS — ESM JavaScript and declarations emitted successfully. |
| Unit and integration suite | `npm run test` | PASS — contracts: 12 files/107 tests; examples: 2 files/6 tests; 14 files/113 tests total. |
| Repository-standard aggregate | `npm run check` | PASS — lint, all type projects, tests, and final build exited 0 after clean install. |
| Installed CLI | `./node_modules/.bin/antiky-contract --help` | PASS — printed compile and validate usage through the workspace binary symlink. |
| Compile semantic fixture | `./node_modules/.bin/antiky-contract compile packages/examples/src/blue-winter-grove/blue-winter-grove.contract.ts --out <out-a>` | PASS — five files, zero errors. Repeated independently at `<out-b>` with the same result. |
| Compile examples package | `npm run build --workspace @antiky/contracts-examples` | PASS — clean regeneration emitted five canonical files each for Blue Winter Grove and Quiet Canal Market. |
| Examples package contents | `npm --cache /private/tmp/antiky-npm-cache pack --dry-run --workspace @antiky/contracts-examples` | PASS — the package contained its README, both `src/` scene trees, both `compiled/` output trees, and required package metadata only. |
| Validate compiled JSON | `./node_modules/.bin/antiky-contract validate <out-a>/resolved-contract.json` | PASS — zero errors and seven systems. |
| Validate supplied full JSON in place | `./node_modules/.bin/antiky-contract validate docs/asset-contract/blue_winter_grove.scene.json` | PASS — zero errors and 18 systems. |
| Deterministic repeat compile | `diff -rq <out-a> <out-b>` | PASS — the complete five-file directories were byte-identical. SHA-256 values are recorded below. |
| Package contents | `npm --cache /private/tmp/antiky-npm-cache pack --dry-run --workspace @antiky/contracts` | PASS — the package contained built JavaScript, declarations, source maps, and required package metadata only; long-form Markdown documentation remained under `docs/contracts/`. |
| Anti-slop code review | Core five-rule Oxlint plugin over `src` and `test`; structure checker over the package | PASS — zero code findings and zero structure findings. The structure tool could not infer a collection oracle, so direct Vitest collection supplies that evidence. |
| Anti-slop prose review | Prose checker over `docs/contracts/README.md` and this report | PASS — zero findings after the final report update. |
| Source-boundary review | `git diff --check`; content comparison across the `docs/asset-contract/` move; manual source/output review | PASS — no whitespace error, no backend fixture/schema/catalog content change, and compiler output appears only under the two explicit `packages/examples/compiled/` scene directories. |

The first repeat compile produced these hashes; the second compile matched every byte:

| File | SHA-256 |
| --- | --- |
| `resolved-contract.json` | `be5dec06b4e938db03e868c8ba11d53a36f89a17b1c6a6179268be70dc39d5a8` |
| `contract-index.json` | `7a4f09243c1027060ae1571d644b42d78b8773618ca571085ae109a856bb0ff4` |
| `contract.refs.ts` | `ab1e4886c341be9a5cac1b9575000f45e875aa5aa475a8a0e1dc347ab9396020` |
| `diagnostics.json` | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| `build-manifest.json` | `dc67da4c1604f9075fc475425a79267a55ec2d6695e052c52665dd9ca2a1316a` |

## Deviations

The public compiler validator returns the documented `{ valid, diagnostics, systemOrder }` result.
The lower-level catalog validator keeps its technical `{ ok, errors, systemOrder }` result so
compiler diagnostics can add semantic evidence. Technical overrides are limited to components
already registered in the supplied catalog. No custom component or profile registry was added.

One source-document inconsistency required an explicit choice. The desired API snippets in
`GOAL.md` and `DSL_REDESIGN.md` use `visual.density: 'dense'`, while `DSL_DESIGN.md` requires the
backend-supported finite set and the supplied catalog supports `low`, `medium`, `medium-high`,
`high`, and `very-high`. The implementation follows the finite catalog vocabulary and uses
`medium-high` in the fixture. Authors can still say “dense” in `visual.language`; the unsupported
enum literal is a type and runtime error. This is a deliberate correction to those two stale
snippets, not a silent coercion.

## Corrections made during verification

- The first installed-binary check exposed a symlink-sensitive CLI main-module comparison. The CLI
  now compares real paths, and an executable-level regression test covers the workspace symlink.
- Early diagnostic normalization retained explicit `undefined` fields. Canonicalization then failed
  while trying to report hostile input. Diagnostic construction now omits absent fields, and hostile
  function, non-finite, and cyclic values return ordinary blocking results.
- The first unsupported-field scan covered only the root and cast. It now covers reachable
  definitions too, so unknown structured intent cannot disappear silently.
- The full supplied fixture contains a valid layout-phase system that depends on a terrain-phase
  system. The validator therefore treats dependencies as authoritative and uses phase only as a
  deterministic ready-node tie-breaker; it does not invent a forbidden backward-phase rule.
- A structurally recreated profile could initially impersonate the installed profile identity while
  changing its contents. Named profile identity now requires an exact installed definition match.
- Structural range and unit records initially allowed invalid order or extra fields after TypeScript
  was bypassed. The public types are branded, constructors validate order, and runtime compilation
  rejects malformed endpoints and unsupported wrapper fields before normalization.
- A frozen outer declaration could initially retain mutable nested data. Preservation now requires a
  recursively frozen plain-data graph; otherwise constructors clone and deeply freeze the value.
- Collection initially assumed several statically valid nested shapes. The runtime boundary now
  validates root kind, arrays, records, required scalar fields, reference uses, acceptance checks,
  and declaration-specific containers before graph traversal. Primitive and array roots receive a
  rooted shape diagnostic, and compiler collection failures are returned as structured diagnostics.
- Relationship provenance initially used map notation for an output array, and validation promotion
  and catalog-import records lacked dedicated evidence. Optional and fallback authoring fields also
  produced paths that did not exist. Every emitted technical and semantic path is now resolved by
  tests for representative and minimal/default scenes; the final fixture audit found complete,
  non-dangling evidence across 186 derivation IDs.
- Output ordering initially used the host locale. All output-affecting comparisons now use stable
  UTF-16 code-unit order, with mixed-case keys tested independently of locale.
- Catalog and schema validation initially checked payloads without fully binding claimed identities,
  locators, versions, or all system invalidation fields. Public validation now checks each while
  accepting only the canonical locators or the supplied fixture's exact `./schemas/` locators.
- The first profile pipeline required an explicit profile despite the redesign's minimal-scene
  contract. Omission now selects `voxelDiorama` deterministically, while explicit selection remains
  visible in provenance. Raw profile/system types are absent from the ordinary DSL surface.
- Acceptance keys and human-review IDs initially allowed cross-record collisions. Acceptance keys
  are now grammar-checked and unique, and review IDs include their full scoped owner identity.
- The first evidence matrix had deterministic repeat tests but no fixed golden oracle. A small
  representative scene now asserts exact lowering facts and hashes all five expected output files.
- Readability review found compressed multi-field reference and acceptance records in the active
  fixture. They were expanded or moved behind one named exported value without changing creative
  content, module count, image bytes, or item-specific uses. The later examples-package move placed
  active images under `references/` and intentionally rebaselined their canonical relative paths.
- The first manual determinism command used two non-existent output names. The required five names
  were taken from the Goal and README, then all five were compared successfully; only those successful
  comparisons are recorded as evidence above.

## Risks

- Contract TypeScript is trusted build-time code. Importing it can execute module-level code; the
  normalization guard is not a sandbox.
- The top-level JSON Schema does not validate catalog payloads or all graph invariants by itself. A
  caller that skips `validateResolvedContract` can accept invalid technical data.
- Technical overrides intentionally couple a declaration to the backend catalog. Unknown,
  wrong-kind, or schema-invalid components must remain blocking.
- Exact stable IDs depend on scene, definition, and cast keys. Renaming a keyed binding is an identity
  migration even when the display name stays unchanged.
- Compiler output is contract evidence, not evidence that downstream assets, renders, or gameplay
  implementations exist.
- Generated contracts remain inputs to later engine and asset-production work. This goal validates
  their structure and provenance, not downstream visual fidelity or runtime behavior.

## Deliberately deferred

The following work remains outside Goal 1:

- `game`, `world`, and `scenario` constructors; narrative and audio components
- relationship helpers other than `frames`
- a public raw component, relationship, system, or arbitrary custom-profile authoring API
- an untrusted-TypeScript sandbox and file/line AST source maps
- engine/runtime integration and gameplay logic
- asset, voxel, terrain, population, render, or image generation
- artifact requirements, receipts, work-item generation, and vendor prompt adapters
- a TypeScript port of the full technical Blue Winter Grove fixture
- migration of the Quiet Canal Market fixture
