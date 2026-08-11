import { describe, expect, it } from "vitest";

import tgpu, { common } from "typegpu";
import {
  createTypeGpuReflectionPlan,
  TYPEGPU_REFLECTION_FILTER_RADIUS,
  TYPEGPU_REFLECTION_MIP_COUNT,
} from "../src/reflections.js";
import {
  reflectionReconstructFragment,
  reflectionSelectFragment,
} from "../src/shaders/reflection-reconstruct.js";

describe("TypeGPU roughness-aware reflection reconstruction", () => {
  it("plans the BroMetal raw, five-mip, and selected topology", () => {
    const plan = createTypeGpuReflectionPlan(2560, 1440);
    expect(TYPEGPU_REFLECTION_MIP_COUNT).toBe(5);
    expect(TYPEGPU_REFLECTION_FILTER_RADIUS).toBe(3);
    expect(plan.levels.map(({ height, level, spread, width }) => ({
      height,
      level,
      spread,
      width,
    }))).toEqual([
      { height: 1440, level: 0, spread: 0, width: 2560 },
      { height: 720, level: 1, spread: 1, width: 1280 },
      { height: 360, level: 2, spread: 2, width: 640 },
      { height: 180, level: 3, spread: 3, width: 320 },
      { height: 90, level: 4, spread: 4, width: 160 },
    ]);
    expect(plan.passCount).toBe(7);
    expect(plan.textureBytes).toBe(98_265_600);
    expect(Array.from(plan.levels[4]!.settings)).toEqual(
      Array.from(new Float32Array([1 / 2560, 1 / 1440, 4, 0])),
    );
  });

  it("resolves direct-from-raw 7x7 reconstruction and roughness selection", () => {
    const reconstruct = tgpu.resolve(
      [common.fullScreenTriangle, reflectionReconstructFragment],
      { names: "strict" },
    );
    const select = tgpu.resolve(
      [common.fullScreenTriangle, reflectionSelectFragment],
      { names: "strict" },
    );
    expect(reconstruct).toMatch(/offsetX <= 3i/);
    expect(reconstruct).toMatch(/offsetY <= 3i/);
    expect(reconstruct).toMatch(/\/ 49f/);
    expect(select).toMatch(/roughness \* roughness/);
    expect(select).toMatch(/textureSampleLevel/);
  });
});
