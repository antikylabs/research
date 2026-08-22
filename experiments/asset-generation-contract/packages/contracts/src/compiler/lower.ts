import type {
  JsonObject,
  JsonValue,
  ResolvedContract,
  ResolvedEntity,
  ResolvedPrototype,
  ResolvedRelationship,
} from '../ir/index.js';
import type {
  Meters,
  PopulationDefinition,
  RegionDefinition,
  SceneDefinition,
  ThingDefinition,
  VariationDirection,
  VisualDirection,
} from '../dsl/index.js';
import {
  getComponentMergePolicy,
  loadComponentCatalog,
  mergeComponentPayload,
} from '../catalog/index.js';

import { hashCanonical, sha256Bytes } from './canonical.js';
import type {
  SemanticBinding,
  SemanticDependencyEdge,
  SemanticGraphCollection,
} from './collect.js';
import {
  compareStableText,
  createDiagnostic,
  sortDiagnostics,
  type Diagnostic,
} from './diagnostics.js';
import type { ProfileExpansionResult } from './profiles.js';
import type { ResolvedReferenceImage } from './reference-images.js';

export interface Derivation {
  readonly outputId: string;
  readonly outputPath: string;
  readonly semanticPaths: readonly string[];
  readonly lowerer: { readonly id: string; readonly version: string };
  readonly profile?: { readonly id: string; readonly version: string };
  readonly overridePath?: string;
}

export interface SemanticLoweringResult {
  readonly contract: ResolvedContract;
  readonly derivations: readonly Derivation[];
  readonly diagnostics: readonly Diagnostic[];
  readonly semanticProjection: JsonObject;
}

const lowererVersion = '0.1.0';

function lowerer(id: string): Derivation['lowerer'] {
  return { id, version: lowererVersion };
}

function profileIdentity(profiles: ProfileExpansionResult): Derivation['profile'] | undefined {
  const selected = profiles.profiles[0];
  return selected === undefined ? undefined : { id: selected.id, version: selected.version };
}

function asRange(value: Meters | undefined): readonly [number, number] | undefined {
  if (value === undefined) return undefined;
  if (typeof value.value === 'number') return [value.value, value.value];
  return [value.value.min, value.value.max];
}

function unique(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function visualLanguage(visual: VisualDirection | undefined): JsonObject | undefined {
  if (visual === undefined) return undefined;
  return {
    primary: visual.language,
    ...(visual.density === undefined ? {} : { density: visual.density }),
    ...(visual.avoid === undefined ? {} : { antiStyles: unique(visual.avoid) }),
  };
}

function forbiddenForms(...groups: readonly (readonly string[] | undefined)[]): JsonObject | undefined {
  const items = unique(groups.flatMap((group) => group ?? []));
  return items.length === 0 ? undefined : { items };
}

function variationPayload(variation: VariationDirection | undefined): JsonObject | undefined {
  if (variation === undefined) return undefined;
  return {
    scope: 'per-instance',
    parameters: {
      'semantic-direction': {
        vary: variation.vary,
        ...(variation.preserve === undefined ? {} : { preserve: variation.preserve }),
        ...(variation.avoid === undefined ? {} : { avoid: variation.avoid }),
      },
    },
  };
}

function normalizeSemanticValue(
  value: unknown,
  graph: SemanticGraphCollection,
  topDeclaration = false,
): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Object.is(value, -0) ? 0 : value;
  if (Array.isArray(value)) return value.map((entry) => normalizeSemanticValue(entry, graph));
  if (typeof value !== 'object') {
    throw new TypeError(`Unsupported semantic value: ${typeof value}`);
  }

  const bound = graph.bindingFor(value);
  if (!topDeclaration && bound !== undefined) return { ref: bound.id };

  const kind = Reflect.get(value, 'kind');
  if (kind === 'reference-image') {
    return { path: String(Reflect.get(value, 'path')) };
  }
  if (kind === 'range') {
    return [Number(Reflect.get(value, 'min')), Number(Reflect.get(value, 'max'))];
  }
  if (kind === 'meters') {
    return normalizeSemanticValue(Reflect.get(value, 'value'), graph);
  }
  if (kind === 'project-profile') {
    return { id: String(Reflect.get(value, 'id')), version: String(Reflect.get(value, 'version')) };
  }
  if (kind === 'frames') {
    const sourceId = graph.idFor(Reflect.get(value, 'source'));
    const targetId = graph.idFor(Reflect.get(value, 'target'));
    return {
      kind: 'frames',
      ...(sourceId === undefined ? {} : { source: sourceId }),
      ...(targetId === undefined ? {} : { target: targetId }),
      ...(Reflect.get(value, 'options') === undefined
        ? {}
        : { options: normalizeSemanticValue(Reflect.get(value, 'options'), graph) }),
    };
  }

  const result: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).sort()) {
    const child = Reflect.get(value, key);
    if (child !== undefined) result[key] = normalizeSemanticValue(child, graph);
  }
  return result;
}

function semanticProjection(scene: SceneDefinition, graph: SemanticGraphCollection): JsonObject {
  const projection: Record<string, JsonValue> = {};
  for (const key of Object.keys(scene).sort()) {
    if (key === 'definitions' || key === 'cast' || key === 'composition' || key === 'profiles') continue;
    const child = Reflect.get(scene, key);
    if (child !== undefined) projection[key] = normalizeSemanticValue(child, graph);
  }

  projection.profiles = graph.profiles.map((profile) => ({ id: profile.id, version: profile.version }));
  projection.definitions = Object.fromEntries(graph.definitionBindings.map((binding) => [
    binding.key,
    normalizeSemanticValue(binding.declaration, graph, true),
  ]));
  projection.cast = Object.fromEntries(graph.castBindings.map((binding) => [
    binding.key,
    normalizeSemanticValue(binding.declaration, graph, true),
  ]));
  projection.composition = graph.relationships.map(({ declaration }) => normalizeSemanticValue(declaration, graph));
  projection.dependencies = graph.dependencyEdges.map((edge) => ({
    kind: edge.kind,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    semanticPath: edge.semanticPath,
    ...(edge.role === undefined ? {} : { role: edge.role }),
  }));
  return projection;
}

const allowedDeclarationKeys: Readonly<Record<string, ReadonlySet<string>>> = {
  scene: new Set([
    'kind', 'key', 'name', 'profiles', 'references', 'experience', 'visual', 'gameplay',
    'definitions', 'cast', 'composition', 'rules', 'acceptance',
  ]),
  thing: new Set([
    'kind', 'name', 'basedOn', 'parts', 'references', 'identity', 'shape', 'visual',
    'gameplay', 'variation', 'rules', 'avoid', 'technical',
  ]),
  region: new Set([
    'kind', 'name', 'references', 'purpose', 'shape', 'width', 'height', 'depth',
    'length', 'features', 'keep', 'avoid', 'rules', 'technical',
  ]),
  population: new Set([
    'kind', 'name', 'of', 'amount', 'placement', 'references', 'role', 'variation',
    'rules', 'technical',
  ]),
};

function diagnoseObjectFields(
  value: unknown,
  semanticPath: string,
  allowedKeys: readonly string[],
  contractId: string,
  diagnostics: Diagnostic[],
): void {
  if (value === undefined) return;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    diagnostics.push(createDiagnostic({
      code: 'DSL_INVALID_SEMANTIC_SHAPE',
      severity: 'error',
      message: `${semanticPath} must be a declarative object.`,
      semanticPath,
      contractId,
    }));
    return;
  }
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value).sort()) {
    if (allowed.has(key)) continue;
    diagnostics.push(createDiagnostic({
      code: 'DSL_UNSUPPORTED_SEMANTIC_FIELD',
      severity: 'error',
      message: `Goal 1 does not support nested semantic field ${JSON.stringify(key)}.`,
      semanticPath: `${semanticPath}.${key}`,
      contractId,
      hint: 'Move the intent to a supported field for this declaration kind.',
    }));
  }
}

function diagnoseUnsupportedValue(
  value: unknown,
  semanticPath: string,
  allowedValues: readonly string[],
  contractId: string,
  diagnostics: Diagnostic[],
): void {
  if (value === undefined || allowedValues.includes(String(value))) return;
  diagnostics.push(createDiagnostic({
    code: 'DSL_UNSUPPORTED_SEMANTIC_VALUE',
    severity: 'error',
    message: `${semanticPath} must be one of: ${allowedValues.join(', ')}.`,
    semanticPath,
    contractId,
  }));
}

function diagnoseReferenceUseFields(
  references: unknown,
  semanticPath: string,
  contractId: string,
  diagnostics: Diagnostic[],
): void {
  if (!Array.isArray(references)) return;
  for (const [index, use] of references.entries()) {
    const usePath = `${semanticPath}[${index}]`;
    diagnoseObjectFields(use, usePath, ['image', 'use'], contractId, diagnostics);
    if (typeof use === 'object' && use !== null && !Array.isArray(use)) {
      diagnoseObjectFields(Reflect.get(use, 'image'), `${usePath}.image`, ['kind', 'path'], contractId, diagnostics);
    }
  }
}

function diagnoseUnsupportedFields(graph: SemanticGraphCollection): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const binding of graph.bindings) {
    const allowed = allowedDeclarationKeys[binding.kind];
    if (allowed === undefined) continue;
    for (const key of Object.keys(binding.declaration).sort()) {
      if (allowed.has(key)) continue;
      diagnostics.push(createDiagnostic({
        code: 'DSL_UNSUPPORTED_SEMANTIC_FIELD',
        severity: 'error',
        message: `Goal 1 does not support semantic field ${JSON.stringify(key)} on ${binding.kind}.`,
        semanticPath: `${binding.semanticPath}.${key}`,
        contractId: binding.id,
        hint: 'Use a supported semantic field or a registered technical component override.',
      }));
    }

    const declaration = binding.declaration;
    const field = (key: string): unknown => Reflect.get(declaration, key);
    diagnoseReferenceUseFields(field('references'), `${binding.semanticPath}.references`, binding.id, diagnostics);
    diagnoseObjectFields(field('visual'), `${binding.semanticPath}.visual`,
      ['language', 'lighting', 'density', 'silhouettes', 'detail', 'avoid'], binding.id, diagnostics);
    const visual = field('visual');
    if (typeof visual === 'object' && visual !== null) {
      diagnoseUnsupportedValue(Reflect.get(visual, 'density'), `${binding.semanticPath}.visual.density`,
        ['low', 'medium', 'medium-high', 'high', 'very-high'], binding.id, diagnostics);
    }
    diagnoseObjectFields(field('rules'), `${binding.semanticPath}.rules`, ['must', 'avoid'], binding.id, diagnostics);
    diagnoseObjectFields(field('technical'), `${binding.semanticPath}.technical`, ['components'], binding.id, diagnostics);

    if (binding.kind === 'scene') {
      diagnoseObjectFields(field('experience'), '$.experience',
        ['fantasy', 'feel', 'firstRead', 'closerLook'], binding.id, diagnostics);
      diagnoseObjectFields(field('gameplay'), '$.gameplay',
        ['playAs', 'purpose', 'loop', 'playerCan', 'pace', 'spaceMust'], binding.id, diagnostics);
      diagnoseObjectFields(field('acceptance'), '$.acceptance', ['review', 'checks'], binding.id, diagnostics);
      const acceptance = field('acceptance');
      const checks = typeof acceptance === 'object' && acceptance !== null
        ? Reflect.get(acceptance, 'checks')
        : undefined;
      if (Array.isArray(checks)) {
        for (const [index, check] of checks.entries()) {
          const checkPath = `$.acceptance.checks[${index}]`;
          diagnoseObjectFields(check, checkPath,
            ['key', 'subject', 'measure', 'expected'], binding.id, diagnostics);
          if (typeof check === 'object' && check !== null) {
            diagnoseUnsupportedValue(Reflect.get(check, 'measure'), `${checkPath}.measure`,
              ['population count'], binding.id, diagnostics);
          }
        }
      }
      continue;
    }
    if (binding.kind === 'thing') {
      diagnoseObjectFields(field('shape'), `${binding.semanticPath}.shape`,
        ['form', 'width', 'height', 'depth', 'length'], binding.id, diagnostics);
      diagnoseObjectFields(field('gameplay'), `${binding.semanticPath}.gameplay`,
        ['playable', 'role', 'playerCan'], binding.id, diagnostics);
      diagnoseObjectFields(field('variation'), `${binding.semanticPath}.variation`,
        ['vary', 'preserve', 'avoid'], binding.id, diagnostics);
      continue;
    }
    if (binding.kind === 'population') {
      diagnoseObjectFields(field('placement'), `${binding.semanticPath}.placement`,
        ['around', 'pattern', 'spacing', 'leave', 'avoid'], binding.id, diagnostics);
      const placement = field('placement');
      if (typeof placement === 'object' && placement !== null) {
        diagnoseUnsupportedValue(Reflect.get(placement, 'pattern'), `${binding.semanticPath}.placement.pattern`,
          ['loose clusters'], binding.id, diagnostics);
      }
      diagnoseObjectFields(field('variation'), `${binding.semanticPath}.variation`,
        ['vary', 'preserve', 'avoid'], binding.id, diagnostics);
    }
  }
  for (const relationship of graph.relationships) {
    diagnoseObjectFields(relationship.declaration, relationship.semanticPath,
      ['kind', 'source', 'target', 'options'], relationship.id, diagnostics);
    diagnoseObjectFields(relationship.declaration.options, `${relationship.semanticPath}.options`,
      ['coverage', 'opening', 'avoid'], relationship.id, diagnostics);
  }
  return diagnostics;
}

function componentPath(ownerPath: string, type: string): string {
  return `${ownerPath}.components[${JSON.stringify(type)}]`;
}

interface ComponentOwner {
  readonly id: string;
  readonly path: string;
  readonly semanticPath: string;
  readonly components: Record<string, JsonObject>;
}

function addComponent(
  owner: ComponentOwner,
  type: string,
  payload: JsonObject | undefined,
  sourcePaths: string | readonly string[],
  lowererId: string,
  derivations: Derivation[],
  profile: Derivation['profile'],
): void {
  if (payload === undefined) return;
  owner.components[type] = payload;
  derivations.push({
    outputId: `${owner.id}#${type}`,
    outputPath: componentPath(owner.path, type),
    semanticPaths: typeof sourcePaths === 'string' ? [sourcePaths] : [...sourcePaths],
    lowerer: lowerer(lowererId),
    ...(profile === undefined ? {} : { profile }),
  });
}

function applyTechnicalOverrides(
  owner: ComponentOwner,
  technical: { readonly components: Readonly<Record<string, JsonObject>> } | undefined,
  sourcePath: string,
  derivations: Derivation[],
  diagnostics: Diagnostic[],
): void {
  if (technical === undefined) return;
  for (const type of Object.keys(technical.components).sort()) {
    const overridePath = `${sourcePath}.components[${JSON.stringify(type)}]`;
    if (owner.components[type] !== undefined) {
      diagnostics.push(createDiagnostic({
        code: 'DSL_TECHNICAL_OVERRIDE_CONFLICT',
        severity: 'error',
        message: `Technical override ${type} conflicts with a component derived from semantic direction.`,
        semanticPath: overridePath,
        contractId: owner.id,
        hint: 'Remove the override or express the intended change through the semantic field.',
      }));
      continue;
    }
    owner.components[type] = technical.components[type] ?? {};
    derivations.push({
      outputId: `${owner.id}#${type}`,
      outputPath: componentPath(owner.path, type),
      semanticPaths: [overridePath],
      lowerer: lowerer('technical-override'),
      overridePath,
    });
  }
}

function thingDescription(thing: ThingDefinition): JsonObject {
  const visualRead = [
    ...(thing.identity ?? []),
    ...(thing.shape?.form === undefined ? [] : [thing.shape.form]),
    ...(thing.gameplay === undefined
      ? []
      : [thing.gameplay.role, ...(thing.gameplay.playerCan ?? [])]),
  ];
  return {
    summary: thing.name,
    ...(visualRead.length === 0 ? {} : { visualRead }),
  };
}

function regionDescription(region: RegionDefinition): JsonObject {
  const visualRead = [
    ...(region.purpose ?? []),
    ...(region.shape === undefined ? [] : [region.shape]),
    ...(region.keep ?? []),
    ...(region.avoid ?? []),
  ];
  return { summary: region.name, ...(visualRead.length === 0 ? {} : { visualRead }) };
}

function populationDescription(population: PopulationDefinition): JsonObject {
  return {
    summary: population.name,
    ...(population.role === undefined ? {} : { visualRead: population.role }),
  };
}

function lowerThing(
  binding: SemanticBinding,
  profile: Derivation['profile'],
  derivations: Derivation[],
  diagnostics: Diagnostic[],
): ResolvedPrototype {
  const thing = binding.declaration as ThingDefinition;
  const path = `$.definitions.prototypes[${JSON.stringify(binding.id)}]`;
  const components: Record<string, JsonObject> = {};
  const owner: ComponentOwner = {
    id: binding.id,
    path,
    semanticPath: binding.semanticPath,
    components,
  };

  addComponent(owner, 'description.intent', thingDescription(thing), `${binding.semanticPath}.name`, 'thing-prototype', derivations, profile);
  addComponent(owner, 'style.visualLanguage', visualLanguage(thing.visual), `${binding.semanticPath}.visual`, 'visual-direction', derivations, profile);
  addComponent(
    owner,
    'style.forbiddenForms',
    forbiddenForms(thing.avoid, thing.rules?.avoid, thing.visual?.avoid, thing.variation?.avoid),
    [
      ...(thing.avoid?.length ? [`${binding.semanticPath}.avoid`] : []),
      ...(thing.rules?.avoid?.length ? [`${binding.semanticPath}.rules.avoid`] : []),
      ...(thing.visual?.avoid?.length ? [`${binding.semanticPath}.visual.avoid`] : []),
      ...(thing.variation?.avoid?.length ? [`${binding.semanticPath}.variation.avoid`] : []),
    ],
    'visual-direction',
    derivations,
    profile,
  );
  const heightM = asRange(thing.shape?.height);
  const lengthM = asRange(thing.shape?.length);
  addComponent(
    owner,
    'core.bounds',
    heightM === undefined && lengthM === undefined
      ? undefined
      : { ...(heightM === undefined ? {} : { heightM }), ...(lengthM === undefined ? {} : { lengthM }) },
    `${binding.semanticPath}.shape`,
    'thing-prototype',
    derivations,
    profile,
  );
  addComponent(
    owner,
    'variation.parameters',
    variationPayload(thing.variation),
    `${binding.semanticPath}.variation`,
    'thing-prototype',
    derivations,
    profile,
  );
  applyTechnicalOverrides(owner, thing.technical, `${binding.semanticPath}.technical`, derivations, diagnostics);

  derivations.push({
    outputId: binding.id,
    outputPath: path,
    semanticPaths: [binding.semanticPath],
    lowerer: lowerer('thing-prototype'),
    ...(profile === undefined ? {} : { profile }),
  });
  return {
    id: binding.id,
    kind: 'prototype',
    name: thing.name,
    ...(thing.basedOn === undefined ? {} : { extends: '' }),
    components,
  };
}

function lowerRegion(
  binding: SemanticBinding,
  rootId: string,
  profile: Derivation['profile'],
  derivations: Derivation[],
  diagnostics: Diagnostic[],
): ResolvedEntity {
  const region = binding.declaration as RegionDefinition;
  const path = `$.entities[${JSON.stringify(binding.id)}]`;
  const components: Record<string, JsonObject> = {};
  const owner: ComponentOwner = { id: binding.id, path, semanticPath: binding.semanticPath, components };
  addComponent(
    owner,
    'description.intent',
    regionDescription(region),
    [
      `${binding.semanticPath}.name`,
      ...(region.purpose?.length ? [`${binding.semanticPath}.purpose`] : []),
    ],
    'region',
    derivations,
    profile,
  );
  if ((region.purpose ?? []).length > 0) {
    addComponent(
      owner,
      'composition.negativeSpace',
      { purpose: region.purpose?.join('; ') ?? region.name },
      `${binding.semanticPath}.purpose`,
      'region',
      derivations,
      profile,
    );
  }
  applyTechnicalOverrides(owner, region.technical, `${binding.semanticPath}.technical`, derivations, diagnostics);
  derivations.push({
    outputId: binding.id,
    outputPath: path,
    semanticPaths: [binding.semanticPath],
    lowerer: lowerer('region'),
    ...(profile === undefined ? {} : { profile }),
  });
  return { id: binding.id, kind: 'region', name: region.name, parent: rootId, components };
}

function dependencyTarget(
  edges: readonly SemanticDependencyEdge[],
  sourceId: string,
  kind: SemanticDependencyEdge['kind'],
): string | undefined {
  return edges.find((edge) => edge.sourceId === sourceId && edge.kind === kind)?.targetId;
}

function lowerPopulation(
  binding: SemanticBinding,
  rootId: string,
  graph: SemanticGraphCollection,
  profile: Derivation['profile'],
  derivations: Derivation[],
  diagnostics: Diagnostic[],
): ResolvedEntity {
  const population = binding.declaration as PopulationDefinition;
  const path = `$.entities[${JSON.stringify(binding.id)}]`;
  const components: Record<string, JsonObject> = {};
  const owner: ComponentOwner = { id: binding.id, path, semanticPath: binding.semanticPath, components };
  const prototypeId = dependencyTarget(graph.dependencyEdges, binding.id, 'population-of');
  const aroundId = dependencyTarget(graph.dependencyEdges, binding.id, 'placement-around');

  addComponent(owner, 'description.intent', populationDescription(population), `${binding.semanticPath}.name`, 'population', derivations, profile);
  if (prototypeId !== undefined) {
    addComponent(
      owner,
      'population.prototypeMix',
      { entries: [{ prototype: prototypeId, weight: 1 }] },
      `${binding.semanticPath}.of`,
      'population',
      derivations,
      profile,
    );
  }
  addComponent(
    owner,
    'population.quantity',
    { count: [population.amount.min, population.amount.max], samplingScope: aroundId === undefined ? 'scene' : 'region' },
    `${binding.semanticPath}.amount`,
    'population',
    derivations,
    profile,
  );
  if (population.placement !== undefined) {
    const spacingM = asRange(population.placement.spacing);
    addComponent(
      owner,
      'population.distribution',
      {
        algorithm: population.placement.pattern === 'loose clusters'
          ? 'antikylabs.population.loose-clusters-v1'
          : 'antikylabs.population.around-region-v1',
        ...(aroundId === undefined ? {} : { preferredRegions: [aroundId] }),
        ...(spacingM === undefined ? {} : { spacingM }),
        ...(population.placement.leave === undefined ? {} : { leave: population.placement.leave }),
        ...(population.placement.avoid === undefined ? {} : { avoid: population.placement.avoid }),
      },
      `${binding.semanticPath}.placement`,
      'population',
      derivations,
      profile,
    );
  }
  if (population.variation !== undefined) {
    addComponent(
      owner,
      'population.variation',
      {
        stream: `population/${binding.id}`,
        vary: population.variation.vary,
        ...(population.variation.preserve === undefined ? {} : { preserve: population.variation.preserve }),
        ...(population.variation.avoid === undefined ? {} : { avoid: population.variation.avoid }),
      },
      `${binding.semanticPath}.variation`,
      'population',
      derivations,
      profile,
    );
  }
  if (population.role !== undefined) {
    addComponent(
      owner,
      'composition.populationRole',
      { roles: unique(population.role) },
      `${binding.semanticPath}.role`,
      'population',
      derivations,
      profile,
    );
  }
  addComponent(
    owner,
    'style.forbiddenForms',
    forbiddenForms(population.rules?.avoid, population.variation?.avoid),
    [
      ...(population.rules?.avoid?.length ? [`${binding.semanticPath}.rules.avoid`] : []),
      ...(population.variation?.avoid?.length ? [`${binding.semanticPath}.variation.avoid`] : []),
    ],
    'population',
    derivations,
    profile,
  );
  applyTechnicalOverrides(owner, population.technical, `${binding.semanticPath}.technical`, derivations, diagnostics);
  derivations.push({
    outputId: binding.id,
    outputPath: path,
    semanticPaths: [binding.semanticPath],
    lowerer: lowerer('population'),
    ...(profile === undefined ? {} : { profile }),
  });
  return { id: binding.id, kind: 'population', name: population.name, parent: rootId, components };
}

function resolvePrototypeInheritance(
  authored: Readonly<Record<string, ResolvedPrototype>>,
  graph: SemanticGraphCollection,
  derivations: Derivation[],
  diagnostics: Diagnostic[],
  profile: Derivation['profile'],
): Readonly<Record<string, ResolvedPrototype>> {
  const resolved = new Map<string, ResolvedPrototype>();
  const visiting = new Set<string>();
  const basedOn = new Map(
    graph.dependencyEdges
      .filter(({ kind }) => kind === 'based-on')
      .map((edge) => [edge.sourceId, edge.targetId] as const),
  );
  const catalog = loadComponentCatalog();

  const visit = (id: string): ResolvedPrototype => {
    const cached = resolved.get(id);
    if (cached !== undefined) return cached;
    const prototype = authored[id];
    if (prototype === undefined) throw new TypeError(`Missing authored prototype ${id}`);
    if (visiting.has(id)) return { ...prototype, components: { ...prototype.components } };
    visiting.add(id);

    const parentId = basedOn.get(id);
    const components: Record<string, JsonObject> = {};
    let parent: ResolvedPrototype | undefined;
    if (parentId !== undefined && authored[parentId] !== undefined) {
      parent = visit(parentId);
      for (const [type, payload] of Object.entries(parent.components)) {
        if (getComponentMergePolicy(type, catalog) !== 'non-inheritable') components[type] = payload;
      }
    }
    for (const type of Object.keys(prototype.components).sort()) {
      const childPayload = prototype.components[type] ?? {};
      const parentPayload = components[type];
      if (parentPayload === undefined) {
        components[type] = childPayload;
      } else {
        try {
          components[type] = mergeComponentPayload(type, parentPayload, childPayload, catalog);
        } catch (error: unknown) {
          diagnostics.push(createDiagnostic({
            code: 'DSL_PROTOTYPE_MERGE',
            severity: 'error',
            message: error instanceof Error ? error.message : String(error),
            contractId: id,
            technicalPath: `$.definitions.prototypes[${JSON.stringify(id)}].components[${JSON.stringify(type)}]`,
          }));
          components[type] = childPayload;
        }
      }
    }
    visiting.delete(id);
    const finalPrototype: ResolvedPrototype = {
      id: prototype.id,
      kind: 'prototype',
      name: prototype.name,
      ...(prototype.tags === undefined ? {} : { tags: prototype.tags }),
      components,
    };
    resolved.set(id, finalPrototype);

    const binding = graph.bindingsById.get(id);
    for (const type of Object.keys(components).sort()) {
      const outputId = `${id}#${type}`;
      const existingIndex = derivations.findIndex((entry) => entry.outputId === outputId);
      const inheritedPaths = parent?.components[type] === undefined || parentId === undefined
        ? []
        : derivations
          .filter((entry) => entry.outputId === `${parentId}#${type}`)
          .flatMap((entry) => entry.semanticPaths);
      if (existingIndex >= 0) {
        const existing = derivations[existingIndex];
        if (existing !== undefined && inheritedPaths.length > 0) {
          derivations[existingIndex] = {
            ...existing,
            semanticPaths: unique([...existing.semanticPaths, ...inheritedPaths]),
          };
        }
        continue;
      }
      derivations.push({
        outputId,
        outputPath: `$.definitions.prototypes[${JSON.stringify(id)}].components[${JSON.stringify(type)}]`,
        semanticPaths: unique([binding?.semanticPath ?? '$.definitions', ...inheritedPaths]),
        lowerer: lowerer('thing-specialization'),
        ...(profile === undefined ? {} : { profile }),
      });
    }
    return finalPrototype;
  };

  for (const id of Object.keys(authored).sort()) visit(id);
  return Object.fromEntries([...resolved.entries()].sort(([left], [right]) => compareStableText(left, right)));
}

function compareDerivations(left: Derivation, right: Derivation): number {
  return compareStableText(left.outputId, right.outputId)
    || compareStableText(left.outputPath, right.outputPath)
    || compareStableText(left.lowerer.id, right.lowerer.id)
    || compareStableText(left.semanticPaths.join('\u0000'), right.semanticPaths.join('\u0000'));
}

/** Lower the collected semantic graph without interpreting free prose as numeric policy. */
export function lowerSemanticScene(
  scene: SceneDefinition,
  graph: SemanticGraphCollection,
  profiles: ProfileExpansionResult,
  referenceImages: readonly ResolvedReferenceImage[],
): SemanticLoweringResult {
  const diagnostics: Diagnostic[] = [...diagnoseUnsupportedFields(graph)];
  const derivations: Derivation[] = [];
  const selectedProfile = profileIdentity(profiles);
  const selected = profiles.profiles[0]?.profile;
  const profileSourcePath = profiles.profiles[0]?.semanticPath ?? '$.profiles';
  if (selected === undefined) {
    diagnostics.push(createDiagnostic({
      code: 'DSL_PROFILE_REQUIRED',
      severity: 'error',
      message: 'Goal 1 requires one supported project profile to supply technical policy.',
      semanticPath: '$.profiles',
      hint: 'Select voxelDiorama.',
    }));
  }

  const projection = semanticProjection(scene, graph);
  const rootId = graph.root.id;
  const rootComponents: Record<string, JsonObject> = {};
  const rootOwner: ComponentOwner = {
    id: rootId,
    path: `$.entities[${JSON.stringify(rootId)}]`,
    semanticPath: '$',
    components: rootComponents,
  };
  const experience = scene.experience;
  addComponent(
    rootOwner,
    'description.intent',
    {
      summary: experience?.fantasy ?? scene.gameplay?.purpose ?? scene.name,
      ...(scene.gameplay?.purpose === undefined ? {} : { playerRead: scene.gameplay.purpose }),
      ...(experience?.feel === undefined ? {} : { emotionalTargets: experience.feel }),
      ...(experience?.firstRead === undefined ? {} : { mustReadAtFirstGlance: experience.firstRead }),
      ...(experience?.closerLook === undefined ? {} : { mustRewardCloserInspection: experience.closerLook }),
    },
    experience === undefined ? '$.name' : '$.experience',
    'experience-direction',
    derivations,
    selectedProfile,
  );
  addComponent(rootOwner, 'style.visualLanguage', visualLanguage(scene.visual), '$.visual', 'visual-direction', derivations, selectedProfile);
  addComponent(
    rootOwner,
    'style.forbiddenForms',
    forbiddenForms(scene.visual?.avoid, scene.rules?.avoid),
    [
      ...(scene.visual?.avoid?.length ? ['$.visual.avoid'] : []),
      ...(scene.rules?.avoid?.length ? ['$.rules.avoid'] : []),
    ],
    'visual-direction',
    derivations,
    selectedProfile,
  );
  addComponent(
    rootOwner,
    'validation.acceptance',
    {
      requiredSuites: ['suite.schema', 'suite.semantic'],
      maximumBlockingFailures: 0,
      humanApprovalRequired: true,
    },
    scene.acceptance === undefined ? profileSourcePath : ['$.acceptance', profileSourcePath],
    'acceptance',
    derivations,
    selectedProfile,
  );
  const metricTargets = Object.fromEntries((scene.acceptance?.checks ?? []).map((check) => [
    check.key,
    { min: check.expected.min, max: check.expected.max },
  ]));
  addComponent(
    rootOwner,
    'validation.metricTargets',
    Object.keys(metricTargets).length === 0 ? undefined : metricTargets,
    '$.acceptance.checks',
    'acceptance',
    derivations,
    selectedProfile,
  );
  derivations.push({
    outputId: rootId,
    outputPath: `$.entities[${JSON.stringify(rootId)}]`,
    semanticPaths: ['$'],
    lowerer: lowerer('scene-root'),
    ...(selectedProfile === undefined ? {} : { profile: selectedProfile }),
  });

  const authoredPrototypes: Record<string, ResolvedPrototype> = {};
  for (const binding of graph.definitionBindings) {
    authoredPrototypes[binding.id] = lowerThing(binding, selectedProfile, derivations, diagnostics);
  }
  const prototypes = resolvePrototypeInheritance(
    authoredPrototypes,
    graph,
    derivations,
    diagnostics,
    selectedProfile,
  );

  const rootEntity: ResolvedEntity = { id: rootId, kind: 'scene', name: scene.name, components: rootComponents };
  const entities: Record<string, ResolvedEntity> = { [rootId]: rootEntity };
  for (const binding of graph.castBindings) {
    entities[binding.id] = binding.kind === 'region'
      ? lowerRegion(binding, rootId, selectedProfile, derivations, diagnostics)
      : lowerPopulation(binding, rootId, graph, selectedProfile, derivations, diagnostics);
  }

  const relationships: ResolvedRelationship[] = graph.relationships.map((relationship, index) => {
    derivations.push({
      outputId: relationship.id,
      outputPath: `$.relationships[${index}]`,
      semanticPaths: [relationship.semanticPath],
      lowerer: lowerer('composition-frames'),
      ...(selectedProfile === undefined ? {} : { profile: selectedProfile }),
    });
    return {
      id: relationship.id,
      type: 'composition.frames',
      source: relationship.sourceId,
      target: relationship.targetId,
      required: true,
      description: 'Semantic frames relationship.',
      ...(relationship.declaration.options === undefined
        ? {}
        : { rule: { ...relationship.declaration.options } }),
    };
  });

  const systems = (selected?.systems ?? []).map((system) => ({
    ...system,
    reads: [...system.reads].sort(),
    writes: [...system.writes].sort(),
    dependsOn: [...system.dependsOn].sort(),
    ...(system.produces === undefined ? {} : { produces: [...system.produces].sort() }),
  }));
  for (const [index, system] of systems.entries()) {
    derivations.push({
      outputId: system.id,
      outputPath: `$.systems[${index}]`,
      semanticPaths: [profileSourcePath],
      lowerer: lowerer('voxel-diorama-profile'),
      ...(selectedProfile === undefined ? {} : { profile: selectedProfile }),
    });
  }

  const profileDefinitions = Object.fromEntries(profiles.profiles.map(({ id, version, selection, semanticPath }) => {
    const profileId = `profile.${id}`;
    derivations.push({
      outputId: profileId,
      outputPath: `$.definitions.profiles[${JSON.stringify(profileId)}]`,
      semanticPaths: [semanticPath],
      lowerer: lowerer('voxel-diorama-profile'),
      profile: { id, version },
    });
    return [profileId, { id: profileId, sourceProfile: id, version, selection }];
  }));

  const humanReview: Array<{
    id: string;
    question: string;
    semanticPath: string;
    ownerId: string;
  }> = (scene.acceptance?.review ?? []).map((question, index) => ({
    id: `review.semantic.${index + 1}`,
    question,
    semanticPath: `$.acceptance.review[${index}]`,
    ownerId: rootId,
  }));
  const appendReviews = (
    ownerId: string,
    path: string,
    values: readonly string[] | undefined,
    expectation: 'forbidden' | 'required',
  ): void => {
    for (const [index, value] of (values ?? []).entries()) {
      humanReview.push({
        id: `review.rule.${ownerId}.${expectation}.${index + 1}`,
        question: expectation === 'required'
          ? `Is this required outcome present: ${value}`
          : `Is this forbidden outcome absent: ${value}`,
        semanticPath: `${path}[${index}]`,
        ownerId,
      });
    }
  };
  appendReviews(rootId, '$.rules.must', scene.rules?.must, 'required');
  appendReviews(rootId, '$.rules.avoid', scene.rules?.avoid, 'forbidden');
  for (const binding of [...graph.definitionBindings, ...graph.castBindings]) {
    const declaration = binding.declaration as ThingDefinition | RegionDefinition | PopulationDefinition;
    appendReviews(binding.id, `${binding.semanticPath}.rules.must`, declaration.rules?.must, 'required');
    appendReviews(binding.id, `${binding.semanticPath}.rules.avoid`, declaration.rules?.avoid, 'forbidden');
    if (binding.kind === 'thing') {
      const thing = declaration as ThingDefinition;
      appendReviews(binding.id, `${binding.semanticPath}.avoid`, thing.avoid, 'forbidden');
    } else if (binding.kind === 'region') {
      const region = declaration as RegionDefinition;
      appendReviews(binding.id, `${binding.semanticPath}.keep`, region.keep, 'required');
      appendReviews(binding.id, `${binding.semanticPath}.avoid`, region.avoid, 'forbidden');
    }
  }
  const checks = (scene.acceptance?.checks ?? []).map((check, index) => ({
    id: `semantic.${check.key}`,
    assert: 'population-count-between-inclusive',
    selector: { sourceEntity: graph.idFor(check.subject) ?? 'unresolved' },
    value: [check.expected.min, check.expected.max],
    semanticPath: `$.acceptance.checks[${index}]`,
  }));

  const contract: ResolvedContract = {
    $schema: selected?.schema.contract.id,
    schemaVersion: selected?.schema.contract.version ?? '0.2.0',
    contract: {
      id: `antikylabs.scene.${scene.key}`,
      kind: 'generative-scene',
      name: scene.name,
      revision: 1,
      status: 'draft',
      intent: scene.experience?.fantasy ?? scene.gameplay?.purpose ?? scene.name,
      provenance: {
        compiler: { id: '@antiky/contracts/compiler', version: '0.1.0' },
        profiles: profiles.profiles.map(({ id, version, selection }) => ({ id, version, selection })),
        authoring: {
          semantic: projection,
          referenceImages: referenceImages.map((image) => ({
            path: image.path,
            sha256: image.sha256,
            uses: image.uses.map((use) => ({
              ownerId: use.ownerId,
              semanticPath: use.semanticPath,
              use: use.use,
            })),
          })),
        },
      },
    },
    imports: selected === undefined ? [] : [{
      id: selected.schema.catalog.id,
      uri: selected.schema.catalog.uri,
      version: selected.schema.catalog.version,
      optional: false,
    }],
    coordinateSystem: {
      handedness: selected?.coordinatePolicy.handedness ?? 'right',
      upAxis: selected?.coordinatePolicy.upAxis ?? 'y',
      horizontalAxes: selected?.coordinatePolicy.horizontalAxes ?? ['x', 'z'],
      worldUnit: selected?.coordinatePolicy.worldUnit ?? 'meter',
      voxelSizeM: selected?.coordinatePolicy.voxelSizeMeters ?? 0.1,
      originMeaning: selected?.coordinatePolicy.origin ?? 'scene-bounds-center-at-terrain-reference',
    },
    determinism: {
      rootSeed: `sha256:${sha256Bytes(`scene-key:${scene.key}`)}`,
      streamPolicy: selected?.seedPolicy.algorithm ?? 'sha256-hierarchical-v1',
      stableInputs: selected?.seedPolicy.streamKeyParts ?? [
        'root-seed', 'contract-id', 'entity-id', 'system-id', 'purpose-key',
      ],
      streams: {
        layout: 'layout/*',
        population: 'population/<population-id>',
        asset: 'asset/<derived-instance-id>/<purpose-key>',
      },
    },
    definitions: { palettes: {}, materials: {}, prototypes, profiles: profileDefinitions },
    entityTree: {
      entity: rootId,
      children: graph.castBindings.map((binding) => ({ entity: binding.id })),
    },
    entities,
    relationships,
    systems,
    validation: {
      suites: {
        'suite.schema': {
          id: 'suite.schema',
          kind: 'schema',
          blocking: true,
          rules: [
            { id: 'schema.top-level', assert: 'json-schema-valid' },
            { id: 'schema.ownership', assert: 'ownership-complete-and-acyclic' },
            { id: 'schema.references', assert: 'all-contract-references-resolve' },
            { id: 'schema.system-dag', assert: 'system-dependency-graph-is-acyclic' },
          ],
        },
        'suite.semantic': { id: 'suite.semantic', kind: 'semantic', blocking: true, rules: checks },
      },
      acceptanceViews: [],
      humanReview,
      promotionPolicy: {
        requireAllBlockingSuitesPass: true,
        requireHumanReview: true,
        requireDeterministicRerunMatch: true,
      },
    },
    outputs: {
      canonicalContract: 'resolved-contract.json',
      requiredRenderPasses: selected?.render.requiredPasses ?? [],
      profilePolicyHash: profiles.policy === undefined ? null : hashCanonical(profiles.policy),
    },
  };

  const withProfile = selectedProfile === undefined ? {} : { profile: selectedProfile };
  derivations.push(
    {
      outputId: contract.contract.id,
      outputPath: '$.contract',
      semanticPaths: [
        '$',
        '$.name',
        ...(scene.experience === undefined ? [] : ['$.experience']),
        ...(scene.experience === undefined && scene.gameplay?.purpose !== undefined
          ? ['$.gameplay.purpose']
          : []),
      ],
      lowerer: lowerer('scene-root'),
      ...withProfile,
    },
    {
      outputId: `${rootId}#semantic-projection`,
      outputPath: '$.contract.provenance.authoring.semantic',
      semanticPaths: graph.bindings.map(({ semanticPath }) => semanticPath),
      lowerer: lowerer('semantic-preservation'),
      ...withProfile,
    },
    {
      outputId: 'policy.coordinate-system',
      outputPath: '$.coordinateSystem',
      semanticPaths: [profileSourcePath],
      lowerer: lowerer('voxel-diorama-profile'),
      ...withProfile,
    },
    {
      outputId: 'policy.catalog-import',
      outputPath: '$.imports[0]',
      semanticPaths: [profileSourcePath],
      lowerer: lowerer('voxel-diorama-profile'),
      ...withProfile,
    },
    {
      outputId: 'policy.determinism',
      outputPath: '$.determinism',
      semanticPaths: [profileSourcePath, '$.key'],
      lowerer: lowerer('voxel-diorama-profile'),
      ...withProfile,
    },
    {
      outputId: 'suite.schema',
      outputPath: '$.validation.suites["suite.schema"]',
      semanticPaths: [profileSourcePath],
      lowerer: lowerer('voxel-diorama-profile'),
      ...withProfile,
    },
    {
      outputId: 'suite.semantic',
      outputPath: '$.validation.suites["suite.semantic"]',
      semanticPaths: [profileSourcePath, ...(scene.acceptance === undefined ? [] : ['$.acceptance'])],
      lowerer: lowerer('acceptance'),
      ...withProfile,
    },
    {
      outputId: 'policy.validation-promotion',
      outputPath: '$.validation.promotionPolicy',
      semanticPaths: [profileSourcePath, ...(scene.acceptance === undefined ? [] : ['$.acceptance'])],
      lowerer: lowerer('voxel-diorama-profile'),
      ...withProfile,
    },
    {
      outputId: 'policy.outputs',
      outputPath: '$.outputs',
      semanticPaths: [profileSourcePath],
      lowerer: lowerer('voxel-diorama-profile'),
      ...withProfile,
    },
  );
  for (const binding of [graph.root, ...graph.castBindings]) {
    derivations.push({
      outputId: `${binding.id}#ownership`,
      outputPath: binding.scope === 'root'
        ? '$.entityTree'
        : `$.entityTree.children[${graph.castBindings.findIndex(({ id }) => id === binding.id)}]`,
      semanticPaths: [binding.semanticPath],
      lowerer: lowerer('scene-root'),
      ...withProfile,
    });
  }
  for (const [index, check] of (scene.acceptance?.checks ?? []).entries()) {
    derivations.push({
      outputId: `semantic.${check.key}`,
      outputPath: `$.validation.suites["suite.semantic"].rules[${index}]`,
      semanticPaths: [`$.acceptance.checks[${index}]`],
      lowerer: lowerer('acceptance'),
      ...withProfile,
    });
  }
  for (const [index, review] of humanReview.entries()) {
    derivations.push({
      outputId: review.id,
      outputPath: `$.validation.humanReview[${index}]`,
      semanticPaths: [review.semanticPath],
      lowerer: lowerer('acceptance'),
      ...withProfile,
    });
  }
  for (const image of referenceImages) {
    derivations.push({
      outputId: `reference-image.${image.sha256}`,
      outputPath: '$.contract.provenance.authoring.referenceImages',
      semanticPaths: image.uses.map(({ semanticPath }) => semanticPath),
      lowerer: lowerer('reference-image-use'),
    });
  }

  return {
    contract,
    derivations: derivations.sort(compareDerivations),
    diagnostics: sortDiagnostics(diagnostics),
    semanticProjection: projection,
  };
}
