import type { JsonObject, ResolvedContract } from '../ir/index.js';

import { hashCanonical } from './canonical.js';
import type { SemanticGraphCollection } from './collect.js';
import { compareStableText } from './diagnostics.js';
import type { Derivation } from './lower.js';
import type { ResolvedReferenceImage } from './reference-images.js';

export interface ContractIndex {
  readonly byId: Readonly<Record<string, JsonObject>>;
  readonly bySemanticPath: Readonly<Record<string, readonly string[]>>;
  readonly derivationsByOutputId: Readonly<Record<string, readonly Derivation[]>>;
  readonly childrenByParent: Readonly<Record<string, readonly string[]>>;
  readonly incomingRelationshipsById: Readonly<Record<string, readonly string[]>>;
  readonly outgoingRelationshipsById: Readonly<Record<string, readonly string[]>>;
  readonly dependenciesBySourceId: Readonly<Record<string, readonly JsonObject[]>>;
  readonly dependentsByTargetId: Readonly<Record<string, readonly JsonObject[]>>;
  readonly referenceUsesByImageHash: Readonly<Record<string, readonly JsonObject[]>>;
  readonly prototypesByAncestor: Readonly<Record<string, readonly string[]>>;
  readonly systemsByReadType: Readonly<Record<string, readonly string[]>>;
  readonly systemsByWriteType: Readonly<Record<string, readonly string[]>>;
  readonly hashById: Readonly<Record<string, string>>;
}

function append<RecordValue>(
  record: Record<string, RecordValue[]>,
  key: string,
  value: RecordValue,
): void {
  (record[key] ??= []).push(value);
}

function sortRecordValues<Value>(
  record: Record<string, Value[]>,
  compare: (left: Value, right: Value) => number,
): void {
  for (const values of Object.values(record)) values.sort(compare);
}

function compareJsonObjects(left: JsonObject, right: JsonObject): number {
  return compareStableText(JSON.stringify(left), JSON.stringify(right));
}

/** Create all navigation indexes from the resolved graph; no index is an authoring source of truth. */
export function buildContractIndex(
  contract: ResolvedContract,
  graph: SemanticGraphCollection,
  derivations: readonly Derivation[],
  referenceImages: readonly ResolvedReferenceImage[],
): ContractIndex {
  const byId: Record<string, JsonObject> = {};
  const hashById: Record<string, string> = {};
  for (const [id, prototype] of Object.entries(contract.definitions.prototypes)) {
    byId[id] = { kind: 'prototype', path: `$.definitions.prototypes[${JSON.stringify(id)}]` };
    hashById[id] = hashCanonical(prototype);
  }
  for (const [id, entity] of Object.entries(contract.entities)) {
    byId[id] = { kind: entity.kind, path: `$.entities[${JSON.stringify(id)}]` };
    hashById[id] = hashCanonical(entity);
  }
  for (const [index, relationship] of contract.relationships.entries()) {
    byId[relationship.id] = { kind: 'relationship', path: `$.relationships[${index}]` };
    hashById[relationship.id] = hashCanonical(relationship);
  }
  for (const [index, system] of contract.systems.entries()) {
    byId[system.id] = { kind: 'system', path: `$.systems[${index}]` };
    hashById[system.id] = hashCanonical(system);
  }
  for (const [id, profile] of Object.entries(contract.definitions.profiles ?? {})) {
    byId[id] = { kind: 'profile', path: `$.definitions.profiles[${JSON.stringify(id)}]` };
    hashById[id] = hashCanonical(profile);
  }

  const bySemanticPath: Record<string, string[]> = {};
  const derivationsByOutputId: Record<string, Derivation[]> = {};
  for (const derivation of derivations) {
    append(derivationsByOutputId, derivation.outputId, derivation);
    for (const path of derivation.semanticPaths) append(bySemanticPath, path, derivation.outputId);
  }
  sortRecordValues(bySemanticPath, compareStableText);
  for (const values of Object.values(bySemanticPath)) {
    const distinct = [...new Set(values)];
    values.splice(0, values.length, ...distinct);
  }
  sortRecordValues(
    derivationsByOutputId,
    (left, right) => compareStableText(left.outputPath, right.outputPath),
  );

  const childrenByParent: Record<string, string[]> = {};
  for (const entity of Object.values(contract.entities)) {
    if (entity.parent !== undefined) append(childrenByParent, entity.parent, entity.id);
  }
  sortRecordValues(childrenByParent, compareStableText);

  const incomingRelationshipsById: Record<string, string[]> = {};
  const outgoingRelationshipsById: Record<string, string[]> = {};
  for (const relationship of contract.relationships) {
    append(outgoingRelationshipsById, relationship.source, relationship.id);
    if (relationship.target !== undefined) append(incomingRelationshipsById, relationship.target, relationship.id);
  }
  sortRecordValues(incomingRelationshipsById, compareStableText);
  sortRecordValues(outgoingRelationshipsById, compareStableText);

  const dependenciesBySourceId: Record<string, JsonObject[]> = {};
  const dependentsByTargetId: Record<string, JsonObject[]> = {};
  for (const edge of graph.dependencyEdges) {
    const record: JsonObject = {
      kind: edge.kind,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      semanticPath: edge.semanticPath,
      ...(edge.role === undefined ? {} : { role: edge.role }),
    };
    append(dependenciesBySourceId, edge.sourceId, record);
    append(dependentsByTargetId, edge.targetId, record);
  }
  sortRecordValues(dependenciesBySourceId, compareJsonObjects);
  sortRecordValues(dependentsByTargetId, compareJsonObjects);

  const referenceUsesByImageHash: Record<string, JsonObject[]> = {};
  for (const image of referenceImages) {
    for (const use of image.uses) {
      append(referenceUsesByImageHash, image.sha256, {
        path: image.path,
        ownerId: use.ownerId,
        semanticPath: use.semanticPath,
        use: use.use,
      });
    }
  }
  sortRecordValues(referenceUsesByImageHash, compareJsonObjects);

  const directParents = new Map(
    graph.dependencyEdges
      .filter(({ kind }) => kind === 'based-on')
      .map((edge) => [edge.sourceId, edge.targetId] as const),
  );
  const prototypesByAncestor: Record<string, string[]> = {};
  for (const prototype of Object.keys(contract.definitions.prototypes).sort()) {
    const seen = new Set<string>();
    let ancestor = directParents.get(prototype);
    while (ancestor !== undefined && !seen.has(ancestor)) {
      seen.add(ancestor);
      append(prototypesByAncestor, ancestor, prototype);
      ancestor = directParents.get(ancestor);
    }
  }
  sortRecordValues(prototypesByAncestor, compareStableText);

  const systemsByReadType: Record<string, string[]> = {};
  const systemsByWriteType: Record<string, string[]> = {};
  for (const system of contract.systems) {
    for (const resource of system.reads) append(systemsByReadType, resource, system.id);
    for (const resource of system.writes) append(systemsByWriteType, resource, system.id);
  }
  sortRecordValues(systemsByReadType, compareStableText);
  sortRecordValues(systemsByWriteType, compareStableText);

  return {
    byId,
    bySemanticPath,
    derivationsByOutputId,
    childrenByParent,
    incomingRelationshipsById,
    outgoingRelationshipsById,
    dependenciesBySourceId,
    dependentsByTargetId,
    referenceUsesByImageHash,
    prototypesByAncestor,
    systemsByReadType,
    systemsByWriteType,
    hashById,
  };
}
