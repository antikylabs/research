import { describe, expect, it } from 'vitest';

import { normalizeVoxModel } from './normalize.ts';
import { parseVox } from './parse.ts';

type Bytes = number[];

function u32(value: number): Bytes {
  return [value, value >>> 8, value >>> 16, value >>> 24].map((part) => part & 0xff);
}

function text(value: string): Bytes {
  return [...value].map((character) => character.charCodeAt(0));
}

function voxString(value: string): Bytes {
  return [...u32(value.length), ...text(value)];
}

function dictionary(entries: Readonly<Record<string, string>>): Bytes {
  return [
    ...u32(Object.keys(entries).length),
    ...Object.entries(entries).flatMap(([key, value]) => [...voxString(key), ...voxString(value)]),
  ];
}

function chunk(id: string, content: Bytes, children: Bytes = []): Bytes {
  return [...text(id), ...u32(content.length), ...u32(children.length), ...content, ...children];
}

function modelChunks(
  size: readonly [number, number, number],
  cells: readonly (readonly [number, number, number, number])[],
): Bytes {
  return [
    ...chunk('SIZE', [...u32(size[0]), ...u32(size[1]), ...u32(size[2])]),
    ...chunk('XYZI', [...u32(cells.length), ...cells.flat()]),
  ];
}

function fixture(options: Readonly<{
  includePalette?: boolean;
  includeMaterial?: boolean;
  models?: number;
  unknown?: boolean;
}> = {}): ArrayBuffer {
  const modelCount = options.models ?? 1;
  const children: Bytes = [];
  if (modelCount > 1) children.push(...chunk('PACK', u32(modelCount)));
  for (let model = 0; model < modelCount; model += 1) {
    children.push(...modelChunks([3 + model, 4, 5], [[1, 2, 3, 1], [2, 2, 3, 2]]));
  }
  if (options.includePalette) {
    const palette = new Array<number>(1024).fill(0);
    palette.splice(0, 8, 255, 64, 32, 255, 20, 180, 240, 255);
    children.push(...chunk('RGBA', palette));
  }
  if (options.includeMaterial) {
    children.push(...chunk('MATL', [
      ...u32(1),
      ...dictionary({ _type: '_metal', _rough: '0.2', _weight: '0.75' }),
    ]));
  }
  if (options.unknown) children.push(...chunk('FUTR', [1, 2, 3, 4]));
  const bytes = [
    ...text('VOX '),
    ...u32(150),
    ...chunk('MAIN', [], children),
  ];
  return new Uint8Array(bytes).buffer;
}

describe('parseVox', () => {
  it('parses base chunks, a custom palette, materials, and unknown-chunk diagnostics', () => {
    const document = parseVox(fixture({ includePalette: true, includeMaterial: true, unknown: true }));

    expect(document.version).toBe(150);
    expect(document.models).toHaveLength(1);
    expect(document.models[0]?.voxels).toEqual([
      { x: 1, y: 2, z: 3, paletteIndex: 1 },
      { x: 2, y: 2, z: 3, paletteIndex: 2 },
    ]);
    expect(document.palette[1]).toEqual([255, 64, 32, 255]);
    expect(document.materials.get(1)).toMatchObject({ _type: '_metal', _rough: '0.2' });
    expect(document.unsupportedChunks).toEqual(['FUTR']);
  });

  it('supports multiple base models and the official default palette fallback', () => {
    const document = parseVox(fixture({ models: 2 }));

    expect(document.declaredModelCount).toBe(2);
    expect(document.models).toHaveLength(2);
    expect(document.palette[1]).toEqual([255, 255, 255, 255]);
  });

  it('rejects malformed boundaries before reading or allocating from them', () => {
    const truncated = fixture({ includePalette: true }).slice(0, -13);
    expect(() => parseVox(truncated)).toThrow(/bounds|truncated|length/i);

    const badMagic = fixture();
    new Uint8Array(badMagic)[0] = 0;
    expect(() => parseVox(badMagic)).toThrow(/VOX/i);

    expect(() => parseVox(fixture(), { maxFileBytes: 8 })).toThrow(/file.*limit/i);
  });

  it('normalizes MagicaVoxel z-up coordinates and material values', () => {
    const document = parseVox(fixture({ includePalette: true, includeMaterial: true }));
    const scene = normalizeVoxModel(document, 0, 'fixture.vox', 1.25);

    expect(scene.dimensions).toEqual([3, 5, 4]);
    expect(scene.cells[0]).toEqual({ x: 1, y: 3, z: 2, paletteIndex: 1 });
    expect(scene.origin).toEqual([-1.5, -2.5, -2]);
    expect(scene.materials[1]).toMatchObject({ metallic: 0.75, roughness: 0.2 });
    expect(scene.receipt).toMatchObject({ source: 'vox', parseMilliseconds: 1.25, voxelCount: 2 });
  });
});

