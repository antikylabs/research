# Antiky Traceability Design

## 1. Purpose

Traceability answers both directions of the question:

- **From a contract node:** What code, generated assets, tests, renders, validators, and reports implement or fulfill this intent?
- **From an implementation artifact:** Which contract nodes caused this file to exist, and why is it still needed?

This is not just documentation. It is the foundation for:

- agent accountability
- stale implementation detection
- incremental regeneration
- impact analysis
- editor navigation
- contract change review
- artifact promotion and rollback

## 2. Stable IDs are the primary keys

Every traceable item uses stable IDs:

- contract entities
- prototypes
- relationships
- systems
- validation suites and views
- future game, world, scenario, and objective nodes
- implementation modules
- generated artifacts
- artifact requirements and receipts

File paths and TypeScript symbol names may change. Stable contract IDs should survive ordinary refactoring.

## 3. Generated typed references

Goal 1 generates `contract.refs.ts` from resolved IR.

Implementation code imports these refs instead of repeating strings:

```ts
import { refs } from '../generated/blue-winter-grove/contract.refs';
import { defineImplementationTrace } from '@antiky/contracts/trace';

export const trace = defineImplementationTrace({
  id: 'implementation.synthesis.snow-pine',
  fulfills: [
    refs.systems['system.synthesis.tree-geometry'],
  ],
  relatesTo: [
    refs.prototypes['prototype.tree.snow-pine.mature'],
    refs.prototypes['prototype.tree.conifer.base'],
  ],
  generatedFrom: [
    refs.entities['scene.blue-winter-grove'],
  ],
  reason: 'Generates deterministic voxel geometry for mature snowy pine prototypes.',
});
```

The trace declaration is static metadata. It does not control runtime behavior.

## 4. Trace link types

Use a small typed vocabulary instead of one generic `links` array.

### `fulfills`

The implementation or artifact is directly responsible for satisfying the referenced contract requirement.

Examples:

- a tree generator fulfills `system.synthesis.tree-geometry`
- an interaction handler fulfills a future scenario objective
- a validator fulfills a validation metric implementation requirement

### `relatesTo`

The item is relevant but not solely responsible.

Examples:

- a snow material profile relates to several snow-receiver prototypes
- a shared camera helper relates to multiple acceptance cameras

### `generatedFrom`

The artifact was created from a specific contract node or contract slice.

Examples:

- a voxel bundle generated from a resolved prototype
- a render generated from a camera and scene revision

### `validates`

The test, validator, or report verifies a contract node or implementation.

### `producedBy`

A generated artifact points to the system/implementation that created it.

### `dependsOn`

The implementation or artifact requires another implementation/artifact to be valid first.

## 5. Code trace declarations

A future trace package can provide a zero-runtime or tree-shakable declaration helper:

```ts
export interface ImplementationTrace {
  id: string;
  fulfills?: ContractRef[];
  relatesTo?: ContractRef[];
  generatedFrom?: ContractRef[];
  validates?: ContractRef[];
  dependsOn?: ImplementationRef[];
  reason: string;
}
```

The scanner can discover trace objects by one of these approaches:

1. an explicit package export manifest
2. a build-time registration function that emits static data
3. a TypeScript AST scan for a known helper call
4. sidecar `.trace.json` files

Prefer explicit export/sidecar mechanisms over arbitrary AST inference. The scanner should not need to understand general program behavior.

## 6. Generated artifact receipts

Generated models, scene bundles, renders, and reports use receipts rather than TypeScript trace declarations.

A receipt links:

- artifact requirement ID
- contract refs
- source contract hash
- producer system/agent and version
- output files and hashes
- seed stream
- validator results
- promotion status

Receipts give binary and generated files the same traceability model as source code.

## 7. Source mapping

Three source maps are useful:

### 7.1 Authoring source map

Maps resolved contract IDs or JSON paths back to the TypeScript authoring module and line/column. This improves diagnostics and editor navigation.

It is desirable but optional in Goal 1 because module execution does not naturally preserve source locations without AST transforms or instrumented builders.

### 7.2 Contract index

Maps IDs to kinds, parents, components, relationships, system readers/writers, ancestry, and canonical hashes. Goal 1 requires this.

### 7.3 Implementation/artifact trace manifest

Maps contract refs to code and artifact refs, and vice versa. This is Goal 4.

## 8. Proposed trace manifest

```json
{
  "schemaVersion": "1.0.0",
  "contractHash": "sha256:...",
  "byContract": {
    "prototype.tree.snow-pine.mature": {
      "implementations": ["implementation.synthesis.snow-pine"],
      "artifacts": ["artifact.prototype.tree.snow-pine.mature.voxel-lod0"],
      "validators": ["validator.asset.tree-structure"],
      "tests": ["test.snow-pine.determinism"]
    }
  },
  "byImplementation": {
    "implementation.synthesis.snow-pine": {
      "files": ["packages/engine/src/generation/snow-pine.ts"],
      "fulfills": ["system.synthesis.tree-geometry"],
      "relatesTo": ["prototype.tree.snow-pine.mature"]
    }
  },
  "byArtifact": {},
  "orphans": [],
  "staleLinks": []
}
```

The manifest is derived. Source trace declarations and receipts are authoritative evidence.

## 9. Bidirectional editor behavior

Given a contract node, an editor should show:

- authoring source
- resolved IR
- parent/children
- related graph edges
- reading and writing systems
- implementing files
- generated artifacts
- tests and validators
- current/stale status
- latest diagnostics and reports

Given an implementation file or generated artifact, it should show:

- contract nodes it fulfills
- related intent and non-goals
- source hashes
- dependencies
- required validators
- whether the link is current
- why the item exists

## 10. Staleness rules

A link or artifact becomes stale when any relevant input changes:

- contract node hash
- resolved prototype ancestry/hash
- producer implementation version
- dependency artifact hash
- validation policy
- schema or compiler behavior that changes canonical semantics

Not every contract change should stale every implementation. Use system read/write metadata, component invalidation metadata, and explicit trace refs to calculate the smallest affected set.

## 11. Orphan and coverage checks

Useful validation rules include:

- every required system has at least one fulfilling implementation
- every promoted artifact has complete provenance
- every implementation trace references valid contract IDs
- every required scenario objective has code and tests in later layers
- no artifact receipt references an obsolete source hash
- no generated file under managed output paths lacks a receipt
- no implementation marked required is unreachable from an accepted game/scene contract

Coverage should be measured by required contract nodes, not by raw line count.

## 12. Traceability versus comments

Comments remain useful for local explanation, but they are not sufficient for traceability because they are:

- untyped
- difficult to index reliably
- easy to make stale
- unable to prove artifact hashes or producer versions
- weak for bidirectional navigation

A static typed trace declaration plus a receipt is structured, testable, and machine-queryable.

## 13. Goal boundaries

### Goal 1

- stable IDs
- generated typed refs
- contract index and hashes

### Goal 2

- artifact requirements and receipts

### Goal 3

- bounded work items and prompt adapters

### Goal 4

- source-code trace declarations
- scanner
- bidirectional manifest
- stale/orphan validation

This sequence captures the identifiers and evidence first, before adding a graph UI or automated agent orchestration.
