import tgpu, { common, d, std } from "typegpu";

export const TYPEGPU_AMBIENT_OCCLUSION_SAMPLES = 16;
export const TYPEGPU_AMBIENT_OCCLUSION_STRENGTH = 6;

export const ambientLayout = tgpu
  .bindGroupLayout({
    depth: { texture: d.textureDepth2d(), visibility: ["fragment"] },
    normal: {
      texture: d.texture2d(d.f32),
      sampleType: "unfilterable-float",
      visibility: ["fragment"],
    },
    settings: { uniform: d.vec4f, visibility: ["fragment"] },
  })
  .$idx(0)
  .$name("typeGpuAmbientLayout");

export const ambientFragment = tgpu
  .fragmentFn({
    in: { position: d.builtin.position },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const size = d.vec2i(ambientLayout.$.settings.xy);
    const maximum = std.sub(size, d.vec2i(1));
    const pixel = std.clamp(
      d.vec2i(std.floor(input.position.xy)),
      d.vec2i(0),
      maximum,
    );
    const centerDepth = std.textureLoad(ambientLayout.$.depth, pixel, 0);
    if (centerDepth >= 0.99999) return d.vec4f(1);

    const centerNormal = std.normalize(
      std.sub(
        std.mul(std.textureLoad(ambientLayout.$.normal, pixel, 0).xyz, 2),
        d.vec3f(1),
      ),
    );
    let occlusion = d.f32(0);
    for (
      let sampleIndex = 0;
      sampleIndex < TYPEGPU_AMBIENT_OCCLUSION_SAMPLES;
      sampleIndex += 1
    ) {
      const angle =
        d.f32(sampleIndex) *
        (Math.PI * 2 / TYPEGPU_AMBIENT_OCCLUSION_SAMPLES);
      const ring = 1 + d.f32(sampleIndex % 4);
      const radius = ambientLayout.$.settings.z * ring;
      const offset = d.vec2i(
        d.i32(std.round(std.cos(angle) * radius)),
        d.i32(std.round(std.sin(angle) * radius)),
      );
      const samplePixel = std.clamp(
        std.add(pixel, offset),
        d.vec2i(0),
        maximum,
      );
      const sampleDepth = std.textureLoad(
        ambientLayout.$.depth,
        samplePixel,
        0,
      );
      const sampleNormal = std.normalize(
        std.sub(
          std.mul(
            std.textureLoad(ambientLayout.$.normal, samplePixel, 0).xyz,
            2,
          ),
          d.vec3f(1),
        ),
      );
      const depthOcclusion = std.smoothstep(
        0.00025,
        0.005 + radius * 0.00035,
        centerDepth - sampleDepth,
      );
      const normalCrease = std.clamp(
        1 - std.dot(centerNormal, sampleNormal),
        0,
        1,
      );
      occlusion += depthOcclusion * (0.7 + normalCrease * 0.3);
    }
    const ambient = std.clamp(
      1 -
        (occlusion / TYPEGPU_AMBIENT_OCCLUSION_SAMPLES) *
          ambientLayout.$.settings.w,
      0.38,
      1,
    );
    return d.vec4f(ambient, ambient, ambient, 1);
  })
  .$name("ambientFragment");

export const ambientVertex = common.fullScreenTriangle;
