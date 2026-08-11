import tgpu, { d, std } from "typegpu";

import { TYPEGPU_REFLECTION_FILTER_RADIUS } from "../reflections.js";

export const reflectionReconstructLayout = tgpu
  .bindGroupLayout({
    rawReflection: { texture: d.texture2d(d.f32), visibility: ["fragment"] },
    sampler: { sampler: "filtering", visibility: ["fragment"] },
    settings: { uniform: d.vec4f, visibility: ["fragment"] },
  })
  .$idx(0)
  .$name("typeGpuReflectionReconstructLayout");

export const reflectionReconstructFragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f, position: d.builtin.position },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const spread = reflectionReconstructLayout.$.settings.z;
    if (spread < 0.5) {
      return std.textureLoad(
        reflectionReconstructLayout.$.rawReflection,
        d.vec2i(std.floor(input.position.xy)),
        0,
      );
    }

    const texelStep = reflectionReconstructLayout.$.settings.xy;
    const separation = std.max(spread, 1);
    let color = d.vec4f(0);
    for (
      let offsetX = -TYPEGPU_REFLECTION_FILTER_RADIUS;
      offsetX <= TYPEGPU_REFLECTION_FILTER_RADIUS;
      offsetX += 1
    ) {
      for (
        let offsetY = -TYPEGPU_REFLECTION_FILTER_RADIUS;
        offsetY <= TYPEGPU_REFLECTION_FILTER_RADIUS;
        offsetY += 1
      ) {
        const offset = std.mul(
          std.mul(d.vec2f(d.f32(offsetX), d.f32(offsetY)), texelStep),
          separation,
        );
        color = std.add(
          color,
          std.textureSampleLevel(
            reflectionReconstructLayout.$.rawReflection,
            reflectionReconstructLayout.$.sampler,
            std.add(input.uv, offset),
            0,
          ),
        );
      }
    }
    return std.div(color, 49);
  })
  .$name("reflectionReconstructFragment");

export const reflectionSelectLayout = tgpu
  .bindGroupLayout({
    reflection: { texture: d.texture2d(d.f32), visibility: ["fragment"] },
    surface: {
      texture: d.texture2d(d.f32),
      sampleType: "unfilterable-float",
      visibility: ["fragment"],
    },
    sampler: { sampler: "filtering", visibility: ["fragment"] },
  })
  .$idx(0)
  .$name("typeGpuReflectionSelectLayout");

export const reflectionSelectFragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f, position: d.builtin.position },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const pixel = d.vec2i(std.floor(input.position.xy));
    const roughness = std.textureLoad(
      reflectionSelectLayout.$.surface,
      pixel,
      0,
    ).w;
    const lod = std.clamp(roughness * roughness * 4, 0, 4);
    return std.textureSampleLevel(
      reflectionSelectLayout.$.reflection,
      reflectionSelectLayout.$.sampler,
      input.uv,
      lod,
    );
  })
  .$name("reflectionSelectFragment");
