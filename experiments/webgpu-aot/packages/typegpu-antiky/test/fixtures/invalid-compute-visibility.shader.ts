import tgpu, { d, std } from "typegpu";

import { defineComputeShader } from "../../src/definition.js";

const computeLayout = tgpu
  .bindGroupLayout({
    output: {
      storageTexture: d.textureStorage2dArray(
        "rgba16float",
        "write-only",
      ),
      visibility: ["compute"],
    },
  })
  .$idx(0)
  .$name("computeLayout");

const computeMain = tgpu
  .computeFn({
    in: { id: d.builtin.globalInvocationId },
    workgroupSize: [8, 8, 1],
  })((input) => {
    "use gpu";
    const dimensions = std.textureDimensions(computeLayout.$.output);
    if (input.id.x >= dimensions.x || input.id.y >= dimensions.y) return;
    std.textureStore(
      computeLayout.$.output,
      d.vec2i(input.id.xy),
      d.i32(input.id.z),
      d.vec4f(0),
    );
  })
  .$name("computeMain");

export default defineComputeShader({
  compute: computeMain,
  entryPoints: { compute: "computeMain" },
  bindGroups: [
    {
      group: 0,
      entries: [
        {
          name: "output",
          binding: 0,
          visibility: ["fragment"],
          storageTexture: {
            access: "write-only",
            format: "rgba16float",
            viewDimension: "2d-array",
          },
        },
      ],
    },
  ],
});
