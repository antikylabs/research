import { STUDIO_MATERIAL_IDS as M, STUDIO_MATERIALS } from './built-in.ts';
import type {
  Vec3Tuple,
  VoxelCell,
  VoxelMaterial,
  VoxelScene,
} from './types.ts';
import { voxelKey } from './types.ts';

export type EnvironmentId =
  | 'pedestal'
  | 'forest'
  | 'snow-forest'
  | 'mountains'
  | 'beach'
  | 'swamp';

export const ENVIRONMENT_PRESETS: readonly Readonly<{
  id: EnvironmentId;
  label: string;
}>[] = Object.freeze([
  Object.freeze({ id: 'pedestal', label: 'Pedestal studio' }),
  Object.freeze({ id: 'forest', label: 'Forest' }),
  Object.freeze({ id: 'snow-forest', label: 'Snow forest' }),
  Object.freeze({ id: 'mountains', label: 'Mountains' }),
  Object.freeze({ id: 'beach', label: 'Beach' }),
  Object.freeze({ id: 'swamp', label: 'Swamp' }),
]);

type MutableCell = { x: number; y: number; z: number; paletteIndex: number };
type CellMap = Map<string, MutableCell>;

function fingerprint(
  dimensions: Vec3Tuple,
  cells: readonly VoxelCell[],
  salt: string,
): string {
  let hash = 0x811c9dc5;
  const add = (value: number): void => {
    hash ^= value & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  for (const value of dimensions) add(value);
  for (const character of salt) add(character.charCodeAt(0));
  for (const cell of cells) {
    add(cell.x); add(cell.y); add(cell.z); add(cell.paletteIndex);
  }
  return hash.toString(16).padStart(8, '0');
}

function put(cells: CellMap, x: number, y: number, z: number, paletteIndex: number): void {
  cells.set(voxelKey(x, y, z), { x, y, z, paletteIndex });
}

function fill(
  cells: CellMap,
  x0: number,
  y0: number,
  z0: number,
  width: number,
  height: number,
  depth: number,
  paletteIndex: number,
): void {
  for (let y = y0; y < y0 + height; y += 1) {
    for (let z = z0; z < z0 + depth; z += 1) {
      for (let x = x0; x < x0 + width; x += 1) put(cells, x, y, z, paletteIndex);
    }
  }
}

function shell(
  cells: CellMap,
  x0: number,
  y0: number,
  z0: number,
  width: number,
  height: number,
  depth: number,
  paletteIndex: number,
): void {
  fill(cells, x0, y0, z0, width, 1, depth, paletteIndex);
  fill(cells, x0, y0 + height - 1, z0, width, 1, depth, paletteIndex);
  fill(cells, x0, y0, z0, 1, height, depth, paletteIndex);
  fill(cells, x0 + width - 1, y0, z0, 1, height, depth, paletteIndex);
  fill(cells, x0, y0, z0, width, height, 1, paletteIndex);
  fill(cells, x0, y0, z0 + depth - 1, width, height, 1, paletteIndex);
}

function freezeScene(name: string, dimensions: Vec3Tuple, cells: CellMap): VoxelScene {
  const frozen = Object.freeze([...cells.values()]
    .sort((left, right) => left.y - right.y || left.z - right.z || left.x - right.x)
    .map((cell) => Object.freeze(cell)));
  const origin: Vec3Tuple = [-dimensions[0] / 2, 0, -dimensions[2] / 2];
  return Object.freeze({
    name,
    dimensions,
    origin,
    cells: frozen,
    materials: STUDIO_MATERIALS,
    bounds: Object.freeze({
      min: origin,
      max: [origin[0] + dimensions[0], dimensions[1], origin[2] + dimensions[2]] as const,
    }),
    receipt: Object.freeze({
      source: 'built-in',
      sourceBytes: 0,
      parseMilliseconds: 0,
      modelCount: 1,
      selectedModel: 0,
      voxelCount: frozen.length,
      warnings: Object.freeze([]),
    }),
    fingerprint: fingerprint(dimensions, frozen, name),
  });
}

function lanternPavilion(): VoxelScene {
  const cells: CellMap = new Map();
  const dimensions: Vec3Tuple = [96, 76, 88];

  // A stepped plinth and broad veranda give the building a believable footprint.
  fill(cells, 4, 0, 4, 88, 3, 80, M.basalt);
  fill(cells, 8, 3, 8, 80, 3, 72, M.limestone);
  fill(cells, 12, 6, 12, 72, 3, 64, M.warmTimber);
  for (let step = 0; step < 6; step += 1) {
    fill(cells, 33 - step * 2, 5 - step, 74 + step * 2, 30 + step * 4, 1, 3, M.limestone);
  }

  // Enclosed inner hall. Large glazing is broken into framed panels rather than flat windows.
  shell(cells, 20, 9, 20, 56, 31, 44, M.warmTimber);
  for (const x of [25, 37, 59, 71]) {
    fill(cells, x, 16, 63, 8, 15, 1, M.glass);
    fill(cells, x + 3, 16, 62, 2, 15, 1, M.timber);
    fill(cells, x, 22, 62, 8, 2, 1, M.timber);
    fill(cells, x, 16, 20, 8, 15, 1, M.glass);
    fill(cells, x + 3, 16, 20, 2, 15, 1, M.timber);
    fill(cells, x, 22, 20, 8, 2, 1, M.timber);
  }
  for (const z of [25, 37, 49]) {
    for (const x of [20, 75]) {
      fill(cells, x, 16, z, 1, 15, 9, M.glass);
      fill(cells, x, 16, z + 4, 1, 15, 1, M.timber);
      fill(cells, x, 22, z, 1, 2, 9, M.timber);
    }
  }
  // A deep double entrance, brass hardware, and warm interior light anchor the front elevation.
  fill(cells, 40, 9, 62, 16, 27, 3, M.roofDark);
  fill(cells, 42, 11, 64, 6, 23, 1, M.timber);
  fill(cells, 49, 11, 64, 6, 23, 1, M.timber);
  fill(cells, 47, 12, 65, 1, 21, 1, M.copper);
  fill(cells, 50, 12, 65, 1, 21, 1, M.copper);
  fill(cells, 45, 22, 65, 1, 2, 1, M.amberLight);
  fill(cells, 52, 22, 65, 1, 2, 1, M.amberLight);
  for (const x of [29, 65]) fill(cells, x, 20, 61, 3, 7, 1, M.amberLight);

  // Structural colonnade with dressed bases, metal collars, and a wraparound balustrade.
  const columns = [
    ...[14, 31, 48, 65, 81].flatMap((x) => [[x, 14], [x, 75]] as const),
    ...[28, 45, 62].flatMap((z) => [[14, z], [81, z]] as const),
  ] as const;
  for (const [x, z] of columns) {
    fill(cells, x - 1, 8, z - 1, 4, 3, 4, M.limestone);
    fill(cells, x, 11, z, 2, 28, 2, M.warmTimber);
    fill(cells, x - 1, 18, z - 1, 4, 2, 4, M.copper);
    fill(cells, x - 1, 35, z - 1, 4, 3, 4, M.copper);
  }
  for (const z of [14, 75]) {
    fill(cells, 14, 14, z, 68, 1, 1, M.copper);
    fill(cells, 14, 19, z, 68, 1, 1, M.warmTimber);
    for (let x = 15; x <= 80; x += 5) {
      if (z === 75 && x >= 35 && x <= 60) continue;
      fill(cells, x, 14, z, 1, 6, 1, M.timber);
    }
  }
  for (const x of [14, 81]) {
    fill(cells, x, 14, 14, 1, 1, 62, M.copper);
    fill(cells, x, 19, 14, 1, 1, 62, M.warmTimber);
    for (let z = 15; z <= 74; z += 5) fill(cells, x, 14, z, 1, 6, 1, M.timber);
  }

  // Layered hip roof. Tile ribs, copper eaves, and lifted corners break up the slab silhouette.
  for (let level = 0; level < 11; level += 1) {
    const insetX = level * 2;
    const insetZ = Math.round(level * 1.7);
    const x0 = 7 + insetX;
    const z0 = 7 + insetZ;
    const width = 82 - insetX * 2;
    const depth = 74 - insetZ * 2;
    fill(cells, x0, 40 + level, z0, width, 1, depth, level % 3 === 0 ? M.roofLight : M.roofDark);
    for (let x = x0 + 3; x < x0 + width - 2; x += 6) {
      fill(cells, x, 41 + level, z0, 1, 1, depth, M.roofLight);
    }
  }
  fill(cells, 6, 40, 6, 84, 2, 2, M.copper);
  fill(cells, 6, 40, 80, 84, 2, 2, M.copper);
  fill(cells, 6, 40, 6, 2, 2, 76, M.copper);
  fill(cells, 88, 40, 6, 2, 2, 76, M.copper);
  for (const [x, z, sx, sz] of [
    [7, 7, -1, -1], [88, 7, 1, -1], [7, 80, -1, 1], [88, 80, 1, 1],
  ] as const) {
    for (let lift = 0; lift < 5; lift += 1) {
      fill(cells, x + sx * lift, 41 + lift, z + sz * lift, 2, 2, 2, M.roofLight);
    }
  }
  for (const [x, z, width, depth] of [
    [3, 3, 1, 16], [3, 70, 1, 16], [93, 3, 1, 16], [93, 70, 1, 16],
    [3, 3, 16, 1], [77, 3, 16, 1], [3, 84, 16, 1], [77, 84, 16, 1],
  ] as const) fill(cells, x, 44, z, width, 2, depth, M.roofLight);

  // A glazed lantern tower and second roof turn the silhouette into a real pavilion complex.
  shell(cells, 33, 50, 28, 30, 12, 32, M.warmTimber);
  for (const x of [36, 48, 56]) {
    fill(cells, x, 53, 60, 6, 7, 1, M.glass);
    fill(cells, x + 2, 53, 59, 1, 7, 1, M.copper);
  }
  for (const side of [28, 59]) {
    fill(cells, 38, 53, side, 20, 7, 1, M.glass);
    for (let x = 40; x < 58; x += 5) fill(cells, x, 53, side, 1, 7, 1, M.copper);
  }
  fill(cells, 45, 53, 31, 6, 6, 2, M.amberLight);
  for (let level = 0; level < 8; level += 1) {
    const inset = level;
    fill(cells, 26 + inset, 62 + level, 21 + inset, 44 - inset * 2, 1, 46 - inset * 2, level % 2 === 0 ? M.roofLight : M.roofDark);
  }

  for (const [x, z] of [[25, 72], [70, 72], [17, 23], [78, 23]] as const) {
    fill(cells, x, 30, z, 3, 5, 3, M.paper);
    fill(cells, x + 1, 31, z + 1, 1, 3, 1, M.amberLight);
    fill(cells, x + 1, 35, z + 1, 1, 4, 1, M.copper);
  }
  return freezeScene('Lantern Pavilion', dimensions, cells);
}

function copperRover(): VoxelScene {
  const cells: CellMap = new Map();
  const dimensions: Vec3Tuple = [72, 44, 88];
  fill(cells, 9, 8, 8, 54, 13, 72, M.iron);
  fill(cells, 13, 21, 25, 46, 15, 42, M.copper);
  shell(cells, 18, 25, 30, 36, 15, 32, M.paintedBlue);
  fill(cells, 19, 29, 29, 34, 8, 1, M.glass);
  fill(cells, 19, 29, 62, 34, 8, 1, M.glass);
  fill(cells, 17, 29, 35, 1, 8, 21, M.glass);
  fill(cells, 54, 29, 35, 1, 8, 21, M.glass);
  for (const x of [7, 57]) {
    for (const z of [15, 58]) fill(cells, x, 2, z, 8, 20, 16, M.basalt);
  }
  fill(cells, 20, 12, 5, 10, 6, 3, M.amberLight);
  fill(cells, 42, 12, 5, 10, 6, 3, M.amberLight);
  fill(cells, 23, 36, 39, 26, 4, 14, M.ceramic);
  return freezeScene('Copper Survey Rover', dimensions, cells);
}

function moonGateShrine(): VoxelScene {
  const cells: CellMap = new Map();
  const dimensions: Vec3Tuple = [72, 72, 64];
  fill(cells, 5, 0, 6, 62, 5, 52, M.basalt);
  fill(cells, 9, 5, 10, 54, 4, 44, M.limestone);
  fill(cells, 11, 9, 14, 9, 48, 9, M.sandstone);
  fill(cells, 52, 9, 14, 9, 48, 9, M.sandstone);
  fill(cells, 11, 51, 14, 50, 8, 9, M.sandstone);
  for (let y = 15; y < 51; y += 1) {
    const radius = Math.round(Math.sqrt(Math.max(0, 18 * 18 - (y - 33) ** 2)));
    put(cells, 36 - radius, y, 18, M.copper);
    put(cells, 36 + radius, y, 18, M.copper);
  }
  fill(cells, 22, 9, 28, 28, 3, 24, M.water);
  fill(cells, 24, 12, 30, 24, 1, 20, M.waterHighlight);
  for (const [x, z] of [[16, 29], [56, 29], [16, 48], [56, 48]] as const) {
    fill(cells, x, 9, z, 3, 13, 3, M.iron);
    fill(cells, x, 22, z, 3, 4, 3, M.amberLight);
  }
  return freezeScene('Moon Gate Shrine', dimensions, cells);
}

export function listBundledSubjects(): readonly VoxelScene[] {
  return Object.freeze([lanternPavilion(), copperRover(), moonGateShrine()]);
}

function nearestMaterial(
  materials: readonly VoxelMaterial[],
  target: Vec3Tuple,
  predicate: (material: VoxelMaterial) => boolean = () => true,
): number {
  let best = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const material of materials) {
    if (material.paletteIndex === 0 || !predicate(material)) continue;
    const distance = (material.srgb[0] - target[0]) ** 2
      + (material.srgb[1] - target[1]) ** 2
      + (material.srgb[2] - target[2]) ** 2;
    if (distance < bestDistance) {
      best = material.paletteIndex;
      bestDistance = distance;
    }
  }
  return best;
}

const STUDIO_WORLD_SIZE = 384;
const STUDIO_WORLD_CENTER = STUDIO_WORLD_SIZE / 2;
const STUDIO_WORLD_DIMENSIONS: Vec3Tuple = [STUDIO_WORLD_SIZE, 128, STUDIO_WORLD_SIZE];
const STUDIO_WORLD_ORIGIN: Vec3Tuple = [-STUDIO_WORLD_CENTER, -24, -STUDIO_WORLD_CENTER];
const SUBJECT_GROUND_Y = 24;

/** Map coordinates from the original 256-cell composition grid into the expanded world. */
function worldCoordinate(value: number): number {
  return Math.round(value * (STUDIO_WORLD_SIZE - 1) / 255);
}

type EnvironmentPalette = Readonly<{
  grass: number;
  grassLight: number;
  grassDark: number;
  earth: number;
  stone: number;
  stoneLight: number;
  snow: number;
  sand: number;
  bark: number;
  timber: number;
  pine: number;
  leaf: number;
  leafDark: number;
  leafLight: number;
  flower: number;
  path: number;
  iron: number;
  paper: number;
  light: number;
  water: number;
}>;

function hash2(x: number, z: number): number {
  let value = Math.imul(x + 0x6d2b79f5, 0x1b873593)
    ^ Math.imul(z + 0x85ebca6b, 0x27d4eb2d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x2c1b3c6d);
  value ^= value >>> 12;
  return value >>> 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function putIfEmpty(
  cells: CellMap,
  x: number,
  y: number,
  z: number,
  paletteIndex: number,
): void {
  if (x < 0 || y < 0 || z < 0
    || x >= STUDIO_WORLD_DIMENSIONS[0]
    || y >= STUDIO_WORLD_DIMENSIONS[1]
    || z >= STUDIO_WORLD_DIMENSIONS[2]) return;
  const key = voxelKey(x, y, z);
  if (!cells.has(key)) cells.set(key, { x, y, z, paletteIndex });
}

function line(
  cells: CellMap,
  start: Vec3Tuple,
  end: Vec3Tuple,
  radius: number,
  paletteIndex: number,
): void {
  const distance = Math.max(
    Math.abs(end[0] - start[0]),
    Math.abs(end[1] - start[1]),
    Math.abs(end[2] - start[2]),
  );
  for (let step = 0; step <= distance; step += 1) {
    const progress = distance === 0 ? 0 : step / distance;
    const x = Math.round(start[0] + (end[0] - start[0]) * progress);
    const y = Math.round(start[1] + (end[1] - start[1]) * progress);
    const z = Math.round(start[2] + (end[2] - start[2]) * progress);
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy + dz * dz <= radius * radius + 0.25) {
            putIfEmpty(cells, x + dx, y + dy, z + dz, paletteIndex);
          }
        }
      }
    }
  }
}

function irregularEllipsoid(
  cells: CellMap,
  center: Vec3Tuple,
  radii: Vec3Tuple,
  primary: number,
  accent: number,
  seed: number,
  emptyOnly = true,
): void {
  const [cx, cy, cz] = center;
  const [rx, ry, rz] = radii;
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let z = cz - rz; z <= cz + rz; z += 1) {
      for (let x = cx - rx; x <= cx + rx; x += 1) {
        const dx = (x - cx) / Math.max(1, rx);
        const dy = (y - cy) / Math.max(1, ry);
        const dz = (z - cz) / Math.max(1, rz);
        const erosion = (hash2(x + seed * 17 + y * 7, z - seed * 11 - y * 5) % 19) * 0.012;
        if (dx * dx + dy * dy + dz * dz > 1.04 - erosion) continue;
        const material = hash2(x + seed, z + y * 3) % 13 < 3 ? accent : primary;
        if (emptyOnly) putIfEmpty(cells, x, y, z, material);
        else if (x >= 0 && y >= 0 && z >= 0
          && x < STUDIO_WORLD_DIMENSIONS[0]
          && y < STUDIO_WORLD_DIMENSIONS[1]
          && z < STUDIO_WORLD_DIMENSIONS[2]) put(cells, x, y, z, material);
      }
    }
  }
}

function foliageCluster(
  cells: CellMap,
  center: Vec3Tuple,
  radii: Vec3Tuple,
  palette: EnvironmentPalette,
  seed: number,
): void {
  const [cx, cy, cz] = center;
  const [rx, ry, rz] = radii;
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let z = cz - rz; z <= cz + rz; z += 1) {
      for (let x = cx - rx; x <= cx + rx; x += 1) {
        const dx = (x - cx) / Math.max(1, rx);
        const dy = (y - cy) / Math.max(1, ry);
        const dz = (z - cz) / Math.max(1, rz);
        const distance = dx * dx + dy * dy + dz * dz;
        const noise = hash2(x + y * 13 + seed * 31, z - y * 7 - seed * 19);
        if (distance > 1.04 - (noise % 23) * 0.01 || (noise >>> 7) % 17 < 2) continue;
        const materialChoice = (noise >>> 13) % 13;
        const material = materialChoice < 3
          ? palette.leafDark
          : materialChoice > 10 ? palette.leafLight : palette.leaf;
        putIfEmpty(cells, x, y, z, material);
      }
    }
  }
}

function addTrunkSurfaceDetail(
  cells: CellMap,
  start: Vec3Tuple,
  end: Vec3Tuple,
  radius: number,
  palette: EnvironmentPalette,
  seed: number,
  moss: boolean,
): void {
  const height = Math.max(1, end[1] - start[1]);
  for (let offset = 4, band = 0; offset < height - 2; offset += 3, band += 1) {
    const progress = offset / height;
    const centerX = Math.round(start[0] + (end[0] - start[0]) * progress);
    const centerZ = Math.round(start[2] + (end[2] - start[2]) * progress);
    const angle = seed * 0.37 + band * 2.399963;
    const surface = radius + 1;
    const scarX = centerX + Math.round(Math.cos(angle) * surface);
    const scarZ = centerZ + Math.round(Math.sin(angle) * surface);
    const material = moss && (band + seed) % 5 === 0
      ? palette.leafDark
      : (band + seed) % 3 === 0 ? palette.bark : palette.timber;
    putIfEmpty(cells, scarX, start[1] + offset, scarZ, material);
    if ((band + seed) % 7 === 0) {
      const reach = 2 + (band + seed) % 3;
      line(
        cells,
        [scarX, start[1] + offset, scarZ],
        [
          scarX + Math.round(Math.cos(angle) * reach),
          start[1] + offset + 1,
          scarZ + Math.round(Math.sin(angle) * reach),
        ],
        0,
        palette.timber,
      );
    }
  }
}

function addDeciduousTree(
  cells: CellMap,
  x: number,
  baseY: number,
  z: number,
  height: number,
  palette: EnvironmentPalette,
  seed: number,
): void {
  const trunkTop = baseY + Math.round(height * 0.68);
  const leanX = (seed % 5) - 2;
  const leanZ = ((seed * 3) % 5) - 2;
  for (let root = 0; root < 7; root += 1) {
    const angle = root * Math.PI * 2 / 7 + seed * 0.23;
    const reach = 5 + (root + seed) % 5;
    line(
      cells,
      [x, baseY + 3, z],
      [Math.round(x + Math.cos(angle) * reach), baseY, Math.round(z + Math.sin(angle) * reach)],
      root < 3 ? 1 : 0,
      palette.bark,
    );
  }
  line(cells, [x, baseY, z], [x + leanX, trunkTop, z + leanZ], 2, palette.bark);
  addTrunkSurfaceDetail(
    cells,
    [x, baseY, z],
    [x + leanX, trunkTop, z + leanZ],
    2,
    palette,
    seed,
    true,
  );

  for (let branch = 0; branch < 10; branch += 1) {
    const angle = branch * 2.399963 + seed * 0.41;
    const startY = trunkTop - 13 + branch % 5 * 3;
    const reach = 9 + (hash2(seed, branch) % 8);
    const rise = 5 + (branch * 3 + seed) % 8;
    const start: Vec3Tuple = [x + leanX, startY, z + leanZ];
    const fork: Vec3Tuple = [
      Math.round(start[0] + Math.cos(angle) * reach * 0.62),
      startY + Math.round(rise * 0.55),
      Math.round(start[2] + Math.sin(angle) * reach * 0.62),
    ];
    const end: Vec3Tuple = [
      Math.round(start[0] + Math.cos(angle) * reach),
      startY + rise,
      Math.round(start[2] + Math.sin(angle) * reach),
    ];
    line(cells, start, fork, branch < 5 ? 1 : 0, palette.bark);
    line(cells, fork, end, 0, palette.bark);
    for (const turn of [-0.48, 0.52]) {
      const twig: Vec3Tuple = [
        Math.round(end[0] + Math.cos(angle + turn) * (5 + branch % 3)),
        end[1] + 3 + branch % 4,
        Math.round(end[2] + Math.sin(angle + turn) * (5 + branch % 3)),
      ];
      line(cells, end, twig, 0, palette.bark);
      foliageCluster(cells, twig, [4 + branch % 2, 4 + (branch + seed) % 3, 4 + (branch + 1) % 2], palette, seed + branch * 7);
    }
    foliageCluster(cells, end, [5, 5 + branch % 3, 5], palette, seed + branch * 13);
    if ((branch + seed) % 4 === 0) {
      const strandLength = 5 + hash2(seed + branch, branch * 17) % 8;
      line(
        cells,
        [end[0] + branch % 3 - 1, end[1], end[2]],
        [end[0] + branch % 3 - 1, end[1] - strandLength, end[2]],
        0,
        palette.leafDark,
      );
    }
  }
  foliageCluster(cells, [x + leanX, trunkTop + 9, z + leanZ], [7, 8, 7], palette, seed + 97);
}

function addConifer(
  cells: CellMap,
  x: number,
  baseY: number,
  z: number,
  height: number,
  palette: EnvironmentPalette,
  seed: number,
  snowCovered: boolean,
): void {
  const top = baseY + height;
  const leanX = seed % 3 - 1;
  const leanZ = Math.floor(seed / 3) % 3 - 1;
  for (let root = 0; root < 6; root += 1) {
    const angle = root * Math.PI / 3 + seed * 0.17;
    line(
      cells,
      [x, baseY + 2, z],
      [Math.round(x + Math.cos(angle) * 5), baseY, Math.round(z + Math.sin(angle) * 5)],
      0,
      palette.bark,
    );
  }
  line(cells, [x, baseY, z], [x + leanX, top, z + leanZ], height > 40 ? 1 : 0, palette.bark);
  addTrunkSurfaceDetail(
    cells,
    [x, baseY, z],
    [x + leanX, top, z + leanZ],
    height > 40 ? 1 : 0,
    palette,
    seed,
    false,
  );
  const crownBottom = baseY + Math.round(height * 0.18);
  for (let tier = 0, y = crownBottom; y < top - 1; tier += 1, y += 3) {
    const progress = (top - y) / Math.max(1, top - crownBottom);
    const reach = Math.max(2, Math.round(progress * height * 0.31) - (tier + seed) % 2);
    const branches = tier % 3 === 0 ? 8 : 6;
    for (let branch = 0; branch < branches; branch += 1) {
      const angle = branch * Math.PI * 2 / branches + tier * 0.47 + seed * 0.11;
      const end: Vec3Tuple = [
        Math.round(x + leanX * (y - baseY) / height + Math.cos(angle) * reach),
        y - 1 - tier % 2,
        Math.round(z + leanZ * (y - baseY) / height + Math.sin(angle) * reach),
      ];
      const start: Vec3Tuple = [
        Math.round(x + leanX * (y - baseY) / height),
        y + 1,
        Math.round(z + leanZ * (y - baseY) / height),
      ];
      line(cells, start, end, 0, palette.pine);
      for (let offset = 3; offset < reach; offset += 3) {
        const along = offset / reach;
        const px = Math.round(start[0] + (end[0] - start[0]) * along);
        const pz = Math.round(start[2] + (end[2] - start[2]) * along);
        const py = Math.round(start[1] + (end[1] - start[1]) * along);
        const needleReach = Math.max(1, Math.round((1 - along) * 3));
        line(
          cells,
          [px - Math.round(Math.sin(angle) * needleReach), py, pz + Math.round(Math.cos(angle) * needleReach)],
          [px + Math.round(Math.sin(angle) * needleReach), py, pz - Math.round(Math.cos(angle) * needleReach)],
          0,
          (branch + tier + seed) % 5 === 0 ? palette.leaf : palette.pine,
        );
      }
      if (snowCovered) {
        line(cells, [start[0], start[1] + 1, start[2]], [end[0], end[1] + 1, end[2]], 0, palette.snow);
      }
    }
  }
  line(cells, [x + leanX, top - 4, z + leanZ], [x + leanX, top + 2, z + leanZ], 0, snowCovered ? palette.snow : palette.pine);
}

function addCypress(
  cells: CellMap,
  x: number,
  baseY: number,
  z: number,
  height: number,
  palette: EnvironmentPalette,
  seed: number,
): void {
  const top = baseY + height;
  const leanX = seed % 5 - 2;
  const leanZ = Math.floor(seed / 5) % 5 - 2;
  for (let root = 0; root < 9; root += 1) {
    const angle = root * Math.PI * 2 / 9 + seed * 0.19;
    const reach = 7 + root % 4;
    line(
      cells,
      [x, baseY + 5, z],
      [Math.round(x + Math.cos(angle) * reach), baseY, Math.round(z + Math.sin(angle) * reach)],
      root < 4 ? 1 : 0,
      palette.bark,
    );
  }
  line(cells, [x, baseY, z], [x + leanX, top, z + leanZ], 1, palette.bark);
  addTrunkSurfaceDetail(
    cells,
    [x, baseY, z],
    [x + leanX, top, z + leanZ],
    1,
    palette,
    seed,
    true,
  );
  line(cells, [x + leanX, top - 12, z + leanZ], [x + leanX + 5, top + 3, z + leanZ - 3], 0, palette.bark);
  for (let tier = 0; tier < 12; tier += 1) {
    const y = baseY + Math.round(height * (0.28 + tier * 0.052));
    const angle = seed * 0.71 + tier * 2.399963;
    const reach = 8 + (tier % 4) * 2;
    const end: Vec3Tuple = [
      Math.round(x + leanX * (y - baseY) / height + Math.cos(angle) * reach),
      y + 3 + tier % 3,
      Math.round(z + leanZ * (y - baseY) / height + Math.sin(angle) * reach),
    ];
    const start: Vec3Tuple = [
      Math.round(x + leanX * (y - baseY) / height),
      y,
      Math.round(z + leanZ * (y - baseY) / height),
    ];
    line(cells, start, end, tier < 5 ? 1 : 0, palette.bark);
    foliageCluster(cells, end, [5 + tier % 2, 3 + tier % 2, 5], palette, seed + tier * 5);
    for (let strand = 0; strand < 5; strand += 1) {
      const sx = end[0] + strand - 2;
      const sz = end[2] + ((strand + seed) % 5) - 2;
      const length = 4 + ((strand + tier + seed) % 8);
      line(cells, [sx, end[1], sz], [sx, end[1] - length, sz], 0, palette.leafLight);
    }
  }
}

function addPalm(
  cells: CellMap,
  x: number,
  baseY: number,
  z: number,
  height: number,
  palette: EnvironmentPalette,
  seed: number,
): void {
  const top: Vec3Tuple = [x + seed % 7 - 3, baseY + height, z + (seed * 3) % 7 - 3];
  for (let root = 0; root < 7; root += 1) {
    const angle = root * Math.PI * 2 / 7 + seed * 0.19;
    const reach = 5 + (root + seed) % 5;
    line(
      cells,
      [x, baseY + 3, z],
      [Math.round(x + Math.cos(angle) * reach), baseY, Math.round(z + Math.sin(angle) * reach)],
      root < 2 ? 1 : 0,
      palette.bark,
    );
  }
  const bendA: Vec3Tuple = [x + Math.round((top[0] - x) * 0.35), baseY + Math.round(height * 0.38), z];
  const bendB: Vec3Tuple = [x + Math.round((top[0] - x) * 0.72), baseY + Math.round(height * 0.74), z + Math.round((top[2] - z) * 0.45)];
  line(cells, [x, baseY, z], bendA, 1, palette.bark);
  line(cells, bendA, bendB, 1, palette.bark);
  line(cells, bendB, top, 1, palette.bark);
  irregularEllipsoid(cells, [top[0], top[1] - 2, top[2]], [3, 3, 3], palette.bark, palette.timber, seed, true);
  for (let fruit = 0; fruit < 7; fruit += 1) {
    const angle = fruit * Math.PI * 2 / 7 + seed * 0.29;
    irregularEllipsoid(
      cells,
      [
        Math.round(top[0] + Math.cos(angle) * 4),
        top[1] - 5 - fruit % 2,
        Math.round(top[2] + Math.sin(angle) * 4),
      ],
      [1, 2, 1],
      palette.timber,
      palette.bark,
      seed + fruit * 11,
      true,
    );
  }
  for (let frond = 0; frond < 12; frond += 1) {
    const angle = frond * Math.PI / 6 + seed * 0.17;
    const reach = 13 + frond % 4 * 2;
    let previous = top;
    for (let segment = 1; segment <= 4; segment += 1) {
      const progress = segment / 4;
      const point: Vec3Tuple = [
        Math.round(top[0] + Math.cos(angle) * reach * progress),
        Math.round(top[1] + Math.sin(progress * Math.PI) * 3 - progress * (4 + frond % 3)),
        Math.round(top[2] + Math.sin(angle) * reach * progress),
      ];
      line(cells, previous, point, 0, frond % 5 === 0 ? palette.leafLight : palette.leaf);
      const leafletReach = Math.max(1, 4 - segment);
      line(
        cells,
        [point[0] - Math.round(Math.sin(angle) * leafletReach), point[1] - 1, point[2] + Math.round(Math.cos(angle) * leafletReach)],
        [point[0] + Math.round(Math.sin(angle) * leafletReach), point[1] - 1, point[2] - Math.round(Math.cos(angle) * leafletReach)],
        0,
        palette.leaf,
      );
      previous = point;
    }
  }
}

function addFox(
  cells: CellMap,
  x: number,
  y: number,
  z: number,
  palette: EnvironmentPalette,
  direction: -1 | 1,
  seed: number,
): void {
  irregularEllipsoid(cells, [x, y + 4, z], [5, 3, 2], palette.timber, palette.bark, seed, true);
  irregularEllipsoid(
    cells,
    [x + direction * 5, y + 6, z],
    [3, 3, 3],
    palette.timber,
    palette.bark,
    seed + 1,
    true,
  );
  line(cells, [x + direction * 7, y + 6, z], [x + direction * 9, y + 5, z], 0, palette.paper);
  for (const dz of [-1, 1]) {
    line(cells, [x - 2, y + 3, z + dz], [x - 2, y, z + dz], 0, palette.iron);
    line(cells, [x + 2, y + 3, z + dz], [x + 2, y, z + dz], 0, palette.iron);
  }
  for (const dz of [-1, 1]) {
    line(
      cells,
      [x + direction * 4, y + 8, z + dz],
      [x + direction * 5, y + 11, z + dz],
      0,
      palette.bark,
    );
  }
  const tailRoot: Vec3Tuple = [x - direction * 4, y + 5, z];
  const tailBend: Vec3Tuple = [x - direction * 9, y + 7, z + 2];
  const tailTip: Vec3Tuple = [x - direction * 13, y + 5, z + 3];
  line(cells, tailRoot, tailBend, 1, palette.timber);
  line(cells, tailBend, tailTip, 1, palette.paper);
  putIfEmpty(cells, x + direction * 7, y + 7, z - 2, palette.iron);
}

function addDeer(
  cells: CellMap,
  x: number,
  y: number,
  z: number,
  palette: EnvironmentPalette,
  direction: -1 | 1,
  seed: number,
): void {
  irregularEllipsoid(cells, [x, y + 6, z], [6, 4, 3], palette.bark, palette.timber, seed, true);
  line(cells, [x + direction * 4, y + 7, z], [x + direction * 7, y + 13, z], 1, palette.bark);
  irregularEllipsoid(
    cells,
    [x + direction * 8, y + 14, z],
    [3, 3, 2],
    palette.bark,
    palette.timber,
    seed + 1,
    true,
  );
  for (const dx of [-3, 3]) {
    for (const dz of [-2, 2]) line(cells, [x + dx, y + 4, z + dz], [x + dx, y, z + dz], 0, palette.iron);
  }
  for (const dz of [-1, 1]) {
    const antlerRoot: Vec3Tuple = [x + direction * 8, y + 16, z + dz];
    const antlerTop: Vec3Tuple = [x + direction * 7, y + 22, z + dz * 2];
    line(cells, antlerRoot, antlerTop, 0, palette.iron);
    line(cells, [antlerTop[0], antlerTop[1] - 2, antlerTop[2]], [antlerTop[0] - direction * 3, antlerTop[1] + 1, antlerTop[2]], 0, palette.iron);
    line(cells, [antlerTop[0], antlerTop[1] - 3, antlerTop[2]], [antlerTop[0] + direction * 2, antlerTop[1], antlerTop[2] + dz * 2], 0, palette.iron);
  }
}

function addCanoe(
  cells: CellMap,
  x: number,
  y: number,
  z: number,
  palette: EnvironmentPalette,
  seed: number,
): void {
  for (let offset = -13; offset <= 13; offset += 1) {
    const taper = Math.max(0, Math.round((13 - Math.abs(offset)) * 0.22));
    const centerZ = z + Math.round(Math.sin((offset + seed) * 0.17));
    for (const side of [-1, 1]) {
      line(
        cells,
        [x + offset, y + 1, centerZ + side * (2 + taper)],
        [x + offset, y + 3, centerZ + side * (1 + taper)],
        0,
        offset % 5 === 0 ? palette.path : palette.timber,
      );
    }
    if (Math.abs(offset) < 10) putIfEmpty(cells, x + offset, y, centerZ, palette.timber);
  }
  for (const seat of [-6, 0, 6]) fill(cells, x + seat, y + 3, z - 3, 1, 1, 7, palette.stoneLight);
  line(cells, [x - 2, y + 5, z - 2], [x + 10, y + 7, z + 5], 0, palette.paper);
}

function addPrayerFlags(
  cells: CellMap,
  start: Vec3Tuple,
  end: Vec3Tuple,
  palette: EnvironmentPalette,
): void {
  line(cells, start, end, 0, palette.iron);
  const distance = Math.max(Math.abs(end[0] - start[0]), Math.abs(end[2] - start[2]));
  const materials = [
    palette.flower,
    palette.paper,
    palette.pine,
    palette.stoneLight,
    palette.leafLight,
  ] as const;
  for (let step = 6, flag = 0; step < distance - 3; step += 7, flag += 1) {
    const progress = step / distance;
    const x = Math.round(start[0] + (end[0] - start[0]) * progress);
    const y = Math.round(start[1] + (end[1] - start[1]) * progress);
    const z = Math.round(start[2] + (end[2] - start[2]) * progress);
    const material = materials[flag % materials.length]!;
    fill(cells, x, y - 2, z, 2, 1, 1, material);
    putIfEmpty(cells, x, y - 3, z, material);
  }
}

function addMushroomCluster(
  cells: CellMap,
  x: number,
  y: number,
  z: number,
  palette: EnvironmentPalette,
  seed: number,
): void {
  for (let mushroom = 0; mushroom < 7; mushroom += 1) {
    const offsetX = hash2(seed, mushroom * 17) % 9 - 4;
    const offsetZ = hash2(seed + 31, mushroom * 23) % 9 - 4;
    const height = 2 + hash2(seed + mushroom, 47) % 4;
    line(cells, [x + offsetX, y, z + offsetZ], [x + offsetX, y + height, z + offsetZ], 0, palette.paper);
    irregularEllipsoid(
      cells,
      [x + offsetX, y + height + 1, z + offsetZ],
      [2 + mushroom % 2, 1, 2 + (mushroom + 1) % 2],
      mushroom % 3 === 0 ? palette.paper : palette.flower,
      palette.flower,
      seed + mushroom,
      false,
    );
  }
}

function addFlyingBirds(
  cells: CellMap,
  x: number,
  y: number,
  z: number,
  palette: EnvironmentPalette,
): void {
  for (let bird = 0; bird < 6; bird += 1) {
    const birdX = x + bird * 12;
    const birdY = y + (bird % 3) * 5;
    const birdZ = z - bird * 3;
    line(cells, [birdX - 4, birdY, birdZ], [birdX, birdY - 2, birdZ], 0, palette.iron);
    line(cells, [birdX, birdY - 2, birdZ], [birdX + 4, birdY + (bird % 2), birdZ], 0, palette.iron);
  }
}

function addFireflies(
  cells: CellMap,
  center: Vec3Tuple,
  radius: Vec3Tuple,
  palette: EnvironmentPalette,
  seed: number,
  count: number,
): void {
  for (let firefly = 0; firefly < count; firefly += 1) {
    const x = center[0] + hash2(seed + firefly * 13, 701) % (radius[0] * 2 + 1) - radius[0];
    const y = center[1] + hash2(seed + firefly * 17, 809) % (radius[1] * 2 + 1) - radius[1];
    const z = center[2] + hash2(seed + firefly * 19, 907) % (radius[2] * 2 + 1) - radius[2];
    putIfEmpty(cells, x, y, z, palette.light);
  }
}

function addBoulder(
  cells: CellMap,
  x: number,
  y: number,
  z: number,
  radius: number,
  palette: EnvironmentPalette,
  seed: number,
): void {
  irregularEllipsoid(
    cells,
    [x, y + Math.max(1, radius - 1), z],
    [radius + seed % 2, Math.max(2, radius - 1), radius],
    palette.stone,
    palette.stoneLight,
    seed,
    false,
  );
}

function addGrassClump(
  cells: CellMap,
  x: number,
  y: number,
  z: number,
  palette: EnvironmentPalette,
  seed: number,
): void {
  for (let blade = 0; blade < 7; blade += 1) {
    const bx = x + (hash2(seed, blade) % 5) - 2;
    const bz = z + (hash2(blade, seed) % 5) - 2;
    const height = 2 + hash2(seed + blade, 71) % 6;
    line(cells, [bx, y, bz], [bx + (blade % 3) - 1, y + height, bz + ((blade + 1) % 3) - 1], 0, blade === 0 && seed % 5 === 0 ? palette.flower : palette.grassLight);
  }
}

function addFern(
  cells: CellMap,
  x: number,
  y: number,
  z: number,
  palette: EnvironmentPalette,
  seed: number,
): void {
  const height = 4 + seed % 5;
  line(cells, [x, y, z], [x, y + height, z], 0, palette.grassDark);
  for (let frond = 0; frond < 7; frond += 1) {
    const angle = frond * Math.PI * 2 / 7 + seed * 0.37;
    const reach = 4 + (frond + seed) % 4;
    const end: Vec3Tuple = [
      Math.round(x + Math.cos(angle) * reach),
      y + 1 + frond % 3,
      Math.round(z + Math.sin(angle) * reach),
    ];
    line(cells, [x, y + height - 1, z], end, 0, frond % 3 === 0 ? palette.leafLight : palette.leaf);
  }
}

function addShrub(
  cells: CellMap,
  x: number,
  y: number,
  z: number,
  radius: number,
  palette: EnvironmentPalette,
  seed: number,
): void {
  for (let stem = 0; stem < 7; stem += 1) {
    const angle = stem * Math.PI * 2 / 7 + seed * 0.29;
    const end: Vec3Tuple = [
      Math.round(x + Math.cos(angle) * radius),
      y + radius + stem % 3,
      Math.round(z + Math.sin(angle) * radius),
    ];
    line(cells, [x, y, z], end, 0, palette.bark);
    foliageCluster(cells, end, [radius, Math.max(2, radius - 1), radius], palette, seed + stem * 3);
  }
}

function addRockOutcrop(
  cells: CellMap,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  palette: EnvironmentPalette,
  seed: number,
  snowCap = false,
): void {
  for (let dy = 0; dy < height; dy += 1) {
    const progress = dy / Math.max(1, height - 1);
    const ledge = dy % 11 < 2 ? 1 : 0;
    const radiusX = Math.max(2, Math.round(width * 0.5 * (1 - progress * 0.58)) + ledge);
    const radiusZ = Math.max(2, Math.round(depth * 0.5 * (1 - progress * 0.52)) + ledge);
    const centerX = x + Math.round(Math.sin(dy * 0.31 + seed) * 1.6);
    const centerZ = z + Math.round(Math.cos(dy * 0.27 + seed * 0.7) * 1.3);
    for (let dz = -radiusZ; dz <= radiusZ; dz += 1) {
      for (let dx = -radiusX; dx <= radiusX; dx += 1) {
        const distance = (dx / radiusX) ** 2 + (dz / radiusZ) ** 2;
        const noise = hash2(centerX + dx + seed, centerZ + dz - dy * 3);
        if (distance > 1.02 - (noise % 11) * 0.008) continue;
        if (distance > 0.76 && (noise >>> 8) % 17 < 2) continue;
        const stratum = (dy + Math.floor((dx + radiusX) * 0.2) + seed) % 9;
        const targetX = centerX + dx;
        const targetY = y + dy;
        const targetZ = centerZ + dz;
        if (targetX < 0 || targetY < 0 || targetZ < 0
          || targetX >= STUDIO_WORLD_DIMENSIONS[0]
          || targetY >= STUDIO_WORLD_DIMENSIONS[1]
          || targetZ >= STUDIO_WORLD_DIMENSIONS[2]) continue;
        put(cells, targetX, targetY, targetZ, stratum < 2 ? palette.stoneLight : palette.stone);
      }
    }
  }
  if (snowCap) {
    irregularEllipsoid(
      cells,
      [x, y + height, z],
      [Math.max(2, Math.round(width * 0.42)), 1, Math.max(2, Math.round(depth * 0.42))],
      palette.snow,
      palette.snow,
      seed + 17,
      false,
    );
  }
}

function addRuinedArch(
  cells: CellMap,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  palette: EnvironmentPalette,
  seed: number,
): void {
  const pillarWidth = 4;
  for (const side of [0, width - pillarWidth]) {
    for (let level = 0; level < height; level += 1) {
      const material = (level + seed) % 5 === 0 ? palette.stoneLight : palette.stone;
      fill(cells, x + side, y + level, z, pillarWidth, 1, 4, material);
      if (level % 7 === 0) fill(cells, x + side - 1, y + level, z - 1, pillarWidth + 2, 1, 6, palette.stoneLight);
    }
  }
  const radius = (width - pillarWidth * 2) / 2;
  const centerX = x + width / 2;
  const springY = y + height - Math.round(radius);
  for (let localX = pillarWidth; localX < width - pillarWidth; localX += 1) {
    const normalized = (localX - width / 2) / Math.max(1, radius);
    const archY = springY + Math.round(Math.sqrt(Math.max(0, 1 - normalized * normalized)) * radius);
    for (let thickness = 0; thickness < 4; thickness += 1) {
      if (hash2(seed + localX, thickness) % 19 === 0) continue;
      fill(
        cells,
        Math.round(x + localX),
        archY + thickness,
        z,
        1,
        1,
        4,
        (Math.round(centerX) + localX + thickness) % 4 === 0 ? palette.stoneLight : palette.stone,
      );
    }
  }
  for (const [dx, dz] of [[-3, 3], [width + 2, -2], [width + 6, 4]] as const) {
    addBoulder(cells, x + dx, y, z + dz, 2 + (dx + seed + 30) % 3, palette, seed + dx);
  }
}

function addTimberRail(
  cells: CellMap,
  start: Vec3Tuple,
  end: Vec3Tuple,
  palette: EnvironmentPalette,
): void {
  line(cells, start, end, 0, palette.timber);
  const distance = Math.max(Math.abs(end[0] - start[0]), Math.abs(end[2] - start[2]));
  for (let step = 0; step <= distance; step += 8) {
    const progress = distance === 0 ? 0 : step / distance;
    const x = Math.round(start[0] + (end[0] - start[0]) * progress);
    const y = Math.round(start[1] + (end[1] - start[1]) * progress);
    const z = Math.round(start[2] + (end[2] - start[2]) * progress);
    line(cells, [x, y - 6, z], [x, y + 2, z], 0, palette.bark);
  }
}

function addDuneFence(
  cells: CellMap,
  heights: Int16Array,
  startX: number,
  startZ: number,
  length: number,
  palette: EnvironmentPalette,
): void {
  const posts: Vec3Tuple[] = [];
  for (let offset = 0; offset <= length; offset += 9) {
    const x = startX + offset;
    const z = startZ + Math.round(Math.sin(offset * 0.18) * 3);
    const y = topAt(heights, x, z) + 1;
    line(cells, [x, y, z], [x + offset % 3 - 1, y + 8, z], 0, palette.timber);
    posts.push([x, y + 5, z]);
  }
  for (let index = 1; index < posts.length; index += 1) {
    line(cells, posts[index - 1]!, posts[index]!, 0, palette.path);
  }
}

function environmentPalette(
  materials: readonly VoxelMaterial[],
  water: number,
): EnvironmentPalette {
  const organic = (material: VoxelMaterial): boolean => material.metallic < 0.25 && material.glass < 0.25;
  return Object.freeze({
    grass: nearestMaterial(materials, [0.25, 0.42, 0.2], organic),
    grassLight: nearestMaterial(materials, [0.45, 0.62, 0.28], organic),
    grassDark: nearestMaterial(materials, [0.1, 0.28, 0.14], organic),
    earth: nearestMaterial(materials, [0.3, 0.2, 0.12], organic),
    stone: nearestMaterial(materials, [0.35, 0.37, 0.39], organic),
    stoneLight: nearestMaterial(materials, [0.63, 0.62, 0.57], organic),
    snow: nearestMaterial(materials, [0.9, 0.94, 1], organic),
    sand: nearestMaterial(materials, [0.78, 0.62, 0.38], organic),
    bark: nearestMaterial(materials, [0.24, 0.12, 0.06], organic),
    timber: nearestMaterial(materials, [0.4, 0.2, 0.1], organic),
    pine: nearestMaterial(materials, [0.06, 0.22, 0.13], organic),
    leaf: nearestMaterial(materials, [0.12, 0.36, 0.18], organic),
    leafDark: nearestMaterial(materials, [0.05, 0.19, 0.1], organic),
    leafLight: nearestMaterial(materials, [0.38, 0.55, 0.22], organic),
    flower: nearestMaterial(materials, [0.82, 0.18, 0.15], organic),
    path: nearestMaterial(materials, [0.55, 0.46, 0.34], organic),
    iron: nearestMaterial(materials, [0.12, 0.14, 0.16]),
    paper: nearestMaterial(materials, [0.92, 0.78, 0.52], organic),
    light: nearestMaterial(materials, [1, 0.45, 0.08], (material) => material.emission > 0.5),
    water,
  });
}

function terrainHeight(id: EnvironmentId, x: number, z: number): number {
  const designX = x * 256 / STUDIO_WORLD_SIZE;
  const designZ = z * 256 / STUDIO_WORLD_SIZE;
  const wx = x - STUDIO_WORLD_CENTER;
  const wz = z - STUDIO_WORLD_CENTER;
  const fine = ((hash2(x, z) % 17) - 8) * 0.13;
  const rolling = Math.sin(designX * 0.071) * 2.4
    + Math.cos(designZ * 0.059) * 2.1
    + fine;
  const borderRise = Math.max(0, (58 - designZ) * 0.16)
    + Math.max(0, (Math.abs(designX - 128) - 102) * 0.11);
  let height = 24;
  if (id === 'pedestal') {
    height = 20;
  } else if (id === 'forest') {
    const leftHill = Math.max(0, 1 - Math.hypot((designX - 42) / 72, (designZ - 54) / 63)) * 19;
    const rightHill = Math.max(0, 1 - Math.hypot((designX - 213) / 76, (designZ - 49) / 61)) * 23;
    const creekCenter = 48 + Math.sin(designZ * 0.055) * 12;
    const creekCut = Math.max(0, 1 - Math.abs(designX - creekCenter) / 11) * 9;
    height = 24 + rolling + borderRise + leftHill + rightHill - creekCut;
  } else if (id === 'snow-forest') {
    const basinWall = Math.max(0, 1 - Math.hypot((designX - 48) / 76, (designZ - 38) / 60)) * 25
      + Math.max(0, 1 - Math.hypot((designX - 210) / 80, (designZ - 34) / 64)) * 28;
    height = 25 + rolling * 0.8 + borderRise * 1.25 + basinWall;
  } else if (id === 'mountains') {
    const peak = (cx: number, cz: number, rx: number, rz: number, elevation: number): number => (
      Math.max(0, 1 - Math.hypot((designX - cx) / rx, (designZ - cz) / rz)) * elevation
    );
    const ridge = peak(20, 36, 78, 78, 56)
      + peak(86, 18, 82, 78, 48)
      + peak(170, 23, 88, 82, 59)
      + peak(242, 44, 76, 82, 52);
    const strata = Math.sin(designX * 0.17 + designZ * 0.08) * 2.4
      + Math.sin(designX * 0.041 - designZ * 0.19) * 1.8;
    height = 21 + rolling * 0.55 + ridge + strata + Math.max(0, (74 - designZ) * 0.2);
  } else if (id === 'beach') {
    if (designZ > 174) height = 14 + Math.sin(designX * 0.09) * 1.5 + fine;
    else {
      const dune = Math.max(0, Math.sin((174 - designZ) * 0.075) * 4.2);
      const backCliff = Math.max(0, (58 - designZ) * 0.22)
        + Math.max(0, 1 - Math.hypot((designX - 218) / 62, (designZ - 47) / 55)) * 25;
      height = 23 + rolling * 0.6 + dune + backCliff;
    }
  } else {
    const island = (cx: number, cz: number, rx: number, rz: number, elevation: number): number => (
      Math.max(0, 1 - Math.hypot((designX - cx) / rx, (designZ - cz) / rz)) * elevation
    );
    height = 16 + rolling * 0.35
      + island(128, 128, 77, 72, 12)
      + island(35, 69, 31, 41, 9)
      + island(222, 77, 38, 44, 10)
      + island(46, 211, 44, 32, 8)
      + island(209, 211, 42, 35, 8);
  }

  const clearingDistance = Math.hypot(wx / 56, wz / 54);
  if (clearingDistance < 1.2) {
    const blend = clamp((1.2 - clearingDistance) / 0.1, 0, 1);
    height = height * (1 - blend) + SUBJECT_GROUND_Y * blend;
  }
  return clamp(Math.round(height), 8, 112);
}

function writeTerrain(
  id: EnvironmentId,
  heights: Int16Array,
  cells: CellMap,
  palette: EnvironmentPalette,
): void {
  const size = STUDIO_WORLD_SIZE;
  const at = (x: number, z: number): number => heights[z * size + x]!;
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const height = at(x, z);
      const neighborMinimum = Math.min(
        at(Math.max(0, x - 1), z),
        at(Math.min(size - 1, x + 1), z),
        at(x, Math.max(0, z - 1)),
        at(x, Math.min(size - 1, z + 1)),
      );
      const slope = height - neighborMinimum;
      let surface = palette.grass;
      if (id === 'pedestal') surface = palette.stone;
      else if (id === 'snow-forest') surface = palette.snow;
      else if (id === 'mountains') {
        surface = height > 57 ? palette.snow : slope > 2 ? palette.stone : palette.grassDark;
      } else if (id === 'beach') {
        surface = z > worldCoordinate(168) ? palette.sand : palette.grassLight;
      }
      else if (id === 'swamp') surface = height <= 18 ? palette.earth : palette.grassDark;
      else {
        const variation = hash2(x * 3, z * 5) % 19;
        surface = variation < 4 ? palette.grassLight : variation === 18 ? palette.grassDark : palette.grass;
      }
      const bottom = Math.max(1, Math.min(height - 3, neighborMinimum - 2));
      for (let y = bottom; y <= height; y += 1) {
        const material = y === height
          ? surface
          : id === 'mountains' && (slope > 2 || height > 50) ? palette.stone : palette.earth;
        put(cells, x, y, z, material);
      }
    }
  }
}

function topAt(heights: Int16Array, x: number, z: number): number {
  return heights[
    clamp(z, 0, STUDIO_WORLD_SIZE - 1) * STUDIO_WORLD_SIZE
      + clamp(x, 0, STUDIO_WORLD_SIZE - 1)
  ]!;
}

/** Keep the authored front-camera path to the subject readable without emptying the foreground. */
function occupiesFrontCompositionCorridor(x: number, z: number, halfWidth = 22): boolean {
  const corridorStart = STUDIO_WORLD_CENTER + 18;
  if (z < corridorStart) return false;
  const progress = z - corridorStart;
  const sightlineX = STUDIO_WORLD_CENTER + progress * (56 / 128);
  const canopyClearance = Math.max(halfWidth, 44);
  const cameraX = STUDIO_WORLD_CENTER + 56;
  const cameraZ = STUDIO_WORLD_CENTER + 146;
  return Math.abs(x - sightlineX) < canopyClearance
    || Math.hypot(x - cameraX, z - cameraZ) < 52;
}

const VISTA_CORRIDORS: Readonly<Record<Exclude<EnvironmentId, 'pedestal'>, Readonly<{
  camera: readonly [number, number];
  target: readonly [number, number];
  landmark: readonly [number, number];
  clearance: number;
}>>> = Object.freeze({
  forest: Object.freeze({ camera: [74, 327] as const, target: [164, 192] as const, landmark: [47, 168] as const, clearance: 48 }),
  'snow-forest': Object.freeze({ camera: [304, 330] as const, target: [217, 192] as const, landmark: [320, 153] as const, clearance: 34 }),
  mountains: Object.freeze({ camera: [80, 334] as const, target: [167, 174] as const, landmark: [71, 101] as const, clearance: 36 }),
  beach: Object.freeze({ camera: [66, 350] as const, target: [162, 212] as const, landmark: [78, 286] as const, clearance: 28 }),
  swamp: Object.freeze({ camera: [68, 334] as const, target: [162, 197] as const, landmark: [72, 168] as const, clearance: 34 }),
});

function distanceToCorridor(
  point: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
): number {
  const deltaX = end[0] - start[0];
  const deltaZ = end[1] - start[1];
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const progress = clamp(
    ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaZ) / lengthSquared,
    0,
    1,
  );
  return Math.hypot(
    point[0] - (start[0] + deltaX * progress),
    point[1] - (start[1] + deltaZ * progress),
  );
}

function occupiesVistaCompositionCorridor(
  id: Exclude<EnvironmentId, 'pedestal'>,
  x: number,
  z: number,
): boolean {
  const corridor = VISTA_CORRIDORS[id];
  const halfWidth = corridor.clearance;
  const point = [x, z] as const;
  return distanceToCorridor(point, corridor.camera, corridor.target) < halfWidth
    || distanceToCorridor(point, corridor.camera, corridor.landmark) < halfWidth * 0.68
    || Math.hypot(x - corridor.camera[0], z - corridor.camera[1]) < halfWidth + 10;
}

function occupiesSubjectClearing(x: number, z: number, radiusX = 66, radiusZ = 70): boolean {
  return Math.hypot(
    (x - STUDIO_WORLD_CENTER) / radiusX,
    (z - STUDIO_WORLD_CENTER) / radiusZ,
  ) < 1;
}

function addPath(
  cells: CellMap,
  heights: Int16Array,
  palette: EnvironmentPalette,
  seed: number,
): void {
  const startZ = STUDIO_WORLD_CENTER + 40;
  for (let z = startZ; z < STUDIO_WORLD_SIZE; z += 1) {
    const progress = (z - startZ) / (STUDIO_WORLD_SIZE - startZ);
    const center = Math.round(
      STUDIO_WORLD_CENTER + progress * 80 + Math.sin(progress * Math.PI * 2 + seed) * 7,
    );
    const halfWidth = 4 + Math.round(progress * 3);
    for (let x = center - halfWidth; x <= center + halfWidth; x += 1) {
      const y = topAt(heights, x, z);
      put(cells, x, y, z, Math.abs(x - center) >= halfWidth - 1 ? palette.stoneLight : palette.path);
      if ((x + z + seed) % 13 === 0) put(cells, x, y + 1, z, palette.stone);
    }
  }
}

function addSanctuaryForecourt(
  id: EnvironmentId,
  cells: CellMap,
  heights: Int16Array,
  palette: EnvironmentPalette,
): void {
  if (id === 'pedestal') return;
  const center = STUDIO_WORLD_CENTER;
  const radiusX = 72;
  const radiusZ = 76;
  for (let z = center - radiusZ; z <= center + radiusZ; z += 1) {
    for (let x = center - radiusX; x <= center + radiusX; x += 1) {
      const distance = Math.hypot((x - center) / radiusX, (z - center) / radiusZ);
      if (distance >= 1) continue;
      const y = topAt(heights, x, z);
      const seam = x % 9 === 0 || z % 8 === 0;
      const weathered = hash2(x * 5 + 17, z * 7 - 31) % 19 < 3;
      let material = palette.path;
      if (id === 'mountains') material = seam ? palette.stoneLight : palette.stone;
      else if (id === 'snow-forest') material = seam || weathered ? palette.stoneLight : palette.snow;
      else if (id === 'beach') material = seam && distance < 0.82 ? palette.path : palette.sand;
      else if (id === 'swamp') material = seam ? palette.path : palette.timber;
      else if (weathered) material = palette.grassDark;
      put(cells, x, y, z, material);
    }
  }

  // A broken perimeter wall makes the clearing an authored terrace. The front gap receives the path.
  for (let index = 0; index < 168; index += 1) {
    const angle = index * Math.PI * 2 / 168;
    const x = Math.round(center + Math.cos(angle) * 70);
    const z = Math.round(center + Math.sin(angle) * 74);
    if (z > center + 38 && Math.abs(x - center) < 30) continue;
    if (hash2(index, id.length * 97) % 23 < 3) continue;
    const y = topAt(heights, x, z) + 1;
    const base = id === 'beach' || id === 'swamp' ? palette.timber : palette.stone;
    const cap = id === 'snow-forest' ? palette.snow : id === 'forest' ? palette.grassDark : palette.stoneLight;
    fill(cells, x - 1, y, z - 1, 3, 2 + index % 2, 3, base);
    put(cells, x, y + 2 + index % 2, z, cap);
  }

  // Two low garden courts frame the entrance without blocking the camera sightline.
  for (const side of [-1, 1]) {
    const gardenX = center + side * 57;
    const gardenZ = center + 24;
    const gardenY = topAt(heights, gardenX, gardenZ) + 1;
    for (let dx = -11; dx <= 11; dx += 1) {
      for (let dz = -8; dz <= 8; dz += 1) {
        const edge = Math.abs(dx) >= 9 || Math.abs(dz) >= 6;
        if (edge) put(cells, gardenX + dx, gardenY, gardenZ + dz, palette.stoneLight);
        else if ((dx + dz) % 5 === 0) put(cells, gardenX + dx, gardenY, gardenZ + dz, palette.earth);
      }
    }
    if (id === 'mountains' || id === 'snow-forest') {
      addConifer(cells, gardenX, gardenY + 1, gardenZ, 18, palette, 3100 + side, id === 'snow-forest');
    } else if (id === 'beach') {
      addGrassClump(cells, gardenX, gardenY + 1, gardenZ, palette, 3200 + side);
    } else if (id === 'swamp') {
      addFern(cells, gardenX, gardenY + 1, gardenZ, palette, 3300 + side);
    } else {
      addShrub(cells, gardenX, gardenY + 1, gardenZ, 6, palette, 3400 + side);
    }
  }
}

function addLantern(
  cells: CellMap,
  x: number,
  y: number,
  z: number,
  palette: EnvironmentPalette,
): void {
  fill(cells, x, y, z, 2, 11, 2, palette.iron);
  fill(cells, x - 1, y + 10, z - 1, 4, 4, 4, palette.paper);
  fill(cells, x, y + 11, z, 2, 2, 2, palette.light);
  put(cells, x, y + 14, z, palette.timber);
}

function environmentCells(
  id: EnvironmentId,
  materials: readonly VoxelMaterial[],
  water: number,
  cells: CellMap,
): void {
  const palette = environmentPalette(materials, water);
  const heights = new Int16Array(STUDIO_WORLD_DIMENSIONS[0] * STUDIO_WORLD_DIMENSIONS[2]);
  for (let z = 0; z < STUDIO_WORLD_DIMENSIONS[2]; z += 1) {
    for (let x = 0; x < STUDIO_WORLD_DIMENSIONS[0]; x += 1) {
      heights[z * STUDIO_WORLD_DIMENSIONS[0] + x] = terrainHeight(id, x, z);
    }
  }
  writeTerrain(id, heights, cells, palette);
  addSanctuaryForecourt(id, cells, heights, palette);

  if (id === 'pedestal') {
    fill(cells, STUDIO_WORLD_CENTER - 54, 21, STUDIO_WORLD_CENTER - 60, 108, 4, 120, palette.stone);
    fill(cells, STUDIO_WORLD_CENTER - 47, 25, STUDIO_WORLD_CENTER - 53, 94, 2, 106, palette.stoneLight);
    for (let x = STUDIO_WORLD_CENTER - 44; x < STUDIO_WORLD_CENTER + 45; x += 8) {
      put(cells, x, 27, STUDIO_WORLD_CENTER - 52, palette.iron);
      put(cells, x, 27, STUDIO_WORLD_CENTER + 52, palette.iron);
    }
    return;
  }

  if (id === 'beach') {
    const shoreStart = worldCoordinate(169);
    for (let z = shoreStart; z < STUDIO_WORLD_SIZE; z += 1) {
      for (let x = 0; x < STUDIO_WORLD_SIZE; x += 1) {
        const seabed = topAt(heights, x, z);
        if (seabed < 22) {
          put(cells, x, 21, z, palette.water);
          if ((x + z) % 7 !== 0) put(cells, x, 22, z, palette.water);
        }
      }
    }
    for (let x = 3; x < STUDIO_WORLD_SIZE - 3; x += 2) {
      const z = shoreStart + Math.round(Math.sin(x * 0.055) * 7 + Math.sin(x * 0.017) * 4);
      putIfEmpty(cells, x, 23, z, palette.paper);
      if (x % 6 === 0) putIfEmpty(cells, x + 1, 23, z + 1, palette.paper);
    }
    for (let index = 0; index < 38; index += 1) {
      const x = 12 + hash2(index, 91) % (STUDIO_WORLD_SIZE - 24);
      const z = worldCoordinate(32) + hash2(index, 37) % worldCoordinate(132);
      if (occupiesSubjectClearing(x, z, 73, 76)
        || occupiesFrontCompositionCorridor(x, z, 18)
        || occupiesVistaCompositionCorridor('beach', x, z)) continue;
      addPalm(cells, x, topAt(heights, x, z) + 1, z, 30 + hash2(index, 17) % 18, palette, index + 4);
    }
    for (let index = 0; index < 260; index += 1) {
      const x = 7 + hash2(index, 111) % (STUDIO_WORLD_SIZE - 14);
      const z = worldCoordinate(60) + hash2(index, 211) % worldCoordinate(108);
      if (occupiesSubjectClearing(x, z, 48, 52)) continue;
      addGrassClump(cells, x, topAt(heights, x, z) + 1, z, palette, index + 30);
    }
    for (let index = 0; index < 42; index += 1) {
      const x = 12 + hash2(index, 1411) % (STUDIO_WORLD_SIZE - 24);
      const z = worldCoordinate(52) + hash2(index, 1511) % worldCoordinate(110);
      if (occupiesSubjectClearing(x, z, 54, 58)) continue;
      addShrub(cells, x, topAt(heights, x, z) + 1, z, 3 + index % 3, palette, index + 501);
    }
    for (let detail = 0; detail < 34; detail += 1) {
      const angle = detail * Math.PI * 2 / 34 + 0.1;
      const x = Math.round(STUDIO_WORLD_CENTER + Math.cos(angle) * (51 + detail % 6));
      const z = Math.round(STUDIO_WORLD_CENTER + Math.sin(angle) * (54 + detail % 8));
      const y = topAt(heights, x, z) + 1;
      if (detail % 6 === 0) addBoulder(cells, x, y, z, 2 + detail % 3, palette, 2400 + detail);
      else addGrassClump(cells, x, y, z, palette, 2500 + detail);
    }
    for (const [designX, designZ, radius] of [[28, 179, 8], [48, 191, 5], [218, 172, 9], [232, 198, 6], [16, 222, 7]] as const) {
      const x = worldCoordinate(designX);
      const z = worldCoordinate(designZ);
      addBoulder(cells, x, topAt(heights, x, z) + 1, z, radius, palette, x + z);
    }
    addRockOutcrop(cells, worldCoordinate(24), 20, worldCoordinate(186), 26, 15, 22, palette, 801);
    addRockOutcrop(cells, worldCoordinate(230), 20, worldCoordinate(178), 30, 18, 24, palette, 802);
    addDuneFence(cells, heights, worldCoordinate(18), worldCoordinate(151), worldCoordinate(62), palette);
    addDuneFence(cells, heights, worldCoordinate(176), worldCoordinate(146), worldCoordinate(58), palette);

    // A weathered jetty and small shade structure give the coast a second authored focal layer.
    const pierX = worldCoordinate(52);
    for (let z = worldCoordinate(157); z < STUDIO_WORLD_SIZE - 18; z += 3) {
      const y = 25;
      fill(cells, pierX - 6, y, z, 13, 1, 2, z % 2 === 0 ? palette.timber : palette.path);
      if (z % 12 === 0) {
        fill(cells, pierX - 7, 17, z, 1, 10, 1, palette.bark);
        fill(cells, pierX + 7, 17, z, 1, 10, 1, palette.bark);
      }
    }
    addTimberRail(cells, [pierX - 7, 31, worldCoordinate(157)], [pierX - 7, 31, STUDIO_WORLD_SIZE - 18], palette);
    addTimberRail(cells, [pierX + 7, 31, worldCoordinate(157)], [pierX + 7, 31, STUDIO_WORLD_SIZE - 18], palette);
    const shadeX = worldCoordinate(211);
    const shadeZ = worldCoordinate(132);
    const shadeY = topAt(heights, shadeX, shadeZ) + 1;
    for (const [dx, dz] of [[-11, -7], [11, -7], [-11, 7], [11, 7]] as const) {
      line(cells, [shadeX + dx, shadeY, shadeZ + dz], [shadeX + dx, shadeY + 19, shadeZ + dz], 0, palette.timber);
    }
    for (let stripe = -13; stripe <= 13; stripe += 3) {
      line(cells, [shadeX + stripe, shadeY + 19, shadeZ - 9], [shadeX + stripe + 3, shadeY + 17, shadeZ + 9], 0, stripe % 2 === 0 ? palette.paper : palette.path);
    }
    addCanoe(cells, pierX + 36, 23, worldCoordinate(210), palette, 3701);
    addFlyingBirds(cells, worldCoordinate(104), 91, worldCoordinate(129), palette);
    return;
  }

  if (id === 'swamp') {
    for (let z = 0; z < STUDIO_WORLD_SIZE; z += 1) {
      for (let x = 0; x < STUDIO_WORLD_SIZE; x += 1) {
        const ground = topAt(heights, x, z);
        if (ground < 23) put(cells, x, 23, z, palette.water);
      }
    }
    for (let index = 0; index < 118; index += 1) {
      const x = 8 + hash2(index, 313) % (STUDIO_WORLD_SIZE - 16);
      const z = 8 + hash2(index, 417) % (STUDIO_WORLD_SIZE - 16);
      if (occupiesSubjectClearing(x, z, 78, 82)
        || occupiesVistaCompositionCorridor('swamp', x, z)
        || topAt(heights, x, z) < 20) continue;
      addCypress(cells, x, topAt(heights, x, z) + 1, z, 32 + hash2(index, 19) % 23, palette, index + 9);
    }
    // A dense back band closes the horizon with layered silhouettes instead of a visible water edge.
    for (let index = 0; index < 22; index += 1) {
      const x = 10 + index * 17;
      const z = worldCoordinate(20) + (index % 4) * 14;
      addCypress(
        cells,
        x,
        topAt(heights, x, z) + 1,
        z,
        38 + index % 6 * 3,
        palette,
        index + 211,
      );
    }
    for (const [designX, designZ, height, seed] of [
      [43, 118, 41, 301], [61, 170, 36, 302], [208, 117, 44, 303],
      [223, 166, 39, 304], [36, 205, 34, 305], [220, 215, 37, 306],
    ] as const) {
      const x = worldCoordinate(designX);
      const z = worldCoordinate(designZ);
      addCypress(cells, x, topAt(heights, x, z) + 1, z, height, palette, seed);
    }
    for (let index = 0; index < 520; index += 1) {
      const x = 3 + hash2(index, 601) % (STUDIO_WORLD_SIZE - 6);
      const z = 3 + hash2(index, 701) % (STUDIO_WORLD_SIZE - 6);
      const ground = topAt(heights, x, z);
      if (ground >= 23 && !occupiesSubjectClearing(x, z, 50, 54)) {
        if (index % 3 === 0) addFern(cells, x, ground + 1, z, palette, index + 100);
        else addGrassClump(cells, x, ground + 1, z, palette, index + 100);
      } else if (ground < 23 && index % 2 === 0) {
        fill(cells, x - 2, 24, z, 5, 1, 1, palette.leaf);
        fill(cells, x, 24, z - 2, 1, 1, 5, palette.leaf);
        if (index % 10 === 0) put(cells, x, 25, z, palette.flower);
      }
    }
    for (let detail = 0; detail < 40; detail += 1) {
      const angle = detail * Math.PI * 2 / 40;
      const x = Math.round(STUDIO_WORLD_CENTER + Math.cos(angle) * (55 + detail % 8));
      const z = Math.round(STUDIO_WORLD_CENTER + Math.sin(angle) * (58 + detail % 9));
      const ground = topAt(heights, x, z);
      if (ground >= 23) addFern(cells, x, ground + 1, z, palette, 2600 + detail);
      else {
        line(cells, [x, 24, z], [x + detail % 3 - 1, 29 + detail % 5, z], 0, palette.grassLight);
        if (detail % 4 === 0) putIfEmpty(cells, x + 2, 24, z + 1, palette.leaf);
      }
    }
    for (const [designX, designZ] of [[38, 142], [216, 132], [48, 52], [205, 211], [92, 41], [164, 230]] as const) {
      const x = worldCoordinate(designX);
      const z = worldCoordinate(designZ);
      line(cells, [x - 7, 24, z], [x + 8, 27, z + 3], 2, palette.bark);
    }
    // A hand-laid boardwalk carries the front composition across the water and into the clearing.
    const boardwalkStart = STUDIO_WORLD_CENTER + 36;
    const leftRail: Vec3Tuple[] = [];
    const rightRail: Vec3Tuple[] = [];
    for (let z = boardwalkStart; z < STUDIO_WORLD_SIZE; z += 3) {
      const progress = (z - boardwalkStart) / (STUDIO_WORLD_SIZE - boardwalkStart);
      const center = Math.round(STUDIO_WORLD_CENTER + progress * 80 + Math.sin(progress * Math.PI * 2.2) * 6);
      const y = Math.max(25, topAt(heights, center, z) + 1);
      fill(cells, center - 6, y, z, 13, 1, 2, z % 2 === 0 ? palette.timber : palette.path);
      if ((z - boardwalkStart) % 12 === 0) {
        fill(cells, center - 7, 22, z, 1, y - 18, 1, palette.bark);
        fill(cells, center + 7, 22, z, 1, y - 18, 1, palette.bark);
        leftRail.push([center - 7, y + 6, z]);
        rightRail.push([center + 7, y + 6, z]);
      }
    }
    for (let index = 1; index < leftRail.length; index += 1) {
      line(cells, leftRail[index - 1]!, leftRail[index]!, 0, palette.timber);
      line(cells, rightRail[index - 1]!, rightRail[index]!, 0, palette.timber);
    }

    // A half-collapsed stilt shelter makes the swamp an authored place rather than a tree scatter.
    const shelterX = worldCoordinate(48);
    const shelterZ = worldCoordinate(112);
    const shelterY = 34;
    fill(cells, shelterX - 16, shelterY, shelterZ - 11, 32, 2, 22, palette.timber);
    for (const [dx, dz] of [[-14, -9], [14, -9], [-14, 9], [14, 9]] as const) {
      line(cells, [shelterX + dx, 17, shelterZ + dz], [shelterX + dx, shelterY + 22, shelterZ + dz], 1, palette.bark);
    }
    for (let offset = -19; offset <= 19; offset += 2) {
      const roofY = shelterY + 25 - Math.floor(Math.abs(offset) * 0.35);
      line(cells, [shelterX + offset, roofY, shelterZ - 14], [shelterX + offset, roofY, shelterZ + 14], 0, offset % 4 === 0 ? palette.path : palette.timber);
    }
    addLantern(cells, shelterX - 11, shelterY + 2, shelterZ + 7, palette);
    addLantern(cells, shelterX + 11, shelterY + 2, shelterZ + 7, palette);
    addCanoe(cells, worldCoordinate(84), 24, worldCoordinate(188), palette, 3801);
    addFireflies(
      cells,
      [shelterX + 28, shelterY + 14, shelterZ + 24],
      [47, 17, 52],
      palette,
      3901,
      24,
    );
    addRockOutcrop(cells, worldCoordinate(224), 22, worldCoordinate(72), 28, 17, 26, palette, 1001);
    return;
  }

  addPath(cells, heights, palette, id === 'snow-forest' ? 3 : id === 'mountains' ? 6 : 1);

  if (id === 'forest') {
    for (let z = 0; z < STUDIO_WORLD_SIZE; z += 1) {
      for (let x = 0; x < worldCoordinate(78); x += 1) {
        const ground = topAt(heights, x, z);
        if (ground < 22) putIfEmpty(cells, x, 22, z, palette.water);
      }
    }
    for (let index = 0; index < 158; index += 1) {
      const x = 7 + hash2(index, 103) % (STUDIO_WORLD_SIZE - 14);
      const z = 5 + hash2(index, 207) % (STUDIO_WORLD_SIZE - 18);
      if (occupiesSubjectClearing(x, z, 78, 82)
        || occupiesFrontCompositionCorridor(x, z, 18)
        || occupiesVistaCompositionCorridor('forest', x, z)) continue;
      const baseY = topAt(heights, x, z) + 1;
      const height = 32 + hash2(index, 29) % 25;
      if (index % 2 === 0) addDeciduousTree(cells, x, baseY, z, height, palette, index + 11);
      else addConifer(cells, x, baseY, z, height, palette, index + 11, false);
    }
    for (let index = 0; index < 760; index += 1) {
      const x = 4 + hash2(index, 509) % (STUDIO_WORLD_SIZE - 8);
      const z = worldCoordinate(18) + hash2(index, 613) % (STUDIO_WORLD_SIZE - worldCoordinate(20));
      if (occupiesSubjectClearing(x, z, 48, 52)) continue;
      const y = topAt(heights, x, z) + 1;
      if (index % 4 === 0) addFern(cells, x, y, z, palette, index + 200);
      else addGrassClump(cells, x, y, z, palette, index + 200);
    }
    for (let index = 0; index < 58; index += 1) {
      const x = 10 + hash2(index, 1709) % (STUDIO_WORLD_SIZE - 20);
      const z = 10 + hash2(index, 1801) % (STUDIO_WORLD_SIZE - 20);
      if (occupiesSubjectClearing(x, z, 54, 58)) continue;
      addShrub(cells, x, topAt(heights, x, z) + 1, z, 3 + index % 4, palette, index + 600);
    }
    for (let detail = 0; detail < 28; detail += 1) {
      const angle = detail * Math.PI * 2 / 28 + 0.18;
      const x = Math.round(STUDIO_WORLD_CENTER + Math.cos(angle) * (52 + detail % 7));
      const z = Math.round(STUDIO_WORLD_CENTER + Math.sin(angle) * (55 + detail % 9));
      const y = topAt(heights, x, z) + 1;
      if (detail % 5 === 0) addBoulder(cells, x, y, z, 2 + detail % 3, palette, 2100 + detail);
      else if (detail % 3 === 0) addShrub(cells, x, y, z, 3, palette, 2200 + detail);
      else addFern(cells, x, y, z, palette, 2300 + detail);
    }
    for (const [designX, designZ, radius] of [[36, 126, 6], [211, 154, 8], [54, 210, 5], [198, 62, 7], [19, 83, 5]] as const) {
      const x = worldCoordinate(designX);
      const z = worldCoordinate(designZ);
      addBoulder(cells, x, topAt(heights, x, z) + 1, z, radius, palette, x + z);
    }
    addRockOutcrop(cells, worldCoordinate(24), topAt(heights, worldCoordinate(24), worldCoordinate(82)) + 1, worldCoordinate(82), 28, 20, 24, palette, 1101);
    addRockOutcrop(cells, worldCoordinate(224), topAt(heights, worldCoordinate(224), worldCoordinate(137)) + 1, worldCoordinate(137), 24, 17, 22, palette, 1102);
    const archX = worldCoordinate(31);
    const archZ = worldCoordinate(112);
    addRuinedArch(cells, archX, topAt(heights, archX, archZ) + 1, archZ, 29, 31, palette, 1201);
    const bridgeZ = worldCoordinate(188);
    const bridgeX = worldCoordinate(48);
    const bridgeY = 25;
    for (let x = bridgeX - 17; x <= bridgeX + 17; x += 2) {
      fill(cells, x, bridgeY + Math.round(Math.sin((x - bridgeX) / 34 * Math.PI) * 4), bridgeZ - 6, 2, 1, 13, palette.timber);
    }
    for (const [designX, designZ] of [[112, 196], [145, 218], [95, 239], [162, 246], [89, 165], [174, 181]] as const) {
      const x = worldCoordinate(designX);
      const z = worldCoordinate(designZ);
      addLantern(cells, x, topAt(heights, x, z) + 1, z, palette);
    }
    for (const [designX, designZ, direction, seed] of [
      [87, 178, 1, 4101],
      [188, 163, -1, 4102],
    ] as const) {
      const x = worldCoordinate(designX);
      const z = worldCoordinate(designZ);
      addDeer(cells, x, topAt(heights, x, z) + 1, z, palette, direction, seed);
    }
    for (const [designX, designZ, seed] of [[101, 164, 4201], [174, 194, 4202], [77, 211, 4203]] as const) {
      const x = worldCoordinate(designX);
      const z = worldCoordinate(designZ);
      addMushroomCluster(cells, x, topAt(heights, x, z) + 1, z, palette, seed);
    }
    addFireflies(cells, [worldCoordinate(128), 45, worldCoordinate(183)], [72, 13, 55], palette, 4301, 12);
    return;
  }

  if (id === 'snow-forest') {
    for (let index = 0; index < 186; index += 1) {
      const x = 5 + hash2(index, 809) % (STUDIO_WORLD_SIZE - 10);
      const z = 3 + hash2(index, 907) % (STUDIO_WORLD_SIZE - 12);
      if (occupiesSubjectClearing(x, z, 78, 82)
        || occupiesFrontCompositionCorridor(x, z, 18)
        || occupiesVistaCompositionCorridor('snow-forest', x, z)) continue;
      addConifer(
        cells,
        x,
        topAt(heights, x, z) + 1,
        z,
        31 + hash2(index, 43) % 27,
        palette,
        index + 17,
        true,
      );
    }
    for (const [designX, designZ, radius] of [[32, 144, 7], [219, 151, 8], [45, 212, 5], [202, 71, 7]] as const) {
      const x = worldCoordinate(designX);
      const z = worldCoordinate(designZ);
      addBoulder(cells, x, topAt(heights, x, z) + 1, z, radius, palette, x + z);
      irregularEllipsoid(cells, [x, topAt(heights, x, z) + radius * 2, z], [radius, 1, radius], palette.snow, palette.snow, x, false);
    }
    for (let index = 0; index < 210; index += 1) {
      const x = 8 + hash2(index, 1901) % (STUDIO_WORLD_SIZE - 16);
      const z = worldCoordinate(36) + hash2(index, 2003) % (STUDIO_WORLD_SIZE - worldCoordinate(40));
      if (occupiesSubjectClearing(x, z, 52, 56)) continue;
      const y = topAt(heights, x, z) + 1;
      irregularEllipsoid(
        cells,
        [x, y, z],
        [4 + index % 7, 1 + index % 2, 4 + (index * 3) % 7],
        palette.snow,
        palette.snow,
        index + 1300,
        false,
      );
    }
    for (let detail = 0; detail < 30; detail += 1) {
      const angle = detail * Math.PI * 2 / 30 + 0.24;
      const x = Math.round(STUDIO_WORLD_CENTER + Math.cos(angle) * (52 + detail % 7));
      const z = Math.round(STUDIO_WORLD_CENTER + Math.sin(angle) * (55 + detail % 7));
      const y = topAt(heights, x, z) + 1;
      if (detail % 4 === 0) {
        addBoulder(cells, x, y, z, 2 + detail % 3, palette, 2700 + detail);
        irregularEllipsoid(cells, [x, y + 4, z], [3, 1, 3], palette.snow, palette.snow, 2750 + detail, false);
      } else {
        irregularEllipsoid(cells, [x, y, z], [5, 2, 4], palette.snow, palette.snow, 2800 + detail, false);
      }
    }
    addRockOutcrop(cells, worldCoordinate(27), topAt(heights, worldCoordinate(27), worldCoordinate(111)) + 1, worldCoordinate(111), 32, 22, 27, palette, 1401, true);
    addRockOutcrop(cells, worldCoordinate(225), topAt(heights, worldCoordinate(225), worldCoordinate(134)) + 1, worldCoordinate(134), 29, 19, 25, palette, 1402, true);
    const fenceStartX = worldCoordinate(32);
    const fenceZ = worldCoordinate(184);
    const fenceY = topAt(heights, fenceStartX, fenceZ) + 9;
    addTimberRail(cells, [fenceStartX, fenceY, fenceZ], [worldCoordinate(89), fenceY + 1, fenceZ + 7], palette);
    const archX = worldCoordinate(213);
    const archZ = worldCoordinate(102);
    addRuinedArch(cells, archX, topAt(heights, archX, archZ) + 1, archZ, 26, 29, palette, 1501);
    for (const [designX, designZ] of [[113, 198], [147, 220], [91, 238], [166, 244], [92, 166], [174, 181]] as const) {
      const x = worldCoordinate(designX);
      const z = worldCoordinate(designZ);
      addLantern(cells, x, topAt(heights, x, z) + 1, z, palette);
    }
    for (const [designX, designZ, direction, seed] of [
      [91, 179, 1, 4401],
      [180, 166, -1, 4402],
    ] as const) {
      const x = worldCoordinate(designX);
      const z = worldCoordinate(designZ);
      addFox(cells, x, topAt(heights, x, z) + 1, z, palette, direction, seed);
    }
    return;
  }

  if (id === 'mountains') {
    for (let index = 0; index < 92; index += 1) {
      const x = 8 + hash2(index, 1009) % (STUDIO_WORLD_SIZE - 16);
      const z = worldCoordinate(62) + hash2(index, 1103) % (STUDIO_WORLD_SIZE - worldCoordinate(68));
      if (occupiesSubjectClearing(x, z, 76, 80)
        || occupiesFrontCompositionCorridor(x, z, 18)
        || occupiesVistaCompositionCorridor('mountains', x, z)) continue;
      const y = topAt(heights, x, z);
      if (y < 57) addConifer(cells, x, y + 1, z, 27 + hash2(index, 53) % 20, palette, index + 23, y > 40);
    }
    for (let index = 0; index < 76; index += 1) {
      const x = 6 + hash2(index, 1201) % (STUDIO_WORLD_SIZE - 12);
      const z = 8 + hash2(index, 1301) % (STUDIO_WORLD_SIZE - 16);
      if (occupiesSubjectClearing(x, z, 80, 84)) continue;
      const y = topAt(heights, x, z);
      if (y < 55) addBoulder(cells, x, y + 1, z, 2 + hash2(index, 61) % 4, palette, index + 61);
    }
    for (const [designX, designZ, height] of [[92, 199, 5], [105, 205, 7], [157, 213, 6], [174, 225, 8]] as const) {
      const x = worldCoordinate(designX);
      const z = worldCoordinate(designZ);
      const y = topAt(heights, x, z) + 1;
      for (let tier = 0; tier < height; tier += 1) {
        fill(cells, x - tier, y + tier, z - tier, tier * 2 + 1, 1, tier * 2 + 1, tier % 2 ? palette.stone : palette.stoneLight);
      }
    }
    for (const [designX, designZ, width, height, depth, seed] of [
      [23, 54, 32, 35, 28, 1601], [82, 29, 26, 31, 24, 1602],
      [176, 31, 34, 38, 29, 1603], [235, 64, 28, 33, 26, 1604],
      [29, 151, 24, 22, 21, 1605], [224, 148, 27, 24, 23, 1606],
    ] as const) {
      const x = worldCoordinate(designX);
      const z = worldCoordinate(designZ);
      addRockOutcrop(cells, x, topAt(heights, x, z) + 1, z, width, height, depth, palette, seed);
    }
    const waterfallX = worldCoordinate(47);
    const waterfallZ = worldCoordinate(67);
    const waterfallTop = topAt(heights, waterfallX, waterfallZ) + 4;
    for (let y = 26; y <= waterfallTop; y += 1) {
      for (let offset = -3; offset <= 3; offset += 1) {
        put(cells, waterfallX + offset, y, waterfallZ, (offset + y) % 5 === 0 ? palette.paper : palette.water);
      }
    }
    irregularEllipsoid(cells, [waterfallX, 25, waterfallZ + 7], [12, 2, 13], palette.water, palette.water, 1701, false);
    const leftRailZ = worldCoordinate(175);
    const leftRailX = worldCoordinate(41);
    const leftRailY = topAt(heights, leftRailX, leftRailZ) + 9;
    addTimberRail(cells, [leftRailX, leftRailY, leftRailZ], [worldCoordinate(92), leftRailY + 2, worldCoordinate(194)], palette);
    const flagEndX = worldCoordinate(92);
    const flagEndZ = worldCoordinate(194);
    const flagEndY = topAt(heights, flagEndX, flagEndZ) + 34;
    line(cells, [leftRailX, leftRailY - 8, leftRailZ], [leftRailX, leftRailY + 27, leftRailZ], 1, palette.timber);
    line(cells, [flagEndX, flagEndY - 35, flagEndZ], [flagEndX, flagEndY, flagEndZ], 1, palette.timber);
    addPrayerFlags(
      cells,
      [leftRailX, leftRailY + 25, leftRailZ],
      [flagEndX, flagEndY - 2, flagEndZ],
      palette,
    );
    const mountainDeerX = worldCoordinate(185);
    const mountainDeerZ = worldCoordinate(188);
    addDeer(
      cells,
      mountainDeerX,
      topAt(heights, mountainDeerX, mountainDeerZ) + 1,
      mountainDeerZ,
      palette,
      -1,
      4501,
    );
    const archX = worldCoordinate(218);
    const archZ = worldCoordinate(96);
    addRuinedArch(cells, archX, topAt(heights, archX, archZ) + 1, archZ, 28, 34, palette, 1801);
  }
}

function compositionMaterials(subject: VoxelScene): Readonly<{
  materials: readonly VoxelMaterial[];
  waterIndex: number;
  warning: string | null;
}> {
  const used = new Set(subject.cells.map((cell) => cell.paletteIndex));
  let waterIndex = 255;
  while (waterIndex > 0 && used.has(waterIndex)) waterIndex -= 1;
  if (waterIndex === 0) {
    const existing = subject.materials.find((material) => material.water > 0.5)
      ?? subject.materials.find((material) => material.glass > 0.5);
    if (existing === undefined) {
      return Object.freeze({
        materials: subject.materials,
        waterIndex: nearestMaterial(subject.materials, [0.12, 0.48, 0.62]),
        warning: 'All 255 palette entries are occupied; environment water uses the nearest opaque source material.',
      });
    }
    return Object.freeze({ materials: subject.materials, waterIndex: existing.paletteIndex, warning: null });
  }
  const materials = [...subject.materials];
  materials[waterIndex] = Object.freeze({
    paletteIndex: waterIndex,
    srgb: [0.08, 0.42, 0.58] as const,
    linear: [0.0072, 0.1473, 0.2957] as const,
    roughness: 0.04,
    metallic: 0,
    emission: 0,
    glass: 0.92,
    water: 1,
    sourceType: '_water',
  });
  return Object.freeze({ materials: Object.freeze(materials), waterIndex, warning: null });
}

export function composeStudioScene(subject: VoxelScene, environment: EnvironmentId): VoxelScene {
  if (!ENVIRONMENT_PRESETS.some((preset) => preset.id === environment)) {
    throw new Error(`Unknown studio environment: ${environment}`);
  }
  const dimensions = STUDIO_WORLD_DIMENSIONS;
  const origin = STUDIO_WORLD_ORIGIN;
  const cells: CellMap = new Map();
  const composedMaterials = compositionMaterials(subject);
  environmentCells(environment, composedMaterials.materials, composedMaterials.waterIndex, cells);
  const groundWorldY = 0;
  const mappedSubjectCells: MutableCell[] = [];
  for (const cell of subject.cells) {
    const worldX = subject.origin[0] + cell.x;
    const worldY = subject.origin[1] + cell.y;
    const worldZ = subject.origin[2] + cell.z;
    const x = Math.round(worldX - origin[0]);
    const y = Math.round(groundWorldY + 1 + worldY - subject.bounds.min[1] - origin[1]);
    const z = Math.round(worldZ - origin[2]);
    if (x < 0 || y < 0 || z < 0
      || x >= dimensions[0] || y >= dimensions[1] || z >= dimensions[2]) continue;
    mappedSubjectCells.push({ x, y, z, paletteIndex: cell.paletteIndex });
    put(cells, x, y, z, cell.paletteIndex);
  }
  let snowAccretionCount = 0;
  if (environment === 'snow-forest') {
    const palette = environmentPalette(composedMaterials.materials, composedMaterials.waterIndex);
    const subjectKeys = new Set(mappedSubjectCells.map((cell) => voxelKey(cell.x, cell.y, cell.z)));
    const materialByIndex = new Map(subject.materials.map((material) => [material.paletteIndex, material]));
    for (const cell of mappedSubjectCells) {
      if (cell.y + 1 >= dimensions[1]) continue;
      const aboveKey = voxelKey(cell.x, cell.y + 1, cell.z);
      if (subjectKeys.has(aboveKey) || cells.has(aboveKey)) continue;
      const material = materialByIndex.get(cell.paletteIndex);
      if (material === undefined
        || material.glass > 0.2
        || material.water > 0.2
        || material.emission > 0.5) continue;
      if (hash2(cell.x * 13 + cell.z * 7, cell.y * 31) % 11 < 2) continue;
      put(cells, cell.x, cell.y + 1, cell.z, palette.snow);
      snowAccretionCount += 1;
    }
  }
  const frozen = Object.freeze([...cells.values()]
    .sort((left, right) => left.y - right.y || left.z - right.z || left.x - right.x)
    .map((cell) => Object.freeze(cell)));
  const preset = ENVIRONMENT_PRESETS.find((candidate) => candidate.id === environment)!;
  return Object.freeze({
    name: `${subject.name} · ${preset.label}`,
    dimensions,
    origin,
    cells: frozen,
    materials: composedMaterials.materials,
    bounds: Object.freeze({
      min: origin,
      max: [
        origin[0] + dimensions[0],
        origin[1] + dimensions[1],
        origin[2] + dimensions[2],
      ] as const,
    }),
    receipt: Object.freeze({
      ...subject.receipt,
      voxelCount: frozen.length,
      warnings: Object.freeze([
        ...subject.receipt.warnings,
        `Studio composition preserves subject ${subject.fingerprint} in ${environment}.`,
        ...(snowAccretionCount > 0
          ? [`Snow weathering adds ${snowAccretionCount.toLocaleString()} exposed-surface cells.`]
          : []),
        ...(composedMaterials.warning === null ? [] : [composedMaterials.warning]),
      ]),
    }),
    fingerprint: fingerprint(dimensions, frozen, `${subject.fingerprint}:${environment}`),
  });
}
