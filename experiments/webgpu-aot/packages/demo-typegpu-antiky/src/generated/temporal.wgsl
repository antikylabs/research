struct temporalVertex_Output {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn temporalVertex(@builtin(vertex_index) vertexIndex: u32) -> temporalVertex_Output {
  var position = vec2f(-1);
  if ((vertexIndex == 1u)) {
    position = vec2f(3, -1);
  }
  if ((vertexIndex == 2u)) {
    position = vec2f(-1, 3);
  }
  return temporalVertex_Output(vec4f(position, 0f, 1f), vec2f(((position.x * 0.5f) + 0.5f), (0.5f - (position.y * 0.5f))));
}

@group(0) @binding(3) var<uniform> settings: vec4f;

@group(0) @binding(0) var currentHdr: texture_2d<f32>;

@group(0) @binding(1) var ambient: texture_2d<f32>;

fn antikyTemporalCurrent(pixel: vec2i) -> vec3f {
  let color = textureLoad(currentHdr, pixel, 0).rgb;
  let ambient_1 = textureLoad(ambient, pixel, 0).r;
  return (color * ambient_1);
}

@group(0) @binding(2) var history: texture_2d<f32>;

fn antikyTemporalClipAabb(historyColor: vec3f, minimumColor: vec3f, maximumColor: vec3f) -> vec3f {
  let center = ((maximumColor + minimumColor) * 0.5f);
  let extent = (((maximumColor - minimumColor) * 0.5f) + vec3f(1.0000000116860974e-7));
  let delta = (historyColor - center);
  let unit = abs((delta / extent));
  let maximumUnit = max(max(unit.x, unit.y), unit.z);
  return select(historyColor, (center + (delta / maximumUnit)), (maximumUnit > 1f));
}

@fragment fn temporalFragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let size = vec2i(settings.xy);
  let maximumPixel = (size - vec2i(1));
  let pixel = clamp(vec2i(floor(position.xy)), vec2i(), maximumPixel);
  var firstMoment = vec3f();
  var secondMoment = vec3f();
  for (var y = -1; (y <= 1i); y += 1i) {
    for (var x = -1; (x <= 1i); x += 1i) {
      let samplePixel = clamp((pixel + vec2i(x, y)), vec2i(), maximumPixel);
      let neighbor = max(antikyTemporalCurrent(samplePixel), vec3f());
      firstMoment = (firstMoment + neighbor);
      secondMoment = (secondMoment + (neighbor * neighbor));
    }
  }
  let hasValidHistory = (settings.z > 0f);
  let currentColor = antikyTemporalCurrent(pixel);
  let mean = (firstMoment / 9f);
  let deviation = sqrt(max(((secondMoment / 9f) - (mean * mean)), vec3f()));
  let minimumColor = (mean - deviation);
  let maximumColor = (mean + deviation);
  let historyColor = textureLoad(history, pixel, 0).rgb;
  let clippedHistory = antikyTemporalClipAabb(historyColor, minimumColor, maximumColor);
  var currentWeight = select(1f, 0.05000000074505806f, hasValidHistory);
  var historyWeight = (1f - currentWeight);
  let luma = vec3f(0.2125999927520752, 0.7152000069618225, 0.0722000002861023);
  let compressedCurrent = (currentColor / (max(max(currentColor.r, currentColor.g), currentColor.b) + 1f));
  let compressedHistory = (clippedHistory / (max(max(clippedHistory.r, clippedHistory.g), clippedHistory.b) + 1f));
  currentWeight *= (1f / (dot(compressedCurrent, luma) + 1f));
  historyWeight *= (1f / (dot(compressedHistory, luma) + 1f));
  let resolved = (((currentColor * currentWeight) + (clippedHistory * historyWeight)) / max((currentWeight + historyWeight), 1e-5f));
  return vec4f(max(resolved, vec3f()), 1f);
}
