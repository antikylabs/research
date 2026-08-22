import { thing } from '@antiky/contracts/dsl';
import {
  clearingReference,
  creekReference,
  partySpriteAnchor,
} from './blue-winter-grove.references';

export const character = thing({
  name: 'Playable field character',
  references: [
    { image: partySpriteAnchor, use: 'shared sprite proportions, pixel craft, and field-view readability' },
  ],
  identity: [
    'a player-controlled member of a cooperative three-person expedition',
    'a flat HD-2D field sprite that remains visually separate from the voxel environment',
  ],
  visual: {
    language: 'premium original pixel sprite with crisp clusters, layered winter gear, and a restrained outline',
    detail: 'class-readable clothing and equipment at field scale, without portrait-scale ornament',
  },
  gameplay: {
    playable: true,
    role: 'share exploration, observation, and discovery with the other party members',
    playerCan: ['travel', 'observe the environment', 'inspect points of interest'],
  },
  rules: {
    must: ['remain readable at the scene camera distance'],
    avoid: ['3D or voxel anatomy', 'placeholder sprite treatment', 'oversized weapons or heads'],
  },
});

export const vanguard = thing({
  name: 'Indigo-hooded vanguard',
  basedOn: character,
  references: [
    { image: partySpriteAnchor, use: 'left character identity, indigo silhouette, sword, and pack' },
    { image: clearingReference, use: 'party scale and forward travelling pose in the clearing' },
  ],
  identity: ['deep indigo hooded half-cape', 'dark layered travel gear', 'silver-edged short sword held low'],
  gameplay: {
    role: 'lead the party through uncertain ground and make the route feel safe enough to continue',
    playerCan: ['read the route ahead', 'inspect physical obstructions'],
  },
});

export const scholar = thing({
  name: 'Rust-coated scholar',
  basedOn: character,
  references: [
    { image: partySpriteAnchor, use: 'center character identity, cream scarf, staff, and book satchel' },
    { image: creekReference, use: 'observing pose and spacing while travelling beside the creek' },
  ],
  identity: ['long rust-red winter coat', 'cream scarf and book satchel', 'brass-ringed wooden staff'],
  gameplay: {
    role: 'interpret environmental clues and turn close observation into understanding',
    playerCan: ['study natural details', 'interpret signs of age, weather, and passage'],
  },
});

export const scout = thing({
  name: 'Moss-cloaked scout',
  basedOn: character,
  references: [
    { image: partySpriteAnchor, use: 'right character identity, ochre scarf, bow, and quiver' },
    { image: creekReference, use: 'nimble leading pose and readable separation from the other travellers' },
  ],
  identity: ['cropped moss-green cloak', 'ochre scarf and fitted leather travel gear', 'short bow and compact quiver'],
  gameplay: {
    role: 'notice routes, edges, and small changes before the rest of the party',
    playerCan: ['find traversable ground', 'notice partially hidden details'],
  },
});

export const winterboundParty = thing({
  name: 'Winterbound adventuring party',
  parts: { vanguard, scholar, scout },
  references: [
    { image: partySpriteAnchor, use: 'the three fixed identities and their relative silhouettes' },
    { image: clearingReference, use: 'group scale, formation, and visual priority in open snow' },
    { image: creekReference, use: 'movement as one compact party along a readable route' },
  ],
  identity: [
    'three distinct companions who travel and make discoveries together',
    'a compact player unit whose members remain individually recognizable',
  ],
  gameplay: {
    playable: true,
    role: 'the player-controlled exploration party and emotional point of view into the grove',
    playerCan: ['move as a group', 'pause to observe', 'approach and inspect discoveries'],
  },
  variation: {
    vary: ['walking, waiting, and observing poses', 'loose travel formation'],
    preserve: ['exactly three members', 'role colors', 'class-readable equipment', 'individual silhouettes'],
  },
});
