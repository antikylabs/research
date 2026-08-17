import type { VoxelMaterial, VoxelScene } from '../scene/types.ts';
import type { VoxDocument } from './parse.ts';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function materialTableFromPalette(
  palette: readonly (readonly [number, number, number, number])[],
  sourceMaterials: ReadonlyMap<number, Readonly<Record<string, string>>> = new Map(),
): readonly VoxelMaterial[] {
  return Object.freeze(Array.from({ length: 256 }, (_, paletteIndex): VoxelMaterial => {
    const color = palette[paletteIndex] ?? [0, 0, 0, 0];
    const source = sourceMaterials.get(paletteIndex) ?? {};
    const sourceType = source._type ?? '_diffuse';
    const weight = clamp(finiteNumber(source._weight, 1), 0, 1);
    const emissionScale = sourceType === '_emit'
      ? Math.max(1, finiteNumber(source._flux, 1)) * Math.max(0.25, weight) * 3
      : 0;
    return Object.freeze({
      paletteIndex,
      srgb: [color[0] / 255, color[1] / 255, color[2] / 255] as const,
      linear: [channelToLinear(color[0]), channelToLinear(color[1]), channelToLinear(color[2])] as const,
      roughness: clamp(finiteNumber(source._rough, sourceType === '_metal' ? 0.28 : 0.72), 0.04, 1),
      metallic: sourceType === '_metal' ? weight : 0,
      emission: emissionScale,
      glass: sourceType === '_glass' ? weight : 0,
      sourceType,
    });
  }));
}

function hashScene(
  dimensions: readonly number[],
  cells: readonly Readonly<{ x: number; y: number; z: number; paletteIndex: number }>[],
): string {
  let hash = 0x811c9dc5;
  const add = (value: number): void => {
    hash ^= value & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  for (const dimension of dimensions) add(dimension);
  for (const cell of cells) {
    add(cell.x); add(cell.y); add(cell.z); add(cell.paletteIndex);
  }
  return hash.toString(16).padStart(8, '0');
}

export function normalizeVoxModel(
  document: VoxDocument,
  modelIndex: number,
  name: string,
  parseMilliseconds = 0,
): VoxelScene {
  const model = document.models[modelIndex];
  if (model === undefined) throw new RangeError(`VOX model ${modelIndex} does not exist`);
  const dimensions = [model.size[0], model.size[2], model.size[1]] as const;
  const origin = [-dimensions[0] / 2, -dimensions[1] / 2, -dimensions[2] / 2] as const;
  const cells = Object.freeze(model.voxels.map((voxel) => Object.freeze({
    x: voxel.x,
    y: voxel.z,
    z: voxel.y,
    paletteIndex: voxel.paletteIndex,
  })));
  const warnings = [...document.warnings];
  if (document.materials.size > 0) warnings.push('MATL values use the experiment mapping; glass is opaque/tinted.');
  return Object.freeze({
    name,
    dimensions,
    origin,
    cells,
    materials: materialTableFromPalette(document.palette, document.materials),
    bounds: Object.freeze({
      min: origin,
      max: [origin[0] + dimensions[0], origin[1] + dimensions[1], origin[2] + dimensions[2]] as const,
    }),
    receipt: Object.freeze({
      source: 'vox' as const,
      sourceBytes: document.sourceBytes,
      parseMilliseconds,
      modelCount: document.models.length,
      selectedModel: modelIndex,
      voxelCount: cells.length,
      warnings: Object.freeze(warnings),
    }),
    fingerprint: hashScene(dimensions, cells),
  });
}
