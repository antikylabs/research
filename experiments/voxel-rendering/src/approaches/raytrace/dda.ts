import type { Vec3Tuple } from '../../scene/types.ts';
import { densePaletteIndex, type DenseVoxelStorage } from './volume.ts';

const PARALLEL_EPSILON = 1e-12;
const TIE_EPSILON = 1e-9;
const ENTRY_EPSILON = 1e-7;

export type DenseDdaHit = Readonly<{
  status: 'hit';
  cell: Vec3Tuple;
  materialIndex: number;
  normal: Vec3Tuple;
  position: Vec3Tuple;
  distance: number;
  steps: number;
}>;

export type DenseDdaMiss = Readonly<{
  status: 'miss' | 'cap';
  distance: number;
  steps: number;
}>;

export type DenseDdaResult = DenseDdaHit | DenseDdaMiss;

type BoundsHit = Readonly<{
  enter: number;
  exit: number;
  normal: Vec3Tuple;
}>;

function normalizeDirection(direction: Vec3Tuple): Vec3Tuple {
  if (!direction.every(Number.isFinite)) {
    throw new Error('Raytrace direction components must be finite.');
  }
  const length = Math.hypot(...direction);
  if (length <= PARALLEL_EPSILON) throw new Error('Raytrace direction must be non-zero.');
  return [direction[0] / length, direction[1] / length, direction[2] / length];
}

function intersectBounds(
  rayOrigin: Vec3Tuple,
  direction: Vec3Tuple,
  min: Vec3Tuple,
  max: Vec3Tuple,
): BoundsHit | null {
  let enter = Number.NEGATIVE_INFINITY;
  let exit = Number.POSITIVE_INFINITY;
  let normal: Vec3Tuple = [0, 0, 0];

  for (let axis = 0; axis < 3; axis += 1) {
    const origin = rayOrigin[axis] ?? 0;
    const component = direction[axis] ?? 0;
    const low = min[axis] ?? 0;
    const high = max[axis] ?? 0;
    if (Math.abs(component) <= PARALLEL_EPSILON) {
      if (origin < low || origin >= high) return null;
      continue;
    }

    const lowT = (low - origin) / component;
    const highT = (high - origin) / component;
    const near = Math.min(lowT, highT);
    const far = Math.max(lowT, highT);
    if (near > enter + TIE_EPSILON) {
      enter = near;
      const axisNormal = [0, 0, 0] as [number, number, number];
      axisNormal[axis] = component > 0 ? -1 : 1;
      normal = axisNormal;
    }
    exit = Math.min(exit, far);
    if (enter > exit + TIE_EPSILON) return null;
  }

  const visibleEnter = Math.max(0, enter);
  if (exit < visibleEnter - TIE_EPSILON) return null;
  return { enter: visibleEnter, exit, normal: enter >= 0 ? normal : [0, 0, 0] };
}

function pointOnRay(origin: Vec3Tuple, direction: Vec3Tuple, distance: number): Vec3Tuple {
  return [
    origin[0] + direction[0] * distance,
    origin[1] + direction[1] * distance,
    origin[2] + direction[2] * distance,
  ];
}

export function traceDenseVoxels(
  volume: DenseVoxelStorage,
  rayOrigin: Vec3Tuple,
  rayDirection: Vec3Tuple,
  maxSteps = volume.traversalCap,
): DenseDdaResult {
  if (!rayOrigin.every(Number.isFinite)) throw new Error('Raytrace origin components must be finite.');
  if (!Number.isSafeInteger(maxSteps) || maxSteps <= 0) {
    throw new Error('Raytrace traversal cap must be a positive safe integer.');
  }
  const direction = normalizeDirection(rayDirection);
  const min = volume.origin;
  const max: Vec3Tuple = [
    min[0] + volume.dimensions[0],
    min[1] + volume.dimensions[1],
    min[2] + volume.dimensions[2],
  ];
  const bounds = intersectBounds(rayOrigin, direction, min, max);
  if (bounds === null) return Object.freeze({ status: 'miss', distance: 0, steps: 0 });

  const sampleDistance = Math.min(bounds.exit, bounds.enter + ENTRY_EPSILON);
  const sample = pointOnRay(rayOrigin, direction, sampleDistance);
  const cell = [
    Math.min(volume.dimensions[0] - 1, Math.max(0, Math.floor(sample[0] - min[0]))),
    Math.min(volume.dimensions[1] - 1, Math.max(0, Math.floor(sample[1] - min[1]))),
    Math.min(volume.dimensions[2] - 1, Math.max(0, Math.floor(sample[2] - min[2]))),
  ] as [number, number, number];
  const step = direction.map((value) => value > PARALLEL_EPSILON ? 1 : value < -PARALLEL_EPSILON ? -1 : 0) as [number, number, number];
  const delta = direction.map((value) => Math.abs(value) <= PARALLEL_EPSILON
    ? Number.POSITIVE_INFINITY
    : Math.abs(1 / value)) as [number, number, number];
  const next = cell.map((coordinate, axis) => {
    if (step[axis]! === 0) return Number.POSITIVE_INFINITY;
    const boundary = min[axis]! + coordinate + (step[axis]! > 0 ? 1 : 0);
    return (boundary - rayOrigin[axis]!) / direction[axis]!;
  }) as [number, number, number];
  let distance = bounds.enter;
  let normal = bounds.normal;
  let steps = 0;

  while (steps < maxSteps) {
    steps += 1;
    const materialIndex = densePaletteIndex(volume, cell[0], cell[1], cell[2]);
    if (materialIndex > 0) {
      return Object.freeze({
        status: 'hit',
        cell: Object.freeze([...cell]) as Vec3Tuple,
        materialIndex,
        normal,
        position: pointOnRay(rayOrigin, direction, distance),
        distance,
        steps,
      });
    }

    const nextDistance = Math.min(...next);
    if (nextDistance > bounds.exit + TIE_EPSILON) {
      return Object.freeze({ status: 'miss', distance: bounds.exit, steps });
    }

    let chosenAxis = -1;
    for (let axis = 0; axis < 3; axis += 1) {
      if (next[axis]! <= nextDistance + TIE_EPSILON) {
        if (chosenAxis < 0) chosenAxis = axis;
        cell[axis] = cell[axis]! + step[axis]!;
        next[axis] = next[axis]! + delta[axis]!;
      }
    }
    const nextNormal = [0, 0, 0] as [number, number, number];
    if (chosenAxis >= 0) nextNormal[chosenAxis] = -step[chosenAxis]!;
    normal = nextNormal;
    distance = nextDistance;

    if (cell[0] < 0 || cell[1] < 0 || cell[2] < 0
      || cell[0] >= volume.dimensions[0]
      || cell[1] >= volume.dimensions[1]
      || cell[2] >= volume.dimensions[2]) {
      return Object.freeze({ status: 'miss', distance: Math.min(distance, bounds.exit), steps });
    }
  }

  return Object.freeze({ status: 'cap', distance, steps });
}
