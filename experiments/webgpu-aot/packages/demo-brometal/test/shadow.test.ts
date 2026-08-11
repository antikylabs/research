import { describe, expect, it, vi } from "vitest";

import type { BroMetalPrimitive } from "../src/scene.js";
import {
  BROMETAL_SHADOW_CASCADE_COUNT,
  BROMETAL_SHADOW_RESOLUTION,
  createBroMetalShadowResources,
  createBroMetalShadowPlan,
  encodeBroMetalShadowPass,
  type BroMetalShadowResources,
} from "../src/shadow.js";
import { BROMETAL_CAMERA, BROMETAL_SUN } from "../src/sun.js";
import { countBroMetalIndexedGeometryDraws } from "../src/telemetry.js";

function projectPoint(
  matrix: Float32Array,
  point: readonly [number, number, number],
): readonly [number, number, number] {
  const [x, y, z] = point;
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  return [
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w,
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w,
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / w,
  ];
}

describe("BroMetal directional sun shadow plan", () => {
  it("matches the native two-cascade sun configuration", () => {
    expect(BROMETAL_SHADOW_CASCADE_COUNT).toBe(2);
    expect(BROMETAL_SHADOW_RESOLUTION).toBe(4096);
    expect(BROMETAL_CAMERA.near).toBe(0.1);
    expect(BROMETAL_CAMERA.far).toBe(100);
    expect(BROMETAL_SUN).toMatchObject({
      color: [0.2156, 0.2627, 0.3333],
      intensity: 2,
      position: [0.1, 100, 0.1],
      shadow: { normalBias: 0.015 },
      target: [0, 2, 0],
    });

    const plan = createBroMetalShadowPlan(16 / 9);
    expect(plan.cascades).toHaveLength(2);
    expect(plan.splitNormalized).toBeCloseTo(0.266061, 6);
    expect(plan.direction).toEqual([
      expect.closeTo(0.0010204, 6),
      expect.closeTo(0.999999, 6),
      expect.closeTo(0.0010204, 6),
    ]);
    expect(plan.cascades.map(({ bias }) => bias)).toEqual([
      expect.closeTo(-0.00015, 8),
      expect.closeTo(-0.0003, 8),
    ]);
    expect(plan.fadeStartDistance).toBeLessThan(plan.splitDistance);
    expect(plan.fadeEndDistance).toBeGreaterThan(plan.splitDistance);
  });

  it("fits each orthographic cascade around its camera-frustum slice", () => {
    const plan = createBroMetalShadowPlan(2560 / 1440);
    expect(plan.cascades[0].farDistance).toBeCloseTo(plan.splitDistance, 5);
    expect(plan.cascades[1].nearDistance).toBeCloseTo(plan.splitDistance, 5);
    expect(plan.cascades[0].viewProjection).not.toEqual(
      plan.cascades[1].viewProjection,
    );

    for (const cascade of plan.cascades) {
      expect(cascade.frustumCorners).toHaveLength(8);
      for (const corner of cascade.frustumCorners) {
        const [x, y, z] = projectPoint(cascade.viewProjection, corner);
        expect(x).toBeGreaterThanOrEqual(-1.001);
        expect(x).toBeLessThanOrEqual(1.001);
        expect(y).toBeGreaterThanOrEqual(-1.001);
        expect(y).toBeLessThanOrEqual(1.001);
        expect(z).toBeGreaterThanOrEqual(-0.001);
        expect(z).toBeLessThanOrEqual(1.001);
      }
    }
  });

  it("allocates and releases both 4096-square cascade maps", async () => {
    vi.stubGlobal("GPUBufferUsage", { COPY_DST: 1, UNIFORM: 2 });
    vi.stubGlobal("GPUTextureUsage", {
      RENDER_ATTACHMENT: 4,
      TEXTURE_BINDING: 8,
    });
    const buffers: { destroy: ReturnType<typeof vi.fn> }[] = [];
    const textures: {
      createView: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    }[] = [];
    const createBuffer = vi.fn(() => {
      const buffer = { destroy: vi.fn() };
      buffers.push(buffer);
      return buffer as unknown as GPUBuffer;
    });
    const createTexture = vi.fn(() => {
      const texture = { createView: vi.fn(() => ({})), destroy: vi.fn() };
      textures.push(texture);
      return texture as unknown as GPUTexture;
    });
    const device = {
      createBindGroup: vi.fn(() => ({})),
      createBuffer,
      createPipelineLayout: vi.fn(() => ({})),
      createRenderPipelineAsync: vi.fn(async () => ({})),
      createSampler: vi.fn(() => ({})),
      createTexture,
      queue: { writeBuffer: vi.fn() },
    } as unknown as GPUDevice;

    try {
      const resources = await createBroMetalShadowResources(
        device,
        {} as GPUShaderModule,
        {} as GPUBindGroupLayout,
        new Float32Array(16),
        16 / 9,
      );

      expect(resources.cascades).toHaveLength(2);
      expect(createTexture).toHaveBeenCalledTimes(2);
      expect(createTexture).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ size: [4096, 4096] }),
      );
      expect(createTexture).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ size: [4096, 4096] }),
      );
      expect(resources.estimatedBytes).toBe(
        2 * 4096 * 4096 * 4 + 2 * 40 * 4 + 44 * 4,
      );

      resources.destroy();
      resources.destroy();
      for (const buffer of buffers) expect(buffer.destroy).toHaveBeenCalledOnce();
      for (const texture of textures) {
        expect(texture.destroy).toHaveBeenCalledOnce();
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("encodes all 103 primitives into both directional cascade passes", () => {
    const createPass = () => ({
      drawIndexed: vi.fn(),
      end: vi.fn(),
      setBindGroup: vi.fn(),
      setIndexBuffer: vi.fn(),
      setPipeline: vi.fn(),
      setVertexBuffer: vi.fn(),
    });
    const passes = [createPass(), createPass()];
    const beginRenderPass = vi
      .fn()
      .mockReturnValueOnce(passes[0])
      .mockReturnValueOnce(passes[1]);
    const map = {} as GPUTexture;
    const createCascade = () => ({
      bindGroup: {} as GPUBindGroup,
      buffer: {} as GPUBuffer,
      map,
      view: {} as GPUTextureView,
    });
    const cascades = [createCascade(), createCascade()] as const;
    const resources = {
      backPipeline: {} as GPURenderPipeline,
      cascades,
      destroy: vi.fn(),
      doublePipeline: {} as GPURenderPipeline,
      estimatedBytes: 0,
      lightingBuffer: {} as GPUBuffer,
      sampler: {} as GPUSampler,
    } satisfies BroMetalShadowResources;
    const primitive = {
      indexBuffer: {} as GPUBuffer,
      indexCount: 3,
      indexOffset: 0,
      material: {
        bindGroup: {} as GPUBindGroup,
        doubleSided: false,
      },
      normals: { buffer: {} as GPUBuffer, offset: 0 },
      positions: { buffer: {} as GPUBuffer, offset: 0 },
      tangents: { buffer: {} as GPUBuffer, offset: 0 },
      texcoords: { buffer: {} as GPUBuffer, offset: 0 },
    } satisfies BroMetalPrimitive;
    const primitives = Array.from({ length: 103 }, () => primitive);

    encodeBroMetalShadowPass(
      { beginRenderPass } as unknown as GPUCommandEncoder,
      primitives,
      resources,
    );

    expect(beginRenderPass).toHaveBeenCalledTimes(2);
    expect(passes[0].drawIndexed).toHaveBeenCalledTimes(103);
    expect(passes[1].drawIndexed).toHaveBeenCalledTimes(103);
    expect(passes[0].end).toHaveBeenCalledOnce();
    expect(passes[1].end).toHaveBeenCalledOnce();
  });

  it("counts the scene and both shadow cascades in frame telemetry", () => {
    expect(countBroMetalIndexedGeometryDraws(103)).toBe(309);
  });
});
