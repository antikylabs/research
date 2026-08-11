import { create } from "webgpu";
import { describe, expect, it, vi } from "vitest";
import type { AotRenderShaderArtifact } from "typegpu-antiky";

import { shader as ambientShader } from "../src/generated/ambient.generated.js";
import { shader as bloomShader } from "../src/generated/bloom.generated.js";
import { shader as compositeShader } from "../src/generated/composite.generated.js";
import { shader as forwardShader } from "../src/generated/forward.generated.js";
import { shader as particleShader } from "../src/generated/particles.generated.js";
import { shader as reflectionReconstructShader } from "../src/generated/reflection-reconstruct.generated.js";
import { shader as reflectionSelectShader } from "../src/generated/reflection-select.generated.js";
import { shader as reflectionShader } from "../src/generated/reflection.generated.js";
import { shader as shadowShader } from "../src/generated/shadow.generated.js";
import { shader as temporalShader } from "../src/generated/temporal.generated.js";
import {
  ANTIKY_CURVE_PARTICLE_COUNT,
  ANTIKY_FIRE_PARTICLE_COUNT,
  ANTIKY_PARTICLE_COUNT,
  createAntikyLightValues,
  createAntikyParticleValues,
} from "../src/lights.js";
import {
  encodeAntikyForwardPass,
  encodeAntikyShadowPass,
} from "../src/passes.js";
import {
  ANTIKY_AMBIENT_OCCLUSION_STRENGTH,
  ANTIKY_COMPOSITE_EXPOSURE,
} from "../src/profile.js";

describe("generated TypeGPU-Antiky Sponza artifact", () => {
  it("keeps AOT ambient occlusion strong with bounded exposure", () => {
    expect(ANTIKY_AMBIENT_OCCLUSION_STRENGTH).toBeGreaterThanOrEqual(4);
    expect(ANTIKY_AMBIENT_OCCLUSION_STRENGTH).toBeLessThanOrEqual(8);
    expect(ANTIKY_COMPOSITE_EXPOSURE).toBe(1);
  });

  it("keeps physical lighting free of orientation presentation gains", () => {
    expect(forwardShader.wgsl).not.toMatch(/fn antikySurfaceBalance\b/);
  });

  it("keeps physical point lights outside directional shadow visibility", () => {
    expect(forwardShader.wgsl).toContain("let distanceSquared");
    expect(forwardShader.wgsl).toContain("let cutoff");
    expect(forwardShader.wgsl).toMatch(
      /1f\s*\/\s*max\(distanceSquared,\s*0\.01f\)/,
    );
    expect(forwardShader.wgsl).toMatch(
      /distanceRatioSquared = \(distanceRatio \* distanceRatio\)/,
    );
    expect(forwardShader.wgsl).toMatch(
      /cutoff = clamp\(\(1f - \(distanceRatioSquared \* distanceRatioSquared\)\), 0f, 1f\)/,
    );
    expect(forwardShader.wgsl).toMatch(
      /attenuation = \(\(\(1f \/ max\(distanceSquared, 0\.01f\)\) \* cutoff\) \* cutoff\)/,
    );
    expect(forwardShader.wgsl).not.toContain("distanceFalloff");
    expect(forwardShader.wgsl).toMatch(
      /color = \(\(\(color \* .*shadow.*\) \+ pointLighting\) \+ environment\);/,
    );
  });

  it("binds renderer-owned radiance and replaces the hemisphere approximation", () => {
    expect(
      forwardShader.bindGroups[0]?.entries.map(({ name }) => name),
    ).toEqual([
      "frame",
      "lights",
      "nearShadow",
      "farShadow",
      "shadowSampler",
      "environmentSampler",
      "environmentMap",
    ]);
    expect(forwardShader.bindGroups[0]?.entries[5]).toMatchObject({
      binding: 5,
      sampler: { type: "filtering" },
    });
    expect(forwardShader.bindGroups[0]?.entries[6]).toMatchObject({
      binding: 6,
      texture: { sampleType: "float", viewDimension: "cube" },
    });
    expect(forwardShader.wgsl).toMatch(/fn antikyEnvironmentLighting\b/);
    expect(forwardShader.wgsl).toContain("textureSampleLevel(");
    expect(forwardShader.wgsl).toMatch(/roughness \* 8f/);
    expect(forwardShader.wgsl).toMatch(/roughness.*roughness.*roughness.*roughness/s);
    expect(forwardShader.wgsl).toMatch(/\/ 21f/);
    expect(forwardShader.wgsl).not.toContain(
      "vec3f(0.015f, 0.012f, 0.012f)",
    );
    expect(forwardShader.wgsl).not.toContain(
      "vec3f(0.06f, 0.065f, 0.08f)",
    );
  });

  it("bakes a near-vertical fitted sun with soft cascaded visibility", () => {
    expect(forwardShader.wgsl).toContain(
      "vec3f(0.0010204070713371038, 0.9999989867210388, 0.0010204070713371038)",
    );
    expect(forwardShader.wgsl).toContain(
      "vec3f(0.21559999883174896, 0.26269999146461487, 0.33329999446868896)",
    );
    expect(forwardShader.wgsl).toContain("textureSampleCompareLevel(");
    expect(forwardShader.wgsl).toContain("offsetY <= 1i");
    expect(forwardShader.wgsl).toContain("offsetX <= 1i");
    expect(forwardShader.wgsl).toContain("smoothstep(");
    expect(forwardShader.wgsl).not.toContain("0.32f + (shadow * 0.68f)");
    expect(shadowShader.pipeline.primitive.cullMode).toBe("back");
    expect(shadowShader.pipeline.primitive.frontFace).toBe("cw");
    expect(shadowShader.pipeline.depthStencil).toMatchObject({
      depthCompare: "less-equal",
      depthWriteEnabled: true,
      format: "depth24plus",
    });
    expect(shadowShader.pipeline.depthStencil).not.toHaveProperty("depthBias");
    expect(shadowShader.pipeline.depthStencil).not.toHaveProperty(
      "depthBiasSlopeScale",
    );
  });

  it("exports the spatial buffers required by its AOT reflection graph", () => {
    expect(forwardShader.pipeline.targets).toHaveLength(3);
    expect(reflectionShader.wgsl).toMatch(/fn reflectionFragment\b/);
    expect(reflectionShader.wgsl).toContain("< 24i");
    expect(reflectionShader.bindGroups[0]?.entries.map(({ name }) => name)).toEqual([
      "hdr",
      "surface",
      "worldMetal",
      "depth",
      "frame",
      "sampler",
    ]);
    expect(reflectionShader.pipeline.targets).toEqual([{ format: "rgba16float" }]);
  });

  it("uses the raw mirror-hit transfer without presentation heuristics", () => {
    expect(reflectionShader.wgsl).toMatch(
      /fn antikyReflectionHitTransfer\b/,
    );
    expect(reflectionShader.wgsl).toMatch(/var planeDistance = 0f/);
    expect(reflectionShader.wgsl).toMatch(
      /planeDistance = dot\(\(scenePosition - worldPosition\), normal\)/,
    );
    expect(reflectionShader.wgsl).toContain("let distanceRatio");
    expect(reflectionShader.wgsl).toContain("let attenuation");
    expect(reflectionShader.wgsl).toContain("let grazing");
    expect(reflectionShader.wgsl).toContain("let luminance");
    expect(reflectionShader.wgsl).toMatch(/planeDistance \/ 100f/);
    expect(reflectionShader.wgsl).toMatch(/dot\(incident, reflected\)/);
    expect(reflectionShader.wgsl).toMatch(
      /hitColor \* \(\(metallic \* attenuation\) \* grazing\)/,
    );
    expect(reflectionShader.wgsl).toMatch(
      /min\(\(10f \/ max\(luminance, 1e-4f\)\), 1f\)/,
    );
    expect(reflectionShader.wgsl).toMatch(
      /weightedColor \* \(luminanceScale \* 0\.7f\)/,
    );
    expect(reflectionShader.wgsl).toContain("0.2125999927520752");
    expect(reflectionShader.wgsl).toContain("0.7152000069618225");
    expect(reflectionShader.wgsl).toContain("0.0722000002861023");
    expect(reflectionShader.wgsl).not.toContain("sourcePeak");
    expect(reflectionShader.wgsl).not.toContain("upward");
    expect(reflectionShader.wgsl).not.toContain("roughness");
    expect(reflectionShader.wgsl).not.toContain("confidence");
    expect(reflectionShader.wgsl).not.toContain("fresnel");
    expect(reflectionShader.wgsl).not.toContain("smoothstep(");
  });

  it("keeps reflection traversal fixed around the transfer experiment", () => {
    expect(reflectionShader.wgsl).toContain(
      "var travel = 0.1599999964237213f",
    );
    expect(reflectionShader.wgsl).toMatch(
      /travel \+= \(0\.1f \+ \(f32\(step_1\) \* 0\.024f\)\)/,
    );
    expect(reflectionShader.wgsl).toMatch(
      /worldPosition \+ \(normal \* 0\.045f\)/,
    );
    expect(reflectionShader.wgsl).toMatch(
      /crossing <= \(0\.11f \+ \(travel \* 0\.028f\)\)/,
    );
    expect(reflectionShader.wgsl).toMatch(
      /distance\(scenePosition, worldPosition\) > 0\.2f/,
    );
  });

  it("resolves the raw scene before reference bloom and display", () => {
    expect(ANTIKY_COMPOSITE_EXPOSURE).toBe(1);
    expect(bloomShader.wgsl).toMatch(
      /dot\(color, vec3f\(0\.2125\d+, 0\.7152\d+, 0\.0722\d+\)\)/,
    );
    expect(bloomShader.wgsl).toContain("smoothstep(1f, 1.01f, luminance)");
    expect(bloomShader.wgsl).toContain("offset < 22i");
    expect(bloomShader.wgsl).not.toContain("smoothstep(0.16f, 0.8f");
    expect(temporalShader.bindGroups[0]?.entries.map(({ name }) => name)).toEqual([
      "currentHdr",
      "ambient",
      "history",
      "settings",
    ]);
    expect(temporalShader.pipeline.targets).toEqual([{ format: "rgba16float" }]);
    expect(temporalShader.wgsl).toMatch(/fn antikyTemporalClipAabb\b/);
    expect(temporalShader.wgsl).toContain("y <= 1i");
    expect(temporalShader.wgsl).toContain("x <= 1i");
    expect(temporalShader.wgsl).not.toContain("currentDepth");
    expect(temporalShader.wgsl).not.toContain("reflection");
    expect(temporalShader.wgsl).toMatch(
      /select\(1f, 0\.05\d*f, hasValidHistory\)/,
    );
    expect(temporalShader.wgsl).toMatch(
      /vec3f\(0\.2125\d+, 0\.7152\d+, 0\.0722\d+\)/,
    );
    expect(compositeShader.bindGroups[0]?.entries.map(({ name }) => name)).toEqual([
      "temporal",
      "bloomLevel0",
      "bloomLevel1",
      "bloomLevel2",
      "bloomLevel3",
      "bloomLevel4",
      "reflection",
      "sampler",
      "settings",
    ]);
    expect(compositeShader.pipeline.targets).toEqual([{ format: "bgra8unorm" }]);
    expect(compositeShader.wgsl).not.toContain("historyMix");
    expect(compositeShader.wgsl).toContain("fn antikyAcesFilmicToneMapping");
    expect(compositeShader.wgsl).toContain("fn antikySrgbTransferOetf");
    expect(compositeShader.wgsl).toContain("0.0031308f");
    expect(compositeShader.wgsl).not.toContain("fn antikyHash");
    expect(compositeShader.wgsl).not.toContain("vignette");
    expect(compositeShader.wgsl).not.toContain("vec3f(1.26f, 1.31f, 1.415f)");
  });

  it("creates a shader module and render pipeline in Dawn", async () => {
    let gpu = create([]);
    let adapter = await gpu.requestAdapter();
    if (adapter === null) {
      gpu = create(["backend=null"]);
      adapter = await gpu.requestAdapter();
    }
    if (adapter === null) {
      throw new Error("Dawn did not provide a WebGPU adapter");
    }

    const device = await adapter.requestDevice();
    try {
      const shaders: readonly AotRenderShaderArtifact[] = [
        shadowShader,
        forwardShader,
        particleShader,
        bloomShader,
        ambientShader,
        reflectionShader,
        reflectionReconstructShader,
        reflectionSelectShader,
        temporalShader,
        compositeShader,
      ];
      for (const shader of shaders) {
        const shaderModule = device.createShaderModule({ code: shader.wgsl });
        const compilationInfo = await shaderModule.getCompilationInfo();
        expect(
          compilationInfo.messages.filter((message) => message.type === "error"),
        ).toEqual([]);
        const pipeline = await device.createRenderPipelineAsync({
          layout: "auto",
          vertex: {
            module: shaderModule,
            entryPoint: shader.entryPoints.vertex,
            buffers: shader.pipeline.vertexBuffers,
          },
          fragment: {
            module: shaderModule,
            entryPoint: shader.entryPoints.fragment,
            targets: shader.pipeline.targets,
          },
          primitive: shader.pipeline.primitive,
          depthStencil: shader.pipeline.depthStencil,
          multisample: shader.pipeline.multisample,
        });
        expect(pipeline).toBeDefined();
      }
    } finally {
      device.destroy();
    }
  });

  it("bakes the reference fire rig and plain additive billboards", () => {
    const lights = createAntikyLightValues(0);
    expect(lights).toHaveLength(64 * 8);
    for (let index = 0; index < 4; index += 1) {
      const offset = index * 8;
      expect(Array.from(lights.slice(offset + 4, offset + 7))).toEqual([
        10,
        expect.closeTo(0.1),
        expect.closeTo(0.1),
      ]);
      expect(lights[offset + 3]).toBeGreaterThanOrEqual(5.5);
      expect(lights[offset + 7]).toBeCloseTo(1.2);
    }
    for (let index = 4; index < 20; index += 1) {
      const offset = index * 8;
      expect(lights[offset + 4]).toBe(10);
      expect(lights[offset + 5]).toBeCloseTo(0.1);
      expect(lights[offset + 6]).toBeCloseTo(0.1);
    }
    for (let index = 20; index < 28; index += 1) {
      const offset = index * 8;
      expect(lights[offset + 3]).toBeCloseTo(4);
      expect(lights[offset + 7]).toBeCloseTo(4);
    }
    expect(particleShader.pipeline.vertexBuffers).toEqual([]);
    expect(particleShader.bindGroups[0]?.entries[1]?.buffer?.minBindingSize).toBe(
      ANTIKY_PARTICLE_COUNT * 8 * Float32Array.BYTES_PER_ELEMENT,
    );
    expect(particleShader.pipeline.targets[0]?.blend?.color).toMatchObject({
      dstFactor: "one",
      operation: "add",
      srcFactor: "src-alpha",
    });
    expect(particleShader.wgsl).not.toContain("smoothstep");
    expect(particleShader.wgsl).not.toContain("discard;");
    expect(particleShader.wgsl).not.toContain("fireCore");
    expect(particleShader.wgsl).toMatch(
      /return vec4f\(_arg_0\.color, 1f\);/,
    );
  });

  it("owns all reference-sized fire and overhead billboards", () => {
    expect(ANTIKY_FIRE_PARTICLE_COUNT).toBe(256);
    expect(ANTIKY_CURVE_PARTICLE_COUNT).toBe(150);
    expect(ANTIKY_PARTICLE_COUNT).toBe(406);

    const particles = createAntikyParticleValues(0.5);
    expect(particles).toHaveLength(ANTIKY_PARTICLE_COUNT * 8);

    const fireEmitters = [
      [3.9, 1.15],
      [3.9, -1.75],
      [-4.95, 1.15],
      [-4.95, -1.75],
    ] as const;
    for (let emitterIndex = 0; emitterIndex < fireEmitters.length; emitterIndex += 1) {
      const [x, z] = fireEmitters[emitterIndex];
      for (
        let index = emitterIndex;
        index < ANTIKY_FIRE_PARTICLE_COUNT;
        index += fireEmitters.length
      ) {
        const offset = index * 8;
        expect(Math.abs(particles[offset] - x)).toBeLessThan(0.6);
        expect(Math.abs(particles[offset + 2] - z)).toBeLessThan(0.6);
        expect(particles[offset + 3]).toBeGreaterThanOrEqual(0);
        expect(particles[offset + 3]).toBeLessThanOrEqual(0.025);
        expect(particles[offset + 4]).toBe(10);
        expect(particles[offset + 5]).toBeCloseTo(0.1);
        expect(particles[offset + 6]).toBeCloseTo(0.1);
        expect(particles[offset + 7]).toBe(1);
      }
    }

    let overhead = 0;
    for (let index = ANTIKY_FIRE_PARTICLE_COUNT; index < ANTIKY_PARTICLE_COUNT; index += 1) {
      if (particles[index * 8 + 1] > 5.5) overhead += 1;
    }
    expect(overhead).toBeGreaterThan(120);
  });

  it("keeps render-pass lifetime under the frame graph caller", () => {
    const shadowPass = {
      end: vi.fn(),
      setBindGroup: vi.fn(),
      setPipeline: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    encodeAntikyShadowPass(
      shadowPass,
      {} as GPURenderPipeline,
      {} as GPURenderPipeline,
      {} as GPUBindGroup,
      [],
    );
    expect(shadowPass.end).not.toHaveBeenCalled();

    const forwardPass = {
      end: vi.fn(),
      setBindGroup: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    encodeAntikyForwardPass(
      forwardPass,
      [],
      {} as GPUBindGroup,
      {} as GPURenderPipeline,
      {} as GPURenderPipeline,
    );
    expect(forwardPass.end).not.toHaveBeenCalled();
  });
});
