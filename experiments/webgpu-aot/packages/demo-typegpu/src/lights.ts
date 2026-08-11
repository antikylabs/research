import {
  MAX_FORWARD_LIGHTS,
  TYPEGPU_CURVE_POINT_COUNT,
} from "./shaders/lights.js";

export const WORKLOAD_SEED = 0x5350_4f4e;
export const FIRE_LIGHT_COUNT = 256;
export const CURVE_LIGHT_COUNT = 150;
export const CORRIDOR_LIGHT_COUNT = 64;
const MAIN_FIRE_COLOR = [10, 0.1, 0.1] as const;
const MAIN_FIRE_POSITIONS = [
  [3.9, 3, 0.9],
  [3.9, 3, -1.5],
  [-4.95, 3, 0.9],
  [-4.95, 3, -1.5],
] as const;
const FIRE_EMITTER_POSITIONS = [
  [3.9, 3, 1.15],
  [3.9, 3, -1.75],
  [-4.95, 3, 1.15],
  [-4.95, 3, -1.75],
] as const;
const CURVE_CONTROL_POINTS = [
  [5.5, 7.5, 3.25],
  [4, 6.5, 0.5],
  [2.5, 6.5, 3.25],
  [1, 7.5, 0.5],
  [-0.5, 7.5, 3.25],
  [-2, 6.5, 0.5],
  [-3.5, 6.5, 3.25],
  [-5, 7.5, 0.5],
  [-6.5, 7.5, 3.25],
  [-7.75, 6.5, 0.5],
  [-10.5, 7.5, -0.125],
  [-7.75, 7.5, -1],
  [-6.5, 6.5, -4],
  [-5, 6.5, -1],
  [-3.5, 7.5, -4],
  [-2, 7.5, -1],
  [-0.5, 6.5, -4],
  [1, 6.5, -1],
  [2.5, 7.5, -4],
  [4, 7.5, -1],
  [5.5, 6.5, -4],
  [6.5, 6.5, -1],
  [9, 6.5, -1],
  [9.5, 7.5, -0.125],
  [9, 6.5, 0.7],
  [6, 6.5, 1],
  [6, 7.5, 3.25],
] as const;

type Vec3 = readonly [number, number, number];

export interface AnimatedLightSeed {
  readonly billboardRadius: number;
  readonly color: Vec3;
  readonly life: number;
  readonly lifeSpeed: number;
  readonly origin: Vec3;
  readonly velocity: Vec3;
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomColor(random: () => number): Vec3 {
  return [random() * 3 + 1, random() * 3 + 1, random() * 3 + 1];
}

function randomDirection(random: () => number, scale: number): Vec3 {
  const angle = random() * Math.PI * 2;
  const z = random() * 2 - 1;
  const planarScale = Math.sqrt(1 - z * z) * scale;
  return [
    Math.cos(angle) * planarScale,
    Math.sin(angle) * planarScale,
    z * scale,
  ];
}

function distanceSquared(first: Vec3, second: Vec3): number {
  const x = first[0] - second[0];
  const y = first[1] - second[1];
  const z = first[2] - second[2];
  return x * x + y * y + z * z;
}

function cubicValue(
  first: number,
  start: number,
  end: number,
  last: number,
  dt0: number,
  dt1: number,
  dt2: number,
  weight: number,
): number {
  let startTangent =
    (start - first) / dt0 -
    (end - first) / (dt0 + dt1) +
    (end - start) / dt1;
  let endTangent =
    (end - start) / dt1 -
    (last - start) / (dt1 + dt2) +
    (last - end) / dt2;
  startTangent *= dt1;
  endTangent *= dt1;
  const squared = weight * weight;
  const cubed = squared * weight;
  return (
    start +
    startTangent * weight +
    (-3 * start + 3 * end - 2 * startTangent - endTangent) * squared +
    (2 * start - 2 * end + startTangent + endTangent) * cubed
  );
}

function curvePoint(progress: number): Vec3 {
  const count = CURVE_CONTROL_POINTS.length;
  const scaled = (progress - Math.floor(progress)) * count;
  const startIndex = Math.floor(scaled);
  const weight = scaled - startIndex;
  const first = CURVE_CONTROL_POINTS[(startIndex - 1 + count) % count];
  const start = CURVE_CONTROL_POINTS[startIndex];
  const end = CURVE_CONTROL_POINTS[(startIndex + 1) % count];
  const last = CURVE_CONTROL_POINTS[(startIndex + 2) % count];
  let dt0 = distanceSquared(first, start) ** 0.25;
  let dt1 = distanceSquared(start, end) ** 0.25;
  let dt2 = distanceSquared(end, last) ** 0.25;
  if (dt1 < 0.0001) dt1 = 1;
  if (dt0 < 0.0001) dt0 = dt1;
  if (dt2 < 0.0001) dt2 = dt1;
  return [
    cubicValue(first[0], start[0], end[0], last[0], dt0, dt1, dt2, weight),
    cubicValue(first[1], start[1], end[1], last[1], dt0, dt1, dt2, weight),
    cubicValue(first[2], start[2], end[2], last[2], dt0, dt1, dt2, weight),
  ];
}

export function createTypeGpuCurvePoints(): Float32Array<ArrayBuffer> {
  const values = new Float32Array(TYPEGPU_CURVE_POINT_COUNT * 4);
  for (let index = 0; index < TYPEGPU_CURVE_POINT_COUNT; index += 1) {
    values.set(curvePoint(index / TYPEGPU_CURVE_POINT_COUNT), index * 4);
  }
  return values;
}

export function createTypeGpuAnimatedLightSeeds(): readonly AnimatedLightSeed[] {
  const random = createMulberry32(WORKLOAD_SEED);
  const seeds: AnimatedLightSeed[] = [];
  for (let particle = 0; particle < FIRE_LIGHT_COUNT / 4; particle += 1) {
    for (const emitter of FIRE_EMITTER_POSITIONS) {
      const origin: Vec3 = [
        emitter[0] + (random() * 2 - 1) * 0.1,
        emitter[1],
        emitter[2] + (random() * 2 - 1) * 0.1,
      ];
      seeds.push({
        billboardRadius: 0.025,
        color: MAIN_FIRE_COLOR,
        life: 0,
        lifeSpeed: random() * 1.5 + 0.35,
        origin,
        velocity: [0, 0.5, 0],
      });
    }
  }
  for (let index = 0; index < CURVE_LIGHT_COUNT; index += 1) {
    seeds.push({
      billboardRadius: 0.02,
      color: randomColor(random),
      life: index / CURVE_LIGHT_COUNT,
      lifeSpeed: 0.01,
      origin: [0, 0, 0],
      velocity: randomDirection(random, 0.5),
    });
  }
  for (let side = 0; side < 2; side += 1) {
    for (let index = 0; index < CORRIDOR_LIGHT_COUNT / 2; index += 1) {
      seeds.push({
        billboardRadius: 0,
        color: randomColor(random),
        life: index / (CORRIDOR_LIGHT_COUNT / 2),
        lifeSpeed: 0.01,
        origin: [0, 0, 0],
        velocity: side === 0 ? [3.125, 1, 0] : [-3.775, -1, 0],
      });
    }
  }
  return seeds;
}

export function sampleTypeGpuCurvePoint(
  points: Float32Array<ArrayBuffer>,
  life: number,
): Vec3 {
  const scaled = Math.min(life, 1 - Number.EPSILON) *
    (TYPEGPU_CURVE_POINT_COUNT - 1);
  const startIndex = Math.floor(scaled);
  const endIndex = Math.min(startIndex + 1, TYPEGPU_CURVE_POINT_COUNT - 1);
  const local = scaled - startIndex;
  const startOffset = startIndex * 4;
  const endOffset = endIndex * 4;
  return [
    points[startOffset] + (points[endOffset] - points[startOffset]) * local,
    points[startOffset + 1] +
      (points[endOffset + 1] - points[startOffset + 1]) * local,
    points[startOffset + 2] +
      (points[endOffset + 2] - points[startOffset + 2]) * local,
  ];
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const unit = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return unit * unit * (3 - 2 * unit);
}

function writeAnimatedLight(
  data: Float32Array<ArrayBuffer>,
  slot: number,
  seed: AnimatedLightSeed,
  position: Vec3,
  radius: number,
  intensity: number,
): void {
  const offset = slot * 16;
  data.set([...seed.origin, seed.life], offset);
  data.set([...position, radius], offset + 4);
  data.set([...seed.color, intensity], offset + 8);
  data.set([...seed.velocity, seed.lifeSpeed], offset + 12);
}

export function createTypeGpuLights(): Float32Array<ArrayBuffer> {
  const data = new Float32Array(MAX_FORWARD_LIGHTS * 16);
  const curvePoints = createTypeGpuCurvePoints();
  const seeds = createTypeGpuAnimatedLightSeeds();

  for (const [index, position] of MAIN_FIRE_POSITIONS.entries()) {
    const offset = index * 16;
    data.set([...position, 0], offset);
    data.set([...position, 6], offset + 4);
    data.set([...MAIN_FIRE_COLOR, 1.2], offset + 8);
  }

  const sampledSourceIndices = [
    ...Array.from({ length: 16 }, (_, index) =>
      Math.floor((index * FIRE_LIGHT_COUNT) / 16),
    ),
    ...Array.from({ length: 8 }, (_, index) =>
      FIRE_LIGHT_COUNT + Math.floor((index * CURVE_LIGHT_COUNT) / 8),
    ),
    ...Array.from({ length: 4 }, (_, index) =>
      FIRE_LIGHT_COUNT +
      CURVE_LIGHT_COUNT +
      Math.floor((index * CORRIDOR_LIGHT_COUNT) / 4),
    ),
  ];
  for (const [sampleIndex, sourceIndex] of sampledSourceIndices.entries()) {
    const seed = seeds[sourceIndex];
    const slot = MAIN_FIRE_POSITIONS.length + sampleIndex;
    if (sourceIndex < FIRE_LIGHT_COUNT) {
      writeAnimatedLight(data, slot, seed, seed.origin, 1, 4);
      continue;
    }
    if (sourceIndex < FIRE_LIGHT_COUNT + CURVE_LIGHT_COUNT) {
      const point = sampleTypeGpuCurvePoint(curvePoints, seed.life);
      writeAnimatedLight(
        data,
        slot,
        seed,
        [
          point[0] + seed.velocity[0],
          point[1] + seed.velocity[1],
          point[2] + seed.velocity[2],
        ],
        4,
        4,
      );
      continue;
    }
    const phase = seed.life + seed.life * seed.velocity[1] * 30;
    const fade =
      smoothstep(0, 0.1, seed.life) *
      (1 - smoothstep(0.9, 1, seed.life));
    writeAnimatedLight(
      data,
      slot,
      seed,
      [
        seed.life * 15 - 7.5,
        Math.cos(phase) * 1.2 + 3.5,
        Math.sin(phase) * 1.075 + seed.velocity[0],
      ],
      Math.max(0.001, 2 * fade),
      2 * fade,
    );
  }
  return data;
}
