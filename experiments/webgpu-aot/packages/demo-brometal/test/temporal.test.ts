import { describe, expect, it } from "vitest";

import { brometalShaders } from "../src/generated/pipeline.generated.js";
import {
  BROMETAL_TEMPORAL_JITTER_COUNT,
  broMetalTemporalHistoryIndices,
  broMetalTemporalJitter,
  createBroMetalTemporalSettings,
  writeBroMetalTemporalFrame,
} from "../src/temporal.js";

describe("BroMetal temporal resolve", () => {
  it("owns the executed 31-sample Halton cycle", () => {
    expect(BROMETAL_TEMPORAL_JITTER_COUNT).toBe(31);
    expect(broMetalTemporalJitter(0, 2560, 1440)).toEqual([
      0,
      expect.closeTo(-1 / (3 * 1440), 10),
    ]);
    expect(broMetalTemporalJitter(1, 2560, 1440)).toEqual([
      expect.closeTo(1 / (2 * 2560), 10),
      expect.closeTo(1 / (3 * 1440), 10),
    ]);
    expect(broMetalTemporalJitter(31, 2560, 1440)).toEqual(
      broMetalTemporalJitter(0, 2560, 1440),
    );
  });

  it("rebuilds jitter from an immutable matrix and alternates histories", () => {
    const base = new Float32Array([
      1, 0, 0, 0, 0, 1, 0, 0,
      0, 0, 1, 0, 0, 0, 0, 1,
    ]);
    const frame = new Float32Array(40);
    writeBroMetalTemporalFrame(frame, base, 2560, 1440, 1);
    expect(frame[12]).toBeCloseTo(1 / (2 * 2560), 10);
    expect(frame[13]).toBeCloseTo(1 / (3 * 1440), 10);
    expect(broMetalTemporalHistoryIndices(12)).toEqual([0, 1]);
    expect(broMetalTemporalHistoryIndices(13)).toEqual([1, 0]);
    expect(createBroMetalTemporalSettings(2560, 1440, 0)).toEqual(
      new Float32Array([2560, 1440, 0, 0]),
    );
  });

  it("generates variance-clipped luminance-weighted temporal WGSL", () => {
    expect(brometalShaders.temporal).toContain("fn temporalClipAabb(");
    expect(brometalShaders.temporal).toContain("currentWeight = 0.05");
    expect(brometalShaders.temporal).toContain("firstMoment / 9.0");
    expect(brometalShaders.temporal).toContain("secondMoment / 9.0");
    expect(brometalShaders.composite).not.toContain("var color = fxaaHdr(input.uv)");
    expect(brometalShaders.composite).toMatch(
      /textureSampleLevel\(\s*hdrTexture,\s*bloomSampler,\s*input\.uv,\s*0\.0,\s*\)\.rgb/,
    );
  });
});
