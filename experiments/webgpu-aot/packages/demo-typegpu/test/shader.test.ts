import { describe, expect, it } from "vitest";
import { mat4 } from "wgpu-matrix";

import {
  createTypeGpuCurvePoints,
  createTypeGpuLights,
} from "../src/lights.js";
import { createTypeGpuParticleData } from "../src/particles.js";
import { createTypeGpuLightRig } from "../src/light-rig.js";
import { WORKLOAD_PROFILES } from "../src/profile.js";
import {
  createTypeGpuTemporalSettings,
  typeGpuTemporalHistoryIndices,
  writeTypeGpuTemporalFrame,
} from "../src/temporal.js";
import {
  BILLBOARD_COUNT,
  createAnimatedLightSeeds,
  createAnimatedLightState,
  CURVE_LIGHT_COUNT,
  FIRE_LIGHT_COUNT,
  MAIN_POINT_LIGHT_POSITIONS,
} from "../../demo-threejs/src/lights.js";
import {
  TYPEGPU_AMBIENT_OCCLUSION_SAMPLES,
  TYPEGPU_AMBIENT_OCCLUSION_STRENGTH,
} from "../src/shaders/ambient.js";
import {
  TYPEGPU_BLOOM_BLUR_PASSES,
  TYPEGPU_BLOOM_LEVEL_COUNT,
  TYPEGPU_BLOOM_MAX_RADIUS,
} from "../src/shaders/bloom.js";
import {
  TYPEGPU_BLOOM_LEVEL_0_WEIGHT,
  TYPEGPU_BLOOM_LEVEL_1_WEIGHT,
  TYPEGPU_BLOOM_LEVEL_2_WEIGHT,
  TYPEGPU_BLOOM_LEVEL_3_WEIGHT,
  TYPEGPU_BLOOM_LEVEL_4_WEIGHT,
  TYPEGPU_COMPOSITE_EXPOSURE,
} from "../src/shaders/composite.js";
import {
  resolveTypeGpuRendererWGSL,
  TYPEGPU_PARTICLE_COUNT,
  TYPEGPU_SIMULATED_LIGHT_COUNT,
  TYPEGPU_IBL_DIFFUSE_GAIN,
  TYPEGPU_IBL_SPECULAR_GAIN,
} from "../src/shaders/forward.js";

function asFloat32(values: readonly number[]): number[] {
  return Array.from(new Float32Array(values));
}

describe("standard TypeGPU runtime shader resolution", () => {
  it("resolves its forward, ambient, shadow, compute, particle, and composite graph deterministically", () => {
    const first = resolveTypeGpuRendererWGSL();
    const second = resolveTypeGpuRendererWGSL();

    expect(first).toEqual(second);
    expect(first.forward).toMatch(/@vertex\s+fn forwardVertex\b/);
    expect(first.forward).toMatch(/@fragment\s+fn forwardFragment\b/);
    expect(first.forward).toContain("@location(2) worldMetal");
    expect(first.forward).toMatch(
      /textureSampleCompareLevel\(/,
    );
    expect(first.forward).toContain("nearShadow");
    expect(first.forward).toContain("farShadow");
    expect(first.forward).toMatch(/for \(var offsetY = -1/);
    expect(first.forward).toMatch(/for \(var offsetX = -1/);
    expect(first.forward).toContain("smoothstep(");
    expect(first.forward).not.toMatch(/0\.28f\s*\+\s*\(?visibility/);
    expect(first.forward).toContain("texture_cube<f32>");
    expect(first.forward).toContain("textureSampleLevel(environmentMap,");
    expect(first.background).toMatch(/@fragment\s+fn backgroundFragment\b/);
    expect(first.background).toContain("textureSampleLevel(environmentMap,");
    expect(first.compute).toMatch(/@compute\s+@workgroup_size\(64\)/);
    expect(first.compute).toContain("lights");
    expect(first.particleCompute).toMatch(
      /@compute\s+@workgroup_size\(64\)/,
    );
    expect(first.particleCompute).toContain("particles");
    expect(first.particleCompute).toContain("seeds");
    expect(first.particleCompute).toContain("curvePoints");
    expect(first.particleCompute).toMatch(/fn typeGpuParticleCurlNoise\b/);
    expect(first.particleCompute).toContain("406u");
    expect(first.shadow).toMatch(/@vertex\s+fn shadowVertex\b/);
    expect(first.particles).toMatch(/@vertex\s+fn particleVertex\b/);
    expect(first.particles).toMatch(/@fragment\s+fn particleFragment\b/);
    expect(first.particles).toContain("particles");
    expect(first.particles).not.toContain("discard");
    expect(first.particles).not.toContain("smoothstep");
    expect(first.particles).not.toMatch(/instanceIndex\s*==\s*0u/);
    expect(first.bloom).toMatch(/@fragment\s+fn bloomFragment\b/);
    expect(first.reflection).toMatch(/@fragment\s+fn reflectionFragment\b/);
    expect(first.reflection).toContain("< 24i");
    expect(first.reflection).toMatch(/fn typeGpuReflectionHitTransfer\b/);
    expect(first.reflection).toMatch(
      /let weightedColor = \(hitColor \* \(\(metallic \* attenuation\) \* grazing\)\)/,
    );
    expect(first.reflection).toMatch(/weightedColor \* \(luminanceScale \* 0\.7f\)/);
    expect(first.reflection).not.toMatch(/confidence|sourcePeak|upward|roughness \* 0\.5/);
    for (const source of [first.forward, first.particles, first.reflection]) {
      expect(source).toContain("inverseViewProjection: mat4x4f");
      expect(source).toContain("environment: vec4f");
    }
    expect(first.ambient).toMatch(/@fragment\s+fn ambientFragment\b/);
    expect(first.ambient).toContain("textureLoad(depth,");
    expect(first.ambient).toContain("textureLoad(normal,");
    expect(first.ambient).not.toContain("textureLoad(worldMetal,");
    expect(first.ambient).toContain("centerDepth - sampleDepth");
    expect(first.ambient).not.toContain("typeGpuAmbientNoise");
    expect(first.ambient).toContain(`< ${TYPEGPU_AMBIENT_OCCLUSION_SAMPLES}i`);
    expect(first.forward).not.toContain("ambientOcclusion: texture_2d<f32>");
    expect(first.forward).not.toContain("textureLoad(ambientOcclusion,");
    expect(first.composite).toMatch(/@fragment\s+fn compositeFragment\b/);
    expect(first.composite).toMatch(/fn typeGpuFxaaHdr\b/);
    for (let level = 0; level < TYPEGPU_BLOOM_LEVEL_COUNT; level += 1) {
      expect(first.composite).toContain(`textureSampleLevel(bloomLevel${level},`);
    }
    expect(first.composite).not.toContain("textureSampleLevel(ambient,");
    expect(TYPEGPU_AMBIENT_OCCLUSION_SAMPLES).toBeGreaterThanOrEqual(12);
    expect(TYPEGPU_AMBIENT_OCCLUSION_STRENGTH).toBe(6);
    expect(TYPEGPU_BLOOM_LEVEL_COUNT).toBe(5);
    expect(TYPEGPU_BLOOM_BLUR_PASSES).toBe(10);
    expect(TYPEGPU_BLOOM_MAX_RADIUS).toBe(22);
    expect(first.bloom).toMatch(
      /dot\(color, vec3f\(0\.2125\d+, 0\.7152\d+, 0\.0722\d+\)\)/,
    );
    expect(first.bloom).toContain("smoothstep(1f, 1.01f");
    expect(first.bloom).toContain("< 22i");
    expect(first.bloom).not.toContain("let peak =");
    const bloomWeights = [
      TYPEGPU_BLOOM_LEVEL_0_WEIGHT,
      TYPEGPU_BLOOM_LEVEL_1_WEIGHT,
      TYPEGPU_BLOOM_LEVEL_2_WEIGHT,
      TYPEGPU_BLOOM_LEVEL_3_WEIGHT,
      TYPEGPU_BLOOM_LEVEL_4_WEIGHT,
    ];
    expect(bloomWeights.every((weight) => weight > 0)).toBe(true);
    expect(bloomWeights).toEqual([
      0.179496,
      0.143748,
      0.108,
      0.072252,
      0.036504,
    ]);
    expect(TYPEGPU_COMPOSITE_EXPOSURE).toBe(1);
    expect(first.composite).toMatch(/fn typeGpuAcesFilmicToneMapping\b/);
    expect(first.composite).toMatch(/fn typeGpuSrgbTransferOetf\b/);
    expect(first.composite).not.toContain("typeGpuCompositeNoise");
    const temporal = Reflect.get(first, "temporal");
    expect(temporal).toMatch(/@fragment\s+fn temporalFragment\b/);
    expect(temporal).toContain("currentAmbient");
    expect(temporal).toContain("textureLoad(currentAmbient,");
    expect(temporal).toContain("history");
    expect(temporal).toMatch(/for \(var y = -1;/);
    expect(temporal).toMatch(/for \(var x = -1;/);
    expect(first.reflectionReconstruct).toMatch(
      /@fragment\s+fn reflectionReconstructFragment\b/,
    );
    expect(first.reflectionSelect).toMatch(
      /@fragment\s+fn reflectionSelectFragment\b/,
    );
    expect(first.bloom).toMatch(/textureSampleLevel\([^,]*reflection/);
    expect(new Set(Object.values(first)).size).toBe(13);
    expect(TYPEGPU_PARTICLE_COUNT).toBe(406);
    expect(TYPEGPU_SIMULATED_LIGHT_COUNT).toBe(474);
    expect(TYPEGPU_IBL_DIFFUSE_GAIN).toBe(1);
    expect(TYPEGPU_IBL_SPECULAR_GAIN).toBe(1);
    expect(first.forward).not.toContain("surfaceBalance");
  });

  it("seeds the native TypeGPU particles from the Three.js workload", () => {
    const particleData = createTypeGpuParticleData();
    const seeds = createAnimatedLightSeeds();
    const state = createAnimatedLightState(seeds);

    expect(TYPEGPU_PARTICLE_COUNT).toBe(BILLBOARD_COUNT);
    expect(particleData.seeds).toHaveLength(BILLBOARD_COUNT * 12);
    expect(particleData.state).toHaveLength(BILLBOARD_COUNT * 8);
    for (let index = 0; index < BILLBOARD_COUNT; index += 1) {
      const seed = seeds[index];
      const sourceOffset = index * 3;
      const seedOffset = index * 12;
      const stateOffset = index * 8;

      expect(
        Array.from(particleData.seeds.slice(seedOffset, seedOffset + 4)),
      ).toEqual(asFloat32([...seed.origin, seed.life]));
      expect(
        Array.from(particleData.seeds.slice(seedOffset + 4, seedOffset + 8)),
      ).toEqual(asFloat32([...seed.velocity, seed.lifeSpeed]));
      expect(
        Array.from(particleData.seeds.slice(seedOffset + 8, seedOffset + 12)),
      ).toEqual(asFloat32([...seed.color, seed.billboardRadius]));
      for (let axis = 0; axis < 3; axis += 1) {
        expect(particleData.state[stateOffset + axis]).toBeCloseTo(
          state.positions[sourceOffset + axis],
          5,
        );
      }
      expect(particleData.state[stateOffset + 3]).toBe(
        state.billboardRadii[index],
      );
      expect(
        Array.from(particleData.state.slice(stateOffset + 4, stateOffset + 8)),
      ).toEqual(asFloat32([...seed.color, state.life[index]]));
    }
  });

  it("updates lights and particles at the shared deterministic CPU boundary", () => {
    const first = createTypeGpuLightRig();
    const second = createTypeGpuLightRig();
    const initialLights = Array.from(first.lightValues);
    const initialParticles = Array.from(first.particleValues);

    first.updateFrame(1);
    second.updateFrame(1);

    expect(Array.from(first.lightValues)).toEqual(Array.from(second.lightValues));
    expect(Array.from(first.particleValues)).toEqual(
      Array.from(second.particleValues),
    );
    expect(Array.from(first.lightValues)).not.toEqual(initialLights);
    expect(Array.from(first.particleValues)).not.toEqual(initialParticles);

    const frameOneLights = Array.from(first.lightValues);
    const frameOneParticles = Array.from(first.particleValues);
    first.updateFrame(1);
    expect(Array.from(first.lightValues)).toEqual(frameOneLights);
    expect(Array.from(first.particleValues)).toEqual(frameOneParticles);
  });

  it("cycles temporal histories and keeps the jittered inverse projection valid", () => {
    expect(typeGpuTemporalHistoryIndices(0)).toEqual([0, 1]);
    expect(typeGpuTemporalHistoryIndices(1)).toEqual([1, 0]);
    expect(Array.from(createTypeGpuTemporalSettings(2560, 1440, 0))).toEqual([
      2560,
      1440,
      0,
      0,
    ]);
    const base = mat4.perspective(Math.PI / 3, 16 / 9, 0.1, 100);
    const frame = new Float32Array(92);
    writeTypeGpuTemporalFrame(frame, base, 2560, 1440, 1);
    expect(Array.from(frame.slice(0, 16))).not.toEqual(Array.from(base));
    const identity = mat4.multiply(frame.slice(0, 16), frame.slice(64, 80));
    for (let index = 0; index < 16; index += 1) {
      expect(identity[index]).toBeCloseTo(index % 5 === 0 ? 1 : 0, 5);
    }
  });

  it("seeds the native TypeGPU analytic lights from the Three.js workload", () => {
    const lights = createTypeGpuLights();
    const curvePoints = createTypeGpuCurvePoints();
    const seeds = createAnimatedLightSeeds();
    const state = createAnimatedLightState(seeds);
    expect(lights).toHaveLength(64 * 16);
    expect(curvePoints).toHaveLength(240 * 4);
    expect(WORKLOAD_PROFILES.smoke.lights).toBe(32);
    expect(WORKLOAD_PROFILES.heavy.lights).toBe(32);
    expect(WORKLOAD_PROFILES.extreme.lights).toBe(32);
    for (const profile of Object.values(WORKLOAD_PROFILES)) {
      expect(Reflect.get(profile, "sampleCount")).toBe(1);
    }
    for (const [index, position] of MAIN_POINT_LIGHT_POSITIONS.entries()) {
      const offset = index * 16;
      expect(Array.from(lights.slice(offset, offset + 3))).toEqual(
        asFloat32(position),
      );
      expect(Array.from(lights.slice(offset + 4, offset + 7))).toEqual(
        asFloat32(position),
      );
      expect(Array.from(lights.slice(offset + 8, offset + 11))).toEqual([
        10,
        expect.closeTo(0.1),
        expect.closeTo(0.1),
      ]);
      expect(lights[offset + 4 + 3]).toBeCloseTo(6);
      expect(lights[offset + 3]).toBe(0);
      expect(lights[offset + 11]).toBeCloseTo(1.2);
    }

    const sampledSourceIndices = [
      ...Array.from({ length: 16 }, (_, index) =>
        Math.floor((index * FIRE_LIGHT_COUNT) / 16),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        Math.floor(FIRE_LIGHT_COUNT + (index * CURVE_LIGHT_COUNT) / 8),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        Math.floor(
          FIRE_LIGHT_COUNT +
            CURVE_LIGHT_COUNT +
            (index * (seeds.length - FIRE_LIGHT_COUNT - CURVE_LIGHT_COUNT)) / 4,
        ),
      ),
    ];
    for (const [sampleIndex, sourceIndex] of sampledSourceIndices.entries()) {
      const slot = MAIN_POINT_LIGHT_POSITIONS.length + sampleIndex;
      const offset = slot * 16;
      const sourceOffset = sourceIndex * 3;
      const seed = seeds[sourceIndex];
      expect(Array.from(lights.slice(offset, offset + 3))).toEqual(
        asFloat32(seed.origin),
      );
      for (let axis = 0; axis < 3; axis += 1) {
        expect(lights[offset + 4 + axis]).toBeCloseTo(
          state.positions[sourceOffset + axis],
          5,
        );
      }
      expect(lights[offset + 7]).toBeCloseTo(
        state.lightRadii[sourceIndex] * 2,
      );
      expect(Array.from(lights.slice(offset + 8, offset + 11))).toEqual(
        asFloat32(seed.color),
      );
      expect(lights[offset + 11]).toBeCloseTo(
        state.intensities[sourceIndex] * 4,
      );
      expect(Array.from(lights.slice(offset + 12, offset + 15))).toEqual(
        asFloat32(seed.velocity),
      );
      expect(lights[offset + 15]).toBeCloseTo(seed.lifeSpeed);
    }

    for (let index = 32; index < 64; index += 1) {
      const offset = index * 16;
      expect(Array.from(lights.slice(offset, offset + 16))).toEqual(
        Array.from({ length: 16 }, () => 0),
      );
    }
  });

  it("updates the sampled fire, curve, and corridor lights on the GPU", () => {
    const source = resolveTypeGpuRendererWGSL().compute;

    expect(source).toContain("curvePoints");
    expect(source).toMatch(/fn typeGpuLightCurlNoise\b/);
    expect(source).toContain("239f");
    expect(source).toContain("0.016666666666666666f");
    expect(source).not.toContain("phase = ((clock.x * light.motion.x)");
  });

  it("matches Three.js point-light inverse-square decay and quartic cutoff", () => {
    const source = resolveTypeGpuRendererWGSL().forward;

    expect(source).toContain("pow(distanceRatio, 4f)");
    expect(source.match(/\bcutoff\b/g)).toHaveLength(3);
    expect(source).toMatch(/distance_\d+\s*\*\s*distance_\d+/);
    expect(source).not.toContain("select(0.2f, 0.08f");
  });

  it("keeps point-light accumulation outside directional shadow visibility", () => {
    const source = resolveTypeGpuRendererWGSL().forward;
    const localAccumulator = source.indexOf("localLighting");
    const shadowedSun = source.indexOf("shadowedSun");
    const finalCombination = source.lastIndexOf("localLighting");

    expect(localAccumulator).toBeGreaterThanOrEqual(0);
    expect(shadowedSun).toBeGreaterThan(localAccumulator);
    expect(finalCombination).toBeGreaterThan(shadowedSun);
    expect(source.slice(shadowedSun, finalCombination)).not.toMatch(
      /localLighting\s*\*\s*[^;]*visibility/,
    );
  });

  it("keeps the analytic red-light budget aligned with the visual reference", () => {
    const lights = createTypeGpuLights();
    const redSlots = Array.from({ length: 64 }, (_, index) => index).filter(
      (index) => {
        const offset = index * 16;
        return (
          lights[offset + 8] >= 8 &&
          lights[offset + 9] < 0.5 &&
          lights[offset + 10] < 0.5 &&
          lights[offset + 11] > 0
        );
      },
    );

    expect(redSlots).toEqual(Array.from({ length: 20 }, (_, index) => index));
    for (let index = 0; index < 4; index += 1) {
      expect(lights[index * 16 + 7]).toBeCloseTo(6);
      expect(lights[index * 16 + 11]).toBeCloseTo(1.2);
    }
    for (let index = 4; index < 20; index += 1) {
      expect(lights[index * 16 + 7]).toBeLessThanOrEqual(1);
    }
  });
});
