import type { JsonValue } from '@antiky/contracts/ir';

export type UnknownRecord = Readonly<Record<string, unknown>>;

export function record(value: unknown, context: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${context} must be an object.`);
  }
  return value as UnknownRecord;
}

export function exactKeys(
  value: UnknownRecord,
  context: string,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const permitted = new Set([...required, ...optional]);
  const unknown = Object.keys(value).filter((key) => !permitted.has(key));
  const missing = required.filter((key) => !(key in value));
  if (unknown.length > 0) {
    throw new TypeError(`${context} has unknown field(s): ${unknown.join(', ')}.`);
  }
  if (missing.length > 0) {
    throw new TypeError(`${context} is missing field(s): ${missing.join(', ')}.`);
  }
}

export function textValue(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${context} must be a non-empty string.`);
  }
  return value;
}

export function booleanValue(value: unknown, context: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${context} must be a boolean.`);
  return value;
}

export function integerValue(value: unknown, context: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError(`${context} must be a safe integer.`);
  }
  return value;
}

export function literalValue<const Value extends string | number>(
  value: unknown,
  expected: Value,
  context: string,
): Value {
  if (value !== expected) throw new TypeError(`${context} must equal ${JSON.stringify(expected)}.`);
  return expected;
}

export function oneOf<const Value extends string>(
  value: unknown,
  permitted: readonly Value[],
  context: string,
): Value {
  if (typeof value !== 'string' || !permitted.includes(value as Value)) {
    throw new TypeError(`${context} must be one of ${permitted.join(', ')}.`);
  }
  return value as Value;
}

export function arrayOf<Value>(
  value: unknown,
  context: string,
  parse: (item: unknown, itemContext: string) => Value,
): readonly Value[] {
  if (!Array.isArray(value)) throw new TypeError(`${context} must be an array.`);
  return value.map((item, index) => parse(item, `${context}[${index}]`));
}

export function jsonValue(value: unknown, context: string): JsonValue {
  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => jsonValue(item, `${context}[${index}]`));
  const object = record(value, context);
  return Object.fromEntries(
    Object.entries(object).map(([key, child]) => [key, jsonValue(child, `${context}.${key}`)]),
  );
}

export function stableJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const objectValue = value as Readonly<Record<string, JsonValue>>;
  return `{${Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(objectValue[key] as JsonValue)}`)
    .join(',')}}`;
}

export function prettyJson(value: JsonValue): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
