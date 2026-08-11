struct Frame {
  viewProjection: mat4x4f,
  model: mat4x4f,
  cameraPosition: vec4f,
  params: vec4f,
}

const SUN_DIRECTION: vec3f = vec3f(0.0010204071007844963, 0.9999989587688064, 0.0010204071007844963);
const SUN_COLOR: vec3f = vec3f(0.2156, 0.2627, 0.3333);
const SUN_INTENSITY: f32 = 2.0;

struct Light {
  positionRadius: vec4f,
  colorIntensity: vec4f,
}

struct ScreenOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

struct LightingOut {
  @location(0) color: vec4f,
  @location(1) ambient: vec4f,
}

struct SunShadow {
  nearViewProjection: mat4x4f,
  farViewProjection: mat4x4f,
  cascadeDistances: vec4f,
  biasesTexelSize: vec4f,
  cameraForwardNormalBias: vec4f,
}

@group(0) @binding(0) var albedoTexture: texture_2d<f32>;

@group(0) @binding(1) var normalRoughnessTexture: texture_2d<f32>;

@group(0) @binding(2) var worldMetalTexture: texture_2d<f32>;

@group(0) @binding(3) var depthTexture: texture_depth_2d;

@group(0) @binding(4) var<storage, read> lights: array<Light>;

@group(0) @binding(5) var<uniform> frame: Frame;

@group(0) @binding(6) var nearShadowMap: texture_depth_2d;

@group(0) @binding(7) var farShadowMap: texture_depth_2d;

@group(0) @binding(8) var shadowSampler: sampler_comparison;

@group(0) @binding(9) var<uniform> sunShadow: SunShadow;

@group(0) @binding(10) var environmentTexture: texture_cube<f32>;

@group(0) @binding(11) var environmentSampler: sampler;

@group(0) @binding(12) var<uniform> ambientSettings: vec4f;

@vertex
fn screenVertex(@builtin(vertex_index) index: u32) -> ScreenOut {
var output: ScreenOut;
  let x = f32(i32(index & 1u) * 4 - 1);
  let y = f32(i32(index >> 1u) * 4 - 1);
  output.position = vec4f(x, y, 0.0, 1.0);
  output.uv = vec2f(x + 1.0, 1.0 - y) * 0.5;
  return output;
}

fn fresnelSchlick(cosTheta: f32, baseReflectance: vec3f) -> vec3f {
return baseReflectance + (vec3f(1.0) - baseReflectance) * pow(1.0 - cosTheta, 5.0);
}

fn distributionGGX(normal: vec3f, halfway: vec3f, roughness: f32) -> f32 {
let a = roughness * roughness;
  let a2 = a * a;
  let nDotH = max(dot(normal, halfway), 0.0);
  let denominator = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / max(3.14159265 * denominator * denominator, 0.0001);
}

fn visibilityGGXCorrelated(alpha: f32, nDotL: f32, nDotV: f32) -> f32 {
let alphaSquared = alpha * alpha;
  let lightTerm = nDotL * sqrt(
    alphaSquared + (1.0 - alphaSquared) * nDotV * nDotV,
  );
  let viewTerm = nDotV * sqrt(
    alphaSquared + (1.0 - alphaSquared) * nDotL * nDotL,
  );
  return 0.5 / max(lightTerm + viewTerm, 0.000001);
}

fn directDfgApproximation(roughness: f32, nDotDirection: f32) -> vec2f {
let approximation = roughness * vec4f(-1.0, -0.0275, -0.572, 0.022) +
    vec4f(1.0, 0.0425, 1.04, -0.04);
  let integrated = min(
    approximation.x * approximation.x,
    exp2(-9.28 * nDotDirection),
  ) * approximation.x + approximation.y;
  return vec2f(-1.04, 1.04) * integrated + approximation.zw;
}

fn directMultiScattering(baseReflectance: vec3f, roughness: f32, nDotV: f32, nDotL: f32) -> vec3f {
let viewDfg = directDfgApproximation(roughness, nDotV);
  let lightDfg = directDfgApproximation(roughness, nDotL);
  let viewSingle = baseReflectance * viewDfg.x + vec3f(viewDfg.y);
  let lightSingle = baseReflectance * lightDfg.x + vec3f(lightDfg.y);
  let average = baseReflectance +
    (vec3f(1.0) - baseReflectance) / 21.0;
  let viewMissing = 1.0 - viewDfg.x - viewDfg.y;
  let lightMissing = 1.0 - lightDfg.x - lightDfg.y;
  let missing = viewMissing * lightMissing;
  return viewSingle * lightSingle * average * missing /
    max(
      vec3f(1.0) - average * average * missing,
      vec3f(0.000001),
    );
}

fn brdf(normal: vec3f, view: vec3f, light: vec3f, albedo: vec3f, metallic: f32, roughness: f32) -> vec3f {
let halfway = normalize(view + light);
  let nDotV = max(dot(normal, view), 0.0);
  let nDotL = max(dot(normal, light), 0.0);
  let nDotH = max(dot(normal, halfway), 0.0);
  let baseReflectance = mix(vec3f(0.04), albedo, metallic);
  let fresnel = fresnelSchlick(max(dot(halfway, view), 0.0), baseReflectance);
  let alpha = roughness * roughness;
  let distribution = distributionGGX(normal, halfway, roughness);
  let visibility = visibilityGGXCorrelated(alpha, nDotL, nDotV);
  let specular = fresnel * distribution * visibility +
    directMultiScattering(baseReflectance, roughness, nDotV, nDotL);
  let diffuse = albedo * (1.0 - metallic) / 3.14159265;
  return diffuse + specular;
}

fn ambientOcclusion(pixel: vec2i) -> f32 {
let maximum = vec2i(ambientSettings.xy) - vec2i(1);
  let centerDepth = textureLoad(depthTexture, pixel, 0);
  if (centerDepth >= 0.99999) {
    return 1.0;
  }
  let centerNormal = normalize(
    textureLoad(normalRoughnessTexture, pixel, 0).xyz * 2.0 - vec3f(1.0),
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
    let sampleDepth = textureLoad(depthTexture, samplePixel, 0);
    let sampleNormal = normalize(
      textureLoad(normalRoughnessTexture, samplePixel, 0).xyz * 2.0 - vec3f(1.0),
    );
    let depthOcclusion = smoothstep(
      0.00025,
      0.005 + radius * 0.00035,
      centerDepth - sampleDepth,
    );
    let normalCrease = clamp(1.0 - dot(centerNormal, sampleNormal), 0.0, 1.0);
    occlusion += depthOcclusion * (0.7 + normalCrease * 0.3);
  }
  return clamp(1.0 - (occlusion / 16.0) * ambientSettings.w, 0.38, 1.0);
}

fn softShadowVisibility(shadowMap: texture_depth_2d, viewProjection: mat4x4f, position: vec3f, normal: vec3f, bias: f32) -> f32 {
let normalBiasedPosition = position +
    normal * sunShadow.cameraForwardNormalBias.w;
  let clip = viewProjection * vec4f(normalBiasedPosition, 1.0);
  if (clip.w <= 0.0) {
    return 1.0;
  }
  let ndc = clip.xyz / clip.w;
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  let edge = sunShadow.biasesTexelSize.z * 1.5;
  if (
    uv.x <= edge || uv.x >= 1.0 - edge ||
    uv.y <= edge || uv.y >= 1.0 - edge ||
    ndc.z <= 0.0 || ndc.z >= 1.0
  ) {
    return 1.0;
  }
  var visibility = 0.0;
  for (var offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (var offsetX = -1; offsetX <= 1; offsetX += 1) {
      let offset = vec2f(f32(offsetX), f32(offsetY)) *
        sunShadow.biasesTexelSize.z;
      visibility += textureSampleCompareLevel(
        shadowMap,
        shadowSampler,
        uv + offset,
        ndc.z + bias,
      );
    }
  }
  return visibility / 9.0;
}

fn shadowVisibility(position: vec3f, normal: vec3f) -> f32 {
let viewDepth = dot(
    position - frame.cameraPosition.xyz,
    sunShadow.cameraForwardNormalBias.xyz,
  );
  let nearVisibility = softShadowVisibility(
    nearShadowMap,
    sunShadow.nearViewProjection,
    position,
    normal,
    sunShadow.biasesTexelSize.x,
  );
  if (viewDepth <= sunShadow.cascadeDistances.y) {
    return nearVisibility;
  }
  let farVisibility = softShadowVisibility(
    farShadowMap,
    sunShadow.farViewProjection,
    position,
    normal,
    sunShadow.biasesTexelSize.y,
  );
  if (viewDepth >= sunShadow.cascadeDistances.z) {
    return farVisibility;
  }
  let fade = smoothstep(
    sunShadow.cascadeDistances.y,
    sunShadow.cascadeDistances.z,
    viewDepth,
  );
  return mix(nearVisibility, farVisibility, fade);
}

fn environmentBrdf(normal: vec3f, view: vec3f, albedo: vec3f, metallic: f32, roughness: f32, ao: f32) -> vec3f {
let nDotV = clamp(dot(normal, view), 0.0, 1.0);
  let reflected = reflect(-view, normal);
  let roughnessSquared = roughness * roughness;
  let reflectedDirection = normalize(mix(
    reflected,
    normal,
    roughnessSquared * roughnessSquared,
  ));
  let environmentNormal = vec3f(-normal.x, normal.y, normal.z);
  let environmentReflection = vec3f(
    -reflectedDirection.x,
    reflectedDirection.y,
    reflectedDirection.z,
  );
  let irradiance = textureSampleLevel(
    environmentTexture,
    environmentSampler,
    environmentNormal,
    5.76,
  ).rgb;
  let radiance = textureSampleLevel(
    environmentTexture,
    environmentSampler,
    environmentReflection,
    roughness * 8.0,
  ).rgb;

  let approximation = roughness * vec4f(-1.0, -0.0275, -0.572, 0.022) +
    vec4f(1.0, 0.0425, 1.04, -0.04);
  let integrated = min(
    approximation.x * approximation.x,
    exp2(-9.28 * nDotV),
  ) * approximation.x + approximation.y;
  let dfg = vec2f(-1.04, 1.04) * integrated + approximation.zw;
  let energyMissing = 1.0 - dfg.x - dfg.y;

  let dielectricF0 = vec3f(0.04);
  let dielectricSingle = dielectricF0 * dfg.x + vec3f(dfg.y);
  let dielectricAverage = dielectricF0 + (vec3f(1.0) - dielectricF0) / 21.0;
  let dielectricMulti = dielectricSingle * dielectricAverage * energyMissing /
    max(
      vec3f(1.0) - dielectricAverage * energyMissing,
      vec3f(0.000001),
    );
  let metalSingle = albedo * dfg.x + vec3f(dfg.y);
  let metalAverage = albedo + (vec3f(1.0) - albedo) / 21.0;
  let metalMulti = metalSingle * metalAverage * energyMissing /
    max(vec3f(1.0) - metalAverage * energyMissing, vec3f(0.000001));
  let singleScattering = mix(dielectricSingle, metalSingle, metallic);
  let multiScattering = mix(dielectricMulti, metalMulti, metallic);
  let diffuseEnergy = vec3f(1.0) - dielectricSingle - dielectricMulti;
  let specularOcclusion = clamp(
    ao + pow(nDotV + ao, exp2(-1.0 - 16.0 * roughness)) - 1.0,
    0.0,
    1.0,
  );
  let diffuse = irradiance * albedo * (1.0 - metallic) * diffuseEnergy * ao;
  let specular = (
    radiance * singleScattering + irradiance * multiScattering
  ) * specularOcclusion;
  return diffuse + specular;
}

@fragment
fn lightingFragment(input: ScreenOut) -> LightingOut {
let pixel = vec2i(floor(input.position.xy));
  let depth = textureLoad(depthTexture, pixel, 0);
  var output: LightingOut;
  if (depth >= 0.99999) {
    let sky = mix(vec3f(0.004, 0.006, 0.012), vec3f(0.018, 0.024, 0.038), pow(1.0 - input.uv.y, 2.0));
    output.color = vec4f(sky, 1.0);
    output.ambient = vec4f(1.0, 0.0, 0.0, 1.0);
    return output;
  }

  let albedo = textureLoad(albedoTexture, pixel, 0).rgb;
  let normalRoughness = textureLoad(normalRoughnessTexture, pixel, 0);
  let worldMetal = textureLoad(worldMetalTexture, pixel, 0);
  let normal = normalize(normalRoughness.xyz * 2.0 - vec3f(1.0));
  let roughness = normalRoughness.w;
  let metallic = worldMetal.w;
  let position = worldMetal.xyz;
  let view = normalize(frame.cameraPosition.xyz - position);
  let ao = ambientOcclusion(pixel);

  let sunNdotL = max(dot(normal, SUN_DIRECTION), 0.0);
  let sunVisibility = shadowVisibility(position, normal);
  var color = brdf(normal, view, SUN_DIRECTION, albedo, metallic, roughness) *
    SUN_COLOR * SUN_INTENSITY * sunNdotL * sunVisibility;

  let lightCount = u32(frame.params.x);
  for (var index = 0u; index < lightCount; index += 1u) {
    let lightData = lights[index];
    let toLight = lightData.positionRadius.xyz - position;
    let distanceSquared = dot(toLight, toLight);
    let distanceToLight = sqrt(max(distanceSquared, 0.000001));
    let radius = lightData.positionRadius.w;
    if (distanceToLight < radius) {
      let lightDirection = toLight / max(distanceToLight, 0.001);
      let distanceRatio = distanceToLight / radius;
      let distanceRatioSquared = distanceRatio * distanceRatio;
      let cutoff = clamp(
        1.0 - distanceRatioSquared * distanceRatioSquared,
        0.0,
        1.0,
      );
      let attenuation = 1.0 / max(distanceSquared, 0.01) * cutoff * cutoff;
      let radiance = lightData.colorIntensity.rgb * lightData.colorIntensity.w * attenuation;
      color += brdf(normal, view, lightDirection, albedo, metallic, roughness) *
        radiance * max(dot(normal, lightDirection), 0.0);
    }
  }

  color += environmentBrdf(normal, view, albedo, metallic, roughness, 1.0);
  output.color = vec4f(color, 1.0);
  output.ambient = vec4f(ao, 0.0, 0.0, 1.0);
  return output;
}
