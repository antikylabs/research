/** Blue Winter Grove: composable game, art, and production direction in TypeScript. */
import { between, frames, scene, voxelDiorama } from '@antiky/contracts/dsl';
import { blueWinterGroveDefinitions } from './blue-winter-grove.definitions';
import {
  blueWinterGroveCast,
  clearing,
  coniferSpires,
  landmarkTree,
  roundedGrove,
  travellingParty,
} from './blue-winter-grove.layout';
import { blueWinterGroveSceneReferences } from './blue-winter-grove.references';

export default scene({
  key: 'blue-winter-grove',
  name: 'Blue Winter Grove',
  profiles: [voxelDiorama],
  references: blueWinterGroveSceneReferences,
  experience: {
    fantasy: 'Guide three companions into a quiet winter grove where careful observation makes the place feel alive.',
    feel: ['quiet', 'cold', 'inviting', 'curious', 'slightly mysterious'],
    firstRead: [
      'three distinct adventurers entering along a frozen creek',
      'an open powder clearing held by rounded trees and sparse conifer spires',
      'one ancient bent tree worth approaching',
    ],
    closerLook: [
      'water beneath thin ice and powder along its banks',
      'crowns assembled from branch-supported snow clusters',
      'warm forked trunks, roots, frost grass, shrubs, and half-buried stones',
    ],
  },
  visual: {
    language: 'soft high-key tilt-shift voxel miniature environment with production-quality flat HD-2D adventurers',
    lighting: 'diffuse periwinkle and lilac winter light with blush snow bounce and faint warmth through the grove',
    density: 'medium-high',
    silhouettes: 'rounded broad crowns, sparse narrow spires, clear gaps, and one bent arch',
    detail: 'chunky readable environment parts and crisp layered character sprites, never texture noise',
    avoid: [
      'photoreal detail',
      'micro-voxel noise',
      '3D characters',
      'one repeated tree type',
      'sharp full-frame focus',
    ],
  },
  gameplay: {
    playAs: travellingParty,
    purpose: 'explore through movement, environmental reading, and close inspection rather than combat or collection',
    loop: [
      'follow a readable route',
      'notice a visual question',
      'approach it',
      'inspect details',
      'choose what to follow next',
    ],
    playerCan: [
      'cross the clearing',
      'follow the frozen creek bank',
      'approach the landmark',
      'inspect natural details',
    ],
    pace: 'unhurried, with room to stop and look',
    spaceMust: ['keep the powder field traversable', 'keep water and ice legible', 'keep the tree arch approachable'],
  },
  definitions: blueWinterGroveDefinitions,
  cast: blueWinterGroveCast,
  composition: [
    frames(roundedGrove, clearing, {
      coverage: 'most of the edge',
      opening: 'aligned with the creek',
      avoid: 'a continuous tree wall',
    }),
    frames(coniferSpires, clearing, {
      coverage: 'sparse background punctuation',
      avoid: 'an even skyline',
    }),
    frames(landmarkTree, clearing, {
      coverage: 'one memorable edge anchor',
      opening: 'the low arch remains visible and approachable',
    }),
  ],
  rules: {
    must: [
      'the party stays readable but subordinate to the place',
      'each adventurer keeps a distinct role, silhouette, and reason to inspect the world',
      'rounded trees dominate while spires punctuate and the bent tree anchors',
      'powder, water, and thin ice remain visibly distinct',
    ],
    avoid: ['foxes', 'uniform crowns', 'obvious grids', 'flat snow sheets', 'opaque blue creek', 'unreadable bloom'],
  },
  acceptance: {
    checks: [
      {
        key: 'rounded-tree-count',
        subject: roundedGrove,
        measure: 'population count',
        expected: between(28, 42),
      },
      {
        key: 'party-count',
        subject: travellingParty,
        measure: 'population count',
        expected: between(1, 1),
      },
    ],
    review: [
      'Can a player explain who the three companions are and why each one examines the world differently?',
      'Do shared crown and trunk definitions create a consistent tree family without duplicate silhouettes?',
      'Does the creek invite movement while the landmark rewards leaving the direct route?',
      'Can every important visual decision be traced to a tagged reference image?',
    ],
  },
});
