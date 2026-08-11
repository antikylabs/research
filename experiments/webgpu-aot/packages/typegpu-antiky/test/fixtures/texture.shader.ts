import tgpu, { d, std } from "typegpu";

import { defineShader } from "../../src/definition.js";

const sceneLayout = tgpu
  .bindGroupLayout({
    sampler: {
      sampler: "filtering",
      visibility: ["fragment"],
    },
    source: {
      texture: d.texture2d(d.f32),
      visibility: ["fragment"],
    },
  })
  .$idx(0)
  .$name("sceneLayout");

const vertexMain = tgpu
  .vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex },
    out: { position: d.builtin.position },
  })((input) => {
    "use gpu";

    return {
      position: d.vec4f(d.f32(input.vertexIndex), 0, 0, 1),
    };
  })
  .$name("vertexMain");

const fragmentMain = tgpu
  .fragmentFn({ out: d.vec4f })(() => {
    "use gpu";

    return std.textureSample(
      sceneLayout.$.source,
      sceneLayout.$.sampler,
      d.vec2f(0.5),
    );
  })
  .$name("fragmentMain");

export default defineShader({
  vertex: vertexMain,
  fragment: fragmentMain,
  entryPoints: {
    vertex: "vertexMain",
    fragment: "fragmentMain",
  },
  bindGroups: [
    {
      group: 0,
      entries: [
        {
          name: "sampler",
          binding: 0,
          visibility: ["fragment"],
          sampler: { type: "filtering" },
        },
        {
          name: "source",
          binding: 1,
          visibility: ["fragment"],
          texture: { sampleType: "float", viewDimension: "2d" },
        },
      ],
    },
  ],
  pipeline: {
    vertexBuffers: [],
    primitive: { topology: "triangle-list" },
    targets: [{ format: "rgba8unorm" }],
  },
});
