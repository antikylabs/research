export type Vec3Tuple = readonly [number, number, number];

export type VoxelMaterial = Readonly<{
  paletteIndex: number;
  /** Display-encoded source color in the 0..1 range. */
  srgb: Vec3Tuple;
  /** Linear-light color used by every renderer. */
  linear: Vec3Tuple;
  roughness: number;
  metallic: number;
  emission: number;
  glass: number;
  sourceType: string;
}>;

export type VoxelCell = Readonly<{
  /** Integer grid coordinate. The y axis is up after normalization. */
  x: number;
  y: number;
  z: number;
  paletteIndex: number;
}>;

export type SceneReceipt = Readonly<{
  source: 'built-in' | 'vox';
  sourceBytes: number;
  parseMilliseconds: number;
  modelCount: number;
  selectedModel: number;
  voxelCount: number;
  warnings: readonly string[];
}>;

export type VoxelScene = Readonly<{
  name: string;
  dimensions: Vec3Tuple;
  /** World-space position of grid corner (0, 0, 0). */
  origin: Vec3Tuple;
  cells: readonly VoxelCell[];
  /** Palette-indexed material table. Entries 0..255 always exist. */
  materials: readonly VoxelMaterial[];
  bounds: Readonly<{ min: Vec3Tuple; max: Vec3Tuple }>;
  receipt: SceneReceipt;
  fingerprint: string;
}>;

export function voxelKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function voxelWorldCenter(scene: VoxelScene, cell: VoxelCell): Vec3Tuple {
  return [
    scene.origin[0] + cell.x + 0.5,
    scene.origin[1] + cell.y + 0.5,
    scene.origin[2] + cell.z + 0.5,
  ];
}

