import { createHash } from 'node:crypto';

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Convert known JSON data to a key-sorted representation. Ordered arrays remain ordered; callers
 * must sort semantic sets before they reach this boundary.
 */
export function canonicalize(value: unknown, path = '$'): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Non-finite number at ${path}`);
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalize(item, `${path}[${index}]`));
  }

  if (typeof value !== 'object' || !isPlainRecord(value)) {
    throw new TypeError(`Non-JSON value at ${path}`);
  }

  const result: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child === undefined) {
      throw new TypeError(`Undefined value at ${path}.${key}`);
    }
    result[key] = canonicalize(child, `${path}.${key}`);
  }
  return result;
}

export function canonicalStringify(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function sha256Bytes(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function hashCanonical(value: unknown): string {
  return sha256Bytes(canonicalStringify(value));
}
