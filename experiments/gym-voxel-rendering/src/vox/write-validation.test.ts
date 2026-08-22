import { describe, expect, it } from 'vitest';

import { assertVoxEncodableScene } from './write-validation.ts';

function scene(
  dimensions: readonly [number, number, number],
  cell: Readonly<{ x: number; y: number; z: number; paletteIndex: number }>,
) {
  return { dimensions, cells: [cell] };
}

describe('assertVoxEncodableScene', () => {
  it('accepts coordinates at both edges of a 256-cell axis', () => {
    expect(() => assertVoxEncodableScene({
      dimensions: [256, 256, 256],
      cells: [
        { x: 0, y: 0, z: 0, paletteIndex: 1 },
        { x: 255, y: 255, z: 255, paletteIndex: 255 },
      ],
    })).not.toThrow();
  });

  it.each([
    [[0, 16, 16] as const, /x dimension 0/],
    [[16, 257, 16] as const, /y dimension 257/],
    [[16, 16, 1.5] as const, /z dimension 1\.5/],
  ])('rejects an unencodable dimension %#', (dimensions, message) => {
    expect(() => assertVoxEncodableScene(scene(
      dimensions,
      { x: 0, y: 0, z: 0, paletteIndex: 1 },
    ))).toThrow(message);
  });

  it.each([
    [{ x: -1, y: 0, z: 0, paletteIndex: 1 }, /x coordinate -1/],
    [{ x: 0, y: 16, z: 0, paletteIndex: 1 }, /y coordinate 16/],
    [{ x: 0, y: 0, z: 1.5, paletteIndex: 1 }, /z coordinate 1\.5/],
  ])('rejects an unencodable coordinate %#', (cell, message) => {
    expect(() => assertVoxEncodableScene(scene([16, 16, 16], cell))).toThrow(message);
  });

  it('rejects 256 instead of truncating it to byte value zero', () => {
    expect(() => assertVoxEncodableScene(scene(
      [256, 16, 16],
      { x: 256, y: 0, z: 0, paletteIndex: 1 },
    ))).toThrow(/x coordinate 256/);
  });

  it.each([0, 256, 1.5])('rejects palette index %s', (paletteIndex) => {
    expect(() => assertVoxEncodableScene(scene(
      [16, 16, 16],
      { x: 0, y: 0, z: 0, paletteIndex },
    ))).toThrow(/palette index/);
  });
});
