import { describe, expect, it } from 'vitest';

import {
  classifyRaytraceReset,
  RaytraceResetTracker,
  updateRunningMean,
  type RaytraceSampleDefinition,
} from './accumulation.ts';

const initial: RaytraceSampleDefinition = Object.freeze({
  sceneFingerprint: 'scene-a',
  cameraRevision: 1,
  viewportWidth: 1280,
  viewportHeight: 720,
  materialLightKey: 'sun-a',
  integratorKey: 'bounces-2',
  presentationKey: 'physical',
});

describe('running mean', () => {
  it('combines samples without retaining an unbounded sum', () => {
    let mean: readonly [number, number, number, number] = [0, 0, 0, 0];
    mean = updateRunningMean(mean, [2, 4, 8, 1], 0);
    mean = updateRunningMean(mean, [4, 8, 4, 1], 1);
    mean = updateRunningMean(mean, [6, 0, 0, 1], 2);

    expect(mean).toEqual([4, 4, 4, 1]);
  });

  it('rejects invalid counts and non-finite radiance', () => {
    expect(() => updateRunningMean([0, 0, 0, 0], [1, 1, 1, 1], -1)).toThrow(/count/i);
    expect(() => updateRunningMean([0, 0, 0, 0], [Number.NaN, 1, 1, 1], 0))
      .toThrow(/finite/i);
  });
});

describe('raytrace reset classification', () => {
  it.each([
    ['scene', { sceneFingerprint: 'scene-b' }],
    ['camera', { cameraRevision: 2 }],
    ['viewport', { viewportWidth: 640 }],
    ['viewport', { viewportHeight: 360 }],
    ['material-light', { materialLightKey: 'sun-b' }],
    ['integrator', { integratorKey: 'bounces-3' }],
  ] as const)('classifies %s changes', (reason, update) => {
    expect(classifyRaytraceReset(initial, { ...initial, ...update })).toBe(reason);
  });

  it('preserves samples for presentation-only changes', () => {
    expect(classifyRaytraceReset(initial, { ...initial, presentationKey: 'graphic' })).toBeNull();

    const tracker = new RaytraceResetTracker(initial);
    tracker.recordSample();
    tracker.recordSample();
    const decision = tracker.update({ ...initial, presentationKey: 'graphic' });

    expect(decision).toEqual({ generation: 1, reason: null, sampleCount: 2 });
  });

  it('increments the reset generation and clears the sample count', () => {
    const tracker = new RaytraceResetTracker(initial);
    tracker.recordSample();

    expect(tracker.update({ ...initial, cameraRevision: 2 })).toEqual({
      generation: 2,
      reason: 'camera',
      sampleCount: 0,
    });
    expect(tracker.recordSample()).toBe(1);
  });
});
