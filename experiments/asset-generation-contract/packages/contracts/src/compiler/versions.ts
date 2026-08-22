export const compilerIdentity = {
  id: '@antiky/contracts/compiler',
  version: '0.1.0',
} as const;

export const compilerPasses = [
  { id: 'load-and-serialization-guard', version: '0.1.0' },
  { id: 'semantic-collection-and-scoped-identity', version: '0.1.0' },
  { id: 'profile-expansion-and-conflict-analysis', version: '0.1.0' },
  { id: 'semantic-lowering', version: '0.1.0' },
  { id: 'technical-graph-resolution', version: '0.1.0' },
  { id: 'schema-and-catalog-validation', version: '0.1.0' },
  { id: 'canonicalization-and-hashing', version: '0.1.0' },
  { id: 'emission', version: '0.1.0' },
] as const;

export const semanticLowerers = [
  { id: 'scene-root', version: '0.1.0' },
  { id: 'reference-image-use', version: '0.1.0' },
  { id: 'experience-direction', version: '0.1.0' },
  { id: 'visual-direction', version: '0.1.0' },
  { id: 'gameplay-direction', version: '0.1.0' },
  { id: 'thing-prototype', version: '0.1.0' },
  { id: 'thing-specialization', version: '0.1.0' },
  { id: 'thing-parts', version: '0.1.0' },
  { id: 'region', version: '0.1.0' },
  { id: 'region-features', version: '0.1.0' },
  { id: 'population', version: '0.1.0' },
  { id: 'composition-frames', version: '0.1.0' },
  { id: 'acceptance', version: '0.1.0' },
  { id: 'voxel-diorama-profile', version: '0.1.0' },
] as const;
