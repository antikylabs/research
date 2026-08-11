import tgpu, { d, std } from "typegpu";

import { defineShader } from "typegpu-antiky/shader";
import { ANTIKY_BLOOM_MAX_RADIUS } from "../bloom.js";

const bloomLayout = tgpu
  .bindGroupLayout({
    source: {
      texture: d.texture2d(d.f32),
      visibility: ["fragment"],
    },
    reflection: {
      texture: d.texture2d(d.f32),
      visibility: ["fragment"],
    },
    sampler: { sampler: "filtering", visibility: ["fragment"] },
    settings: { uniform: d.vec4f, visibility: ["fragment"] },
  })
  .$idx(0)
  .$name("antikyBloomLayout");

const bloomVertex = tgpu
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
  .$name("bloomVertex");

const sampleSource = tgpu
  .fn([d.vec2f], d.vec3f)((uv) => {
    "use gpu";
    return std.textureSampleLevel(
      bloomLayout.$.source,
      bloomLayout.$.sampler,
      uv,
      0,
    ).rgb;
  })
  .$name("antikyBloomSample");

const bloomFragment = tgpu
  .fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })((input) => {
    "use gpu";
    const texel = bloomLayout.$.settings.xy;
    const direction = bloomLayout.$.settings.zw;
    if (std.length(direction) < 0.5) {
      const reflection = std.textureSampleLevel(
        bloomLayout.$.reflection,
        bloomLayout.$.sampler,
        input.uv,
        0,
      ).rgb;
      const color = std.add(sampleSource(input.uv), reflection);
      const luminance = std.dot(color, d.vec3f(0.2126, 0.7152, 0.0722));
      return d.vec4f(
        std.mul(color, std.smoothstep(1, 1.01, luminance)),
        1,
      );
    }

    const kernelRadius = std.length(direction);
    const axis = std.mul(std.normalize(direction), texel);
    if (kernelRadius < 1.5) {
      let color = d.vec3f(0);
      let weightTotal = d.f32(0);
      for (let offset = -6; offset <= 6; offset += 1) {
        const distance = d.f32(offset);
        const weight = std.exp(-(distance * distance) / 18);
        color = std.add(
          color,
          std.mul(
            sampleSource(std.add(input.uv, std.mul(axis, distance))),
            weight,
          ),
        );
        weightTotal += weight;
      }
      return d.vec4f(std.div(color, weightTotal), 1);
    }

    const sigma = kernelRadius / 3;
    const centerWeight = 0.39894 / sigma;
    let color = std.mul(sampleSource(input.uv), centerWeight);
    for (let offset = 1; offset < ANTIKY_BLOOM_MAX_RADIUS; offset += 1) {
      const distance = d.f32(offset);
      if (distance >= kernelRadius) break;
      const weight =
        (0.39894 * std.exp((-0.5 * distance * distance) / (sigma * sigma))) /
        sigma;
      color = std.add(
        color,
        std.mul(
          std.add(
            sampleSource(std.add(input.uv, std.mul(axis, distance))),
            sampleSource(std.sub(input.uv, std.mul(axis, distance))),
          ),
          weight,
        ),
      );
    }
    return d.vec4f(color, 1);
  })
  .$name("bloomFragment");

export default defineShader({
  vertex: bloomVertex,
  fragment: bloomFragment,
  entryPoints: { vertex: "bloomVertex", fragment: "bloomFragment" },
  bindGroups: [
    {
      group: 0,
      entries: [
        {
          name: "source",
          binding: 0,
          visibility: ["fragment"],
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          name: "reflection",
          binding: 1,
          visibility: ["fragment"],
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          name: "sampler",
          binding: 2,
          visibility: ["fragment"],
          sampler: { type: "filtering" },
        },
        {
          name: "settings",
          binding: 3,
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
