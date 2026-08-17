import { describe, expect, it } from 'vitest';

import { createBuiltInScene } from './built-in.ts';
import { voxelKey } from './types.ts';

describe('createBuiltInScene', () => {
  it('builds the deterministic high-resolution valley scene', () => {
    const first = createBuiltInScene();
    const second = createBuiltInScene();
    const keys = new Set(first.cells.map((cell) => voxelKey(cell.x, cell.y, cell.z)));

    expect(first).toMatchObject({
      name: 'Golden Hour Valley Atelier',
      dimensions: [160, 96, 256],
      origin: [-80, -20, -128],
      fingerprint: '753a16b1',
    });
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.cells).toEqual(second.cells);
    expect(first.cells).toHaveLength(376_721);
    expect(keys.size).toBe(first.cells.length);
    expect(first.materials.some((material) => material.metallic > 0.5)).toBe(true);
    expect(first.materials.some((material) => material.emission > 1)).toBe(true);
    expect(first.receipt).toMatchObject({ source: 'built-in', warnings: [] });
  });

  it('fills the landscape footprint and preserves near, subject, and far depth bands', () => {
    const scene = createBuiltInScene();
    const occupiedColumns = new Set(scene.cells.map((cell) => `${cell.x},${cell.z}`));
    const depthBands = [
      scene.cells.filter((cell) => cell.z < 80),
      scene.cells.filter((cell) => cell.z >= 80 && cell.z < 176),
      scene.cells.filter((cell) => cell.z >= 176),
    ];

    expect(occupiedColumns.size).toBe(scene.dimensions[0] * scene.dimensions[2]);
    for (const band of depthBands) expect(band.length).toBeGreaterThan(80_000);
  });

  it('keeps a materially detailed entrance plus glass, water, metal, and emissive cells', () => {
    const scene = createBuiltInScene();
    const entrance = scene.cells.filter((cell) => (
      cell.x >= 67 && cell.x <= 91
      && cell.y >= 21 && cell.y <= 61
      && cell.z >= 138 && cell.z <= 151
    ));
    const entranceMaterials = new Set(entrance.map((cell) => cell.paletteIndex));
    const materialCounts = new Map<number, number>();
    for (const cell of scene.cells) {
      materialCounts.set(cell.paletteIndex, (materialCounts.get(cell.paletteIndex) ?? 0) + 1);
    }

    expect(entrance.length).toBeGreaterThan(5_000);
    expect(entranceMaterials.size).toBeGreaterThanOrEqual(10);
    expect(materialCounts.get(8)).toBeGreaterThan(800); // emissive amber
    expect(materialCounts.get(9)).toBeGreaterThan(600); // window glass
    expect(materialCounts.get(16)).toBeGreaterThan(800); // iron hardware
    expect(materialCounts.get(17)).toBeGreaterThan(2_500); // pond water
  });
});
