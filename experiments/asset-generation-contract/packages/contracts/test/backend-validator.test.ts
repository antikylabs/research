import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  componentCatalogUrl,
  contractSchemaUrl,
  getComponentMergePolicy,
  loadComponentCatalog,
  loadContractSchema,
  mergeComponentPayload,
  validateResolvedContract,
  type ComponentCatalog,
} from '../src/catalog/index.js';
import { contractRef, type ResolvedContract } from '../src/ir/index.js';

type DeepMutable<Value> = Value extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : Value extends object
    ? { -readonly [Key in keyof Value]: DeepMutable<Value[Key]> }
    : Value;

type MutableContract = DeepMutable<ResolvedContract>;

const fixtureUrl = new URL(
  '../../../docs/asset-contract/blue_winter_grove.scene.json',
  import.meta.url,
);
const fixtureText = readFileSync(fixtureUrl, 'utf8');
const fullFixture = JSON.parse(fixtureText) as ResolvedContract;

function fixture(): MutableContract {
  return JSON.parse(fixtureText) as MutableContract;
}

function errorCodes(value: unknown): readonly string[] {
  return validateResolvedContract(value).errors.map(({ code }) => code);
}

describe('backend source loading and portable refs', () => {
  it('loads the sibling schema and catalog from module-relative source locations', () => {
    expect(loadContractSchema().$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(loadComponentCatalog().catalogVersion).toBe('0.1.0');
    expect(Object.keys(loadComponentCatalog().componentTypes)).toHaveLength(43);
    expect(Object.keys(loadComponentCatalog().relationshipTypes)).toHaveLength(14);
    expect(Object.isFrozen(loadComponentCatalog().componentTypes)).toBe(true);
    expect(contractSchemaUrl().href).toContain('/docs/asset-contract/schemas/');
    expect(componentCatalogUrl().href).toContain('/docs/asset-contract/schemas/');
    expect(contractSchemaUrl().href).not.toContain('/packages/contracts/docs/');
  });

  it('brands schema-valid identifiers and rejects invalid generated refs', () => {
    expect(contractRef<'prototype'>('prototype.scene.tree')).toBe('prototype.scene.tree');
    expect(() => contractRef('bad ref')).toThrow(TypeError);
  });

  it('derives component inheritance behavior from the catalog', () => {
    expect(getComponentMergePolicy('core.bounds')).toBe('deep-merge');
    expect(getComponentMergePolicy('missing.component')).toBeUndefined();
    expect(
      mergeComponentPayload(
        'core.bounds',
        { sizeM: { x: 1, y: 2, z: 3 }, heightM: [1, 2] },
        { sizeM: { y: 4 }, heightM: [3, 4] },
      ),
    ).toEqual({ sizeM: { x: 1, y: 4, z: 3 }, heightM: [3, 4] });
  });
});

describe('full backend compatibility fixture', () => {
  it('validates the complete fixture and every catalog component payload', () => {
    const result = validateResolvedContract(fullFixture);
    expect(result.ok, JSON.stringify(result.errors, null, 2)).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.systemOrder).toHaveLength(18);

    const exercised = new Set([
      ...Object.values(fullFixture.definitions.prototypes).flatMap((prototype) =>
        Object.keys(prototype.components),
      ),
      ...Object.values(fullFixture.entities).flatMap((entity) => Object.keys(entity.components)),
    ]);
    expect([...exercised].sort()).toEqual(Object.keys(loadComponentCatalog().componentTypes).sort());
  });

  it('returns the same dependency-first order after declaration order changes', () => {
    const original = validateResolvedContract(fullFixture);
    const reordered = fixture();
    reordered.systems.reverse();
    const second = validateResolvedContract(reordered);

    expect(second.ok, JSON.stringify(second.errors, null, 2)).toBe(true);
    expect(second.systemOrder).toEqual(original.systemOrder);
    for (const system of fullFixture.systems) {
      for (const dependency of system.dependsOn) {
        expect(second.systemOrder.indexOf(dependency)).toBeLessThan(
          second.systemOrder.indexOf(system.id),
        );
      }
    }
  });

  it('allows a layout-phase system to depend on a terrain-phase system', () => {
    const result = validateResolvedContract(fullFixture);
    expect(result.ok).toBe(true);
    expect(result.systemOrder.indexOf('system.terrain.base-form')).toBeLessThan(
      result.systemOrder.indexOf('system.composition.reserve-anchors'),
    );
  });
});

describe('schema and catalog validation', () => {
  it('runs the supplied Draft 2020-12 top-level schema first', () => {
    const invalid = fixture();
    invalid.schemaVersion = 'not-semver';
    const result = validateResolvedContract(invalid);
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'CONTRACT_SCHEMA_INVALID',
        technicalPath: '$.schemaVersion',
      }),
    );
  });

  it('binds validation to the loaded schema and required catalog identities', () => {
    const wrongSchemaId = fixture();
    wrongSchemaId.$schema = 'https://example.invalid/different.schema.json';
    expect(errorCodes(wrongSchemaId)).toContain('CONTRACT_SCHEMA_ID');

    const driftingSchemaPath = fixture();
    driftingSchemaPath.$schema = '../../unrelated/generative-scene-contract.schema.json';
    expect(errorCodes(driftingSchemaPath)).toContain('CONTRACT_SCHEMA_ID');

    const wrongSchemaVersion = fixture();
    wrongSchemaVersion.schemaVersion = '9.9.9';
    expect(validateResolvedContract(wrongSchemaVersion, { expectedSchemaVersion: '0.2.0' }).errors)
      .toContainEqual(expect.objectContaining({ code: 'CONTRACT_SCHEMA_VERSION' }));

    const missingCatalog = fixture();
    missingCatalog.imports = [];
    expect(errorCodes(missingCatalog)).toContain('CONTRACT_CATALOG_IMPORT_MISSING');

    const wrongCatalog = fixture();
    wrongCatalog.imports![0]!.id = 'other.required-catalog';
    expect(errorCodes(wrongCatalog)).toEqual(expect.arrayContaining([
      'CONTRACT_CATALOG_IMPORT_MISSING',
      'CONTRACT_CATALOG_IMPORT_UNRESOLVED',
    ]));

    const wrongCatalogVersion = fixture();
    wrongCatalogVersion.imports![0]!.version = '9.9.9';
    expect(errorCodes(wrongCatalogVersion)).toContain('CONTRACT_CATALOG_IMPORT_VERSION');

    const expectedCatalogUri = 'https://antikylabs.dev/schemas/component-catalog.json';
    expect(validateResolvedContract(fullFixture, { expectedCatalogUri }).ok).toBe(true);
    const wrongCatalogUri = fixture();
    wrongCatalogUri.imports![0]!.uri = './schemas/definitely-missing-catalog.json';
    expect(validateResolvedContract(wrongCatalogUri, { expectedCatalogUri }).errors)
      .toContainEqual(expect.objectContaining({ code: 'CONTRACT_CATALOG_IMPORT_URI' }));

    const driftingCatalogPath = fixture();
    driftingCatalogPath.imports![0]!.uri = '../../unrelated/component-catalog.json';
    expect(validateResolvedContract(driftingCatalogPath, { expectedCatalogUri }).errors)
      .toContainEqual(expect.objectContaining({ code: 'CONTRACT_CATALOG_IMPORT_URI' }));
  });

  it('validates component payload schemas, registrations, and allowed kinds', () => {
    const invalidPayload = fixture();
    invalidPayload.entities['scene.blue-winter-grove']!.components['description.intent']!.summary = '';
    expect(errorCodes(invalidPayload)).toContain('CONTRACT_COMPONENT_SCHEMA');

    const invalidKind = fixture();
    invalidKind.entities['group.environment']!.components['style.visualLanguage'] = {
      primary: 'not allowed on a group',
    };
    expect(errorCodes(invalidKind)).toContain('CONTRACT_COMPONENT_KIND');

    const unknown = fixture();
    unknown.entities['scene.blue-winter-grove']!.components['unknown.component'] = {};
    expect(errorCodes(unknown)).toContain('CONTRACT_COMPONENT_UNKNOWN');
  });

  it('validates merged prototype inheritance payloads', () => {
    const invalid = fixture();
    invalid.definitions.prototypes['prototype.tree.snow-pine.mature']!.components[
      'description.intent'
    ] = { summary: 42 };
    expect(errorCodes(invalid)).toContain('CONTRACT_PROTOTYPE_INHERITANCE_SCHEMA');
  });
});

describe('identity, ownership, prototypes, and explicit references', () => {
  it('requires map keys and record ids to agree', () => {
    const invalid = fixture();
    invalid.entities['group.environment']!.id = 'group.not-environment';
    expect(errorCodes(invalid)).toContain('CONTRACT_MAP_ID_MISMATCH');
  });

  it('requires the ownership tree to be complete, unique, and parent-consistent', () => {
    const duplicate = fixture();
    duplicate.entityTree.children![0]!.entity = 'scene.blue-winter-grove';
    const duplicateCodes = errorCodes(duplicate);
    expect(duplicateCodes).toContain('CONTRACT_OWNERSHIP_DUPLICATE');
    expect(duplicateCodes).toContain('CONTRACT_OWNERSHIP_INCOMPLETE');

    const wrongParent = fixture();
    wrongParent.entities['group.environment']!.parent = 'group.terrain';
    expect(errorCodes(wrongParent)).toContain('CONTRACT_OWNERSHIP_PARENT');
  });

  it('rejects unresolved and cyclic prototype ancestry', () => {
    const missing = fixture();
    missing.definitions.prototypes['prototype.tree.snow-pine.mature']!.extends =
      'prototype.missing';
    expect(errorCodes(missing)).toContain('CONTRACT_REFERENCE_UNRESOLVED');

    const cyclic = fixture();
    cyclic.definitions.prototypes['prototype.tree.conifer.base']!.extends =
      'prototype.tree.snow-pine.mature';
    expect(errorCodes(cyclic)).toContain('CONTRACT_PROTOTYPE_CYCLE');
  });

  it('checks the fixture reference-bearing component paths', () => {
    const missingMaterial = fixture();
    missingMaterial.definitions.prototypes['prototype.tree.conifer.base']!.components[
      'material.assignment'
    ]!.slots = { trunk: 'material.missing' };
    expect(errorCodes(missingMaterial)).toContain('CONTRACT_REFERENCE_UNRESOLVED');

    const missingPrototype = fixture();
    const mix = missingPrototype.entities['population.pine.old-growth']!.components[
      'population.prototypeMix'
    ]!;
    const entries = mix.entries as DeepMutable<readonly { prototype: string; weight: number }[]>;
    entries[0]!.prototype = 'prototype.missing';
    expect(errorCodes(missingPrototype)).toContain('CONTRACT_REFERENCE_UNRESOLVED');

    const wrongRegionKind = fixture();
    const distribution = wrongRegionKind.entities['population.pine.old-growth']!.components[
      'population.distribution'
    ]!;
    distribution.allowedRegions = ['camera.hero'];
    expect(errorCodes(wrongRegionKind)).toContain('CONTRACT_REFERENCE_KIND');
  });
});

describe('relationship and system graphs', () => {
  it('validates relationship registration, endpoint kinds, selectors, and rule schemas', () => {
    const unknownType = fixture();
    unknownType.relationships[0]!.type = 'composition.unknown';
    expect(errorCodes(unknownType)).toContain('CONTRACT_RELATIONSHIP_TYPE_UNKNOWN');

    const wrongEndpoint = fixture();
    wrongEndpoint.relationships[0]!.target = 'environment.wind';
    expect(errorCodes(wrongEndpoint)).toContain('CONTRACT_RELATIONSHIP_ENDPOINT_KIND');

    const badSelector = fixture();
    badSelector.relationships[14]!.targetSelector = { component: 'unknown.component' };
    expect(errorCodes(badSelector)).toContain('CONTRACT_RELATIONSHIP_SELECTOR');

    const strictCatalog = structuredClone(loadComponentCatalog()) as DeepMutable<ComponentCatalog>;
    strictCatalog.relationshipTypes['composition.frames']!.ruleSchema = {
      type: 'object',
      required: ['catalogMarker'],
      properties: { catalogMarker: { const: true } },
    };
    expect(
      validateResolvedContract(fullFixture, { catalog: strictCatalog }).errors.map(({ code }) => code),
    ).toContain('CONTRACT_RELATIONSHIP_RULE_SCHEMA');
  });

  it('rejects duplicate relationship and system ids', () => {
    const duplicateRelationship = fixture();
    duplicateRelationship.relationships[1]!.id = duplicateRelationship.relationships[0]!.id;
    expect(errorCodes(duplicateRelationship)).toContain('CONTRACT_RELATIONSHIP_ID_DUPLICATE');

    const duplicateSystem = fixture();
    duplicateSystem.systems[1]!.id = duplicateSystem.systems[0]!.id;
    expect(errorCodes(duplicateSystem)).toContain('CONTRACT_SYSTEM_ID_DUPLICATE');
  });

  it('validates system dependencies, resources, and cycles', () => {
    const missing = fixture();
    missing.systems[1]!.dependsOn = ['system.missing'];
    expect(errorCodes(missing)).toContain('CONTRACT_REFERENCE_UNRESOLVED');

    const unknownResource = fixture();
    unknownResource.systems[0]!.reads = ['unknown.component'];
    expect(errorCodes(unknownResource)).toContain('CONTRACT_SYSTEM_RESOURCE_UNKNOWN');

    const unknownRelationshipInvalidation = fixture();
    unknownRelationshipInvalidation.systems[5]!.invalidation!.onRelationshipTypes = [
      'missing.relationship.*',
    ];
    expect(errorCodes(unknownRelationshipInvalidation)).toContain('CONTRACT_SYSTEM_RESOURCE_UNKNOWN');

    const unknownPrototypeInvalidation = fixture();
    unknownPrototypeInvalidation.systems[8]!.invalidation!.onPrototypeComponentChange = [
      'missing.component',
    ];
    expect(errorCodes(unknownPrototypeInvalidation)).toContain('CONTRACT_SYSTEM_RESOURCE_UNKNOWN');

    const unknownFieldInvalidation = fixture();
    unknownFieldInvalidation.systems[7]!.invalidation!.onFieldChange = ['missing.field'];
    expect(errorCodes(unknownFieldInvalidation)).toContain('CONTRACT_SYSTEM_RESOURCE_UNKNOWN');

    const cyclic = fixture();
    cyclic.systems[0]!.dependsOn = ['system.publish.preview-bundle'];
    const result = validateResolvedContract(cyclic);
    expect(result.errors.map(({ code }) => code)).toContain('CONTRACT_SYSTEM_CYCLE');
    expect(result.systemOrder).toEqual([]);
  });
});
