import { readFileSync } from 'node:fs';

import type { ComponentCatalog, JsonSchema } from './types.js';

const CONTRACT_SCHEMA_RELATIVE_URL =
  '../../../../docs/asset-contract/schemas/generative-scene-contract.schema.json';
const COMPONENT_CATALOG_RELATIVE_URL =
  '../../../../docs/asset-contract/schemas/component-catalog.json';

let cachedCatalog: ComponentCatalog | undefined;
let cachedContractSchema: JsonSchema | undefined;

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function readJson(url: URL): unknown {
  return deepFreeze(JSON.parse(readFileSync(url, 'utf8')) as unknown);
}

/** The read-only source schema, resolved from either src/ or compiled dist/. */
export function contractSchemaUrl(): URL {
  return new URL(CONTRACT_SCHEMA_RELATIVE_URL, import.meta.url);
}

/** The read-only source catalog, resolved from either src/ or compiled dist/. */
export function componentCatalogUrl(): URL {
  return new URL(COMPONENT_CATALOG_RELATIVE_URL, import.meta.url);
}

export function loadContractSchema(): JsonSchema {
  cachedContractSchema ??= readJson(contractSchemaUrl()) as JsonSchema;
  return cachedContractSchema;
}

export function loadComponentCatalog(): ComponentCatalog {
  cachedCatalog ??= readJson(componentCatalogUrl()) as ComponentCatalog;
  return cachedCatalog;
}
