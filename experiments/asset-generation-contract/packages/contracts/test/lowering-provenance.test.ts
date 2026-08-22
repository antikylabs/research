import { describe, expect, it } from 'vitest';

import {
  compileContract,
  type CompilationResult,
} from '../src/compiler/index.js';
import {
  between,
  frames,
  population,
  region,
  scene,
  thing,
  voxelDiorama,
  type SceneDefinition,
} from '../src/dsl/index.js';

interface IndexedDependency {
  readonly kind: string;
  readonly role?: string;
  readonly semanticPath: string;
  readonly sourceId: string;
  readonly targetId: string;
}

interface DerivationEvidence {
  readonly outputId: string;
  readonly outputPath: string;
  readonly semanticPaths: readonly string[];
  readonly lowerer: { readonly id: string; readonly version: string };
  readonly profile?: { readonly id: string; readonly version: string };
  readonly overridePath?: string;
}

interface ContractIndexView {
  readonly byId: Readonly<Record<string, { readonly kind: string; readonly path: string }>>;
  readonly childrenByParent: Readonly<Record<string, readonly string[]>>;
  readonly dependenciesBySourceId: Readonly<Record<string, readonly IndexedDependency[]>>;
  readonly dependentsByTargetId: Readonly<Record<string, readonly IndexedDependency[]>>;
  readonly derivationsByOutputId: Readonly<Record<string, readonly DerivationEvidence[]>>;
  readonly hashById: Readonly<Record<string, string>>;
}

interface BuildManifestView {
  readonly inputs: { readonly semanticSha256: string };
  readonly outputHashes: Readonly<Record<string, string>>;
  readonly resolvedContractSha256: string;
}

type CompilationFileName = keyof CompilationResult['files'];

function parseOutput<Value>(result: CompilationResult, fileName: CompilationFileName): Value {
  const contents = result.files[fileName];
  if (contents === undefined) throw new Error(`Compilation did not emit ${fileName}.`);
  return JSON.parse(contents) as Value;
}

function jsonPathSegments(path: string): readonly (number | string)[] {
  if (!path.startsWith('$')) throw new Error(`Expected a rooted JSON path, received ${path}.`);
  const segments: Array<number | string> = [];
  let remaining = path.slice(1);
  while (remaining.length > 0) {
    const property = /^\.([A-Za-z_$][A-Za-z0-9_$]*)/u.exec(remaining);
    if (property?.[1] !== undefined) {
      segments.push(property[1]);
      remaining = remaining.slice(property[0].length);
      continue;
    }
    const index = /^\[(\d+)\]/u.exec(remaining);
    if (index?.[1] !== undefined) {
      segments.push(Number(index[1]));
      remaining = remaining.slice(index[0].length);
      continue;
    }
    const quoted = /^\[((?:"(?:[^"\\]|\\.)*"))\]/u.exec(remaining);
    if (quoted?.[1] !== undefined) {
      const key: unknown = JSON.parse(quoted[1]);
      if (typeof key !== 'string') throw new Error(`Expected a string key in ${path}.`);
      segments.push(key);
      remaining = remaining.slice(quoted[0].length);
      continue;
    }
    throw new Error(`Unsupported JSON path syntax in ${path} at ${remaining}.`);
  }
  return segments;
}

function pathExists(root: unknown, path: string): boolean {
  let value = root;
  for (const segment of jsonPathSegments(path)) {
    if (typeof segment === 'number') {
      if (!Array.isArray(value) || !Object.hasOwn(value, segment)) return false;
      value = value[segment];
      continue;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)
      || !Object.hasOwn(value, segment)) return false;
    value = Reflect.get(value, segment);
  }
  return true;
}

function expectDerivationPathsToResolve(result: CompilationResult): void {
  const index = parseOutput<ContractIndexView>(result, 'contract-index.json');
  const resolved = parseOutput<{
    readonly contract: {
      readonly provenance: { readonly authoring: { readonly semantic: unknown } };
    };
  }>(result, 'resolved-contract.json');
  const semantic = resolved.contract.provenance.authoring.semantic;
  for (const derivations of Object.values(index.derivationsByOutputId)) {
    for (const derivation of derivations) {
      expect(
        pathExists(result.resolvedContract, derivation.outputPath),
        `${derivation.outputId} has dangling technical path ${derivation.outputPath}`,
      ).toBe(true);
      for (const semanticPath of derivation.semanticPaths) {
        expect(
          pathExists(semantic, semanticPath),
          `${derivation.outputId} has dangling semantic path ${semanticPath}`,
        ).toBe(true);
      }
    }
  }
}

async function compileSuccessfully(contract: SceneDefinition): Promise<CompilationResult> {
  const result = await compileContract(contract);
  expect(result.ok, result.diagnostics.map(({ code, message }) => `${code}: ${message}`).join('\n')).toBe(true);
  expect(result.resolvedContract).toBeDefined();
  return result;
}

interface IdentitySceneOptions {
  readonly sceneName?: string;
  readonly subjectName?: string;
  readonly populationName?: string;
  readonly definitionKey?: string;
  readonly castKey?: string;
  readonly subjectIdentity?: string;
}

function identityScene(options: IdentitySceneOptions = {}): SceneDefinition {
  const subject = thing({
    name: options.subjectName ?? 'Subject',
    identity: [options.subjectIdentity ?? 'recognizable silhouette'],
  });
  const placed = population({
    name: options.populationName ?? 'Placed subject',
    of: subject,
    amount: between(1, 1),
  });
  return scene({
    key: 'identity-scene',
    name: options.sceneName ?? 'Identity scene',
    profiles: [voxelDiorama],
    experience: { fantasy: 'Meet the subject.' },
    definitions: { [options.definitionKey ?? 'subject']: subject },
    cast: { [options.castKey ?? 'placed']: placed },
  });
}

describe('lowered identity and dependency edges', () => {
  it('orders derived sets by stable UTF-16 code units instead of the host locale', async () => {
    const subject = thing({ name: 'Subject' });
    const upper = population({ name: 'Uppercase I', of: subject, amount: between(1, 1) });
    const lower = population({ name: 'Lowercase i', of: subject, amount: between(1, 1) });
    const contract = scene({
      key: 'locale-proof',
      name: 'Locale proof',
      profiles: [voxelDiorama],
      definitions: { subject },
      cast: { 'a-i': lower, 'a-I': upper },
    });

    const result = await compileSuccessfully(contract);
    const index = parseOutput<ContractIndexView>(result, 'contract-index.json');
    expect(index.childrenByParent['scene.locale-proof']).toEqual([
      'population.locale-proof.a-I',
      'population.locale-proof.a-i',
    ]);
  });

  it('keeps all scoped IDs stable when display names change', async () => {
    const first = await compileSuccessfully(identityScene());
    const renamed = await compileSuccessfully(identityScene({
      sceneName: 'Renamed display scene',
      subjectName: 'Renamed display subject',
      populationName: 'Renamed display population',
    }));
    const firstIndex = parseOutput<ContractIndexView>(first, 'contract-index.json');
    const renamedIndex = parseOutput<ContractIndexView>(renamed, 'contract-index.json');

    expect(Object.keys(renamedIndex.byId).sort()).toEqual(Object.keys(firstIndex.byId).sort());
    expect(renamed.resolvedContract?.contract.id).toBe(first.resolvedContract?.contract.id);
    expect(renamed.resolvedContract?.definitions.prototypes['prototype.identity-scene.subject']?.name)
      .toBe('Renamed display subject');
    expect(renamed.resolvedContract?.entities['population.identity-scene.placed']?.name)
      .toBe('Renamed display population');
  });

  it('makes definition and cast binding-key renames visible identity changes', async () => {
    const original = await compileSuccessfully(identityScene());
    const definitionRenamed = await compileSuccessfully(identityScene({
      definitionKey: 'renamedSubject',
    }));
    const castRenamed = await compileSuccessfully(identityScene({
      castKey: 'renamedPlaced',
    }));
    const originalIndex = parseOutput<ContractIndexView>(original, 'contract-index.json');
    const definitionIndex = parseOutput<ContractIndexView>(definitionRenamed, 'contract-index.json');
    const castIndex = parseOutput<ContractIndexView>(castRenamed, 'contract-index.json');

    expect(originalIndex.byId['prototype.identity-scene.subject']).toBeDefined();
    expect(definitionIndex.byId['prototype.identity-scene.subject']).toBeUndefined();
    expect(definitionIndex.byId['prototype.identity-scene.renamedSubject']).toBeDefined();
    expect(definitionIndex.dependenciesBySourceId['population.identity-scene.placed'])
      .toContainEqual(expect.objectContaining({
        kind: 'population-of',
        targetId: 'prototype.identity-scene.renamedSubject',
      }));

    expect(originalIndex.byId['population.identity-scene.placed']).toBeDefined();
    expect(castIndex.byId['population.identity-scene.placed']).toBeUndefined();
    expect(castIndex.byId['population.identity-scene.renamedPlaced']).toBeDefined();
    expect(castIndex.byId['prototype.identity-scene.subject']).toBeDefined();
  });

  it('scopes generated review IDs by the full owner identity', async () => {
    const subject = thing({ name: 'Subject', rules: { must: ['read as a subject'] } });
    const placed = population({
      name: 'Placed subject',
      of: subject,
      amount: between(1, 1),
      rules: { must: ['remain placed'] },
    });
    const contract = scene({
      key: 'review-identity',
      name: 'Review identity',
      definitions: { scene: subject },
      cast: { scene: placed },
      rules: { must: ['read as one scene'] },
    });

    const result = await compileSuccessfully(contract);
    const reviews = result.resolvedContract?.validation.humanReview;
    if (!Array.isArray(reviews)) throw new Error('Expected generated human-review records.');
    const reviewIds = reviews.map((review) => {
      if (typeof review !== 'object' || review === null || Array.isArray(review)) {
        throw new Error('Expected each human-review record to be an object.');
      }
      return String(review.id);
    });
    expect(new Set(reviewIds).size).toBe(reviewIds.length);
    expect(reviewIds).toEqual(expect.arrayContaining([
      'review.rule.scene.review-identity.required.1',
      'review.rule.prototype.review-identity.scene.required.1',
      'review.rule.population.review-identity.scene.required.1',
    ]));
  });

  it('retains two named-part edges to one exact reused definition identity', async () => {
    const crown = thing({ name: 'Reusable crown' });
    const groveTree = thing({ name: 'Grove tree', parts: { crown } });
    const landmarkTree = thing({ name: 'Landmark tree', parts: { crown } });
    const grove = population({
      name: 'Grove trees',
      of: groveTree,
      amount: between(2, 3),
    });
    const landmark = population({
      name: 'Landmark tree',
      of: landmarkTree,
      amount: between(1, 1),
    });
    const contract = scene({
      key: 'reused-parts',
      name: 'Reused parts',
      profiles: [voxelDiorama],
      definitions: { crown, groveTree, landmarkTree },
      cast: { grove, landmark },
    });

    const result = await compileSuccessfully(contract);
    const index = parseOutput<ContractIndexView>(result, 'contract-index.json');
    const crownId = 'prototype.reused-parts.crown';
    expect(index.dependenciesBySourceId['prototype.reused-parts.groveTree'])
      .toContainEqual(expect.objectContaining({
        kind: 'part',
        role: 'crown',
        targetId: crownId,
      }));
    expect(index.dependenciesBySourceId['prototype.reused-parts.landmarkTree'])
      .toContainEqual(expect.objectContaining({
        kind: 'part',
        role: 'crown',
        targetId: crownId,
      }));

    const incomingPartEdges = (index.dependentsByTargetId[crownId] ?? [])
      .filter(({ kind }) => kind === 'part');
    expect(incomingPartEdges.map(({ sourceId }) => sourceId).sort()).toEqual([
      'prototype.reused-parts.groveTree',
      'prototype.reused-parts.landmarkTree',
    ]);
    expect(Object.keys(result.resolvedContract?.definitions.prototypes ?? {})
      .filter((id) => id === crownId)).toHaveLength(1);
  });
});

describe('lowered hashes and derivation evidence', () => {
  it('keeps every default-profile derivation path attached to present semantic data', async () => {
    const subject = thing({ name: 'Subject', avoid: ['generic silhouette'] });
    const area = region({ name: 'Area' });
    const group = population({
      name: 'Group',
      of: subject,
      amount: between(1, 2),
      variation: { vary: ['lean'], avoid: ['uniform lean'] },
    });
    const result = await compileSuccessfully(scene({
      key: 'minimal-provenance',
      name: 'Minimal provenance',
      definitions: { subject },
      cast: { area, group },
    }));

    expectDerivationPathsToResolve(result);
  });

  it('changes semantic, resolved, output, and affected-record hashes when preserved author prose changes', async () => {
    const first = await compileSuccessfully(identityScene({
      subjectIdentity: 'one readable branch fork',
    }));
    const edited = await compileSuccessfully(identityScene({
      subjectIdentity: 'two readable branch forks',
    }));
    const firstIndex = parseOutput<ContractIndexView>(first, 'contract-index.json');
    const editedIndex = parseOutput<ContractIndexView>(edited, 'contract-index.json');
    const firstManifest = parseOutput<BuildManifestView>(first, 'build-manifest.json');
    const editedManifest = parseOutput<BuildManifestView>(edited, 'build-manifest.json');
    const prototypeId = 'prototype.identity-scene.subject';
    const populationId = 'population.identity-scene.placed';

    expect(edited.resolvedContract?.definitions.prototypes[prototypeId]?.components['description.intent'])
      .toEqual(expect.objectContaining({ visualRead: ['two readable branch forks'] }));
    expect(editedIndex.hashById[prototypeId]).not.toBe(firstIndex.hashById[prototypeId]);
    expect(editedIndex.hashById[populationId]).toBe(firstIndex.hashById[populationId]);
    expect(editedManifest.inputs.semanticSha256).not.toBe(firstManifest.inputs.semanticSha256);
    expect(editedManifest.resolvedContractSha256).not.toBe(firstManifest.resolvedContractSha256);
    expect(editedManifest.outputHashes['resolved-contract.json'])
      .not.toBe(firstManifest.outputHashes['resolved-contract.json']);
    expect(editedManifest.outputHashes['contract-index.json'])
      .not.toBe(firstManifest.outputHashes['contract-index.json']);
  });

  it('gives every lowered component, entity, relationship, and system derivation evidence', async () => {
    const crown = thing({
      name: 'Rounded crown',
      identity: ['irregular gaps'],
    });
    const tree = thing({
      name: 'Composite tree',
      parts: { crown },
      visual: { language: 'layered winter silhouette', avoid: ['uniform crown'] },
    });
    const clearing = region({
      name: 'Clearing',
      purpose: ['movement and negative space'],
    });
    const trees = population({
      name: 'Framing trees',
      of: tree,
      amount: between(3, 5),
      placement: { around: clearing, pattern: 'loose clusters' },
      role: ['frame the clearing'],
      variation: { vary: ['lean'], avoid: ['uniform lean'] },
    });
    const contract = scene({
      key: 'derivation-evidence',
      name: 'Derivation evidence',
      profiles: [voxelDiorama],
      experience: { fantasy: 'Enter a readable clearing.' },
      visual: { language: 'dense voxel diorama', avoid: ['uniform silhouettes'] },
      definitions: { crown, tree },
      cast: { clearing, trees },
      composition: [frames(trees, clearing)],
      acceptance: { review: ['Does the clearing read immediately?'] },
    });

    const result = await compileSuccessfully(contract);
    const resolved = result.resolvedContract;
    if (resolved === undefined) throw new Error('Successful compilation omitted resolvedContract.');
    const index = parseOutput<ContractIndexView>(result, 'contract-index.json');
    expectDerivationPathsToResolve(result);

    const expectEvidence = (outputId: string, description: string): void => {
      const evidence = index.derivationsByOutputId[outputId];
      expect(evidence, `missing derivation for ${description} (${outputId})`).toBeDefined();
      expect(evidence?.length, `empty derivation for ${description} (${outputId})`).toBeGreaterThan(0);
      for (const derivation of evidence ?? []) {
        expect(derivation.outputId).toBe(outputId);
        expect(derivation.outputPath.length).toBeGreaterThan(0);
        expect(derivation.semanticPaths.length).toBeGreaterThan(0);
        expect(derivation.semanticPaths.every((path) => path.startsWith('$'))).toBe(true);
        expect(derivation.lowerer.id.length).toBeGreaterThan(0);
        expect(derivation.lowerer.version).toMatch(/^\d+\.\d+\.\d+$/u);
        expect(derivation.profile).toEqual({ id: 'voxel-diorama', version: '0.1.0' });
        expect(derivation.overridePath).toBeUndefined();
      }
    };

    const rootId = 'scene.derivation-evidence';
    for (const [outputId, description] of [
      [resolved.contract.id, 'contract envelope'],
      [`${rootId}#semantic-projection`, 'normalized semantic source'],
      ['policy.catalog-import', 'catalog import'],
      ['policy.coordinate-system', 'coordinate policy'],
      ['policy.determinism', 'determinism policy'],
      ['profile.voxel-diorama', 'expanded profile definition'],
      ['suite.schema', 'schema validation suite'],
      ['suite.semantic', 'semantic validation suite'],
      ['policy.validation-promotion', 'validation promotion policy'],
      ['policy.outputs', 'output policy'],
      ['review.semantic.1', 'human-review question'],
    ] as const) {
      expectEvidence(outputId, description);
    }
    for (const id of Object.keys(resolved.entities)) {
      expectEvidence(`${id}#ownership`, `ownership record for ${id}`);
    }
    expect(index.derivationsByOutputId[`${rootId}#style.forbiddenForms`]).toContainEqual(
      expect.objectContaining({ semanticPaths: ['$.visual.avoid'] }),
    );
    expect(index.derivationsByOutputId['prototype.derivation-evidence.tree#style.forbiddenForms'])
      .toContainEqual(expect.objectContaining({
        semanticPaths: ['$.definitions.tree.visual.avoid'],
      }));
    expect(index.derivationsByOutputId['population.derivation-evidence.trees#style.forbiddenForms'])
      .toContainEqual(expect.objectContaining({
        semanticPaths: ['$.cast.trees.variation.avoid'],
      }));

    for (const [id, prototype] of Object.entries(resolved.definitions.prototypes)) {
      expectEvidence(id, 'prototype');
      for (const type of Object.keys(prototype.components)) {
        expectEvidence(`${id}#${type}`, `prototype component ${type}`);
      }
    }
    for (const [id, entity] of Object.entries(resolved.entities)) {
      expectEvidence(id, `${entity.kind} entity`);
      for (const type of Object.keys(entity.components)) {
        expectEvidence(`${id}#${type}`, `entity component ${type}`);
      }
    }
    for (const [relationshipIndex, relationship] of resolved.relationships.entries()) {
      expectEvidence(relationship.id, `relationship ${relationship.type}`);
      expect(index.derivationsByOutputId[relationship.id]).toContainEqual(expect.objectContaining({
        outputPath: `$.relationships[${relationshipIndex}]`,
      }));
    }
    for (const system of resolved.systems) {
      expectEvidence(system.id, `system ${system.phase}`);
    }
  });
});
