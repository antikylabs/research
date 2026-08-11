import package::scene_types::Frame;

struct ReflectionVertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var reflectionHdr: texture_2d<f32>;
@group(0) @binding(1) var reflectionSurface: texture_2d<f32>;
@group(0) @binding(2) var reflectionWorldMetal: texture_2d<f32>;
@group(0) @binding(3) var<uniform> reflectionFrame: Frame;
@group(0) @binding(4) var reflectionSampler: sampler;

@group(0) @binding(5) var reconstructionSource: texture_2d<f32>;
@group(0) @binding(6) var reconstructionSampler: sampler;
@group(0) @binding(7) var<uniform> reconstructionSettings: vec4f;
@group(0) @binding(8) var reflectionRoughness: texture_2d<f32>;

@vertex
fn reflectionVertex(@builtin(vertex_index) index: u32) -> ReflectionVertexOutput {
  let x = f32(i32(index & 1u) * 4 - 1);
  let y = f32(i32(index >> 1u) * 4 - 1);
  var output: ReflectionVertexOutput;
  output.position = vec4f(x, y, 0.0, 1.0);
  output.uv = vec2f(x + 1.0, 1.0 - y) * 0.5;
  return output;
}

fn projectReflectionPoint(position: vec3f) -> vec3f {
  let clip = reflectionFrame.viewProjection * vec4f(position, 1.0);
  let ndc = clip.xyz / max(clip.w, 0.0001);
  return vec3f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5, clip.w);
}

fn weslReflectionHitTransfer(
  hitColor: vec3f,
  metallic: f32,
  planeDistance: f32,
  incident: vec3f,
  reflected: vec3f,
) -> vec3f {
  let distanceRatio = 1.0 - planeDistance / 100.0;
  let attenuation = distanceRatio * distanceRatio;
  let grazing = (dot(incident, reflected) + 1.0) / 2.0;
  let weightedColor = hitColor * metallic * attenuation * grazing;
  let luminance = dot(weightedColor, vec3f(0.2126, 0.7152, 0.0722));
  let luminanceScale = min(10.0 / max(luminance, 0.0001), 1.0);
  return weightedColor * luminanceScale * 0.7;
}

@fragment
fn reflectionFragment(input: ReflectionVertexOutput) -> @location(0) vec4f {
  let size = vec2i(reflectionFrame.settings.yz);
  let maximum = size - vec2i(1);
  let pixel = clamp(vec2i(floor(input.position.xy)), vec2i(0), maximum);
  let encodedSurface = textureLoad(reflectionSurface, pixel, 0);
  if (encodedSurface.w <= 0.0) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  let worldMetal = textureLoad(reflectionWorldMetal, pixel, 0);
  let normal = normalize(encodedSurface.xyz * 2.0 - 1.0);
  let world = worldMetal.xyz;
  let view = normalize(reflectionFrame.cameraPosition.xyz - world);
  let reflected = normalize(reflect(-view, normal));
  if (dot(reflected, normal) <= 0.001) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  var hitColor = vec3f(0.0);
  var planeDistance = 0.0;
  var travel = 0.16;
  for (var step = 0; step < 24; step += 1) {
    travel += 0.1 + f32(step) * 0.024;
    let samplePosition = world + normal * 0.045 + reflected * travel;
    let projected = projectReflectionPoint(samplePosition);
    let uv = projected.xy;
    if (
      projected.z <= 0.0 ||
      uv.x <= 0.002 || uv.x >= 0.998 ||
      uv.y <= 0.002 || uv.y >= 0.998
    ) {
      break;
    }
    let samplePixel = clamp(vec2i(uv * vec2f(size)), vec2i(0), maximum);
    let sampledSurface = textureLoad(reflectionSurface, samplePixel, 0);
    if (sampledSurface.w <= 0.0) {
      continue;
    }
    let scenePosition = textureLoad(reflectionWorldMetal, samplePixel, 0).xyz;
    let rayDepth = distance(reflectionFrame.cameraPosition.xyz, samplePosition);
    let sceneDepth = distance(reflectionFrame.cameraPosition.xyz, scenePosition);
    let crossing = rayDepth - sceneDepth;
    if (
      crossing >= 0.0 &&
      crossing <= 0.11 + travel * 0.028 &&
      distance(scenePosition, world) > 0.2
    ) {
      hitColor = textureSampleLevel(
        reflectionHdr,
        reflectionSampler,
        uv,
        0.0,
      ).rgb;
      planeDistance = dot(scenePosition - world, normal);
      break;
    }
  }

  return vec4f(
    weslReflectionHitTransfer(
      hitColor,
      worldMetal.w,
      planeDistance,
      -view,
      reflected,
    ),
    1.0,
  );
}

@fragment
fn reflectionReconstructFragment(
  input: ReflectionVertexOutput,
) -> @location(0) vec4f {
  let spread = reconstructionSettings.z;
  if (spread < 0.5) {
    return textureLoad(
      reconstructionSource,
      vec2i(floor(input.position.xy)),
      0,
    );
  }
  var color = vec3f(0.0);
  for (var x = -3; x <= 3; x += 1) {
    for (var y = -3; y <= 3; y += 1) {
      let uv = input.uv + vec2f(f32(x), f32(y)) *
        reconstructionSettings.xy * spread;
      color += textureSampleLevel(
        reconstructionSource,
        reconstructionSampler,
        uv,
        0.0,
      ).rgb;
    }
  }
  return vec4f(color / 49.0, 1.0);
}

@fragment
fn reflectionSelectFragment(
  input: ReflectionVertexOutput,
) -> @location(0) vec4f {
  let pixel = vec2i(floor(input.position.xy));
  let roughness = clamp(textureLoad(reflectionRoughness, pixel, 0).w, 0.0, 1.0);
  let lod = roughness * roughness * 4.0;
  return textureSampleLevel(
    reconstructionSource,
    reconstructionSampler,
    input.uv,
    lod,
  );
}
