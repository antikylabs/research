import { describe, expect, it, vi } from "vitest";

import { createFrameValues } from "../src/frame.js";
import { encodeAntikyShadowPass } from "../src/passes.js";
import type { AntikyPrimitive } from "../src/scene.js";
import {
  ANTIKY_CAMERA,
  ANTIKY_SHADOW_CASCADE_COUNT,
  ANTIKY_SHADOW_RESOLUTION,
  ANTIKY_SUN,
  createAntikySunPlan,
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

function primitive(doubleSided: boolean): AntikyPrimitive {
  return {
    indexBuffer: {} as GPUBuffer,
    indexCount: 3,
    indexOffset: 0,
    material: { doubleSided },
    position: { buffer: {} as GPUBuffer, offset: 0 },
  } as AntikyPrimitive;
}

describe("TypeGPU-Antiky fitted directional sun", () => {
  it("owns the recovered camera, light, split, and receiver-bias facts", () => {
    expect(ANTIKY_SHADOW_CASCADE_COUNT).toBe(2);
    expect(ANTIKY_SHADOW_RESOLUTION).toBe(4096);
    expect(ANTIKY_CAMERA).toMatchObject({ near: 0.1, far: 100 });
    expect(ANTIKY_SUN).toMatchObject({
      color: [0.2156, 0.2627, 0.3333],
      intensity: 2,
      position: [0.1, 100, 0.1],
      shadow: {
        biases: [-0.00015, -0.0003],
        normalBias: 0.015,
        resolution: 4096,
      },
      target: [0, 2, 0],
    });

    const plan = createAntikySunPlan(16 / 9);
    expect(plan.cascades).toHaveLength(2);
    expect(plan.splitNormalized).toBeCloseTo(0.266061, 6);
    expect(plan.splitDistance).toBeCloseTo(26.606139, 5);
    expect(plan.fadeStartDistance).toBeCloseTo(25.721281, 5);
    expect(plan.fadeEndDistance).toBeCloseTo(27.490997, 5);
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

    expect(() => createAntikySunPlan(0)).toThrow(
      "Antiky sun plan requires a positive finite aspect",
    );
    expect(() => createAntikySunPlan(16 / 9, 0)).toThrow(
      "Antiky sun plan requires a positive integer resolution",
    );
  });

  it("fits both camera-frustum slices and packs those exact matrices", () => {
    const plan = createAntikySunPlan(2560 / 1440);
    expect(plan.cascades[0].farDistance).toBeCloseTo(plan.splitDistance, 5);
    expect(plan.cascades[1].nearDistance).toBeCloseTo(plan.splitDistance, 5);

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

    const values = createFrameValues(2560, 1440, 32);
    expect(Array.from(values.forward.slice(32, 48))).toEqual(
      Array.from(plan.cascades[0].viewProjection),
    );
    expect(Array.from(values.forward.slice(48, 64))).toEqual(
      Array.from(plan.cascades[1].viewProjection),
    );
    expect(Array.from(values.nearShadow.slice(0, 16))).toEqual(
      Array.from(plan.cascades[0].viewProjection),
    );
    expect(Array.from(values.farShadow.slice(0, 16))).toEqual(
      Array.from(plan.cascades[1].viewProjection),
    );
  });

  it("selects back-cull and no-cull pipelines without ending the pass", () => {
    const backPipeline = {} as GPURenderPipeline;
    const doublePipeline = {} as GPURenderPipeline;
    const pass = {
      drawIndexed: vi.fn(),
      end: vi.fn(),
      setBindGroup: vi.fn(),
      setIndexBuffer: vi.fn(),
      setPipeline: vi.fn(),
      setVertexBuffer: vi.fn(),
    };

    encodeAntikyShadowPass(
      pass as unknown as GPURenderPassEncoder,
      backPipeline,
      doublePipeline,
      {} as GPUBindGroup,
      [primitive(false), primitive(true), primitive(false)],
    );

    expect(pass.setPipeline.mock.calls).toEqual([
      [backPipeline],
      [doublePipeline],
      [backPipeline],
    ]);
    expect(pass.drawIndexed).toHaveBeenCalledTimes(3);
    expect(pass.end).not.toHaveBeenCalled();
  });
});
