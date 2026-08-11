struct ScreenOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var hdrTexture: texture_2d<f32>;

@group(0) @binding(1) var reflectionPyramid: texture_2d<f32>;

@group(0) @binding(2) var normalRoughnessTexture: texture_2d<f32>;

@group(0) @binding(3) var reflectionSampler: sampler;

@vertex
fn selectVertex(@builtin(vertex_index) index: u32) -> ScreenOut {
var output: ScreenOut;
  let x = f32(i32(index & 1u) * 4 - 1);
  let y = f32(i32(index >> 1u) * 4 - 1);
  output.position = vec4f(x, y, 0.0, 1.0);
  output.uv = vec2f(x + 1.0, 1.0 - y) * 0.5;
  return output;
}

@fragment
fn selectFragment(input: ScreenOut) -> @location(0) vec4f {
let pixel = vec2i(floor(input.position.xy));
  let base = textureLoad(hdrTexture, pixel, 0).rgb;
  let roughness = textureLoad(normalRoughnessTexture, pixel, 0).w;
  let lod = clamp(roughness * roughness * 4.0, 0.0, 4.0);
  let reflection = textureSampleLevel(reflectionPyramid, reflectionSampler, input.uv, lod).rgb;
  return vec4f(base + reflection, 1.0);
}
