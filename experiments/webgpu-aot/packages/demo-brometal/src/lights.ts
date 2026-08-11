import {
  BROMETAL_ANIMATED_LIGHT_COUNT,
  BROMETAL_BILLBOARD_COUNT,
  BROMETAL_CURVE_LIGHT_COUNT,
  BROMETAL_FIRE_LIGHT_COUNT,
  BROMETAL_FIXED_TIME_STEP_SECONDS,
  createBroMetalLightSimulation,
  type BroMetalLightSimulation,
} from "./light-state.js";

export const BROMETAL_FIRE_PARTICLE_COUNT = BROMETAL_FIRE_LIGHT_COUNT;
export const BROMETAL_CURVE_PARTICLE_COUNT = BROMETAL_CURVE_LIGHT_COUNT;
export const BROMETAL_PARTICLE_COUNT = BROMETAL_BILLBOARD_COUNT;
export const BROMETAL_ANALYTIC_LIGHT_COUNT = 32;
export const BROMETAL_ANALYTIC_LIGHT_CAPACITY = 32;
export const BROMETAL_SIMULATED_LIGHT_COUNT = BROMETAL_ANIMATED_LIGHT_COUNT + 4;

const MAIN_POINT_LIGHT_POSITIONS = [
  [3.9, 3, 0.9],
  [3.9, 3, -1.5],
  [-4.95, 3, 0.9],
  [-4.95, 3, -1.5],
] as const;
const MAIN_FIRE_COLOR = [10, 0.1, 0.1] as const;

// These are the same even samples used by the bounded Three.js forward rig.
export const BROMETAL_ANALYTIC_SOURCE_INDICES = [
  0, 16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224,
  240, 256, 274, 293, 312, 331, 349, 368, 387, 406, 422, 438, 454,
] as const;

export interface BroMetalLightRig {
  readonly lightValues: Float32Array<ArrayBuffer>;
  readonly particleValues: Float32Array<ArrayBuffer>;
  updateFrame(frameIndex: number): void;
}

function packParticleValues(
  values: Float32Array<ArrayBuffer>,
  simulation: BroMetalLightSimulation,
): void {
  const { seeds, state } = simulation;
  for (let index = 0; index < BROMETAL_PARTICLE_COUNT; index += 1) {
    const valueOffset = index * 8;
    const positionOffset = index * 3;
    const seed = seeds[index];
    values[valueOffset] = state.positions[positionOffset];
    values[valueOffset + 1] = state.positions[positionOffset + 1];
    values[valueOffset + 2] = state.positions[positionOffset + 2];
    values[valueOffset + 3] = state.billboardRadii[index];
    values[valueOffset + 4] = seed.color[0];
    values[valueOffset + 5] = seed.color[1];
    values[valueOffset + 6] = seed.color[2];
    values[valueOffset + 7] = 1;
  }
}

function packLightValues(
  values: Float32Array<ArrayBuffer>,
  simulation: BroMetalLightSimulation,
): void {
  for (let slot = 0; slot < MAIN_POINT_LIGHT_POSITIONS.length; slot += 1) {
    const valueOffset = slot * 8;
    const position = MAIN_POINT_LIGHT_POSITIONS[slot];
    values.set(
      [
        position[0],
        position[1],
        position[2],
        6,
        MAIN_FIRE_COLOR[0],
        MAIN_FIRE_COLOR[1],
        MAIN_FIRE_COLOR[2],
        1.2,
      ],
      valueOffset,
    );
  }

  const { seeds, state } = simulation;
  for (
    let sample = 0;
    sample < BROMETAL_ANALYTIC_SOURCE_INDICES.length;
    sample += 1
  ) {
    const sourceIndex = BROMETAL_ANALYTIC_SOURCE_INDICES[sample];
    const slot = sample + MAIN_POINT_LIGHT_POSITIONS.length;
    const valueOffset = slot * 8;
    const positionOffset = sourceIndex * 3;
    const seed = seeds[sourceIndex];
    values[valueOffset] = state.positions[positionOffset];
    values[valueOffset + 1] = state.positions[positionOffset + 1];
    values[valueOffset + 2] = state.positions[positionOffset + 2];
    values[valueOffset + 3] = Math.max(
      0.001,
      state.lightRadii[sourceIndex] * 2,
    );
    values[valueOffset + 4] = seed.color[0];
    values[valueOffset + 5] = seed.color[1];
    values[valueOffset + 6] = seed.color[2];
    values[valueOffset + 7] = state.intensities[sourceIndex] * 4;
  }
}

function frameIndexAtTime(timeSeconds: number): number {
  if (!Number.isFinite(timeSeconds)) {
    throw new RangeError("BroMetal light time must be finite");
  }
  return Math.max(
    0,
    Math.round(timeSeconds / BROMETAL_FIXED_TIME_STEP_SECONDS),
  );
}

export function createBroMetalLightRig(): BroMetalLightRig {
  const simulation = createBroMetalLightSimulation();
  const particleValues = new Float32Array(BROMETAL_PARTICLE_COUNT * 8);
  const lightValues = new Float32Array(BROMETAL_ANALYTIC_LIGHT_CAPACITY * 8);
  let packedFrame = -1;

  const updateFrame = (frameIndex: number): void => {
    simulation.updateFrame(frameIndex);
    if (frameIndex === packedFrame) return;
    packParticleValues(particleValues, simulation);
    packLightValues(lightValues, simulation);
    packedFrame = frameIndex;
  };

  updateFrame(0);
  return { lightValues, particleValues, updateFrame };
}

export function updateBroMetalParticleValues(
  values: Float32Array<ArrayBuffer>,
  timeSeconds: number,
): void {
  const rig = createBroMetalLightRig();
  rig.updateFrame(frameIndexAtTime(timeSeconds));
  values.set(rig.particleValues);
}

export function createBroMetalParticleValues(
  timeSeconds = 0,
): Float32Array<ArrayBuffer> {
  const rig = createBroMetalLightRig();
  rig.updateFrame(frameIndexAtTime(timeSeconds));
  return rig.particleValues;
}

export function updateBroMetalLightValues(
  values: Float32Array<ArrayBuffer>,
  timeSeconds: number,
): void {
  const rig = createBroMetalLightRig();
  rig.updateFrame(frameIndexAtTime(timeSeconds));
  values.set(rig.lightValues);
}

export function createBroMetalLightValues(
  timeSeconds = 0,
): Float32Array<ArrayBuffer> {
  const rig = createBroMetalLightRig();
  rig.updateFrame(frameIndexAtTime(timeSeconds));
  return rig.lightValues;
}
