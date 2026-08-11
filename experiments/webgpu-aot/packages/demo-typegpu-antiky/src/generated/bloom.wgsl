struct bloomVertex_Output {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn bloomVertex(@builtin(vertex_index) vertexIndex: u32) -> bloomVertex_Output {
  var position = vec2f(-1);
  if ((vertexIndex == 1u)) {
    position = vec2f(3, -1);
  }
  if ((vertexIndex == 2u)) {
    position = vec2f(-1, 3);
  }
  return bloomVertex_Output(vec4f(position, 0f, 1f), vec2f(((position.x * 0.5f) + 0.5f), (0.5f - (position.y * 0.5f))));
}

@group(0) @binding(3) var<uniform> settings: vec4f;

@group(0) @binding(1) var reflection: texture_2d<f32>;

@group(0) @binding(2) var sampler_1: sampler;

@group(0) @binding(0) var source: texture_2d<f32>;

fn antikyBloomSample(uv: vec2f) -> vec3f {
  return textureSampleLevel(source, sampler_1, uv, 0).rgb;
}

struct bloomFragment_Input {
  @location(0) uv: vec2f,
}

@fragment fn bloomFragment(_arg_0: bloomFragment_Input) -> @location(0) vec4f {
  let texel = settings.xy;
  let direction = settings.zw;
  if ((length(direction) < 0.5f)) {
    let reflection_1 = textureSampleLevel(reflection, sampler_1, _arg_0.uv, 0).rgb;
    let color = (antikyBloomSample(_arg_0.uv) + reflection_1);
    let luminance = dot(color, vec3f(0.2125999927520752, 0.7152000069618225, 0.0722000002861023));
    return vec4f((color * smoothstep(1f, 1.01f, luminance)), 1f);
  }
  let kernelRadius = length(direction);
  let axis = (normalize(direction) * texel);
  if ((kernelRadius < 1.5f)) {
    var color = vec3f();
    var weightTotal = 0f;
    for (var offset = -6; (offset <= 6i); offset += 1i) {
      let distance_1 = f32(offset);
      let weight = exp((-((distance_1 * distance_1)) / 18f));
      color = (color + (antikyBloomSample((_arg_0.uv + (axis * distance_1))) * weight));
      weightTotal += weight;
    }
    return vec4f((color / weightTotal), 1f);
  }
  let sigma = (kernelRadius / 3f);
  let centerWeight = (0.39894f / sigma);
  var color = (antikyBloomSample(_arg_0.uv) * centerWeight);
  for (var offset = 1; (offset < 22i); offset += 1i) {
    let distance_1 = f32(offset);
    if ((distance_1 >= kernelRadius)) {
      break;
    }
    let weight = ((0.39894f * exp((((-0.5f * distance_1) * distance_1) / (sigma * sigma)))) / sigma);
    color = (color + ((antikyBloomSample((_arg_0.uv + (axis * distance_1))) + antikyBloomSample((_arg_0.uv - (axis * distance_1)))) * weight));
  }
  return vec4f(color, 1f);
}
