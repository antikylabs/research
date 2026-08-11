import tgpu, { d, std } from "typegpu";

export const TYPEGPU_BLOOM_LEVEL_COUNT = 5;
export const TYPEGPU_BLOOM_BLUR_PASSES = TYPEGPU_BLOOM_LEVEL_COUNT * 2;
export const TYPEGPU_BLOOM_KERNEL_RADII = [6, 10, 14, 18, 22] as const;
export const TYPEGPU_BLOOM_MAX_RADIUS = 22;

export const bloomLayout = tgpu
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
  .$name("typeGpuRuntimeBloomLayout");

export const bloomVertex = tgpu
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

const sampleBloomSource = tgpu
  .fn([d.vec2f], d.vec3f)((uv) => {
    "use gpu";
    return std.textureSampleLevel(
      bloomLayout.$.source,
      bloomLayout.$.sampler,
      std.clamp(uv, d.vec2f(0.001), d.vec2f(0.999)),
      0,
    ).rgb;
  })
  .$name("typeGpuBloomSample");

export const bloomFragment = tgpu
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
      const color = std.add(sampleBloomSource(input.uv), reflection);
      const luminance = std.dot(color, d.vec3f(0.2126, 0.7152, 0.0722));
      return d.vec4f(
        std.mul(color, std.smoothstep(1, 1.01, luminance)),
        1,
      );
    }

    const kernelRadius = std.length(direction);
    const sigma = kernelRadius / 3;
    const axis = std.mul(std.normalize(direction), texel);
    const centerWeight = 0.39894 / sigma;
    let color = std.mul(sampleBloomSource(input.uv), centerWeight);
    for (let offset = 1; offset < TYPEGPU_BLOOM_MAX_RADIUS; offset += 1) {
      const distance = d.f32(offset);
      if (distance >= kernelRadius) break;
      const weight =
        (0.39894 * std.exp((-0.5 * distance * distance) / (sigma * sigma))) /
        sigma;
      color = std.add(
        color,
        std.mul(
          std.add(
            sampleBloomSource(std.add(input.uv, std.mul(axis, distance))),
            sampleBloomSource(std.sub(input.uv, std.mul(axis, distance))),
          ),
          weight,
        ),
      );
    }
    return d.vec4f(color, 1);
  })
  .$name("bloomFragment");
