import { describe, expect, it } from 'vitest';

import { createBuiltInScene } from './built-in.ts';
import { voxelKey } from './types.ts';

describe('createBuiltInScene', () => {
  it('builds one deterministic, nontrivial material and lighting fixture', () => {
    const first = createBuiltInScene();
    const second = createBuiltInScene();
    const keys = new Set(first.cells.map((cell) => voxelKey(cell.x, cell.y, cell.z)));

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.cells.length).toBeGreaterThan(2_000);
    expect(keys.size).toBe(first.cells.length);
    expect(first.materials.some((material) => material.metallic > 0.5)).toBe(true);
    expect(first.materials.some((material) => material.emission > 1)).toBe(true);
    expect(first.receipt).toMatchObject({ source: 'built-in', warnings: [] });
  });
});

