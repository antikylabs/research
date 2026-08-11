export const ANTIKY_WORKLOAD_SEED = 0x5350_4f4e;
export const ANTIKY_FIXED_TIME_STEP_SECONDS = 1 / 60;
export const ANTIKY_FIRE_LIGHT_COUNT = 256;
export const ANTIKY_CURVE_LIGHT_COUNT = 150;
export const ANTIKY_CORRIDOR_LIGHT_COUNT = 64;
export const ANTIKY_ANIMATED_LIGHT_COUNT =
  ANTIKY_FIRE_LIGHT_COUNT +
  ANTIKY_CURVE_LIGHT_COUNT +
  ANTIKY_CORRIDOR_LIGHT_COUNT;
export const ANTIKY_BILLBOARD_COUNT =
  ANTIKY_FIRE_LIGHT_COUNT + ANTIKY_CURVE_LIGHT_COUNT;

type Vec3 = readonly [number, number, number];

export type AntikyAnimatedLightKind = "fire" | "curve" | "corridor";

export interface AntikyAnimatedLightSeed {
  readonly kind: AntikyAnimatedLightKind;
  readonly origin: Vec3;
  readonly velocity: Vec3;
  readonly color: Vec3;
  readonly life: number;
  readonly lifeSpeed: number;
  readonly lightRadius: number;
  readonly billboardRadius: number;
}

export interface AntikyAnimatedLightState {
  readonly life: Float32Array<ArrayBuffer>;
  readonly positions: Float32Array<ArrayBuffer>;
  readonly intensities: Float32Array<ArrayBuffer>;
  readonly lightRadii: Float32Array<ArrayBuffer>;
  readonly billboardRadii: Float32Array<ArrayBuffer>;
}

export interface AntikyLightSimulation {
  readonly frameIndex: number;
  readonly seeds: readonly AntikyAnimatedLightSeed[];
  readonly state: AntikyAnimatedLightState;
  updateFrame(frameIndex: number): void;
}

const FIRE_COLOR: Vec3 = [10, 0.1, 0.1];
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

export function createAntikyAnimatedLightSeeds(): readonly AntikyAnimatedLightSeed[] {
  const random = createMulberry32(ANTIKY_WORKLOAD_SEED);
  const seeds: AntikyAnimatedLightSeed[] = [];

  for (
    let particle = 0;
    particle < ANTIKY_FIRE_LIGHT_COUNT / 4;
    particle += 1
  ) {
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

  for (let index = 0; index < ANTIKY_CURVE_LIGHT_COUNT; index += 1) {
    const color = randomColor(random);
    const velocity = randomDirection(random, 0.5);
    seeds.push({
      kind: "curve",
      origin: [0, 0, 0],
      velocity,
      color,
      life: index / ANTIKY_CURVE_LIGHT_COUNT,
      lifeSpeed: 0.01,
      lightRadius: 2,
      billboardRadius: 0.02,
    });
  }

  for (let side = 0; side < 2; side += 1) {
    for (let index = 0; index < ANTIKY_CORRIDOR_LIGHT_COUNT / 2; index += 1) {
      seeds.push({
        kind: "corridor",
        origin: [0, 0, 0],
        velocity: side === 0 ? [3.125, 1, 0] : [-3.775, -1, 0],
        color: randomColor(random),
        life: index / (ANTIKY_CORRIDOR_LIGHT_COUNT / 2),
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
  const weight = Math.max(
    0,
    Math.min(1, (value - edge0) / (edge1 - edge0)),
  );
  return weight * weight * (3 - 2 * weight);
}

function noise(x: number, y: number, z: number): number {
  return fract(Math.sin(x * 12.9898 + y * 78.233 + z * 45.164) * 43_758.5453);
}

function curlNoise(x: number, y: number, z: number): Vec3 {
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
  const pointCount = CURVE_CONTROL_POINTS.length;
  const scaled = fract(progress) * pointCount;
  const startIndex = Math.floor(scaled);
  const weight = scaled - startIndex;
  const first = CURVE_CONTROL_POINTS[(startIndex - 1 + pointCount) % pointCount];
  const start = CURVE_CONTROL_POINTS[startIndex];
  const end = CURVE_CONTROL_POINTS[(startIndex + 1) % pointCount];
  const last = CURVE_CONTROL_POINTS[(startIndex + 2) % pointCount];
  let dt0 = Math.pow(distanceSquared(first, start), 0.25);
  let dt1 = Math.pow(distanceSquared(start, end), 0.25);
  let dt2 = Math.pow(distanceSquared(end, last), 0.25);
  if (dt1 < 0.0001) dt1 = 1;
  if (dt0 < 0.0001) dt0 = dt1;
  if (dt2 < 0.0001) dt2 = dt1;
  return [
    cubicValue(first[0], start[0], end[0], last[0], dt0, dt1, dt2, weight),
    cubicValue(first[1], start[1], end[1], last[1], dt0, dt1, dt2, weight),
    cubicValue(first[2], start[2], end[2], last[2], dt0, dt1, dt2, weight),
  ];
}

// Match the reference's 240-point sampling before its update-time interpolation.
const CURVE_POINTS: readonly Vec3[] = Array.from({ length: 240 }, (_, index) =>
  curvePoint(index / 240),
);

function writeCurvePosition(
  positions: Float32Array<ArrayBuffer>,
  offset: number,
  life: number,
  velocity: Vec3,
): void {
  const scaled = Math.min(life, 1 - Number.EPSILON) *
    (CURVE_POINTS.length - 1);
  const startIndex = Math.floor(scaled);
  const endIndex = Math.min(startIndex + 1, CURVE_POINTS.length - 1);
  const local = scaled - startIndex;
  const start = CURVE_POINTS[startIndex];
  const end = CURVE_POINTS[endIndex];
  positions[offset] = start[0] + (end[0] - start[0]) * local + velocity[0];
  positions[offset + 1] =
    start[1] + (end[1] - start[1]) * local + velocity[1];
  positions[offset + 2] =
    start[2] + (end[2] - start[2]) * local + velocity[2];
}

function writeCorridorPosition(
  positions: Float32Array<ArrayBuffer>,
  offset: number,
  life: number,
  velocity: Vec3,
): void {
  const phase = life + life * velocity[1] * 30;
  positions[offset] = life * 15 - 7.5;
  positions[offset + 1] = Math.cos(phase) * 1.2 + 3.5;
  positions[offset + 2] = Math.sin(phase) * 1.075 + velocity[0];
}

function updateDerivedValues(
  seed: AntikyAnimatedLightSeed,
  state: AntikyAnimatedLightState,
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

function resetState(
  seeds: readonly AntikyAnimatedLightSeed[],
  state: AntikyAnimatedLightState,
): void {
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const offset = index * 3;
    state.life[index] = seed.life;
    state.positions[offset] = seed.origin[0];
    state.positions[offset + 1] = seed.origin[1];
    state.positions[offset + 2] = seed.origin[2];
    updateDerivedValues(seed, state, index);
  }
}

function stepState(
  seeds: readonly AntikyAnimatedLightSeed[],
  state: AntikyAnimatedLightState,
  frameIndex: number,
): void {
  const timeSeconds = frameIndex * ANTIKY_FIXED_TIME_STEP_SECONDS;
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const offset = index * 3;
    let life = state.life[index] +
      seed.lifeSpeed * ANTIKY_FIXED_TIME_STEP_SECONDS;
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
        (seed.velocity[0] + turbulence[0] * 0.2) *
        ANTIKY_FIXED_TIME_STEP_SECONDS;
      state.positions[offset + 1] +=
        (seed.velocity[1] + turbulence[1] * 0.2) *
        ANTIKY_FIXED_TIME_STEP_SECONDS;
      state.positions[offset + 2] +=
        (seed.velocity[2] + turbulence[2] * 0.2) *
        ANTIKY_FIXED_TIME_STEP_SECONDS;
    }
    updateDerivedValues(seed, state, index);
  }
}

export function createAntikyLightSimulation(): AntikyLightSimulation {
  const seeds = createAntikyAnimatedLightSeeds();
  const state: AntikyAnimatedLightState = {
    life: new Float32Array(ANTIKY_ANIMATED_LIGHT_COUNT),
    positions: new Float32Array(ANTIKY_ANIMATED_LIGHT_COUNT * 3),
    intensities: new Float32Array(ANTIKY_ANIMATED_LIGHT_COUNT),
    lightRadii: new Float32Array(ANTIKY_ANIMATED_LIGHT_COUNT),
    billboardRadii: new Float32Array(ANTIKY_ANIMATED_LIGHT_COUNT),
  };
  let currentFrame = 0;
  resetState(seeds, state);

  return {
    get frameIndex(): number {
      return currentFrame;
    },
    seeds,
    state,
    updateFrame(frameIndex: number): void {
      if (!Number.isSafeInteger(frameIndex) || frameIndex < 0) {
        throw new RangeError(
          "Antiky light frame index must be a non-negative integer",
        );
      }
      if (frameIndex === currentFrame) return;
      if (frameIndex < currentFrame) {
        resetState(seeds, state);
        currentFrame = 0;
      }
      while (currentFrame < frameIndex) {
        currentFrame += 1;
        stepState(seeds, state, currentFrame);
      }
    },
  };
}
