import { CatmullRomCurve3, Vector3 } from "three";

import { createMulberry32 } from "./random.js";

export const WORKLOAD_SEED = 0x5350_4f4e;
export const MAIN_POINT_LIGHT_COUNT = 4;
export const FIRE_LIGHT_COUNT = 256;
export const CURVE_LIGHT_COUNT = 150;
export const CORRIDOR_LIGHT_COUNT = 64;
export const ANIMATED_POINT_LIGHT_COUNT =
  FIRE_LIGHT_COUNT + CURVE_LIGHT_COUNT + CORRIDOR_LIGHT_COUNT;
export const POINT_LIGHT_COUNT =
  MAIN_POINT_LIGHT_COUNT + ANIMATED_POINT_LIGHT_COUNT;
export const BILLBOARD_COUNT = FIRE_LIGHT_COUNT + CURVE_LIGHT_COUNT;

type Vec3 = readonly [number, number, number];
export type AnimatedLightKind = "fire" | "curve" | "corridor";

export interface AnimatedLightSeed {
  readonly kind: AnimatedLightKind;
  readonly origin: Vec3;
  readonly velocity: Vec3;
  readonly color: Vec3;
  readonly life: number;
  readonly lifeSpeed: number;
  readonly lightRadius: number;
  readonly billboardRadius: number;
}

export interface AnimatedLightState {
  readonly life: Float32Array;
  readonly positions: Float32Array;
  readonly intensities: Float32Array;
  readonly lightRadii: Float32Array;
  readonly billboardRadii: Float32Array;
}

export const MAIN_POINT_LIGHT_POSITIONS = [
  [3.9, 3, 0.9],
  [3.9, 3, -1.5],
  [-4.95, 3, 0.9],
  [-4.95, 3, -1.5],
] as const satisfies readonly Vec3[];

const FIRE_EMITTER_POSITIONS = [
  [3.9, 3, 1.15],
  [3.9, 3, -1.75],
  [-4.95, 3, 1.15],
  [-4.95, 3, -1.75],
] as const satisfies readonly Vec3[];

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
] as const satisfies readonly Vec3[];

// The reference samples its closed centripetal Catmull-Rom path into 240
// positions, then linearly interpolates those positions in the update shader.
const curve = new CatmullRomCurve3(
  CURVE_CONTROL_POINTS.map((point) => new Vector3(...point)),
  true,
  "centripetal",
);
const CURVE_POINTS: readonly Vec3[] = Array.from({ length: 240 }, (_, index) =>
  curve.getPoint(index / 240).toArray(),
);

const FIRE_COLOR: Vec3 = [10, 0.1, 0.1];

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

export function createAnimatedLightSeeds(
  seed = WORKLOAD_SEED,
): readonly AnimatedLightSeed[] {
  const random = createMulberry32(seed);
  const seeds: AnimatedLightSeed[] = [];

  for (let particle = 0; particle < FIRE_LIGHT_COUNT / 4; particle += 1) {
    for (const emitter of FIRE_EMITTER_POSITIONS) {
      seeds.push({
        kind: "fire",
        origin: [
          emitter[0] + (random() * 2 - 1) * 0.1,
          emitter[1],
          emitter[2] + (random() * 2 - 1) * 0.1,
        ],
        velocity: [0, 0.5, 0],
        color: FIRE_COLOR,
        life: 0,
        lifeSpeed: random() * 1.5 + 0.35,
        lightRadius: 0.5,
        billboardRadius: 0.025,
      });
    }
  }

  for (let index = 0; index < CURVE_LIGHT_COUNT; index += 1) {
    const color = randomColor(random);
    const velocity = randomDirection(random, 0.5);
    seeds.push({
      kind: "curve",
      origin: [0, 0, 0],
      velocity,
      color,
      life: index / CURVE_LIGHT_COUNT,
      lifeSpeed: 0.01,
      lightRadius: 2,
      billboardRadius: 0.02,
    });
  }

  for (let side = 0; side < 2; side += 1) {
    for (let index = 0; index < CORRIDOR_LIGHT_COUNT / 2; index += 1) {
      seeds.push({
        kind: "corridor",
        origin: [0, 0, 0],
        velocity: side === 0 ? [3.125, 1, 0] : [-3.775, -1, 0],
        color: randomColor(random),
        life: index / (CORRIDOR_LIGHT_COUNT / 2),
        lifeSpeed: 0.01,
        lightRadius: 1,
        billboardRadius: 0,
      });
    }
  }

  return seeds;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function noise(x: number, y: number, z: number): number {
  return fract(Math.sin(x * 12.9898 + y * 78.233 + z * 45.164) * 43_758.5453);
}

function curlNoise(
  x: number,
  y: number,
  z: number,
): readonly [number, number, number] {
  const epsilon = 0.1;
  const nx = noise(x + epsilon, y, z);
  const ny = noise(x, y + epsilon, z);
  const nz = noise(x, y, z + epsilon);
  return [
    (ny - noise(x - epsilon, y, z)) / (2 * epsilon),
    (nz - noise(x, y - epsilon, z)) / (2 * epsilon),
    (nx - noise(x, y, z - epsilon)) / (2 * epsilon),
  ];
}

function writeCurvePosition(
  position: Float32Array,
  offset: number,
  life: number,
  velocity: Vec3,
): void {
  const scaled = Math.min(life, 1 - Number.EPSILON) * (CURVE_POINTS.length - 1);
  const startIndex = Math.floor(scaled);
  const endIndex = Math.min(startIndex + 1, CURVE_POINTS.length - 1);
  const local = scaled - startIndex;
  const start = CURVE_POINTS[startIndex];
  const end = CURVE_POINTS[endIndex];
  position[offset] = start[0] + (end[0] - start[0]) * local + velocity[0];
  position[offset + 1] =
    start[1] + (end[1] - start[1]) * local + velocity[1];
  position[offset + 2] =
    start[2] + (end[2] - start[2]) * local + velocity[2];
}

function writeCorridorPosition(
  position: Float32Array,
  offset: number,
  life: number,
  velocity: Vec3,
): void {
  const phase = life + life * velocity[1] * 30;
  position[offset] = life * 15 - 7.5;
  position[offset + 1] = Math.cos(phase) * 1.2 + 3.5;
  position[offset + 2] = Math.sin(phase) * 1.075 + velocity[0];
}

function updateDerivedValues(
  seed: AnimatedLightSeed,
  state: AnimatedLightState,
  index: number,
): void {
  const life = state.life[index];
  const offset = index * 3;
  if (seed.kind === "fire") {
    state.intensities[index] = Math.max(0, 1 - life);
    state.lightRadii[index] = seed.lightRadius;
    state.billboardRadii[index] = seed.billboardRadius * Math.max(0, 1 - life);
    return;
  }
  if (seed.kind === "curve") {
    writeCurvePosition(state.positions, offset, life, seed.velocity);
    state.intensities[index] = 1;
    state.lightRadii[index] = seed.lightRadius;
    state.billboardRadii[index] = seed.billboardRadius;
    return;
  }

  writeCorridorPosition(state.positions, offset, life, seed.velocity);
  const fade =
    smoothstep(0, 0.1, life) * (1 - smoothstep(0.9, 1, life));
  state.intensities[index] = 0.5 * fade;
  state.lightRadii[index] = seed.lightRadius * fade;
  state.billboardRadii[index] = 0;
}

export function createAnimatedLightState(
  seeds: readonly AnimatedLightSeed[],
): AnimatedLightState {
  if (seeds.length !== ANIMATED_POINT_LIGHT_COUNT) {
    throw new Error(
      `Expected ${ANIMATED_POINT_LIGHT_COUNT} animated light seeds, received ${seeds.length}`,
    );
  }

  const state: AnimatedLightState = {
    life: new Float32Array(seeds.length),
    positions: new Float32Array(seeds.length * 3),
    intensities: new Float32Array(seeds.length),
    lightRadii: new Float32Array(seeds.length),
    billboardRadii: new Float32Array(seeds.length),
  };
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const offset = index * 3;
    state.life[index] = seed.life;
    state.positions[offset] = seed.origin[0];
    state.positions[offset + 1] = seed.origin[1];
    state.positions[offset + 2] = seed.origin[2];
    updateDerivedValues(seed, state, index);
  }
  return state;
}

export function stepAnimatedLights(
  seeds: readonly AnimatedLightSeed[],
  state: AnimatedLightState,
  timeSeconds: number,
  timeStepSeconds: number,
): void {
  if (seeds.length !== state.life.length) {
    throw new Error("Animated light state does not match its seed data");
  }

  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const offset = index * 3;
    let life = state.life[index] + seed.lifeSpeed * timeStepSeconds;
    if (life >= 1) {
      life = 0;
      state.positions[offset] = seed.origin[0];
      state.positions[offset + 1] = seed.origin[1];
      state.positions[offset + 2] = seed.origin[2];
    }
    state.life[index] = life;

    if (seed.kind === "fire") {
      const turbulence = curlNoise(
        state.positions[offset] * 0.05,
        state.positions[offset + 1] * 0.05 + timeSeconds * 0.05,
        state.positions[offset + 2] * 0.05,
      );
      state.positions[offset] +=
        (seed.velocity[0] + turbulence[0] * 0.2) * timeStepSeconds;
      state.positions[offset + 1] +=
        (seed.velocity[1] + turbulence[1] * 0.2) * timeStepSeconds;
      state.positions[offset + 2] +=
        (seed.velocity[2] + turbulence[2] * 0.2) * timeStepSeconds;
    }
    updateDerivedValues(seed, state, index);
  }
}
