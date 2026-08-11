struct TemporalSettings { values: vec4f, }

struct ScreenOut { @builtin(position) position: vec4f, @location(0) uv: vec2f, }

@group(0) @binding(0) var currentHdr: texture_2d<f32>;

@group(0) @binding(1) var history: texture_2d<f32>;

@group(0) @binding(2) var ambient: texture_2d<f32>;

@group(0) @binding(3) var<uniform> settings: TemporalSettings;

@vertex
fn temporalVertex(@builtin(vertex_index) index: u32) -> ScreenOut {
var output: ScreenOut;
  let x = f32(i32(index & 1u) * 4 - 1);
  let y = f32(i32(index >> 1u) * 4 - 1);
  output.position = vec4f(x, y, 0.0, 1.0);
  output.uv = vec2f(x + 1.0, 1.0 - y) * 0.5;
  return output;
}

fn temporalCurrent(pixel: vec2i) -> vec3f {
return textureLoad(currentHdr, pixel, 0).rgb *
    textureLoad(ambient, pixel, 0).r;
}

fn temporalClipAabb(value: vec3f, minimum: vec3f, maximum: vec3f) -> vec3f {
let center = (minimum + maximum) * 0.5;
  let extent = (maximum - minimum) * 0.5 + vec3f(0.0000001);
  let delta = value - center;
  let unit = abs(delta / extent);
  let maximumUnit = max(max(unit.x, unit.y), unit.z);
  return select(value, center + delta / maximumUnit, maximumUnit > 1.0);
}

@fragment
fn temporalFragment(input: ScreenOut) -> @location(0) vec4f {
let size = vec2i(settings.values.xy);
  let maximumPixel = size - vec2i(1);
  let pixel = clamp(vec2i(floor(input.position.xy)), vec2i(0), maximumPixel);
  var firstMoment = vec3f(0.0);
  var secondMoment = vec3f(0.0);
  for (var y = -1; y <= 1; y += 1) {
    for (var x = -1; x <= 1; x += 1) {
      let samplePixel = clamp(pixel + vec2i(x, y), vec2i(0), maximumPixel);
      let neighbor = max(temporalCurrent(samplePixel), vec3f(0.0));
      firstMoment += neighbor;
      secondMoment += neighbor * neighbor;
    }
  }
  let mean = firstMoment / 9.0;
  let deviation = sqrt(max(secondMoment / 9.0 - mean * mean, vec3f(0.0)));
  let currentColor = temporalCurrent(pixel);
  let historyColor = temporalClipAabb(textureLoad(history, pixel, 0).rgb, mean - deviation, mean + deviation);
  var currentWeight = 1.0;
  if (settings.values.z > 0.0) { currentWeight = 0.05; }
  var historyWeight = 1.0 - currentWeight;
  let luma = vec3f(0.2126, 0.7152, 0.0722);
  let compressedCurrent = currentColor / (max(max(currentColor.r, currentColor.g), currentColor.b) + 1.0);
  let compressedHistory = historyColor / (max(max(historyColor.r, historyColor.g), historyColor.b) + 1.0);
  currentWeight *= 1.0 / (dot(compressedCurrent, luma) + 1.0);
  historyWeight *= 1.0 / (dot(compressedHistory, luma) + 1.0);
  let resolved = (currentColor * currentWeight + historyColor * historyWeight) /
    max(currentWeight + historyWeight, 0.00001);
  return vec4f(max(resolved, vec3f(0.0)), 1.0);
}
