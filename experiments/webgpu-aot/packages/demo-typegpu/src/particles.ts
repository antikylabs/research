import {
  createTypeGpuAnimatedLightSeeds,
  createTypeGpuCurvePoints,
  CURVE_LIGHT_COUNT,
  FIRE_LIGHT_COUNT,
  sampleTypeGpuCurvePoint,
} from "./lights.js";

const PARTICLE_COUNT = FIRE_LIGHT_COUNT + CURVE_LIGHT_COUNT;
const SEED_FLOAT_COUNT = 12;
const STATE_FLOAT_COUNT = 8;

export interface TypeGpuParticleData {
  readonly seeds: Float32Array<ArrayBuffer>;
  readonly state: Float32Array<ArrayBuffer>;
}

export function createTypeGpuParticleData(): TypeGpuParticleData {
  const animatedSeeds = createTypeGpuAnimatedLightSeeds();
  const curvePoints = createTypeGpuCurvePoints();
  const seeds = new Float32Array(PARTICLE_COUNT * SEED_FLOAT_COUNT);
  const state = new Float32Array(PARTICLE_COUNT * STATE_FLOAT_COUNT);

  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const seed = animatedSeeds[index];
    const seedOffset = index * SEED_FLOAT_COUNT;
    const stateOffset = index * STATE_FLOAT_COUNT;
    let position = seed.origin;
    if (index >= FIRE_LIGHT_COUNT) {
      const curvePoint = sampleTypeGpuCurvePoint(curvePoints, seed.life);
      position = [
        curvePoint[0] + seed.velocity[0],
        curvePoint[1] + seed.velocity[1],
        curvePoint[2] + seed.velocity[2],
      ];
    }
    const radius =
      index < FIRE_LIGHT_COUNT
        ? seed.billboardRadius * Math.max(0, 1 - seed.life)
        : seed.billboardRadius;

    seeds.set([...seed.origin, seed.life], seedOffset);
    seeds.set([...seed.velocity, seed.lifeSpeed], seedOffset + 4);
    seeds.set([...seed.color, seed.billboardRadius], seedOffset + 8);
    state.set([...position, radius], stateOffset);
    state.set([...seed.color, seed.life], stateOffset + 4);
  }

  return { seeds, state };
}
