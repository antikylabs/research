/** Quiet Canal Market: a faithful semantic rendering of the preserved compact scene direction. */
import { region, scene, voxelDiorama } from '@antiky/contracts/dsl';

const canals = region({
  name: 'Canals',
  purpose: ['primary streets'],
});

const market = region({ name: 'Market district' });
const residential = region({ name: 'Residential district' });
const dock = region({ name: 'Dock district' });

export default scene({
  key: 'quiet-canal-market',
  name: 'Quiet Canal Market',
  profiles: [voxelDiorama],
  experience: {
    fantasy: 'A fantasy canal town inspired by layered JRPG towns.',
    firstRead: [
      'canals that serve as the primary streets',
      'arched stone bridges',
      'market, residential, and dock districts',
    ],
    closerLook: [
      'architecture in stucco, brick, wood, and stone',
      'window boxes, lanterns, cracked plaster, moss, and trim',
      'cobblestones with size and height variation, cracks, and moss',
      'boats, crates, barrels, awnings, signs, and plants',
    ],
  },
  visual: {
    language: 'fantasy canal town inspired by layered JRPG towns',
    avoid: ['Minecraft style', 'generic German cottage style'],
  },
  cast: {
    canals,
    market,
    residential,
    dock,
  },
  rules: {
    must: [
      'facades have depth',
      'cobblestone uses the source range 2–7 for size variation; the unit is unspecified',
      'cobblestone height varies',
      'cobblestone includes cracks and moss',
    ],
    avoid: ['flat walls', 'cobblestone tiling', 'empty facades'],
  },
  acceptance: {
    review: [
      'Is shopfront density high?',
      'Are empty facades absent?',
      'Does the result avoid Minecraft style?',
      'Does the result avoid generic German cottage style?',
    ],
  },
});
