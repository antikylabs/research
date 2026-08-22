import type { JsonObject, JsonValue } from '../ir/index.js';
import { loadComponentCatalog } from './load.js';
import type { ComponentCatalog, ComponentMergePolicy } from './types.js';

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableValueKey(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableValueKey).join(',')}]`;
  }

  const objectValue = value as JsonObject;
  return `{${Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableValueKey(objectValue[key] as JsonValue)}`)
    .join(',')}}`;
}

function deepMerge(parent: JsonObject, child: JsonObject, appendArrays: boolean): JsonObject {
  const result: Record<string, JsonValue> = { ...parent };

  for (const [key, childValue] of Object.entries(child)) {
    const parentValue = result[key];
    if (isJsonObject(parentValue) && isJsonObject(childValue)) {
      result[key] = deepMerge(parentValue, childValue, appendArrays);
      continue;
    }

    if (appendArrays && Array.isArray(parentValue) && Array.isArray(childValue)) {
      const seen = new Set(parentValue.map(stableValueKey));
      result[key] = [
        ...parentValue,
        ...childValue.filter((value) => {
          const valueKey = stableValueKey(value);
          if (seen.has(valueKey)) {
            return false;
          }
          seen.add(valueKey);
          return true;
        }),
      ];
      continue;
    }

    result[key] = childValue;
  }

  return result;
}

export function getComponentMergePolicy(
  componentType: string,
  catalog: ComponentCatalog = loadComponentCatalog(),
): ComponentMergePolicy | undefined {
  return catalog.componentTypes[componentType]?.authoring.inheritance;
}

/** Apply the catalog's inheritance policy without mutating either payload. */
export function mergeComponentPayload(
  componentType: string,
  parent: JsonObject,
  child: JsonObject,
  catalog: ComponentCatalog = loadComponentCatalog(),
): JsonObject {
  const policy = getComponentMergePolicy(componentType, catalog);

  switch (policy) {
    case 'deep-merge':
      return deepMerge(parent, child, false);
    case 'append-unique':
      return deepMerge(parent, child, true);
    case 'non-inheritable':
    case 'replace':
      return { ...child };
    case undefined:
      throw new TypeError(`Unknown catalog component type: ${JSON.stringify(componentType)}`);
  }
}
