import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createBuiltInScene } from '../scene/built-in.ts';
import { normalizeVoxModel } from './normalize.ts';
import { parseVox } from './parse.ts';

describe('generated .vox evidence fixture', () => {
  it('round-trips the shared geometry through the real binary parser', async () => {
    const file = await readFile(path.resolve(import.meta.dirname, '../../public/models/lumen-observatory.vox'));
    const bytes = new Uint8Array(file).slice().buffer;
    const parsed = normalizeVoxModel(parseVox(bytes), 0, 'lumen-observatory.vox');
    const builtIn = createBuiltInScene();

    expect(parsed.dimensions).toEqual(builtIn.dimensions);
    expect(parsed.cells).toEqual(builtIn.cells);
    expect(parsed.fingerprint).toBe(builtIn.fingerprint);
    expect(parsed.receipt.source).toBe('vox');
    for (const paletteIndex of [4, 5, 6, 9]) {
      expect(parsed.materials[paletteIndex]).toMatchObject({
        roughness: builtIn.materials[paletteIndex]?.roughness,
        metallic: builtIn.materials[paletteIndex]?.metallic,
        glass: builtIn.materials[paletteIndex]?.glass,
      });
      expect(parsed.materials[paletteIndex]?.emission)
        .toBeCloseTo(builtIn.materials[paletteIndex]?.emission ?? 0);
    }
  });
});
