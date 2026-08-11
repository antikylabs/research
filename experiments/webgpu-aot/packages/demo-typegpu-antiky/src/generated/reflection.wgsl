struct reflectionVertex_Output {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn reflectionVertex(@builtin(vertex_index) vertexIndex: u32) -> reflectionVertex_Output {
  var position = vec2f(-1);
  if ((vertexIndex == 1u)) {
    position = vec2f(3, -1);
  }
  if ((vertexIndex == 2u)) {
    position = vec2f(-1, 3);
  }
  return reflectionVertex_Output(vec4f(position, 0f, 1f), vec2f(((position.x * 0.5f) + 0.5f), (0.5f - (position.y * 0.5f))));
}

struct AntikyReflectionFrame {
  viewProjection: mat4x4f,
  model: mat4x4f,
  nearShadowViewProjection: mat4x4f,
  farShadowViewProjection: mat4x4f,
  cameraPosition: vec4f,
  settings: vec4f,
}

@group(0) @binding(4) var<uniform> frame: AntikyReflectionFrame;

@group(0) @binding(3) var depth: texture_depth_2d;

@group(0) @binding(1) var surface: texture_2d<f32>;

@group(0) @binding(2) var worldMetal: texture_2d<f32>;

fn antikyProjectReflectionPoint(position: vec3f) -> vec3f {
  let clip = (frame.viewProjection * vec4f(position, 1f));
  let ndc = (clip.xyz / max(clip.w, 1e-4f));
  return vec3f(((ndc.x * 0.5f) + 0.5f), (0.5f - (ndc.y * 0.5f)), clip.w);
}

@group(0) @binding(0) var hdr: texture_2d<f32>;

@group(0) @binding(5) var sampler_1: sampler;

fn antikyReflectionHitTransfer(hitColor: vec3f, metallic: f32, planeDistance: f32, incident: vec3f, reflected: vec3f) -> vec3f {
  let distanceRatio = (1f - (planeDistance / 100f));
  let attenuation = (distanceRatio * distanceRatio);
  let grazing = ((dot(incident, reflected) + 1f) / 2f);
  let weightedColor = (hitColor * ((metallic * attenuation) * grazing));
  let luminance = dot(weightedColor, vec3f(0.2125999927520752, 0.7152000069618225, 0.0722000002861023));
  let luminanceScale = min((10f / max(luminance, 1e-4f)), 1f);
  return (weightedColor * (luminanceScale * 0.7f));
}

@fragment fn reflectionFragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let size = vec2i(frame.settings.yz);
  let maximum = (size - vec2i(1));
  let pixel = clamp(vec2i(floor(position.xy)), vec2i(), maximum);
  if ((textureLoad(depth, pixel, 0) >= 0.99999f)) {
    return vec4f(0, 0, 0, 1);
  }
  let encodedSurface = textureLoad(surface, pixel, 0);
  let worldMetal_1 = textureLoad(worldMetal, pixel, 0);
  let normal = normalize(((encodedSurface.xyz * 2f) - vec3f(1)));
  let worldPosition = worldMetal_1.xyz;
  let view = normalize((frame.cameraPosition.xyz - worldPosition));
  let reflected = normalize(reflect(-(view), normal));
  if ((dot(reflected, normal) <= 1e-3f)) {
    return vec4f(0, 0, 0, 1);
  }
  var hitColor = vec3f();
  var planeDistance = 0f;
  var travel = 0.1599999964237213f;
  for (var step_1 = 0; (step_1 < 24i); step_1 += 1i) {
    travel += (0.1f + (f32(step_1) * 0.024f));
    let samplePosition = ((worldPosition + (normal * 0.045f)) + (reflected * travel));
    let projected = antikyProjectReflectionPoint(samplePosition);
    let uv = projected.xy;
    if ((((((projected.z <= 0f) || (uv.x <= 2e-3f)) || (uv.x >= 0.998f)) || (uv.y <= 2e-3f)) || (uv.y >= 0.998f))) {
      break;
    }
    let samplePixel = clamp(vec2i((uv * vec2f(size))), vec2i(), maximum);
    if ((textureLoad(depth, samplePixel, 0) >= 0.99999f)) {
      continue;
    }
    let scenePosition = textureLoad(worldMetal, samplePixel, 0).xyz;
    let rayDepth = distance(frame.cameraPosition.xyz, samplePosition);
    let sceneDepth = distance(frame.cameraPosition.xyz, scenePosition);
    let crossing = (rayDepth - sceneDepth);
    if ((((crossing >= 0f) && (crossing <= (0.11f + (travel * 0.028f)))) && (distance(scenePosition, worldPosition) > 0.2f))) {
      hitColor = textureSampleLevel(hdr, sampler_1, uv, 0).rgb;
      planeDistance = dot((scenePosition - worldPosition), normal);
      break;
    }
  }
  let reflection = antikyReflectionHitTransfer(hitColor, worldMetal_1.w, planeDistance, -(view), reflected);
  return vec4f(reflection, 1f);
}
