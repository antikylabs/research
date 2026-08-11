struct MipmapVertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var mipmapSampler: sampler;
@group(0) @binding(1) var mipmapSource: texture_2d<f32>;

@vertex
fn mipmapVertex(@builtin(vertex_index) index: u32) -> MipmapVertexOutput {
  let x = f32(i32(index & 1u) * 4 - 1);
  let y = f32(i32(index >> 1u) * 4 - 1);
  var output: MipmapVertexOutput;
  output.position = vec4f(x, y, 0.0, 1.0);
  output.uv = vec2f(x + 1.0, 1.0 - y) * 0.5;
  return output;
}

@fragment
fn mipmapFragment(input: MipmapVertexOutput) -> @location(0) vec4f {
  return textureSampleLevel(mipmapSource, mipmapSampler, input.uv, 0.0);
}
