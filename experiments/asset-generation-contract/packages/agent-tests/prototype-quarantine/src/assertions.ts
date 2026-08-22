import { readFile } from 'node:fs/promises';

import type { JsonValue, ResolvedContract } from '@antiky/contracts/ir';

import { jsonValue, record, stableJson } from './json.js';
import { resolveInside } from './files.js';
import type { CheckResult, ExpectedReference, TaskManifest } from './types.js';

function check(id: string, label: string, passed: boolean, details: string): CheckResult {
  return { id, label, passed, details };
}

function sameJson(left: unknown, right: JsonValue): boolean {
  try {
    return stableJson(jsonValue(left, 'actual value')) === stableJson(right);
  } catch {
    return false;
  }
}

function exactList(
  id: string,
  label: string,
  actual: readonly string[],
  expected: readonly string[],
): CheckResult {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  const passed = stableJson(actualSorted) === stableJson(expectedSorted);
  return check(
    id,
    label,
    passed,
    passed
      ? `Exact set matched (${actual.length}).`
      : `Expected set ${JSON.stringify(expectedSorted)}; received ${JSON.stringify(actualSorted)}.`,
  );
}

interface PointerResult {
  readonly found: boolean;
  readonly value?: unknown;
}

function pointerSegments(pointer: string): readonly string[] {
  return pointer.slice(1).split('/').map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
}

export function resolvePointer(root: unknown, pointer: string): PointerResult {
  let current = root;
  for (const segment of pointerSegments(pointer)) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(segment)) return { found: false };
      const index = Number(segment);
      if (index >= current.length) return { found: false };
      current = current[index];
      continue;
    }
    if (current === null || typeof current !== 'object') return { found: false };
    const object = current as Readonly<Record<string, unknown>>;
    if (!(segment in object)) return { found: false };
    current = object[segment];
  }
  return { found: true, value: current };
}

function deletePointer(root: unknown, pointer: string): boolean {
  const segments = pointerSegments(pointer);
  const property = segments.at(-1);
  if (property === undefined) return false;
  let parent = root;
  for (const segment of segments.slice(0, -1)) {
    const next = resolvePointer(parent, `/${segment.replaceAll('~', '~0').replaceAll('/', '~1')}`);
    if (!next.found) return false;
    parent = next.value;
  }
  if (Array.isArray(parent)) {
    if (!/^(0|[1-9]\d*)$/.test(property)) return false;
    const index = Number(property);
    if (index >= parent.length) return false;
    delete parent[index];
    return true;
  }
  if (parent === null || typeof parent !== 'object') return false;
  const mutable = parent as Record<string, unknown>;
  if (!(property in mutable)) return false;
  delete mutable[property];
  return true;
}

function pointerSegment(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function collectDifferences(
  expected: unknown,
  actual: unknown,
  path: string,
  differences: string[],
): void {
  if (differences.length >= 8 || Object.is(expected, actual)) return;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      differences.push(`${path || '/'} length: expected ${expected.length}, received ${actual.length}`);
    }
    const length = Math.min(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) {
      collectDifferences(expected[index], actual[index], `${path}/${index}`, differences);
    }
    return;
  }
  if (
    expected !== null
    && actual !== null
    && typeof expected === 'object'
    && typeof actual === 'object'
    && !Array.isArray(expected)
    && !Array.isArray(actual)
  ) {
    const expectedRecord = expected as Readonly<Record<string, unknown>>;
    const actualRecord = actual as Readonly<Record<string, unknown>>;
    const keys = [...new Set([...Object.keys(expectedRecord), ...Object.keys(actualRecord)])].sort();
    for (const key of keys) {
      const childPath = `${path}/${pointerSegment(key)}`;
      if (!(key in expectedRecord)) differences.push(`${childPath}: unexpected value`);
      else if (!(key in actualRecord)) differences.push(`${childPath}: missing value`);
      else collectDifferences(expectedRecord[key], actualRecord[key], childPath, differences);
      if (differences.length >= 8) return;
    }
    return;
  }
  differences.push(`${path || '/'}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

function parseReferences(buildManifest: string): readonly ExpectedReference[] {
  const root = record(JSON.parse(buildManifest) as unknown, 'build manifest');
  const inputs = record(root.inputs, 'build manifest inputs');
  if (!Array.isArray(inputs.referenceImages)) throw new TypeError('build manifest referenceImages must be an array.');
  return inputs.referenceImages.map((value, index) => {
    const item = record(value, `build manifest referenceImages[${index}]`);
    if (typeof item.path !== 'string' || typeof item.sha256 !== 'string') {
      throw new TypeError(`build manifest referenceImages[${index}] is malformed.`);
    }
    return { path: item.path, sha256: item.sha256 };
  });
}

function graphChecks(
  contract: ResolvedContract,
  task: TaskManifest,
  buildManifest: string,
): readonly CheckResult[] {
  const expected = task.assertions;
  const relationships = contract.relationships.map((relationship) => jsonValue(relationship, 'relationship'));
  const expectedRelationships = expected.relationships.map((relationship) => jsonValue(relationship, 'expected relationship'));
  const result = [
    exactList('graph:entities', 'Exact entity ids', Object.keys(contract.entities), expected.entityIds),
    exactList(
      'graph:prototypes',
      'Exact prototype ids',
      Object.keys(contract.definitions.prototypes),
      expected.prototypeIds,
    ),
    exactList('graph:systems', 'Exact system ids', contract.systems.map(({ id }) => id), expected.systemIds),
    check(
      'graph:relationships',
      'Exact relationships',
      stableJson(relationships) === stableJson(expectedRelationships),
      stableJson(relationships) === stableJson(expectedRelationships)
        ? `Exact relationship list matched (${relationships.length}).`
        : `Expected ${JSON.stringify(expected.relationships)}; received ${JSON.stringify(contract.relationships)}.`,
    ),
  ];
  try {
    const references = parseReferences(buildManifest);
    const actualJson = jsonValue(references, 'compiled references');
    const expectedJson = jsonValue(expected.references, 'expected references');
    result.push(check(
      'graph:references',
      'Exact reference images',
      stableJson(actualJson) === stableJson(expectedJson),
      stableJson(actualJson) === stableJson(expectedJson)
        ? `Exact reference path/hash list matched (${references.length}).`
        : `Expected ${JSON.stringify(expected.references)}; received ${JSON.stringify(references)}.`,
    ));
  } catch (error: unknown) {
    result.push(check(
      'graph:references',
      'Exact reference images',
      false,
      error instanceof Error ? error.message : String(error),
    ));
  }
  return result;
}

function resolvedChecks(contract: ResolvedContract, task: TaskManifest): readonly CheckResult[] {
  const checks: CheckResult[] = [];
  for (const assertion of task.assertions.resolvedValues) {
    const actual = resolvePointer(contract, assertion.path);
    const passed = actual.found && sameJson(actual.value, assertion.value);
    checks.push(check(
      `resolved:${assertion.id}`,
      `Resolved value ${assertion.path}`,
      passed,
      passed
        ? `Matched ${JSON.stringify(assertion.value)}.`
        : `Expected ${JSON.stringify(assertion.value)}; received ${actual.found ? JSON.stringify(actual.value) : 'missing path'}.`,
    ));
  }
  for (const assertion of task.assertions.arrayLengths) {
    const actual = resolvePointer(contract, assertion.path);
    const passed = actual.found && Array.isArray(actual.value) && actual.value.length === assertion.length;
    checks.push(check(
      `resolved:${assertion.id}`,
      `Array length ${assertion.path}`,
      passed,
      passed
        ? `Matched length ${assertion.length}.`
        : `Expected length ${assertion.length}; received ${Array.isArray(actual.value) ? actual.value.length : 'non-array or missing'}.`,
    ));
  }
  for (const assertion of task.assertions.forbiddenKeys) {
    const root = resolvePointer(contract, assertion.path);
    const matches: string[] = [];
    if (root.found) collectKeyPaths(root.value, assertion.key, assertion.path, matches);
    const passed = root.found && matches.length === 0;
    checks.push(check(
      `resolved:${assertion.id}`,
      `No ${JSON.stringify(assertion.key)} key below ${assertion.path}`,
      passed,
      passed
        ? `No ${JSON.stringify(assertion.key)} key is present in the semantic projection.`
        : root.found
          ? `Forbidden key found at ${matches.join(', ')}.`
          : `Semantic root path is missing: ${assertion.path}.`,
    ));
  }
  return checks;
}

function collectKeyPaths(value: unknown, key: string, path: string, matches: string[]): void {
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) collectKeyPaths(child, key, `${path}/${index}`, matches);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const object = value as Readonly<Record<string, unknown>>;
  for (const [childKey, child] of Object.entries(object)) {
    const childPath = `${path}/${pointerSegment(childKey)}`;
    if (childKey === key) matches.push(childPath);
    collectKeyPaths(child, key, childPath, matches);
  }
}

async function sourceChecks(workspace: string, task: TaskManifest): Promise<readonly CheckResult[]> {
  const checks: CheckResult[] = [];
  for (const assertion of task.assertions.source) {
    let source: string;
    try {
      source = await readFile(resolveInside(workspace, assertion.file, 'source assertion file'), 'utf8');
    } catch (error: unknown) {
      checks.push(check(
        `source:${assertion.id}`,
        `Source ${assertion.mode}: ${assertion.text}`,
        false,
        error instanceof Error ? error.message : String(error),
      ));
      continue;
    }
    const occurrences = source.split(assertion.text).length - 1;
    const passed = assertion.mode === 'includes'
      ? occurrences > 0
      : assertion.mode === 'excludes'
        ? occurrences === 0
        : occurrences === assertion.count;
    checks.push(check(
      `source:${assertion.id}`,
      `Source ${assertion.mode}: ${assertion.text}`,
      passed,
      `Observed ${occurrences} occurrence(s) in ${assertion.file}.`,
    ));
  }
  return checks;
}

async function baselineCheck(
  contract: ResolvedContract,
  task: TaskManifest,
  baselinePath: string,
): Promise<CheckResult | undefined> {
  const baseline = task.assertions.baseline;
  if (baseline === undefined) return undefined;
  const expected: unknown = JSON.parse(await readFile(baselinePath, 'utf8')) as unknown;
  const actual: unknown = JSON.parse(JSON.stringify(contract)) as unknown;
  const missing: string[] = [];
  for (const pointer of baseline.ignorePointers) {
    if (!deletePointer(expected, pointer)) missing.push(`baseline:${pointer}`);
    if (!deletePointer(actual, pointer)) missing.push(`submission:${pointer}`);
  }
  const passed = missing.length === 0
    && stableJson(jsonValue(actual, 'submission contract')) === stableJson(jsonValue(expected, 'baseline contract'));
  const differences: string[] = [];
  if (!passed && missing.length === 0) collectDifferences(expected, actual, '', differences);
  return check(
    'resolved:baseline-parity',
    'Resolved graph parity outside declared changes',
    passed,
    passed
      ? `All resolved data outside ${baseline.ignorePointers.length} declared paths matched the seeded baseline.`
      : missing.length > 0
        ? `Could not find ignored pointer(s): ${missing.join(', ')}.`
        : `Resolved data outside the declared change paths differs: ${differences.join(' | ')}.`,
  );
}

export async function evaluateAssertions(
  workspace: string,
  contract: ResolvedContract,
  buildManifest: string,
  task: TaskManifest,
  baselinePath: string,
): Promise<readonly CheckResult[]> {
  const checks = [
    ...graphChecks(contract, task, buildManifest),
    ...resolvedChecks(contract, task),
    ...await sourceChecks(workspace, task),
  ];
  const parity = await baselineCheck(contract, task, baselinePath);
  if (parity !== undefined) checks.push(parity);
  return checks;
}
