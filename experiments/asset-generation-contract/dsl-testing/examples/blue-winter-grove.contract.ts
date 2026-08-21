/**
 * Conceptual Antiky Contract DSL v0.1 example.
 *
 * This is intentionally compact. It exercises the proposed authoring surface
 * without attempting to transcribe the full 5,000-line Blue Winter Grove IR.
 * The implementation agent should make an equivalent fixture compile and
 * validate as part of Goal 1.
 */

import {
  component,
  defineComponentType,
  defineEntity,
  definePrototype,
  defineRelationship,
  defineSceneContract,
  defineSystem,
  ref,
} from '@antiky/contracts/dsl';

const windCarving = defineComponentType({
  id: 'antikylabs.snow.windCarving',
  version: '1.0.0',
  allowedEntityKinds: ['terrain', 'prototype'],
  inheritance: 'deep-merge',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ridgeScaleM: { type: 'number', exclusiveMinimum: 0 },
      intensity: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['ridgeScaleM', 'intensity'],
  } as const,
});

const coniferBase = definePrototype({
  id: 'prototype.tree.conifer.base',
  name: 'Base Dense Voxel Conifer',
  tags: ['asset', 'tree', 'conifer', 'abstract'],
  components: [
    component('description.intent', {
      summary:
        'A reusable conifer grammar with visible branch architecture, irregular silhouette, and internal negative space.',
      visualRead: [
        'natural irregular silhouette',
        'visible branch tiers',
        'dense but perforated foliage masses',
      ],
    }),
    component('style.detailProfile', {
      macro: ['tapered silhouette', 'asymmetrical crown', 'root flare'],
      meso: ['branch tiers', 'forking clusters', 'gaps revealing trunk'],
      micro: ['bark fissures', 'twig tips', 'localized frost'],
      targetVisibleDetailScales: 3,
    }),
    component('style.forbiddenForms', {
      items: [
        'single cone canopy',
        'cube foliage blobs',
        'perfect radial symmetry',
        'uniform branch spacing',
      ],
    }),
    component('material.assignment', {
      slots: {
        trunk: 'material.bark.pine',
        branches: 'material.bark.pine',
        foliage: 'material.foliage.conifer',
        snow: 'material.snow.fresh',
      },
    }),
    component('surface.snowReceiver', {
      enabled: true,
      normalThresholdDegrees: 64,
      skyExposureWeight: 0.55,
      windExposureWeight: 0.28,
      occlusionWeight: 0.42,
      maxOverhangVoxels: 4,
      forbidUniformLayerThickness: true,
    }),
  ],
});

const matureSnowPine = definePrototype({
  id: 'prototype.tree.snow-pine.mature',
  name: 'Mature Snow-Laden Pine',
  extends: ref(coniferBase),
  tags: ['asset', 'tree', 'conifer', 'mature', 'hero-capable'],
  components: [
    component('core.bounds', {
      heightM: [11.5, 17.5],
      crownRadiusM: [2.7, 5.1],
      trunkRadiusAtBaseM: [0.34, 0.68],
      minimumVoxelHeight: 115,
      preferredVoxelHeight: [138, 180],
    }),
    component('geometry.treeGrammar', {
      trunk: {
        centerlineSegments: [10, 18],
        leanDegrees: [-9, 11],
        taperCurve: 'power',
      },
      branchTiers: {
        count: [8, 14],
        primaryBranchesPerTier: [3, 7],
        brokenPrimaryBranchCount: [0, 4],
      },
      foliageVolumes: {
        construction: 'branch-attached-lobed-clusters',
        negativeSpaceRatio: [0.18, 0.34],
        forbidConvexHullFill: true,
      },
    }),
    component(windCarving, {
      ridgeScaleM: 1.8,
      intensity: 0.62,
    }),
  ],
});

const primaryClearing = defineEntity({
  id: 'region.clearing.primary',
  kind: 'region',
  name: 'Primary Clearing',
  tags: ['clearing', 'negative-space', 'playable'],
  components: [
    component('layout.regionMask', {
      shape: 'irregular-ellipse',
      centerM: { x: 0, y: 0, z: 0 },
      radiusM: { x: 8.5, z: 7.5 },
      edgeNoiseM: [0.5, 1.8],
    }),
    component('composition.negativeSpace', {
      purpose: 'Protect the focal opening and preserve visible depth.',
      targetScreenCoverageHeroView: [0.18, 0.32],
      preserveDepthOpeningTowardAzimuthDegrees: 22,
      minimumVisibleDepthM: 18,
    }),
  ],
});

const oldGrowthPines = defineEntity({
  id: 'population.pine.old-growth',
  kind: 'population',
  name: 'Old-Growth Pine Clusters',
  tags: ['population', 'canopy', 'old-growth'],
  components: [
    component('population.prototypeMix', {
      entries: [{ prototype: ref(matureSnowPine), weight: 1 }],
    }),
    component('population.quantity', {
      count: [22, 34],
      samplingScope: 'scene',
    }),
    component('population.distribution', {
      algorithm: 'clustered-poisson-with-composition-masks',
      avoidGrid: true,
      minimumSpacingM: [2.2, 4.8],
    }),
  ],
});

const heroCamera = defineEntity({
  id: 'camera.hero',
  kind: 'camera',
  name: 'Hero Three-Quarter View',
  tags: ['camera', 'hero', 'acceptance'],
  components: [
    component('render.camera', {
      projection: 'orthographic',
      positionM: { x: 24.5, y: 16.5, z: 29 },
      lookAtM: { x: 0, y: 4.2, z: 0 },
      orthographicWidthM: 37.5,
      aspectRatio: '16:9',
      resolutionPx: { width: 1920, height: 1080 },
      nearM: 1,
      farM: 120,
      jitter: false,
    }),
    component('render.outputPasses', {
      passes: ['beauty', 'depth', 'object-id', 'snow-coverage'],
    }),
  ],
});

const resolveContract = defineSystem({
  id: 'system.resolve.contract',
  phase: 'resolve',
  implementation: 'antikylabs.contract.resolve',
  implementationVersion: '0.2.0',
  reads: ['imports', 'definitions.prototypes', 'entities.*.components'],
  writes: ['derived.resolvedPrototype', 'derived.dependencyGraph'],
  query: { allEntities: true },
  dependsOn: [],
  parameters: {
    applyDefaults: true,
    resolvePrototypeInheritance: true,
    canonicalizeEntityOrder: true,
  },
  produces: ['resolved-contract.json', 'dependency-graph.json'],
});

const placeOldGrowth = defineSystem({
  id: 'system.population.old-growth',
  phase: 'population',
  implementation: 'antikylabs.population.clustered-poisson',
  implementationVersion: '0.1.0',
  reads: [
    'population.prototypeMix',
    'population.quantity',
    'population.distribution',
    'layout.regionMask',
    'composition.negativeSpace',
  ],
  writes: ['derived.populationInstances'],
  query: { entity: ref(oldGrowthPines) },
  dependsOn: [ref(resolveContract)],
  randomStream: 'population/<population-id>',
  produces: ['population-instances'],
});

const framesClearing = defineRelationship({
  id: 'rel.old-growth.frames-clearing',
  type: 'composition.frames',
  source: ref(oldGrowthPines),
  target: ref(primaryClearing),
  required: true,
  priority: 900,
  rule: {
    preferredArcCoverageDegrees: [190, 280],
    openViewAzimuthDegrees: [0, 42],
    avoidContinuousTreeWall: true,
  },
  description:
    'Old-growth clusters define the clearing edge without enclosing it as a uniform ring.',
});

const root = defineEntity(
  {
    id: 'scene.blue-winter-grove.compact',
    kind: 'scene',
    name: 'Blue Winter Grove — Compact DSL Fixture',
    tags: ['antiky', 'voxel', 'winter', 'dsl-fixture'],
    components: [
      component('description.intent', {
        summary:
          'A dense blue-hour winter grove with a protected clearing and a mature pine silhouette.',
        emotionalTargets: ['quiet', 'cold', 'sheltered', 'mysterious'],
        mustReadAtFirstGlance: [
          'protected clearing',
          'layered tree silhouettes',
          'blue-hour winter atmosphere',
        ],
      }),
      component('style.visualLanguage', {
        primary: 'rich dense voxel diorama',
        secondary: [
          'painterly blue-hour lighting',
          'naturalistic forest grammar',
          'layered scene composition',
        ],
        density: 'high',
        silhouetteComplexity: 'high',
        surfaceComplexity: 'medium-high',
        antiStyles: [
          'Minecraft',
          'toy blocks',
          'single-cone low-poly trees',
          'uniform procedural scatter',
        ],
      }),
    ],
  },
  [
    defineEntity(
      {
        id: 'group.terrain',
        kind: 'group',
        name: 'Terrain and Regions',
        components: [],
      },
      [primaryClearing],
    ),
    defineEntity(
      {
        id: 'group.ecology',
        kind: 'group',
        name: 'Ecology',
        components: [],
      },
      [oldGrowthPines],
    ),
    defineEntity(
      {
        id: 'group.cameras',
        kind: 'group',
        name: 'Acceptance Cameras',
        components: [],
      },
      [heroCamera],
    ),
  ],
);

export default defineSceneContract({
  schemaVersion: '0.1.0',
  contract: {
    id: 'antikylabs.scene.blue-winter-grove.compact',
    kind: 'generative-scene',
    name: 'Blue Winter Grove — Compact DSL Fixture',
    revision: 1,
    status: 'draft',
    intent:
      'Exercise nested ownership, catalog components, custom components, prototype inheritance, refs, relationships, systems, canonicalization, and validation.',
    nonGoals: [
      'port the complete source fixture',
      'generate voxel geometry',
      'implement runtime gameplay',
    ],
    tags: ['antiky', 'dsl', 'vertical-slice'],
  },
  coordinateSystem: {
    handedness: 'right',
    upAxis: 'y',
    horizontalAxes: ['x', 'z'],
    worldUnit: 'meter',
    voxelSizeM: 0.1,
    originMeaning: 'center of the primary scene bounds',
  },
  determinism: {
    rootSeed: 'blue-winter-grove-compact-v1',
    streamPolicy:
      'hash(rootSeed, contractId, entityId, systemId, purposeKey)',
    stableInputs: [
      'schemaVersion',
      'contract.id',
      'contract.revision',
      'entity.id',
      'prototype.id',
      'system.id',
      'purposeKey',
    ],
    streams: {
      population: 'population/<population-id>',
      asset: 'asset/<derived-instance-id>/<purpose-key>',
    },
  },
  definitions: {
    palettes: {
      'palette.winter-snow': {
        id: 'palette.winter-snow',
        intent: 'Cool snow values that preserve form under blue-hour light.',
        roles: {
          shadow: ['#294567', '#365A7C'],
          body: ['#7898B6', '#9DB5C9'],
          highlight: ['#C7D5DF', '#E1E8EB'],
        },
      },
    },
    materials: {
      'material.snow.fresh': {
        id: 'material.snow.fresh',
        semanticRole: 'fresh powder snow',
        palette: 'palette.winter-snow',
      },
      'material.bark.pine': {
        id: 'material.bark.pine',
        semanticRole: 'cold mature pine bark',
      },
      'material.foliage.conifer': {
        id: 'material.foliage.conifer',
        semanticRole: 'dark winter conifer foliage',
      },
    },
    prototypes: [coniferBase, matureSnowPine],
    profiles: {},
  },
  customComponents: [windCarving],
  root,
  relationships: [framesClearing],
  systems: [resolveContract, placeOldGrowth],
  validation: {
    suites: {
      'suite.schema': {
        id: 'suite.schema',
        kind: 'schema',
        blocking: true,
        rules: [
          {
            id: 'schema.top-level',
            assert: 'json-schema-valid',
            schema: './schemas/generative-scene-contract.schema.json',
          },
          {
            id: 'schema.references',
            assert: 'all-references-resolve',
          },
          {
            id: 'schema.system-dag',
            assert: 'system-dependency-graph-is-acyclic',
          },
        ],
      },
    },
  },
  outputs: {
    resolvedContract: {
      path: 'generated/blue-winter-grove-compact/resolved-contract.json',
      includeHashes: true,
      includeResolvedPrototypeComponents: true,
    },
  },
});
