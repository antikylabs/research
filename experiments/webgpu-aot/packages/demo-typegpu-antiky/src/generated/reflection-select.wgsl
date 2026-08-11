struct reflectionSelectVertex_Output {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn reflectionSelectVertex(@builtin(vertex_index) vertexIndex: u32) -> reflectionSelectVertex_Output {
  var position = vec2f(-1);
  if ((vertexIndex == 1u)) {
    position = vec2f(3, -1);
  }
  if ((vertexIndex == 2u)) {
    position = vec2f(-1, 3);
  }
  return reflectionSelectVertex_Output(vec4f(position, 0f, 1f), vec2f(((position.x * 0.5f) + 0.5f), (0.5f - (position.y * 0.5f))));
}

@group(0) @binding(1) var surface: texture_2d<f32>;

@group(0) @binding(0) var reflection: texture_2d<f32>;

@group(0) @binding(2) var sampler_1: sampler;

struct reflectionSelectFragment_Input {
  @location(0) uv: vec2f,
}

@fragment fn reflectionSelectFragment(_arg_0: reflectionSelectFragment_Input, @builtin(position) position: vec4f) -> @location(0) vec4f {
  let pixel = vec2i(floor(position.xy));
  let roughness = textureLoad(surface, pixel, 0).w;
  let lod = clamp(((roughness * roughness) * 4f), 0f, 4f);
  return textureSampleLevel(reflection, sampler_1, _arg_0.uv, lod);
}
