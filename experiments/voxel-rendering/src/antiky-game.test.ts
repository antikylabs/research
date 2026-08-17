import { describe, expect, it } from 'vitest';

import { selectAntikyPresentation, selectAntikyStudio } from './antiky-game.ts';

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

describe('selectAntikyStudio', () => {
  it('maps the documented studio query controls into the Antiky module', () => {
    const selection = selectAntikyStudio(
      '?approach=raytrace&style=graphic&model=2&environment=beach&time=1.5'
      + '&moon=off&dof=off&focus=42&aperture=1.6&exposure=1.8&grade=off&variation=.7',
    );

    expect(selection).toMatchObject({
      presentation: { approach: 'raytrace', style: 'graphic' },
      modelIndex: 2,
      environmentId: 'beach',
      settings: {
        style: 'graphic',
        depthOfField: { enabled: false, focusDistance: 42, aperture: 1.6 },
        lighting: { timeOfDay: 1.5, moonEnabled: false },
        exposure: 1.8,
        finalColorGrade: false,
        materialVariation: 0.7,
      },
    });
  });

  it('bounds model and renderer settings while rejecting unknown environments', () => {
    const selection = selectAntikyStudio(
      '?model=999&environment=city&time=48.5&focus=-4&aperture=99&exposure=99&variation=-1',
    );
    expect(selection.modelIndex).toBe(2);
    expect(selection.environmentId).toBe('pedestal');
    expect(selection.settings).toMatchObject({
      depthOfField: { focusDistance: 1, aperture: 2.5 },
      lighting: { timeOfDay: 0.5 },
      exposure: 3,
      materialVariation: 0,
    });
  });
});
