import { describe, expect, it } from 'vitest';

import {
  VOXEL_CAPTURE_FIXTURE,
  applyVoxelCaptureFixture,
  type VoxelCaptureFixtureControl,
} from './capture-fixture.ts';

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
    const applied = applyVoxelCaptureFixture(
      { approach: 'mesh', style: 'physical' },
      { schemaVersion: 1, fixtureName: VOXEL_CAPTURE_FIXTURE, controls: controls(approach, stylized) },
    );

    expect(applied.presentation).toEqual({ approach, style });
    expect(applied.result.appliedControls).toEqual(controls(approach, stylized));
  });

  it('rejects ambiguous approaches and unknown fixtures', () => {
    expect(() => applyVoxelCaptureFixture(
      { approach: 'mesh', style: 'physical' },
      {
        schemaVersion: 1,
        fixtureName: VOXEL_CAPTURE_FIXTURE,
        controls: [{ kind: 'variant', name: 'instances', enabled: true }],
      },
    )).toThrow(/exactly one approach/i);
    expect(() => applyVoxelCaptureFixture(
      { approach: 'mesh', style: 'physical' },
      { schemaVersion: 1, fixtureName: 'wrong', controls: controls('mesh', false) },
    )).toThrow(/unknown/i);
  });
});
