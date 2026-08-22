import { describe, expect, it } from 'vitest';

import {
  compileContract,
  type CompilationResult,
} from '../src/compiler/index.js';
import {
  between,
  population,
  region,
  scene,
  thing,
  voxelDiorama,
  type JsonObject,
  type NumericRange,
  type PopulationDefinition,
  type PopulationInput,
  type SceneDefinition,
  type ThingDefinition,
  type ThingInput,
} from '../src/dsl/index.js';

function forgeRange(min: number, max: number): NumericRange {
  // Safety: runtime validation must still reject malformed data after static types are bypassed.
  return { kind: 'range', min, max } as NumericRange;
}

function forgeRangeRecord(value: object): NumericRange {
  // Safety: runtime validation must still reject malformed data after static types are bypassed.
  return value as NumericRange;
}

function forgePopulationInput(value: object): PopulationInput {
  // Safety: runtime validation must reject malformed data after static types are bypassed.
  return value as PopulationInput;
}

function forgeThingInput(value: object): ThingInput {
  // Safety: runtime validation must reject malformed data after static types are bypassed.
  return value as ThingInput;
}

function forgeSceneDefinition(value: object): SceneDefinition {
  // Safety: runtime validation must reject malformed data after static types are bypassed.
  return value as SceneDefinition;
}

function compileForgedRoot(value: unknown): Promise<CompilationResult> {
  // Safety: this runtime test intentionally bypasses the programmatic compiler input type.
  return compileContract(value as SceneDefinition);
}

function validScene(
  subject: ThingDefinition = thing({ name: 'Subject' }),
): SceneDefinition {
  const placed = population({
    name: 'Placed subject',
    of: subject,
    amount: between(1, 1),
  });
  return scene({
    key: 'runtime-invalid',
    name: 'Runtime invalid fixture',
    profiles: [voxelDiorama],
    definitions: { subject },
    cast: { placed },
  });
}

function expectBlockingDiagnostic(
  result: CompilationResult,
  code: string,
  semanticPath: string,
): NonNullable<CompilationResult['diagnostics'][number]> {
  expect(result.ok).toBe(false);
  expect(result.resolvedContract).toBeUndefined();
  expect(Object.keys(result.files)).toEqual(['diagnostics.json']);
  const diagnostic = result.diagnostics.find((candidate) => candidate.code === code);
  expect(diagnostic).toEqual(expect.objectContaining({
    code,
    severity: 'error',
    semanticPath,
  }));
  if (diagnostic === undefined) throw new Error(`Missing ${code} at ${semanticPath}.`);
  return diagnostic;
}

const technicalOverrideCases: readonly {
  readonly label: string;
  readonly type: string;
  readonly payload: JsonObject;
  readonly code: string;
}[] = [
  {
    label: 'unknown component type',
    type: 'antikylabs.unknown.unregistered',
    payload: { intensity: 1 },
    code: 'CONTRACT_COMPONENT_UNKNOWN',
  },
  {
    label: 'schema-invalid payload',
    type: 'style.detailProfile',
    payload: { macro: [], meso: [] },
    code: 'CONTRACT_COMPONENT_SCHEMA',
  },
  {
    label: 'component on an invalid entity kind',
    type: 'layout.regionMask',
    payload: { shape: 'irregular-ellipse' },
    code: 'CONTRACT_COMPONENT_KIND',
  },
];

describe('compileContract runtime-invalid semantic input', () => {
  it.each([
    ['null', null],
    ['a number', 0],
    ['a boolean', true],
    ['an array', []],
  ])('returns a rooted shape diagnostic for %s compiler input', async (_label, input) => {
    expectBlockingDiagnostic(
      await compileForgedRoot(input),
      'DSL_INVALID_SEMANTIC_SHAPE',
      '$',
    );
  });

  it.each([
    ['a missing root kind', { key: 'forged-root', name: 'Forged root' }],
    ['the wrong root kind', { kind: 'thing', key: 'forged-root', name: 'Forged root' }],
  ])('rejects %s at the programmatic compiler boundary', async (_label, input) => {
    expectBlockingDiagnostic(
      await compileContract(forgeSceneDefinition(input)),
      'DSL_INVALID_SEMANTIC_SHAPE',
      '$.kind',
    );
  });

  it('rejects one declaration object bound to two scoped identities', async () => {
    const subject = thing({ name: 'Shared subject' });
    const placed = population({
      name: 'Placed subject',
      of: subject,
      amount: between(1, 1),
    });
    const contract = scene({
      key: 'duplicate-binding',
      name: 'Duplicate binding',
      profiles: [voxelDiorama],
      definitions: { first: subject, second: subject },
      cast: { placed },
    });

    const result = await compileContract(contract);
    const diagnostic = expectBlockingDiagnostic(
      result,
      'DSL_DUPLICATE_BINDING',
      '$.definitions.second',
    );
    expect(diagnostic.related).toContainEqual(expect.objectContaining({
      semanticPath: '$.definitions.first',
      contractId: 'prototype.duplicate-binding.first',
    }));
  });

  it('distinguishes an unbound definition reference from a scene-external reference', async () => {
    const bound = thing({ name: 'Bound subject' });
    const unbound = thing({ name: 'Unbound subject' });
    const placed = population({
      name: 'Placed unbound subject',
      of: unbound,
      amount: between(1, 1),
    });
    const externalPopulation = population({
      name: 'Outside population',
      of: bound,
      amount: between(1, 1),
    });
    const contract = scene({
      key: 'outside-reference',
      name: 'Outside reference',
      profiles: [voxelDiorama],
      gameplay: { purpose: 'Prove scene-scoped references', playAs: externalPopulation },
      definitions: { bound },
      cast: { placed },
    });

    const result = await compileContract(contract);
    expectBlockingDiagnostic(result, 'DSL_REFERENCE_UNBOUND', '$.cast.placed.of');
    expectBlockingDiagnostic(result, 'DSL_REFERENCE_OUTSIDE_SCENE', '$.gameplay.playAs');
  });

  it('rejects a keyed definition disconnected from all placed cast declarations', async () => {
    const subject = thing({ name: 'Used subject' });
    const orphan = thing({ name: 'Disconnected subject' });
    const placed = population({
      name: 'Placed subject',
      of: subject,
      amount: between(1, 1),
    });
    const contract = scene({
      key: 'unreachable-definition',
      name: 'Unreachable definition',
      profiles: [voxelDiorama],
      definitions: { orphan, subject },
      cast: { placed },
    });

    const result = await compileContract(contract);
    const diagnostic = expectBlockingDiagnostic(
      result,
      'DSL_DECLARATION_UNREACHABLE',
      '$.definitions.orphan',
    );
    expect(diagnostic.contractId).toBe('prototype.unreachable-definition.orphan');
  });

  it('rejects a dependency cycle made from both basedOn and named-part edges', async () => {
    type MutableThing = {
      kind: 'thing';
      name: string;
      basedOn?: ThingDefinition;
      parts?: Record<string, ThingDefinition>;
    };
    const base: MutableThing = { kind: 'thing', name: 'Base' };
    const composite: MutableThing = { kind: 'thing', name: 'Composite' };
    base.basedOn = composite;
    composite.parts = { base };
    const placed: PopulationDefinition = {
      kind: 'population',
      name: 'Placed base',
      of: base,
      amount: forgeRange(1, 1),
    };
    const contract: SceneDefinition = {
      kind: 'scene',
      key: 'combined-cycle',
      name: 'Combined dependency cycle',
      profiles: [voxelDiorama],
      definitions: { base, composite },
      cast: { placed },
    };

    const result = await compileContract(contract);
    const diagnostic = expectBlockingDiagnostic(
      result,
      'DSL_DEFINITION_DEPENDENCY_CYCLE',
      '$.definitions.base.basedOn',
    );
    expect(diagnostic.message).toContain('Combined basedOn/part dependency cycle');
    expect(diagnostic.related).toEqual(expect.arrayContaining([
      expect.objectContaining({
        semanticPath: '$.definitions.base.basedOn',
        message: expect.stringContaining('based-on'),
      }),
      expect.objectContaining({
        semanticPath: '$.definitions.composite.parts.base',
        message: expect.stringContaining('part'),
      }),
    ]));
  });

  it('blocks explicit direction that conflicts with the selected profile', async () => {
    const subject = thing({ name: 'Subject' });
    const placed = population({
      name: 'Placed subject',
      of: subject,
      amount: between(1, 1),
    });
    const contract = scene({
      key: 'profile-conflict',
      name: 'Profile conflict',
      profiles: [voxelDiorama],
      visual: {
        language: 'hand-built miniatures',
        avoid: ['voxel art'],
      },
      definitions: { subject },
      cast: { placed },
    });

    const result = await compileContract(contract);
    const diagnostic = expectBlockingDiagnostic(
      result,
      'DSL_PROFILE_DIRECTION_CONFLICT',
      '$.visual.avoid[0]',
    );
    expect(diagnostic.related).toContainEqual(expect.objectContaining({
      semanticPath: '$.profiles[0]',
    }));
  });

  it('rejects a structurally forged descending range before lowering', async () => {
    const subject = thing({ name: 'Subject' });
    const placed = population({
      name: 'Placed subject',
      of: subject,
      amount: forgeRange(5, 1),
    });
    const contract = scene({
      key: 'descending-range',
      name: 'Descending range',
      profiles: [voxelDiorama],
      definitions: { subject },
      cast: { placed },
    });

    const result = await compileContract(contract);
    expectBlockingDiagnostic(result, 'DSL_RANGE_INVALID', '$.cast.placed.amount');
  });

  it('rejects extra range fields instead of dropping them during normalization', async () => {
    const subject = thing({ name: 'Subject' });
    const amount = forgeRangeRecord({
      kind: 'range',
      min: 1,
      max: 2,
      future: { distribution: 'weighted' },
    });
    const placed = population({ name: 'Placed subject', of: subject, amount });
    const contract = scene({
      key: 'range-extra-field',
      name: 'Range extra field',
      definitions: { subject },
      cast: { placed },
    });

    expectBlockingDiagnostic(
      await compileContract(contract),
      'DSL_UNSUPPORTED_SEMANTIC_FIELD',
      '$.cast.placed.amount.future',
    );
  });

  it('rejects duplicate acceptance keys before one metric target can overwrite another', async () => {
    const subject = thing({ name: 'Subject' });
    const placed = population({ name: 'Placed subject', of: subject, amount: between(1, 2) });
    const contract = scene({
      key: 'duplicate-acceptance-key',
      name: 'Duplicate acceptance key',
      definitions: { subject },
      cast: { placed },
      acceptance: {
        checks: [
          { key: 'count', subject: placed, measure: 'population count', expected: between(1, 2) },
          { key: 'count', subject: placed, measure: 'population count', expected: between(3, 4) },
        ],
      },
    });

    const diagnostic = expectBlockingDiagnostic(
      await compileContract(contract),
      'DSL_ID_COLLISION',
      '$.acceptance.checks[1].key',
    );
    expect(diagnostic.contractId).toBe('semantic.count');
    expect(diagnostic.related).toContainEqual(expect.objectContaining({
      semanticPath: '$.acceptance.checks[0].key',
    }));
  });

  it('rejects structured semantic data that the Goal 1 lowerer does not support', async () => {
    // Safety: the runtime compiler must diagnose future fields after static input checks are bypassed.
    const subject = thing({
      name: 'Subject',
      futureMeaning: { pressureCurve: ['quiet', 'urgent'] },
    } as Parameters<typeof thing>[0]);
    const result = await compileContract(validScene(subject));

    const diagnostic = expectBlockingDiagnostic(
      result,
      'DSL_UNSUPPORTED_SEMANTIC_FIELD',
      '$.definitions.subject.futureMeaning',
    );
    expect(diagnostic.contractId).toBe('prototype.runtime-invalid.subject');
  });

  it('rejects scene-only gameplay fields forged onto a thing', async () => {
    // Safety: JavaScript and asserted input must receive the same archetype-scope diagnostics.
    const subject = thing({
      name: 'Subject',
      gameplay: { role: 'invalid mixed gameplay', loop: ['move'], pace: 'fast' },
    } as ThingInput);
    const result = await compileContract(validScene(subject));

    expectBlockingDiagnostic(
      result,
      'DSL_UNSUPPORTED_SEMANTIC_FIELD',
      '$.definitions.subject.gameplay.loop',
    );
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'DSL_UNSUPPORTED_SEMANTIC_FIELD',
      semanticPath: '$.definitions.subject.gameplay.pace',
    }));
  });

  it.each([
    ['reference uses', { name: 'Subject', references: {} }, '$.definitions.subject.references'],
    ['identity terms', { name: 'Subject', identity: 'not-an-array' }, '$.definitions.subject.identity'],
  ])('returns a shape diagnostic for malformed %s instead of throwing', async (_label, input, path) => {
    const subject = thing(forgeThingInput(input));
    const result = await compileContract(validScene(subject));

    expectBlockingDiagnostic(result, 'DSL_INVALID_SEMANTIC_SHAPE', path);
  });

  it('rejects an unsupported placement enum instead of inferring another algorithm', async () => {
    const subject = thing({ name: 'Subject' });
    const clearing = region({ name: 'Clearing' });
    // Safety: runtime validation must reject enum values after static checks are bypassed.
    const placed = population(forgePopulationInput({
      name: 'Placed subject',
      of: subject,
      amount: between(1, 1),
      placement: { around: clearing, pattern: 'grid' },
    }));
    const contract = scene({
      key: 'invalid-placement-pattern',
      name: 'Invalid placement pattern',
      definitions: { subject },
      cast: { clearing, placed },
    });

    const result = await compileContract(contract);
    expectBlockingDiagnostic(
      result,
      'DSL_UNSUPPORTED_SEMANTIC_VALUE',
      '$.cast.placed.placement.pattern',
    );
  });

  it.each(technicalOverrideCases)('rejects a technical override with an $label', async ({ type, payload, code }) => {
    const subject = thing({
      name: 'Overridden subject',
      technical: {
        components: { [type]: payload },
      },
    });
    const result = await compileContract(validScene(subject));

    expectBlockingDiagnostic(
      result,
      code,
      `$.definitions.subject.technical.components[${JSON.stringify(type)}]`,
    );
  });

  it.each([
    ['function', () => undefined, 'DSL_SERIALIZATION_FUNCTION'],
    ['non-finite number', Number.POSITIVE_INFINITY, 'DSL_SERIALIZATION_NON_FINITE_NUMBER'],
  ])('returns a blocking diagnostic for a %s instead of throwing', async (_label, hostile, code) => {
    const rules = { must: [] as readonly string[], hostile };
    const contract: SceneDefinition = {
      ...validScene(),
      rules,
    };

    const result = await compileContract(contract);
    expectBlockingDiagnostic(result, code, '$.rules.hostile');
  });

  it('returns a blocking diagnostic for an arbitrary object cycle', async () => {
    const rules: { must: readonly string[]; self?: unknown } = { must: [] };
    rules.self = rules;
    const contract: SceneDefinition = {
      ...validScene(),
      rules,
    };

    const result = await compileContract(contract);
    const diagnostic = expectBlockingDiagnostic(
      result,
      'DSL_SERIALIZATION_CYCLE',
      '$.rules.self',
    );
    expect(diagnostic.related).toContainEqual(expect.objectContaining({
      semanticPath: '$.rules',
    }));
  });
});
