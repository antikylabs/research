import { materialTableFromPalette } from '../vox/normalize.ts';
import type { VoxelCell, VoxelScene } from './types.ts';
import { voxelKey } from './types.ts';

type MutableCell = { x: number; y: number; z: number; paletteIndex: number };

const PALETTE: readonly (readonly [number, number, number, number])[] = Array.from(
  { length: 256 },
  (_, index) => {
    const colors: Readonly<Record<number, readonly [number, number, number, number]>> = {
      1: [32, 37, 48, 255],
      2: [91, 99, 112, 255],
      3: [36, 105, 92, 255],
      4: [201, 112, 61, 255],
      5: [255, 190, 75, 255],
      6: [38, 111, 151, 210],
      7: [226, 121, 160, 255],
      8: [74, 45, 38, 255],
      9: [184, 194, 204, 255],
      10: [103, 74, 160, 255],
    };
    return colors[index] ?? [0, 0, 0, index === 0 ? 0 : 255];
  },
);

const SOURCE_MATERIALS = new Map<number, Readonly<Record<string, string>>>([
  [1, Object.freeze({ _type: '_diffuse', _rough: '0.9' })],
  [2, Object.freeze({ _type: '_diffuse', _rough: '0.58' })],
  [3, Object.freeze({ _type: '_diffuse', _rough: '0.82' })],
  [4, Object.freeze({ _type: '_metal', _weight: '0.84', _rough: '0.23' })],
  [5, Object.freeze({ _type: '_emit', _flux: '2.6', _weight: '1' })],
  [6, Object.freeze({ _type: '_glass', _weight: '0.5', _rough: '0.12' })],
  [7, Object.freeze({ _type: '_diffuse', _rough: '0.7' })],
  [8, Object.freeze({ _type: '_diffuse', _rough: '0.92' })],
  [9, Object.freeze({ _type: '_metal', _weight: '0.42', _rough: '0.36' })],
  [10, Object.freeze({ _type: '_diffuse', _rough: '0.62' })],
]);

function fingerprint(cells: readonly VoxelCell[]): string {
  let value = 0x811c9dc5;
  for (const dimension of [32, 24, 32]) {
    value ^= dimension & 0xff;
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  for (const cell of cells) {
    for (const part of [cell.x, cell.y, cell.z, cell.paletteIndex]) {
      value ^= part & 0xff;
      value = Math.imul(value, 0x01000193) >>> 0;
    }
  }
  return value.toString(16).padStart(8, '0');
}

/** Original deterministic hero scene: a small dusk observatory on a floating garden. */
export function createBuiltInScene(): VoxelScene {
  const cells = new Map<string, MutableCell>();
  const put = (x: number, y: number, z: number, paletteIndex: number): void => {
    if (x < 0 || y < 0 || z < 0 || x >= 32 || y >= 24 || z >= 32) return;
    cells.set(voxelKey(x, y, z), { x, y, z, paletteIndex });
  };
  const fill = (
    x0: number, y0: number, z0: number, width: number, height: number, depth: number,
    paletteIndex: number,
  ): void => {
    for (let x = x0; x < x0 + width; x += 1) {
      for (let y = y0; y < y0 + height; y += 1) {
        for (let z = z0; z < z0 + depth; z += 1) put(x, y, z, paletteIndex);
      }
    }
  };

  // Layered floating island. Squared distance gives it authored terraces rather than a sphere.
  for (let y = 0; y <= 4; y += 1) {
    const radius = 10 + y;
    for (let x = 1; x < 31; x += 1) {
      for (let z = 1; z < 31; z += 1) {
        const dx = Math.abs(x - 15.5);
        const dz = Math.abs(z - 15.5);
        if (Math.max(dx, dz) + Math.min(dx, dz) * 0.42 <= radius) {
          put(x, y, z, y === 4 && (x + z) % 7 === 0 ? 3 : y < 2 ? 1 : 2);
        }
      }
    }
  }
  fill(7, 5, 7, 18, 1, 18, 2);
  fill(9, 6, 9, 14, 1, 14, 1);

  // Reflecting basin and its copper lip.
  fill(11, 7, 11, 10, 1, 10, 6);
  for (let x = 10; x <= 21; x += 1) {
    put(x, 7, 10, 4); put(x, 7, 21, 4);
  }
  for (let z = 11; z <= 20; z += 1) {
    put(10, 7, z, 4); put(21, 7, z, 4);
  }

  // Four observatory piers and horizontal lantern braces.
  for (const [x, z] of [[8, 8], [23, 8], [8, 23], [23, 23]] as const) {
    fill(x - 1, 6, z - 1, 3, 9, 3, 1);
    fill(x, 9, z, 1, 3, 1, 5);
  }
  fill(7, 14, 7, 18, 1, 18, 4);
  fill(5, 15, 5, 22, 1, 22, 1);
  fill(7, 16, 7, 18, 1, 18, 9);
  fill(9, 17, 9, 14, 1, 14, 1);
  fill(12, 18, 12, 8, 1, 8, 4);
  fill(14, 19, 14, 4, 1, 4, 1);

  // Cut a square oculus through the stacked roof and edge it in copper.
  for (let y = 14; y <= 19; y += 1) {
    for (let x = 14; x <= 17; x += 1) {
      for (let z = 14; z <= 17; z += 1) cells.delete(voxelKey(x, y, z));
    }
  }
  for (let x = 13; x <= 18; x += 1) {
    put(x, 18, 13, 4); put(x, 18, 18, 4);
  }
  for (let z = 14; z <= 17; z += 1) {
    put(13, 18, z, 4); put(18, 18, z, 4);
  }

  // A floating emissive astrolabe over the basin.
  for (let x = 13; x <= 18; x += 1) {
    for (let y = 9; y <= 14; y += 1) {
      for (let z = 13; z <= 18; z += 1) {
        const distance = Math.abs(x - 15.5) + Math.abs(y - 11.5) + Math.abs(z - 15.5);
        if (distance >= 3.5 && distance <= 4.5) put(x, y, z, 10);
      }
    }
  }
  fill(15, 11, 15, 2, 2, 2, 5);

  // Two small windswept trees keep the silhouette asymmetric.
  for (const [baseX, baseZ, direction] of [[5, 20, -1], [26, 12, 1]] as const) {
    for (let y = 5; y <= 12; y += 1) put(baseX + (y > 9 ? direction : 0), y, baseZ, 8);
    for (let branch = -3; branch <= 3; branch += 1) {
      put(baseX + direction + branch, 11 + Math.abs(branch % 2), baseZ, 8);
      for (let leaf = -1; leaf <= 1; leaf += 1) {
        put(baseX + direction + branch, 12, baseZ + leaf, branch % 2 === 0 ? 7 : 3);
        put(baseX + direction + branch, 13, baseZ + leaf, 7);
      }
    }
  }

  // Path lights guide the eye to the basin.
  for (const z of [7, 10, 21, 24]) {
    for (const x of [13, 18]) {
      put(x, 6, z, 4); put(x, 7, z, 5);
    }
  }

  const frozenCells = Object.freeze([...cells.values()]
    .sort((left, right) => left.y - right.y || left.z - right.z || left.x - right.x)
    .map((cell) => Object.freeze(cell)));
  return Object.freeze({
    name: 'Lumen Observatory',
    dimensions: [32, 24, 32] as const,
    origin: [-16, -8, -16] as const,
    cells: frozenCells,
    materials: materialTableFromPalette(PALETTE, SOURCE_MATERIALS),
    bounds: Object.freeze({ min: [-16, -8, -16] as const, max: [16, 16, 16] as const }),
    receipt: Object.freeze({
      source: 'built-in' as const,
      sourceBytes: 0,
      parseMilliseconds: 0,
      modelCount: 1,
      selectedModel: 0,
      voxelCount: frozenCells.length,
      warnings: Object.freeze([]),
    }),
    fingerprint: fingerprint(frozenCells),
  });
}
