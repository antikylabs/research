import { describe, expect, it } from "vitest";

import {
  ANTIKY_BLOOM_BLUR_PASSES,
  ANTIKY_BLOOM_KERNEL_RADII,
  ANTIKY_BLOOM_LEVEL_COUNT,
  ANTIKY_BLOOM_WEIGHTS,
  createAntikyBloomPlan,
} from "../src/bloom.js";

describe("TypeGPU-Antiky multiscale bloom plan", () => {
  it("owns the reference five-level filter and composite weights", () => {
    expect(ANTIKY_BLOOM_LEVEL_COUNT).toBe(5);
    expect(ANTIKY_BLOOM_BLUR_PASSES).toBe(10);
    expect(ANTIKY_BLOOM_KERNEL_RADII).toEqual([6, 10, 14, 18, 22]);
    expect(ANTIKY_BLOOM_WEIGHTS).toEqual([
      0.179496,
      0.143748,
      0.108,
      0.072252,
      0.036504,
    ]);
  });

  it("plans one extraction and ten progressive blur passes", () => {
    const plan = createAntikyBloomPlan(2560, 1440);
    expect(plan.levels).toEqual([
      { height: 1440, level: 0, width: 2560 },
      { height: 720, level: 1, width: 1280 },
      { height: 360, level: 2, width: 640 },
      { height: 180, level: 3, width: 320 },
      { height: 90, level: 4, width: 160 },
    ]);
    expect(plan.stages).toHaveLength(1 + ANTIKY_BLOOM_BLUR_PASSES);
    expect(plan.stages[0]).toMatchObject({
      kind: "extract",
      level: null,
      source: "temporal",
      target: "bright",
    });
    expect(plan.stages[0]!.settings).toEqual(
      new Float32Array([1 / 2560, 1 / 1440, 0, 0]),
    );

    for (const level of plan.levels) {
      const horizontal = plan.stages[level.level * 2 + 1]!;
      const vertical = plan.stages[level.level * 2 + 2]!;
      expect(horizontal).toMatchObject({
        kind: "horizontal",
        level: level.level,
        source:
          level.level === 0 ? "bright" : `vertical-${level.level - 1}`,
        target: `horizontal-${level.level}`,
      });
      expect(vertical).toMatchObject({
        kind: "vertical",
        level: level.level,
        source: `horizontal-${level.level}`,
        target: `vertical-${level.level}`,
      });
      expect(horizontal.settings).toEqual(
        new Float32Array([
          1 / level.width,
          1 / level.height,
          ANTIKY_BLOOM_KERNEL_RADII[level.level]!,
          0,
        ]),
      );
      expect(vertical.settings).toEqual(
        new Float32Array([
          1 / level.width,
          1 / level.height,
          0,
          ANTIKY_BLOOM_KERNEL_RADII[level.level]!,
        ]),
      );
    }

    const expectedBytes =
      2560 * 1440 * 8 +
      plan.levels.reduce(
        (bytes, level) => bytes + level.width * level.height * 8 * 2,
        0,
      );
    expect(plan.textureBytes).toBe(expectedBytes);
  });

  it("rejects invalid target dimensions", () => {
    expect(() => createAntikyBloomPlan(0, 1440)).toThrow(
      "Antiky bloom requires positive integer dimensions",
    );
    expect(() => createAntikyBloomPlan(2560, 1.5)).toThrow(
      "Antiky bloom requires positive integer dimensions",
    );
  });
});
