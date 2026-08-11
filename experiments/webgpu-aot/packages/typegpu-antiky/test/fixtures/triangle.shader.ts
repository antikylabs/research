import tgpu, { d, std } from "typegpu";

import { defineShader } from "../../src/definition.js";

const sceneLayout = tgpu
  .bindGroupLayout({
    tint: {
      uniform: d.vec4f,
      visibility: ["fragment"],
    },
  })
  .$idx(0)
  .$name("sceneLayout");

const vertexMain = tgpu
  .vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex },
    out: {
      position: d.builtin.position,
      uv: d.vec2f,
    },
  })((input) => {
    "use gpu";

    let position = d.vec2f(-0.8, -0.8);
    let uv = d.vec2f(0, 0);

    if (input.vertexIndex === 1) {
      position = d.vec2f(0.8, -0.8);
      uv = d.vec2f(1, 0);
    }

    if (input.vertexIndex === 2) {
      position = d.vec2f(0, 0.8);
      uv = d.vec2f(0.5, 1);
    }

    return {
      position: d.vec4f(position.x, position.y, 0, 1),
      uv,
    };
  })
  .$name("vertexMain");

const fragmentMain = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";

    const gradient = d.vec4f(input.uv.x, input.uv.y, 0.75, 1);
    return std.mul(gradient, sceneLayout.$.tint);
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
          name: "tint",
          binding: 0,
          visibility: ["fragment"],
          buffer: { type: "uniform", minBindingSize: 16 },
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
