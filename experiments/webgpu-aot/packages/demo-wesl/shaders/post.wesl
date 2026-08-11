import package::tone_map::{acesFilmicToneMapping, sRGBTransferOETF};

struct PostVertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var hdrTexture: texture_2d<f32>;
@group(0) @binding(1) var ambientTexture: texture_2d<f32>;
@group(0) @binding(2) var bloomLevel0: texture_2d<f32>;
@group(0) @binding(3) var bloomLevel1: texture_2d<f32>;
@group(0) @binding(4) var bloomLevel2: texture_2d<f32>;
@group(0) @binding(5) var bloomLevel3: texture_2d<f32>;
@group(0) @binding(6) var bloomLevel4: texture_2d<f32>;
@group(0) @binding(7) var bloomSampler: sampler;
@group(0) @binding(8) var<uniform> postSettings: vec4f;
@group(0) @binding(9) var reflectionTexture: texture_2d<f32>;

@vertex
fn postVertex(@builtin(vertex_index) index: u32) -> PostVertexOutput {
  let x = f32(i32(index & 1u) * 4 - 1);
  let y = f32(i32(index >> 1u) * 4 - 1);
  var output: PostVertexOutput;
  output.position = vec4f(x, y, 0.0, 1.0);
  output.uv = vec2f(x + 1.0, 1.0 - y) * 0.5;
  return output;
}

@fragment
fn postFragment(input: PostVertexOutput) -> @location(0) vec4f {
  let pixel = vec2i(floor(input.position.xy));
  var color = textureLoad(hdrTexture, pixel, 0).rgb;
  color += textureSampleLevel(
    reflectionTexture,
    bloomSampler,
    input.uv,
    0.0,
  ).rgb;
  let bloom = (
    textureSampleLevel(bloomLevel0, bloomSampler, input.uv, 0.0).rgb * 0.9972 +
    textureSampleLevel(bloomLevel1, bloomSampler, input.uv, 0.0).rgb * 0.7986 +
    textureSampleLevel(bloomLevel2, bloomSampler, input.uv, 0.0).rgb * 0.6 +
    textureSampleLevel(bloomLevel3, bloomSampler, input.uv, 0.0).rgb * 0.4014 +
    textureSampleLevel(bloomLevel4, bloomSampler, input.uv, 0.0).rgb * 0.2028
  ) * 0.18;
  color += bloom;
  color = acesFilmicToneMapping(color, postSettings.y);
  color = sRGBTransferOETF(color);
  return vec4f(color, 1.0);
}
