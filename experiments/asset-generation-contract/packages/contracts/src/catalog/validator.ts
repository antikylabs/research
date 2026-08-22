import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';

import type {
  EntityKind,
  JsonObject,
  ResolvedContract,
  ResolvedEntity,
  ResolvedPrototype,
} from '../ir/index.js';
import { loadComponentCatalog, loadContractSchema } from './load.js';
import { getComponentMergePolicy, mergeComponentPayload } from './merge.js';
import type { ComponentCatalog, JsonSchema } from './types.js';

export type ResolvedContractErrorCode =
  | 'CONTRACT_CATALOG_IMPORT_DUPLICATE'
  | 'CONTRACT_CATALOG_IMPORT_MISSING'
  | 'CONTRACT_CATALOG_IMPORT_REQUIRED'
  | 'CONTRACT_CATALOG_IMPORT_URI'
  | 'CONTRACT_CATALOG_IMPORT_UNRESOLVED'
  | 'CONTRACT_CATALOG_IMPORT_VERSION'
  | 'CONTRACT_COMPONENT_KIND'
  | 'CONTRACT_COMPONENT_SCHEMA'
  | 'CONTRACT_COMPONENT_UNKNOWN'
  | 'CONTRACT_MAP_ID_MISMATCH'
  | 'CONTRACT_MAP_ID_MISSING'
  | 'CONTRACT_OWNERSHIP_CYCLE'
  | 'CONTRACT_OWNERSHIP_DUPLICATE'
  | 'CONTRACT_OWNERSHIP_INCOMPLETE'
  | 'CONTRACT_OWNERSHIP_PARENT'
  | 'CONTRACT_OWNERSHIP_ROOT'
  | 'CONTRACT_PROTOTYPE_CYCLE'
  | 'CONTRACT_PROTOTYPE_INHERITANCE_SCHEMA'
  | 'CONTRACT_REFERENCE_KIND'
  | 'CONTRACT_REFERENCE_UNRESOLVED'
  | 'CONTRACT_RELATIONSHIP_ENDPOINT_KIND'
  | 'CONTRACT_RELATIONSHIP_ID_DUPLICATE'
  | 'CONTRACT_RELATIONSHIP_RULE_SCHEMA'
  | 'CONTRACT_RELATIONSHIP_SELECTOR'
  | 'CONTRACT_RELATIONSHIP_TYPE_UNKNOWN'
  | 'CONTRACT_SCHEMA_ID'
  | 'CONTRACT_SCHEMA_INVALID'
  | 'CONTRACT_SCHEMA_VERSION'
  | 'CONTRACT_SYSTEM_CYCLE'
  | 'CONTRACT_SYSTEM_ID_DUPLICATE'
  | 'CONTRACT_SYSTEM_PHASE_UNKNOWN'
  | 'CONTRACT_SYSTEM_RESOURCE_UNKNOWN';

export interface ResolvedContractValidationError {
  readonly code: ResolvedContractErrorCode;
  readonly message: string;
  readonly technicalPath: string;
}

export interface ResolvedContractValidationResult {
  readonly errors: readonly ResolvedContractValidationError[];
  readonly ok: boolean;
  /** Dependency-first and deterministic; empty when the system graph is invalid. */
  readonly systemOrder: readonly string[];
}

export interface ValidateResolvedContractOptions {
  readonly catalog?: ComponentCatalog;
  readonly expectedCatalogUri?: string;
  readonly expectedSchemaId?: string;
  readonly expectedSchemaVersion?: string;
  readonly schema?: JsonSchema;
}

interface ValidatorBundle {
  readonly componentValidators: ReadonlyMap<string, ValidateFunction>;
  readonly relationshipRuleValidators: ReadonlyMap<string, ValidateFunction>;
  readonly topLevel: ValidateFunction;
}

const identifierPropertyPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
let defaultValidatorBundle: ValidatorBundle | undefined;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function jsonPropertyPath(base: string, property: string): string {
  return identifierPropertyPattern.test(property)
    ? `${base}.${property}`
    : `${base}[${JSON.stringify(property)}]`;
}

function jsonIndexPath(base: string, index: number): string {
  return `${base}[${index}]`;
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

function ajvErrorPath(base: string, error: ErrorObject): string {
  let result = base;
  if (error.instancePath !== '') {
    for (const rawSegment of error.instancePath.slice(1).split('/')) {
      const segment = decodeJsonPointerSegment(rawSegment);
      result = /^\d+$/.test(segment)
        ? jsonIndexPath(result, Number(segment))
        : jsonPropertyPath(result, segment);
    }
  }

  if (error.keyword === 'required') {
    const missingProperty = (error.params as { readonly missingProperty?: unknown })
      .missingProperty;
    if (typeof missingProperty === 'string') {
      result = jsonPropertyPath(result, missingProperty);
    }
  }

  return result;
}

function ajvErrorMessage(error: ErrorObject): string {
  return error.message === undefined
    ? `failed JSON Schema keyword ${error.keyword}`
    : error.message;
}

function addError(
  errors: ResolvedContractValidationError[],
  code: ResolvedContractErrorCode,
  technicalPath: string,
  message: string,
): void {
  errors.push({ code, message, technicalPath });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function createValidatorBundle(
  schema: JsonSchema,
  catalog: ComponentCatalog,
): ValidatorBundle {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: true,
    strictRequired: false,
  });
  const componentValidators = new Map<string, ValidateFunction>();
  const relationshipRuleValidators = new Map<string, ValidateFunction>();

  for (const [type, definition] of Object.entries(catalog.componentTypes)) {
    componentValidators.set(type, ajv.compile(definition.schema));
  }
  for (const [type, definition] of Object.entries(catalog.relationshipTypes)) {
    relationshipRuleValidators.set(type, ajv.compile(definition.ruleSchema));
  }

  return {
    componentValidators,
    relationshipRuleValidators,
    topLevel: ajv.compile(schema),
  };
}

function getValidatorBundle(
  schema: JsonSchema,
  catalog: ComponentCatalog,
): ValidatorBundle {
  const defaultSchema = loadContractSchema();
  const defaultCatalog = loadComponentCatalog();
  if (schema === defaultSchema && catalog === defaultCatalog) {
    defaultValidatorBundle ??= createValidatorBundle(schema, catalog);
    return defaultValidatorBundle;
  }
  return createValidatorBundle(schema, catalog);
}

function addSchemaErrors(
  errors: ResolvedContractValidationError[],
  code: ResolvedContractErrorCode,
  basePath: string,
  validator: ValidateFunction,
): void {
  for (const error of validator.errors ?? []) {
    addError(errors, code, ajvErrorPath(basePath, error), ajvErrorMessage(error));
  }
}

function validateNamedRecordMap(
  map: Readonly<Record<string, unknown>>,
  basePath: string,
  errors: ResolvedContractValidationError[],
): void {
  for (const [key, value] of Object.entries(map)) {
    const entryPath = jsonPropertyPath(basePath, key);
    if (!isObject(value) || typeof value.id !== 'string') {
      addError(
        errors,
        'CONTRACT_MAP_ID_MISSING',
        jsonPropertyPath(entryPath, 'id'),
        `Record ${JSON.stringify(key)} must declare the same id as its map key.`,
      );
      continue;
    }
    if (value.id !== key) {
      addError(
        errors,
        'CONTRACT_MAP_ID_MISMATCH',
        jsonPropertyPath(entryPath, 'id'),
        `Map key ${JSON.stringify(key)} does not match record id ${JSON.stringify(value.id)}.`,
      );
    }
  }
}

function validateComponentMap(
  components: Readonly<Record<string, JsonObject>>,
  ownerKind: string,
  basePath: string,
  catalog: ComponentCatalog,
  validators: ValidatorBundle,
  errors: ResolvedContractValidationError[],
  schemaCode: ResolvedContractErrorCode = 'CONTRACT_COMPONENT_SCHEMA',
): void {
  for (const [type, payload] of Object.entries(components)) {
    const componentPath = jsonPropertyPath(basePath, type);
    const definition = catalog.componentTypes[type];
    if (definition === undefined) {
      addError(
        errors,
        'CONTRACT_COMPONENT_UNKNOWN',
        componentPath,
        `Component type ${JSON.stringify(type)} is not registered in catalog ${catalog.id}@${catalog.catalogVersion}.`,
      );
      continue;
    }

    if (!definition.allowedEntityKinds.includes(ownerKind)) {
      addError(
        errors,
        'CONTRACT_COMPONENT_KIND',
        componentPath,
        `Component ${JSON.stringify(type)} is not allowed on ${JSON.stringify(ownerKind)} records.`,
      );
    }

    const validator = validators.componentValidators.get(type);
    if (validator !== undefined && !validator(payload)) {
      addSchemaErrors(errors, schemaCode, componentPath, validator);
    }
  }
}

function validateComponents(
  contract: ResolvedContract,
  catalog: ComponentCatalog,
  validators: ValidatorBundle,
  errors: ResolvedContractValidationError[],
): void {
  for (const [id, prototype] of Object.entries(contract.definitions.prototypes)) {
    validateComponentMap(
      prototype.components,
      'prototype',
      `${jsonPropertyPath('$.definitions.prototypes', id)}.components`,
      catalog,
      validators,
      errors,
    );
  }
  for (const [id, entity] of Object.entries(contract.entities)) {
    validateComponentMap(
      entity.components,
      entity.kind,
      `${jsonPropertyPath('$.entities', id)}.components`,
      catalog,
      validators,
      errors,
    );
  }
}

function detectPrototypeCycles(
  prototypes: Readonly<Record<string, ResolvedPrototype>>,
  errors: ResolvedContractValidationError[],
): void {
  const state = new Map<string, 'done' | 'visiting'>();
  const stack: string[] = [];
  const reported = new Set<string>();

  function visit(id: string): void {
    const currentState = state.get(id);
    if (currentState === 'done') return;
    if (currentState === 'visiting') {
      const cycleStart = stack.indexOf(id);
      const cycle = [...stack.slice(cycleStart), id];
      const cycleKey = [...new Set(cycle)].sort().join('\u0000');
      if (!reported.has(cycleKey)) {
        reported.add(cycleKey);
        addError(
          errors,
          'CONTRACT_PROTOTYPE_CYCLE',
          `${jsonPropertyPath('$.definitions.prototypes', stack.at(-1) ?? id)}.extends`,
          `Prototype inheritance cycle: ${cycle.join(' -> ')}.`,
        );
      }
      return;
    }

    state.set(id, 'visiting');
    stack.push(id);
    const parent = prototypes[id]?.extends;
    if (parent !== undefined && prototypes[parent] !== undefined) visit(parent);
    stack.pop();
    state.set(id, 'done');
  }

  for (const id of Object.keys(prototypes).sort()) visit(id);
}

function resolveEffectivePrototypeComponents(
  prototypes: Readonly<Record<string, ResolvedPrototype>>,
  catalog: ComponentCatalog,
): ReadonlyMap<string, Readonly<Record<string, JsonObject>>> {
  const resolved = new Map<string, Readonly<Record<string, JsonObject>>>();
  const resolving = new Set<string>();

  function resolve(id: string): Readonly<Record<string, JsonObject>> {
    const existing = resolved.get(id);
    if (existing !== undefined) return existing;
    if (resolving.has(id)) return {};

    const prototype = prototypes[id];
    if (prototype === undefined) return {};
    resolving.add(id);
    const result: Record<string, JsonObject> = {};
    if (prototype.extends !== undefined && prototypes[prototype.extends] !== undefined) {
      for (const [type, payload] of Object.entries(resolve(prototype.extends))) {
        if (getComponentMergePolicy(type, catalog) !== 'non-inheritable') {
          result[type] = payload;
        }
      }
    }

    for (const [type, payload] of Object.entries(prototype.components)) {
      const inherited = result[type];
      result[type] = inherited === undefined || catalog.componentTypes[type] === undefined
        ? payload
        : mergeComponentPayload(type, inherited, payload, catalog);
    }
    resolving.delete(id);
    resolved.set(id, result);
    return result;
  }

  for (const id of Object.keys(prototypes).sort()) resolve(id);
  return resolved;
}

function validatePrototypes(
  contract: ResolvedContract,
  catalog: ComponentCatalog,
  validators: ValidatorBundle,
  errors: ResolvedContractValidationError[],
): void {
  const prototypes = contract.definitions.prototypes;
  for (const [id, prototype] of Object.entries(prototypes)) {
    if (prototype.extends !== undefined && prototypes[prototype.extends] === undefined) {
      addError(
        errors,
        'CONTRACT_REFERENCE_UNRESOLVED',
        `${jsonPropertyPath('$.definitions.prototypes', id)}.extends`,
        `Prototype ${JSON.stringify(prototype.extends)} does not exist.`,
      );
    }
  }
  detectPrototypeCycles(prototypes, errors);

  for (const [id, components] of resolveEffectivePrototypeComponents(prototypes, catalog)) {
    if (prototypes[id]?.extends === undefined) continue;
    validateComponentMap(
      components,
      'prototype',
      `${jsonPropertyPath('$.definitions.prototypes', id)}.components`,
      catalog,
      validators,
      errors,
      'CONTRACT_PROTOTYPE_INHERITANCE_SCHEMA',
    );
  }
}

function validateEntityReference(
  contract: ResolvedContract,
  value: unknown,
  technicalPath: string,
  errors: ResolvedContractValidationError[],
  expectedKinds?: readonly EntityKind[],
): void {
  if (typeof value !== 'string') return;
  const entity = contract.entities[value];
  if (entity === undefined) {
    addError(
      errors,
      'CONTRACT_REFERENCE_UNRESOLVED',
      technicalPath,
      `Entity reference ${JSON.stringify(value)} does not resolve.`,
    );
    return;
  }
  if (expectedKinds !== undefined && !expectedKinds.includes(entity.kind)) {
    addError(
      errors,
      'CONTRACT_REFERENCE_KIND',
      technicalPath,
      `Entity ${JSON.stringify(value)} has kind ${JSON.stringify(entity.kind)}; expected ${expectedKinds.join(' or ')}.`,
    );
  }
}

function validateMapReference(
  map: Readonly<Record<string, unknown>>,
  label: string,
  value: unknown,
  technicalPath: string,
  errors: ResolvedContractValidationError[],
): void {
  if (typeof value === 'string' && map[value] === undefined) {
    addError(
      errors,
      'CONTRACT_REFERENCE_UNRESOLVED',
      technicalPath,
      `${label} reference ${JSON.stringify(value)} does not resolve.`,
    );
  }
}

function validateEntityArrayReferences(
  contract: ResolvedContract,
  value: unknown,
  technicalPath: string,
  errors: ResolvedContractValidationError[],
  expectedKinds?: readonly EntityKind[],
): void {
  if (!Array.isArray(value)) return;
  value.forEach((reference, index) => {
    validateEntityReference(
      contract,
      reference,
      jsonIndexPath(technicalPath, index),
      errors,
      expectedKinds,
    );
  });
}

function validateMaterialAssignment(
  contract: ResolvedContract,
  payload: JsonObject,
  technicalPath: string,
  errors: ResolvedContractValidationError[],
): void {
  const slots = payload.slots;
  if (!isObject(slots)) return;
  for (const [slot, material] of Object.entries(slots)) {
    validateMapReference(
      contract.definitions.materials,
      'Material',
      material,
      jsonPropertyPath(`${technicalPath}.slots`, slot),
      errors,
    );
  }
}

function validateFixtureComponentReferences(
  contract: ResolvedContract,
  errors: ResolvedContractValidationError[],
): void {
  for (const [materialId, material] of Object.entries(contract.definitions.materials)) {
    validateMapReference(
      contract.definitions.palettes,
      'Palette',
      material.palette,
      `${jsonPropertyPath('$.definitions.materials', materialId)}.palette`,
      errors,
    );
  }

  for (const [prototypeId, prototype] of Object.entries(contract.definitions.prototypes)) {
    const assignment = prototype.components['material.assignment'];
    if (assignment !== undefined) {
      validateMaterialAssignment(
        contract,
        assignment,
        `${jsonPropertyPath('$.definitions.prototypes', prototypeId)}.components["material.assignment"]`,
        errors,
      );
    }
  }

  for (const [entityId, entity] of Object.entries(contract.entities)) {
    const entityPath = jsonPropertyPath('$.entities', entityId);
    validateMapReference(
      contract.definitions.prototypes,
      'Prototype',
      entity.prototype,
      `${entityPath}.prototype`,
      errors,
    );

    const components = entity.components;
    const sky = components['environment.skyProfile'];
    if (sky !== undefined) {
      validateMapReference(contract.definitions.palettes, 'Palette', sky.palette,
        `${entityPath}.components["environment.skyProfile"].palette`, errors);
    }
    const atmosphere = components['environment.atmosphereProfile'];
    if (atmosphere !== undefined) {
      validateMapReference(contract.definitions.palettes, 'Palette', atmosphere.colorPalette,
        `${entityPath}.components["environment.atmosphereProfile"].colorPalette`, errors);
    }
    const lighting = components['environment.lightingProfile'];
    if (lighting !== undefined && isObject(lighting.key)) {
      validateEntityReference(contract, lighting.key.source,
        `${entityPath}.components["environment.lightingProfile"].key.source`, errors, ['environment']);
    }
    const surfaceLayers = components['terrain.surfaceLayers'];
    if (surfaceLayers !== undefined) {
      validateMapReference(contract.definitions.materials, 'Material', surfaceLayers.baseMaterial,
        `${entityPath}.components["terrain.surfaceLayers"].baseMaterial`, errors);
      if (Array.isArray(surfaceLayers.layers)) {
        surfaceLayers.layers.forEach((layer, index) => {
          if (isObject(layer)) {
            validateMapReference(contract.definitions.materials, 'Material', layer.material,
              `${entityPath}.components["terrain.surfaceLayers"].layers[${index}].material`, errors);
          }
        });
      }
    }
    const snowField = components['terrain.snowField'];
    if (snowField !== undefined) {
      validateEntityReference(contract, snowField.windInfluenceEntity,
        `${entityPath}.components["terrain.snowField"].windInfluenceEntity`, errors, ['environment']);
    }
    const prototypeMix = components['population.prototypeMix'];
    if (prototypeMix !== undefined && Array.isArray(prototypeMix.entries)) {
      prototypeMix.entries.forEach((entry, index) => {
        if (isObject(entry)) {
          validateMapReference(contract.definitions.prototypes, 'Prototype', entry.prototype,
            `${entityPath}.components["population.prototypeMix"].entries[${index}].prototype`, errors);
        }
      });
    }
    const distribution = components['population.distribution'];
    if (distribution !== undefined) {
      for (const key of ['allowedRegions', 'preferredRegions', 'excludedRegions'] as const) {
        validateEntityArrayReferences(contract, distribution[key],
          `${entityPath}.components["population.distribution"].${key}`, errors, ['region', 'terrain']);
      }
      for (const key of ['parentPopulation', 'sourcePopulation'] as const) {
        validateEntityReference(contract, distribution[key],
          `${entityPath}.components["population.distribution"].${key}`, errors, ['population']);
      }
      validateEntityArrayReferences(contract, distribution.sourcePopulations,
        `${entityPath}.components["population.distribution"].sourcePopulations`, errors, ['population']);
      validateEntityReference(contract, distribution.orientationEntity,
        `${entityPath}.components["population.distribution"].orientationEntity`, errors, ['environment']);
    }
    const anchor = components['layout.anchor'];
    if (anchor !== undefined) {
      validateMapReference(contract.definitions.prototypes, 'Prototype', anchor.preferredPrototype,
        `${entityPath}.components["layout.anchor"].preferredPrototype`, errors);
      validateEntityReference(contract, anchor.region,
        `${entityPath}.components["layout.anchor"].region`, errors, ['region']);
    }
    for (const type of ['composition.screenTarget', 'composition.frame', 'composition.depthBand'] as const) {
      const payload = components[type];
      if (payload === undefined) continue;
      validateEntityReference(contract, payload.camera,
        `${entityPath}.components[${JSON.stringify(type)}].camera`, errors, ['camera']);
      validateEntityArrayReferences(contract, payload.preferredSources,
        `${entityPath}.components[${JSON.stringify(type)}].preferredSources`, errors, ['population']);
    }
    const camera = components['render.camera'];
    if (camera !== undefined && isObject(camera.targetSelector)) {
      validateMapReference(contract.definitions.prototypes, 'Prototype', camera.targetSelector.prototype,
        `${entityPath}.components["render.camera"].targetSelector.prototype`, errors);
    }
    const acceptance = components['validation.acceptance'];
    if (acceptance !== undefined && Array.isArray(acceptance.requiredSuites)) {
      acceptance.requiredSuites.forEach((suite, index) => {
        validateMapReference(
          isObject(contract.validation.suites) ? contract.validation.suites : {},
          'Validation suite',
          suite,
          `${entityPath}.components["validation.acceptance"].requiredSuites[${index}]`,
          errors,
        );
      });
    }
  }
}

function detectParentCycles(
  entities: Readonly<Record<string, ResolvedEntity>>,
  errors: ResolvedContractValidationError[],
): void {
  const done = new Set<string>();
  for (const start of Object.keys(entities).sort()) {
    if (done.has(start)) continue;
    const localIndexes = new Map<string, number>();
    const chain: string[] = [];
    let current: string | undefined = start;
    while (current !== undefined && entities[current] !== undefined && !done.has(current)) {
      const prior = localIndexes.get(current);
      if (prior !== undefined) {
        const cycle = [...chain.slice(prior), current];
        addError(errors, 'CONTRACT_OWNERSHIP_CYCLE',
          `${jsonPropertyPath('$.entities', chain.at(-1) ?? current)}.parent`,
          `Entity parent cycle: ${cycle.join(' -> ')}.`);
        break;
      }
      localIndexes.set(current, chain.length);
      chain.push(current);
      current = entities[current]?.parent;
    }
    chain.forEach((id) => done.add(id));
  }
}

function validateOwnership(
  contract: ResolvedContract,
  errors: ResolvedContractValidationError[],
): void {
  const seen = new Map<string, string>();
  const treeParent = new Map<string, string | undefined>();

  function walk(node: { readonly entity: string; readonly children?: readonly unknown[] }, path: string, parent?: string): void {
    const priorPath = seen.get(node.entity);
    if (priorPath !== undefined) {
      addError(errors, 'CONTRACT_OWNERSHIP_DUPLICATE', `${path}.entity`,
        `Entity ${JSON.stringify(node.entity)} already appears at ${priorPath}.`);
    } else {
      seen.set(node.entity, `${path}.entity`);
      treeParent.set(node.entity, parent);
    }
    if (contract.entities[node.entity] === undefined) {
      addError(errors, 'CONTRACT_REFERENCE_UNRESOLVED', `${path}.entity`,
        `Ownership node references unknown entity ${JSON.stringify(node.entity)}.`);
    }
    (node.children ?? []).forEach((child, index) => {
      if (isObject(child) && typeof child.entity === 'string') {
        walk(child as { readonly entity: string; readonly children?: readonly unknown[] },
          `${path}.children[${index}]`, node.entity);
      }
    });
  }

  walk(contract.entityTree, '$.entityTree');
  const root = contract.entities[contract.entityTree.entity];
  if (root !== undefined && root.parent !== undefined) {
    addError(errors, 'CONTRACT_OWNERSHIP_ROOT',
      `${jsonPropertyPath('$.entities', root.id)}.parent`,
      `Ownership root ${JSON.stringify(root.id)} must not declare a parent.`);
  }

  for (const [id, entity] of Object.entries(contract.entities)) {
    if (!seen.has(id)) {
      addError(errors, 'CONTRACT_OWNERSHIP_INCOMPLETE', jsonPropertyPath('$.entities', id),
        `Entity ${JSON.stringify(id)} is absent from the ownership tree.`);
    }
    const expectedParent = treeParent.get(id);
    if (seen.has(id) && entity.parent !== expectedParent) {
      addError(errors, 'CONTRACT_OWNERSHIP_PARENT',
        `${jsonPropertyPath('$.entities', id)}.parent`,
        `Entity parent ${JSON.stringify(entity.parent)} does not match tree parent ${JSON.stringify(expectedParent)}.`);
    }
    if (entity.parent !== undefined && contract.entities[entity.parent] === undefined) {
      addError(errors, 'CONTRACT_REFERENCE_UNRESOLVED',
        `${jsonPropertyPath('$.entities', id)}.parent`,
        `Parent entity ${JSON.stringify(entity.parent)} does not resolve.`);
    }
  }
  detectParentCycles(contract.entities, errors);
}

function validateRelationshipSelector(
  selector: JsonObject,
  path: string,
  catalog: ComponentCatalog,
  contract: ResolvedContract,
  errors: ResolvedContractValidationError[],
): void {
  if (Object.keys(selector).length === 0) {
    addError(errors, 'CONTRACT_RELATIONSHIP_SELECTOR', path,
      'A relationship target selector must contain at least one selection constraint.');
  }
  if (selector.component !== undefined &&
      (typeof selector.component !== 'string' || catalog.componentTypes[selector.component] === undefined)) {
    addError(errors, 'CONTRACT_RELATIONSHIP_SELECTOR', `${path}.component`,
      `Selector component ${JSON.stringify(selector.component)} is not registered.`);
  }
  validateEntityReference(contract, selector.entity, `${path}.entity`, errors);
  validateMapReference(contract.definitions.prototypes, 'Prototype', selector.prototype,
    `${path}.prototype`, errors);
}

function validateRelationships(
  contract: ResolvedContract,
  catalog: ComponentCatalog,
  validators: ValidatorBundle,
  errors: ResolvedContractValidationError[],
): void {
  const ids = new Set<string>();
  contract.relationships.forEach((relationship, index) => {
    const path = `$.relationships[${index}]`;
    if (ids.has(relationship.id)) {
      addError(errors, 'CONTRACT_RELATIONSHIP_ID_DUPLICATE', `${path}.id`,
        `Relationship id ${JSON.stringify(relationship.id)} is duplicated.`);
    }
    ids.add(relationship.id);

    const definition = catalog.relationshipTypes[relationship.type];
    if (definition === undefined) {
      addError(errors, 'CONTRACT_RELATIONSHIP_TYPE_UNKNOWN', `${path}.type`,
        `Relationship type ${JSON.stringify(relationship.type)} is not registered.`);
      return;
    }
    const source = contract.entities[relationship.source];
    if (source === undefined) {
      validateEntityReference(contract, relationship.source, `${path}.source`, errors);
    } else if (!definition.sourceKinds.includes(source.kind)) {
      addError(errors, 'CONTRACT_RELATIONSHIP_ENDPOINT_KIND', `${path}.source`,
        `Relationship ${relationship.type} does not allow source kind ${source.kind}.`);
    }
    if (relationship.target !== undefined) {
      const target = contract.entities[relationship.target];
      if (target === undefined) {
        validateEntityReference(contract, relationship.target, `${path}.target`, errors);
      } else if (!definition.targetKinds.includes(target.kind)) {
        addError(errors, 'CONTRACT_RELATIONSHIP_ENDPOINT_KIND', `${path}.target`,
          `Relationship ${relationship.type} does not allow target kind ${target.kind}.`);
      }
    } else if (relationship.targetSelector !== undefined) {
      if (!definition.targetKinds.includes('selector')) {
        addError(errors, 'CONTRACT_RELATIONSHIP_ENDPOINT_KIND', `${path}.targetSelector`,
          `Relationship ${relationship.type} does not allow a selector target.`);
      }
      validateRelationshipSelector(relationship.targetSelector, `${path}.targetSelector`,
        catalog, contract, errors);
    }

    const ruleValidator = validators.relationshipRuleValidators.get(relationship.type);
    if (ruleValidator !== undefined && !ruleValidator(relationship.rule ?? {})) {
      addSchemaErrors(errors, 'CONTRACT_RELATIONSHIP_RULE_SCHEMA', `${path}.rule`, ruleValidator);
    }
  });
}

function globMatches(pattern: string, value: string): boolean {
  const expression = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('*', '.*');
  return new RegExp(`^${expression}$`).test(value);
}

function resolveLocalSchemaReference(
  root: JsonSchema,
  value: Record<string, unknown>,
): Record<string, unknown> {
  let current = value;
  const visited = new Set<string>();
  while (typeof current.$ref === 'string' && current.$ref.startsWith('#/')) {
    if (visited.has(current.$ref)) break;
    visited.add(current.$ref);
    let target: unknown = root;
    for (const rawSegment of current.$ref.slice(2).split('/')) {
      const segment = decodeJsonPointerSegment(rawSegment);
      target = isObject(target) ? target[segment] : undefined;
    }
    if (!isObject(target)) break;
    current = target;
  }
  return current;
}

function isKnownContractSchemaPath(schema: JsonSchema, value: string): boolean {
  let current: Record<string, unknown> = schema;
  for (const segment of value.split('.')) {
    current = resolveLocalSchemaReference(schema, current);
    const properties = isObject(current.properties) ? current.properties : undefined;
    const property = properties?.[segment];
    if (isObject(property)) {
      current = property;
      continue;
    }
    if (isObject(current.additionalProperties)) {
      current = current.additionalProperties;
      continue;
    }
    if (current.type === 'object' && current.additionalProperties !== false) {
      return true;
    }
    return false;
  }
  return true;
}

function validateSystemResource(
  value: unknown,
  path: string,
  catalog: ComponentCatalog,
  schema: JsonSchema,
  errors: ResolvedContractValidationError[],
): void {
  if (typeof value !== 'string') return;
  if (value.startsWith('relationships:')) {
    const pattern = value.slice('relationships:'.length);
    if (!Object.keys(catalog.relationshipTypes).some((type) => globMatches(pattern, type))) {
      addError(errors, 'CONTRACT_SYSTEM_RESOURCE_UNKNOWN', path,
        `Relationship resource pattern ${JSON.stringify(value)} matches no catalog relationship type.`);
    }
    return;
  }
  if (catalog.componentTypes[value] !== undefined || value.startsWith('derived.') ||
      value.startsWith('artifact.')) return;
  if (value.includes('*') && Object.keys(catalog.componentTypes).some((type) => globMatches(value, type))) return;
  if (isKnownContractSchemaPath(schema, value)) return;
  addError(errors, 'CONTRACT_SYSTEM_RESOURCE_UNKNOWN', path,
    `System resource ${JSON.stringify(value)} is not a contract path, catalog component, relationship pattern, derived value, or artifact.`);
}

function validateCatalogPattern(
  value: unknown,
  path: string,
  registry: Readonly<Record<string, unknown>>,
  label: string,
  errors: ResolvedContractValidationError[],
): void {
  if (typeof value !== 'string') return;
  if (Object.keys(registry).some((type) => globMatches(value, type))) return;
  addError(errors, 'CONTRACT_SYSTEM_RESOURCE_UNKNOWN', path,
    `${label} pattern ${JSON.stringify(value)} matches no loaded catalog type.`);
}

function validateSystems(
  contract: ResolvedContract,
  schema: JsonSchema,
  catalog: ComponentCatalog,
  errors: ResolvedContractValidationError[],
): readonly string[] {
  const systems = new Map<string, { readonly index: number; readonly phase: string; readonly dependsOn: readonly string[] }>();
  contract.systems.forEach((system, index) => {
    const path = `$.systems[${index}]`;
    if (systems.has(system.id)) {
      addError(errors, 'CONTRACT_SYSTEM_ID_DUPLICATE', `${path}.id`,
        `System id ${JSON.stringify(system.id)} is duplicated.`);
    } else {
      systems.set(system.id, { index, phase: system.phase, dependsOn: system.dependsOn });
    }
    if (!catalog.systemPhaseOrder.includes(system.phase)) {
      addError(errors, 'CONTRACT_SYSTEM_PHASE_UNKNOWN', `${path}.phase`,
        `System phase ${JSON.stringify(system.phase)} is absent from the catalog phase order.`);
    }
  });

  const suites = isObject(contract.validation.suites) ? contract.validation.suites : {};
  contract.systems.forEach((system, index) => {
    const path = `$.systems[${index}]`;
    system.dependsOn.forEach((dependency, dependencyIndex) => {
      if (!systems.has(dependency)) {
        addError(errors, 'CONTRACT_REFERENCE_UNRESOLVED',
          `${path}.dependsOn[${dependencyIndex}]`,
          `System dependency ${JSON.stringify(dependency)} does not resolve.`);
      }
    });
    system.reads.forEach((value, itemIndex) =>
      validateSystemResource(value, `${path}.reads[${itemIndex}]`, catalog, schema, errors));
    system.writes.forEach((value, itemIndex) =>
      validateSystemResource(value, `${path}.writes[${itemIndex}]`, catalog, schema, errors));

    const query = system.query;
    for (const key of ['allComponents', 'anyComponents'] as const) {
      if (Array.isArray(query[key])) {
        query[key].forEach((value, itemIndex) =>
          validateSystemResource(value, `${path}.query.${key}[${itemIndex}]`, catalog, schema, errors));
      }
    }
    validateSystemResource(query.prototypeComponent, `${path}.query.prototypeComponent`,
      catalog, schema, errors);
    validateEntityReference(contract, query.parent, `${path}.query.parent`, errors, ['group']);
    validateEntityReference(contract, query.contract, `${path}.query.contract`, errors, ['scene']);
    if (Array.isArray(query.validationSuites)) {
      query.validationSuites.forEach((suite, suiteIndex) =>
        validateMapReference(suites, 'Validation suite', suite,
          `${path}.query.validationSuites[${suiteIndex}]`, errors));
    }

    if (system.parameters !== undefined) {
      validateEntityArrayReferences(contract, system.parameters.placementOrder,
        `${path}.parameters.placementOrder`, errors, ['population']);
      validateEntityArrayReferences(contract, system.parameters.visibilityPriorityCameras,
        `${path}.parameters.visibilityPriorityCameras`, errors, ['camera']);
    }
    if (system.invalidation !== undefined) {
      validateEntityArrayReferences(contract, system.invalidation.onEntitySubtreeChange,
        `${path}.invalidation.onEntitySubtreeChange`, errors);
      validateEntityArrayReferences(contract, system.invalidation.onPopulationChange,
        `${path}.invalidation.onPopulationChange`, errors, ['population']);
      if (Array.isArray(system.invalidation.onComponentChange)) {
        system.invalidation.onComponentChange.forEach((value, itemIndex) =>
          validateCatalogPattern(value, `${path}.invalidation.onComponentChange[${itemIndex}]`,
            catalog.componentTypes, 'Component', errors));
      }
      if (Array.isArray(system.invalidation.onPrototypeComponentChange)) {
        system.invalidation.onPrototypeComponentChange.forEach((value, itemIndex) =>
          validateCatalogPattern(value, `${path}.invalidation.onPrototypeComponentChange[${itemIndex}]`,
            catalog.componentTypes, 'Prototype component', errors));
      }
      if (Array.isArray(system.invalidation.onRelationshipTypes)) {
        system.invalidation.onRelationshipTypes.forEach((value, itemIndex) =>
          validateCatalogPattern(value, `${path}.invalidation.onRelationshipTypes[${itemIndex}]`,
            catalog.relationshipTypes, 'Relationship', errors));
      }
      for (const key of ['onChange', 'onFieldChange'] as const) {
        if (!Array.isArray(system.invalidation[key])) continue;
        system.invalidation[key].forEach((value, itemIndex) =>
          validateSystemResource(value, `${path}.invalidation.${key}[${itemIndex}]`,
            catalog, schema, errors));
      }
    }
  });

  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const id of systems.keys()) {
    indegree.set(id, 0);
    dependents.set(id, []);
  }
  for (const [id, system] of systems) {
    for (const dependency of system.dependsOn) {
      if (!systems.has(dependency)) continue;
      indegree.set(id, (indegree.get(id) ?? 0) + 1);
      dependents.get(dependency)?.push(id);
    }
  }

  const phaseIndex = new Map(catalog.systemPhaseOrder.map((phase, index) => [phase, index]));
  const compareSystems = (left: string, right: string): number => {
    const leftPhase = phaseIndex.get(systems.get(left)?.phase ?? '') ?? Number.MAX_SAFE_INTEGER;
    const rightPhase = phaseIndex.get(systems.get(right)?.phase ?? '') ?? Number.MAX_SAFE_INTEGER;
    return leftPhase - rightPhase || compareText(left, right);
  };
  const ready = [...systems.keys()].filter((id) => indegree.get(id) === 0).sort(compareSystems);
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) break;
    order.push(id);
    for (const dependent of (dependents.get(id) ?? []).sort(compareSystems)) {
      const nextDegree = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, nextDegree);
      if (nextDegree === 0) {
        ready.push(dependent);
        ready.sort(compareSystems);
      }
    }
  }
  if (order.length !== systems.size) {
    const cyclic = [...systems.keys()].filter((id) => !order.includes(id)).sort();
    addError(errors, 'CONTRACT_SYSTEM_CYCLE', '$.systems',
      `System dependency cycle includes: ${cyclic.join(', ')}.`);
    return [];
  }
  return order;
}

function validateValidationReferences(
  contract: ResolvedContract,
  errors: ResolvedContractValidationError[],
): void {
  const validation = contract.validation;
  if (!isObject(validation.suites)) return;
  validateNamedRecordMap(validation.suites, '$.validation.suites', errors);
  for (const [suiteId, suiteValue] of Object.entries(validation.suites)) {
    if (!isObject(suiteValue)) continue;
    const suitePath = jsonPropertyPath('$.validation.suites', suiteId);
    validateEntityReference(contract, suiteValue.camera, `${suitePath}.camera`, errors, ['camera']);
    if (!Array.isArray(suiteValue.rules)) continue;
    suiteValue.rules.forEach((rule, index) => {
      if (!isObject(rule)) return;
      const rulePath = `${suitePath}.rules[${index}]`;
      validateEntityReference(contract, rule.view, `${rulePath}.view`, errors, ['camera']);
      if (!isObject(rule.selector)) return;
      const selectorPath = `${rulePath}.selector`;
      validateEntityReference(contract, rule.selector.sourceEntity, `${selectorPath}.sourceEntity`, errors);
      validateEntityReference(contract, rule.selector.region, `${selectorPath}.region`, errors, ['region']);
      validateEntityReference(contract, rule.selector.parent, `${selectorPath}.parent`, errors, ['group']);
      validateEntityReference(contract, rule.selector.entity, `${selectorPath}.entity`, errors);
      validateEntityReference(contract, rule.selector.camera, `${selectorPath}.camera`, errors, ['camera']);
      validateEntityReference(contract, rule.selector.anchor, `${selectorPath}.anchor`, errors,
        ['composition-anchor']);
      validateEntityArrayReferences(contract, rule.selector.anchors, `${selectorPath}.anchors`, errors,
        ['composition-anchor']);
    });
  }
  if (Array.isArray(validation.acceptanceViews)) {
    validation.acceptanceViews.forEach((view, index) => {
      if (isObject(view)) {
        validateEntityReference(contract, view.camera,
          `$.validation.acceptanceViews[${index}].camera`, errors, ['camera']);
      }
    });
  }
}

function validateCatalogImport(
  contract: ResolvedContract,
  catalog: ComponentCatalog,
  options: ValidateResolvedContractOptions,
  errors: ResolvedContractValidationError[],
): void {
  const matchingIndexes: number[] = [];
  for (const [index, entry] of (contract.imports ?? []).entries()) {
    if (entry.id !== catalog.id) {
      if (entry.optional !== true) {
        addError(errors, 'CONTRACT_CATALOG_IMPORT_UNRESOLVED', `$.imports[${index}].id`,
          `Required catalog import ${entry.id} is not the loaded catalog ${catalog.id}.`);
      }
      continue;
    }
    matchingIndexes.push(index);
    if (entry.optional === true) {
      addError(errors, 'CONTRACT_CATALOG_IMPORT_REQUIRED', `$.imports[${index}].optional`,
        `Loaded catalog ${catalog.id} is required to validate this contract.`);
    }
    if (entry.version !== catalog.catalogVersion) {
      addError(errors, 'CONTRACT_CATALOG_IMPORT_VERSION', `$.imports[${index}].version`,
        `Catalog import requests ${entry.version}; loaded ${catalog.catalogVersion}.`);
    }
    if (options.expectedCatalogUri !== undefined
      && !schemaReferenceMatches(entry.uri, options.expectedCatalogUri)) {
      addError(errors, 'CONTRACT_CATALOG_IMPORT_URI', `$.imports[${index}].uri`,
        `Catalog import requests ${entry.uri}; expected ${options.expectedCatalogUri}.`);
    }
  }
  if (matchingIndexes.length === 0) {
    addError(errors, 'CONTRACT_CATALOG_IMPORT_MISSING', '$.imports',
      `Contract must import loaded catalog ${catalog.id}@${catalog.catalogVersion}.`);
  } else if (matchingIndexes.length > 1) {
    addError(errors, 'CONTRACT_CATALOG_IMPORT_DUPLICATE', `$.imports[${matchingIndexes[1]}]`,
      `Catalog ${catalog.id} is imported more than once.`);
  }
}

function validateSchemaIdentity(
  contract: ResolvedContract,
  schema: JsonSchema,
  options: ValidateResolvedContractOptions,
  errors: ResolvedContractValidationError[],
): void {
  const loadedSchemaId = typeof schema.$id === 'string' ? schema.$id : undefined;
  const expectedSchemaId = options.expectedSchemaId ?? loadedSchemaId;
  if (contract.$schema !== undefined && expectedSchemaId !== undefined
    && !schemaReferenceMatches(contract.$schema, expectedSchemaId)) {
    addError(errors, 'CONTRACT_SCHEMA_ID', '$.$schema',
      `Contract requests schema ${contract.$schema}; loaded ${expectedSchemaId}.`);
  }
  if (options.expectedSchemaVersion !== undefined
    && contract.schemaVersion !== options.expectedSchemaVersion) {
    addError(errors, 'CONTRACT_SCHEMA_VERSION', '$.schemaVersion',
      `Contract requests schema version ${contract.schemaVersion}; expected ${options.expectedSchemaVersion}.`);
  }
}

function schemaReferenceMatches(requested: string, expected: string): boolean {
  if (requested === expected) return true;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(requested)) return false;
  let expectedName: string | undefined;
  try {
    expectedName = new URL(expected).pathname.split('/').at(-1);
  } catch {
    expectedName = expected.split('/').at(-1);
  }
  return expectedName !== undefined && requested === `./schemas/${expectedName}`;
}

function sortErrors(
  errors: ResolvedContractValidationError[],
): readonly ResolvedContractValidationError[] {
  return errors.sort((left, right) =>
    compareText(left.technicalPath, right.technicalPath) ||
    compareText(left.code, right.code) ||
    compareText(left.message, right.message));
}

/** Validate schema shape, catalog payloads, references, and both contract graphs. */
export function validateResolvedContract(
  input: unknown,
  options: ValidateResolvedContractOptions = {},
): ResolvedContractValidationResult {
  const catalog = options.catalog ?? loadComponentCatalog();
  const schema = options.schema ?? loadContractSchema();
  const validators = getValidatorBundle(schema, catalog);
  const errors: ResolvedContractValidationError[] = [];

  if (!validators.topLevel(input)) {
    addSchemaErrors(errors, 'CONTRACT_SCHEMA_INVALID', '$', validators.topLevel);
    return { errors: sortErrors(errors), ok: false, systemOrder: [] };
  }

  const contract = input as ResolvedContract;
  validateSchemaIdentity(contract, schema, options, errors);
  validateNamedRecordMap(contract.definitions.palettes, '$.definitions.palettes', errors);
  validateNamedRecordMap(contract.definitions.materials, '$.definitions.materials', errors);
  validateNamedRecordMap(contract.definitions.prototypes, '$.definitions.prototypes', errors);
  if (contract.definitions.profiles !== undefined) {
    validateNamedRecordMap(contract.definitions.profiles, '$.definitions.profiles', errors);
  }
  validateNamedRecordMap(contract.entities, '$.entities', errors);

  validateCatalogImport(contract, catalog, options, errors);
  validateComponents(contract, catalog, validators, errors);
  validatePrototypes(contract, catalog, validators, errors);
  validateFixtureComponentReferences(contract, errors);
  validateOwnership(contract, errors);
  validateRelationships(contract, catalog, validators, errors);
  validateValidationReferences(contract, errors);
  const systemOrder = validateSystems(contract, schema, catalog, errors);
  const sortedErrors = sortErrors(errors);
  return { errors: sortedErrors, ok: sortedErrors.length === 0, systemOrder };
}
