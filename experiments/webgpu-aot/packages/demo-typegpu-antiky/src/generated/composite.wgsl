struct compositeVertex_Output {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn compositeVertex(@builtin(vertex_index) vertexIndex: u32) -> compositeVertex_Output {
  var position = vec2f(-1);
  if ((vertexIndex == 1u)) {
    position = vec2f(3, -1);
  }
  if ((vertexIndex == 2u)) {
    position = vec2f(-1, 3);
  }
  return compositeVertex_Output(vec4f(position, 0f, 1f), vec2f(((position.x * 0.5f) + 0.5f), (0.5f - (position.y * 0.5f))));
}

@group(0) @binding(0) var temporal: texture_2d<f32>;

@group(0) @binding(6) var reflection: texture_2d<f32>;

@group(0) @binding(7) var sampler_1: sampler;

@group(0) @binding(1) var bloomLevel0: texture_2d<f32>;

@group(0) @binding(2) var bloomLevel1: texture_2d<f32>;

@group(0) @binding(3) var bloomLevel2: texture_2d<f32>;

@group(0) @binding(4) var bloomLevel3: texture_2d<f32>;

@group(0) @binding(5) var bloomLevel4: texture_2d<f32>;

fn antikyCombinedBloom(uv: vec2f) -> vec3f {
  let level0 = textureSampleLevel(bloomLevel0, sampler_1, uv, 0).rgb;
  let level1 = textureSampleLevel(bloomLevel1, sampler_1, uv, 0).rgb;
  let level2 = textureSampleLevel(bloomLevel2, sampler_1, uv, 0).rgb;
  let level3 = textureSampleLevel(bloomLevel3, sampler_1, uv, 0).rgb;
  let level4 = textureSampleLevel(bloomLevel4, sampler_1, uv, 0).rgb;
  return (((level0 * 0.179496f) + (level1 * 0.143748f)) + (((level2 * 0.108f) + (level3 * 0.072252f)) + (level4 * 0.036504f)));
}

@group(0) @binding(8) var<uniform> settings: vec4f;

fn antikyAcesFilmicToneMapping(color: vec3f) -> vec3f {
  let exposed = (color / 0.6f);
  let inputColor = vec3f((((exposed.r * 0.59719f) + (exposed.g * 0.35458f)) + (exposed.b * 0.04823f)), (((exposed.r * 0.076f) + (exposed.g * 0.90834f)) + (exposed.b * 0.01566f)), (((exposed.r * 0.0284f) + (exposed.g * 0.13383f)) + (exposed.b * 0.83777f)));
  let fitted = (((inputColor * (inputColor + vec3f(0.024578599259257317))) - vec3f(9.053700341610238e-5)) / ((inputColor * ((inputColor + vec3f(0.4329510033130646)) * vec3f(0.9837290048599243))) + vec3f(0.23808099329471588)));
  return clamp(vec3f((((fitted.r * 1.60475f) - (fitted.g * 0.53108f)) - (fitted.b * 0.07367f)), (((fitted.r * -0.10208f) + (fitted.g * 1.10813f)) - (fitted.b * 0.00605f)), (((fitted.r * -0.00327f) - (fitted.g * 0.07276f)) + (fitted.b * 1.07602f))), vec3f(), vec3f(1));
}

fn antikySrgbTransferOetf(color: vec3f) -> vec3f {
  let high = ((pow(color, vec3f(0.41666001081466675)) * vec3f(1.0549999475479126)) - vec3f(0.054999999701976776));
  let low = (color * vec3f(12.920000076293945));
  return vec3f(select(high.r, low.r, (color.r <= 0.0031308f)), select(high.g, low.g, (color.g <= 0.0031308f)), select(high.b, low.b, (color.b <= 0.0031308f)));
}

struct compositeFragment_Input {
  @location(0) uv: vec2f,
}

@fragment fn compositeFragment(_arg_0: compositeFragment_Input, @builtin(position) position: vec4f) -> @location(0) vec4f {
  let pixel = vec2i(floor(position.xy));
  var current = textureLoad(temporal, pixel, 0).rgb;
  let reflection_1 = textureSampleLevel(reflection, sampler_1, _arg_0.uv, 0).rgb;
  current = (current + reflection_1);
  let bloom = antikyCombinedBloom(_arg_0.uv);
  let linearDisplay = (current + bloom);
  let toneMapped = antikyAcesFilmicToneMapping((linearDisplay * settings.y));
  let display = antikySrgbTransferOetf(toneMapped);
  return vec4f(display, 1f);
}
