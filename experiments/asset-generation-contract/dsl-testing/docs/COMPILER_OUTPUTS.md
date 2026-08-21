# Compiler Outputs and Artifact Planning

## 1. The important distinction

There are two very different categories of output in the Antiky pipeline:

1. **Compiler artifacts** describe and index the contract.
2. **Generated or implemented artifacts** fulfill the contract in the engine or codebase.

A compiler can prove that a mature-pine prototype is valid, resolve its inheritance, and explain that a voxel asset should exist. It cannot claim that the asset is good, or even that it exists, without a generated file, receipt, and validation result.

This distinction prevents a common agentic-development failure: confusing a plausible plan or prompt with completed implementation.

## 2. Goal 1 compiler outputs

Goal 1 produces five deterministic files.

### 2.1 `resolved-contract.json`

Purpose: engine-facing canonical IR.

Contains:

- normalized top-level contract metadata
- explicit coordinate and determinism policy
- resolved palettes, materials, profiles, and prototypes
- flat entity map
- complete ownership tree
- relationships
- systems and valid dependency order
- validation definitions
- declared output contracts
- stable hashes and versions where appropriate

Does not contain:

- functions
- unresolved TypeScript imports
- `ContractRef` objects
- prototype `extends` links that still require resolution
- agent prompts
- generated voxel data
- runtime game logic

### 2.2 `diagnostics.json`

Purpose: structured repair instructions for humans, CI, and coding agents.

A diagnostic includes a stable code, severity, path, related contract ID, message, and optional hint. Blocking errors prevent misleading resolved output.

### 2.3 `contract-index.json`

Purpose: fast navigation and future trace/artifact planning.

Suggested indexes:

```json
{
  "byId": {},
  "childrenByParent": {},
  "incomingRelationshipsById": {},
  "outgoingRelationshipsById": {},
  "prototypesByAncestor": {},
  "systemsByReadType": {},
  "systemsByWriteType": {},
  "hashById": {}
}
```

The index is derived and may be regenerated. The resolved contract remains the source of truth.

### 2.4 `contract.refs.ts`

Purpose: give implementation code exact, typed, generated references without duplicating string IDs.

Use ID-keyed maps to avoid lossy-name collisions:

```ts
import { contractRef } from '@antiky/contracts/ir';

export const refs = {
  entities: {
    'population.pine.old-growth': contractRef<'population'>(
      'population.pine.old-growth',
    ),
  },
  prototypes: {
    'prototype.tree.snow-pine.mature': contractRef<'prototype'>(
      'prototype.tree.snow-pine.mature',
    ),
  },
  relationships: {
    'rel.old-growth.frames-clearing': contractRef<'relationship'>(
      'rel.old-growth.frames-clearing',
    ),
  },
  systems: {
    'system.synthesis.tree-geometry': contractRef<'system'>(
      'system.synthesis.tree-geometry',
    ),
  },
} as const;
```

Later implementation trace declarations import this module.

### 2.5 `build-manifest.json`

Purpose: reproducibility and cache identity.

Contains deterministic facts:

- compiler version
- schema and catalog versions/hashes
- authoring input hash
- resolved IR hash
- hashes for `resolved-contract.json`, `diagnostics.json`, `contract-index.json`, and `contract.refs.ts`
- compiler pass versions
- diagnostic counts

Do not include the build manifest's own hash in the manifest. A caller may hash it after emission and store that hash externally. Do not put a timestamp in the deterministic manifest. A separate execution log may record duration and time.

## 3. Tangible downstream artifacts

The uploaded Blue Winter Grove contract declares a useful target set. Downstream Antiky systems may create:

### 3.1 Resolved scene and build artifacts

- fully resolved scene contract
- dependency/invalidation graph
- deterministic generation plan

### 3.2 Scene bundle

A scene bundle can contain:

- terrain
- placed instances
- voxel assets
- semantic material assignments
- lighting and atmosphere configuration
- cameras
- runtime entity map

### 3.3 Asset library

Per-prototype or per-generated-instance artifacts:

- voxel geometry
- LOD variants
- collision or occupancy data when required
- attachment metadata
- semantic material slots
- per-asset metrics
- thumbnails or inspection renders
- artifact receipt

### 3.4 Render outputs

The source contract calls for beauty and diagnostic passes such as:

- beauty
- albedo
- normal
- depth
- object ID
- material ID
- population ID
- silhouette
- snow coverage
- sky exposure

### 3.5 Validation outputs

- JSON report
- Markdown report
- annotated image
- per-prototype metrics
- scene structural metrics
- compositional findings
- visual findings
- contract patch hints
- human review decisions

### 3.6 Provenance and promotion outputs

- provenance map
- artifact hashes
- source entity and prototype IDs
- producer system and version
- seed stream
- contract revision/hash
- promotion manifest

### 3.7 Gameplay artifacts in later contract layers

When game and scenario contracts exist, the artifact system may also require:

- TypeScript game-logic modules
- interaction handlers
- state machines
- input mappings
- UI components
- unit and integration tests
- scenario simulation fixtures
- trace declarations linking code to objectives and assets

## 4. Why prompts should not be core compiler IR

The user's idea—generate a prompt when a contract requires an asset that does not exist—is valuable. The clean architecture is:

```text
contract compiler
  → agent-neutral artifact requirements
  → receipt/status resolver
  → agent-neutral work items
  → vendor-specific prompt renderer
```

Do not store Codex-specific or Claude-specific language in resolved scene IR. Prompt wording changes faster than contract semantics and should be testable independently.

Benefits:

- one contract can be used by any agent or a non-AI generator
- prompts can evolve without invalidating engine IR
- work items remain inspectable and deterministic
- the compiler remains a data compiler rather than an orchestration framework
- vendors can be swapped without changing artifact identity or acceptance criteria

## 5. Proposed artifact requirement model

Goal 2 can add a neutral requirement schema.

```ts
type ArtifactStatus =
  | 'missing'
  | 'blocked'
  | 'ready'
  | 'satisfied'
  | 'stale'
  | 'invalid';

interface ArtifactRequirement {
  schemaVersion: string;
  id: string;
  kind: string;
  title: string;
  status: ArtifactStatus;
  statusReasons: string[];
  contractRefs: string[];
  source: {
    contractId: string;
    contractRevision: number;
    resolvedContractHash: string;
    contractSliceHash: string;
  };
  producer: {
    capability: string;
    implementationVersion?: string;
    requiredTooling?: string[];
  };
  inputs: JsonObject;
  dependsOn: string[];
  expectedArtifacts: ExpectedArtifact[];
  acceptance: AcceptanceRule[];
  trace: {
    generatedFrom: string[];
    relatesTo?: string[];
  };
}
```

An example requirement is included at `examples/artifact-requirement.example.json`.

### 5.1 Where requirements come from

Requirements can be derived deterministically from:

- prototype definitions
- system `produces` declarations
- scene `outputs`
- acceptance views
- validation suites
- future game/scenario objectives
- explicit artifact declarations added to the DSL later

The planner should avoid guessing more specific implementation kinds than the contract supports. A prototype with `geometry.treeGrammar` can reasonably require a tree asset bundle. It should not invent an exact source-file name or modeling algorithm unless a project policy supplies that mapping.

## 6. Artifact receipts

A receipt is evidence that a producer created files for a specific contract state.

```ts
interface ArtifactReceipt {
  schemaVersion: string;
  id: string;
  requirementId: string;
  status: 'satisfied' | 'invalid';
  source: {
    contractId: string;
    contractRevision: number;
    resolvedContractHash: string;
    contractSliceHash: string;
  };
  producer: {
    kind: 'system' | 'agent' | 'human' | 'external-tool';
    agent?: string;
    model?: string;
    implementation: string;
    implementationVersion: string;
    workItemId?: string;
  };
  artifacts: Array<{
    role: string;
    path: string;
    sha256: string;
    mediaType?: string;
  }>;
  validation: {
    result: 'pass' | 'fail';
    blockingFailures: number;
    warnings: number;
    reports: string[];
    checks: Array<{
      id: string;
      result: 'pass' | 'fail' | 'warning';
      observed?: JsonValue;
    }>;
  };
  trace: {
    generatedFrom: string[];
    relatesTo?: string[];
    producedBy?: string[];
    validates?: string[];
  };
}
```

A receipt is not trusted merely because it exists. The resolver checks:

- requirement ID matches
- source hash matches the current canonical contract slice
- every file exists
- file hashes match
- required validation passed
- producer identity/version satisfies policy

An example is included at `examples/artifact-receipt.example.json`.

## 7. Status resolution

A deterministic status algorithm can use these rules:

### `missing`

No receipt claims the requirement.

### `blocked`

One or more required dependency artifacts are not satisfied.

### `ready`

Dependencies are satisfied, but no valid receipt exists. This is the ideal state for generating an agent work item.

### `satisfied`

A valid receipt exists, source hash matches, files and hashes match, and required validators pass.

### `stale`

A receipt exists but its source hash, producer version, dependency hash, or relevant validation policy differs from the current requirement.

### `invalid`

Files exist and are current, but required validation fails or the receipt is malformed.

The status should explain exactly why it was chosen.

## 8. Work-item generation

A work item is the bounded unit handed to an agent or deterministic generator.

It should include:

- one requirement ID
- one or a few tightly coupled outputs
- exact contract refs
- a minimal contract slice
- resolved dependencies and their artifact paths
- allowed write paths
- files expected to exist at completion
- validation commands
- acceptance criteria
- required receipt and trace fields
- explicit non-goals

It should not include the entire 5,000-line scene unless the task genuinely depends on all of it.

A work item can be serialized as JSON, then rendered as Markdown. The included `examples/work-item.example.md` demonstrates the desired shape.

## 9. Prompt adapters

The neutral work item should be renderable for different tools.

### Codex adapter

May add:

- instruction to read repository `AGENTS.md`
- request to start in plan mode for a difficult task
- repository-standard command sequence
- requirement to report acceptance criteria

### Claude Code adapter

May add:

- instruction to read `CLAUDE.md`
- optional use of a dedicated skill or subagent
- hook-aware validation guidance

### OpenCode adapter

May add:

- selected build or plan agent
- command or skill invocation syntax
- permission expectations

The core task content must remain equivalent.

## 10. Prompt creation policy

Generate a prompt only when:

- a requirement is `ready`, `stale`, or `invalid`
- its dependencies are available or explicitly included in the same task
- the output is small enough for one bounded task
- acceptance can be verified automatically or by a defined human review

Do not generate a prompt when:

- a dependency is missing
- the contract has blocking diagnostics
- the requirement is already satisfied
- the task would modify unrelated packages without an explicit higher-level goal
- there is no defined way to validate completion

## 11. Example: mature snowy pine

A future planner might derive:

```text
Requirement: artifact.prototype.tree.snow-pine.mature.voxel-lod0
Contract refs:
  - prototype.tree.snow-pine.mature
  - prototype.tree.conifer.base
  - system.synthesis.tree-geometry
  - system.surface.snow-accumulation
Expected outputs:
  - generated/assets/prototype.tree.snow-pine.mature/lod0.voxels
  - generated/assets/prototype.tree.snow-pine.mature/lod0.metrics.json
  - generated/receipts/artifact.prototype.tree.snow-pine.mature.voxel-lod0.json
Acceptance:
  - deterministic rerun hash match
  - silhouette concavity minimum
  - negative-space ratio range
  - single-cone similarity maximum
  - snow coverage range
```

The generated agent task should include only the resolved prototype components, relevant system contracts, material roles, validation thresholds, and known dependency outputs.

## 12. Incremental rebuild implications

Every requirement should hash only the contract slice and producer versions that affect it.

Examples:

- changing the hero camera should stale render requirements, not mature-pine geometry
- changing the pine prototype should stale pine assets and populations that reference them
- changing the wind field should stale snow accumulation and wind-oriented vegetation, not base terrain topology
- changing a validation threshold may stale validation status without rebuilding geometry

This is why the contract index, system reads/writes, component invalidation metadata, and artifact receipts belong to one traceable build graph.

## 13. Recommended implementation sequence

1. Goal 1: deterministic DSL compiler and indexes
2. Goal 2: neutral artifact requirements and receipt resolution
3. Goal 3: work items and prompt adapters
4. Goal 4: implementation trace scanner
5. Goal 5: one real asset generator

Starting with prompt generation before canonical IDs, hashes, and receipts would create impressive-looking tasks without a reliable way to know whether they are current or complete.
