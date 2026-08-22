import { isPreservableDslValue } from "./guards.js";

interface CloneState {
  readonly active: WeakSet<object>;
  readonly completed: WeakMap<object, unknown>;
}

function unsupported(path: string, description: string): never {
  throw new TypeError(`DSL declarations contain unsupported ${description} at ${path}`);
}

function cloneValue(value: unknown, path: string, state: CloneState): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return unsupported(path, "non-finite number");
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value !== "object") {
    return unsupported(path, typeof value);
  }

  if (isPreservableDslValue(value)) {
    return value;
  }

  if (state.active.has(value)) {
    return unsupported(path, "object cycle");
  }

  const completed = state.completed.get(value);
  if (completed !== undefined) {
    return completed;
  }

  state.active.add(value);

  if (Array.isArray(value)) {
    const output: unknown[] = [];
    state.completed.set(value, output);

    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        return unsupported(`${path}[${index}]`, "sparse array slot");
      }
      output.push(cloneValue(value[index], `${path}[${index}]`, state));
    }

    state.active.delete(value);
    return Object.freeze(output);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return unsupported(path, "object prototype");
  }

  const symbolKeys = Object.getOwnPropertySymbols(value);
  if (symbolKeys.length > 0) {
    return unsupported(path, "symbol key");
  }

  const output: Record<string, unknown> = {};
  state.completed.set(value, output);

  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      return unsupported(`${path}.${key}`, "accessor property");
    }
    if (!descriptor.enumerable) {
      return unsupported(`${path}.${key}`, "non-enumerable property");
    }

    Object.defineProperty(output, key, {
      configurable: true,
      enumerable: true,
      value: cloneValue(descriptor.value, `${path}.${key}`, state),
      writable: true,
    });
  }

  state.active.delete(value);
  return Object.freeze(output);
}

export function immutableRecord<Result extends object>(
  kind: string,
  input: object,
): Result {
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    return unsupported("$", "constructor input prototype");
  }

  if (Object.hasOwn(input, "kind")) {
    return unsupported("$.kind", "author-supplied discriminant");
  }
  if (Object.getOwnPropertySymbols(input).length > 0) {
    return unsupported("$", "symbol key");
  }

  const state: CloneState = {
    active: new WeakSet<object>(),
    completed: new WeakMap<object, unknown>(),
  };
  const output: Record<string, unknown> = { kind };

  for (const key of Object.getOwnPropertyNames(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      return unsupported(`$.${key}`, "accessor property");
    }
    if (!descriptor.enumerable) {
      return unsupported(`$.${key}`, "non-enumerable property");
    }
    Object.defineProperty(output, key, {
      configurable: true,
      enumerable: true,
      value: cloneValue(descriptor.value, `$.${key}`, state),
      writable: true,
    });
  }

  return Object.freeze(output) as Result;
}
