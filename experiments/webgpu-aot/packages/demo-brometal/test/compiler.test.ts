import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compileShader } from "../src/compiler.js";
import { brometalShaders } from "../src/generated/pipeline.generated.js";
import {
  BROMETAL_COMPOSITE_EXPOSURE,
  createBroMetalCompositeSettings,
} from "../src/profile.js";
import { buildArtifacts } from "../src/shaders/pipeline.shader.js";
import { BROMETAL_SUN, broMetalWGSLVector3 } from "../src/sun.js";

describe("BroMetal-style AOT compiler", () => {
  it("emits the complete checked-in deferred pipeline deterministically", async () => {
    const generated = buildArtifacts();
    expect(brometalShaders).toEqual(generated);
    expect(brometalShaders).toHaveProperty("shadow");

    for (const stage of [
      "shadow",
      "geometry",
      "lighting",
      "reflection",
      "reflectionReconstruct",
      "reflectionSelect",
      "temporal",
      "composite",
    ] as const) {
      const wgslPath = fileURLToPath(
        new URL(`../src/generated/${stage}.wgsl`, import.meta.url),
      );
      expect(await readFile(wgslPath, "utf8")).toBe(generated[stage]);
    }

    expect(brometalShaders.geometry).toContain("@vertex\nfn geometryVertex(");
    expect(brometalShaders.geometry).toContain("@fragment\nfn geometryFragment(");
    expect(brometalShaders.geometry).toContain("@location(2) worldMetal");
    expect(brometalShaders.geometry).toContain("worldNormal * 0.5 + vec3f(0.5)");
    expect(brometalShaders.geometry).toContain("@location(3) tangent: vec4f");
    expect(brometalShaders.geometry).toContain("input.tangent.w");
    expect(brometalShaders.geometry).not.toContain("let positionDx = dpdx(");
    expect(Object.values(brometalShaders)).toContainEqual(
      expect.stringContaining("@vertex\nfn shadowVertex("),
    );
    expect(brometalShaders.lighting).toContain("var<storage, read> lights");
    expect(brometalShaders.lighting).toContain("normalRoughness.xyz * 2.0 - vec3f(1.0)");
    expect(brometalShaders.lighting).toContain(
      "var nearShadowMap: texture_depth_2d",
    );
    expect(brometalShaders.lighting).toContain(
      "var farShadowMap: texture_depth_2d",
    );
    expect(brometalShaders.lighting).toContain(
      `const SUN_DIRECTION: vec3f = ${broMetalWGSLVector3(BROMETAL_SUN.direction)}`,
    );
    expect(brometalShaders.lighting).toContain(
      "for (var offsetY = -1; offsetY <= 1; offsetY += 1)",
    );
    expect(brometalShaders.lighting).toContain("visibility / 9.0");
    expect(brometalShaders.lighting).toContain(
      "1.0 / max(distanceSquared, 0.01)",
    );
    expect(brometalShaders.lighting).toContain("cutoff * cutoff");
    expect(brometalShaders.lighting).toContain("var environmentTexture: texture_cube<f32>");
    expect(brometalShaders.lighting).toContain("roughness * roughness");
    expect(brometalShaders.lighting).toContain("multiScattering");
    expect(brometalShaders.lighting).toContain("fn visibilityGGXCorrelated(");
    expect(brometalShaders.lighting).toContain("fn directDfgApproximation(");
    expect(brometalShaders.lighting).toContain("fn directMultiScattering(");
    expect(brometalShaders.lighting).toContain(
      "let diffuse = albedo * (1.0 - metallic) / 3.14159265",
    );
    expect(brometalShaders.lighting).not.toContain("fn geometrySchlickGGX(");
    expect(brometalShaders.lighting).not.toContain("let hemisphere = mix(");
    expect(brometalShaders.lighting).toContain(
      "distanceRatioSquared * distanceRatioSquared",
    );
    expect(brometalShaders.lighting).not.toContain(
      "0.28 + shadowVisibility(position) * 0.72",
    );
    expect(brometalShaders).toHaveProperty("reflection");
    expect(
      (brometalShaders as Record<string, string>).reflection,
    ).toContain("fn reflectionFragment(");
    expect(brometalShaders.composite).toContain("@fragment\nfn compositeFragment(");
    expect(brometalShaders.composite).toContain("fn fxaaHdr(");
    expect(brometalShaders.composite).toContain(
      "output.uv = vec2f(x + 1.0, 1.0 - y) * 0.5",
    );
  });

  it("rejects duplicate static binding locations", () => {
    expect(() =>
      compileShader({
        bindings: [
          { group: 0, binding: 1, declaration: "var first: sampler" },
          { group: 0, binding: 1, declaration: "var second: sampler" },
        ],
        functions: [],
      }),
    ).toThrow("Duplicate BroMetal binding 0:1");
  });

  it("emits the reference ACES and sRGB output transform without channel grading", () => {
    const composite = brometalShaders.composite;
    expect(BROMETAL_COMPOSITE_EXPOSURE).toBe(1);
    expect(Array.from(createBroMetalCompositeSettings(2560, 1440))).toEqual(
      Array.from(new Float32Array([0, 1, 2560, 1440])),
    );
    expect(composite).toContain("fn acesFilmicToneMapping(");
    expect(composite).toMatch(
      /mat3x3f\(\s*0\.59719, 0\.076, 0\.0284,\s*0\.35458, 0\.90834, 0\.13383,\s*0\.04823, 0\.01566, 0\.83777,/,
    );
    expect(composite).toMatch(
      /mat3x3f\(\s*1\.60475, -0\.10208, -0\.00327,\s*-0\.53108, 1\.10813, -0\.07276,\s*-0\.07367, -0\.00605, 1\.07602,/,
    );
    expect(composite).toContain("fn sRGBTransferOETF(");
    expect(composite).toContain("color <= vec3f(0.0031308)");
    expect(composite).toContain("color = sRGBTransferOETF(color)");
    expect(composite).not.toContain("color *= vec3f(1.0, 1.22, 1.5)");
    expect(composite).not.toContain("let vignette");
    expect(composite).not.toContain("let grain");
    expect(brometalShaders.bloom).toContain("smoothstep(1.0, 1.01");
    expect(brometalShaders.bloom).toContain("kernelRadius / 3.0");
    expect(composite).toContain("bloomLevel4");
    expect(composite).toContain("* 0.18");
    expect(composite).not.toContain("* 0.85");
  });

  it("does not globally suppress direct floor lighting by surface angle", () => {
    expect(brometalShaders.lighting).not.toContain("color *= surfaceBalance");
  });
});
