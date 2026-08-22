import type { Definition, SceneDefinition } from '../dsl/index.js';

import {
  createDiagnostic,
  diagnosticCodes,
  sortDiagnostics,
  type Diagnostic,
} from './diagnostics.js';

export interface SerializationGuardResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly valid: boolean;
}

type ContainerRole =
  | 'ordinary'
  | 'thing-parts'
  | 'region-features'
  | 'population-placement'
  | 'scene-gameplay'
  | 'scene-acceptance'
  | 'acceptance-checks'
  | 'acceptance-check';

function appendPath(path: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function kindOf(value: object): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, 'kind');
  return descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
}

function isDefinitionValue(value: unknown): value is Definition {
  if (typeof value !== 'object' || value === null) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const kind = kindOf(value);
    return kind === 'thing' || kind === 'region' || kind === 'population' || kind === 'scene';
  } catch {
    return false;
  }
}

function isTypedDirectReference(role: ContainerRole, key: string, value: unknown): boolean {
  if (!isDefinitionValue(value)) return false;
  return role === 'thing-parts'
    || role === 'region-features'
    || (role === 'population-placement' && key === 'around')
    || (role === 'scene-gameplay' && key === 'playAs')
    || (role === 'acceptance-check' && key === 'subject');
}

function childRole(parentKind: unknown, role: ContainerRole, key: string): ContainerRole {
  if (parentKind === 'thing' && key === 'parts') return 'thing-parts';
  if (parentKind === 'region' && key === 'features') return 'region-features';
  if (parentKind === 'population' && key === 'placement') return 'population-placement';
  if (parentKind === 'scene' && key === 'gameplay') return 'scene-gameplay';
  if (parentKind === 'scene' && key === 'acceptance') return 'scene-acceptance';
  if (role === 'scene-acceptance' && key === 'checks') return 'acceptance-checks';
  if (role === 'acceptance-checks' && /^\d+$/.test(key)) return 'acceptance-check';
  return 'ordinary';
}

/**
 * Check the JavaScript declaration graph without mistaking declared reference edges for object
 * cycles. Accessors are reported from descriptors and are never invoked.
 */
export function guardDeclarationSerializable(scene: SceneDefinition): SerializationGuardResult {
  const diagnostics: Diagnostic[] = [];
  const active = new WeakMap<object, string>();

  const report = (code: string, message: string, semanticPath: string, related?: readonly { semanticPath: string; message?: string }[]): void => {
    diagnostics.push(createDiagnostic({ code, severity: 'error', message, semanticPath, related }));
  };

  const visit = (value: unknown, path: string, role: ContainerRole): void => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) report(diagnosticCodes.nonFiniteNumber, 'Declaration numbers must be finite.', path);
      return;
    }
    if (typeof value === 'undefined') {
      report(diagnosticCodes.undefined, 'Undefined cannot be normalized to canonical JSON.', path);
      return;
    }
    if (typeof value === 'function') {
      report(diagnosticCodes.function, 'Runtime functions are not declaration data.', path);
      return;
    }
    if (typeof value === 'symbol') {
      report(diagnosticCodes.symbol, 'Symbols cannot be normalized to canonical JSON.', path);
      return;
    }
    if (typeof value === 'bigint') {
      report(diagnosticCodes.bigint, 'Bigints cannot be normalized to canonical JSON.', path);
      return;
    }

    let prototype: object | null;
    let descriptors: PropertyDescriptorMap;
    let keys: readonly PropertyKey[];
    try {
      prototype = Object.getPrototypeOf(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
      keys = Reflect.ownKeys(value);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      report(diagnosticCodes.inspection, `Declaration value could not be inspected safely: ${detail}`, path);
      return;
    }

    const array = Array.isArray(value);
    if ((!array && prototype !== Object.prototype && prototype !== null) || (array && prototype !== Array.prototype)) {
      report(
        diagnosticCodes.unsupportedPrototype,
        'Unsupported declaration prototype; use plain objects and arrays.',
        path,
      );
      return;
    }

    const ancestorPath = active.get(value);
    if (ancestorPath !== undefined) {
      report(diagnosticCodes.cycle, 'Arbitrary object cycles cannot be normalized.', path, [
        { semanticPath: ancestorPath, message: 'The same object is already active here.' },
      ]);
      return;
    }
    active.set(value, path);

    const parentKind = kindOf(value);
    if (array) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          report(
            diagnosticCodes.arrayHole,
            'Sparse array slots would be silently normalized to null.',
            `${path}[${index}]`,
          );
        }
      }
    }
    for (const key of keys) {
      if (typeof key === 'symbol') {
        report(diagnosticCodes.symbol, 'Symbol-keyed declaration properties are unsupported.', `${path}[symbol]`);
        continue;
      }
      const stringKey = String(key);
      if (array && stringKey === 'length') continue;
      const childPath = array && /^\d+$/.test(stringKey) ? `${path}[${stringKey}]` : appendPath(path, stringKey);
      if (array && !/^\d+$/.test(stringKey)) {
        report(
          diagnosticCodes.arrayProperty,
          'Named array properties would be silently omitted from canonical JSON.',
          childPath,
        );
        continue;
      }
      const descriptor = descriptors[key];
      if (descriptor === undefined) continue;
      if (!('value' in descriptor)) {
        report(diagnosticCodes.accessor, 'Accessors are not allowed in declaration data.', childPath);
        continue;
      }
      if (!descriptor.enumerable) {
        report(diagnosticCodes.nonEnumerable, 'Non-enumerable declaration properties would be silently omitted.', childPath);
        continue;
      }
      if (isTypedDirectReference(role, stringKey, descriptor.value)
        || (parentKind === 'thing' && stringKey === 'basedOn' && isDefinitionValue(descriptor.value))
        || (parentKind === 'population' && stringKey === 'of' && isDefinitionValue(descriptor.value))
        || (parentKind === 'frames' && (stringKey === 'source' || stringKey === 'target')
          && isDefinitionValue(descriptor.value))) {
        continue;
      }

      const nextRole = childRole(parentKind, role, stringKey);
      visit(descriptor.value, childPath, nextRole);
    }
    active.delete(value);
  };

  visit(scene, '$', 'ordinary');
  const ordered = sortDiagnostics(diagnostics);
  return { diagnostics: ordered, valid: ordered.length === 0 };
}
