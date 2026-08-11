import tgpu, { d, std } from "typegpu";

export const TYPEGPU_COMPOSITE_EXPOSURE = 1;
export const TYPEGPU_BLOOM_LEVEL_0_WEIGHT = 0.179496;
export const TYPEGPU_BLOOM_LEVEL_1_WEIGHT = 0.143748;
export const TYPEGPU_BLOOM_LEVEL_2_WEIGHT = 0.108;
export const TYPEGPU_BLOOM_LEVEL_3_WEIGHT = 0.072252;
export const TYPEGPU_BLOOM_LEVEL_4_WEIGHT = 0.036504;

export const compositeLayout = tgpu
  .bindGroupLayout({
    hdr: { texture: d.texture2d(d.f32), visibility: ["fragment"] },
    bloomLevel0: { texture: d.texture2d(d.f32), visibility: ["fragment"] },
    bloomLevel1: { texture: d.texture2d(d.f32), visibility: ["fragment"] },
    bloomLevel2: { texture: d.texture2d(d.f32), visibility: ["fragment"] },
    bloomLevel3: { texture: d.texture2d(d.f32), visibility: ["fragment"] },
    bloomLevel4: { texture: d.texture2d(d.f32), visibility: ["fragment"] },
    reflection: { texture: d.texture2d(d.f32), visibility: ["fragment"] },
    bloomSampler: { sampler: "filtering", visibility: ["fragment"] },
    settings: { uniform: d.vec4f, visibility: ["fragment"] },
  })
  .$idx(0)
  .$name("typeGpuCompositeLayout");

const sampleHdr = tgpu
  .fn([d.vec2f], d.vec3f)((uv) => {
    "use gpu";
    return std.textureSampleLevel(
      compositeLayout.$.hdr,
      compositeLayout.$.bloomSampler,
      uv,
      0,
    ).rgb;
  })
  .$name("typeGpuHdrSample");

const typeGpuFxaaHdr = tgpu
  .fn([d.vec2f], d.vec3f)((uv) => {
    "use gpu";
    const texel = std.div(d.vec2f(1), compositeLayout.$.settings.zw);
    const northWest = sampleHdr(std.add(uv, d.vec2f(-texel.x, -texel.y)));
    const northEast = sampleHdr(std.add(uv, d.vec2f(texel.x, -texel.y)));
    const southWest = sampleHdr(std.add(uv, d.vec2f(-texel.x, texel.y)));
    const southEast = sampleHdr(std.add(uv, d.vec2f(texel.x, texel.y)));
    const center = sampleHdr(uv);
    const luma = d.vec3f(0.299, 0.587, 0.114);
    const lumaNorthWest = std.dot(northWest, luma);
    const lumaNorthEast = std.dot(northEast, luma);
    const lumaSouthWest = std.dot(southWest, luma);
    const lumaSouthEast = std.dot(southEast, luma);
    const lumaCenter = std.dot(center, luma);
    const lumaMinimum = std.min(
      lumaCenter,
      std.min(
        std.min(lumaNorthWest, lumaNorthEast),
        std.min(lumaSouthWest, lumaSouthEast),
      ),
    );
    const lumaMaximum = std.max(
      lumaCenter,
      std.max(
        std.max(lumaNorthWest, lumaNorthEast),
        std.max(lumaSouthWest, lumaSouthEast),
      ),
    );
    let direction = d.vec2f(
      -((lumaNorthWest + lumaNorthEast) - (lumaSouthWest + lumaSouthEast)),
      (lumaNorthWest + lumaSouthWest) - (lumaNorthEast + lumaSouthEast),
    );
    const directionReduce = std.max(
      (lumaNorthWest + lumaNorthEast + lumaSouthWest + lumaSouthEast) *
        0.0078125,
      0.0009765625,
    );
    direction = std.mul(
      std.clamp(
        std.div(
          direction,
          std.min(std.abs(direction.x), std.abs(direction.y)) +
            directionReduce,
        ),
        d.vec2f(-8),
        d.vec2f(8),
      ),
      texel,
    );
    const rgbA = std.mul(
      std.add(
        sampleHdr(std.add(uv, std.mul(direction, -0.166667))),
        sampleHdr(std.add(uv, std.mul(direction, 0.166667))),
      ),
      0.5,
    );
    const rgbB = std.add(
      std.mul(rgbA, 0.5),
      std.mul(
        std.add(
          sampleHdr(std.add(uv, std.mul(direction, -0.5))),
          sampleHdr(std.add(uv, std.mul(direction, 0.5))),
        ),
        0.25,
      ),
    );
    const lumaB = std.dot(rgbB, luma);
    return std.select(
      rgbB,
      rgbA,
      lumaB < lumaMinimum || lumaB > lumaMaximum,
    );
  })
  .$name("typeGpuFxaaHdr");

const acesFilmicToneMapping = tgpu
  .fn([d.vec3f, d.f32], d.vec3f)((color, exposure) => {
    "use gpu";
    const exposed = std.mul(color, exposure / 0.6);
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
  .$name("typeGpuAcesFilmicToneMapping");

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
  .$name("typeGpuSrgbTransferOetf");

export const compositeFragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f, position: d.builtin.position },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    let color = typeGpuFxaaHdr(input.uv);
    const reflection = std.textureSampleLevel(
      compositeLayout.$.reflection,
      compositeLayout.$.bloomSampler,
      input.uv,
      0,
    ).rgb;
    color = std.add(color, std.mul(reflection, 0.9));
    const bloomLevel0 = std.textureSampleLevel(
      compositeLayout.$.bloomLevel0,
      compositeLayout.$.bloomSampler,
      input.uv,
      0,
    ).rgb;
    const bloomLevel1 = std.textureSampleLevel(
      compositeLayout.$.bloomLevel1,
      compositeLayout.$.bloomSampler,
      input.uv,
      0,
    ).rgb;
    const bloomLevel2 = std.textureSampleLevel(
      compositeLayout.$.bloomLevel2,
      compositeLayout.$.bloomSampler,
      input.uv,
      0,
    ).rgb;
    const bloomLevel3 = std.textureSampleLevel(
      compositeLayout.$.bloomLevel3,
      compositeLayout.$.bloomSampler,
      input.uv,
      0,
    ).rgb;
    const bloomLevel4 = std.textureSampleLevel(
      compositeLayout.$.bloomLevel4,
      compositeLayout.$.bloomSampler,
      input.uv,
      0,
    ).rgb;
    const bloom = std.add(
      std.add(
        std.mul(bloomLevel0, TYPEGPU_BLOOM_LEVEL_0_WEIGHT),
        std.mul(bloomLevel1, TYPEGPU_BLOOM_LEVEL_1_WEIGHT),
      ),
      std.add(
        std.add(
          std.mul(bloomLevel2, TYPEGPU_BLOOM_LEVEL_2_WEIGHT),
          std.mul(bloomLevel3, TYPEGPU_BLOOM_LEVEL_3_WEIGHT),
        ),
        std.mul(bloomLevel4, TYPEGPU_BLOOM_LEVEL_4_WEIGHT),
      ),
    );
    color = std.add(
      color,
      bloom,
    );
    color = acesFilmicToneMapping(color, compositeLayout.$.settings.y);
    color = srgbTransferOetf(color);
    return d.vec4f(color, 1);
  })
  .$name("compositeFragment");
