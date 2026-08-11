import { describe, expect, it } from "vitest";

import {
  createWeslTemporalSettings,
  weslTemporalHistoryIndices,
  weslTemporalJitter,
  writeWeslTemporalFrame,
} from "../src/temporal.js";

describe("WESL temporal resolve", () => {
  it("owns the exact 31-sample Halton cycle and ping-pong plan", () => {
    const frame0 = weslTemporalJitter(0, 2560, 1440);
    const frame1 = weslTemporalJitter(1, 2560, 1440);
    expect(frame0[0]).toBe(0);
    expect(frame0[1]).toBeCloseTo(-1 / 4320, 15);
    expect(frame1[0]).toBeCloseTo(1 / 5120, 15);
    expect(frame1[1]).toBeCloseTo(1 / 4320, 15);
    expect(weslTemporalJitter(31, 2560, 1440)).toEqual(
      weslTemporalJitter(0, 2560, 1440),
    );
    expect(weslTemporalHistoryIndices(0)).toEqual([0, 1]);
    expect(weslTemporalHistoryIndices(1)).toEqual([1, 0]);
  });

  it("jitter writes from the immutable base and marks history after frame zero", () => {
    const base = new Float32Array(16);
    base[0] = 2;
    base[5] = 3;
    base[11] = -1;
    const frame = new Float32Array(40);
    writeWeslTemporalFrame(frame, base, 2560, 1440, 1);
    const first = Array.from(frame.slice(0, 16));
    writeWeslTemporalFrame(frame, base, 2560, 1440, 1);
    expect(Array.from(frame.slice(0, 16))).toEqual(first);
    expect(Array.from(createWeslTemporalSettings(2560, 1440, 0))).toEqual([
      2560, 1440, 0, 0,
    ]);
    expect(Array.from(createWeslTemporalSettings(2560, 1440, 1))).toEqual([
      2560, 1440, 1, 1,
    ]);
  });
});
