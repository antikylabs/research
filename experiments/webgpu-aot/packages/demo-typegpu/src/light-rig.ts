import {
  CORRIDOR_LIGHT_COUNT,
  createTypeGpuAnimatedLightSeeds,
  createTypeGpuCurvePoints,
  CURVE_LIGHT_COUNT,
  FIRE_LIGHT_COUNT,
  sampleTypeGpuCurvePoint,
  type AnimatedLightSeed,
} from "./lights.js";
import { MAX_FORWARD_LIGHTS } from "./shaders/lights.js";
import { TYPEGPU_PARTICLE_COUNT } from "./shaders/particles.js";

const FIXED_TIME_STEP_SECONDS = 1 / 60;
const MAIN_LIGHT_POSITIONS = [
  [3.9, 3, 0.9],
  [3.9, 3, -1.5],
  [-4.95, 3, 0.9],
  [-4.95, 3, -1.5],
] as const;
const MAIN_LIGHT_COLOR = [10, 0.1, 0.1] as const;
const ANALYTIC_SOURCE_INDICES = [
  0, 16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224,
  240, 256, 274, 293, 312, 331, 349, 368, 387, 406, 422, 438, 454,
] as const;

interface AnimatedState {
  readonly billboardRadii: Float32Array<ArrayBuffer>;
  readonly intensities: Float32Array<ArrayBuffer>;
  readonly life: Float32Array<ArrayBuffer>;
  readonly lightRadii: Float32Array<ArrayBuffer>;
  readonly positions: Float32Array<ArrayBuffer>;
}

export interface TypeGpuLightRig {
  readonly lightValues: Float32Array<ArrayBuffer>;
  readonly particleValues: Float32Array<ArrayBuffer>;
  updateFrame(frameIndex: number): void;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function noise(x: number, y: number, z: number): number {
  return fract(
    Math.sin(x * 12.9898 + y * 78.233 + z * 45.164) * 43_758.5453,
  );
}

function curlNoise(x: number, y: number, z: number): readonly number[] {
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

function smoothstep(edge0: number, edge1: number, value: number): number {
  const unit = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return unit * unit * (3 - 2 * unit);
}

function writeCorridorPosition(
  positions: Float32Array<ArrayBuffer>,
  offset: number,
  life: number,
  seed: AnimatedLightSeed,
): void {
  const phase = life + life * seed.velocity[1] * 30;
  positions[offset] = life * 15 - 7.5;
  positions[offset + 1] = Math.cos(phase) * 1.2 + 3.5;
  positions[offset + 2] = Math.sin(phase) * 1.075 + seed.velocity[0];
}

function updateDerivedValues(
  seeds: readonly AnimatedLightSeed[],
  curvePoints: Float32Array<ArrayBuffer>,
  state: AnimatedState,
  index: number,
): void {
  const seed = seeds[index];
  const life = state.life[index];
  const offset = index * 3;
  if (index < FIRE_LIGHT_COUNT) {
    state.intensities[index] = Math.max(0, 1 - life);
    state.lightRadii[index] = 0.5;
    state.billboardRadii[index] = seed.billboardRadius * Math.max(0, 1 - life);
    return;
  }
  if (index < FIRE_LIGHT_COUNT + CURVE_LIGHT_COUNT) {
    const point = sampleTypeGpuCurvePoint(curvePoints, life);
    state.positions[offset] = point[0] + seed.velocity[0];
    state.positions[offset + 1] = point[1] + seed.velocity[1];
    state.positions[offset + 2] = point[2] + seed.velocity[2];
    state.intensities[index] = 1;
    state.lightRadii[index] = 2;
    state.billboardRadii[index] = seed.billboardRadius;
    return;
  }
  writeCorridorPosition(state.positions, offset, life, seed);
  const fade = smoothstep(0, 0.1, life) * (1 - smoothstep(0.9, 1, life));
  state.intensities[index] = 0.5 * fade;
  state.lightRadii[index] = fade;
  state.billboardRadii[index] = 0;
}

function resetState(
  seeds: readonly AnimatedLightSeed[],
  curvePoints: Float32Array<ArrayBuffer>,
  state: AnimatedState,
): void {
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const offset = index * 3;
    state.life[index] = seed.life;
    state.positions[offset] = seed.origin[0];
    state.positions[offset + 1] = seed.origin[1];
    state.positions[offset + 2] = seed.origin[2];
    updateDerivedValues(seeds, curvePoints, state, index);
  }
}

function stepState(
  seeds: readonly AnimatedLightSeed[],
  curvePoints: Float32Array<ArrayBuffer>,
  state: AnimatedState,
  frameIndex: number,
): void {
  const timeSeconds = frameIndex * FIXED_TIME_STEP_SECONDS;
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    const offset = index * 3;
    let life = state.life[index] + seed.lifeSpeed * FIXED_TIME_STEP_SECONDS;
    if (life >= 1) {
      life = 0;
      state.positions[offset] = seed.origin[0];
      state.positions[offset + 1] = seed.origin[1];
      state.positions[offset + 2] = seed.origin[2];
    }
    state.life[index] = life;
    if (index < FIRE_LIGHT_COUNT) {
      const turbulence = curlNoise(
        state.positions[offset] * 0.05,
        state.positions[offset + 1] * 0.05 + timeSeconds * 0.05,
        state.positions[offset + 2] * 0.05,
      );
      state.positions[offset] +=
        (seed.velocity[0] + turbulence[0] * 0.2) * FIXED_TIME_STEP_SECONDS;
      state.positions[offset + 1] +=
        (seed.velocity[1] + turbulence[1] * 0.2) * FIXED_TIME_STEP_SECONDS;
      state.positions[offset + 2] +=
        (seed.velocity[2] + turbulence[2] * 0.2) * FIXED_TIME_STEP_SECONDS;
    }
    updateDerivedValues(seeds, curvePoints, state, index);
  }
}

function packValues(
  lightValues: Float32Array<ArrayBuffer>,
  particleValues: Float32Array<ArrayBuffer>,
  seeds: readonly AnimatedLightSeed[],
  state: AnimatedState,
): void {
  lightValues.fill(0);
  for (const [slot, position] of MAIN_LIGHT_POSITIONS.entries()) {
    const offset = slot * 16;
    lightValues.set([...position, 6], offset + 4);
    lightValues.set([...MAIN_LIGHT_COLOR, 1.2], offset + 8);
  }
  for (const [sample, sourceIndex] of ANALYTIC_SOURCE_INDICES.entries()) {
    const offset = (sample + MAIN_LIGHT_POSITIONS.length) * 16;
    const positionOffset = sourceIndex * 3;
    const seed = seeds[sourceIndex];
    lightValues.set([
      state.positions[positionOffset],
      state.positions[positionOffset + 1],
      state.positions[positionOffset + 2],
      Math.max(0.001, state.lightRadii[sourceIndex] * 2),
    ], offset + 4);
    lightValues.set([
      seed.color[0],
      seed.color[1],
      seed.color[2],
      state.intensities[sourceIndex] * 4,
    ], offset + 8);
  }
  for (let index = 0; index < TYPEGPU_PARTICLE_COUNT; index += 1) {
    const offset = index * 8;
    const positionOffset = index * 3;
    const seed = seeds[index];
    particleValues.set([
      state.positions[positionOffset],
      state.positions[positionOffset + 1],
      state.positions[positionOffset + 2],
      state.billboardRadii[index],
      seed.color[0],
      seed.color[1],
      seed.color[2],
      1,
    ], offset);
  }
}

export function createTypeGpuLightRig(): TypeGpuLightRig {
  const seeds = createTypeGpuAnimatedLightSeeds();
  if (seeds.length !== FIRE_LIGHT_COUNT + CURVE_LIGHT_COUNT + CORRIDOR_LIGHT_COUNT) {
    throw new Error(`Unexpected TypeGPU animated-light population ${seeds.length}`);
  }
  const curvePoints = createTypeGpuCurvePoints();
  const state: AnimatedState = {
    billboardRadii: new Float32Array(seeds.length),
    intensities: new Float32Array(seeds.length),
    life: new Float32Array(seeds.length),
    lightRadii: new Float32Array(seeds.length),
    positions: new Float32Array(seeds.length * 3),
  };
  const lightValues = new Float32Array(MAX_FORWARD_LIGHTS * 16);
  const particleValues = new Float32Array(TYPEGPU_PARTICLE_COUNT * 8);
  let currentFrame = 0;
  resetState(seeds, curvePoints, state);
  packValues(lightValues, particleValues, seeds, state);

  return {
    lightValues,
    particleValues,
    updateFrame(frameIndex: number): void {
      if (!Number.isSafeInteger(frameIndex) || frameIndex < 0) {
        throw new RangeError(
          "TypeGPU light frame index must be a non-negative integer",
        );
      }
      if (frameIndex === currentFrame) return;
      if (frameIndex < currentFrame) {
        resetState(seeds, curvePoints, state);
        currentFrame = 0;
      }
      while (currentFrame < frameIndex) {
        currentFrame += 1;
        stepState(seeds, curvePoints, state, currentFrame);
      }
      packValues(lightValues, particleValues, seeds, state);
    },
  };
}
