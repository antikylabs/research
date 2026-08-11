struct AntikyForwardFrame {
  viewProjection: mat4x4f,
  model: mat4x4f,
  nearShadowViewProjection: mat4x4f,
  farShadowViewProjection: mat4x4f,
  cameraPosition: vec4f,
  settings: vec4f,
}

@group(0) @binding(0) var<uniform> frame: AntikyForwardFrame;

struct forwardVertex_Output {
  @builtin(position) position: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
}

@vertex fn forwardVertex(@location(0) position: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f) -> forwardVertex_Output {
  let world = (frame.model * vec4f(position, 1f));
  return forwardVertex_Output((frame.viewProjection * world), world.xyz, normalize((frame.model * vec4f(normal, 0f)).xyz), uv);
}

@group(1) @binding(1) var baseColor: texture_2d<f32>;

@group(1) @binding(0) var sampler_1: sampler;

struct AntikyForwardMaterial {
  baseColorFactor: vec4f,
  factors: vec4f,
}

@group(1) @binding(4) var<uniform> material: AntikyForwardMaterial;

@group(1) @binding(2) var normal: texture_2d<f32>;

@group(1) @binding(3) var metallicRoughness: texture_2d<f32>;

fn antikyPbrShade(normal_1: vec3f, view: vec3f, light: vec3f, albedo: vec3f, metallic: f32, roughness: f32) -> vec3f {
  let halfway = normalize((view + light));
  let nDotL = max(dot(normal_1, light), 0f);
  let nDotH = max(dot(normal_1, halfway), 0f);
  let vDotH = max(dot(view, halfway), 0f);
  let reflectance = mix(vec3f(0.03500000014901161), albedo, metallic);
  let fresnel = (reflectance + ((vec3f(1) - reflectance) * pow((1f - vDotH), 5f)));
  let gloss = max(((2f / max((roughness * roughness), 2e-3f)) - 2f), 1f);
  let specular = (fresnel * (((gloss + 2f) / 6.283185307179586f) * pow(nDotH, gloss)));
  let diffuse = (((vec3f(1) - fresnel) * albedo) * ((1f - metallic) / 3.141592653589793f));
  return ((diffuse + specular) * nDotL);
}

struct AntikyForwardLight {
  positionRadius: vec4f,
  colorIntensity: vec4f,
}

@group(0) @binding(1) var<storage, read> lights: array<AntikyForwardLight, 64>;

@group(0) @binding(4) var shadowSampler: sampler_comparison;

fn antikySampleSunCascade(shadowMap: texture_depth_2d, viewProjection: mat4x4f, position: vec3f, bias: f32) -> f32 {
  let clip = (viewProjection * vec4f(position, 1f));
  if ((clip.w <= 0f)) {
    return 1f;
  }
  let ndc = (clip.xyz / clip.w);
  let uv = vec2f(((ndc.x * 0.5f) + 0.5f), (0.5f - (ndc.y * 0.5f)));
  const edgeGuard = 3.662109375e-4;
  if (((((((uv.x <= edgeGuard) || (uv.x >= (1f - edgeGuard))) || (uv.y <= edgeGuard)) || (uv.y >= (1f - edgeGuard))) || (ndc.z <= 0f)) || (ndc.z >= 1f))) {
    return 1f;
  }
  var visibility = 0f;
  for (var offsetY = -1; (offsetY <= 1i); offsetY += 1i) {
    for (var offsetX = -1; (offsetX <= 1i); offsetX += 1i) {
      let offset = (vec2f(f32(offsetX), f32(offsetY)) * 2.44140625e-4f);
      visibility += textureSampleCompareLevel(shadowMap, shadowSampler, (uv + offset), (ndc.z + bias));
    }
  }
  return (visibility / 9f);
}

@group(0) @binding(2) var nearShadow: texture_depth_2d;

@group(0) @binding(3) var farShadow: texture_depth_2d;

fn antikyEnvironmentDirection(direction: vec3f) -> vec3f {
  return vec3f(-(direction.x), direction.y, direction.z);
}

@group(0) @binding(6) var environmentMap: texture_cube<f32>;

@group(0) @binding(5) var environmentSampler: sampler;

fn antikyEnvironmentLighting(normal_1: vec3f, view: vec3f, albedo: vec3f, metallic: f32, roughness: f32) -> vec3f {
  let nDotV = clamp(dot(normal_1, view), 0f, 1f);
  let roughnessSquared = (roughness * roughness);
  let reflected = reflect(-(view), normal_1);
  let reflectedDirection = normalize(mix(reflected, normal_1, (roughnessSquared * roughnessSquared)));
  let irradiance = textureSampleLevel(environmentMap, environmentSampler, antikyEnvironmentDirection(normal_1), 5.76).rgb;
  let radiance = textureSampleLevel(environmentMap, environmentSampler, antikyEnvironmentDirection(reflectedDirection), (roughness * 8f)).rgb;
  let approximation = ((roughness * vec4f(-1, -0.027499999850988388, -0.5720000267028809, 0.02199999988079071)) + vec4f(1, 0.042500000447034836, 1.0399999618530273, -0.03999999910593033));
  let integrated = ((min((approximation.x * approximation.x), exp2((-9.28f * nDotV))) * approximation.x) + approximation.y);
  let dfg = ((vec2f(-1.0399999618530273, 1.0399999618530273) * integrated) + approximation.zw);
  let energyMissing = ((1f - dfg.x) - dfg.y);
  let dielectricF0 = vec3f(0.03999999910593033);
  let dielectricSingle = ((dielectricF0 * dfg.x) + vec3f(dfg.y));
  let dielectricAverage = (dielectricF0 + ((vec3f(1) - dielectricF0) / 21f));
  let dielectricMulti = (((dielectricSingle * dielectricAverage) * energyMissing) / max((vec3f(1) - (dielectricAverage * energyMissing)), vec3f(9.999999974752427e-7)));
  let metalSingle = ((albedo * dfg.x) + vec3f(dfg.y));
  let metalAverage = (albedo + ((vec3f(1) - albedo) / 21f));
  let metalMulti = (((metalSingle * metalAverage) * energyMissing) / max((vec3f(1) - (metalAverage * energyMissing)), vec3f(9.999999974752427e-7)));
  let singleScattering = mix(dielectricSingle, metalSingle, metallic);
  let multiScattering = mix(dielectricMulti, metalMulti, metallic);
  let diffuseEnergy = ((vec3f(1) - dielectricSingle) - dielectricMulti);
  let diffuse = (irradiance * ((albedo * (1f - metallic)) * diffuseEnergy));
  let specular = ((radiance * singleScattering) + (irradiance * multiScattering));
  return (diffuse + specular);
}

struct forwardFragment_Output {
  @location(0) color: vec4f,
  @location(1) surface: vec4f,
  @location(2) worldMetal: vec4f,
}

struct forwardFragment_Input {
  @location(0) worldPosition: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
}

@fragment fn forwardFragment(_arg_0: forwardFragment_Input, @builtin(front_facing) frontFacing: bool) -> forwardFragment_Output {
  let base = (textureSample(baseColor, sampler_1, _arg_0.uv) * material.baseColorFactor);
  if (((material.factors.x > 0f) && (base.a < material.factors.x))) {
    discard;;
  }
  let faceNormal = normalize(select(-(_arg_0.normal), _arg_0.normal, frontFacing));
  let pDx = dpdx(_arg_0.worldPosition);
  let pDy = dpdy(_arg_0.worldPosition);
  let uvDx = dpdx(_arg_0.uv);
  let uvDy = dpdy(_arg_0.uv);
  let determinant_1 = ((uvDx.x * uvDy.y) - (uvDx.y * uvDy.x));
  var tangent = normalize((pDx - (faceNormal * dot(faceNormal, pDx))));
  var bitangent = normalize(cross(faceNormal, tangent));
  if ((abs(determinant_1) > 1e-5f)) {
    tangent = normalize((((pDx * uvDy.y) - (pDy * uvDx.y)) / determinant_1));
    bitangent = normalize((((pDx * -(uvDy.x)) + (pDy * uvDx.x)) / determinant_1));
  }
  let mapNormal = ((textureSample(normal, sampler_1, _arg_0.uv).xyz * 2f) - vec3f(1));
  let normal_1 = normalize((((tangent * mapNormal.x) + (bitangent * mapNormal.y)) + (faceNormal * mapNormal.z)));
  let materialSample = textureSample(metallicRoughness, sampler_1, _arg_0.uv);
  let metallic = clamp((materialSample.b * material.factors.y), 0f, 1f);
  let roughness = clamp((materialSample.g * material.factors.z), 0.04f, 1f);
  let view = normalize((frame.cameraPosition.xyz - _arg_0.worldPosition));
  let sunDirection = vec3f(0.0010204070713371038, 0.9999989867210388, 0.0010204070713371038);
  let sunColor = vec3f(0.21559999883174896, 0.26269999146461487, 0.33329999446868896);
  var color = (antikyPbrShade(normal_1, view, sunDirection, base.rgb, metallic, roughness) * (sunColor * 2f));
  var pointLighting = vec3f();
  for (var index = 0; (index < 64i); index += 1i) {
    if ((index >= i32(frame.settings.x))) {
      break;
    }
    let light = (&lights[index]);
    let toLight = ((*light).positionRadius.xyz - _arg_0.worldPosition);
    let distanceSquared = dot(toLight, toLight);
    let distance_1 = sqrt(max(distanceSquared, 1e-6f));
    if ((distance_1 < (*light).positionRadius.w)) {
      let direction = (toLight / max(distance_1, 1e-3f));
      let distanceRatio = (distance_1 / (*light).positionRadius.w);
      let distanceRatioSquared = (distanceRatio * distanceRatio);
      let cutoff = clamp((1f - (distanceRatioSquared * distanceRatioSquared)), 0f, 1f);
      let attenuation = (((1f / max(distanceSquared, 0.01f)) * cutoff) * cutoff);
      pointLighting = (pointLighting + (antikyPbrShade(normal_1, view, direction, base.rgb, metallic, roughness) * ((*light).colorIntensity.rgb * ((*light).colorIntensity.w * attenuation))));
    }
  }
  let receiverPosition = (_arg_0.worldPosition + (normal_1 * 0.015f));
  let nearVisibility = antikySampleSunCascade(nearShadow, frame.nearShadowViewProjection, receiverPosition, -1.5e-4f);
  let farVisibility = antikySampleSunCascade(farShadow, frame.farShadowViewProjection, receiverPosition, -3e-4f);
  let viewDepth = dot((_arg_0.worldPosition - frame.cameraPosition.xyz), vec3f(-0.9881741404533386, -0.14875739812850952, 0.03718934953212738));
  var shadow = mix(nearVisibility, farVisibility, smoothstep(25.72128055077705f, 27.490997109391337f, viewDepth));
  if ((viewDepth <= 25.72128055077705f)) {
    shadow = nearVisibility;
  }
  if ((viewDepth >= 27.490997109391337f)) {
    shadow = farVisibility;
  }
  let environment = antikyEnvironmentLighting(normal_1, view, base.rgb, metallic, roughness);
  color = (((color * shadow) + pointLighting) + environment);
  return forwardFragment_Output(vec4f(color, base.a), vec4f(((normal_1 * 0.5f) + 0.5f), roughness), vec4f(_arg_0.worldPosition, metallic));
}
