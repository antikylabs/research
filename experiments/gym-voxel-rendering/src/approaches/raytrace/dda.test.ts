import { describe, expect, it } from 'vitest';

import { traceDenseVoxels } from './dda.ts';
import { raytraceTestScene } from './test-scene.ts';
import { createDenseVoxelStorage } from './volume.ts';

const centerVolume = createDenseVoxelStorage(raytraceTestScene([3, 3, 3], [
  { x: 1, y: 1, z: 1, paletteIndex: 7 },
]));

describe('traceDenseVoxels', () => {
  it('hits from outside through a face', () => {
    expect(traceDenseVoxels(centerVolume, [-1, 1.5, 1.5], [1, 0, 0])).toMatchObject({
      status: 'hit',
      cell: [1, 1, 1],
      materialIndex: 7,
      normal: [-1, 0, 0],
      distance: 2,
      steps: 2,
    });
  });

  it('starts inside the bounds and reaches the next occupied cell', () => {
    expect(traceDenseVoxels(centerVolume, [0.25, 1.5, 1.5], [1, 0, 0])).toMatchObject({
      status: 'hit',
      cell: [1, 1, 1],
      normal: [-1, 0, 0],
      distance: 0.75,
    });
  });

  it('handles parallel misses and negative directions', () => {
    expect(traceDenseVoxels(centerVolume, [-1, 4, 1.5], [1, 0, 0])).toMatchObject({
      status: 'miss',
      steps: 0,
    });
    expect(traceDenseVoxels(centerVolume, [4, 1.5, 1.5], [-1, 0, 0])).toMatchObject({
      status: 'hit',
      cell: [1, 1, 1],
      normal: [1, 0, 0],
      distance: 2,
    });
  });

  it('advances tied edge and corner axes without cracks and chooses a stable x-first normal', () => {
    const edge = traceDenseVoxels(centerVolume, [-1, -1, 1.5], [1, 1, 0]);
    expect(edge).toMatchObject({
      status: 'hit',
      cell: [1, 1, 1],
      normal: [-1, 0, 0],
      steps: 2,
    });

    const corner = traceDenseVoxels(centerVolume, [-1, -1, -1], [1, 1, 1]);
    expect(corner).toMatchObject({
      status: 'hit',
      cell: [1, 1, 1],
      normal: [-1, 0, 0],
      steps: 2,
    });
  });

  it('reports a clean miss after leaving the volume', () => {
    const empty = createDenseVoxelStorage(raytraceTestScene([2, 2, 2], []));
    expect(traceDenseVoxels(empty, [-1, 0.5, 0.5], [1, 0, 0])).toMatchObject({
      status: 'miss',
      steps: 2,
    });
  });

  it('distinguishes traversal-cap exhaustion from a miss', () => {
    expect(traceDenseVoxels(centerVolume, [-1, 1.5, 1.5], [1, 0, 0], 1)).toMatchObject({
      status: 'cap',
      steps: 1,
    });
  });

  it('rejects a zero or non-finite ray direction', () => {
    expect(() => traceDenseVoxels(centerVolume, [0, 0, 0], [0, 0, 0])).toThrow(/direction/i);
    expect(() => traceDenseVoxels(centerVolume, [0, 0, 0], [Number.NaN, 0, 0]))
      .toThrow(/finite/i);
  });
});
