import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RENDER_SETTINGS,
  normalizeRenderSettings,
  renderSettingsKey,
} from './settings.ts';

describe('render studio settings', () => {
  it('provides the complete documented control defaults', () => {
    expect(DEFAULT_RENDER_SETTINGS).toEqual({
      style: 'physical',
      depthOfField: { enabled: true, focusDistance: 118, aperture: 0.8 },
      lighting: { timeOfDay: 17.5, moonEnabled: true },
      exposure: 1.15,
      finalColorGrade: true,
      materialVariation: 0.32,
    });
  });

  it('clamps external control values to safe renderer ranges', () => {
    expect(normalizeRenderSettings({
      ...DEFAULT_RENDER_SETTINGS,
      depthOfField: { enabled: false, focusDistance: -10, aperture: 99 },
      lighting: { timeOfDay: 48.5, moonEnabled: false },
      exposure: Number.NaN,
      materialVariation: -2,
    })).toEqual({
      style: 'physical',
      depthOfField: { enabled: false, focusDistance: 1, aperture: 2.5 },
      lighting: { timeOfDay: 0.5, moonEnabled: false },
      exposure: 1.15,
      finalColorGrade: true,
      materialVariation: 0,
    });
  });

  it('keys sample-defining settings separately from presentation-only grading', () => {
    const base = renderSettingsKey(DEFAULT_RENDER_SETTINGS);
    const graded = renderSettingsKey({ ...DEFAULT_RENDER_SETTINGS, finalColorGrade: false });
    const relit = renderSettingsKey({
      ...DEFAULT_RENDER_SETTINGS,
      lighting: { ...DEFAULT_RENDER_SETTINGS.lighting, timeOfDay: 12 },
    });

    expect(graded.sample).toBe(base.sample);
    expect(graded.presentation).not.toBe(base.presentation);
    expect(relit.sample).not.toBe(base.sample);
    expect(relit.camera).toBe(base.camera);
    expect(relit.materialLight).not.toBe(base.materialLight);

    const refocused = renderSettingsKey({
      ...DEFAULT_RENDER_SETTINGS,
      depthOfField: { ...DEFAULT_RENDER_SETTINGS.depthOfField, focusDistance: 42 },
    });
    expect(refocused.camera).not.toBe(base.camera);
    expect(refocused.materialLight).toBe(base.materialLight);
  });
});
