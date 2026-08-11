import { describe, expect, it } from "vitest";

import {
  BROMETAL_BLOOM_FACTORS,
  BROMETAL_BLOOM_KERNEL_RADII,
  BROMETAL_BLOOM_RADIUS,
  BROMETAL_BLOOM_STRENGTH,
  BROMETAL_BLOOM_THRESHOLD,
  createBroMetalBloomPlan,
} from "../src/bloom.js";

describe("BroMetal five-level bloom", () => {
  it("owns the reference constants and five mip sizes", () => {
    expect(BROMETAL_BLOOM_THRESHOLD).toBe(1);
    expect(BROMETAL_BLOOM_STRENGTH).toBe(0.18);
    expect(BROMETAL_BLOOM_RADIUS).toBe(0.0035);
    expect(BROMETAL_BLOOM_KERNEL_RADII).toEqual([6, 10, 14, 18, 22]);
    expect(BROMETAL_BLOOM_FACTORS).toEqual([1, 0.8, 0.6, 0.4, 0.2]);
    expect(createBroMetalBloomPlan(2560, 1440).levels).toEqual([
      { height: 720, kernelRadius: 6, width: 1280 },
      { height: 360, kernelRadius: 10, width: 640 },
      { height: 180, kernelRadius: 14, width: 320 },
      { height: 90, kernelRadius: 18, width: 160 },
      { height: 45, kernelRadius: 22, width: 80 },
    ]);
  });

  it("computes the exact radius-adjusted composite factors", () => {
    expect(createBroMetalBloomPlan(2560, 1440).compositeFactors).toEqual(
      BROMETAL_BLOOM_FACTORS.map((factor) =>
        (1 - BROMETAL_BLOOM_RADIUS) * factor +
        BROMETAL_BLOOM_RADIUS * (1.2 - factor),
      ),
    );
  });
});
