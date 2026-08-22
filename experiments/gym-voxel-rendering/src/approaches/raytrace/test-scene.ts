import type { Vec3Tuple, VoxelCell, VoxelMaterial, VoxelScene } from '../../scene/types.ts';

function material(index: number): VoxelMaterial {
  const value = index / 255;
  return Object.freeze({
    paletteIndex: index,
    srgb: [value, value, value] as const,
    linear: [value, value * 0.75, value * 0.5] as const,
    roughness: 0.2 + value * 0.7,
    metallic: index === 2 ? 0.8 : 0,
    emission: index === 3 ? 4 : 0,
    glass: 0,
    water: 0,
    sourceType: '_diffuse',
  });
}

export function raytraceTestScene(
  dimensions: Vec3Tuple,
  cells: readonly VoxelCell[],
  origin: Vec3Tuple = [0, 0, 0],
): VoxelScene {
  const materials = Array.from({ length: 256 }, (_, index) => material(index));
  return Object.freeze({
    name: 'raytrace fixture',
    dimensions,
    origin,
    cells,
    materials,
    bounds: Object.freeze({
      min: origin,
      max: [
        origin[0] + dimensions[0],
        origin[1] + dimensions[1],
        origin[2] + dimensions[2],
      ] as const,
    }),
    receipt: Object.freeze({
      source: 'built-in',
      sourceBytes: 0,
      parseMilliseconds: 0,
      modelCount: 1,
      selectedModel: 0,
      voxelCount: cells.length,
      warnings: Object.freeze([]),
    }),
    fingerprint: `fixture:${dimensions.join('x')}:${cells.map((cell) => `${cell.x},${cell.y},${cell.z},${cell.paletteIndex}`).join(';')}`,
  });
}
