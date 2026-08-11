import { describe, expect, it } from "vitest";
import {
  createWeslAmbientSettings,
  WESL_AMBIENT_OCCLUSION_SAMPLES,
  WESL_AMBIENT_OCCLUSION_STRENGTH,
} from "../src/ambient.js";

describe("WESL controlled ambient occlusion", () => {
  it("packs the shared full-resolution sample radius and strength", () => {
    const settings = createWeslAmbientSettings(2560, 1440);

    expect(settings).toHaveLength(4);
    expect(Array.from(settings)).toEqual([2560, 1440, 4, 6]);
    expect(WESL_AMBIENT_OCCLUSION_SAMPLES).toBe(16);
    expect(WESL_AMBIENT_OCCLUSION_STRENGTH).toBe(6);
  });
});
