import tgpu, { d, std } from "typegpu";

import { defineShader } from "typegpu-antiky/shader";

const ShadowFrame = d
  .struct({
    lightViewProjection: d.mat4x4f,
    model: d.mat4x4f,
  })
  .$name("AntikyShadowFrame");

const shadowLayout = tgpu
  .bindGroupLayout({
    frame: { uniform: ShadowFrame, visibility: ["vertex"] },
  })
  .$idx(0)
  .$name("antikyShadowLayout");

const shadowVertex = tgpu
  .vertexFn({
    in: { position: d.vec3f },
    out: { position: d.builtin.position },
  })((input) => {
    "use gpu";
    const world = std.mul(shadowLayout.$.frame.model, d.vec4f(input.position, 1));
    return {
      position: std.mul(shadowLayout.$.frame.lightViewProjection, world),
    };
  })
  .$name("shadowVertex");

const shadowFragment = tgpu
  .fragmentFn({ out: d.vec4f })(() => {
    "use gpu";
    return d.vec4f(1);
  })
  .$name("shadowFragment");

export default defineShader({
  vertex: shadowVertex,
  fragment: shadowFragment,
  entryPoints: { vertex: "shadowVertex", fragment: "shadowFragment" },
  bindGroups: [
    {
      group: 0,
      entries: [
        {
          name: "frame",
          binding: 0,
          visibility: ["vertex"],
          buffer: { type: "uniform", minBindingSize: 128 },
        },
      ],
    },
  ],
  pipeline: {
    vertexBuffers: [
      {
        arrayStride: 12,
        attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
      },
    ],
    primitive: {
      topology: "triangle-list",
      cullMode: "back",
      frontFace: "cw",
    },
    targets: [{ format: "r8unorm" }],
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less-equal",
    },
  },
});
