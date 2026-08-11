import { describe, expect, it } from "vitest";

import {
  createWeslReflectionPlan,
  createWeslReflectionSettings,
} from "../src/reflection.js";

describe("WESL reflection reconstruction pyramid", () => {
  it("owns five direct-from-raw mip stages and roughness selection", () => {
    const plan = createWeslReflectionPlan(2560, 1440);
    expect(plan.levels).toEqual([
      { level: 0, width: 2560, height: 1440, spread: 0 },
      { level: 1, width: 1280, height: 720, spread: 1 },
      { level: 2, width: 640, height: 360, spread: 2 },
      { level: 3, width: 320, height: 180, spread: 3 },
      { level: 4, width: 160, height: 90, spread: 4 },
    ]);
    expect(plan.mipLevelCount).toBe(5);
    expect(plan.textureBytes).toBe(39_283_200);
  });

  it("packs the full-resolution texel and exact per-level spread", () => {
    expect(Array.from(createWeslReflectionSettings(2560, 1440, 0))).toEqual([
      1 / 2560,
      1 / 1440,
      0,
      0,
    ].map((value) => Math.fround(value)));
    expect(Array.from(createWeslReflectionSettings(2560, 1440, 4))).toEqual([
      1 / 2560,
      1 / 1440,
      4,
      0,
    ].map((value) => Math.fround(value)));
  });
});
