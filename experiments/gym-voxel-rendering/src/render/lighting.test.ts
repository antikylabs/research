import { describe, expect, it } from 'vitest';

import { createLightingState } from './lighting.ts';

describe('createLightingState', () => {
  it('moves the sun through distinct morning, noon, evening, and night states', () => {
    const morning = createLightingState(8, true);
    const noon = createLightingState(12, true);
    const evening = createLightingState(18, true);
    const night = createLightingState(0, true);

    expect(morning.sunDirection).not.toEqual(noon.sunDirection);
    expect(evening.sunDirection).not.toEqual(noon.sunDirection);
    expect(noon.sunDirection[1]).toBeGreaterThan(morning.sunDirection[1]);
    expect(noon.sunIntensity).toBeGreaterThan(evening.sunIntensity);
    expect(night.sunIntensity).toBe(0);
    expect(new Set([morning.key, noon.key, evening.key, night.key]).size).toBe(4);
  });

  it('keeps moon contribution independent and prevents a daylight second sun', () => {
    const nightOn = createLightingState(0, true);
    const nightOff = createLightingState(0, false);
    const dayOn = createLightingState(12, true);

    expect(nightOn.moonIntensity).toBeGreaterThan(0);
    expect(nightOn.ambientIntensity).toBeGreaterThan(0.35);
    expect(nightOn.skyColor[2]).toBeGreaterThan(0.08);
    expect(nightOff.moonIntensity).toBe(0);
    expect(nightOn.sunDirection).toEqual(nightOff.sunDirection);
    expect(dayOn.moonIntensity).toBe(0);
  });

  it('returns finite normalized light directions for every control hour', () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      const state = createLightingState(hour, true);
      expect(state.sunDirection.every(Number.isFinite)).toBe(true);
      expect(state.moonDirection.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(...state.sunDirection)).toBeCloseTo(1, 6);
      expect(Math.hypot(...state.moonDirection)).toBeCloseTo(1, 6);
    }
  });
});
