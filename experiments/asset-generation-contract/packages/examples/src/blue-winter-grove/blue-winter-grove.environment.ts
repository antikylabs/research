import { meters, thing } from '@antiky/contracts/dsl';
import {
  clearingReference,
  creekReference,
  landmarkReference,
} from './blue-winter-grove.references';

export const winterTree = thing({
  name: 'Winter grove tree',
  references: [{ image: clearingReference, use: 'shared miniature scale, snow softness, and tree-family cohesion' }],
  identity: [
    'a mature tree built from readable trunk and crown parts',
    'a soft voxel silhouette with visible structure',
  ],
  variation: {
    vary: ['height', 'age', 'lean', 'branch loss', 'snow load'],
    preserve: ['visible trunk-to-crown construction', 'family resemblance within each tree type'],
  },
  rules: { avoid: ['smooth blobs', 'micro-voxel noise', 'duplicate neighbouring silhouettes'] },
});

export const roundedSnowCrown = thing({
  name: 'Rounded snow-loaded crown',
  references: [
    { image: clearingReference, use: 'broad clustered canopy mass and powder-soft outer silhouette' },
    { image: landmarkReference, use: 'branch-supported snow clumps with gaps into the crown' },
  ],
  identity: [
    'broad irregular crown assembled from rounded clusters',
    'heavy powder shelves supported by visible branches',
  ],
  shape: { form: 'wide, tiered, asymmetrical, and open enough to reveal some branch structure' },
  variation: {
    vary: ['cluster size', 'gaps', 'edge breakup', 'snow load'],
    preserve: ['rounded family read', 'branch-supported construction'],
  },
  rules: { avoid: ['one smooth sphere', 'uniform snow cap', 'perfectly radial clusters'] },
});

export const spireSnowCrown = thing({
  name: 'Narrow conifer spire crown',
  references: [{ image: clearingReference, use: 'slender background accents rising through the rounded canopy' }],
  identity: ['tapering evergreen spire', 'broken vertical tiers carrying separate snow shelves'],
  shape: { form: 'narrow, vertically tiered, and irregular at the top' },
  variation: {
    vary: ['height', 'top shape', 'tier gaps', 'snow load'],
    preserve: ['slender spire read', 'separate branch tiers'],
  },
  rules: { avoid: ['perfect cone', 'stacked identical tiers', 'solid white silhouette'] },
});

export const warmForkedTrunk = thing({
  name: 'Warm forked tree trunk',
  references: [
    { image: clearingReference, use: 'restrained ochre-brown warmth beneath cool snow' },
    { image: landmarkReference, use: 'readable forks, branch support, and rooted contact with the ground' },
  ],
  identity: ['ochre-brown trunk with one or more readable forks', 'visible support for the crown and snow mass'],
  shape: { form: 'sturdy, gently tapered, and irregular without realistic bark noise' },
  rules: { avoid: ['hidden trunk structure', 'fissured photoreal bark', 'thin unsupported crown stem'] },
});

export const frostBentTrunk = thing({
  name: 'Ancient frost-bent trunk',
  basedOn: warmForkedTrunk,
  references: [{ image: landmarkReference, use: 'split trunk, exposed root flare, and low traversable arch' }],
  identity: ['thick split base with exposed root flare', 'one low arching limb that creates an opening beneath it'],
  shape: { form: 'weighted sideways by age and snow while remaining structurally credible' },
  rules: { must: ['form a recognizable approachable arch'], avoid: ['upright symmetry', 'thin sapling proportions'] },
});

export const roundedWinterTree = thing({
  name: 'Rounded-canopy winter tree',
  basedOn: winterTree,
  parts: { crown: roundedSnowCrown, trunk: warmForkedTrunk },
  references: [{ image: clearingReference, use: 'dominant grove tree family, scale range, and clustered silhouette' }],
  shape: { height: meters(5, 15) },
  variation: {
    vary: ['age', 'scale', 'lean', 'branch spread', 'snow load'],
    preserve: ['rounded crown family', 'warm visible trunk'],
  },
});

export const spireConifer = thing({
  name: 'Narrow snow conifer',
  basedOn: winterTree,
  parts: { crown: spireSnowCrown, trunk: warmForkedTrunk },
  references: [{ image: clearingReference, use: 'sparse tall punctuation above and behind rounded tree masses' }],
  shape: { height: meters(9, 19) },
  variation: {
    vary: ['height', 'top shape', 'branch gaps', 'snow load'],
    preserve: ['narrow spire crown', 'readable tier rhythm'],
  },
});

export const frostBentLandmark = thing({
  name: 'Frost-bent landmark tree',
  basedOn: winterTree,
  parts: { crown: roundedSnowCrown, trunk: frostBentTrunk },
  references: [{ image: landmarkReference, use: 'complete landmark identity, root contact, crown, and arch opening' }],
  shape: { height: meters(7, 12) },
  variation: {
    vary: ['branch loss', 'snow shelves'],
    preserve: ['recognizable arch', 'ancient weight', 'reused rounded-crown language'],
  },
});

export const powderSnow = thing({
  name: 'Dry powder snow',
  references: [
    { image: clearingReference, use: 'open powder field, rounded drifts, and blue-lilac shadow' },
    { image: creekReference, use: 'soft stepped banks and walkable snow beside the ice' },
  ],
  identity: [
    'fresh dry powder',
    'rounded drifts and heavy branch caps',
    'cool blue-lilac shadow with faint blush bounce',
  ],
  variation: {
    vary: ['depth', 'drift edge', 'burial'],
    preserve: ['powder-soft surface', 'readable stepped voxel form'],
  },
});

export const creekWater = thing({
  name: 'Shallow winter creek water',
  references: [{ image: creekReference, use: 'clear restrained blue water visible beneath and between thin ice' }],
  identity: ['shallow slow-moving clear water', 'visible depth beneath thinner frozen areas'],
  rules: { avoid: ['opaque blue ribbon', 'dramatic rapids', 'realistic fluid noise'] },
});

export const sheetIce = thing({
  name: 'Thin sheet ice',
  references: [{ image: creekReference, use: 'glassy center, cloudy frosted edges, and snow-dusted stepped banks' }],
  identity: ['thin translucent pale-blue ice', 'clearer center and cloudy frost at the edges'],
  variation: {
    vary: ['opacity', 'frosted edge width', 'snow dusting'],
    preserve: ['water remains legible beneath the ice'],
  },
});

export const winterSurfaces = thing({
  name: 'Winter clearing surface family',
  parts: { powder: powderSnow, water: creekWater, ice: sheetIce },
  references: [{ image: creekReference, use: 'the required visual separation between powder, water, and ice' }],
  identity: ['three related but visibly distinct traversable surface reads'],
  rules: { must: ['powder, water, and ice remain distinguishable at the play camera'] },
});

export const forestFloorDetails = thing({
  name: 'Sparse winter forest-floor details',
  references: [
    { image: clearingReference, use: 'restrained low accents across open powder' },
    { image: landmarkReference, use: 'frost grass, low shrubs, and half-buried stones near the tree base' },
  ],
  identity: ['ice-blue frost-grass tufts', 'low snow-buried shrubs', 'half-buried brown-gray stones with powder caps'],
  variation: { vary: ['patch size', 'burial', 'spacing'], preserve: ['low sparse scale', 'clear snow gaps'] },
  rules: { avoid: ['continuous lawn', 'decorative rows', 'floating stones'] },
});
