import tgpu, { d, std } from "typegpu";

import { defineShader } from "typegpu-antiky/shader";
import { ANTIKY_BLOOM_WEIGHTS } from "../bloom.js";

const compositeLayout = tgpu
  .bindGroupLayout({
    temporal: {
      texture: d.texture2d(d.f32),
      sampleType: "unfilterable-float",
      visibility: ["fragment"],
    },
    bloomLevel0: {
      texture: d.texture2d(d.f32),
      visibility: ["fragment"],
    },
    bloomLevel1: {
      texture: d.texture2d(d.f32),
      visibility: ["fragment"],
    },
    bloomLevel2: {
      texture: d.texture2d(d.f32),
      visibility: ["fragment"],
    },
    bloomLevel3: {
      texture: d.texture2d(d.f32),
      visibility: ["fragment"],
    },
    bloomLevel4: {
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
  .$name("antikyCompositeLayout");

const fullScreenVertex = tgpu
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
  .$name("compositeVertex");

const acesFilmicToneMapping = tgpu
  .fn([d.vec3f], d.vec3f)((color) => {
    "use gpu";
    const exposed = std.div(color, 0.6);
    const inputColor = d.vec3f(
      exposed.r * 0.59719 + exposed.g * 0.35458 + exposed.b * 0.04823,
      exposed.r * 0.076 + exposed.g * 0.90834 + exposed.b * 0.01566,
      exposed.r * 0.0284 + exposed.g * 0.13383 + exposed.b * 0.83777,
    );
    const fitted = std.div(
      std.sub(
        std.mul(inputColor, std.add(inputColor, d.vec3f(0.0245786))),
        d.vec3f(0.000090537),
      ),
      std.add(
        std.mul(
          inputColor,
          std.mul(
            std.add(inputColor, d.vec3f(0.432951)),
            d.vec3f(0.983729),
          ),
        ),
        d.vec3f(0.238081),
      ),
    );
    return std.clamp(
      d.vec3f(
        fitted.r * 1.60475 - fitted.g * 0.53108 - fitted.b * 0.07367,
        fitted.r * -0.10208 + fitted.g * 1.10813 - fitted.b * 0.00605,
        fitted.r * -0.00327 - fitted.g * 0.07276 + fitted.b * 1.07602,
      ),
      d.vec3f(0),
      d.vec3f(1),
    );
  })
  .$name("antikyAcesFilmicToneMapping");

const srgbTransferOetf = tgpu
  .fn([d.vec3f], d.vec3f)((color) => {
    "use gpu";
    const high = std.sub(
      std.mul(std.pow(color, d.vec3f(0.41666)), d.vec3f(1.055)),
      d.vec3f(0.055),
    );
    const low = std.mul(color, d.vec3f(12.92));
    return d.vec3f(
      std.select(high.r, low.r, color.r <= 0.0031308),
      std.select(high.g, low.g, color.g <= 0.0031308),
      std.select(high.b, low.b, color.b <= 0.0031308),
    );
  })
  .$name("antikySrgbTransferOetf");

const combinedBloom = tgpu
  .fn([d.vec2f], d.vec3f)((uv) => {
    "use gpu";
    const level0 = std.textureSampleLevel(
      compositeLayout.$.bloomLevel0,
      compositeLayout.$.sampler,
      uv,
      0,
    ).rgb;
    const level1 = std.textureSampleLevel(
      compositeLayout.$.bloomLevel1,
      compositeLayout.$.sampler,
      uv,
      0,
    ).rgb;
    const level2 = std.textureSampleLevel(
      compositeLayout.$.bloomLevel2,
      compositeLayout.$.sampler,
      uv,
      0,
    ).rgb;
    const level3 = std.textureSampleLevel(
      compositeLayout.$.bloomLevel3,
      compositeLayout.$.sampler,
      uv,
      0,
    ).rgb;
    const level4 = std.textureSampleLevel(
      compositeLayout.$.bloomLevel4,
      compositeLayout.$.sampler,
      uv,
      0,
    ).rgb;
    return std.add(
      std.add(
        std.mul(level0, ANTIKY_BLOOM_WEIGHTS[0]),
        std.mul(level1, ANTIKY_BLOOM_WEIGHTS[1]),
      ),
      std.add(
        std.add(
          std.mul(level2, ANTIKY_BLOOM_WEIGHTS[2]),
          std.mul(level3, ANTIKY_BLOOM_WEIGHTS[3]),
        ),
        std.mul(level4, ANTIKY_BLOOM_WEIGHTS[4]),
      ),
    );
  })
  .$name("antikyCombinedBloom");

const compositeFragment = tgpu
  .fragmentFn({
    in: { position: d.builtin.position, uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const pixel = d.vec2i(std.floor(input.position.xy));
    let current = std.textureLoad(compositeLayout.$.temporal, pixel, 0).rgb;
    const reflection = std.textureSampleLevel(
      compositeLayout.$.reflection,
      compositeLayout.$.sampler,
      input.uv,
      0,
    ).rgb;
    current = std.add(current, reflection);
    const bloom = combinedBloom(input.uv);
    const linearDisplay = std.add(current, bloom);
    const toneMapped = acesFilmicToneMapping(
      std.mul(linearDisplay, compositeLayout.$.settings.y),
    );
    const display = srgbTransferOetf(toneMapped);
    return d.vec4f(display, 1);
  })
  .$name("compositeFragment");

export default defineShader({
  vertex: fullScreenVertex,
  fragment: compositeFragment,
  entryPoints: {
    vertex: "compositeVertex",
    fragment: "compositeFragment",
  },
  bindGroups: [
    {
      group: 0,
      entries: [
        {
          name: "temporal",
          binding: 0,
          visibility: ["fragment"],
          texture: { sampleType: "unfilterable-float", viewDimension: "2d" },
        },
        {
          name: "bloomLevel0",
          binding: 1,
          visibility: ["fragment"],
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          name: "bloomLevel1",
          binding: 2,
          visibility: ["fragment"],
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          name: "bloomLevel2",
          binding: 3,
          visibility: ["fragment"],
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          name: "bloomLevel3",
          binding: 4,
          visibility: ["fragment"],
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          name: "bloomLevel4",
          binding: 5,
          visibility: ["fragment"],
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          name: "reflection",
          binding: 6,
          visibility: ["fragment"],
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          name: "sampler",
          binding: 7,
          visibility: ["fragment"],
          sampler: { type: "filtering" },
        },
        {
          name: "settings",
          binding: 8,
          visibility: ["fragment"],
          buffer: { type: "uniform", minBindingSize: 16 },
        },
      ],
    },
  ],
  pipeline: {
    vertexBuffers: [],
    primitive: { topology: "triangle-list", cullMode: "none" },
    targets: [{ format: "bgra8unorm" }],
  },
});
