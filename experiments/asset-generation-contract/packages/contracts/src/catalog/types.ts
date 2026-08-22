import type { JsonObject } from '../ir/index.js';

export type JsonSchema = Readonly<Record<string, unknown>>;

export type ComponentMergePolicy =
  | 'append-unique'
  | 'deep-merge'
  | 'non-inheritable'
  | 'replace';

export interface CatalogComponentAuthoring {
  readonly authored: boolean;
  readonly derived: boolean;
  readonly inheritance: ComponentMergePolicy;
}

export interface CatalogComponentType {
  readonly allowedEntityKinds: readonly string[];
  readonly authoring: CatalogComponentAuthoring;
  readonly description: string;
  readonly schema: JsonSchema;
  readonly allowedWriters?: readonly string[];
  readonly commonReaders?: readonly string[];
  readonly invalidates?: readonly string[];
}

export interface CatalogRelationshipType {
  readonly description: string;
  readonly ruleSchema: JsonSchema;
  readonly sourceKinds: readonly string[];
  readonly targetKinds: readonly string[];
}

export interface ComponentCatalog {
  readonly $schema?: string;
  readonly catalogVersion: string;
  readonly componentTypes: Readonly<Record<string, CatalogComponentType>>;
  readonly derivedComponentConvention: JsonObject;
  readonly id: string;
  readonly mergePolicies: Readonly<Record<ComponentMergePolicy, string>>;
  readonly name: string;
  readonly namespacePolicy: JsonObject;
  readonly purpose: string;
  readonly relationshipTypes: Readonly<Record<string, CatalogRelationshipType>>;
  readonly status: string;
  readonly systemPhaseOrder: readonly string[];
}
