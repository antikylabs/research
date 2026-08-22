import { describe, expect, it } from 'vitest';

import {
  VOXEL_CAPTURE_FIXTURE,
  applyVoxelCaptureFixture,
  type VoxelCaptureFixtureControl,
  type VoxelCaptureStudio,
} from './capture-fixture.ts';
import { DEFAULT_RENDER_SETTINGS } from './studio/settings.ts';

const CURRENT: VoxelCaptureStudio = Object.freeze({
  presentation: Object.freeze({ approach: 'mesh', style: 'physical' }),
  modelIndex: 0,
  environmentId: 'pedestal',
  settings: DEFAULT_RENDER_SETTINGS,
  view: 'front',
});

function controls(
  approach: 'mesh' | 'instances' | 'raytrace',
  stylized: boolean,
): readonly VoxelCaptureFixtureControl[] {
  return Object.freeze([
    { kind: 'variant', name: 'mesh', enabled: approach === 'mesh' },
    { kind: 'variant', name: 'instances', enabled: approach === 'instances' },
    { kind: 'variant', name: 'raytrace', enabled: approach === 'raytrace' },
    { kind: 'variant', name: 'stylized', enabled: stylized },
  ]);
}

describe('voxel-rendering capture fixture', () => {
  it.each([
    ['mesh', false, 'physical'],
    ['instances', true, 'graphic'],
    ['raytrace', false, 'physical'],
  ] as const)('selects %s with its requested style', (approach, stylized, style) => {
    const requested = controls(approach, stylized);
    const applied = applyVoxelCaptureFixture(
      CURRENT,
      { schemaVersion: 1, fixtureName: VOXEL_CAPTURE_FIXTURE, controls: requested },
    );

    expect(applied.studio.presentation).toEqual({ approach, style });
    expect(applied.studio.settings.style).toBe(style);
    expect(applied.result.appliedControls).toEqual(requested);
  });

  it('applies bounded scene, lighting, lens, presentation, and camera presets', () => {
    const applied = applyVoxelCaptureFixture(CURRENT, {
      schemaVersion: 1,
      fixtureName: VOXEL_CAPTURE_FIXTURE,
      controls: [
        { kind: 'variant', name: 'model-shrine', enabled: true },
        { kind: 'variant', name: 'environment-beach', enabled: true },
        { kind: 'variant', name: 'time-morning', enabled: true },
        { kind: 'variant', name: 'moon', enabled: false },
        { kind: 'variant', name: 'focus-near', enabled: false },
        { kind: 'variant', name: 'strong-aperture', enabled: false },
        { kind: 'variant', name: 'grade', enabled: false },
        { kind: 'variant', name: 'view-vista', enabled: true },
      ],
    });

    expect(applied.studio).toMatchObject({
      modelIndex: 2,
      environmentId: 'beach',
      view: 'vista',
      settings: {
        lighting: { timeOfDay: 8, moonEnabled: false },
        depthOfField: { focusDistance: 180, aperture: 0.14 },
        finalColorGrade: false,
      },
    });
  });

  it('provides a sunlit golden-hour evidence preset', () => {
    const applied = applyVoxelCaptureFixture(CURRENT, {
      schemaVersion: 1,
      fixtureName: VOXEL_CAPTURE_FIXTURE,
      controls: [
        { kind: 'variant', name: 'mesh', enabled: true },
        { kind: 'variant', name: 'time-golden', enabled: true },
      ],
    });

    expect(applied.studio.settings.lighting.timeOfDay).toBe(16.5);
  });

  it('rejects ambiguous approaches and unknown fixtures', () => {
    expect(() => applyVoxelCaptureFixture(
      CURRENT,
      {
        schemaVersion: 1,
        fixtureName: VOXEL_CAPTURE_FIXTURE,
        controls: [{ kind: 'variant', name: 'instances', enabled: true }],
      },
    )).toThrow(/exactly one approach/i);
    expect(() => applyVoxelCaptureFixture(
      CURRENT,
      { schemaVersion: 1, fixtureName: 'wrong', controls: controls('mesh', false) },
    )).toThrow(/unknown/i);
  });
});
