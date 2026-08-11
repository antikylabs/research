import { describe, expect, it } from "vitest";

import {
  ANTIKY_ANALYTIC_SOURCE_INDICES,
  createAntikyLightRig,
  createAntikyLightValues,
  createAntikyParticleValues,
} from "../src/lights.js";
import {
  ANTIKY_FIXED_TIME_STEP_SECONDS,
  createAntikyLightSimulation,
} from "../src/light-state.js";
import {
  createAnimatedLightSeeds,
  createAnimatedLightState,
  stepAnimatedLights,
} from "../../demo-threejs/src/lights.js";

const CURVE_LIGHT_SOURCE_INDICES = [
  256, 274, 293, 312, 331, 349, 368, 387,
] as const;
const FRAME_12_CURVE_RECORDS = [
  {
    sourceIndex: 256,
    xyzRgb: [
      5.1732892990112305, 7.849173545837402, 2.9578826427459717,
      2.5182502269744873, 3.1565699577331543, 1.8910086154937744,
    ],
  },
  {
    sourceIndex: 312,
    xyzRgb: [
      -10.327386856079102, 7.4923930168151855, -0.6740503311157227,
      1.5885576009750366, 3.825969934463501, 2.554037094116211,
    ],
  },
  {
    sourceIndex: 387,
    xyzRgb: [
      9.109295845031738, 6.862695693969727, 0.7462658286094666,
      3.4119932651519775, 3.9781179428100586, 2.705116033554077,
    ],
  },
] as const;
const FRAME_12_ANALYTIC_FIRE_RECORDS = [
  {
    slot: 4,
    packed: [
      3.927741765975952, 3.107635498046875, 1.1372610330581665, 1, 10,
      0.10000000149011612, 0.10000000149011612, 2.8601856231689453,
    ],
  },
  {
    slot: 11,
    packed: [
      3.9837076663970947, 3.108830451965332, 1.176215410232544, 1, 10,
      0.10000000149011612, 0.10000000149011612, 2.9341931343078613,
    ],
  },
  {
    slot: 19,
    packed: [
      3.9141132831573486, 3.099820137023926, 1.0662285089492798, 1, 10,
      0.10000000149011612, 0.10000000149011612, 2.6671996116638184,
    ],
  },
] as const;

function referenceStateAtFrame(frame: number) {
  const seeds = createAnimatedLightSeeds();
  const state = createAnimatedLightState(seeds);
  for (let index = 1; index <= frame; index += 1) {
    stepAnimatedLights(
      seeds,
      state,
      index * ANTIKY_FIXED_TIME_STEP_SECONDS,
      ANTIKY_FIXED_TIME_STEP_SECONDS,
    );
  }
  return { seeds, state };
}

describe("TypeGPU-Antiky deterministic lights", () => {
  it.each([0, 12, 828])(
    "matches all 470 authoritative fixed-step records at frame %s",
    (frame) => {
      const simulation = createAntikyLightSimulation();
      simulation.updateFrame(frame);
      const { seeds, state } = referenceStateAtFrame(frame);

      expect(simulation.seeds).toEqual(seeds);
      expect(simulation.state.life).toEqual(state.life);
      expect(simulation.state.positions).toEqual(state.positions);
      expect(simulation.state.intensities).toEqual(state.intensities);
      expect(simulation.state.lightRadii).toEqual(state.lightRadii);
      expect(simulation.state.billboardRadii).toEqual(state.billboardRadii);
    },
  );

  it("uses the reference main-fire parameters", () => {
    const lights = createAntikyLightValues(0);

    for (let slot = 0; slot < 4; slot += 1) {
      const offset = slot * 8;
      expect(Array.from(lights.slice(offset + 3, offset + 8))).toEqual([
        6,
        10,
        0.10000000149011612,
        0.10000000149011612,
        1.2000000476837158,
      ]);
    }
  });

  it("matches authoritative analytic-fire records at frame 12", () => {
    const lights = createAntikyLightValues(12 / 60);

    for (const { slot, packed } of FRAME_12_ANALYTIC_FIRE_RECORDS) {
      expect(Array.from(lights.slice(slot * 8, slot * 8 + 8))).toEqual(packed);
    }
  });

  it.each([0, 5, 10])(
    "uses visible curve-particle state for analytic lights at %s seconds",
    (time) => {
      const particles = createAntikyParticleValues(time);
      const lights = createAntikyLightValues(time);
      const sampledX: number[] = [];

      for (const [sampleIndex, sourceIndex] of CURVE_LIGHT_SOURCE_INDICES.entries()) {
        const particleOffset = sourceIndex * 8;
        const lightOffset = (20 + sampleIndex) * 8;

        expect(Array.from(lights.slice(lightOffset, lightOffset + 3))).toEqual(
          Array.from(particles.slice(particleOffset, particleOffset + 3)),
        );
        expect(
          Array.from(lights.slice(lightOffset + 4, lightOffset + 7)),
        ).toEqual(
          Array.from(particles.slice(particleOffset + 4, particleOffset + 7)),
        );
        expect(lights[lightOffset + 3]).toBe(4);
        expect(lights[lightOffset + 7]).toBe(4);
        sampledX.push(lights[lightOffset]);
      }

      expect(Math.min(...sampledX)).toBeLessThan(-7);
      expect(Math.max(...sampledX)).toBeGreaterThan(7);
    },
  );

  it("matches authoritative packed curve records at frame 12", () => {
    const particles = createAntikyParticleValues(12 / 60);

    for (const { sourceIndex, xyzRgb } of FRAME_12_CURVE_RECORDS) {
      const offset = sourceIndex * 8;
      expect([
        ...particles.slice(offset, offset + 3),
        ...particles.slice(offset + 4, offset + 7),
      ]).toEqual(xyzRgb);
    }
  });

  it.each([0, 12])(
    "packs every visible particle from one exact frame-%s state",
    (frame) => {
      const rig = createAntikyLightRig();
      rig.updateFrame(frame);
      const { seeds, state } = referenceStateAtFrame(frame);

      for (let index = 0; index < 406; index += 1) {
        const particleOffset = index * 8;
        const positionOffset = index * 3;
        expect(
          rig.particleValues.slice(particleOffset, particleOffset + 3),
        ).toEqual(state.positions.slice(positionOffset, positionOffset + 3));
        expect(rig.particleValues[particleOffset + 3]).toBe(
          state.billboardRadii[index],
        );
        expect(
          rig.particleValues.slice(particleOffset + 4, particleOffset + 8),
        ).toEqual(new Float32Array([...seeds[index].color, 1]));
      }
    },
  );

  it.each([0, 12])(
    "packs every sampled analytic source from exact frame-%s state",
    (frame) => {
      const rig = createAntikyLightRig();
      rig.updateFrame(frame);
      const { seeds, state } = referenceStateAtFrame(frame);

      for (const [sample, sourceIndex] of ANTIKY_ANALYTIC_SOURCE_INDICES.entries()) {
        const valueOffset = (sample + 4) * 8;
        const positionOffset = sourceIndex * 3;
        const expected = new Float32Array([
          state.positions[positionOffset],
          state.positions[positionOffset + 1],
          state.positions[positionOffset + 2],
          Math.max(0.001, state.lightRadii[sourceIndex] * 2),
          ...seeds[sourceIndex].color,
          state.intensities[sourceIndex] * 4,
        ]);
        expect(rig.lightValues.slice(valueOffset, valueOffset + 8)).toEqual(
          expected,
        );
      }
    },
  );

  it("updates once per frame and resets deterministically after a rewind", () => {
    const direct = createAntikyLightRig();
    const stableParticleValues = direct.particleValues;
    const stableLightValues = direct.lightValues;
    direct.updateFrame(12);
    expect(direct.particleValues).toBe(stableParticleValues);
    expect(direct.lightValues).toBe(stableLightValues);
    const frame12Particles = direct.particleValues.slice();
    const frame12Lights = direct.lightValues.slice();

    direct.updateFrame(12);
    expect(direct.particleValues).toEqual(frame12Particles);
    expect(direct.lightValues).toEqual(frame12Lights);

    direct.updateFrame(600);
    direct.updateFrame(12);
    expect(direct.particleValues).toEqual(frame12Particles);
    expect(direct.lightValues).toEqual(frame12Lights);

    const sequential = createAntikyLightRig();
    for (let frame = 1; frame <= 12; frame += 1) sequential.updateFrame(frame);
    expect(sequential.particleValues).toEqual(frame12Particles);
    expect(sequential.lightValues).toEqual(frame12Lights);
  });
});
