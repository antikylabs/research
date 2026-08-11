import { describe, expect, it } from "vitest";

import {
  createWeslBloomPlan,
  WESL_BLOOM_FACTORS,
  WESL_BLOOM_KERNEL_RADII,
  WESL_BLOOM_RADIUS,
  WESL_BLOOM_STRENGTH,
  WESL_BLOOM_THRESHOLD,
} from "../src/bloom.js";

describe("WESL five-level bloom", () => {
  it("owns the reference constants and progressive sizes", () => {
    expect(WESL_BLOOM_THRESHOLD).toBe(1);
    expect(WESL_BLOOM_STRENGTH).toBe(0.18);
    expect(WESL_BLOOM_RADIUS).toBe(0.0035);
    expect(WESL_BLOOM_FACTORS).toEqual([1, 0.8, 0.6, 0.4, 0.2]);
    expect(WESL_BLOOM_KERNEL_RADII).toEqual([6, 10, 14, 18, 22]);
    expect(createWeslBloomPlan(2560, 1440).levels).toEqual([
      { height: 720, kernelRadius: 6, width: 1280 },
      { height: 360, kernelRadius: 10, width: 640 },
      { height: 180, kernelRadius: 14, width: 320 },
      { height: 90, kernelRadius: 18, width: 160 },
      { height: 45, kernelRadius: 22, width: 80 },
    ]);
  });
});
