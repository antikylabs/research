# Antiky Contract Traceability

## Purpose

Traceability answers both directions:

- From a semantic declaration, which lowered records, implementation modules, generated assets, tests, renders, validators, and reports fulfill it?
- From an implementation or artifact, which authoring decision caused it to exist, and is that evidence still current?

The first link—from semantic TypeScript to technical ECS—is part of Goal 1. Code scanning and artifact ingestion arrive later. Keeping the entire chain in one model supports impact analysis, incremental regeneration, agent accountability, navigation, promotion, and rollback.

```text
semantic source path
        │ lowerer/profile derivation
        ▼
technical contract ID/path
        │ requirement/implementation links
        ▼
code, tests, artifacts, renders, reports
        │ receipts, hashes, validation
        ▼
current / stale / invalid evidence
```

## Identity at each layer

### Semantic identity

Ordinary authors use local keys:

- a root `scene.key`
- entries in `definitions`, `cast`, and later `worlds`, `scenes`, and `scenarios`
- explicit keys on future reusable contract-library definitions

TypeScript variables and display names are not identity. Passing a definition value creates a typed semantic reference to its keyed binding.

### Technical identity

The compiler expands semantic keys into exact engine-facing IDs for:

- root contracts and entities
- prototypes
- regions and populations
- relationships
- profile-supplied systems and validation records
- later requirements and artifacts

These IDs are stable primary keys in resolved JSON and generated indexes. Their format is documented and reversible; the compiler rejects invalid keys instead of silently sanitizing them.

### Implementation and artifact identity

Implementation declarations, artifact requirements, receipts, tests, and reports have their own stable IDs and link to technical contract IDs. They should also retain semantic source paths through the compiler derivation map.

File paths and TypeScript symbol names may change. They are evidence locations, not contract identity.

## Goal 1 derivation map

Every technical record created by semantic lowering has derivation evidence:

```ts
interface Derivation {
  outputId: string;
  outputPath: string;
  semanticPaths: readonly string[];
  lowerer: {
    id: string;
    version: string;
  };
  profile?: {
    id: string;
    version: string;
  };
  overridePath?: string;
}
```

Examples:

- `$.experience` derives the root `description.intent` component and review context.
- `$.definitions.vanguard.basedOn` derives an exact prototype inheritance edge.
- `$.definitions.winterboundParty.parts.vanguard` indexes one named whole-part dependency.
- `$.cast.roundedGrove.of` derives a prototype-mix entry referencing the exact winter-tree prototype ID.
- `$.cast.clearing.references[0]` links an item-specific use to validated image bytes and their hash.
- `$.composition[0]` derives one `composition.frames` relationship.
- `voxelDiorama@0.1.0` derives coordinate policy, technical systems, validation defaults, and output policy.

`contract-index.json` indexes derivations by semantic path and output ID. It also indexes semantic dependency edges in both directions and image-reference uses by content hash. A canonical semantic projection in resolved contract provenance preserves fields that do not yet have an honest backend component. This makes “preserved but not operationally lowered” distinguishable from “silently lost.”

## Source locations

Goal 1 requires semantic object paths because builders and collection already know them. Absolute source paths are forbidden in deterministic output.

Optional file/line/column mapping may be added later using repository-relative paths and a deliberate source-map technique. Executing ordinary TypeScript does not reliably preserve call sites, so Goal 1 must not fake source coordinates.

Three maps serve different purposes:

1. **Semantic derivation map** — semantic paths to lowered records; required in Goal 1.
2. **Contract index** — exact IDs, kinds, ownership, components, relationships, systems, ancestry, hashes; required in Goal 1.
3. **Implementation/artifact trace manifest** — technical contract refs to code and tangible evidence; planned for Goal 6.

## Generated exact references

Goal 1 emits `contract.refs.ts` for implementation and tooling code. This is deliberately not the normal authoring-reference mechanism: scene authors pass definition values instead.

```ts
import { refs } from '../generated/blue-winter-grove/contract.refs';
import { defineImplementationTrace } from '@antiky/contracts/trace';

export const trace = defineImplementationTrace({
  id: 'implementation.synthesis.old-growth-winter-tree',
  fulfills: [refs.systems['system.synthesis.tree-geometry']],
  relatesTo: [refs.prototypes['prototype.blue-winter-grove.oldGrowthWinterTree']],
  reason: 'Generates deterministic voxel geometry for the old-growth winter-tree family.',
});
```

The generated module uses exact ID-keyed maps. Friendly aliases may be added only as optional conveniences because sanitized aliases can collide.

The declaration above is static implementation metadata. It does not control runtime behavior and does not belong in the semantic scene source.

## Trace link vocabulary

Use a small typed vocabulary instead of one generic `links` collection.

### `fulfills`

The implementation or artifact is directly responsible for satisfying a requirement.

Examples:

- a tree generator fulfills a profile/lowerer-derived tree-synthesis requirement
- a validator fulfills a metric implementation requirement
- a future interaction module fulfills a scenario objective

### `relatesTo`

The item is relevant but not solely responsible.

Examples:

- a snow material implementation relates to several thing definitions
- a camera helper relates to several acceptance views

### `generatedFrom`

The artifact was created from a specific contract node or canonical slice.

### `validates`

A test, validator, render, or report verifies a contract node, requirement, implementation, or artifact.

### `producedBy`

A generated artifact identifies the system, implementation, agent, human, or external tool that created it.

### `dependsOn`

An implementation or artifact requires another implementation/artifact to be current first.

## Code trace declarations

A later trace subpath may provide a zero-runtime or tree-shakable helper:

```ts
interface ImplementationTrace {
  id: string;
  fulfills?: readonly ContractRef[];
  relatesTo?: readonly ContractRef[];
  generatedFrom?: readonly ContractRef[];
  validates?: readonly ContractRef[];
  dependsOn?: readonly ImplementationRef[];
  reason: string;
}
```

The scanner should discover static evidence through an explicit export manifest or sidecar before considering an AST scan. It must not infer links from arbitrary program behavior.

## Artifact receipts

Generated models, bundles, renders, and reports use receipts rather than TypeScript declarations. A receipt links:

- requirement ID
- semantic and technical contract refs
- source contract and slice hashes
- profile/lowerer and producer versions
- output file paths and hashes
- deterministic seed stream where relevant
- validation results
- promotion status

A receipt is evidence only after a resolver verifies its IDs, hashes, files, producer policy, dependencies, and validation results.

## Bidirectional manifest

A later derived manifest can expose both authoring and implementation navigation:

```json
{
  "schemaVersion": "1.0.0",
  "contractHash": "sha256:...",
  "bySemanticPath": {
    "$.definitions.oldGrowthWinterTree": {
      "contractIds": ["prototype.blue-winter-grove.oldGrowthWinterTree"],
      "implementations": ["implementation.synthesis.old-growth-winter-tree"],
      "artifacts": ["artifact.prototype.blue-winter-grove.oldGrowthWinterTree.voxel-lod0"]
    }
  },
  "byContract": {},
  "byImplementation": {},
  "byArtifact": {},
  "orphans": [],
  "staleLinks": []
}
```

Source declarations and receipts are authoritative evidence. The manifest is derived and can be regenerated.

## Navigation behavior

Given a semantic declaration, an editor should show:

- keyed identity and semantic path
- normalized semantic value
- selected profiles
- lowered technical records and derivations
- ownership and relationship neighbors
- implementing files
- artifacts, tests, validators, and reports
- current, stale, missing, or invalid status
- diagnostics and review evidence

Given an implementation or artifact, it should show:

- semantic decisions it fulfills or relates to
- exact technical IDs and resolved slices
- why the item exists
- source/profile/lowerer/producer versions and hashes
- dependencies and validators
- whether its evidence is current

## Staleness and minimal invalidation

An implementation link or artifact may become stale when a relevant input changes:

- semantic source slice
- scoped identity
- selected profile or lowerer version
- resolved prototype ancestry
- technical system/validator policy
- producer implementation version
- dependency artifact hash
- schema/catalog/compiler semantics

Not every prose edit must rebuild geometry, and not every technical policy edit must invalidate every artifact. Derivation edges, system reads/writes, catalog invalidation metadata, and explicit trace refs identify the smallest affected set.

Examples:

- changing a human-review question changes review evidence, not pine geometry
- changing a winter-tree height range stales its geometry and dependent populations/renders
- changing a definition or cast key is an identity migration and stales exact-ID links
- changing a profile's render policy stales affected renders, not unrelated authored intent

## Coverage and orphan checks

Useful later rules include:

- every operational semantic field has a derivation or an explicit “preserved only” classification
- every required technical system has a fulfilling implementation
- every promoted artifact has complete provenance and current hashes
- every implementation trace references valid exact IDs
- every required future scenario objective has code and tests
- no managed generated file lacks a receipt
- no required implementation is unreachable from an accepted root contract

Coverage is measured by required semantic/technical nodes and evidence obligations, not source line count.

## Why comments are insufficient

Comments help local understanding, but they are untyped, difficult to index, easy to stale, and unable to prove hashes or producer versions. Structured derivations, static trace declarations, and verified receipts are machine-checkable and support bidirectional navigation.

## Roadmap boundaries

- **Goal 1:** scoped IDs, semantic derivations, contract index, exact generated refs, hashes
- **Goal 3:** artifact requirements, receipts, and status resolution
- **Goal 4:** game/world/scenario nodes that join the same graph
- **Goal 6:** implementation scanner, receipt ingestion, bidirectional manifest, stale/orphan validation

This order captures intent and deterministic derivation before asking implementation code or generated files to claim fulfillment.
