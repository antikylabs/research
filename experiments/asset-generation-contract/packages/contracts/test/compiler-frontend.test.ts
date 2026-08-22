import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  between,
  frames,
  population,
  referenceImage,
  region,
  scene,
  thing,
  voxelDiorama,
  type SceneDefinition,
  type ThingDefinition,
} from '../src/dsl/index.js';
import type { ProjectProfile } from '../src/dsl/types.js';
import { collectSemanticGraph } from '../src/compiler/collect.js';
import {
  createDiagnostic,
  diagnosticCodes,
  hasBlockingDiagnostics,
  sortDiagnostics,
} from '../src/compiler/diagnostics.js';
import { expandProfiles } from '../src/compiler/profiles.js';
import { guardDeclarationSerializable } from '../src/compiler/serialization.js';
import { loadContractEntry } from '../src/compiler/load.js';

function diagnosticCodesOf(sceneValue: SceneDefinition): readonly string[] {
  return collectSemanticGraph(sceneValue).diagnostics.map(({ code }) => code);
}

function forgeScene(value: object): SceneDefinition {
  // Safety: these runtime tests intentionally bypass the author-facing static contract.
  return value as SceneDefinition;
}

function forgeProjectProfile(value: object): ProjectProfile {
  // Safety: these runtime tests intentionally bypass the installed-profile capability type.
  return value as ProjectProfile;
}

describe('stable compiler-front-end diagnostics', () => {
  it('sorts diagnostics and related evidence without changing the caller input', () => {
    const input = [
      createDiagnostic({ code: 'Z_LAST', severity: 'warning', message: 'last', semanticPath: '$.z' }),
      createDiagnostic({
        code: 'B_SECOND',
        severity: 'error',
        message: 'second',
        semanticPath: '$.b',
        related: [{ semanticPath: '$.z' }, { semanticPath: '$.a' }],
      }),
      createDiagnostic({ code: 'A_FIRST', severity: 'error', message: 'first', semanticPath: '$.a' }),
    ];

    const sorted = sortDiagnostics(input);
    expect(sorted.map(({ code }) => code)).toEqual(['A_FIRST', 'B_SECOND', 'Z_LAST']);
    expect(sorted[1]?.related?.map(({ semanticPath }) => semanticPath)).toEqual(['$.a', '$.z']);
    expect(input.map(({ code }) => code)).toEqual(['Z_LAST', 'B_SECOND', 'A_FIRST']);
    expect(hasBlockingDiagnostics(sorted)).toBe(true);
  });
});

describe('declaration serialization guard', () => {
  it('does not mistake typed direct-reference cycles for arbitrary object cycles', () => {
    const aRaw: { kind: 'thing'; name: string; parts?: Record<string, ThingDefinition> } = {
      kind: 'thing',
      name: 'A',
    };
    const bRaw: { kind: 'thing'; name: string; basedOn: ThingDefinition } = {
      kind: 'thing',
      name: 'B',
      basedOn: aRaw as ThingDefinition,
    };
    aRaw.parts = { b: bRaw as ThingDefinition };
    const clearing = region({ name: 'Clearing' });
    const placed = {
      kind: 'population',
      name: 'Placed A',
      of: aRaw,
      amount: between(1, 1),
    };
    const contract = forgeScene({
      kind: 'scene',
      key: 'typed-cycle',
      name: 'Typed cycle',
      definitions: { a: aRaw, b: bRaw },
      cast: { clearing, placed },
    });

    expect(guardDeclarationSerializable(contract)).toEqual({ diagnostics: [], valid: true });
    expect(diagnosticCodesOf(contract)).toContain(diagnosticCodes.definitionCycle);
  });

  it.each([
    ['function', () => undefined, diagnosticCodes.function],
    ['symbol', Symbol('value'), diagnosticCodes.symbol],
    ['bigint', 1n, diagnosticCodes.bigint],
    ['undefined', undefined, diagnosticCodes.undefined],
    ['NaN', Number.NaN, diagnosticCodes.nonFiniteNumber],
    ['infinity', Number.POSITIVE_INFINITY, diagnosticCodes.nonFiniteNumber],
    ['date', new Date(0), diagnosticCodes.unsupportedPrototype],
    ['map', new Map(), diagnosticCodes.unsupportedPrototype],
    ['class instance', new (class Unsupported {})(), diagnosticCodes.unsupportedPrototype],
  ])('rejects a non-normalizable %s with its semantic path', (_label, hostile, expectedCode) => {
    const contract = forgeScene({
      kind: 'scene',
      key: 'hostile-value',
      name: 'Hostile value',
      rules: { hostile },
    });
    const result = guardDeclarationSerializable(contract);
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: expectedCode, semanticPath: '$.rules.hostile' }),
    ]);
  });

  it('rejects accessors without invoking them, symbol keys, hidden fields, and arbitrary cycles', () => {
    let getterCalls = 0;
    const rules: Record<PropertyKey, unknown> = {};
    Object.defineProperty(rules, 'accessed', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'never';
      },
    });
    Object.defineProperty(rules, 'hidden', { enumerable: false, value: 'omitted' });
    rules[Symbol('symbol-key')] = 'unsupported';
    rules.self = rules;
    const contract = forgeScene({ kind: 'scene', key: 'hostile-shape', name: 'Hostile shape', rules });

    const result = guardDeclarationSerializable(contract);
    expect(getterCalls).toBe(0);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      diagnosticCodes.accessor,
      diagnosticCodes.nonEnumerable,
      diagnosticCodes.symbol,
      diagnosticCodes.cycle,
    ]));
    expect(result.diagnostics.find(({ code }) => code === diagnosticCodes.cycle)?.semanticPath).toBe('$.rules.self');
  });

  it('rejects sparse arrays and named array properties that JSON would silently change', () => {
    const hostile: unknown[] = [];
    hostile.length = 1;
    Object.assign(hostile, { named: 'omitted by JSON.stringify' });
    const contract = forgeScene({ kind: 'scene', key: 'hostile-array', name: 'Hostile array', hostile });

    expect(guardDeclarationSerializable(contract).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: diagnosticCodes.arrayHole, semanticPath: '$.hostile[0]' }),
      expect.objectContaining({ code: diagnosticCodes.arrayProperty, semanticPath: '$.hostile.named' }),
    ]));
  });
});

describe('semantic collection and exact reference resolution', () => {
  it('assigns exact scoped IDs and retains every dependency and image-use edge', () => {
    const image = referenceImage('./grove.png');
    const base = thing({ name: 'Base', references: [{ image, use: 'base shape' }] });
    const crown = thing({ name: 'Crown' });
    const tree = thing({ name: 'Tree', basedOn: base, parts: { crown } });
    const clearing = region({
      name: 'Clearing',
      features: { crown },
      references: [{ image, use: 'clearing composition' }],
    });
    const grove = population({
      name: 'Grove',
      of: tree,
      amount: between(3, 5),
      placement: { around: clearing },
    });
    const contract = scene({
      key: 'exact-keys',
      name: 'Display names are not IDs',
      definitions: { base, crown, tree },
      cast: { clearing, grove },
      gameplay: { playAs: grove, purpose: 'inspect' },
      composition: [frames(grove, clearing)],
      acceptance: {
        checks: [{ key: 'count', subject: grove, measure: 'population count', expected: between(3, 5) }],
      },
      references: [{ image, use: 'scene evidence' }],
    });

    const collected = collectSemanticGraph(contract);
    expect(collected.diagnostics).toEqual([]);
    expect(collected.bindings.map(({ id }) => id)).toEqual([
      'scene.exact-keys',
      'prototype.exact-keys.base',
      'prototype.exact-keys.crown',
      'prototype.exact-keys.tree',
      'region.exact-keys.clearing',
      'population.exact-keys.grove',
    ]);
    expect(new Set(collected.dependencyEdges.map(({ kind }) => kind))).toEqual(new Set([
      'based-on',
      'part',
      'feature',
      'population-of',
      'placement-around',
      'play-as',
      'acceptance-subject',
      'frames-source',
      'frames-target',
    ]));
    expect(collected.dependencyEdges.find(({ kind }) => kind === 'part')).toEqual(expect.objectContaining({
      sourceId: 'prototype.exact-keys.tree',
      targetId: 'prototype.exact-keys.crown',
      role: 'crown',
      semanticPath: '$.definitions.tree.parts.crown',
    }));
    expect(collected.relationships).toEqual([
      expect.objectContaining({
        id: 'rel.exact-keys.frames.grove.clearing',
        sourceId: 'population.exact-keys.grove',
        targetId: 'region.exact-keys.clearing',
      }),
    ]);
    expect(collected.referenceImages.map(({ semanticPath }) => semanticPath)).toEqual([
      '$.cast.clearing.references[0]',
      '$.definitions.base.references[0]',
      '$.references[0]',
    ]);
    expect(collected.bindingFor(tree)?.id).toBe('prototype.exact-keys.tree');
    expect(collected.bindingFor({ kind: 'thing', name: 'Equal is not identical' })).toBeUndefined();
    expect(collected.idFor(null)).toBeUndefined();
  });

  it('reports multiply bound, invalid, unbound, outside-scene, and unreachable declarations', () => {
    const shared = thing({ name: 'Shared' });
    const orphan = thing({ name: 'Orphan' });
    const external = thing({ name: 'External' });
    const clearing = region({ name: 'Clearing' });
    const placed = population({ name: 'Placed', of: external, amount: between(1, 1) });
    const outsidePopulation = population({ name: 'Outside', of: shared, amount: between(1, 1) });
    const contract = scene({
      key: 'binding-errors',
      name: 'Binding errors',
      definitions: { first: shared, second: shared, orphan },
      cast: { clearing, placed },
      composition: [frames(outsidePopulation, clearing)],
    });

    const diagnostics = collectSemanticGraph(contract).diagnostics;
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: diagnosticCodes.duplicateBinding, semanticPath: '$.definitions.second' }),
      expect.objectContaining({ code: diagnosticCodes.referenceUnbound, semanticPath: '$.cast.placed.of' }),
      expect.objectContaining({ code: diagnosticCodes.referenceOutsideScene, semanticPath: '$.composition[0].source' }),
      expect.objectContaining({ code: diagnosticCodes.unreachable, semanticPath: '$.definitions.orphan' }),
    ]));
  });

  it('reports forged reference kinds and preserves the exact failing path', () => {
    const clearing = region({ name: 'Clearing' });
    const forgedPopulation = {
      kind: 'population',
      name: 'Wrong prototype kind',
      of: clearing,
      amount: between(1, 1),
    };
    const contract = forgeScene({
      kind: 'scene',
      key: 'kind-error',
      name: 'Kind error',
      cast: { clearing, forgedPopulation },
    });

    expect(collectSemanticGraph(contract).diagnostics).toContainEqual(expect.objectContaining({
      code: diagnosticCodes.referenceKind,
      semanticPath: '$.cast.forgedPopulation.of',
    }));
  });

  it('keeps identity independent of display prose and changes it only with scoped keys', () => {
    const collectIds = (definitionKey: string, displayName: string): readonly string[] => {
      const prototype = thing({ name: displayName });
      const clearing = region({ name: `${displayName} clearing` });
      const placed = population({ name: `${displayName} cast`, of: prototype, amount: between(1, 1) });
      return collectSemanticGraph(scene({
        key: 'identity-proof',
        name: displayName,
        definitions: { [definitionKey]: prototype },
        cast: { clearing, placed },
      })).bindings.map(({ id }) => id);
    };

    const first = collectIds('prototypeKey', 'First labels');
    const renamedProse = collectIds('prototypeKey', 'Completely renamed labels');
    const renamedKey = collectIds('migratedKey', 'First labels');
    expect(renamedProse).toEqual(first);
    expect(renamedKey).not.toEqual(first);
    expect(renamedKey).toContain('prototype.identity-proof.migratedKey');
  });

  it('rejects scoped keys instead of sanitizing them into accidental identities', () => {
    const prototype = thing({ name: 'Prototype' });
    const placed = population({ name: 'Placed', of: prototype, amount: between(1, 1) });
    const contract = scene({
      key: 'Invalid_Root',
      name: 'Invalid keys',
      definitions: { Invalid_Definition: prototype },
      cast: { placed },
    });

    expect(collectSemanticGraph(contract).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: diagnosticCodes.invalidKey, semanticPath: '$.key' }),
      expect.objectContaining({
        code: diagnosticCodes.invalidKey,
        semanticPath: '$.definitions.Invalid_Definition',
      }),
    ]));
  });

  it('collects the complete active fixture without losing reused edges or image uses', async () => {
    const experimentRoot = fileURLToPath(new URL('../../../', import.meta.url));
    const entryPath = fileURLToPath(
      new URL('../../examples/src/blue-winter-grove/blue-winter-grove.contract.ts', import.meta.url),
    );
    const loaded = await loadContractEntry(entryPath, { projectRoot: experimentRoot });
    const collected = collectSemanticGraph(loaded.scene);

    expect(collected.diagnostics).toEqual([]);
    expect(collected.referenceImages).toHaveLength(38);
    expect(collected.dependencyEdges.filter(({ kind, targetId }) =>
      kind === 'part' && targetId === 'prototype.blue-winter-grove.roundedSnowCrown')).toEqual([
      expect.objectContaining({ sourceId: 'prototype.blue-winter-grove.frostBentLandmark', role: 'crown' }),
      expect.objectContaining({ sourceId: 'prototype.blue-winter-grove.roundedWinterTree', role: 'crown' }),
    ]);
  });
});

describe('deterministic profile expansion and conflict evidence', () => {
  it('selects the named profile by default for a minimal scene', () => {
    const contract = scene({ key: 'minimal-default', name: 'Minimal default' });
    const result = expandProfiles(contract);

    expect(result.diagnostics).toEqual([]);
    expect(result.profiles).toEqual([
      expect.objectContaining({
        id: 'voxel-diorama',
        version: '0.1.0',
        selection: 'default',
        semanticPath: '$.profiles',
      }),
    ]);
    expect(result.provenance[0]).toEqual(expect.objectContaining({ selection: 'default' }));
  });

  it('expands the inspectable profile with stable provenance', () => {
    const contract = scene({ key: 'profile', name: 'Profile', profiles: [voxelDiorama] });
    const result = expandProfiles(contract);

    expect(result.diagnostics).toEqual([]);
    expect(result.profiles.map(({ id, version }) => `${id}@${version}`)).toEqual(['voxel-diorama@0.1.0']);
    expect(result.profiles[0]?.selection).toBe('explicit');
    expect(result.policy?.schema.contract.version).toBe('0.2.0');
    expect(result.provenance[0]).toEqual(expect.objectContaining({
      profile: { id: 'voxel-diorama', version: '0.1.0' },
      semanticPath: '$.profiles[0]',
    }));
    expect(result.provenance[0]?.policyPaths).toContain('$.coordinatePolicy.voxelSizeMeters');
  });

  it('reports deterministic duplicate, policy, and explicit-direction conflicts with evidence', () => {
    const incompatible = forgeProjectProfile({
      ...voxelDiorama,
      id: 'other-profile',
      coordinatePolicy: { ...voxelDiorama.coordinatePolicy, voxelSizeMeters: 0.2 },
    });
    const contract = scene({
      key: 'profile-conflicts',
      name: 'Profile conflicts',
      profiles: [voxelDiorama, incompatible, voxelDiorama],
      visual: { language: 'deliberately contradictory', avoid: ['voxel art'] },
    });

    const first = expandProfiles(contract);
    const second = expandProfiles(contract);
    expect(second).toEqual(first);
    expect(first.conflicts).toContainEqual(expect.objectContaining({
      policyPath: '$.coordinatePolicy.voxelSizeMeters',
      existingValue: 0.2,
      incomingValue: 0.1,
    }));
    expect(first.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: diagnosticCodes.profileDuplicate }),
      expect.objectContaining({ code: diagnosticCodes.profileUnsupported }),
      expect.objectContaining({ code: diagnosticCodes.profileConflict }),
      expect.objectContaining({
        code: diagnosticCodes.profileDirectionConflict,
        semanticPath: '$.visual.avoid[0]',
      }),
    ]));
  });

  it('rejects a recreated profile that counterfeits an installed identity', () => {
    const counterfeit = forgeProjectProfile({
      ...voxelDiorama,
      coordinatePolicy: { ...voxelDiorama.coordinatePolicy, voxelSizeMeters: 0.2 },
    });
    const contract = scene({
      key: 'counterfeit-profile',
      name: 'Counterfeit profile',
      profiles: [counterfeit],
    });

    const result = expandProfiles(contract);
    expect(result.profiles).toEqual([]);
    expect(result.policy).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: diagnosticCodes.profileContentMismatch,
        semanticPath: '$.profiles[0]',
      }),
    ]);
  });

  it('diagnoses malformed profile records instead of throwing during deterministic ordering', () => {
    const malformed = { kind: 'project-profile', id: 7 };
    const contract = forgeScene({
      kind: 'scene',
      key: 'malformed-profile',
      name: 'Malformed profile',
      profiles: [null, malformed],
    });

    expect(() => expandProfiles(contract)).not.toThrow();
    expect(expandProfiles(contract).diagnostics).toEqual([
      expect.objectContaining({ code: diagnosticCodes.profileInvalid, semanticPath: '$.profiles[0]' }),
      expect.objectContaining({ code: diagnosticCodes.profileInvalid, semanticPath: '$.profiles[1]' }),
    ]);
  });
});
