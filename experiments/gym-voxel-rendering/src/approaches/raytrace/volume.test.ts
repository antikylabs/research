import { describe, expect, it } from 'vitest';

import { raytraceTestScene } from './test-scene.ts';
import {
  createDenseVoxelStorage,
  densePaletteIndex,
  denseVoxelIndex,
  RAYTRACE_MAX_DIMENSION,
  RAYTRACE_MAX_TRAVERSAL_STEPS,
  RAYTRACE_MAX_VOLUME_BYTES,
} from './volume.ts';

describe('createDenseVoxelStorage', () => {
  it('packs the tight scene into deterministic vec4 storage and palette tables', () => {
    const scene = raytraceTestScene([2, 2, 2], [
      { x: 0, y: 0, z: 0, paletteIndex: 1 },
      { x: 1, y: 1, z: 1, paletteIndex: 2 },
    ], [-1, -2, -3]);

    const volume = createDenseVoxelStorage(scene);

    expect(volume.dimensions).toEqual([2, 2, 2]);
    expect(volume.origin).toEqual([-1, -2, -3]);
    expect(volume.vec4Elements).toBe(2);
    expect(volume.occupiedVoxels).toBe(2);
    expect(volume.volumeData.length).toBe(2 * 4);
    expect([...volume.volumeData]).toEqual([1, 0, 0, 0, 0, 0, 0, 2]);
    expect(densePaletteIndex(volume, 0, 0, 0)).toBe(1);
    expect(densePaletteIndex(volume, 1, 1, 1)).toBe(2);
    expect(densePaletteIndex(volume, -1, 0, 0)).toBe(0);
    const expectedColor = [
      scene.materials[1]?.linear[0],
      scene.materials[1]?.linear[1],
      scene.materials[1]?.linear[2],
      scene.materials[1]?.emission,
    ];
    [...volume.materialColor.slice(4, 8)].forEach((value, index) => {
      expect(value).toBeCloseTo(expectedColor[index] ?? Number.NaN);
    });
    const expectedSurface = [
      scene.materials[2]?.roughness,
      scene.materials[2]?.metallic,
      scene.materials[2]?.glass,
      scene.materials[2]?.water,
    ];
    [...volume.materialSurface.slice(8, 12)].forEach((value, index) => {
      expect(value).toBeCloseTo(expectedSurface[index] ?? Number.NaN);
    });
    expect(volume.byteLength).toBe(
      volume.volumeData.byteLength
      + volume.materialColor.byteLength
      + volume.materialSurface.byteLength,
    );
  });

  it('uses x-fastest dense indexing', () => {
    expect(denseVoxelIndex([3, 4, 5], 0, 0, 0)).toBe(0);
    expect(denseVoxelIndex([3, 4, 5], 2, 0, 0)).toBe(2);
    expect(denseVoxelIndex([3, 4, 5], 0, 1, 0)).toBe(3);
    expect(denseVoxelIndex([3, 4, 5], 0, 0, 1)).toBe(12);
  });

  it('rejects dimensions, bytes, cells, duplicate cells, and palette indices outside the proof', () => {
    expect(() => createDenseVoxelStorage(raytraceTestScene(
      [RAYTRACE_MAX_DIMENSION + 1, 1, 1],
      [],
    ))).toThrow(new RegExp(`dimension.*${RAYTRACE_MAX_DIMENSION}`, 'i'));

    expect(() => createDenseVoxelStorage(raytraceTestScene([4, 4, 4], []), {
      maxBytes: 16,
    })).toThrow(/byte.*cap/i);

    expect(() => createDenseVoxelStorage(raytraceTestScene([2, 2, 2], [
      { x: 2, y: 0, z: 0, paletteIndex: 1 },
    ]))).toThrow(/cell.*bounds/i);

    expect(() => createDenseVoxelStorage(raytraceTestScene([2, 2, 2], [
      { x: 1, y: 1, z: 1, paletteIndex: 1 },
      { x: 1, y: 1, z: 1, paletteIndex: 2 },
    ]))).toThrow(/duplicate/i);

    expect(() => createDenseVoxelStorage(raytraceTestScene([1, 1, 1], [
      { x: 0, y: 0, z: 0, paletteIndex: 0 },
    ]))).toThrow(/palette/i);

    expect(RAYTRACE_MAX_VOLUME_BYTES).toBe(128 * 1024 * 1024);
    expect(RAYTRACE_MAX_DIMENSION).toBe(384);
    expect(RAYTRACE_MAX_TRAVERSAL_STEPS).toBe(899);
    expect(() => createDenseVoxelStorage(raytraceTestScene([384, 128, 384], []), {
      maxTraversalSteps: RAYTRACE_MAX_TRAVERSAL_STEPS - 1,
    }))
      .toThrow(/traversal steps/i);
  });
});
