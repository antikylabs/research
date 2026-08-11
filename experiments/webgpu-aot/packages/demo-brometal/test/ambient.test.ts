import { describe, expect, it } from "vitest";

import {
  BROMETAL_AMBIENT_OCCLUSION_SAMPLES,
  BROMETAL_AMBIENT_OCCLUSION_STRENGTH,
  createBroMetalAmbientPlan,
  createBroMetalAmbientSettings,
} from "../src/ambient.js";
import { brometalShaders } from "../src/generated/pipeline.generated.js";

describe("BroMetal controlled ambient occlusion", () => {
  it("owns the shared full-resolution ambient field", () => {
    expect(createBroMetalAmbientPlan(2560, 1440)).toEqual({
      estimatedBytes: 3_686_400,
      format: "r8unorm",
      height: 1440,
      label: "BroMetal full-resolution ambient occlusion",
      width: 2560,
    });
    expect(() => createBroMetalAmbientPlan(0, 1440)).toThrow(RangeError);
    expect(BROMETAL_AMBIENT_OCCLUSION_SAMPLES).toBe(16);
    expect(BROMETAL_AMBIENT_OCCLUSION_STRENGTH).toBe(6);
    const settings = createBroMetalAmbientSettings(2560, 1440);
    expect(Array.from(settings)).toEqual([2560, 1440, 4, 6]);
  });

  it("uses the shared 16-sample kernel and feeds it into temporal resolve", () => {
    const lighting = brometalShaders.lighting;
    expect(lighting).toContain("@location(1) ambient: vec4f");
    expect(lighting).toContain("for (var sampleIndex = 0; sampleIndex < 16");
    expect(lighting).toContain("centerDepth - sampleDepth");
    expect(lighting).toContain("0.7 + normalCrease * 0.3");
    expect(lighting).toContain(
      "environmentBrdf(normal, view, albedo, metallic, roughness, 1.0)",
    );
    expect(lighting).not.toContain("ambientHorizonContribution");
    expect(brometalShaders.temporal).toContain("var ambient: texture_2d<f32>");
    expect(brometalShaders.temporal).toContain("textureLoad(ambient, pixel, 0).r");
  });
});
