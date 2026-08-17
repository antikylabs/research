import { materialTableFromPalette } from '../vox/normalize.ts';
import type { VoxelCell, VoxelScene } from './types.ts';
import { voxelKey } from './types.ts';

type MutableCell = { x: number; y: number; z: number; paletteIndex: number };

const DESIGN_DIMENSIONS = Object.freeze([192, 128, 256] as const);
const DIMENSIONS = Object.freeze([160, 96, 256] as const);
const ORIGIN = Object.freeze([-80, -20, -128] as const);

const MATERIAL = Object.freeze({
  basalt: 1,
  soil: 2,
  moss: 3,
  plaster: 4,
  timber: 5,
  warmTimber: 6,
  copper: 7,
  amberLight: 8,
  glass: 9,
  terracotta: 10,
  limestone: 11,
  pine: 12,
  leaf: 13,
  flower: 14,
  paintedBlue: 15,
  iron: 16,
  water: 17,
  gravel: 18,
  paper: 19,
  blossom: 20,
  grassLight: 21,
  grassDark: 22,
  roofLight: 23,
  roofDark: 24,
  brick: 25,
  bark: 26,
  leafGold: 27,
  leafDark: 28,
  sandstone: 29,
  path: 30,
  curtain: 31,
  waterHighlight: 32,
  ceramic: 33,
} as const);

const COLORS: Readonly<Record<number, readonly [number, number, number, number]>> = {
  [MATERIAL.basalt]: [25, 30, 34, 255],
  [MATERIAL.soil]: [66, 45, 35, 255],
  [MATERIAL.moss]: [69, 101, 65, 255],
  [MATERIAL.plaster]: [214, 190, 151, 255],
  [MATERIAL.timber]: [58, 35, 28, 255],
  [MATERIAL.warmTimber]: [126, 67, 39, 255],
  [MATERIAL.copper]: [181, 91, 48, 255],
  [MATERIAL.amberLight]: [255, 174, 68, 255],
  [MATERIAL.glass]: [105, 178, 185, 145],
  [MATERIAL.terracotta]: [140, 54, 36, 255],
  [MATERIAL.limestone]: [170, 164, 145, 255],
  [MATERIAL.pine]: [26, 62, 45, 255],
  [MATERIAL.leaf]: [61, 104, 65, 255],
  [MATERIAL.flower]: [190, 57, 51, 255],
  [MATERIAL.paintedBlue]: [49, 90, 111, 255],
  [MATERIAL.iron]: [32, 39, 44, 255],
  [MATERIAL.water]: [55, 124, 139, 170],
  [MATERIAL.gravel]: [122, 111, 96, 255],
  [MATERIAL.paper]: [244, 222, 172, 255],
  [MATERIAL.blossom]: [224, 126, 145, 255],
  [MATERIAL.grassLight]: [91, 126, 72, 255],
  [MATERIAL.grassDark]: [43, 77, 48, 255],
  [MATERIAL.roofLight]: [174, 71, 43, 255],
  [MATERIAL.roofDark]: [91, 38, 34, 255],
  [MATERIAL.brick]: [118, 56, 42, 255],
  [MATERIAL.bark]: [74, 47, 31, 255],
  [MATERIAL.leafGold]: [168, 120, 52, 255],
  [MATERIAL.leafDark]: [35, 72, 50, 255],
  [MATERIAL.sandstone]: [194, 157, 104, 255],
  [MATERIAL.path]: [151, 132, 105, 255],
  [MATERIAL.curtain]: [139, 47, 41, 255],
  [MATERIAL.waterHighlight]: [102, 185, 189, 150],
  [MATERIAL.ceramic]: [45, 103, 124, 255],
};

const PALETTE: readonly (readonly [number, number, number, number])[] = Array.from(
  { length: 256 },
  (_, index) => COLORS[index] ?? [0, 0, 0, index === 0 ? 0 : 255],
);

const SOURCE_MATERIALS = new Map<number, Readonly<Record<string, string>>>([
  [MATERIAL.basalt, Object.freeze({ _type: '_diffuse', _rough: '0.88' })],
  [MATERIAL.soil, Object.freeze({ _type: '_diffuse', _rough: '0.96' })],
  [MATERIAL.moss, Object.freeze({ _type: '_diffuse', _rough: '0.9' })],
  [MATERIAL.plaster, Object.freeze({ _type: '_diffuse', _rough: '0.74' })],
  [MATERIAL.timber, Object.freeze({ _type: '_diffuse', _rough: '0.7' })],
  [MATERIAL.warmTimber, Object.freeze({ _type: '_diffuse', _rough: '0.55' })],
  [MATERIAL.copper, Object.freeze({ _type: '_metal', _weight: '0.9', _rough: '0.2' })],
  [MATERIAL.amberLight, Object.freeze({ _type: '_emit', _flux: '5.2', _weight: '1' })],
  [MATERIAL.glass, Object.freeze({ _type: '_glass', _weight: '0.82', _rough: '0.08' })],
  [MATERIAL.terracotta, Object.freeze({ _type: '_diffuse', _rough: '0.62' })],
  [MATERIAL.limestone, Object.freeze({ _type: '_diffuse', _rough: '0.84' })],
  [MATERIAL.pine, Object.freeze({ _type: '_diffuse', _rough: '0.92' })],
  [MATERIAL.leaf, Object.freeze({ _type: '_diffuse', _rough: '0.86' })],
  [MATERIAL.flower, Object.freeze({ _type: '_diffuse', _rough: '0.76' })],
  [MATERIAL.paintedBlue, Object.freeze({ _type: '_metal', _weight: '0.18', _rough: '0.46' })],
  [MATERIAL.iron, Object.freeze({ _type: '_metal', _weight: '0.72', _rough: '0.3' })],
  [MATERIAL.water, Object.freeze({ _type: '_glass', _weight: '0.94', _rough: '0.05' })],
  [MATERIAL.gravel, Object.freeze({ _type: '_diffuse', _rough: '0.98' })],
  [MATERIAL.paper, Object.freeze({ _type: '_diffuse', _rough: '0.66' })],
  [MATERIAL.blossom, Object.freeze({ _type: '_diffuse', _rough: '0.8' })],
  [MATERIAL.grassLight, Object.freeze({ _type: '_diffuse', _rough: '0.92' })],
  [MATERIAL.grassDark, Object.freeze({ _type: '_diffuse', _rough: '0.94' })],
  [MATERIAL.roofLight, Object.freeze({ _type: '_diffuse', _rough: '0.58' })],
  [MATERIAL.roofDark, Object.freeze({ _type: '_diffuse', _rough: '0.7' })],
  [MATERIAL.brick, Object.freeze({ _type: '_diffuse', _rough: '0.82' })],
  [MATERIAL.bark, Object.freeze({ _type: '_diffuse', _rough: '0.94' })],
  [MATERIAL.leafGold, Object.freeze({ _type: '_diffuse', _rough: '0.84' })],
  [MATERIAL.leafDark, Object.freeze({ _type: '_diffuse', _rough: '0.92' })],
  [MATERIAL.sandstone, Object.freeze({ _type: '_diffuse', _rough: '0.78' })],
  [MATERIAL.path, Object.freeze({ _type: '_diffuse', _rough: '0.96' })],
  [MATERIAL.curtain, Object.freeze({ _type: '_diffuse', _rough: '0.82' })],
  [MATERIAL.waterHighlight, Object.freeze({ _type: '_glass', _weight: '0.98', _rough: '0.025' })],
  [MATERIAL.ceramic, Object.freeze({ _type: '_diffuse', _rough: '0.38' })],
]);

function fingerprint(cells: readonly VoxelCell[]): string {
  let value = 0x811c9dc5;
  for (const dimension of DIMENSIONS) {
    for (let shift = 0; shift < 32; shift += 8) {
      value ^= (dimension >>> shift) & 0xff;
      value = Math.imul(value, 0x01000193) >>> 0;
    }
  }
  for (const cell of cells) {
    for (const part of [cell.x, cell.y, cell.z, cell.paletteIndex]) {
      value ^= part & 0xff;
      value = Math.imul(value, 0x01000193) >>> 0;
    }
  }
  return value.toString(16).padStart(8, '0');
}

function hash2(x: number, z: number): number {
  let value = Math.imul(x + 0x6d2b79f5, 0x1b873593) ^ Math.imul(z + 0x85ebca6b, 0x27d4eb2d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x2c1b3c6d);
  value ^= value >>> 12;
  return value >>> 0;
}

/** Original high-resolution environment: a golden-hour atelier within a continuous valley. */
export function createBuiltInScene(): VoxelScene {
  const cells = new Map<string, MutableCell>();
  const terrainTops = new Int16Array(DESIGN_DIMENSIONS[0] * DESIGN_DIMENSIONS[2]);
  const scaleX = (x: number): number => Math.floor(x * DIMENSIONS[0] / DESIGN_DIMENSIONS[0]);
  const scaleY = (y: number): number => Math.floor(y * DIMENSIONS[1] / DESIGN_DIMENSIONS[1]);
  const scaleZ = (z: number): number => Math.floor(z * DIMENSIONS[2] / DESIGN_DIMENSIONS[2]);
  const put = (x: number, y: number, z: number, paletteIndex: number): void => {
    const outputX = scaleX(x);
    const outputY = scaleY(y);
    const outputZ = scaleZ(z);
    if (outputX < 0 || outputY < 0 || outputZ < 0
      || outputX >= DIMENSIONS[0] || outputY >= DIMENSIONS[1] || outputZ >= DIMENSIONS[2]) return;
    cells.set(voxelKey(outputX, outputY, outputZ), {
      x: outputX,
      y: outputY,
      z: outputZ,
      paletteIndex,
    });
  };
  const remove = (x: number, y: number, z: number): void => {
    cells.delete(voxelKey(scaleX(x), scaleY(y), scaleZ(z)));
  };
  const fill = (
    x0: number,
    y0: number,
    z0: number,
    width: number,
    height: number,
    depth: number,
    paletteIndex: number,
  ): void => {
    for (let x = x0; x < x0 + width; x += 1) {
      for (let y = y0; y < y0 + height; y += 1) {
        for (let z = z0; z < z0 + depth; z += 1) put(x, y, z, paletteIndex);
      }
    }
  };
  const removeBox = (
    x0: number,
    y0: number,
    z0: number,
    width: number,
    height: number,
    depth: number,
  ): void => {
    for (let x = x0; x < x0 + width; x += 1) {
      for (let y = y0; y < y0 + height; y += 1) {
        for (let z = z0; z < z0 + depth; z += 1) remove(x, y, z);
      }
    }
  };
  const shell = (
    x0: number,
    y0: number,
    z0: number,
    width: number,
    height: number,
    depth: number,
    thickness: number,
    paletteIndex: number,
  ): void => {
    fill(x0, y0, z0, width, thickness, depth, paletteIndex);
    fill(x0, y0 + height - thickness, z0, width, thickness, depth, paletteIndex);
    fill(x0, y0 + thickness, z0, thickness, height - thickness * 2, depth, paletteIndex);
    fill(x0 + width - thickness, y0 + thickness, z0, thickness, height - thickness * 2, depth, paletteIndex);
    fill(x0 + thickness, y0 + thickness, z0, width - thickness * 2, height - thickness * 2, thickness, paletteIndex);
    fill(
      x0 + thickness,
      y0 + thickness,
      z0 + depth - thickness,
      width - thickness * 2,
      height - thickness * 2,
      thickness,
      paletteIndex,
    );
  };
  const terrainTop = (x: number, z: number): number => terrainTops[z * DESIGN_DIMENSIONS[0] + x] ?? 0;
  const divisionLine = (offset: number, extent: number, divisions: number): boolean => {
    for (let division = 0; division <= divisions; division += 1) {
      if (Math.abs(offset - Math.round((extent - 1) * division / divisions)) <= 1) return true;
    }
    return false;
  };
  const foliageCloud = (
    centerX: number,
    centerY: number,
    centerZ: number,
    radiusX: number,
    radiusY: number,
    radiusZ: number,
    primary: number = MATERIAL.leaf,
    accent: number = MATERIAL.leafGold,
  ): void => {
    for (let x = centerX - radiusX; x <= centerX + radiusX; x += 1) {
      for (let y = centerY - radiusY; y <= centerY + radiusY; y += 1) {
        for (let z = centerZ - radiusZ; z <= centerZ + radiusZ; z += 1) {
          const dx = (x - centerX) / Math.max(radiusX, 1);
          const dy = (y - centerY) / Math.max(radiusY, 1);
          const dz = (z - centerZ) / Math.max(radiusZ, 1);
          const erosion = (hash2(x + y * 13, z - y * 7) & 15) * 0.011;
          if (dx * dx + dy * dy + dz * dz <= 1.03 - erosion) {
            const choice = hash2(x + y, z + y) % 17;
            put(x, y, z, choice === 0 ? accent : choice < 4 ? MATERIAL.leafDark : primary);
          }
        }
      }
    }
  };
  const pineTree = (centerX: number, baseY: number, centerZ: number, height: number): void => {
    const trunkWidth = height > 34 ? 3 : 2;
    fill(centerX, baseY, centerZ, trunkWidth, height - 3, trunkWidth, MATERIAL.bark);
    const crownBottom = baseY + Math.floor(height * 0.3);
    const crownTop = baseY + height;
    for (let y = crownBottom; y <= crownTop; y += 2) {
      const normalized = (crownTop - y) / Math.max(crownTop - crownBottom, 1);
      const tier = Math.floor((y - crownBottom) / 4);
      const radius = Math.max(1, Math.round(normalized * (height * 0.23)) - (tier % 2));
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          const jagged = hash2(centerX + dx + y, centerZ + dz) % 5;
          if (Math.abs(dx) + Math.abs(dz) <= radius + Math.floor(radius / 2) - (jagged === 0 ? 1 : 0)) {
            put(centerX + dx, y, centerZ + dz, jagged === 1 ? MATERIAL.leafDark : MATERIAL.pine);
            if ((Math.abs(dx) + Math.abs(dz)) % 5 === 0) {
              put(centerX + dx, y + 1, centerZ + dz, MATERIAL.pine);
            }
          }
        }
      }
    }
  };
  const deciduousTree = (
    centerX: number,
    baseY: number,
    centerZ: number,
    height: number,
    gold = false,
  ): void => {
    const trunkHeight = Math.floor(height * 0.62);
    fill(centerX - 1, baseY, centerZ - 1, 3, trunkHeight, 3, MATERIAL.bark);
    for (const [dx, dz] of [[-8, -2], [7, 1], [-3, 7], [4, -7]] as const) {
      const branchY = baseY + Math.floor(trunkHeight * 0.58);
      const steps = Math.max(Math.abs(dx), Math.abs(dz));
      for (let step = 0; step <= steps; step += 1) {
        const x = centerX + Math.round(dx * step / steps);
        const z = centerZ + Math.round(dz * step / steps);
        const y = branchY + Math.floor(step * 0.55);
        fill(x, y, z, 2, 2, 2, MATERIAL.bark);
      }
    }
    const crownY = baseY + trunkHeight;
    const primary = gold ? MATERIAL.leafGold : MATERIAL.leaf;
    const accent = gold ? MATERIAL.blossom : MATERIAL.leafGold;
    foliageCloud(centerX, crownY, centerZ, 12, 10, 11, primary, accent);
    foliageCloud(centerX - 9, crownY - 1, centerZ + 2, 8, 8, 8, primary, accent);
    foliageCloud(centerX + 8, crownY + 2, centerZ - 2, 9, 8, 8, primary, accent);
    foliageCloud(centerX + 1, crownY + 5, centerZ + 7, 8, 7, 8, primary, accent);
  };

  // The valley floor reaches every boundary. Its rolling background rises into real hills,
  // while the central building site stays gently graded rather than sitting on a plinth.
  for (let x = 0; x < DESIGN_DIMENSIONS[0]; x += 1) {
    for (let z = 0; z < DESIGN_DIMENSIONS[2]; z += 1) {
      const broadRoll = Math.sin(x * 0.071) * 2.2 + Math.cos(z * 0.053) * 1.7;
      const detail = ((hash2(x, z) % 7) - 3) * 0.22;
      const backgroundRise = z < 82 ? (82 - z) * 0.24 : 0;
      const leftHillDistance = Math.hypot((x - 35) / 54, (z - 30) / 45);
      const rightHillDistance = Math.hypot((x - 156) / 61, (z - 22) / 49);
      const hills = Math.max(0, 1 - leftHillDistance) * 15 + Math.max(0, 1 - rightHillDistance) * 18;
      let height = Math.round(25 + broadRoll + detail + backgroundRise + hills);
      const siteDistance = Math.max(Math.abs(x - 94) / 72, Math.abs(z - 112) / 57);
      if (siteDistance < 1) {
        const siteBlend = Math.min(1, (1 - siteDistance) * 1.7);
        height = Math.round(height * (1 - siteBlend) + 28 * siteBlend);
      }
      height = Math.max(18, Math.min(68, height));
      terrainTops[z * DESIGN_DIMENSIONS[0] + x] = height;
      const surfaceNoise = hash2(x * 3, z * 5) % 19;
      const surface = surfaceNoise < 3
        ? MATERIAL.grassLight
        : surfaceNoise === 18 ? MATERIAL.moss : MATERIAL.grassDark;
      for (let y = Math.max(1, height - 5); y <= height; y += 1) {
        put(x, y, z, y === height ? surface : y >= height - 2 ? MATERIAL.soil : MATERIAL.basalt);
      }
    }
  }

  // A winding gravel path starts in the near field and lands precisely at the front steps.
  for (let z = 137; z < DESIGN_DIMENSIONS[2]; z += 1) {
    const progress = (z - 137) / (DESIGN_DIMENSIONS[2] - 138);
    const center = Math.round(95 + Math.sin(progress * Math.PI * 1.7) * 7 + progress * 8);
    const halfWidth = 6 + Math.round(progress * 5);
    for (let x = center - halfWidth; x <= center + halfWidth; x += 1) {
      const y = terrainTop(x, z);
      const edge = Math.abs(x - center) >= halfWidth - 1;
      put(x, y, z, edge ? MATERIAL.gravel : (hash2(x, z) % 7 === 0 ? MATERIAL.sandstone : MATERIAL.path));
    }
  }
  for (let step = 0; step < 32; step += 1) {
    const z = 145 + step * 3;
    const progress = (z - 137) / (DESIGN_DIMENSIONS[2] - 138);
    const center = Math.round(95 + Math.sin(progress * Math.PI * 1.7) * 7 + progress * 8);
    const y = terrainTop(center, z) + 1;
    fill(center - 5, y, z, 10, 1, 2, step % 3 === 0 ? MATERIAL.limestone : MATERIAL.sandstone);
  }

  // The atelier foundation follows the terrain, with stone courses rather than a freestanding base.
  fill(37, 27, 70, 110, 4, 76, MATERIAL.limestone);
  for (let x = 37; x < 147; x += 1) {
    for (let z = 70; z < 146; z += 1) {
      if (x < 40 || x >= 144 || z < 73 || z >= 143) {
        put(x, 31, z, (x + z) % 6 === 0 ? MATERIAL.sandstone : MATERIAL.limestone);
      }
    }
  }
  fill(40, 31, 74, 104, 1, 68, MATERIAL.warmTimber);

  // The 104-voxel facade is a hollow, inhabitable shell with three-voxel-deep walls.
  shell(40, 31, 74, 104, 50, 68, 3, MATERIAL.plaster);
  for (const y of [31, 53, 78]) {
    fill(38, y, 72, 108, 3, 3, MATERIAL.timber);
    fill(38, y, 141, 108, 3, 3, MATERIAL.timber);
  }
  for (const x of [40, 82, 108, 141]) fill(x, 31, 140, 3, 50, 4, MATERIAL.timber);
  for (const z of [74, 102, 139]) {
    fill(39, 31, z, 4, 50, 3, MATERIAL.timber);
    fill(141, 31, z, 4, 50, 3, MATERIAL.timber);
  }

  const frontWindow = (
    x0: number,
    y0: number,
    width: number,
    height: number,
    columns: number,
    rows: number,
  ): void => {
    removeBox(x0, y0, 138, width, height, 6);
    fill(x0 - 2, y0 - 2, 139, width + 4, 2, 6, MATERIAL.limestone);
    fill(x0 - 2, y0 + height, 139, width + 4, 3, 7, MATERIAL.sandstone);
    fill(x0 - 2, y0, 139, 2, height, 6, MATERIAL.limestone);
    fill(x0 + width, y0, 139, 2, height, 6, MATERIAL.limestone);
    for (let x = x0; x < x0 + width; x += 1) {
      for (let y = y0; y < y0 + height; y += 1) {
        const frame = divisionLine(x - x0, width, columns) || divisionLine(y - y0, height, rows);
        if (!frame) put(x, y, 139, MATERIAL.amberLight);
        put(x, y, 144, frame ? MATERIAL.timber : MATERIAL.glass);
      }
    }
    fill(x0 + 3, y0 + 3, 140, 2, height - 6, 1, MATERIAL.curtain);
    fill(x0 + width - 5, y0 + 3, 140, 2, height - 6, 1, MATERIAL.curtain);
    for (let x = x0 - 1; x <= x0 + width; x += 4) put(x, y0 + height + 3, 144, MATERIAL.copper);
  };
  frontWindow(48, 42, 29, 28, 3, 2);
  frontWindow(114, 42, 25, 28, 3, 2);

  // A 22-voxel-wide door leaf has a proper frame, transom, recessed panels and hardware.
  removeBox(81, 31, 138, 28, 48, 7);
  fill(80, 30, 138, 3, 50, 8, MATERIAL.limestone);
  fill(107, 30, 138, 3, 50, 8, MATERIAL.limestone);
  fill(80, 77, 138, 30, 3, 8, MATERIAL.limestone);
  fill(83, 32, 144, 24, 39, 2, MATERIAL.warmTimber);
  fill(83, 32, 145, 24, 3, 2, MATERIAL.timber);
  fill(83, 68, 145, 24, 3, 2, MATERIAL.timber);
  fill(83, 35, 145, 3, 33, 2, MATERIAL.timber);
  fill(104, 35, 145, 3, 33, 2, MATERIAL.timber);
  fill(94, 35, 145, 3, 33, 2, MATERIAL.timber);
  fill(83, 50, 145, 24, 3, 2, MATERIAL.timber);
  for (const [x, y, width, height, material] of [
    [87, 37, 6, 11, MATERIAL.paintedBlue],
    [98, 37, 5, 11, MATERIAL.paintedBlue],
    [87, 54, 6, 11, MATERIAL.plaster],
    [98, 54, 5, 11, MATERIAL.plaster],
  ] as const) {
    fill(x, y, 146, width, height, 1, MATERIAL.timber);
    fill(x + 1, y + 1, 147, width - 2, height - 2, 1, material);
  }
  fill(85, 72, 144, 20, 6, 1, MATERIAL.amberLight);
  for (let x = 83; x < 107; x += 1) {
    for (let y = 71; y < 79; y += 1) {
      const frame = divisionLine(x - 83, 24, 4) || divisionLine(y - 71, 8, 1);
      put(x, y, 145, frame ? MATERIAL.timber : MATERIAL.glass);
    }
  }
  fill(101, 49, 147, 2, 3, 2, MATERIAL.copper);
  put(102, 50, 149, MATERIAL.iron);
  fill(79, 29, 143, 32, 2, 9, MATERIAL.limestone);

  const sideWindow = (z0: number, y0: number, width: number, height: number): void => {
    removeBox(140, y0, z0, 6, height, width);
    fill(140, y0 - 2, z0 - 2, 6, 2, width + 4, MATERIAL.limestone);
    fill(140, y0 + height, z0 - 2, 6, 3, width + 4, MATERIAL.sandstone);
    for (let z = z0; z < z0 + width; z += 1) {
      for (let y = y0; y < y0 + height; y += 1) {
        const frame = divisionLine(z - z0, width, 3) || divisionLine(y - y0, height, 2);
        if (!frame) put(140, y, z, MATERIAL.amberLight);
        put(145, y, z, frame ? MATERIAL.timber : MATERIAL.glass);
      }
    }
  };
  sideWindow(82, 43, 22, 25);
  sideWindow(111, 43, 22, 25);

  // The front gable includes diagonal timbering beneath a roof made from individual tile rows.
  for (let y = 81; y <= 112; y += 1) {
    const halfWidth = Math.max(1, Math.round((112 - y) / 0.56));
    const x0 = 92 - halfWidth;
    const x1 = 92 + halfWidth;
    for (let x = x0; x <= x1; x += 1) {
      for (let z = 140; z <= 142; z += 1) put(x, y, z, MATERIAL.plaster);
    }
    put(92, y, 143, MATERIAL.timber);
    put(93, y, 143, MATERIAL.timber);
    const diagonal = Math.max(0, Math.round((y - 81) / 0.56));
    put(40 + diagonal, y, 143, MATERIAL.timber);
    put(143 - diagonal, y, 143, MATERIAL.timber);
  }
  for (let x = 34; x <= 150; x += 1) {
    const slopeDistance = Math.min(x - 34, 150 - x);
    const roofY = 80 + Math.floor(slopeDistance * 0.56);
    for (let z = 68; z <= 149; z += 1) {
      const tileRow = Math.floor((z - 68) / 4);
      const tile = (tileRow + Math.floor(x / 5)) % 5 === 0
        ? MATERIAL.roofDark
        : (x + tileRow) % 3 === 0 ? MATERIAL.roofLight : MATERIAL.terracotta;
      put(x, roofY - 1, z, MATERIAL.roofDark);
      put(x, roofY, z, tile);
      if ((z - 68) % 4 === 0 && x % 3 !== 0) put(x, roofY + 1, z, tile);
    }
  }
  fill(90, 111, 66, 5, 4, 86, MATERIAL.roofDark);
  for (let z = 67; z <= 150; z += 3) fill(89, 115, z, 7, 1, 2, MATERIAL.copper);
  for (let x = 34; x <= 150; x += 1) {
    const roofY = 80 + Math.floor(Math.min(x - 34, 150 - x) * 0.56);
    put(x, roofY - 1, 150, MATERIAL.timber);
    put(x, roofY, 150, MATERIAL.copper);
  }

  // Brick chimney, cap, roof skylights and copper drainage add readable sub-voxel-scale detail.
  shell(56, 94, 87, 13, 27, 14, 2, MATERIAL.brick);
  for (let y = 96; y < 119; y += 4) {
    for (let x = 56; x < 69; x += 4) put(x, y, 101, MATERIAL.sandstone);
    for (let z = 87; z < 101; z += 4) put(69, y, z, MATERIAL.sandstone);
  }
  fill(54, 121, 85, 17, 3, 18, MATERIAL.basalt);
  fill(58, 124, 89, 3, 2, 3, MATERIAL.iron);
  fill(65, 124, 96, 3, 2, 3, MATERIAL.iron);
  for (let x = 119; x <= 132; x += 1) {
    const roofY = 80 + Math.floor(Math.min(x - 34, 150 - x) * 0.56);
    for (let z = 99; z <= 118; z += 1) {
      const frame = x === 119 || x === 132 || z === 99 || z === 118 || x === 125 || z === 109;
      put(x, roofY + 1, z, frame ? MATERIAL.copper : MATERIAL.glass);
    }
  }
  fill(145, 72, 143, 2, 9, 4, MATERIAL.copper);
  for (let y = 31; y < 73; y += 1) put(146, y, 143, MATERIAL.copper);
  fill(144, 29, 141, 5, 3, 5, MATERIAL.limestone);

  // Veranda boards, turned posts, railings, lamps, bench and broad stairs occupy the midground.
  fill(36, 31, 143, 113, 3, 18, MATERIAL.warmTimber);
  for (let z = 144; z < 161; z += 3) fill(37, 34, z, 111, 1, 1, MATERIAL.timber);
  for (const x of [39, 65, 119, 145]) {
    fill(x, 34, 156, 4, 31, 4, MATERIAL.timber);
    fill(x + 1, 65, 155, 2, 2, 6, MATERIAL.copper);
  }
  fill(38, 65, 154, 110, 3, 6, MATERIAL.timber);
  for (let x = 42; x <= 144; x += 5) {
    if (x >= 77 && x <= 112) continue;
    fill(x, 35, 158, 2, 10, 2, MATERIAL.timber);
    fill(x - 1, 44, 157, 4, 2, 3, MATERIAL.timber);
  }
  for (const x of [56, 126]) {
    fill(x, 54, 157, 5, 7, 3, MATERIAL.paper);
    fill(x, 56, 157, 5, 3, 3, MATERIAL.amberLight);
    fill(x + 1, 52, 158, 3, 2, 1, MATERIAL.copper);
    fill(x + 1, 61, 158, 3, 2, 1, MATERIAL.copper);
  }
  fill(45, 35, 151, 24, 3, 6, MATERIAL.warmTimber);
  fill(45, 38, 152, 3, 11, 4, MATERIAL.iron);
  fill(66, 38, 152, 3, 11, 4, MATERIAL.iron);
  fill(48, 45, 153, 18, 3, 3, MATERIAL.warmTimber);
  for (let step = 0; step < 7; step += 1) {
    fill(78 - step, 30 - step, 160 + step * 2, 35 + step * 2, 1, 3, MATERIAL.limestone);
  }

  // The pond is cut into the valley floor, so water, shore, garden and house share one landscape.
  const pondCenterX = 162;
  const pondCenterZ = 119;
  const pondRadiusX = 27;
  const pondRadiusZ = 39;
  for (let x = 132; x <= 191; x += 1) {
    for (let z = 76; z <= 164; z += 1) {
      const dx = (x - pondCenterX) / pondRadiusX;
      const dz = (z - pondCenterZ) / pondRadiusZ;
      const distance = dx * dx + dz * dz;
      if (distance <= 1) {
        for (let y = 18; y <= 72; y += 1) remove(x, y, z);
        const basin = 21 + Math.min(4, Math.floor(distance * 5));
        for (let y = basin - 2; y <= basin; y += 1) put(x, y, z, y === basin ? MATERIAL.soil : MATERIAL.basalt);
        put(x, 27, z, hash2(x, z) % 13 === 0 ? MATERIAL.waterHighlight : MATERIAL.water);
      } else if (distance <= 1.18) {
        const y = terrainTop(x, z) + 1;
        put(x, y, z, hash2(x, z) % 4 === 0 ? MATERIAL.sandstone : MATERIAL.limestone);
      }
    }
  }
  for (const [x, z, radius] of [
    [145, 100, 4], [154, 130, 5], [174, 94, 4], [177, 142, 5], [164, 157, 4],
  ] as const) {
    fill(x - radius, 28, z - radius, radius * 2 + 1, 1, radius * 2 + 1, MATERIAL.leaf);
    fill(x - radius + 1, 29, z - radius + 1, radius * 2 - 1, 1, radius * 2 - 1, MATERIAL.water);
    fill(x - 1, 30, z - 1, 3, 2, 3, MATERIAL.flower);
  }
  fill(132, 32, 116, 35, 3, 10, MATERIAL.warmTimber);
  for (let x = 134; x < 167; x += 5) fill(x, 28, 118, 2, 4, 6, MATERIAL.iron);
  fill(129, 35, 114, 5, 10, 14, MATERIAL.timber);
  fill(166, 28, 117, 4, 10, 8, MATERIAL.timber);

  // Garden beds, espalier, pots and flowers bridge the architecture into the surrounding field.
  for (let x = 18; x <= 76; x += 1) {
    const z = 133 + Math.round(Math.sin(x * 0.19) * 3);
    const y = terrainTop(x, z) + 1;
    fill(x, y, z, 1, 3 + hash2(x, z) % 3, 2, x % 7 === 0 ? MATERIAL.sandstone : MATERIAL.limestone);
  }
  for (const [x0, z0, width, depth] of [
    [46, 164, 21, 12], [121, 166, 18, 11], [19, 119, 18, 13], [151, 169, 20, 12],
  ] as const) {
    const y = terrainTop(x0, z0) + 1;
    fill(x0, y, z0, width, 2, depth, MATERIAL.warmTimber);
    fill(x0 + 2, y + 2, z0 + 2, width - 4, 1, depth - 4, MATERIAL.soil);
    for (let x = x0 + 3; x < x0 + width - 2; x += 3) {
      for (let z = z0 + 3; z < z0 + depth - 2; z += 3) {
        fill(x, y + 3, z, 1, 3 + hash2(x, z) % 4, 1, MATERIAL.leaf);
        put(x, y + 6 + hash2(x, z) % 3, z, (x + z) % 2 === 0 ? MATERIAL.flower : MATERIAL.blossom);
      }
    }
  }
  for (const [x, z] of [[34, 154], [70, 158], [116, 158], [142, 158], [25, 102], [151, 69]] as const) {
    const y = terrainTop(x, z) + 1;
    fill(x - 2, y, z - 2, 5, 4, 5, MATERIAL.ceramic);
    fill(x - 1, y + 4, z - 1, 3, 6, 3, MATERIAL.leaf);
    put(x, y + 10, z, MATERIAL.blossom);
  }
  for (const [x, z] of [[77, 170], [116, 178], [68, 187], [136, 183], [85, 211], [128, 231]] as const) {
    const y = terrainTop(x, z) + 1;
    fill(x, y, z, 3, 8, 3, MATERIAL.iron);
    fill(x - 1, y + 8, z - 1, 5, 6, 5, MATERIAL.paper);
    fill(x, y + 10, z, 3, 3, 3, MATERIAL.amberLight);
    fill(x - 1, y + 14, z - 1, 5, 1, 5, MATERIAL.copper);
  }

  // Near-field rocks and tall plants deliberately cross the focal plane for visible depth of field.
  for (const [x, z, radius] of [
    [20, 178, 7], [35, 185, 4], [150, 184, 6], [177, 172, 8], [10, 151, 5], [186, 158, 5],
    [24, 226, 6], [163, 238, 7],
  ] as const) {
    const baseY = terrainTop(x, z) + 1;
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        const height = Math.max(0, radius - Math.floor(Math.hypot(dx, dz)));
        for (let dy = 0; dy <= height; dy += 1) {
          put(x + dx, baseY + dy, z + dz, (dx + dz + dy) % 5 === 0 ? MATERIAL.limestone : MATERIAL.basalt);
        }
      }
    }
  }
  for (let index = 0; index < 90; index += 1) {
    const x = 5 + hash2(index, 71) % 182;
    const z = 148 + hash2(index, 97) % 100;
    if (x > 72 && x < 131 && z > 164) continue;
    const y = terrainTop(x, z) + 1;
    const height = 3 + hash2(index, 113) % 9;
    fill(x, y, z, 1, height, 1, index % 11 === 0 ? MATERIAL.flower : MATERIAL.grassLight);
    if (index % 4 === 0) put(x + 1, y + height - 2, z, MATERIAL.grassDark);
  }

  // Midground specimen trees frame the house; foreground trunks and crowns provide near blur.
  deciduousTree(24, terrainTop(24, 111) + 1, 111, 39, true);
  deciduousTree(21, terrainTop(21, 151) + 1, 151, 43);
  deciduousTree(177, terrainTop(177, 169) + 1, 169, 44, true);
  deciduousTree(7, terrainTop(7, 184) + 1, 184, 48);
  deciduousTree(187, terrainTop(187, 185) + 1, 185, 50, true);
  deciduousTree(10, terrainTop(10, 225) + 1, 225, 45);
  deciduousTree(181, terrainTop(181, 236) + 1, 236, 48, true);

  // Multiple forest bands and the rising terrain create a true far field behind the atelier.
  for (const [x, z, height] of [
    [8, 33, 38], [22, 47, 34], [35, 22, 42], [49, 55, 32], [63, 30, 39],
    [76, 59, 31], [91, 28, 44], [108, 50, 35], [122, 19, 46], [137, 58, 33],
    [151, 31, 42], [166, 52, 36], [181, 24, 45], [14, 76, 32], [55, 71, 29],
    [100, 70, 30], [144, 73, 31], [184, 68, 34],
  ] as const) {
    pineTree(x, terrainTop(x, z) + 1, z, height);
  }
  for (const [x, z, height] of [[31, 69, 35], [72, 44, 37], [116, 61, 34], [160, 64, 38]] as const) {
    deciduousTree(x, terrainTop(x, z) + 1, z, height, (x + z) % 2 === 0);
  }

  // Small background lights and stone ruins keep the distant silhouettes from becoming a flat wall.
  for (const [x, z] of [[18, 63], [52, 58], [83, 63], [131, 62], [173, 59]] as const) {
    const y = terrainTop(x, z) + 1;
    fill(x, y, z, 2, 9, 2, MATERIAL.iron);
    fill(x - 1, y + 9, z - 1, 4, 4, 4, MATERIAL.paper);
    fill(x, y + 10, z, 2, 2, 2, MATERIAL.amberLight);
    put(x, y + 13, z, MATERIAL.copper);
  }
  for (let x = 2; x < 190; x += 1) {
    const z = 7 + Math.round(Math.sin(x * 0.11) * 3);
    const y = terrainTop(x, z) + 1;
    fill(x, y, z, 1, 2 + (x % 4 === 0 ? 2 : 0), 2, x % 6 === 0 ? MATERIAL.sandstone : MATERIAL.limestone);
  }

  const frozenCells = Object.freeze([...cells.values()]
    .sort((left, right) => left.y - right.y || left.z - right.z || left.x - right.x)
    .map((cell) => Object.freeze(cell)));
  return Object.freeze({
    name: 'Golden Hour Valley Atelier',
    dimensions: DIMENSIONS,
    origin: ORIGIN,
    cells: frozenCells,
    materials: materialTableFromPalette(PALETTE, SOURCE_MATERIALS),
    bounds: Object.freeze({
      min: ORIGIN,
      max: [
        ORIGIN[0] + DIMENSIONS[0],
        ORIGIN[1] + DIMENSIONS[1],
        ORIGIN[2] + DIMENSIONS[2],
      ] as const,
    }),
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
