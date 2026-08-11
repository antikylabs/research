import { describe, expect, it } from "vitest";

import { shader as reconstructShader } from "../src/generated/reflection-reconstruct.generated.js";
import { shader as selectShader } from "../src/generated/reflection-select.generated.js";
import {
  ANTIKY_RAW_REFLECTION_PASS_LABEL,
  createAntikyReflectionPlan,
  createAntikyReflectionTextureDescriptors,
  createAntikyReflectionViews,
} from "../src/reflections.js";

describe("Antiky roughness-aware reflection reconstruction", () => {
  it("plans the same raw, five-mip, and selection topology as BroMetal", () => {
    const plan = createAntikyReflectionPlan(2560, 1440);
    expect(plan.levels.map(({ height, level, spread, width }) => ({
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
    expect(plan.mipLevelCount).toBe(5);
    expect(plan.passCount).toBe(7);
    expect(plan.textureBytes).toBe(98_265_600);
    expect(Array.from(plan.levels[3]!.settings)).toEqual(
      Array.from(new Float32Array([1 / 2560, 1 / 1440, 3, 0])),
    );
  });

  it("bakes direct-from-raw 7x7 mips and roughness-squared selection", () => {
    expect(reconstructShader.wgsl).toContain("offsetY <= 3i");
    expect(reconstructShader.wgsl).toContain("offsetX <= 3i");
    expect(reconstructShader.wgsl).toContain("color / 49f");
    expect(reconstructShader.bindGroups[0]?.entries.map(({ name }) => name)).toEqual([
      "rawReflection",
      "sampler",
      "settings",
    ]);
    expect(selectShader.wgsl).toMatch(/roughness \* roughness/);
    expect(selectShader.wgsl).toMatch(/roughness \* roughness\) \* 4f/);
    expect(selectShader.wgsl).toContain("textureSampleLevel(");
    expect(selectShader.bindGroups[0]?.entries.map(({ name }) => name)).toEqual([
      "reflection",
      "surface",
      "sampler",
    ]);
  });

  it("makes every reflection subresource count explicit for capture proof", () => {
    const descriptors = createAntikyReflectionTextureDescriptors(2560, 1440);
    expect(descriptors.raw.mipLevelCount).toBe(1);
    expect(descriptors.pyramid.mipLevelCount).toBe(5);
    expect(descriptors.selected.mipLevelCount).toBe(1);
  });

  it("owns one canonical raw view across every reconstruction mip", () => {
    const calls = { pyramid: 0, raw: 0, selected: 0 };
    const texture = (name: keyof typeof calls) => ({
      createView: () => ({ name, ordinal: ++calls[name] }),
    }) as unknown as GPUTexture;
    const views = createAntikyReflectionViews(
      texture("raw"),
      texture("pyramid"),
      texture("selected"),
    );
    expect(calls).toEqual({ pyramid: 1, raw: 1, selected: 1 });
    expect(views.raw).toBe(views.raw);
  });

  it("labels the raw writer with its full-resolution lineage", () => {
    expect(ANTIKY_RAW_REFLECTION_PASS_LABEL).toMatch(
      /raw full-resolution screen-space reflection trace/i,
    );
  });
});
