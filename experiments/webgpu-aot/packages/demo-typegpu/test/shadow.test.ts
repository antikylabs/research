import { describe, expect, it, vi } from "vitest";
import { mat4 } from "wgpu-matrix";

import type { TypeGpuPrimitive } from "../src/scene.js";
import {
  createTypeGpuShadowResources,
  createTypeGpuSunPlan,
  encodeTypeGpuShadowPass,
  TYPEGPU_SHADOW_CASCADE_COUNT,
  TYPEGPU_SHADOW_RESOLUTION,
  type TypeGpuShadowResources,
} from "../src/shadow.js";
import { TYPEGPU_CAMERA, TYPEGPU_SUN } from "../src/sun.js";
import { countTypeGpuIndexedGeometryDraws } from "../src/telemetry.js";

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

type ShadowConstructionOperation =
  | "bindGroup"
  | "pipeline"
  | "sampler"
  | "texture"
  | "unwrap";

function failingShadowRoot(
  failure: { readonly call: number; readonly operation: ShadowConstructionOperation },
): {
  readonly buffers: readonly { destroy: ReturnType<typeof vi.fn> }[];
  readonly root: Parameters<typeof createTypeGpuShadowResources>[0];
  readonly textures: readonly { destroy: ReturnType<typeof vi.fn> }[];
} {
  const failureError = new Error(`injected ${failure.operation} failure`);
  const calls: Record<ShadowConstructionOperation, number> = {
    bindGroup: 0,
    pipeline: 0,
    sampler: 0,
    texture: 0,
    unwrap: 0,
  };
  const failAt = (operation: ShadowConstructionOperation): void => {
    calls[operation] += 1;
    if (failure.operation === operation && failure.call === calls[operation]) {
      throw failureError;
    }
  };
  const buffers: { destroy: ReturnType<typeof vi.fn> }[] = [];
  const textures: { destroy: ReturnType<typeof vi.fn> }[] = [];
  const root = {
    createBindGroup: vi.fn(() => {
      failAt("bindGroup");
      return {};
    }),
    createRenderPipeline: vi.fn((descriptor: unknown) => {
      failAt("pipeline");
      const pipeline = { descriptor, $name: vi.fn() };
      pipeline.$name.mockReturnValue(pipeline);
      return pipeline;
    }),
    device: {
      createBuffer: vi.fn(() => {
        const buffer = { destroy: vi.fn() };
        buffers.push(buffer);
        return buffer;
      }),
      createSampler: vi.fn(() => {
        failAt("sampler");
        return {};
      }),
      createTexture: vi.fn(() => {
        failAt("texture");
        const texture = { createView: vi.fn(() => ({})), destroy: vi.fn() };
        textures.push(texture);
        return texture;
      }),
      queue: { writeBuffer: vi.fn() },
    },
    unwrap: vi.fn((resource: unknown) => {
      failAt("unwrap");
      return resource;
    }),
  } as unknown as Parameters<typeof createTypeGpuShadowResources>[0];
  return { buffers, root, textures };
}

describe("TypeGPU fitted directional sun", () => {
  it("matches the native two-cascade sunlight configuration", () => {
    expect(TYPEGPU_SHADOW_CASCADE_COUNT).toBe(2);
    expect(TYPEGPU_SHADOW_RESOLUTION).toBe(4096);
    expect(TYPEGPU_CAMERA).toMatchObject({ near: 0.1, far: 100 });
    expect(TYPEGPU_SUN).toMatchObject({
      color: [0.2156, 0.2627, 0.3333],
      intensity: 2,
      position: [0.1, 100, 0.1],
      shadow: {
        biases: [-0.00015, -0.0003],
        lightMargin: 20,
        normalBias: 0.015,
      },
      target: [0, 2, 0],
    });

    const plan = createTypeGpuSunPlan(16 / 9);
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
    expect(plan.cascades[0].orthographicSize).toBeCloseTo(77.771047, 5);
    expect(plan.cascades[1].orthographicSize).toBeCloseTo(310.67173, 5);
    expect(plan.fadeStartDistance).toBeLessThan(plan.splitDistance);
    expect(plan.fadeEndDistance).toBeGreaterThan(plan.splitDistance);
    expect(() => createTypeGpuSunPlan(0)).toThrow(
      "TypeGPU sun plan requires a positive finite aspect",
    );
  });

  it("contains all eight corners of each camera-frustum slice", () => {
    const plan = createTypeGpuSunPlan(2560 / 1440);
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

  it("allocates and idempotently releases both typed 4096-square cascades", () => {
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
    const createRenderPipeline = vi.fn((descriptor: unknown) => {
      const pipeline = { descriptor, $name: vi.fn() };
      pipeline.$name.mockReturnValue(pipeline);
      return pipeline;
    });
    const root = {
      createBindGroup: vi.fn(() => ({})),
      createRenderPipeline,
      device: {
        createBuffer,
        createSampler: vi.fn(() => ({})),
        createTexture,
        queue: { writeBuffer: vi.fn() },
      },
      unwrap: vi.fn((resource: unknown) => resource),
    } as unknown as Parameters<typeof createTypeGpuShadowResources>[0];

    try {
      const resources = createTypeGpuShadowResources(
        root,
        mat4.identity(),
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
      expect(createBuffer).toHaveBeenCalledTimes(2);
      expect(createRenderPipeline).toHaveBeenCalledTimes(2);
      expect(createRenderPipeline.mock.calls[0]?.[0]).toMatchObject({
        primitive: { cullMode: "back", frontFace: "ccw" },
        depthStencil: {
          depthCompare: "less",
          depthWriteEnabled: true,
          format: "depth32float",
        },
      });
      expect(createRenderPipeline.mock.calls[0]?.[0]).not.toHaveProperty(
        "depthStencil.depthBias",
      );
      expect(createRenderPipeline.mock.calls[1]?.[0]).toMatchObject({
        primitive: { cullMode: "none", frontFace: "ccw" },
      });
      expect(resources.estimatedBytes).toBe(
        2 * 4096 * 4096 * 4 + 2 * 32 * Float32Array.BYTES_PER_ELEMENT,
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

  it.each([
    {
      expectedBuffers: 2,
      expectedTextures: 1,
      failure: { call: 2, operation: "texture" as const },
      name: "second texture",
    },
    {
      expectedBuffers: 2,
      expectedTextures: 2,
      failure: { call: 2, operation: "bindGroup" as const },
      name: "second bind group",
    },
    {
      expectedBuffers: 2,
      expectedTextures: 2,
      failure: { call: 2, operation: "unwrap" as const },
      name: "second bind-group unwrap",
    },
    {
      expectedBuffers: 2,
      expectedTextures: 2,
      failure: { call: 2, operation: "pipeline" as const },
      name: "second typed pipeline",
    },
    {
      expectedBuffers: 2,
      expectedTextures: 2,
      failure: { call: 1, operation: "sampler" as const },
      name: "comparison sampler",
    },
  ])(
    "unwinds every owned resource exactly once after a $name failure",
    ({ expectedBuffers, expectedTextures, failure }) => {
      vi.stubGlobal("GPUBufferUsage", { COPY_DST: 1, UNIFORM: 2 });
      vi.stubGlobal("GPUTextureUsage", {
        RENDER_ATTACHMENT: 4,
        TEXTURE_BINDING: 8,
      });
      const { buffers, root, textures } = failingShadowRoot(failure);

      try {
        expect(() =>
          createTypeGpuShadowResources(root, mat4.identity(), 16 / 9),
        ).toThrow(`injected ${failure.operation} failure`);
        expect(buffers).toHaveLength(expectedBuffers);
        expect(textures).toHaveLength(expectedTextures);
        for (const buffer of buffers) {
          expect(buffer.destroy).toHaveBeenCalledOnce();
        }
        for (const texture of textures) {
          expect(texture.destroy).toHaveBeenCalledOnce();
        }
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("encodes 103 material-sided draws into each cascade", () => {
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
    const createCascade = () => ({
      bindGroup: {} as GPUBindGroup,
      buffer: {} as GPUBuffer,
      map: {} as GPUTexture,
      view: {} as GPUTextureView,
    });
    const resources = {
      backPipeline: {} as GPURenderPipeline,
      cascades: [createCascade(), createCascade()],
      destroy: vi.fn(),
      doublePipeline: {} as GPURenderPipeline,
      estimatedBytes: 0,
      plan: createTypeGpuSunPlan(16 / 9),
      sampler: {} as GPUSampler,
    } satisfies TypeGpuShadowResources;
    const primitive = (doubleSided: boolean) => ({
      indexBuffer: {} as GPUBuffer,
      indexCount: 3,
      indexOffset: 0,
      material: { bindGroup: {} as never, doubleSided },
      normal: { buffer: {} as GPUBuffer },
      position: { buffer: {} as GPUBuffer },
      texcoord: { buffer: {} as GPUBuffer },
    }) satisfies TypeGpuPrimitive;
    const primitives = Array.from({ length: 103 }, (_, index) =>
      primitive(index >= 89),
    );

    encodeTypeGpuShadowPass(
      { beginRenderPass } as unknown as GPUCommandEncoder,
      primitives,
      resources,
    );

    expect(beginRenderPass).toHaveBeenCalledTimes(2);
    for (const pass of passes) {
      expect(pass.drawIndexed).toHaveBeenCalledTimes(103);
      expect(pass.end).toHaveBeenCalledOnce();
      expect(pass.setPipeline).toHaveBeenCalledWith(resources.backPipeline);
      expect(pass.setPipeline).toHaveBeenCalledWith(resources.doublePipeline);
    }
  });

  it("counts the forward scene and both shadow cascades", () => {
    expect(countTypeGpuIndexedGeometryDraws(103)).toBe(309);
  });
});
