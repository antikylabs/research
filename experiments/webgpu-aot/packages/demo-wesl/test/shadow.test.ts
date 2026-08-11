import { describe, expect, it, vi } from "vitest";

import { createWeslFrameValues } from "../src/frame.js";
import type { WeslPipelines } from "../src/pipelines.js";
import type { WeslPrimitive } from "../src/scene.js";
import {
  createWeslShadowResources,
  encodeWeslShadowPasses,
  WESL_SHADOW_CASCADE_COUNT,
  WESL_SHADOW_RESOLUTION,
  type WeslShadowResources,
} from "../src/shadow.js";
import {
  createWeslSunLightingValues,
  createWeslSunPlan,
  WESL_CAMERA,
  WESL_SUN,
} from "../src/sun.js";

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

describe("WESL fitted directional sun", () => {
  it("owns the recovered camera, sun, cascade, fade, and bias facts", () => {
    expect(WESL_CAMERA).toMatchObject({
      far: 100,
      fieldOfViewRadians: (70 * Math.PI) / 180,
      near: 0.1,
      position: [9.3, 3.4, -0.35],
      target: [0, 2, 0],
      up: [0, 1, 0],
    });
    expect(WESL_SUN).toMatchObject({
      color: [0.2156, 0.2627, 0.3333],
      intensity: 2,
      position: [0.1, 100, 0.1],
      shadow: {
        biases: [-0.00015, -0.0003],
        cascadeCount: 2,
        lightMargin: 20,
        normalBias: 0.015,
        resolution: 4096,
      },
      target: [0, 2, 0],
    });
    expect(WESL_SHADOW_CASCADE_COUNT).toBe(2);
    expect(WESL_SHADOW_RESOLUTION).toBe(4096);

    const plan = createWeslSunPlan(16 / 9);
    expect(plan.direction).toEqual([
      expect.closeTo(0.0010204071007844963, 12),
      expect.closeTo(0.9999989587688064, 12),
      expect.closeTo(0.0010204071007844963, 12),
    ]);
    expect(plan.cameraForward).toEqual([
      expect.closeTo(-0.98817416867822, 12),
      expect.closeTo(-0.14875740173650623, 12),
      expect.closeTo(0.03718935043412656, 12),
    ]);
    expect(plan.splitNormalized).toBeCloseTo(0.2660613883008419, 12);
    expect(plan.splitDistance).toBeCloseTo(26.60613883008419, 12);
    expect(plan.fadeStartDistance).toBeCloseTo(25.72128055077705, 12);
    expect(plan.fadeEndDistance).toBeCloseTo(27.490997109391337, 12);
    expect(plan.cascades.map(({ bias }) => bias)).toEqual([
      -0.00015,
      -0.0003,
    ]);
  });

  it("rejects invalid aspects instead of producing unusable shadow matrices", () => {
    for (const aspect of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createWeslSunPlan(aspect)).toThrow(
        "WESL sun plan requires a positive finite aspect",
      );
    }
  });

  it("fits every frustum corner and joins both cascade ranges at the split", () => {
    const plan = createWeslSunPlan(2560 / 1440);
    expect(plan.cascades[0].nearDistance).toBe(WESL_CAMERA.near);
    expect(plan.cascades[0].farDistance).toBeCloseTo(plan.splitDistance, 12);
    expect(plan.cascades[1].nearDistance).toBeCloseTo(plan.splitDistance, 12);
    expect(plan.cascades[1].farDistance).toBe(WESL_CAMERA.far);
    expect(plan.cascades[0].orthographicSize).toBeCloseTo(
      77.77104691630235,
      10,
    );
    expect(plan.cascades[1].orthographicSize).toBeCloseTo(
      310.67172992647767,
      10,
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

  it("packs the exact 208-byte linked sun-lighting contract", () => {
    const plan = createWeslSunPlan(16 / 9);
    const values = createWeslSunLightingValues(plan);
    expect(values).toHaveLength(52);
    expect(values.byteLength).toBe(208);
    expect(values.slice(0, 16)).toEqual(plan.cascades[0].viewProjection);
    expect(values.slice(16, 32)).toEqual(plan.cascades[1].viewProjection);
    expect(values.slice(32, 36)).toEqual(
      new Float32Array([
        plan.splitDistance,
        plan.fadeStartDistance,
        plan.fadeEndDistance,
        100,
      ]),
    );
    expect(values.slice(36, 40)).toEqual(
      new Float32Array([-0.00015, -0.0003, 1 / 4096, 4096]),
    );
    expect(values.slice(40, 44)).toEqual(
      new Float32Array([...plan.cameraForward, 0.015]),
    );
    expect(values.slice(44, 48)).toEqual(
      new Float32Array([...plan.direction, 2]),
    );
    expect(values.slice(48, 52)).toEqual(
      new Float32Array([0.2156, 0.2627, 0.3333, 0]),
    );

    const frames = createWeslFrameValues(2560, 1440, 32);
    expect(frames.nearShadow).toHaveLength(40);
    expect(frames.farShadow).toHaveLength(40);
    expect(frames.sunLighting).toEqual(values);
    expect(frames.nearShadow.slice(0, 16)).toEqual(
      plan.cascades[0].viewProjection,
    );
    expect(frames.farShadow.slice(0, 16)).toEqual(
      plan.cascades[1].viewProjection,
    );
  });
});

function mockResourcesDevice(options: { failSecondTexture?: boolean } = {}) {
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
  const createTexture = vi.fn((_descriptor: GPUTextureDescriptor) => {
    if (options.failSecondTexture && createTexture.mock.calls.length === 2) {
      throw new Error("synthetic second texture failure");
    }
    const texture = { createView: vi.fn(() => ({})), destroy: vi.fn() };
    textures.push(texture);
    return texture as unknown as GPUTexture;
  });
  const device = {
    createBindGroup: vi.fn(() => ({})),
    createBuffer,
    createSampler: vi.fn(() => ({})),
    createTexture,
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
  return { buffers, createBuffer, createTexture, device, textures };
}

describe("WESL sun shadow resources", () => {
  it("allocates and idempotently releases two 4096 maps and three uniforms", () => {
    vi.stubGlobal("GPUBufferUsage", { COPY_DST: 1, UNIFORM: 2 });
    vi.stubGlobal("GPUTextureUsage", {
      RENDER_ATTACHMENT: 4,
      TEXTURE_BINDING: 8,
    });
    const mocks = mockResourcesDevice();
    try {
      const frames = createWeslFrameValues(2560, 1440, 32);
      const resources = createWeslShadowResources(
        mocks.device,
        { depthFrameLayout: {} } as WeslPipelines,
        "heavy",
        frames.nearShadow,
        frames.farShadow,
        frames.sunLighting,
      );

      expect(mocks.createTexture).toHaveBeenCalledTimes(2);
      for (const call of mocks.createTexture.mock.calls) {
        expect(call[0]).toEqual(
          expect.objectContaining({ size: [4096, 4096] }),
        );
      }
      expect(mocks.createBuffer).toHaveBeenCalledTimes(3);
      expect(resources.lightingBuffer).toBeDefined();
      expect(resources.estimatedBytes).toBe(
        2 * 4096 * 4096 * 4 + 2 * 160 + 208,
      );

      resources.destroy();
      resources.destroy();
      for (const buffer of mocks.buffers) {
        expect(buffer.destroy).toHaveBeenCalledOnce();
      }
      for (const texture of mocks.textures) {
        expect(texture.destroy).toHaveBeenCalledOnce();
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("releases already-created GPU allocations when construction fails", () => {
    vi.stubGlobal("GPUBufferUsage", { COPY_DST: 1, UNIFORM: 2 });
    vi.stubGlobal("GPUTextureUsage", {
      RENDER_ATTACHMENT: 4,
      TEXTURE_BINDING: 8,
    });
    const mocks = mockResourcesDevice({ failSecondTexture: true });
    try {
      const frames = createWeslFrameValues(2560, 1440, 32);
      expect(() =>
        createWeslShadowResources(
          mocks.device,
          { depthFrameLayout: {} } as WeslPipelines,
          "heavy",
          frames.nearShadow,
          frames.farShadow,
          frames.sunLighting,
        ),
      ).toThrow("synthetic second texture failure");
      expect(mocks.buffers).toHaveLength(2);
      expect(mocks.textures).toHaveLength(1);
      for (const buffer of mocks.buffers) {
        expect(buffer.destroy).toHaveBeenCalledOnce();
      }
      expect(mocks.textures[0]?.destroy).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("encodes 103 alpha-aware indexed casters into each cascade", () => {
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
      frameBuffer: {} as GPUBuffer,
      frameGroup: {} as GPUBindGroup,
      texture: {} as GPUTexture,
      view: {} as GPUTextureView,
    });
    const resources = {
      destroy: vi.fn(),
      estimatedBytes: 0,
      far: createCascade(),
      lightingBuffer: {} as GPUBuffer,
      near: createCascade(),
      sampler: {} as GPUSampler,
    } satisfies WeslShadowResources;
    const primitive = {
      indexBuffer: {} as GPUBuffer,
      indexCount: 3,
      indexOffset: 0,
      material: {
        depthBindGroup: {} as GPUBindGroup,
        doubleSided: false,
        forwardBindGroup: {} as GPUBindGroup,
      },
      normal: { buffer: {} as GPUBuffer, offset: 0 },
      position: { buffer: {} as GPUBuffer, offset: 0 },
      tangent: { buffer: {} as GPUBuffer, offset: 0 },
      texcoord: { buffer: {} as GPUBuffer, offset: 0 },
    } satisfies WeslPrimitive;
    const primitives = Array.from({ length: 103 }, () => primitive);

    encodeWeslShadowPasses(
      { beginRenderPass } as unknown as GPUCommandEncoder,
      primitives,
      resources,
      {
        shadowBack: {} as GPURenderPipeline,
        shadowDouble: {} as GPURenderPipeline,
      } as WeslPipelines,
    );

    expect(beginRenderPass).toHaveBeenCalledTimes(2);
    for (const pass of passes) {
      expect(pass.drawIndexed).toHaveBeenCalledTimes(103);
      expect(pass.setBindGroup).toHaveBeenCalledWith(
        1,
        primitive.material.depthBindGroup,
      );
      expect(pass.setVertexBuffer).toHaveBeenCalledWith(
        1,
        primitive.texcoord.buffer,
        0,
      );
      expect(pass.end).toHaveBeenCalledOnce();
    }
  });
});
