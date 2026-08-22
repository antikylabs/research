import type {
  Definition,
  FramesRelationship,
  PopulationDefinition,
  ReferenceImage,
  ReferenceUse,
  RegionDefinition,
  SceneDefinition,
  ThingDefinition,
} from '../dsl/index.js';
import type { ProjectProfile } from '../dsl/types.js';

import {
  createDiagnostic,
  compareStableText,
  diagnosticCodes,
  sortDiagnostics,
  type Diagnostic,
  type DiagnosticLocation,
} from './diagnostics.js';
import { guardDeclarationSerializable } from './serialization.js';

export type SemanticDeclarationKind = Definition['kind'];
export type SemanticBindingScope = 'root' | 'definitions' | 'cast';

export interface SemanticBinding {
  readonly scope: SemanticBindingScope;
  readonly key: string;
  readonly id: string;
  readonly kind: SemanticDeclarationKind;
  readonly semanticPath: string;
  readonly declaration: Definition;
}

export type DependencyEdgeKind =
  | 'based-on'
  | 'part'
  | 'feature'
  | 'population-of'
  | 'placement-around'
  | 'play-as'
  | 'acceptance-subject'
  | 'frames-source'
  | 'frames-target';

export interface SemanticDependencyEdge {
  readonly kind: DependencyEdgeKind;
  readonly sourceId: string;
  readonly targetId: string;
  readonly semanticPath: string;
  readonly sourceSemanticPath: string;
  readonly targetSemanticPath: string;
  readonly role?: string;
}

export interface CollectedRelationship {
  readonly id: string;
  readonly kind: 'frames';
  readonly semanticPath: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly declaration: FramesRelationship;
}

/** Compatible with the reference-image resolver without importing compiler implementation values. */
export interface CollectedReferenceImageUse {
  readonly image: ReferenceImage;
  readonly ownerId: string;
  readonly semanticPath: string;
  readonly use: string;
}

export interface SemanticGraphCollection {
  readonly root: SemanticBinding;
  readonly bindings: readonly SemanticBinding[];
  readonly definitionBindings: readonly SemanticBinding[];
  readonly castBindings: readonly SemanticBinding[];
  readonly bindingsById: ReadonlyMap<string, SemanticBinding>;
  readonly dependencyEdges: readonly SemanticDependencyEdge[];
  readonly relationships: readonly CollectedRelationship[];
  readonly referenceImages: readonly CollectedReferenceImageUse[];
  readonly profiles: readonly ProjectProfile[];
  readonly diagnostics: readonly Diagnostic[];
  readonly bindingFor: (value: unknown) => SemanticBinding | undefined;
  readonly idFor: (value: unknown) => string | undefined;
}

const scopedKeyPattern = /^[a-z][a-zA-Z0-9-]*$/;

function appendPath(path: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function valueKind(value: unknown): SemanticDeclarationKind | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const kind = Reflect.get(value, 'kind');
  return kind === 'scene' || kind === 'thing' || kind === 'region' || kind === 'population' ? kind : undefined;
}

function objectKey(value: unknown): object | undefined {
  return (typeof value === 'object' && value !== null) || typeof value === 'function' ? value : undefined;
}

function idForBinding(rootKey: string, scope: SemanticBindingScope, key: string, kind: SemanticDeclarationKind): string {
  if (scope === 'root') return `scene.${rootKey}`;
  if (scope === 'definitions') return `prototype.${rootKey}.${key}`;
  return `${kind}.${rootKey}.${key}`;
}

function compareBindings(left: SemanticBinding, right: SemanticBinding): number {
  const scopeOrder: Readonly<Record<SemanticBindingScope, number>> = { root: 0, definitions: 1, cast: 2 };
  return scopeOrder[left.scope] - scopeOrder[right.scope]
    || (left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
}

function compareEdges(left: SemanticDependencyEdge, right: SemanticDependencyEdge): number {
  return compareStableText(left.sourceId, right.sourceId)
    || compareStableText(left.targetId, right.targetId)
    || compareStableText(left.kind, right.kind)
    || compareStableText(left.semanticPath, right.semanticPath)
    || compareStableText(left.role ?? '', right.role ?? '');
}

function compareRelationships(left: CollectedRelationship, right: CollectedRelationship): number {
  return compareStableText(left.id, right.id) || compareStableText(left.semanticPath, right.semanticPath);
}

function emptyLookup(): (value: unknown) => undefined {
  return () => undefined;
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reportInvalidShape(
  semanticPath: string,
  expectation: string,
  report: (diagnostic: Diagnostic) => void,
  contractId?: string,
): void {
  report({
    code: diagnosticCodes.semanticShape,
    severity: 'error',
    message: `${semanticPath} must be ${expectation}.`,
    semanticPath,
    ...(contractId === undefined ? {} : { contractId }),
  });
}

function expectRecord(
  value: unknown,
  semanticPath: string,
  report: (diagnostic: Diagnostic) => void,
  contractId?: string,
): value is Readonly<Record<string, unknown>> {
  if (isPlainRecord(value)) return true;
  reportInvalidShape(semanticPath, 'a declarative object', report, contractId);
  return false;
}

function expectString(
  value: unknown,
  semanticPath: string,
  report: (diagnostic: Diagnostic) => void,
  contractId?: string,
): value is string {
  if (typeof value === 'string') return true;
  reportInvalidShape(semanticPath, 'a string', report, contractId);
  return false;
}

function expectBoolean(
  value: unknown,
  semanticPath: string,
  report: (diagnostic: Diagnostic) => void,
  contractId?: string,
): value is boolean {
  if (typeof value === 'boolean') return true;
  reportInvalidShape(semanticPath, 'a boolean', report, contractId);
  return false;
}

function validateOptionalString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  semanticPath: string,
  report: (diagnostic: Diagnostic) => void,
  contractId?: string,
): void {
  const value = record[key];
  if (value !== undefined) expectString(value, `${semanticPath}.${key}`, report, contractId);
}

function validateStringList(
  value: unknown,
  semanticPath: string,
  report: (diagnostic: Diagnostic) => void,
  contractId?: string,
): void {
  if (!Array.isArray(value)) {
    reportInvalidShape(semanticPath, 'an array of strings', report, contractId);
    return;
  }
  value.forEach((item, index) => expectString(item, `${semanticPath}[${index}]`, report, contractId));
}

function validateOptionalStringList(
  record: Readonly<Record<string, unknown>>,
  key: string,
  semanticPath: string,
  report: (diagnostic: Diagnostic) => void,
  contractId?: string,
): void {
  const value = record[key];
  if (value !== undefined) validateStringList(value, `${semanticPath}.${key}`, report, contractId);
}

function validateReferenceUses(
  value: unknown,
  semanticPath: string,
  report: (diagnostic: Diagnostic) => void,
  contractId: string,
): void {
  if (!Array.isArray(value)) {
    reportInvalidShape(semanticPath, 'an array of reference uses', report, contractId);
    return;
  }
  value.forEach((use, index) => {
    const usePath = `${semanticPath}[${index}]`;
    if (!expectRecord(use, usePath, report, contractId)) return;
    expectString(use.use, `${usePath}.use`, report, contractId);
    if (!expectRecord(use.image, `${usePath}.image`, report, contractId)) return;
    expectString(use.image.path, `${usePath}.image.path`, report, contractId);
  });
}

function validateRules(
  value: unknown,
  semanticPath: string,
  report: (diagnostic: Diagnostic) => void,
  contractId: string,
): void {
  if (!expectRecord(value, semanticPath, report, contractId)) return;
  validateOptionalStringList(value, 'must', semanticPath, report, contractId);
  validateOptionalStringList(value, 'avoid', semanticPath, report, contractId);
}

function validateVisual(
  value: unknown,
  semanticPath: string,
  report: (diagnostic: Diagnostic) => void,
  contractId: string,
): void {
  if (!expectRecord(value, semanticPath, report, contractId)) return;
  expectString(value.language, `${semanticPath}.language`, report, contractId);
  for (const key of ['lighting', 'density', 'silhouettes', 'detail']) {
    validateOptionalString(value, key, semanticPath, report, contractId);
  }
  validateOptionalStringList(value, 'avoid', semanticPath, report, contractId);
}

function validateVariation(
  value: unknown,
  semanticPath: string,
  report: (diagnostic: Diagnostic) => void,
  contractId: string,
): void {
  if (!expectRecord(value, semanticPath, report, contractId)) return;
  validateStringList(value.vary, `${semanticPath}.vary`, report, contractId);
  validateOptionalStringList(value, 'preserve', semanticPath, report, contractId);
  validateOptionalStringList(value, 'avoid', semanticPath, report, contractId);
}

function validateTechnicalOverride(
  value: unknown,
  semanticPath: string,
  report: (diagnostic: Diagnostic) => void,
  contractId: string,
): void {
  if (!expectRecord(value, semanticPath, report, contractId)) return;
  if (!expectRecord(value.components, `${semanticPath}.components`, report, contractId)) return;
  for (const [componentType, payload] of Object.entries(value.components)) {
    expectRecord(payload, appendPath(`${semanticPath}.components`, componentType), report, contractId);
  }
}

function validateThingShape(
  value: unknown,
  semanticPath: string,
  report: (diagnostic: Diagnostic) => void,
  contractId: string,
): void {
  if (!expectRecord(value, semanticPath, report, contractId)) return;
  validateOptionalString(value, 'form', semanticPath, report, contractId);
  for (const key of ['width', 'height', 'depth', 'length']) {
    const dimension = value[key];
    if (dimension !== undefined) expectRecord(dimension, `${semanticPath}.${key}`, report, contractId);
  }
}

function validateCommonDeclarationShape(
  declaration: Readonly<Record<string, unknown>>,
  semanticPath: string,
  contractId: string,
  report: (diagnostic: Diagnostic) => void,
): void {
  expectString(declaration.name, `${semanticPath}.name`, report, contractId);
  if (declaration.references !== undefined) {
    validateReferenceUses(declaration.references, `${semanticPath}.references`, report, contractId);
  }
  if (declaration.rules !== undefined) {
    validateRules(declaration.rules, `${semanticPath}.rules`, report, contractId);
  }
  if (declaration.technical !== undefined) {
    validateTechnicalOverride(declaration.technical, `${semanticPath}.technical`, report, contractId);
  }
}

function validateSemanticShapes(
  scene: SceneDefinition,
  bindings: readonly SemanticBinding[],
  report: (diagnostic: Diagnostic) => void,
): number {
  let failures = 0;
  const trackedReport = (diagnostic: Diagnostic): void => {
    failures += 1;
    report(diagnostic);
  };
  const root = scene as unknown;
  if (!expectRecord(root, '$', trackedReport, 'scene.invalid')) return failures;
  if (root.kind !== 'scene') {
    reportInvalidShape('$.kind', 'the literal "scene"', trackedReport, `scene.${String(root.key)}`);
  }
  expectString(root.key, '$.key', trackedReport, `scene.${String(root.key)}`);
  expectString(root.name, '$.name', trackedReport, `scene.${String(root.key)}`);
  if (root.profiles !== undefined && !Array.isArray(root.profiles)) {
    reportInvalidShape('$.profiles', 'an array of installed project profiles', trackedReport);
  }
  if (root.references !== undefined) {
    validateReferenceUses(root.references, '$.references', trackedReport, `scene.${String(root.key)}`);
  }
  if (root.experience !== undefined && expectRecord(root.experience, '$.experience', trackedReport)) {
    expectString(root.experience.fantasy, '$.experience.fantasy', trackedReport);
    for (const key of ['feel', 'firstRead', 'closerLook']) {
      validateOptionalStringList(root.experience, key, '$.experience', trackedReport);
    }
  }
  if (root.visual !== undefined) validateVisual(root.visual, '$.visual', trackedReport, `scene.${String(root.key)}`);
  if (root.gameplay !== undefined && expectRecord(root.gameplay, '$.gameplay', trackedReport)) {
    expectString(root.gameplay.purpose, '$.gameplay.purpose', trackedReport);
    for (const key of ['loop', 'playerCan', 'spaceMust']) {
      validateOptionalStringList(root.gameplay, key, '$.gameplay', trackedReport);
    }
    validateOptionalString(root.gameplay, 'pace', '$.gameplay', trackedReport);
  }
  if (root.rules !== undefined) validateRules(root.rules, '$.rules', trackedReport, `scene.${String(root.key)}`);
  if (root.composition !== undefined) {
    if (!Array.isArray(root.composition)) {
      reportInvalidShape('$.composition', 'an array of frames relationships', trackedReport);
    } else {
      root.composition.forEach((relationship, index) => {
        const path = `$.composition[${index}]`;
        if (!expectRecord(relationship, path, trackedReport)) return;
        if (relationship.options !== undefined
          && expectRecord(relationship.options, `${path}.options`, trackedReport)) {
          for (const key of ['coverage', 'opening', 'avoid']) {
            validateOptionalString(relationship.options, key, `${path}.options`, trackedReport);
          }
        }
      });
    }
  }
  if (root.acceptance !== undefined && expectRecord(root.acceptance, '$.acceptance', trackedReport)) {
    validateOptionalStringList(root.acceptance, 'review', '$.acceptance', trackedReport);
    const checks = root.acceptance.checks;
    if (checks !== undefined) {
      if (!Array.isArray(checks)) {
        reportInvalidShape('$.acceptance.checks', 'an array of acceptance checks', trackedReport);
      } else {
        checks.forEach((check, index) => {
          const path = `$.acceptance.checks[${index}]`;
          if (!expectRecord(check, path, trackedReport)) return;
          expectString(check.key, `${path}.key`, trackedReport);
          expectString(check.measure, `${path}.measure`, trackedReport);
          expectRecord(check.expected, `${path}.expected`, trackedReport);
        });
      }
    }
  }

  for (const binding of bindings) {
    if (binding.scope === 'root') continue;
    const declaration = binding.declaration as unknown;
    if (!expectRecord(declaration, binding.semanticPath, trackedReport, binding.id)) continue;
    validateCommonDeclarationShape(declaration, binding.semanticPath, binding.id, trackedReport);
    if (binding.kind === 'thing') {
      if (declaration.parts !== undefined) {
        expectRecord(declaration.parts, `${binding.semanticPath}.parts`, trackedReport, binding.id);
      }
      if (declaration.identity !== undefined) {
        validateStringList(declaration.identity, `${binding.semanticPath}.identity`, trackedReport, binding.id);
      }
      if (declaration.shape !== undefined) {
        validateThingShape(declaration.shape, `${binding.semanticPath}.shape`, trackedReport, binding.id);
      }
      if (declaration.visual !== undefined) {
        validateVisual(declaration.visual, `${binding.semanticPath}.visual`, trackedReport, binding.id);
      }
      if (declaration.gameplay !== undefined
        && expectRecord(declaration.gameplay, `${binding.semanticPath}.gameplay`, trackedReport, binding.id)) {
        expectString(declaration.gameplay.role, `${binding.semanticPath}.gameplay.role`, trackedReport, binding.id);
        if (declaration.gameplay.playable !== undefined) {
          expectBoolean(
            declaration.gameplay.playable,
            `${binding.semanticPath}.gameplay.playable`,
            trackedReport,
            binding.id,
          );
        }
        validateOptionalStringList(
          declaration.gameplay,
          'playerCan',
          `${binding.semanticPath}.gameplay`,
          trackedReport,
          binding.id,
        );
      }
      if (declaration.variation !== undefined) {
        validateVariation(declaration.variation, `${binding.semanticPath}.variation`, trackedReport, binding.id);
      }
      if (declaration.avoid !== undefined) {
        validateStringList(declaration.avoid, `${binding.semanticPath}.avoid`, trackedReport, binding.id);
      }
      continue;
    }
    if (binding.kind === 'region') {
      validateOptionalStringList(declaration, 'purpose', binding.semanticPath, trackedReport, binding.id);
      validateOptionalString(declaration, 'shape', binding.semanticPath, trackedReport, binding.id);
      if (declaration.features !== undefined) {
        expectRecord(declaration.features, `${binding.semanticPath}.features`, trackedReport, binding.id);
      }
      for (const key of ['keep', 'avoid']) {
        validateOptionalStringList(declaration, key, binding.semanticPath, trackedReport, binding.id);
      }
      for (const key of ['width', 'height', 'depth', 'length']) {
        const dimension = declaration[key];
        if (dimension !== undefined) {
          expectRecord(dimension, `${binding.semanticPath}.${key}`, trackedReport, binding.id);
        }
      }
      continue;
    }
    expectRecord(declaration.amount, `${binding.semanticPath}.amount`, trackedReport, binding.id);
    validateOptionalStringList(declaration, 'role', binding.semanticPath, trackedReport, binding.id);
    if (declaration.placement !== undefined
      && expectRecord(declaration.placement, `${binding.semanticPath}.placement`, trackedReport, binding.id)) {
      validateOptionalString(declaration.placement, 'pattern', `${binding.semanticPath}.placement`, trackedReport,
        binding.id);
      for (const key of ['leave', 'avoid']) {
        validateOptionalStringList(
          declaration.placement,
          key,
          `${binding.semanticPath}.placement`,
          trackedReport,
          binding.id,
        );
      }
      if (declaration.placement.spacing !== undefined) {
        expectRecord(
          declaration.placement.spacing,
          `${binding.semanticPath}.placement.spacing`,
          trackedReport,
          binding.id,
        );
      }
    }
    if (declaration.variation !== undefined) {
      validateVariation(declaration.variation, `${binding.semanticPath}.variation`, trackedReport, binding.id);
    }
  }
  return failures;
}

function validateAcceptanceKeys(
  scene: SceneDefinition,
  report: (diagnostic: Diagnostic) => void,
): void {
  const firstPathByKey = new Map<string, string>();
  for (const [index, check] of (scene.acceptance?.checks ?? []).entries()) {
    const semanticPath = `$.acceptance.checks[${index}].key`;
    if (!scopedKeyPattern.test(check.key)) {
      report({
        code: diagnosticCodes.invalidKey,
        severity: 'error',
        message: `Acceptance key ${JSON.stringify(check.key)} must match ${scopedKeyPattern}.`,
        semanticPath,
        contractId: `semantic.${check.key}`,
      });
    }
    const firstPath = firstPathByKey.get(check.key);
    if (firstPath === undefined) {
      firstPathByKey.set(check.key, semanticPath);
      continue;
    }
    report({
      code: diagnosticCodes.idCollision,
      severity: 'error',
      message: `Acceptance checks collide on exact rule ID semantic.${check.key}.`,
      semanticPath,
      contractId: `semantic.${check.key}`,
      related: [{ semanticPath: firstPath, message: 'The first acceptance key is here.' }],
    });
  }
}

function validateRange(
  value: unknown,
  semanticPath: string,
  report: (diagnostic: Diagnostic) => void,
): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.get(value, 'kind') !== 'range') {
    report({
      code: diagnosticCodes.rangeInvalid,
      severity: 'error',
      message: 'Numeric ranges must be constructed with between(min, max).',
      semanticPath,
    });
    return;
  }
  for (const key of Object.keys(value).sort()) {
    if (key === 'kind' || key === 'min' || key === 'max') continue;
    report({
      code: 'DSL_UNSUPPORTED_SEMANTIC_FIELD',
      severity: 'error',
      message: `Numeric ranges do not support field ${JSON.stringify(key)}.`,
      semanticPath: appendPath(semanticPath, key),
    });
  }
  const min = Reflect.get(value, 'min');
  const max = Reflect.get(value, 'max');
  if (typeof min !== 'number' || !Number.isFinite(min)
    || typeof max !== 'number' || !Number.isFinite(max)) {
    report({
      code: diagnosticCodes.rangeInvalid,
      severity: 'error',
      message: 'Numeric range endpoints must be finite numbers.',
      semanticPath,
    });
    return;
  }
  if (min > max) {
    report({
      code: diagnosticCodes.rangeInvalid,
      severity: 'error',
      message: `Numeric range minimum ${min} must not exceed maximum ${max}.`,
      semanticPath,
    });
  }
}

function validateMeters(
  value: unknown,
  semanticPath: string,
  report: (diagnostic: Diagnostic) => void,
): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.get(value, 'kind') !== 'meters') {
    report({
      code: diagnosticCodes.unitInvalid,
      severity: 'error',
      message: 'Distance values must be constructed with meters(value) or meters(min, max).',
      semanticPath,
    });
    return;
  }
  for (const key of Object.keys(value).sort()) {
    if (key === 'kind' || key === 'value') continue;
    report({
      code: 'DSL_UNSUPPORTED_SEMANTIC_FIELD',
      severity: 'error',
      message: `Distance values do not support field ${JSON.stringify(key)}.`,
      semanticPath: appendPath(semanticPath, key),
    });
  }
  const distance = Reflect.get(value, 'value');
  if (typeof distance === 'number') {
    if (!Number.isFinite(distance)) {
      report({
        code: diagnosticCodes.unitInvalid,
        severity: 'error',
        message: 'Distance values must be finite numbers.',
        semanticPath,
      });
    }
    return;
  }
  validateRange(distance, `${semanticPath}.value`, report);
}

function validateSemanticQuantities(
  scene: SceneDefinition,
  definitions: readonly SemanticBinding[],
  cast: readonly SemanticBinding[],
  report: (diagnostic: Diagnostic) => void,
): void {
  const dimensions = ['width', 'height', 'depth', 'length'] as const;
  for (const binding of definitions) {
    const thing = binding.declaration as ThingDefinition;
    for (const dimension of dimensions) {
      const value = thing.shape?.[dimension];
      if (value !== undefined) validateMeters(value, `${binding.semanticPath}.shape.${dimension}`, report);
    }
  }
  for (const binding of cast) {
    if (binding.kind === 'region') {
      const region = binding.declaration as RegionDefinition;
      for (const dimension of dimensions) {
        const value = region[dimension];
        if (value !== undefined) validateMeters(value, `${binding.semanticPath}.${dimension}`, report);
      }
      continue;
    }
    const population = binding.declaration as PopulationDefinition;
    validateRange(population.amount, `${binding.semanticPath}.amount`, report);
    if (population.placement?.spacing !== undefined) {
      validateMeters(population.placement.spacing, `${binding.semanticPath}.placement.spacing`, report);
    }
  }
  for (const [index, check] of (scene.acceptance?.checks ?? []).entries()) {
    validateRange(check.expected, `$.acceptance.checks[${index}].expected`, report);
  }
}

/** Collect exact keyed identity and resolve every Goal 1 object-reference edge. */
export function collectSemanticGraph(scene: SceneDefinition): SemanticGraphCollection {
  const serialization = guardDeclarationSerializable(scene);
  const diagnostics: Diagnostic[] = [...serialization.diagnostics];
  const keyDescriptor = serialization.valid ? Object.getOwnPropertyDescriptor(scene, 'key') : undefined;
  const rootKey = keyDescriptor !== undefined && 'value' in keyDescriptor
    ? String(keyDescriptor.value)
    : 'invalid';
  const root: SemanticBinding = {
    scope: 'root',
    key: rootKey,
    id: `scene.${rootKey}`,
    kind: 'scene',
    semanticPath: '$',
    declaration: scene,
  };

  if (!serialization.valid) {
    return {
      root,
      bindings: [root],
      definitionBindings: [],
      castBindings: [],
      bindingsById: new Map([[root.id, root]]),
      dependencyEdges: [],
      relationships: [],
      referenceImages: [],
      profiles: [],
      diagnostics: sortDiagnostics(diagnostics),
      bindingFor: emptyLookup(),
      idFor: emptyLookup(),
    };
  }

  const byObject = new WeakMap<object, SemanticBinding>();
  const byId = new Map<string, SemanticBinding>();
  const bindings: SemanticBinding[] = [root];
  byObject.set(scene, root);
  byId.set(root.id, root);

  const report = (diagnostic: Diagnostic): void => {
    diagnostics.push(createDiagnostic(diagnostic));
  };

  if (!scopedKeyPattern.test(rootKey)) {
    report({
      code: diagnosticCodes.invalidKey,
      severity: 'error',
      message: `Scene key ${JSON.stringify(rootKey)} must match ${scopedKeyPattern}.`,
      semanticPath: '$.key',
    });
  }

  const bindRecord = (
    record: unknown,
    scope: 'definitions' | 'cast',
    allowedKinds: readonly SemanticDeclarationKind[],
  ): void => {
    if (record === undefined) return;
    const recordPath = `$.${scope}`;
    if (typeof record !== 'object' || record === null || Array.isArray(record)) {
      report({
        code: diagnosticCodes.bindingRecord,
        severity: 'error',
        message: `${scope} must be a keyed plain-object record.`,
        semanticPath: recordPath,
      });
      return;
    }

    for (const key of Object.keys(record).sort()) {
      const semanticPath = appendPath(recordPath, key);
      if (!scopedKeyPattern.test(key)) {
        report({
          code: diagnosticCodes.invalidKey,
          severity: 'error',
          message: `Scoped key ${JSON.stringify(key)} must match ${scopedKeyPattern}.`,
          semanticPath,
        });
      }

      const declaration: unknown = Reflect.get(record, key);
      const kind = valueKind(declaration);
      if (kind === undefined || !allowedKinds.includes(kind)) {
        report({
          code: diagnosticCodes.bindingKind,
          severity: 'error',
          message: `${scope} key ${JSON.stringify(key)} requires ${allowedKinds.join(' or ')}, received ${kind ?? typeof declaration}.`,
          semanticPath,
        });
        continue;
      }

      const binding: SemanticBinding = {
        scope,
        key,
        id: idForBinding(rootKey, scope, key, kind),
        kind,
        semanticPath,
        declaration: declaration as Definition,
      };
      bindings.push(binding);

      const declarationObject = objectKey(declaration);
      if (declarationObject !== undefined) {
        const priorBinding = byObject.get(declarationObject);
        if (priorBinding !== undefined) {
          report({
            code: diagnosticCodes.duplicateBinding,
            severity: 'error',
            message: `One declaration object cannot own both ${priorBinding.id} and ${binding.id}.`,
            semanticPath,
            contractId: binding.id,
            related: [{
              semanticPath: priorBinding.semanticPath,
              contractId: priorBinding.id,
              message: 'The first keyed binding is here.',
            }],
          });
        } else {
          byObject.set(declarationObject, binding);
        }
      }

      const priorId = byId.get(binding.id);
      if (priorId !== undefined) {
        report({
          code: diagnosticCodes.idCollision,
          severity: 'error',
          message: `Scoped bindings collide on exact ID ${binding.id}.`,
          semanticPath,
          contractId: binding.id,
          related: [{ semanticPath: priorId.semanticPath, contractId: priorId.id }],
        });
      } else {
        byId.set(binding.id, binding);
      }
    }
  };

  bindRecord(scene.definitions, 'definitions', ['thing']);
  bindRecord(scene.cast, 'cast', ['region', 'population']);
  bindings.sort(compareBindings);
  const definitionBindings = bindings.filter(({ scope }) => scope === 'definitions');
  const castBindings = bindings.filter(({ scope }) => scope === 'cast');
  const shapeFailures = validateSemanticShapes(scene, bindings, report);
  if (shapeFailures > 0) {
    return {
      root,
      bindings,
      definitionBindings,
      castBindings,
      bindingsById: byId,
      dependencyEdges: [],
      relationships: [],
      referenceImages: [],
      profiles: [],
      diagnostics: sortDiagnostics(diagnostics),
      bindingFor: emptyLookup(),
      idFor: emptyLookup(),
    };
  }
  validateAcceptanceKeys(scene, report);
  validateSemanticQuantities(scene, definitionBindings, castBindings, report);

  const bindingFor = (value: unknown): SemanticBinding | undefined => {
    const key = objectKey(value);
    return key === undefined ? undefined : byObject.get(key);
  };
  const idFor = (value: unknown): string | undefined => bindingFor(value)?.id;

  const edges: SemanticDependencyEdge[] = [];
  const resolveReference = (
    source: SemanticBinding,
    target: unknown,
    path: string,
    edgeKind: DependencyEdgeKind,
    expectedKinds: readonly SemanticDeclarationKind[],
    expectedScope: SemanticBindingScope,
    role?: string,
    sceneLevel = false,
  ): SemanticBinding | undefined => {
    const actualKind = valueKind(target);
    if (actualKind === undefined || !expectedKinds.includes(actualKind)) {
      report({
        code: diagnosticCodes.referenceKind,
        severity: 'error',
        message: `${edgeKind} requires ${expectedKinds.join(' or ')}, received ${actualKind ?? typeof target}.`,
        semanticPath: path,
        contractId: source.id,
      });
      return undefined;
    }
    const targetBinding = bindingFor(target);
    if (targetBinding === undefined) {
      report({
        code: sceneLevel ? diagnosticCodes.referenceOutsideScene : diagnosticCodes.referenceUnbound,
        severity: 'error',
        message: sceneLevel
          ? `Referenced ${actualKind} is outside this scene's keyed declaration graph.`
          : `Referenced ${actualKind} must be bound exactly once in scene.${expectedScope}.`,
        semanticPath: path,
        contractId: source.id,
      });
      return undefined;
    }
    if (targetBinding.scope !== expectedScope) {
      report({
        code: diagnosticCodes.referenceOutsideScene,
        severity: 'error',
        message: `${edgeKind} target ${targetBinding.id} is bound in ${targetBinding.scope}, not ${expectedScope}.`,
        semanticPath: path,
        contractId: source.id,
        related: [{ semanticPath: targetBinding.semanticPath, contractId: targetBinding.id }],
      });
      return undefined;
    }
    edges.push({
      kind: edgeKind,
      sourceId: source.id,
      targetId: targetBinding.id,
      semanticPath: path,
      sourceSemanticPath: source.semanticPath,
      targetSemanticPath: targetBinding.semanticPath,
      ...(role === undefined ? {} : { role }),
    });
    return targetBinding;
  };

  for (const binding of definitionBindings) {
    const thing = binding.declaration as ThingDefinition;
    if (thing.basedOn !== undefined) {
      resolveReference(binding, thing.basedOn, `${binding.semanticPath}.basedOn`, 'based-on', ['thing'], 'definitions');
    }
    if (thing.parts !== undefined) {
      for (const role of Object.keys(thing.parts).sort()) {
        resolveReference(
          binding,
          thing.parts[role],
          appendPath(`${binding.semanticPath}.parts`, role),
          'part',
          ['thing'],
          'definitions',
          role,
        );
      }
    }
  }

  for (const binding of castBindings) {
    if (binding.kind === 'region') {
      const region = binding.declaration as RegionDefinition;
      if (region.features !== undefined) {
        for (const role of Object.keys(region.features).sort()) {
          resolveReference(
            binding,
            region.features[role],
            appendPath(`${binding.semanticPath}.features`, role),
            'feature',
            ['thing'],
            'definitions',
            role,
          );
        }
      }
      continue;
    }

    const population = binding.declaration as PopulationDefinition;
    resolveReference(binding, population.of, `${binding.semanticPath}.of`, 'population-of', ['thing'], 'definitions');
    if (population.placement !== undefined) {
      resolveReference(
        binding,
        population.placement.around,
        `${binding.semanticPath}.placement.around`,
        'placement-around',
        ['region'],
        'cast',
      );
    }
  }

  if (scene.gameplay?.playAs !== undefined) {
    resolveReference(root, scene.gameplay.playAs, '$.gameplay.playAs', 'play-as', ['population'], 'cast', undefined, true);
  }
  for (const [index, check] of (scene.acceptance?.checks ?? []).entries()) {
    resolveReference(
      root,
      check.subject,
      `$.acceptance.checks[${index}].subject`,
      'acceptance-subject',
      ['population'],
      'cast',
      undefined,
      true,
    );
  }

  const relationships: CollectedRelationship[] = [];
  const relationshipIds = new Map<string, CollectedRelationship>();
  for (const [index, relationship] of (scene.composition ?? []).entries()) {
    const semanticPath = `$.composition[${index}]`;
    if (valueKind(relationship) !== undefined || relationship.kind !== 'frames') {
      report({
        code: diagnosticCodes.referenceKind,
        severity: 'error',
        message: `Goal 1 composition accepts frames relationships, received ${String(relationship.kind)}.`,
        semanticPath,
      });
      continue;
    }
    const source = resolveReference(root, relationship.source, `${semanticPath}.source`, 'frames-source', ['population'], 'cast', undefined, true);
    const target = resolveReference(root, relationship.target, `${semanticPath}.target`, 'frames-target', ['region'], 'cast', undefined, true);
    if (source === undefined || target === undefined) continue;
    const id = `rel.${rootKey}.frames.${source.key}.${target.key}`;
    const collected: CollectedRelationship = {
      id,
      kind: 'frames',
      semanticPath,
      sourceId: source.id,
      targetId: target.id,
      declaration: relationship,
    };
    const prior = relationshipIds.get(id);
    if (prior !== undefined) {
      report({
        code: diagnosticCodes.relationshipIdCollision,
        severity: 'error',
        message: `Two frames relationships produce exact ID ${id}.`,
        semanticPath,
        contractId: id,
        related: [{ semanticPath: prior.semanticPath, contractId: prior.id }],
      });
    } else {
      relationshipIds.set(id, collected);
      relationships.push(collected);
    }
  }

  edges.sort(compareEdges);
  relationships.sort(compareRelationships);
  diagnoseDefinitionCycles(definitionBindings, edges, report);
  diagnoseUnreachableDefinitions(definitionBindings, castBindings, edges, report);

  const referenceImages: CollectedReferenceImageUse[] = [];
  const collectReferenceUses = (binding: SemanticBinding, uses: readonly ReferenceUse[] | undefined): void => {
    for (const [index, use] of (uses ?? []).entries()) {
      const semanticPath = `${binding.semanticPath}.references[${index}]`;
      if (typeof use !== 'object' || use === null || use.image?.kind !== 'reference-image') {
        report({
          code: diagnosticCodes.referenceKind,
          severity: 'error',
          message: 'Reference use requires a referenceImage(...) value.',
          semanticPath: `${semanticPath}.image`,
          contractId: binding.id,
        });
        continue;
      }
      if (typeof use.use !== 'string' || use.use.length === 0) {
        report({
          code: diagnosticCodes.referenceKind,
          severity: 'error',
          message: 'Reference use must state a non-empty intended use.',
          semanticPath: `${semanticPath}.use`,
          contractId: binding.id,
        });
        continue;
      }
      referenceImages.push({ image: use.image, ownerId: binding.id, semanticPath, use: use.use });
    }
  };

  collectReferenceUses(root, scene.references);
  for (const binding of [...definitionBindings, ...castBindings]) {
    const declaration = binding.declaration as ThingDefinition | RegionDefinition | PopulationDefinition;
    collectReferenceUses(binding, declaration.references);
  }
  referenceImages.sort((left, right) => compareStableText(left.semanticPath, right.semanticPath)
    || compareStableText(left.ownerId, right.ownerId)
    || compareStableText(left.use, right.use));

  return {
    root,
    bindings,
    definitionBindings,
    castBindings,
    bindingsById: byId,
    dependencyEdges: edges,
    relationships,
    referenceImages,
    profiles: [...(scene.profiles ?? [])],
    diagnostics: sortDiagnostics(diagnostics),
    bindingFor,
    idFor,
  };
}

function diagnoseUnreachableDefinitions(
  definitions: readonly SemanticBinding[],
  cast: readonly SemanticBinding[],
  edges: readonly SemanticDependencyEdge[],
  report: (diagnostic: Diagnostic) => void,
): void {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = outgoing.get(edge.sourceId) ?? [];
    targets.push(edge.targetId);
    outgoing.set(edge.sourceId, targets);
  }
  for (const targets of outgoing.values()) targets.sort();

  const reachable = new Set<string>();
  const pending = cast.map(({ id }) => id).sort().reverse();
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || reachable.has(id)) continue;
    reachable.add(id);
    for (const target of outgoing.get(id) ?? []) pending.push(target);
  }

  for (const binding of definitions) {
    if (reachable.has(binding.id)) continue;
    report({
      code: diagnosticCodes.unreachable,
      severity: 'error',
      message: `Definition ${binding.id} is disconnected from every placed cast declaration.`,
      semanticPath: binding.semanticPath,
      contractId: binding.id,
      hint: 'Reference it from a reachable definition, region feature, or population.of, or remove the binding.',
    });
  }
}

function diagnoseDefinitionCycles(
  definitions: readonly SemanticBinding[],
  edges: readonly SemanticDependencyEdge[],
  report: (diagnostic: Diagnostic) => void,
): void {
  const definitionIds = new Set(definitions.map(({ id }) => id));
  const graphEdges = edges.filter(({ kind, sourceId, targetId }) =>
    (kind === 'based-on' || kind === 'part') && definitionIds.has(sourceId) && definitionIds.has(targetId));
  const adjacency = new Map<string, string[]>();
  for (const { sourceId, targetId } of graphEdges) {
    const targets = adjacency.get(sourceId) ?? [];
    if (!targets.includes(targetId)) targets.push(targetId);
    adjacency.set(sourceId, targets);
  }
  for (const targets of adjacency.values()) targets.sort();

  let nextIndex = 0;
  const index = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const connect = (id: string): void => {
    index.set(id, nextIndex);
    lowLink.set(id, nextIndex);
    nextIndex += 1;
    stack.push(id);
    onStack.add(id);

    for (const target of adjacency.get(id) ?? []) {
      if (!index.has(target)) {
        connect(target);
        lowLink.set(id, Math.min(lowLink.get(id) ?? 0, lowLink.get(target) ?? 0));
      } else if (onStack.has(target)) {
        lowLink.set(id, Math.min(lowLink.get(id) ?? 0, index.get(target) ?? 0));
      }
    }

    if (lowLink.get(id) !== index.get(id)) return;
    const component: string[] = [];
    while (stack.length > 0) {
      const member = stack.pop();
      if (member === undefined) break;
      onStack.delete(member);
      component.push(member);
      if (member === id) break;
    }
    component.sort();
    components.push(component);
  };

  for (const id of [...definitionIds].sort()) if (!index.has(id)) connect(id);
  components.sort((left, right) => compareStableText(left[0] ?? '', right[0] ?? ''));

  for (const component of components) {
    const members = new Set(component);
    const internalEdges = graphEdges
      .filter(({ sourceId, targetId }) => members.has(sourceId) && members.has(targetId))
      .sort(compareEdges);
    if (component.length === 1 && !internalEdges.some(({ sourceId, targetId }) => sourceId === targetId)) continue;
    const first = internalEdges[0];
    const related: DiagnosticLocation[] = internalEdges.map((edge) => ({
      semanticPath: edge.semanticPath,
      contractId: edge.sourceId,
      message: `${edge.kind} -> ${edge.targetId}`,
    }));
    report({
      code: diagnosticCodes.definitionCycle,
      severity: 'error',
      message: `Combined basedOn/part dependency cycle among: ${component.join(', ')}.`,
      semanticPath: first?.semanticPath,
      contractId: first?.sourceId,
      related,
    });
  }
}
