struct reflectionReconstructVertex_Output {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn reflectionReconstructVertex(@builtin(vertex_index) vertexIndex: u32) -> reflectionReconstructVertex_Output {
  var position = vec2f(-1);
  if ((vertexIndex == 1u)) {
    position = vec2f(3, -1);
  }
  if ((vertexIndex == 2u)) {
    position = vec2f(-1, 3);
  }
  return reflectionReconstructVertex_Output(vec4f(position, 0f, 1f), vec2f(((position.x * 0.5f) + 0.5f), (0.5f - (position.y * 0.5f))));
}

@group(0) @binding(2) var<uniform> settings: vec4f;

@group(0) @binding(0) var rawReflection: texture_2d<f32>;

@group(0) @binding(1) var sampler_1: sampler;

struct reflectionReconstructFragment_Input {
  @location(0) uv: vec2f,
}

@fragment fn reflectionReconstructFragment(_arg_0: reflectionReconstructFragment_Input, @builtin(position) position: vec4f) -> @location(0) vec4f {
  let spread = settings.z;
  if ((spread < 0.5f)) {
    let pixel = vec2i(floor(position.xy));
    return textureLoad(rawReflection, pixel, 0);
  }
  let texelStep = settings.xy;
  let separation = max(spread, 1f);
  var color = vec4f();
  for (var offsetX = -3; (offsetX <= 3i); offsetX += 1i) {
    for (var offsetY = -3; (offsetY <= 3i); offsetY += 1i) {
      let offset = ((vec2f(f32(offsetX), f32(offsetY)) * texelStep) * separation);
      color = (color + textureSampleLevel(rawReflection, sampler_1, (_arg_0.uv + offset), 0));
    }
  }
  return (color / 49f);
}
