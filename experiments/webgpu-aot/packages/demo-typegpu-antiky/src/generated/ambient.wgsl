struct ambientVertex_Output {
  @builtin(position) position: vec4f,
}

@vertex fn ambientVertex(@builtin(vertex_index) vertexIndex: u32) -> ambientVertex_Output {
  var position = vec2f(-1);
  if ((vertexIndex == 1u)) {
    position = vec2f(3, -1);
  }
  if ((vertexIndex == 2u)) {
    position = vec2f(-1, 3);
  }
  return ambientVertex_Output(vec4f(position, 0f, 1f));
}

@group(0) @binding(2) var<uniform> settings: vec4f;

@group(0) @binding(0) var depth: texture_depth_2d;

@group(0) @binding(1) var normal: texture_2d<f32>;

@fragment fn ambientFragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let size = vec2i(settings.xy);
  let maximum = (size - vec2i(1));
  let pixel = clamp(vec2i(floor(position.xy)), vec2i(), maximum);
  let centerDepth = textureLoad(depth, pixel, 0);
  if ((centerDepth >= 0.99999f)) {
    return vec4f(1);
  }
  let centerNormal = normalize(((textureLoad(normal, pixel, 0).xyz * 2f) - vec3f(1)));
  var occlusion = 0f;
  for (var sampleIndex = 0; (sampleIndex < 16i); sampleIndex += 1i) {
    let angle = (f32(sampleIndex) * 0.39269908169872414f);
    let ring = (1f + f32((sampleIndex % 4i)));
    let radius = (settings.z * ring);
    let offset = vec2i(i32(round((cos(angle) * radius))), i32(round((sin(angle) * radius))));
    let samplePixel = clamp((pixel + offset), vec2i(), maximum);
    let sampleDepth = textureLoad(depth, samplePixel, 0);
    let sampleNormal = normalize(((textureLoad(normal, samplePixel, 0).xyz * 2f) - vec3f(1)));
    let depthOcclusion = smoothstep(2.5e-4f, (5e-3f + (radius * 3.5e-4f)), (centerDepth - sampleDepth));
    let normalCrease = clamp((1f - dot(centerNormal, sampleNormal)), 0f, 1f);
    occlusion += (depthOcclusion * (0.7f + (normalCrease * 0.3f)));
  }
  let ambient = clamp((1f - ((occlusion / 16f) * settings.w)), 0.38f, 1f);
  return vec4f(ambient, ambient, ambient, 1f);
}
