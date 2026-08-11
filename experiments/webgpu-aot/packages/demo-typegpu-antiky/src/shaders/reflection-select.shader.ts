import tgpu, { d, std } from "typegpu";

import { defineShader } from "typegpu-antiky/shader";

const reflectionSelectLayout = tgpu
  .bindGroupLayout({
    reflection: {
      texture: d.texture2d(d.f32),
      visibility: ["fragment"],
    },
    surface: {
      texture: d.texture2d(d.f32),
      sampleType: "unfilterable-float",
      visibility: ["fragment"],
    },
    sampler: { sampler: "filtering", visibility: ["fragment"] },
  })
  .$idx(0)
  .$name("antikyReflectionSelectLayout");

const reflectionSelectVertex = tgpu
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
  .$name("reflectionSelectVertex");

const reflectionSelectFragment = tgpu
  .fragmentFn({
    in: { position: d.builtin.position, uv: d.vec2f },
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

export default defineShader({
  vertex: reflectionSelectVertex,
  fragment: reflectionSelectFragment,
  entryPoints: {
    vertex: "reflectionSelectVertex",
    fragment: "reflectionSelectFragment",
  },
  bindGroups: [
    {
      group: 0,
      entries: [
        {
          name: "reflection",
          binding: 0,
          visibility: ["fragment"],
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          name: "surface",
          binding: 1,
          visibility: ["fragment"],
          texture: { sampleType: "unfilterable-float", viewDimension: "2d" },
        },
        {
          name: "sampler",
          binding: 2,
          visibility: ["fragment"],
          sampler: { type: "filtering" },
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
