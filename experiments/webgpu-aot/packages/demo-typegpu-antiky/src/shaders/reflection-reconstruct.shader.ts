import tgpu, { d, std } from "typegpu";

import { defineShader } from "typegpu-antiky/shader";
import { ANTIKY_REFLECTION_FILTER_RADIUS } from "../reflections.js";

const reflectionReconstructLayout = tgpu
  .bindGroupLayout({
    rawReflection: {
      texture: d.texture2d(d.f32),
      visibility: ["fragment"],
    },
    sampler: { sampler: "filtering", visibility: ["fragment"] },
    settings: { uniform: d.vec4f, visibility: ["fragment"] },
  })
  .$idx(0)
  .$name("antikyReflectionReconstructLayout");

const reflectionReconstructVertex = tgpu
  .vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex },
    out: { position: d.builtin.position, uv: d.vec2f },
  })((input) => {
    "use gpu";
    let position = d.vec2f(-1, -1);
    if (input.vertexIndex === 1) position = d.vec2f(3, -1);
    if (input.vertexIndex === 2) position = d.vec2f(-1, 3);
    return {
      position: d.vec4f(position, 0, 1),
      uv: d.vec2f(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5),
    };
  })
  .$name("reflectionReconstructVertex");

const reflectionReconstructFragment = tgpu
  .fragmentFn({
    in: { position: d.builtin.position, uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const spread = reflectionReconstructLayout.$.settings.z;
    if (spread < 0.5) {
      const pixel = d.vec2i(std.floor(input.position.xy));
      return std.textureLoad(
        reflectionReconstructLayout.$.rawReflection,
        pixel,
        0,
      );
    }

    const texelStep = reflectionReconstructLayout.$.settings.xy;
    const separation = std.max(spread, 1);
    let color = d.vec4f(0);
    for (
      let offsetX = -ANTIKY_REFLECTION_FILTER_RADIUS;
      offsetX <= ANTIKY_REFLECTION_FILTER_RADIUS;
      offsetX += 1
    ) {
      for (
        let offsetY = -ANTIKY_REFLECTION_FILTER_RADIUS;
        offsetY <= ANTIKY_REFLECTION_FILTER_RADIUS;
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

export default defineShader({
  vertex: reflectionReconstructVertex,
  fragment: reflectionReconstructFragment,
  entryPoints: {
    vertex: "reflectionReconstructVertex",
    fragment: "reflectionReconstructFragment",
  },
  bindGroups: [
    {
      group: 0,
      entries: [
        {
          name: "rawReflection",
          binding: 0,
          visibility: ["fragment"],
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          name: "sampler",
          binding: 1,
          visibility: ["fragment"],
          sampler: { type: "filtering" },
        },
        {
          name: "settings",
          binding: 2,
          visibility: ["fragment"],
          buffer: { type: "uniform", minBindingSize: 16 },
        },
      ],
    },
  ],
  pipeline: {
    vertexBuffers: [],
    primitive: { topology: "triangle-list", cullMode: "none" },
    targets: [{ format: "rgba16float" }],
  },
});
