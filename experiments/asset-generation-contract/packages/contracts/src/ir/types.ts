export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type EntityKind =
  | 'abstract'
  | 'camera'
  | 'composition-anchor'
  | 'environment'
  | 'group'
  | 'population'
  | 'region'
  | 'scene'
  | 'terrain'
  | 'validation-target';

export type SystemPhase =
  | 'composition'
  | 'detail'
  | 'layout'
  | 'population'
  | 'publish'
  | 'render'
  | 'resolve'
  | 'surface'
  | 'synthesis'
  | 'terrain'
  | 'validate';

export type ComponentMap = Readonly<Record<string, JsonObject>>;

export interface ContractMetadata {
  readonly id: string;
  readonly intent: string;
  readonly kind: 'generative-scene';
  readonly name: string;
  readonly revision: number;
  readonly status: 'accepted' | 'candidate' | 'deprecated' | 'draft';
  readonly authoredFor?: string;
  readonly nonGoals?: readonly string[];
  readonly provenance?: JsonObject;
  readonly tags?: readonly string[];
}

export interface ContractImport {
  readonly id: string;
  readonly integrity?: string;
  readonly optional?: boolean;
  readonly uri: string;
  readonly version: string;
}

export interface CoordinateSystem {
  readonly handedness: 'left' | 'right';
  readonly horizontalAxes: readonly [string, string];
  readonly originMeaning?: string;
  readonly upAxis: 'x' | 'y' | 'z';
  readonly voxelSizeM: number;
  readonly worldUnit: 'meter';
}

export interface DeterminismPolicy {
  readonly rootSeed: number | string;
  readonly stableInputs: readonly string[];
  readonly streamPolicy: string;
  readonly streams?: Readonly<Record<string, string>>;
}

export interface ResolvedPrototype {
  readonly components: ComponentMap;
  readonly id: string;
  readonly kind: 'prototype';
  readonly name: string;
  readonly extends?: string;
  readonly tags?: readonly string[];
}

export interface ResolvedEntity {
  readonly components: ComponentMap;
  readonly id: string;
  readonly kind: EntityKind;
  readonly name: string;
  readonly enabled?: boolean;
  readonly parent?: string;
  readonly prototype?: string;
  readonly tags?: readonly string[];
}

export interface EntityTreeNode {
  readonly children?: readonly EntityTreeNode[];
  readonly entity: string;
}

export interface ResolvedRelationship {
  readonly id: string;
  readonly source: string;
  readonly type: string;
  readonly description?: string;
  readonly priority?: number;
  readonly required?: boolean;
  readonly rule?: JsonObject;
  readonly target?: string;
  readonly targetSelector?: JsonObject;
}

export interface ResolvedSystem {
  readonly dependsOn: readonly string[];
  readonly id: string;
  readonly implementation: string;
  readonly implementationVersion: string;
  readonly phase: SystemPhase;
  readonly query: JsonObject;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly invalidation?: JsonObject;
  readonly parameters?: JsonObject;
  readonly produces?: readonly string[];
  readonly randomStream?: string;
}

export interface ResolvedDefinitions {
  readonly materials: Readonly<Record<string, JsonObject>>;
  readonly palettes: Readonly<Record<string, JsonObject>>;
  readonly prototypes: Readonly<Record<string, ResolvedPrototype>>;
  readonly profiles?: Readonly<Record<string, JsonObject>>;
}

/** Portable engine-facing shape validated at the package boundary. */
export interface ResolvedContract {
  readonly $schema?: string;
  readonly contract: ContractMetadata;
  readonly coordinateSystem: CoordinateSystem;
  readonly definitions: ResolvedDefinitions;
  readonly determinism: DeterminismPolicy;
  readonly entities: Readonly<Record<string, ResolvedEntity>>;
  readonly entityTree: EntityTreeNode;
  readonly outputs: JsonObject;
  readonly relationships: readonly ResolvedRelationship[];
  readonly schemaVersion: string;
  readonly systems: readonly ResolvedSystem[];
  readonly validation: JsonObject;
  readonly imports?: readonly ContractImport[];
  readonly qualityProfile?: JsonObject;
}
