import { referenceImage } from '@antiky/contracts/dsl';

export const clearingReference = referenceImage('./references/blue-winter-grove-reference-01-clearing-v4.png');
export const creekReference = referenceImage('./references/blue-winter-grove-reference-02-frozen-creek-v4.png');
export const landmarkReference = referenceImage('./references/blue-winter-grove-reference-03-frost-tree-detail-v4.png');
export const partySpriteAnchor = referenceImage('./references/blue-winter-grove-party-sprite-anchor-v1.png');

export const blueWinterGroveSceneReferences = [
  {
    image: clearingReference,
    use: 'scene mood, clearing composition, party scale, and dominant tree family',
  },
  {
    image: creekReference,
    use: 'traversal route, surface separation, and party movement',
  },
  {
    image: landmarkReference,
    use: 'close-inspection reward, tree construction, roots, and ground detail',
  },
  {
    image: partySpriteAnchor,
    use: 'authoritative character identities, equipment, palette, and pixel craft',
  },
] as const;
