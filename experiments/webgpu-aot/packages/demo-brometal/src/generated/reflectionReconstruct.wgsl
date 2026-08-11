struct ReconstructionSettings {
  values: vec4f,
}

struct ScreenOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var rawReflection: texture_2d<f32>;

@group(0) @binding(1) var reconstructionSampler: sampler;

@group(0) @binding(2) var<uniform> reconstruction: ReconstructionSettings;

@vertex
fn reconstructVertex(@builtin(vertex_index) index: u32) -> ScreenOut {
var output: ScreenOut;
  let x = f32(i32(index & 1u) * 4 - 1);
  let y = f32(i32(index >> 1u) * 4 - 1);
  output.position = vec4f(x, y, 0.0, 1.0);
  output.uv = vec2f(x + 1.0, 1.0 - y) * 0.5;
  return output;
}

@fragment
fn reconstructFragment(input: ScreenOut) -> @location(0) vec4f {
let spread = reconstruction.values.z;
  if (spread < 0.5) {
    return textureLoad(rawReflection, vec2i(floor(input.position.xy)), 0);
  }

  var color = vec3f(0.0);
  for (var offsetY = -3; offsetY <= 3; offsetY += 1) {
    for (var offsetX = -3; offsetX <= 3; offsetX += 1) {
      let offset = vec2f(f32(offsetX), f32(offsetY)) *
        reconstruction.values.xy * spread;
      color += textureSampleLevel(rawReflection, reconstructionSampler, input.uv + offset, 0.0).rgb;
    }
  }
  return vec4f(color / 49.0, 1.0);
}
