import { create } from "webgpu";
import { describe, expect, it, vi } from "vitest";

import { brometalShaders } from "../src/generated/pipeline.generated.js";
import {
  BROMETAL_CURVE_PARTICLE_COUNT,
  BROMETAL_FIRE_PARTICLE_COUNT,
  BROMETAL_PARTICLE_COUNT,
  createBroMetalLightValues,
  createBroMetalParticleValues,
} from "../src/lights.js";
import {
  encodeBroMetalGeometryPass,
  writeBroMetalDynamicBuffers,
} from "../src/passes.js";
import { encodeBroMetalShadowPass } from "../src/shadow.js";

describe("generated BroMetal WebGPU artifact", () => {
  it("compiles as a shader module in Dawn", async () => {
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
      for (const code of Object.values(brometalShaders)) {
        const shaderModule = device.createShaderModule({ code });
        const compilationInfo = await shaderModule.getCompilationInfo();
        expect(
          compilationInfo.messages.filter((message) => message.type === "error"),
        ).toEqual([]);
      }
    } finally {
      device.destroy();
    }
  });

  it("owns a deterministic red fire and overhead particle workload", () => {
    expect(BROMETAL_FIRE_PARTICLE_COUNT).toBe(256);
    expect(BROMETAL_CURVE_PARTICLE_COUNT).toBe(150);
    expect(BROMETAL_PARTICLE_COUNT).toBe(406);

    const particles = createBroMetalParticleValues(0.5);
    expect(particles).toHaveLength(BROMETAL_PARTICLE_COUNT * 8);
    for (let index = 0; index < BROMETAL_FIRE_PARTICLE_COUNT; index += 1) {
      const offset = index * 8;
      expect(particles[offset + 3]).toBeGreaterThanOrEqual(0);
      expect(particles[offset + 3]).toBeLessThanOrEqual(0.025);
      expect(Array.from(particles.slice(offset + 4, offset + 8))).toEqual([
        10,
        expect.closeTo(0.1),
        expect.closeTo(0.1),
        1,
      ]);
    }
    expect(brometalShaders.particles).not.toContain("fireCore");
    expect(brometalShaders.particles).not.toContain("discard;");
    expect(brometalShaders.particles).not.toContain("smoothstep");
    expect(brometalShaders.particles).not.toContain("clip.z -=");

    const lights = createBroMetalLightValues(0.5);
    expect(lights).toHaveLength(32 * 8);
    for (let index = 0; index < 4; index += 1) {
      const offset = index * 8;
      expect(lights[offset + 3]).toBe(6);
      expect(Array.from(lights.slice(offset + 4, offset + 7))).toEqual([
        10,
        expect.closeTo(0.1),
        expect.closeTo(0.1),
      ]);
    }
  });

  it("keeps geometry-pass lifetime under the deferred frame graph", () => {
    const pass = {
      end: vi.fn(),
      setBindGroup: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    encodeBroMetalGeometryPass(
      pass,
      [],
      {} as GPUBindGroup,
      {} as GPURenderPipeline,
      {} as GPURenderPipeline,
    );
    const map = {} as GPUTexture;
    const createCascade = () => ({
      bindGroup: {} as GPUBindGroup,
      buffer: {} as GPUBuffer,
      map,
      view: {} as GPUTextureView,
    });
    const cascades = [createCascade(), createCascade()] as const;
    encodeBroMetalShadowPass(
      {
        beginRenderPass: vi.fn(() => pass),
      } as unknown as GPUCommandEncoder,
      [],
      {
        backPipeline: {} as GPURenderPipeline,
        cascades,
        destroy: vi.fn(),
        doublePipeline: {} as GPURenderPipeline,
        estimatedBytes: 0,
        lightingBuffer: {} as GPUBuffer,
        sampler: {} as GPUSampler,
      },
    );
    expect(pass.end).toHaveBeenCalledTimes(2);
  });

  it("writes only the four dynamic frame buffers", () => {
    const queue = { writeBuffer: vi.fn() } as unknown as GPUQueue;
    const buffers = Array.from({ length: 4 }, () => ({} as GPUBuffer));
    const values = Array.from({ length: 4 }, () => new Float32Array(4));
    writeBroMetalDynamicBuffers(queue, {
      frame: { buffer: buffers[0], values: values[0] },
      lights: { buffer: buffers[1], values: values[1] },
      particles: { buffer: buffers[2], values: values[2] },
      temporal: { buffer: buffers[3], values: values[3] },
    });
    expect(queue.writeBuffer).toHaveBeenCalledTimes(4);
    for (let index = 0; index < 4; index += 1) {
      expect(queue.writeBuffer).toHaveBeenNthCalledWith(
        index + 1,
        buffers[index],
        0,
        values[index],
      );
    }
  });
});
