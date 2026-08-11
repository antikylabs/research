import { describe, expect, it } from "vitest";

import { createTypeGpuBloomPlan } from "../src/bloom-plan.js";
import {
  TYPEGPU_BLOOM_BLUR_PASSES,
  TYPEGPU_BLOOM_KERNEL_RADII,
  TYPEGPU_BLOOM_LEVEL_COUNT,
} from "../src/shaders/bloom.js";

describe("TypeGPU multiresolution bloom plan", () => {
  it("builds a bright pass and paired horizontal/vertical stages across five levels", () => {
    const plan = createTypeGpuBloomPlan(2560, 1440);

    expect(TYPEGPU_BLOOM_LEVEL_COUNT).toBe(5);
    expect(TYPEGPU_BLOOM_BLUR_PASSES).toBe(10);
    expect(plan.levels.map(({ width, height }) => [width, height])).toEqual([
      [2560, 1440],
      [1280, 720],
      [640, 360],
      [320, 180],
      [160, 90],
    ]);
    expect(plan.stages).toHaveLength(11);
    expect(plan.stages[0]).toMatchObject({
      kind: "extract",
      source: "hdr",
      target: "bright",
    });
    expect(plan.stages.slice(1).map(({ kind, level }) => [kind, level])).toEqual(
      Array.from({ length: TYPEGPU_BLOOM_LEVEL_COUNT }, (_, level) => [
        ["horizontal", level],
        ["vertical", level],
      ]).flat(),
    );
    expect(plan.stages[3]).toMatchObject({
      kind: "horizontal",
      level: 1,
      source: "vertical-0",
      target: "horizontal-1",
    });
    expect(
      plan.stages
        .filter(({ kind }) => kind === "horizontal")
        .map(({ settings }) => settings[2]),
    ).toEqual(TYPEGPU_BLOOM_KERNEL_RADII);
  });

  it("keeps every level nonzero for smaller workload profiles", () => {
    const plan = createTypeGpuBloomPlan(320, 180);
    expect(plan.levels.at(-1)).toMatchObject({ width: 20, height: 12 });
    expect(plan.textureBytes).toBeGreaterThan(0);
  });
});
