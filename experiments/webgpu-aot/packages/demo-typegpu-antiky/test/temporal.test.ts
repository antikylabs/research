import { describe, expect, it } from "vitest";

import {
  ANTIKY_TEMPORAL_JITTER_COUNT,
  antikyTemporalHistoryIndices,
  antikyTemporalJitter,
  createAntikyTemporalSettings,
  writeAntikyTemporalFrame,
} from "../src/temporal.js";

describe("TypeGPU-Antiky temporal sampling plan", () => {
  it("owns Three's executed 31-sample Halton cycle", () => {
    expect(ANTIKY_TEMPORAL_JITTER_COUNT).toBe(31);
    expect(antikyTemporalJitter(0, 2560, 1440)).toEqual([
      0,
      expect.closeTo(-1 / (3 * 1440), 10),
    ]);
    expect(antikyTemporalJitter(1, 2560, 1440)).toEqual([
      expect.closeTo(1 / (2 * 2560), 10),
      expect.closeTo(1 / (3 * 1440), 10),
    ]);
    expect(antikyTemporalJitter(2, 2560, 1440)).toEqual([
      expect.closeTo(-1 / (2 * 2560), 10),
      expect.closeTo(-7 / (9 * 1440), 10),
    ]);
    expect(antikyTemporalJitter(31, 2560, 1440)).toEqual(
      antikyTemporalJitter(0, 2560, 1440),
    );
  });

  it("rebuilds jitter from one immutable view-projection without accumulation", () => {
    const base = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
    const frame = new Float32Array(72);
    frame.set(base);
    writeAntikyTemporalFrame(frame, base, 2560, 1440, 1);
    expect(frame[12]).toBeCloseTo(1 / (2 * 2560), 10);
    expect(frame[13]).toBeCloseTo(1 / (3 * 1440), 10);

    writeAntikyTemporalFrame(frame, base, 2560, 1440, 2);
    const second = frame.slice(0, 16);
    expect(second[12]).toBeCloseTo(-1 / (2 * 2560), 10);
    expect(second[13]).toBeCloseTo(-7 / (9 * 1440), 10);
    writeAntikyTemporalFrame(frame, base, 2560, 1440, 2);
    expect(frame.slice(0, 16)).toEqual(second);

    const nontrivial = new Float32Array([
      1, 2, 3, 4,
      5, 6, 7, 8,
      9, 10, 11, 12,
      13, 14, 15, 16,
    ]);
    const [jitterX, jitterY] = antikyTemporalJitter(12, 2560, 1440);
    writeAntikyTemporalFrame(frame, nontrivial, 2560, 1440, 12);
    for (let column = 0; column < 4; column += 1) {
      const offset = column * 4;
      expect(frame[offset]).toBeCloseTo(
        nontrivial[offset]! + jitterX * nontrivial[offset + 3]!,
        6,
      );
      expect(frame[offset + 1]).toBeCloseTo(
        nontrivial[offset + 1]! + jitterY * nontrivial[offset + 3]!,
        6,
      );
      expect(frame[offset + 2]).toBe(nontrivial[offset + 2]);
      expect(frame[offset + 3]).toBe(nontrivial[offset + 3]);
    }
  });

  it("packs dimensions and deterministic history validity separately", () => {
    expect(createAntikyTemporalSettings(2560, 1440, 0)).toEqual(
      new Float32Array([2560, 1440, 0, 0]),
    );
    expect(createAntikyTemporalSettings(2560, 1440, 12)).toEqual(
      new Float32Array([2560, 1440, 1, 12]),
    );
  });

  it("keeps sampled and written history textures distinct", () => {
    expect(antikyTemporalHistoryIndices(0)).toEqual([0, 1]);
    expect(antikyTemporalHistoryIndices(1)).toEqual([1, 0]);
    expect(antikyTemporalHistoryIndices(12)).toEqual([0, 1]);
    expect(antikyTemporalHistoryIndices(13)).toEqual([1, 0]);
  });

  it("rejects invalid temporal frame inputs", () => {
    expect(() => antikyTemporalJitter(-1, 2560, 1440)).toThrow(
      "Antiky temporal frame index must be a non-negative integer",
    );
    expect(() => antikyTemporalJitter(0, 0, 1440)).toThrow(
      "Antiky temporal dimensions must be positive integers",
    );
    expect(() =>
      writeAntikyTemporalFrame(
        new Float32Array(71),
        new Float32Array(16),
        2560,
        1440,
        0,
      ),
    ).toThrow("Antiky forward frame requires 72 floats");
  });
});
