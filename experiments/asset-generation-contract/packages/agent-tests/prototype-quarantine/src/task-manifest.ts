import {
  arrayOf,
  booleanValue,
  exactKeys,
  integerValue,
  jsonValue,
  literalValue,
  oneOf,
  record,
  textValue,
  type UnknownRecord,
} from './json.js';
import type {
  ArrayLengthAssertion,
  BaselineComparison,
  ExpectedReference,
  ExpectedRelationship,
  ForbiddenKeyAssertion,
  ResolvedValueAssertion,
  RubricCriterion,
  SeedSpec,
  SourceAssertion,
  SourceAssertionMode,
  TaskAssertions,
  TaskManifest,
} from './types.js';
import type { JsonValue } from '@antiky/contracts/ir';

function parseSeed(value: unknown, context: string): SeedSpec {
  const item = record(value, context);
  exactKeys(item, context, ['source', 'target', 'optional']);
  return {
    source: textValue(item.source, `${context}.source`),
    target: textValue(item.target, `${context}.target`),
    optional: booleanValue(item.optional, `${context}.optional`),
  };
}

function parseRelationship(value: unknown, context: string): ExpectedRelationship {
  const item = record(value, context);
  exactKeys(item, context, ['id', 'source', 'target', 'type'], ['description', 'required', 'rule']);
  const description = item.description === undefined
    ? undefined
    : textValue(item.description, `${context}.description`);
  const required = item.required === undefined
    ? undefined
    : booleanValue(item.required, `${context}.required`);
  const ruleRecord = item.rule === undefined ? undefined : record(item.rule, `${context}.rule`);
  const rule: Readonly<Record<string, JsonValue>> | undefined = ruleRecord === undefined
    ? undefined
    : Object.fromEntries(
      Object.entries(ruleRecord).map(([key, child]) => [key, jsonValue(child, `${context}.rule.${key}`)]),
    );
  return {
    id: textValue(item.id, `${context}.id`),
    source: textValue(item.source, `${context}.source`),
    target: textValue(item.target, `${context}.target`),
    type: textValue(item.type, `${context}.type`),
    ...(description === undefined ? {} : { description }),
    ...(required === undefined ? {} : { required }),
    ...(rule === undefined ? {} : { rule }),
  };
}

function parseReference(value: unknown, context: string): ExpectedReference {
  const item = record(value, context);
  exactKeys(item, context, ['path', 'sha256']);
  const sha256 = textValue(item.sha256, `${context}.sha256`);
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new TypeError(`${context}.sha256 must be lowercase SHA-256.`);
  return { path: textValue(item.path, `${context}.path`), sha256 };
}

function parseResolved(value: unknown, context: string): ResolvedValueAssertion {
  const item = record(value, context);
  exactKeys(item, context, ['id', 'path', 'value']);
  return {
    id: textValue(item.id, `${context}.id`),
    path: parsePointer(item.path, `${context}.path`),
    value: jsonValue(item.value, `${context}.value`),
  };
}

function parseArrayLength(value: unknown, context: string): ArrayLengthAssertion {
  const item = record(value, context);
  exactKeys(item, context, ['id', 'path', 'length']);
  const length = integerValue(item.length, `${context}.length`);
  if (length < 0) throw new TypeError(`${context}.length cannot be negative.`);
  return {
    id: textValue(item.id, `${context}.id`),
    path: parsePointer(item.path, `${context}.path`),
    length,
  };
}

function parseForbiddenKey(value: unknown, context: string): ForbiddenKeyAssertion {
  const item = record(value, context);
  exactKeys(item, context, ['id', 'path', 'key']);
  return {
    id: textValue(item.id, `${context}.id`),
    path: parsePointer(item.path, `${context}.path`),
    key: textValue(item.key, `${context}.key`),
  };
}

function parseSource(value: unknown, context: string): SourceAssertion {
  const item = record(value, context);
  exactKeys(item, context, ['id', 'file', 'mode', 'text'], ['count']);
  const mode = oneOf<SourceAssertionMode>(
    item.mode,
    ['excludes', 'includes', 'occurs'],
    `${context}.mode`,
  );
  const count = item.count === undefined ? undefined : integerValue(item.count, `${context}.count`);
  if (mode === 'occurs' && count === undefined) throw new TypeError(`${context}.count is required for occurs.`);
  if (mode !== 'occurs' && count !== undefined) throw new TypeError(`${context}.count is only valid for occurs.`);
  return {
    id: textValue(item.id, `${context}.id`),
    file: textValue(item.file, `${context}.file`),
    mode,
    text: textValue(item.text, `${context}.text`),
    ...(count === undefined ? {} : { count }),
  };
}

function parsePointer(value: unknown, context: string): string {
  const pointer = textValue(value, context);
  if (!pointer.startsWith('/')) throw new TypeError(`${context} must be an absolute JSON pointer.`);
  return pointer;
}

function parseBaseline(value: unknown, context: string): BaselineComparison {
  const item = record(value, context);
  exactKeys(item, context, ['ignorePointers']);
  return {
    ignorePointers: arrayOf(item.ignorePointers, `${context}.ignorePointers`, parsePointer),
  };
}

function parseAssertions(value: unknown, context: string): TaskAssertions {
  const item = record(value, context);
  exactKeys(item, context, [
    'entityIds',
    'prototypeIds',
    'systemIds',
    'relationships',
    'references',
    'resolvedValues',
    'arrayLengths',
    'forbiddenKeys',
    'source',
  ], ['baseline']);
  const strings = (entry: unknown, entryContext: string): readonly string[] =>
    arrayOf(entry, entryContext, textValue);
  return {
    entityIds: strings(item.entityIds, `${context}.entityIds`),
    prototypeIds: strings(item.prototypeIds, `${context}.prototypeIds`),
    systemIds: strings(item.systemIds, `${context}.systemIds`),
    relationships: arrayOf(item.relationships, `${context}.relationships`, parseRelationship),
    references: arrayOf(item.references, `${context}.references`, parseReference),
    resolvedValues: arrayOf(item.resolvedValues, `${context}.resolvedValues`, parseResolved),
    arrayLengths: arrayOf(item.arrayLengths, `${context}.arrayLengths`, parseArrayLength),
    forbiddenKeys: arrayOf(item.forbiddenKeys, `${context}.forbiddenKeys`, parseForbiddenKey),
    source: arrayOf(item.source, `${context}.source`, parseSource),
    ...(item.baseline === undefined ? {} : { baseline: parseBaseline(item.baseline, `${context}.baseline`) }),
  };
}

function parseRubric(value: unknown, context: string): RubricCriterion {
  const item = record(value, context);
  exactKeys(item, context, ['id', 'title', 'description']);
  return {
    id: textValue(item.id, `${context}.id`),
    title: textValue(item.title, `${context}.title`),
    description: textValue(item.description, `${context}.description`),
  };
}

function assertUnique(values: readonly string[], context: string): void {
  if (new Set(values).size !== values.length) throw new TypeError(`${context} must contain unique values.`);
}

function validateManifestIdentity(manifest: TaskManifest, context: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id)) {
    throw new TypeError(`${context}.id must be a lowercase kebab-case identifier.`);
  }
  assertUnique(manifest.allowedWrites, `${context}.allowedWrites`);
  assertUnique(manifest.rubric.map(({ id }) => id), `${context}.rubric ids`);
  assertUnique([
    ...manifest.assertions.resolvedValues.map(({ id }) => id),
    ...manifest.assertions.arrayLengths.map(({ id }) => id),
    ...manifest.assertions.forbiddenKeys.map(({ id }) => id),
    ...manifest.assertions.source.map(({ id }) => id),
  ], `${context}.assertion ids`);
}

export function parseTaskManifest(value: unknown, context = 'task manifest'): TaskManifest {
  const item: UnknownRecord = record(value, context);
  exactKeys(item, context, [
    'schemaVersion',
    'id',
    'title',
    'summary',
    'entry',
    'allowedWrites',
    'seeds',
    'assertions',
    'rubric',
  ]);
  const manifest: TaskManifest = {
    schemaVersion: literalValue(item.schemaVersion, 1, `${context}.schemaVersion`),
    id: textValue(item.id, `${context}.id`),
    title: textValue(item.title, `${context}.title`),
    summary: textValue(item.summary, `${context}.summary`),
    entry: textValue(item.entry, `${context}.entry`),
    allowedWrites: arrayOf(item.allowedWrites, `${context}.allowedWrites`, textValue),
    seeds: arrayOf(item.seeds, `${context}.seeds`, parseSeed),
    assertions: parseAssertions(item.assertions, `${context}.assertions`),
    rubric: arrayOf(item.rubric, `${context}.rubric`, parseRubric),
  };
  validateManifestIdentity(manifest, context);
  return manifest;
}
