import { between, meters, population, region } from '@antiky/contracts/dsl';
import { winterboundParty } from './blue-winter-grove.characters';
import {
  forestFloorDetails,
  frostBentLandmark,
  roundedWinterTree,
  spireConifer,
  winterSurfaces,
} from './blue-winter-grove.environment';
import {
  clearingReference,
  creekReference,
  landmarkReference,
} from './blue-winter-grove.references';

export const clearing = region({
  name: 'Sheltered powder-snow clearing',
  references: [{ image: clearingReference, use: 'open breathing room, broken tree edge, and party orientation' }],
  purpose: ['give the player a strong first read', 'support orientation and unhurried movement'],
  shape: 'broad irregular oval',
  width: meters(20, 28),
  features: { surfaces: winterSurfaces, details: forestFloorDetails },
  keep: ['an open powder field', 'a broken multi-species tree edge', 'a view toward the creek and deep forest'],
});

export const frozenCreek = region({
  name: 'Partly frozen shallow creek route',
  references: [{ image: creekReference, use: 'winding route, stepped banks, and distinct water-ice-snow reads' }],
  purpose: ['lead the party into the grove', 'give travel and inspection a shared route'],
  shape: 'gently winding shallow ribbon with stepped snow banks',
  width: meters(2.5, 4.5),
  features: { surfaces: winterSurfaces, details: forestFloorDetails },
  keep: ['clear water beneath thin ice', 'walkable powder beside the ice', 'an unobstructed route into the clearing'],
});

export const landmarkTree = population({
  name: 'Single clearing-edge landmark',
  of: frostBentLandmark,
  amount: between(1, 1),
  placement: { around: clearing },
  references: [{ image: landmarkReference, use: 'placement, approachable arch, and inspection distance' }],
  role: ['anchor close inspection', 'reward leaving the center route', 'form a low traversable arch'],
});

export const travellingParty = population({
  name: 'Player-controlled travelling party',
  of: winterboundParty,
  amount: between(1, 1),
  placement: { around: frozenCreek },
  references: [
    { image: clearingReference, use: 'party scale and formation in open snow' },
    { image: creekReference, use: 'movement and spacing along the route' },
  ],
  role: ['carry the player point of view', 'cross the clearing', 'follow the creek', 'study the landmark'],
});

export const roundedGrove = population({
  name: 'Layered rounded-canopy grove',
  of: roundedWinterTree,
  amount: between(28, 42),
  placement: {
    around: clearing,
    pattern: 'loose clusters',
    spacing: meters(3.5, 7),
    leave: ['a broad opening aligned with the creek', 'gaps into misty deep forest'],
  },
  references: [{ image: clearingReference, use: 'dominant tree mass, cluster depth, and open perimeter gaps' }],
  role: ['dominate the grove mass', 'frame the clearing', 'form the creek gateway'],
  variation: {
    vary: ['cluster depth', 'tree age', 'crown shape', 'snow load'],
    avoid: ['grid spacing', 'duplicate neighbours'],
  },
});

export const coniferSpires = population({
  name: 'Conifer spire accents',
  of: spireConifer,
  amount: between(8, 16),
  placement: { around: clearing, pattern: 'loose clusters', spacing: meters(5, 9) },
  references: [{ image: clearingReference, use: 'sparse vertical accents and uneven distant skyline' }],
  role: ['punctuate the rounded canopy', 'strengthen distant height rhythm'],
  variation: { vary: ['height', 'spacing', 'snow load'], avoid: ['even skyline', 'continuous conifer wall'] },
});

/** Stable cast keys identify placed scene subjects; reusable things live in definitions. */
export const blueWinterGroveCast = {
  clearing,
  frozenCreek,
  landmarkTree,
  travellingParty,
  roundedGrove,
  coniferSpires,
};
