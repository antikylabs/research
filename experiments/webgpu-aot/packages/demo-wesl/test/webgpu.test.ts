/// <reference types="wesl-plugin/suffixes" />

import { create, globals } from "webgpu";
import { describe, expect, it, vi } from "vitest";

import ambientWGSL from "../shaders/ambient.wesl?static";
import bloomWGSL from "../shaders/bloom.wesl?static";
import depthWGSL from "../shaders/depth.wesl?static";
import environmentWGSL from "../shaders/environment.wesl?static";
import forwardWGSL from "../shaders/forward.wesl?static";
import particlesWGSL from "../shaders/particles.wesl?static";
import postWGSL from "../shaders/post.wesl?static";
import reflectionWGSL from "../shaders/reflection.wesl?static";
import sunWGSL from "../shaders/sun.wesl?static";
import temporalWGSL from "../shaders/temporal.wesl?static";
import {
  createWeslLightValues,
  createWeslParticleValues,
  WESL_ANALYTIC_LIGHT_COUNT,
  WESL_CURVE_PARTICLE_COUNT,
  WESL_FIRE_PARTICLE_COUNT,
  WESL_PARTICLE_COUNT,
  WESL_SIMULATED_LIGHT_COUNT,
} from "../src/lights.js";
import {
  encodeWeslBackgroundPass,
  encodeWeslDepthPass,
  encodeWeslForwardPass,
} from "../src/passes.js";
import { createWeslFrameValues } from "../src/frame.js";
import { createWeslPipelines } from "../src/pipelines.js";
import {
  WESL_POST_EXPOSURE,
  WESL_POST_SPATIAL_BLEND,
} from "../src/profile.js";
import {
  shadowResolutionForProfile,
  WESL_SHADOW_CASCADE_COUNT,
} from "../src/shadow.js";

describe("statically linked WESL artifact", () => {
  it("uses the reference exposure after source-correct post processing", () => {
    expect(WESL_POST_EXPOSURE).toBe(1);
  });

  it("does not add a second spatial blur after linked bloom", () => {
    expect(WESL_POST_SPATIAL_BLEND).toBe(0);
  });

  it("uses five reference bloom levels and an exact ACES/sRGB presentation", () => {
    expect(bloomWGSL).toMatch(/smoothstep\(1\.0, 1\.01/);
    expect(bloomWGSL).toMatch(/kernelRadius \/ 3\.0/);
    expect(postWGSL).toMatch(/var bloomLevel4: texture_2d<f32>/);
    expect(postWGSL).toMatch(/\) \* 0\.18/);
    expect(postWGSL).toMatch(/bloomLevel0[\s\S]*\* 0\.9972/);
    expect(postWGSL).toMatch(/bloomLevel1[\s\S]*\* 0\.7986/);
    expect(postWGSL).toMatch(/bloomLevel2[\s\S]*\* 0\.6\b/);
    expect(postWGSL).toMatch(/bloomLevel3[\s\S]*\* 0\.4014/);
    expect(postWGSL).toMatch(/bloomLevel4[\s\S]*\* 0\.2028/);
    expect(bloomWGSL).not.toMatch(/clamp\(uv, vec2f\(0\.001\)/);
    expect(postWGSL).not.toMatch(/vignette|grain|vec3f\(1\.16, 1\.31, 1\.35\)/);
    expect(postWGSL).toMatch(/fn sRGBTransferOETF/);
  });

  it("maps linked full-screen vertices across normalized texture space", () => {
    const normalizedUv = /vec2f\(x \+ 1\.0, 1\.0 - y\) \* 0\.5/;
    expect(bloomWGSL).toMatch(normalizedUv);
    expect(postWGSL).toMatch(normalizedUv);
    expect(temporalWGSL).toMatch(normalizedUv);
    expect(temporalWGSL).toMatch(/currentWeight = 0\.05/);
    expect(temporalWGSL).toMatch(/temporalClipAabb/);
    expect(temporalWGSL).not.toContain("ambientTexture");
    expect(bloomWGSL).toMatch(/bloomSource.*bloomReflection/s);
  });

  it("links the same canonical clip transform into both geometry stages", () => {
    expect(depthWGSL).toMatch(/fn clipPosition\b/);
    expect(forwardWGSL).toMatch(/fn clipPosition\b/);
    expect(depthWGSL).toMatch(/output\.position\s*=\s*clipPosition\(/);
    expect(forwardWGSL).toMatch(/output\.position\s*=\s*clipPosition\(/);
  });

  it("retains linked surface data for native screen-space reflections", () => {
    expect(forwardWGSL).toMatch(/@location\(1\)\s+surface/);
    expect(forwardWGSL).toMatch(/@location\(2\)\s+worldMetal/);
    expect(reflectionWGSL).toMatch(/@fragment\s+fn reflectionFragment\b/);
    expect(reflectionWGSL).toMatch(/var travel = 0\.16/);
    expect(reflectionWGSL).toMatch(/for\s*\(var step = 0; step < 24;/);
    expect(reflectionWGSL).toMatch(/travel \+= 0\.1 \+ f32\(step\) \* 0\.024/);
    expect(reflectionWGSL).toMatch(/crossing <= 0\.11 \+ travel \* 0\.028/);
    expect(reflectionWGSL).not.toMatch(/projectedRayLength|totalSteps/);
    expect(reflectionWGSL).not.toMatch(/for\s*\(var refine/);
    expect(reflectionWGSL).toMatch(
      /@fragment\s+fn reflectionReconstructFragment\b/,
    );
    expect(reflectionWGSL).toMatch(/for \(var x = -3; x <= 3;/);
    expect(reflectionWGSL).toMatch(/for \(var y = -3; y <= 3;/);
    expect(reflectionWGSL).toMatch(/color \/ 49\.0/);
    expect(reflectionWGSL).toMatch(/fn reflectionSelectFragment\b/);
    expect(reflectionWGSL).toMatch(/roughness \* roughness \* 4\.0/);
    expect(reflectionWGSL).toMatch(/fn weslReflectionHitTransfer\b/);
    expect(reflectionWGSL).toMatch(/hitColor \* metallic \* attenuation \* grazing/);
    expect(reflectionWGSL).toMatch(/luminanceScale \* 0\.7/);
    expect(reflectionWGSL).not.toMatch(/sourcePeak|upward|roughness \* 0\.5/);
    expect(postWGSL).toMatch(/color \+= textureSampleLevel\(/);
    expect(postWGSL).not.toMatch(/reflection \* 0\.9/);
  });

  it("builds the shared 16-sample fullscreen ambient occlusion pass", () => {
    expect(ambientWGSL).toMatch(/@vertex\s+fn ambientVertex\b/);
    expect(ambientWGSL).toMatch(/@fragment\s+fn ambientFragment\b/);
    expect(ambientWGSL).toMatch(/for \(var sampleIndex = 0; sampleIndex < 16;/);
    expect(ambientWGSL).toMatch(/occlusion \/ 16\.0/);
    expect(ambientWGSL).toMatch(/clamp\(1\.0 - .*ambientSettings\.w, 0\.38, 1\.0\)/s);
    expect(ambientWGSL).not.toMatch(/@compute|texture_storage_2d/);
  });

  it("owns two soft directional shadow cascades", () => {
    expect(WESL_SHADOW_CASCADE_COUNT).toBe(2);
    expect(shadowResolutionForProfile("smoke")).toBe(4096);
    expect(shadowResolutionForProfile("heavy")).toBe(4096);

    const frames = createWeslFrameValues(2560, 1440, 32);
    expect(frames.nearShadow).toHaveLength(40);
    expect(frames.farShadow).toHaveLength(40);
    expect(frames.nearShadow.slice(0, 16)).not.toEqual(
      frames.farShadow.slice(0, 16),
    );

    expect(forwardWGSL).toMatch(/var nearShadow: texture_depth_2d/);
    expect(forwardWGSL).toMatch(/var farShadow: texture_depth_2d/);
    expect(forwardWGSL).toMatch(/var shadowSampler: sampler_comparison/);
    expect(sunWGSL).toMatch(/struct SunLighting\b/);
    expect(forwardWGSL).toMatch(/struct SunLighting\b/);
    expect(forwardWGSL).toMatch(
      /@group\(0\)\s*@binding\(5\)\s*var<uniform>\s+sunLighting:\s*SunLighting/,
    );
    expect(forwardWGSL).not.toMatch(/@group\(0\)\s*@binding\(6\)/);
    expect(forwardWGSL).toMatch(/fn sampleSunCascade\b/);
    expect(forwardWGSL).toMatch(/textureSampleCompareLevel\(/);
    expect(forwardWGSL).toMatch(/position \+ normal \* sun\.cameraForwardNormalBias\.w/);
    expect(forwardWGSL).toMatch(
      /dot\(position - cameraPosition, sun\.cameraForwardNormalBias\.xyz\)/,
    );
    expect(forwardWGSL).toMatch(/for \(var offsetY = -1; offsetY <= 1;/);
    expect(forwardWGSL).toMatch(/ndc\.z \+ bias/);
    expect(forwardWGSL).not.toMatch(/smoothstep\(10\.0, 15\.0/);
    expect(forwardWGSL).not.toMatch(/0\.34 \+ directionalShadowVisibility/);
    expect(forwardWGSL).not.toContain("surfaceBalance");
    expect(forwardWGSL).not.toMatch(/ambientData\.g|ambientData\.b/);
    expect(forwardWGSL).toMatch(/@location\(3\)\s+tangent:\s*vec4f/);
    expect(forwardWGSL).toMatch(/cross\(worldNormal, worldTangent\) \* tangent\.w/);
    expect(forwardWGSL).not.toMatch(/dpdx\(input\.worldPosition\)|dpdy\(input\.worldPosition\)/);
    expect(forwardWGSL).toMatch(/max\(materialRoughness, 0\.0525\)/);
    expect(forwardWGSL).toMatch(/dpdx\(geometryNormalView\)/);
    expect(forwardWGSL).toMatch(/roughness = min\(max\(materialRoughness, 0\.0525\) \+ geometryRoughness, 1\.0\)/);
    expect(forwardWGSL).toMatch(/roughnessSquared \* roughnessSquared/);
    expect(forwardWGSL).toMatch(/normalize\(mix\(reflected, n,/);
  });

  it("builds explicit sun and environment layouts without fixed raster bias", async () => {
    vi.stubGlobal("GPUShaderStage", { COMPUTE: 4, FRAGMENT: 2, VERTEX: 1 });
    const layouts: GPUBindGroupLayoutDescriptor[] = [];
    const descriptors: GPURenderPipelineDescriptor[] = [];
    const device = {
      createBindGroupLayout: vi.fn((descriptor: GPUBindGroupLayoutDescriptor) => {
        layouts.push(descriptor);
        return {};
      }),
      createComputePipelineAsync: vi.fn(async () => ({})),
      createPipelineLayout: vi.fn(() => ({})),
      createRenderPipelineAsync: vi.fn(async (descriptor: GPURenderPipelineDescriptor) => {
        descriptors.push(descriptor);
        return {};
      }),
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: vi.fn(async () => ({ messages: [] })),
      })),
    } as unknown as GPUDevice;
    try {
      await createWeslPipelines(device, "bgra8unorm");
      const forwardLayout = layouts.find(
        ({ label }) => label === "WESL forward screen-field layout",
      );
      expect(forwardLayout?.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            binding: 5,
            buffer: expect.objectContaining({ minBindingSize: 208 }),
          }),
        ]),
      );
      expect(
        Array.from(forwardLayout?.entries ?? []).some(
          ({ binding }) => binding === 6,
        ),
      ).toBe(false);
      const environmentLayout = layouts.find(
        ({ label }) => label === "WESL HDR environment lighting layout",
      );
      expect(environmentLayout?.entries).toEqual([
        {
          binding: 0,
          visibility: 2,
          sampler: { type: "filtering" },
        },
        {
          binding: 1,
          visibility: 2,
          texture: { sampleType: "float", viewDimension: "cube" },
        },
        {
          binding: 2,
          visibility: 2,
          texture: { sampleType: "float", viewDimension: "cube" },
        },
        {
          binding: 3,
          visibility: 2,
          texture: { sampleType: "float", viewDimension: "cube" },
        },
        {
          binding: 4,
          visibility: 2,
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          binding: 5,
          visibility: 2,
          buffer: { type: "uniform", minBindingSize: 96 },
        },
      ]);
      const shadows = descriptors.filter(({ label }) =>
        String(label).includes("directional shadow"),
      );
      expect(shadows).toHaveLength(2);
      for (const descriptor of shadows) {
        expect(descriptor.depthStencil?.format).toBe("depth32float");
        expect(descriptor.depthStencil).not.toHaveProperty("depthBias");
        expect(descriptor.depthStencil).not.toHaveProperty(
          "depthBiasSlopeScale",
        );
      }
      const backgrounds = descriptors.filter(({ label }) =>
        String(label).includes("HDR environment background"),
      );
      expect(backgrounds).toHaveLength(1);
      expect(backgrounds[0]?.fragment?.targets).toEqual([
        { format: "rgba16float" },
        { format: "rgba16float" },
        { format: "rgba16float" },
      ]);
      expect(backgrounds[0]?.depthStencil).toEqual({
        format: "depth24plus",
        depthWriteEnabled: false,
        depthCompare: "always",
      });
      const forwards = descriptors.filter(({ label }) =>
        String(label).includes("controlled forward"),
      );
      expect(forwards).toHaveLength(2);
      for (const descriptor of forwards) {
        expect(descriptor.depthStencil).toEqual({
          format: "depth24plus",
          depthWriteEnabled: true,
          depthCompare: "less",
        });
      }
      expect(device.createComputePipelineAsync).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("owns the complete deterministic light and particle workload", () => {
    expect(WESL_FIRE_PARTICLE_COUNT).toBe(256);
    expect(WESL_CURVE_PARTICLE_COUNT).toBe(150);
    expect(WESL_PARTICLE_COUNT).toBe(406);
    expect(WESL_ANALYTIC_LIGHT_COUNT).toBe(32);
    expect(WESL_SIMULATED_LIGHT_COUNT).toBe(474);

    const lights = createWeslLightValues(0.5);
    expect(lights).toHaveLength(WESL_ANALYTIC_LIGHT_COUNT * 8);
    for (let index = 0; index < 4; index += 1) {
      const offset = index * 8;
      expect(lights[offset + 3]).toBe(6);
      expect(Array.from(lights.slice(offset + 4, offset + 7))).toEqual([
        10,
        expect.closeTo(0.1),
        expect.closeTo(0.1),
      ]);
      expect(lights[offset + 7]).toBeCloseTo(1.2);
    }
    expect(forwardWGSL).toMatch(/let distanceSquared = dot\(toLight, toLight\)/);
    expect(forwardWGSL).toMatch(/let cutoff = clamp\(/);
    expect(forwardWGSL).toMatch(
      /1\.0 \/ max\(distanceSquared, 0\.01\) \* cutoff \* cutoff/,
    );
    expect(forwardWGSL).not.toMatch(/select\(0\.075, 0\.3, index < 4u\)/);

    const particles = createWeslParticleValues();
    expect(particles).toHaveLength(WESL_PARTICLE_COUNT * 8);
    expect(createWeslParticleValues()).toEqual(particles);

    const curveParticles = Array.from(
      { length: WESL_CURVE_PARTICLE_COUNT },
      (_, index) => {
        const offset = (WESL_FIRE_PARTICLE_COUNT + index) * 8;
        return Array.from(particles.slice(offset, offset + 8));
      },
    );
    expect(
      Math.max(...curveParticles.map((particle) => particle[3])),
    ).toBeCloseTo(0.02);
    expect(
      Math.max(...curveParticles.flatMap((particle) => particle.slice(4, 7))),
    ).toBeLessThanOrEqual(4);
    expect(particlesWGSL).not.toContain("fireCore");
    expect(particlesWGSL).not.toContain("falloff");
    expect(particlesWGSL).not.toContain("discard");
    expect(particlesWGSL).not.toContain("smoothstep");
    expect(particlesWGSL).not.toMatch(/clip\.z\s*[-+]=/);
  });

  it("draws the HDR background before leaving renderer-owned passes open", () => {
    const end = vi.fn();
    const draw = vi.fn();
    const setPipeline = vi.fn();
    const pass = {
      draw,
      end,
      setBindGroup: vi.fn(),
      setPipeline,
    } as unknown as GPURenderPassEncoder;
    const frame = {} as GPUBindGroup;
    const environment = {} as GPUBindGroup;
    const pipeline = {} as GPURenderPipeline;

    encodeWeslBackgroundPass(pass, environment, pipeline);
    encodeWeslDepthPass(pass, [], frame, pipeline, pipeline);
    encodeWeslForwardPass(
      pass,
      [],
      frame,
      environment,
      pipeline,
      pipeline,
    );

    expect(setPipeline).toHaveBeenNthCalledWith(1, pipeline);
    expect(draw).toHaveBeenCalledWith(3);
    expect(pass.setBindGroup).toHaveBeenCalledWith(2, environment);
    expect(end).not.toHaveBeenCalled();
  });

  it("compiles every linked module and native pipeline in Dawn", async () => {
    const dawnGlobals = globals as unknown as {
      readonly GPUBufferUsage: typeof GPUBufferUsage;
      readonly GPUShaderStage: typeof GPUShaderStage;
      readonly GPUTextureUsage: typeof GPUTextureUsage;
    };
    let gpu = create([]);
    let adapter = await gpu.requestAdapter();
    if (adapter === null) {
      gpu = create(["backend=null"]);
      adapter = await gpu.requestAdapter();
    }
    if (adapter === null) throw new Error("Dawn did not provide a WebGPU adapter");

    const device = await adapter.requestDevice();
    try {
      const modules = [
        depthWGSL,
        ambientWGSL,
        forwardWGSL,
        particlesWGSL,
        bloomWGSL,
        postWGSL,
        reflectionWGSL,
        sunWGSL,
        environmentWGSL,
        temporalWGSL,
      ].map((code) => device.createShaderModule({ code }));
      for (const shaderModule of modules) {
        const compilationInfo = await shaderModule.getCompilationInfo();
        expect(
          compilationInfo.messages.filter((message) => message.type === "error"),
        ).toEqual([]);
      }

      await expect(
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: {
            module: modules[0],
            entryPoint: "depthVertex",
            buffers: [
              {
                arrayStride: 12,
                attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
              },
              {
                arrayStride: 8,
                attributes: [{ shaderLocation: 1, offset: 0, format: "float32x2" }],
              },
            ],
          },
          fragment: { module: modules[0], entryPoint: "depthFragment", targets: [] },
          primitive: { topology: "triangle-list" },
          depthStencil: {
            format: "depth24plus",
            depthWriteEnabled: true,
            depthCompare: "less",
          },
        }),
      ).resolves.toBeDefined();
      await expect(
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: modules[6], entryPoint: "reflectionVertex" },
          fragment: {
            module: modules[6],
            entryPoint: "reflectionSelectFragment",
            targets: [{ format: "rgba16float" }],
          },
          primitive: { topology: "triangle-list" },
        }),
      ).resolves.toBeDefined();
      await expect(
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: modules[9], entryPoint: "temporalVertex" },
          fragment: {
            module: modules[9],
            entryPoint: "temporalFragment",
            targets: [{ format: "rgba16float" }],
          },
          primitive: { topology: "triangle-list" },
        }),
      ).resolves.toBeDefined();
      await expect(
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: modules[8], entryPoint: "environmentVertex" },
          fragment: {
            module: modules[8],
            entryPoint: "environmentFragment",
            targets: [
              { format: "rgba16float" },
              { format: "rgba16float" },
              { format: "rgba16float" },
            ],
          },
          primitive: { topology: "triangle-list" },
        }),
      ).resolves.toBeDefined();
      await expect(
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: modules[1], entryPoint: "ambientVertex" },
          fragment: {
            module: modules[1],
            entryPoint: "ambientFragment",
            targets: [{ format: "r8unorm" }],
          },
          primitive: { topology: "triangle-list" },
        }),
      ).resolves.toBeDefined();
      await expect(
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: {
            module: modules[2],
            entryPoint: "forwardVertex",
            buffers: [
              {
                arrayStride: 12,
                attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
              },
              {
                arrayStride: 12,
                attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }],
              },
              {
                arrayStride: 8,
                attributes: [{ shaderLocation: 2, offset: 0, format: "float32x2" }],
              },
              {
                arrayStride: 16,
                attributes: [{ shaderLocation: 3, offset: 0, format: "float32x4" }],
              },
            ],
          },
          fragment: {
            module: modules[2],
            entryPoint: "forwardFragment",
            targets: [
              { format: "rgba16float" },
              { format: "rgba16float" },
              { format: "rgba16float" },
            ],
          },
          primitive: { topology: "triangle-list" },
          depthStencil: {
            format: "depth24plus",
            depthWriteEnabled: true,
            depthCompare: "less",
          },
        }),
      ).resolves.toBeDefined();
      await expect(
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: modules[3], entryPoint: "particleVertex" },
          fragment: {
            module: modules[3],
            entryPoint: "particleFragment",
            targets: [{ format: "rgba16float" }],
          },
          primitive: { topology: "triangle-list" },
          depthStencil: {
            format: "depth24plus",
            depthWriteEnabled: false,
            depthCompare: "less-equal",
          },
        }),
      ).resolves.toBeDefined();
      await expect(
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: modules[6], entryPoint: "reflectionVertex" },
          fragment: {
            module: modules[6],
            entryPoint: "reflectionFragment",
            targets: [{ format: "rgba16float" }],
          },
          primitive: { topology: "triangle-list" },
        }),
      ).resolves.toBeDefined();
      await expect(
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: modules[6], entryPoint: "reflectionVertex" },
          fragment: {
            module: modules[6],
            entryPoint: "reflectionReconstructFragment",
            targets: [{ format: "rgba16float" }],
          },
          primitive: { topology: "triangle-list" },
        }),
      ).resolves.toBeDefined();
      await expect(
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: modules[4], entryPoint: "bloomVertex" },
          fragment: {
            module: modules[4],
            entryPoint: "bloomFragment",
            targets: [{ format: "rgba16float" }],
          },
          primitive: { topology: "triangle-list" },
        }),
      ).resolves.toBeDefined();
      await expect(
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: modules[5], entryPoint: "postVertex" },
          fragment: {
            module: modules[5],
            entryPoint: "postFragment",
            targets: [{ format: "bgra8unorm" }],
          },
          primitive: { topology: "triangle-list" },
        }),
      ).resolves.toBeDefined();

      vi.stubGlobal("GPUShaderStage", dawnGlobals.GPUShaderStage);
      const pipelines = await createWeslPipelines(device, "bgra8unorm");
      const frame = device.createBuffer({
        size: 160,
        usage: dawnGlobals.GPUBufferUsage.UNIFORM,
      });
      const lights = device.createBuffer({
        size: 1024,
        usage: dawnGlobals.GPUBufferUsage.STORAGE,
      });
      const sun = device.createBuffer({
        size: 208,
        usage: dawnGlobals.GPUBufferUsage.UNIFORM,
      });
      const nearShadow = device.createTexture({
        size: [1, 1],
        format: "depth32float",
        usage: dawnGlobals.GPUTextureUsage.TEXTURE_BINDING,
      });
      const farShadow = device.createTexture({
        size: [1, 1],
        format: "depth32float",
        usage: dawnGlobals.GPUTextureUsage.TEXTURE_BINDING,
      });
      const environmentCube = device.createTexture({
        size: [1, 1, 6],
        format: "rgba16float",
        usage: dawnGlobals.GPUTextureUsage.TEXTURE_BINDING,
      });
      const environmentLut = device.createTexture({
        size: [1, 1],
        format: "rgba16float",
        usage: dawnGlobals.GPUTextureUsage.TEXTURE_BINDING,
      });
      const environmentSettings = device.createBuffer({
        size: 96,
        usage: dawnGlobals.GPUBufferUsage.UNIFORM,
      });
      expect(
        device.createBindGroup({
          layout: pipelines.forwardFrameLayout,
          entries: [
            { binding: 0, resource: { buffer: frame } },
            { binding: 1, resource: { buffer: lights } },
            { binding: 2, resource: nearShadow.createView() },
            { binding: 3, resource: farShadow.createView() },
            {
              binding: 4,
              resource: device.createSampler({ compare: "less-equal" }),
            },
            { binding: 5, resource: { buffer: sun } },
          ],
        }),
      ).toBeDefined();
      expect(
        device.createBindGroup({
          layout: pipelines.environmentLayout,
          entries: [
            { binding: 0, resource: device.createSampler({}) },
            {
              binding: 1,
              resource: environmentCube.createView({ dimension: "cube" }),
            },
            {
              binding: 2,
              resource: environmentCube.createView({ dimension: "cube" }),
            },
            {
              binding: 3,
              resource: environmentCube.createView({ dimension: "cube" }),
            },
            { binding: 4, resource: environmentLut.createView() },
            { binding: 5, resource: { buffer: environmentSettings } },
          ],
        }),
      ).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
      device.destroy();
    }
  });
});
