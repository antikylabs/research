struct BloomVertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var bloomSource: texture_2d<f32>;
@group(0) @binding(1) var bloomSampler: sampler;
@group(0) @binding(2) var<uniform> bloomSettings: vec4f;
@group(0) @binding(3) var bloomReflection: texture_2d<f32>;

@vertex
fn bloomVertex(@builtin(vertex_index) index: u32) -> BloomVertexOutput {
  let x = f32(i32(index & 1u) * 4 - 1);
  let y = f32(i32(index >> 1u) * 4 - 1);
  var output: BloomVertexOutput;
  output.position = vec4f(x, y, 0.0, 1.0);
  output.uv = vec2f(x + 1.0, 1.0 - y) * 0.5;
  return output;
}

fn sourceAt(uv: vec2f) -> vec3f {
  return textureSampleLevel(
    bloomSource,
    bloomSampler,
    uv,
    0.0,
  ).rgb;
}

@fragment
fn bloomFragment(input: BloomVertexOutput) -> @location(0) vec4f {
  let texel = bloomSettings.xy;
  let kernelRadius = bloomSettings.z;
  let stage = bloomSettings.w;
  if (stage < 0.5) {
    let color = sourceAt(input.uv) + textureSampleLevel(
      bloomReflection,
      bloomSampler,
      input.uv,
      0.0,
    ).rgb;
    let luminance = dot(color, vec3f(0.2126, 0.7152, 0.0722));
    return vec4f(color * smoothstep(1.0, 1.01, luminance), 1.0);
  }

  let direction = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), stage < 1.5);
  let sigma = kernelRadius / 3.0;
  var color = sourceAt(input.uv) * 0.39894 / sigma;
  for (var offset = 1; offset < i32(kernelRadius); offset += 1) {
    let distance = f32(offset);
    let weight = 0.39894 * exp(
      -0.5 * distance * distance / (sigma * sigma),
    ) / sigma;
    let uvOffset = direction * texel * distance;
    color += (
      sourceAt(input.uv + uvOffset) + sourceAt(input.uv - uvOffset)
    ) * weight;
  }
  return vec4f(color, 1.0);
}
