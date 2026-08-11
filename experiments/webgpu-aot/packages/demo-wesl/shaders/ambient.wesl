struct AmbientVertexOutput {
  @builtin(position) position: vec4f,
}

@group(0) @binding(0) var ambientDepth: texture_depth_2d;
@group(0) @binding(1) var ambientNormal: texture_2d<f32>;
@group(0) @binding(2) var<uniform> ambientSettings: vec4f;

@vertex
fn ambientVertex(@builtin(vertex_index) index: u32) -> AmbientVertexOutput {
  let x = f32(i32(index & 1u) * 4 - 1);
  let y = f32(i32(index >> 1u) * 4 - 1);
  var output: AmbientVertexOutput;
  output.position = vec4f(x, y, 0.0, 1.0);
  return output;
}

@fragment
fn ambientFragment(input: AmbientVertexOutput) -> @location(0) vec4f {
  let size = vec2i(ambientSettings.xy);
  let maximum = size - vec2i(1);
  let pixel = clamp(vec2i(floor(input.position.xy)), vec2i(0), maximum);
  let centerDepth = textureLoad(ambientDepth, pixel, 0);
  if (centerDepth >= 0.99999) {
    return vec4f(1.0);
  }

  let centerNormal = normalize(
    textureLoad(ambientNormal, pixel, 0).xyz * 2.0 - vec3f(1.0),
  );
  var occlusion = 0.0;
  for (var sampleIndex = 0; sampleIndex < 16; sampleIndex += 1) {
    let angle = f32(sampleIndex) * 0.39269908169872414;
    let ring = 1.0 + f32(sampleIndex % 4);
    let radius = ambientSettings.z * ring;
    let offset = vec2i(
      i32(round(cos(angle) * radius)),
      i32(round(sin(angle) * radius)),
    );
    let samplePixel = clamp(pixel + offset, vec2i(0), maximum);
    let sampleDepth = textureLoad(ambientDepth, samplePixel, 0);
    let sampleNormal = normalize(
      textureLoad(ambientNormal, samplePixel, 0).xyz * 2.0 - vec3f(1.0),
    );
    let depthOcclusion = smoothstep(
      0.00025,
      0.005 + radius * 0.00035,
      centerDepth - sampleDepth,
    );
    let normalCrease = clamp(1.0 - dot(centerNormal, sampleNormal), 0.0, 1.0);
    occlusion += depthOcclusion * (0.7 + normalCrease * 0.3);
  }
  let ambient = clamp(
    1.0 - (occlusion / 16.0) * ambientSettings.w,
    0.38,
    1.0,
  );
  return vec4f(ambient, ambient, ambient, 1.0);
}
