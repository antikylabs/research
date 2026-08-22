import type { Vec3Tuple, VoxelMaterial, VoxelScene } from '../../scene/types.ts';

export const RAYTRACE_MAX_DIMENSION = 384;
export const RAYTRACE_VEC4_BYTES = 16;
export const RAYTRACE_VOXELS_PER_VEC4 = 4;
/** Four palette indices per vec4 keep the complete 384 × 128 × 384 studio volume below 128 MiB. */
export const RAYTRACE_MAX_VOLUME_BYTES = 128 * 1024 * 1024;
/** 384 + 128 + 384 + 3: worst-case conservative DDA traversal for the studio world. */
export const RAYTRACE_MAX_TRAVERSAL_STEPS = 899;

export type DenseVoxelStorage = Readonly<{
  dimensions: Vec3Tuple;
  origin: Vec3Tuple;
  volumeData: Float32Array<ArrayBuffer>;
  materialColor: Float32Array<ArrayBuffer>;
  materialSurface: Float32Array<ArrayBuffer>;
  vec4Elements: number;
  occupiedVoxels: number;
  volumeByteLength: number;
  byteLength: number;
  traversalCap: number;
}>;

export type DenseVoxelStorageLimits = Readonly<{
  maxDimension?: number;
  maxBytes?: number;
  maxTraversalSteps?: number;
}>;

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Raytrace ${label} must be a positive safe integer.`);
  }
  return value;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`Raytrace ${label} must be finite.`);
  return value;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function checkedMaterial(material: VoxelMaterial, index: number): readonly [number, number, number, number, number, number, number, number] {
  return [
    Math.max(0, finite(material.linear[0], `material ${index} red`)),
    Math.max(0, finite(material.linear[1], `material ${index} green`)),
    Math.max(0, finite(material.linear[2], `material ${index} blue`)),
    Math.max(0, finite(material.emission, `material ${index} emission`)),
    clamp01(finite(material.roughness, `material ${index} roughness`)),
    clamp01(finite(material.metallic, `material ${index} metallic`)),
    clamp01(finite(material.glass, `material ${index} glass`)),
    clamp01(finite(material.water, `material ${index} water`)),
  ];
}

export function denseVoxelIndex(
  dimensions: Vec3Tuple,
  x: number,
  y: number,
  z: number,
): number {
  return x + y * dimensions[0] + z * dimensions[0] * dimensions[1];
}

export function densePaletteIndex(volume: DenseVoxelStorage, x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || z < 0
    || x >= volume.dimensions[0]
    || y >= volume.dimensions[1]
    || z >= volume.dimensions[2]) return 0;
  const index = denseVoxelIndex(volume.dimensions, x, y, z);
  return Math.round(volume.volumeData[index] ?? 0);
}

export function createDenseVoxelStorage(
  scene: VoxelScene,
  limits: DenseVoxelStorageLimits = {},
): DenseVoxelStorage {
  const maxDimension = positiveInteger(
    limits.maxDimension ?? RAYTRACE_MAX_DIMENSION,
    'maximum dimension',
  );
  const maxBytes = positiveInteger(limits.maxBytes ?? RAYTRACE_MAX_VOLUME_BYTES, 'byte cap');
  const maxTraversalSteps = positiveInteger(
    limits.maxTraversalSteps ?? RAYTRACE_MAX_TRAVERSAL_STEPS,
    'traversal-step cap',
  );
  const dimensions = scene.dimensions.map((value, axis) => {
    const checked = positiveInteger(value, `dimension ${axis}`);
    if (checked > maxDimension) {
      throw new Error(`Raytrace dimension ${axis} is ${checked}; the proof caps every dimension at ${maxDimension}.`);
    }
    return checked;
  }) as unknown as Vec3Tuple;

  scene.origin.forEach((value, axis) => finite(value, `origin ${axis}`));
  const voxelElements = dimensions[0] * dimensions[1] * dimensions[2];
  if (!Number.isSafeInteger(voxelElements)) {
    throw new Error('Raytrace dense volume element count overflowed a safe integer.');
  }
  const vec4Elements = Math.ceil(voxelElements / RAYTRACE_VOXELS_PER_VEC4);
  const volumeByteLength = vec4Elements * RAYTRACE_VEC4_BYTES;
  if (!Number.isSafeInteger(volumeByteLength) || volumeByteLength > maxBytes) {
    throw new Error(`Raytrace dense volume needs ${volumeByteLength} bytes, above the ${maxBytes}-byte cap.`);
  }
  const traversalCap = dimensions[0] + dimensions[1] + dimensions[2] + 3;
  if (traversalCap > maxTraversalSteps) {
    throw new Error(
      `Raytrace dimensions need ${traversalCap} traversal steps, above the ${maxTraversalSteps}-step cap.`,
    );
  }

  if (scene.materials.length !== 256) {
    throw new Error(`Raytrace requires the shared 256-entry material table; received ${scene.materials.length}.`);
  }

  const volumeData = new Float32Array(vec4Elements * 4);
  const materialColor = new Float32Array(256 * 4);
  const materialSurface = new Float32Array(256 * 4);
  scene.materials.forEach((material, index) => {
    const values = checkedMaterial(material, index);
    materialColor.set(values.slice(0, 4), index * 4);
    materialSurface.set(values.slice(4, 8), index * 4);
  });

  const occupied = new Set<number>();
  for (const cell of scene.cells) {
    if (!Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y) || !Number.isSafeInteger(cell.z)
      || cell.x < 0 || cell.y < 0 || cell.z < 0
      || cell.x >= dimensions[0]
      || cell.y >= dimensions[1]
      || cell.z >= dimensions[2]) {
      throw new Error(`Raytrace cell (${cell.x}, ${cell.y}, ${cell.z}) is outside scene bounds.`);
    }
    if (!Number.isSafeInteger(cell.paletteIndex) || cell.paletteIndex < 1 || cell.paletteIndex > 255) {
      throw new Error(`Raytrace cell palette index ${cell.paletteIndex} must be in 1..255.`);
    }
    const index = denseVoxelIndex(dimensions, cell.x, cell.y, cell.z);
    if (occupied.has(index)) {
      throw new Error(`Raytrace dense volume contains duplicate cell (${cell.x}, ${cell.y}, ${cell.z}).`);
    }
    occupied.add(index);
    volumeData[index] = cell.paletteIndex;
  }

  return Object.freeze({
    dimensions: Object.freeze([...dimensions]) as Vec3Tuple,
    origin: Object.freeze([...scene.origin]) as Vec3Tuple,
    volumeData,
    materialColor,
    materialSurface,
    vec4Elements,
    occupiedVoxels: occupied.size,
    volumeByteLength,
    byteLength: volumeByteLength + materialColor.byteLength + materialSurface.byteLength,
    traversalCap,
  });
}
