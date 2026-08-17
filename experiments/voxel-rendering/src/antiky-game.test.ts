import { describe, expect, it } from 'vitest';

import { selectAntikyPresentation } from './antiky-game.ts';

describe('selectAntikyPresentation', () => {
  it.each([
    ['', { approach: 'mesh', style: 'physical' }],
    ['?approach=instances&style=graphic', { approach: 'instances', style: 'graphic' }],
    ['?approach=raytrace&style=physical', { approach: 'raytrace', style: 'physical' }],
  ] as const)('selects the requested supported presentation from %s', (search, expected) => {
    expect(selectAntikyPresentation(search)).toEqual(expected);
  });

  it('falls back independently for unsupported approach and style values', () => {
    expect(selectAntikyPresentation('?approach=cubes&style=neon')).toEqual({
      approach: 'mesh',
      style: 'physical',
    });
    expect(selectAntikyPresentation('?approach=instances&style=neon')).toEqual({
      approach: 'instances',
      style: 'physical',
    });
  });
});
