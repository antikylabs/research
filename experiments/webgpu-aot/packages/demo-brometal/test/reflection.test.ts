import { describe, expect, it } from "vitest";

import { brometalShaders } from "../src/generated/pipeline.generated.js";
import {
  applyBroMetalReflectionHitTransfer,
  BROMETAL_REFLECTION_HIT_TRANSFER,
  BROMETAL_REFLECTION_MARCH,
  createBroMetalReflectionPlan,
} from "../src/reflections.js";

describe("BroMetal roughness-aware reflection reconstruction", () => {
  it("plans a raw trace, five direct-from-raw mips, and a selected scene", () => {
    const plan = createBroMetalReflectionPlan(2560, 1440);

    expect(plan.mips.map(({ height, level, spread, width }) => ({
      height,
      level,
      spread,
      width,
    }))).toEqual([
      { height: 1440, level: 0, spread: 0, width: 2560 },
      { height: 720, level: 1, spread: 1, width: 1280 },
      { height: 360, level: 2, spread: 2, width: 640 },
      { height: 180, level: 3, spread: 3, width: 320 },
      { height: 90, level: 4, spread: 4, width: 160 },
    ]);
    expect(plan.textureBytes).toBe(98_265_600);
    expect(plan.passCount).toBe(7);
  });

  it("generates the direct raw 7x7 pyramid and roughness-squared selector", () => {
    expect(brometalShaders.reflection).toContain("return vec4f(reflection, 1.0)");
    expect(brometalShaders.reflectionReconstruct).toContain(
      "for (var offsetY = -3; offsetY <= 3; offsetY += 1)",
    );
    expect(brometalShaders.reflectionReconstruct).toContain(
      "textureSampleLevel(rawReflection, reconstructionSampler",
    );
    expect(brometalShaders.reflectionReconstruct).toContain("color / 49.0");
    expect(brometalShaders.reflectionSelect).toContain(
      "clamp(roughness * roughness * 4.0, 0.0, 4.0)",
    );
    expect(brometalShaders.reflectionSelect).toContain(
      "textureSampleLevel(reflectionPyramid, reflectionSampler",
    );
  });

  it("uses metallic distance grazing and bounded luminance for raw hits", () => {
    expect(BROMETAL_REFLECTION_HIT_TRANSFER).toEqual({
      intensity: 0.7,
      luminanceWeights: [0.2126, 0.7152, 0.0722],
      maxDistance: 100,
      maxLuminance: 10,
    });
    const dimHit = applyBroMetalReflectionHitTransfer({
      hitColor: [0.1, 0.05, 0.02],
      incidentDotReflected: 1,
      metallic: 1,
      planeDistance: 50,
    });
    expect(dimHit[0]).toBeCloseTo(0.0175, 12);
    expect(dimHit[1]).toBeCloseTo(0.00875, 12);
    expect(dimHit[2]).toBeCloseTo(0.0035, 12);
    const cappedHit = applyBroMetalReflectionHitTransfer({
      hitColor: [20, 20, 20],
      incidentDotReflected: 1,
      metallic: 1,
      planeDistance: 0,
    });
    for (const channel of cappedHit) expect(channel).toBeCloseTo(7, 12);
    expect(brometalShaders.reflection).toContain("fn broMetalReflectionHitTransfer(");
    expect(brometalShaders.reflection).not.toContain("confidence");
    expect(brometalShaders.reflection).not.toContain("1.0 - roughness * 0.72");
  });

  it("uses the shared fixed-budget reflection march", () => {
    expect(BROMETAL_REFLECTION_MARCH).toEqual({
      initialTravel: 0.16,
      stepBase: 0.1,
      stepCount: 24,
      stepGrowth: 0.024,
      thicknessBase: 0.11,
      thicknessGrowth: 0.028,
    });
    const reflection = brometalShaders.reflection;
    expect(reflection).toContain("for (var step = 0; step < 24; step += 1)");
    expect(reflection).toMatch(/travel \+= 0\.1 \+\s+f32\(step\) \* 0\.024/);
    expect(reflection).toMatch(/crossing <= 0\.11 \+\s+travel \* 0\.028/);
    expect(reflection).toContain("distance(frame.cameraPosition.xyz, samplePosition)");
    expect(reflection).not.toContain("dominantPixels");
    expect(reflection).not.toContain("for (var refine");
  });
});
