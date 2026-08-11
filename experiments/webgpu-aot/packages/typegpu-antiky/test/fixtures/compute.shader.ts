import tgpu, { d, std } from "typegpu";

import { defineComputeShader } from "../../src/definition.js";

const computeLayout = tgpu
  .bindGroupLayout({
    source: {
      texture: d.textureCube(d.f32),
      visibility: ["compute"],
    },
    sampler: {
      sampler: "filtering",
      visibility: ["compute"],
    },
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
      std.textureSampleLevel(
        computeLayout.$.source,
        computeLayout.$.sampler,
        d.vec3f(1, 0, 0),
        0,
      ),
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
          name: "source",
          binding: 0,
          visibility: ["compute"],
          texture: { sampleType: "float", viewDimension: "cube" },
        },
        {
          name: "sampler",
          binding: 1,
          visibility: ["compute"],
          sampler: { type: "filtering" },
        },
        {
          name: "output",
          binding: 2,
          visibility: ["compute"],
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
