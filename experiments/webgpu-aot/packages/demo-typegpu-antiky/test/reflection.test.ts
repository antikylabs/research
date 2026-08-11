import { describe, expect, it } from "vitest";

import {
  ANTIKY_REFLECTION_HIT_TRANSFER,
  applyAntikyReflectionHitTransfer,
} from "../src/reflection.js";

function expectColorClose(
  actual: readonly [number, number, number],
  expected: readonly [number, number, number],
): void {
  for (let channel = 0; channel < expected.length; channel += 1) {
    expect(actual[channel]).toBeCloseTo(expected[channel]!, 10);
  }
}

describe("TypeGPU-Antiky raw reflection hit transfer", () => {
  it("uses the pinned mirror distance, luminance, and intensity contract", () => {
    expect(ANTIKY_REFLECTION_HIT_TRANSFER).toEqual({
      intensity: 0.7,
      luminanceWeights: [0.2126, 0.7152, 0.0722],
      maxDistance: 100,
      maxLuminance: 10,
    });
  });

  it("preserves dim hit radiance and applies metallic, distance, and grazing", () => {
    expectColorClose(
      applyAntikyReflectionHitTransfer({
        hitColor: [0.1, 0.05, 0.02],
        incidentDotReflected: 1,
        metallic: 1,
        planeDistance: 0,
      }),
      [0.07, 0.035, 0.014],
    );
    expectColorClose(
      applyAntikyReflectionHitTransfer({
        hitColor: [0.1, 0.05, 0.02],
        incidentDotReflected: 1,
        metallic: 1,
        planeDistance: 50,
      }),
      [0.0175, 0.00875, 0.0035],
    );
  });

  it("rejects zero-metal and opposite-grazing energy without a source threshold", () => {
    expectColorClose(
      applyAntikyReflectionHitTransfer({
        hitColor: [1, 2, 3],
        incidentDotReflected: 1,
        metallic: 0,
        planeDistance: 0,
      }),
      [0, 0, 0],
    );
    expectColorClose(
      applyAntikyReflectionHitTransfer({
        hitColor: [1, 2, 3],
        incidentDotReflected: -1,
        metallic: 1,
        planeDistance: 0,
      }),
      [0, 0, 0],
    );
  });

  it("caps weighted luminance before applying reflection intensity", () => {
    expectColorClose(
      applyAntikyReflectionHitTransfer({
        hitColor: [20, 20, 20],
        incidentDotReflected: 1,
        metallic: 1,
        planeDistance: 0,
      }),
      [7, 7, 7],
    );
  });
});
