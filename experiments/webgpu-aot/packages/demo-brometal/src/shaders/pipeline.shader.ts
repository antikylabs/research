import { compileShader, type ShaderDefinition } from "../compiler.js";
import {
  BROMETAL_SUN,
  broMetalWGSLFloat,
  broMetalWGSLVector3,
} from "../sun.js";
import { buildReflectionShader } from "./reflection.shader.js";
import { buildReflectionReconstructShader } from "./reflection-reconstruct.shader.js";
import { buildReflectionSelectShader } from "./reflection-select.shader.js";
import { buildTemporalShader } from "./temporal.shader.js";

const frameDeclaration = `
struct Frame {
  viewProjection: mat4x4f,
  model: mat4x4f,
  cameraPosition: vec4f,
  params: vec4f,
}`;

const sunDeclaration = `
const SUN_DIRECTION: vec3f = ${broMetalWGSLVector3(BROMETAL_SUN.direction)};
const SUN_COLOR: vec3f = ${broMetalWGSLVector3(BROMETAL_SUN.color)};
const SUN_INTENSITY: f32 = ${broMetalWGSLFloat(BROMETAL_SUN.intensity)};`;

const screenVertex = {
  attributes: ["@vertex"],
  signature: "screenVertex(@builtin(vertex_index) index: u32) -> ScreenOut",
  body: `
  var output: ScreenOut;
  let x = f32(i32(index & 1u) * 4 - 1);
  let y = f32(i32(index >> 1u) * 4 - 1);
  output.position = vec4f(x, y, 0.0, 1.0);
  output.uv = vec2f(x + 1.0, 1.0 - y) * 0.5;
  return output;`,
} as const;

const shadowDefinition = {
  declarations: [frameDeclaration],
  bindings: [
    { group: 0, binding: 0, declaration: "var<uniform> frame: Frame" },
  ],
  functions: [
    {
      attributes: ["@vertex"],
      signature:
        "shadowVertex(@location(0) position: vec3f) -> @builtin(position) vec4f",
      body: `
  return frame.viewProjection * frame.model * vec4f(position, 1.0);`,
    },
  ],
} satisfies ShaderDefinition;

const geometryDefinition = {
  declarations: [
    frameDeclaration,
    `struct Material {
  baseColorFactor: vec4f,
  factors: vec4f,
}`,
    `struct GeometryVertexOut {
  @builtin(position) position: vec4f,
  @location(0) worldPosition: vec3f,
  @location(1) uv: vec2f,
  @location(2) normal: vec3f,
  @location(3) tangent: vec4f,
}`,
    `struct GBufferOut {
  @location(0) albedo: vec4f,
  @location(1) normalRoughness: vec4f,
  @location(2) worldMetal: vec4f,
}`,
  ],
  bindings: [
    { group: 0, binding: 0, declaration: "var<uniform> frame: Frame" },
    { group: 1, binding: 0, declaration: "var materialSampler: sampler" },
    {
      group: 1,
      binding: 1,
      declaration: "var baseColorTexture: texture_2d<f32>",
    },
    {
      group: 1,
      binding: 2,
      declaration: "var normalTexture: texture_2d<f32>",
    },
    {
      group: 1,
      binding: 3,
      declaration: "var metallicRoughnessTexture: texture_2d<f32>",
    },
    { group: 1, binding: 4, declaration: "var<uniform> material: Material" },
  ],
  functions: [
    {
      attributes: ["@vertex"],
      signature:
        "geometryVertex(@location(0) position: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f, @location(3) tangent: vec4f) -> GeometryVertexOut",
      body: `
  var output: GeometryVertexOut;
  let worldPosition = frame.model * vec4f(position, 1.0);
  output.position = frame.viewProjection * worldPosition;
  output.worldPosition = worldPosition.xyz;
  output.uv = uv;
  output.normal = normalize((frame.model * vec4f(normal, 0.0)).xyz);
  output.tangent = vec4f(
    normalize((frame.model * vec4f(tangent.xyz, 0.0)).xyz),
    tangent.w,
  );
  return output;`,
    },
    {
      attributes: ["@fragment"],
      signature:
        "geometryFragment(input: GeometryVertexOut, @builtin(front_facing) frontFacing: bool) -> GBufferOut",
      body: `
  let base = textureSample(baseColorTexture, materialSampler, input.uv) * material.baseColorFactor;
  if (material.factors.x > 0.0 && base.a < material.factors.x) {
    discard;
  }

  let faceDirection = select(-1.0, 1.0, frontFacing);
  let geometricNormal = normalize(input.normal * faceDirection);
  let tangent = normalize(input.tangent.xyz * faceDirection);
  let bitangent = normalize(cross(input.normal, input.tangent.xyz) * input.tangent.w);
  let sampledNormal = textureSample(normalTexture, materialSampler, input.uv).xyz * 2.0 - 1.0;
  let worldNormal = normalize(mat3x3f(tangent, bitangent, geometricNormal) * sampledNormal);
  let metallicRoughness = textureSample(
    metallicRoughnessTexture,
    materialSampler,
    input.uv,
  );

  var output: GBufferOut;
  output.albedo = vec4f(base.rgb, base.a);
  output.normalRoughness = vec4f(
    worldNormal * 0.5 + vec3f(0.5),
    clamp(metallicRoughness.g * material.factors.z, 0.045, 1.0),
  );
  output.worldMetal = vec4f(
    input.worldPosition,
    clamp(metallicRoughness.b * material.factors.y, 0.0, 1.0),
  );
  return output;`,
    },
  ],
} satisfies ShaderDefinition;

const lightingDefinition = {
  declarations: [
    frameDeclaration,
    sunDeclaration,
    `struct Light {
  positionRadius: vec4f,
  colorIntensity: vec4f,
}`,
    `struct ScreenOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}`,
    `struct LightingOut {
  @location(0) color: vec4f,
  @location(1) ambient: vec4f,
}`,
    `struct SunShadow {
  nearViewProjection: mat4x4f,
  farViewProjection: mat4x4f,
  cascadeDistances: vec4f,
  biasesTexelSize: vec4f,
  cameraForwardNormalBias: vec4f,
}`,
  ],
  bindings: [
    { group: 0, binding: 0, declaration: "var albedoTexture: texture_2d<f32>" },
    {
      group: 0,
      binding: 1,
      declaration: "var normalRoughnessTexture: texture_2d<f32>",
    },
    {
      group: 0,
      binding: 2,
      declaration: "var worldMetalTexture: texture_2d<f32>",
    },
    { group: 0, binding: 3, declaration: "var depthTexture: texture_depth_2d" },
    {
      group: 0,
      binding: 4,
      declaration: "var<storage, read> lights: array<Light>",
    },
    { group: 0, binding: 5, declaration: "var<uniform> frame: Frame" },
    { group: 0, binding: 6, declaration: "var nearShadowMap: texture_depth_2d" },
    { group: 0, binding: 7, declaration: "var farShadowMap: texture_depth_2d" },
    { group: 0, binding: 8, declaration: "var shadowSampler: sampler_comparison" },
    { group: 0, binding: 9, declaration: "var<uniform> sunShadow: SunShadow" },
    {
      group: 0,
      binding: 10,
      declaration: "var environmentTexture: texture_cube<f32>",
    },
    { group: 0, binding: 11, declaration: "var environmentSampler: sampler" },
    { group: 0, binding: 12, declaration: "var<uniform> ambientSettings: vec4f" },
  ],
  functions: [
    screenVertex,
    {
      signature:
        "fresnelSchlick(cosTheta: f32, baseReflectance: vec3f) -> vec3f",
      body: `
  return baseReflectance + (vec3f(1.0) - baseReflectance) * pow(1.0 - cosTheta, 5.0);`,
    },
    {
      signature: "distributionGGX(normal: vec3f, halfway: vec3f, roughness: f32) -> f32",
      body: `
  let a = roughness * roughness;
  let a2 = a * a;
  let nDotH = max(dot(normal, halfway), 0.0);
  let denominator = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / max(3.14159265 * denominator * denominator, 0.0001);`,
    },
    {
      signature:
        "visibilityGGXCorrelated(alpha: f32, nDotL: f32, nDotV: f32) -> f32",
      body: `
  let alphaSquared = alpha * alpha;
  let lightTerm = nDotL * sqrt(
    alphaSquared + (1.0 - alphaSquared) * nDotV * nDotV,
  );
  let viewTerm = nDotV * sqrt(
    alphaSquared + (1.0 - alphaSquared) * nDotL * nDotL,
  );
  return 0.5 / max(lightTerm + viewTerm, 0.000001);`,
    },
    {
      signature:
        "directDfgApproximation(roughness: f32, nDotDirection: f32) -> vec2f",
      body: `
  let approximation = roughness * vec4f(-1.0, -0.0275, -0.572, 0.022) +
    vec4f(1.0, 0.0425, 1.04, -0.04);
  let integrated = min(
    approximation.x * approximation.x,
    exp2(-9.28 * nDotDirection),
  ) * approximation.x + approximation.y;
  return vec2f(-1.04, 1.04) * integrated + approximation.zw;`,
    },
    {
      signature:
        "directMultiScattering(baseReflectance: vec3f, roughness: f32, nDotV: f32, nDotL: f32) -> vec3f",
      body: `
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
    );`,
    },
    {
      signature:
        "brdf(normal: vec3f, view: vec3f, light: vec3f, albedo: vec3f, metallic: f32, roughness: f32) -> vec3f",
      body: `
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
  return diffuse + specular;`,
    },
    {
      signature: "ambientOcclusion(pixel: vec2i) -> f32",
      body: `
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
  return clamp(1.0 - (occlusion / 16.0) * ambientSettings.w, 0.38, 1.0);`,
    },
    {
      signature:
        "softShadowVisibility(shadowMap: texture_depth_2d, viewProjection: mat4x4f, position: vec3f, normal: vec3f, bias: f32) -> f32",
      body: `
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
  return visibility / 9.0;`,
    },
    {
      signature:
        "shadowVisibility(position: vec3f, normal: vec3f) -> f32",
      body: `
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
  return mix(nearVisibility, farVisibility, fade);`,
    },
    {
      attributes: [],
      signature:
        "environmentBrdf(normal: vec3f, view: vec3f, albedo: vec3f, metallic: f32, roughness: f32, ao: f32) -> vec3f",
      body: `
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
  return diffuse + specular;`,
    },
    {
      attributes: ["@fragment"],
      signature: "lightingFragment(input: ScreenOut) -> LightingOut",
      body: `
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
  return output;`,
    },
  ],
} satisfies ShaderDefinition;

const particleDefinition = {
  declarations: [
    frameDeclaration,
    `struct Particle {
  positionSize: vec4f,
  colorIntensity: vec4f,
}`,
    `struct ParticleOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
}`,
  ],
  bindings: [
    { group: 0, binding: 0, declaration: "var<uniform> frame: Frame" },
    {
      group: 0,
      binding: 1,
      declaration: "var<storage, read> particles: array<Particle>",
    },
  ],
  functions: [
    {
      attributes: ["@vertex"],
      signature:
        "particleVertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> ParticleOut",
      body: `
  var corner = vec2f(-1.0, -1.0);
  if (vertexIndex == 1u || vertexIndex == 4u) {
    corner = vec2f(1.0, -1.0);
  }
  if (vertexIndex == 2u || vertexIndex == 3u) {
    corner = vec2f(-1.0, 1.0);
  }
  if (vertexIndex == 5u) {
    corner = vec2f(1.0, 1.0);
  }

  let particle = particles[instanceIndex];
  var clip = frame.viewProjection * vec4f(particle.positionSize.xyz, 1.0);
  let projectionScale = 1.428148;
  let aspectCorrection = frame.params.w / frame.params.z;
  clip.x += corner.x * particle.positionSize.w * aspectCorrection * projectionScale;
  clip.y += corner.y * particle.positionSize.w * projectionScale;

  var output: ParticleOut;
  output.position = clip;
  output.color = particle.colorIntensity.rgb * particle.colorIntensity.w;
  return output;`,
    },
    {
      attributes: ["@fragment"],
      signature: "particleFragment(input: ParticleOut) -> @location(0) vec4f",
      body: "return vec4f(input.color, 1.0);",
    },
  ],
} satisfies ShaderDefinition;

const bloomDefinition = {
  declarations: [
    `struct BloomParams {
  values: vec4f,
}`,
    `struct ScreenOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}`,
  ],
  bindings: [
    { group: 0, binding: 0, declaration: "var sourceTexture: texture_2d<f32>" },
    { group: 0, binding: 1, declaration: "var sourceSampler: sampler" },
    { group: 0, binding: 2, declaration: "var<uniform> bloom: BloomParams" },
  ],
  functions: [
    screenVertex,
    {
      signature: "bloomSample(uv: vec2f) -> vec3f",
      body: `
  return textureSampleLevel(
    sourceTexture,
    sourceSampler,
    clamp(uv, vec2f(0.001), vec2f(0.999)),
    0.0,
  ).rgb;`,
    },
    {
      attributes: ["@fragment"],
      signature: "bloomFragment(input: ScreenOut) -> @location(0) vec4f",
      body: `
  let texel = bloom.values.xy;
  let kernelRadius = bloom.values.z;
  let stage = bloom.values.w;
  if (stage < 0.5) {
    let color = bloomSample(input.uv);
    let luminance = dot(color, vec3f(0.2126, 0.7152, 0.0722));
    return vec4f(color * smoothstep(1.0, 1.01, luminance), 1.0);
  }

  let direction = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), stage < 1.5);
  let sigma = kernelRadius / 3.0;
  var color = bloomSample(input.uv) * 0.39894 / sigma;
  for (var offset = 1; offset < i32(kernelRadius); offset += 1) {
    let distance = f32(offset);
    let weight = 0.39894 * exp(
      -0.5 * distance * distance / (sigma * sigma),
    ) / sigma;
    let uvOffset = direction * texel * distance;
    color += (
      bloomSample(input.uv + uvOffset) + bloomSample(input.uv - uvOffset)
    ) * weight;
  }
  return vec4f(color, 1.0);`,
    },
  ],
} satisfies ShaderDefinition;

const compositeDefinition = {
  declarations: [
    `struct ComposeParams {
  values: vec4f,
}`,
    `struct ScreenOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}`,
  ],
  bindings: [
    { group: 0, binding: 0, declaration: "var hdrTexture: texture_2d<f32>" },
    { group: 0, binding: 1, declaration: "var bloomLevel0: texture_2d<f32>" },
    { group: 0, binding: 2, declaration: "var bloomLevel1: texture_2d<f32>" },
    { group: 0, binding: 3, declaration: "var bloomLevel2: texture_2d<f32>" },
    { group: 0, binding: 4, declaration: "var bloomLevel3: texture_2d<f32>" },
    { group: 0, binding: 5, declaration: "var bloomLevel4: texture_2d<f32>" },
    { group: 0, binding: 6, declaration: "var bloomSampler: sampler" },
    { group: 0, binding: 7, declaration: "var<uniform> compose: ComposeParams" },
  ],
  functions: [
    screenVertex,
    {
      signature: "fxaaHdr(uv: vec2f) -> vec3f",
      body: `
  let texel = 1.0 / compose.values.zw;
  let rgbNorthWest = textureSampleLevel(
    hdrTexture,
    bloomSampler,
    uv + vec2f(-texel.x, -texel.y),
    0.0,
  ).rgb;
  let rgbNorthEast = textureSampleLevel(
    hdrTexture,
    bloomSampler,
    uv + vec2f(texel.x, -texel.y),
    0.0,
  ).rgb;
  let rgbSouthWest = textureSampleLevel(
    hdrTexture,
    bloomSampler,
    uv + vec2f(-texel.x, texel.y),
    0.0,
  ).rgb;
  let rgbSouthEast = textureSampleLevel(
    hdrTexture,
    bloomSampler,
    uv + vec2f(texel.x, texel.y),
    0.0,
  ).rgb;
  let rgbCenter = textureSampleLevel(hdrTexture, bloomSampler, uv, 0.0).rgb;
  let luma = vec3f(0.299, 0.587, 0.114);
  let lumaNorthWest = dot(rgbNorthWest, luma);
  let lumaNorthEast = dot(rgbNorthEast, luma);
  let lumaSouthWest = dot(rgbSouthWest, luma);
  let lumaSouthEast = dot(rgbSouthEast, luma);
  let lumaCenter = dot(rgbCenter, luma);
  let lumaMinimum = min(
    lumaCenter,
    min(
      min(lumaNorthWest, lumaNorthEast),
      min(lumaSouthWest, lumaSouthEast),
    ),
  );
  let lumaMaximum = max(
    lumaCenter,
    max(
      max(lumaNorthWest, lumaNorthEast),
      max(lumaSouthWest, lumaSouthEast),
    ),
  );
  var direction = vec2f(
    -((lumaNorthWest + lumaNorthEast) - (lumaSouthWest + lumaSouthEast)),
    (lumaNorthWest + lumaSouthWest) - (lumaNorthEast + lumaSouthEast),
  );
  let directionReduce = max(
    (lumaNorthWest + lumaNorthEast + lumaSouthWest + lumaSouthEast) * 0.0078125,
    0.0009765625,
  );
  direction = clamp(
    direction / (min(abs(direction.x), abs(direction.y)) + directionReduce),
    vec2f(-8.0),
    vec2f(8.0),
  ) * texel;
  let rgbA = 0.5 * (
    textureSampleLevel(hdrTexture, bloomSampler, uv + direction * -0.166667, 0.0).rgb +
    textureSampleLevel(hdrTexture, bloomSampler, uv + direction * 0.166667, 0.0).rgb
  );
  let rgbB = rgbA * 0.5 + 0.25 * (
    textureSampleLevel(hdrTexture, bloomSampler, uv + direction * -0.5, 0.0).rgb +
    textureSampleLevel(hdrTexture, bloomSampler, uv + direction * 0.5, 0.0).rgb
  );
  let lumaB = dot(rgbB, luma);
  return select(rgbB, rgbA, lumaB < lumaMinimum || lumaB > lumaMaximum);`,
    },
    {
      signature:
        "acesFilmicToneMapping(color: vec3f, exposure: f32) -> vec3f",
      body: `
  let input = mat3x3f(
    0.59719, 0.076, 0.0284,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777,
  ) * ((color * exposure) / 0.6);
  let fitted = (
    input * (input + vec3f(0.0245786)) - vec3f(0.000090537)
  ) / (
    input * ((input + vec3f(0.432951)) * 0.983729) + vec3f(0.238081)
  );
  return clamp(
    mat3x3f(
      1.60475, -0.10208, -0.00327,
      -0.53108, 1.10813, -0.07276,
      -0.07367, -0.00605, 1.07602,
    ) * fitted,
    vec3f(0.0),
    vec3f(1.0),
  );`,
    },
    {
      signature: "sRGBTransferOETF(color: vec3f) -> vec3f",
      body: `
  let nonlinear = pow(color, vec3f(0.41666)) * 1.055 - vec3f(0.055);
  let linear = color * 12.92;
  return select(nonlinear, linear, color <= vec3f(0.0031308));`,
    },
    {
      attributes: ["@fragment"],
      signature: "compositeFragment(input: ScreenOut) -> @location(0) vec4f",
      body: `
  var color = textureSampleLevel(
    hdrTexture,
    bloomSampler,
    input.uv,
    0.0,
  ).rgb;
  let bloom = (
    textureSampleLevel(bloomLevel0, bloomSampler, input.uv, 0.0).rgb * 1.0007 +
    textureSampleLevel(bloomLevel1, bloomSampler, input.uv, 0.0).rgb * 0.7986 +
    textureSampleLevel(bloomLevel2, bloomSampler, input.uv, 0.0).rgb * 0.5965 +
    textureSampleLevel(bloomLevel3, bloomSampler, input.uv, 0.0).rgb * 0.3944 +
    textureSampleLevel(bloomLevel4, bloomSampler, input.uv, 0.0).rgb * 0.1923
  ) * 0.18;
  color += bloom;
  color = acesFilmicToneMapping(color, compose.values.y);
  color = sRGBTransferOETF(color);
  return vec4f(color, 1.0);`,
    },
  ],
} satisfies ShaderDefinition;

export interface BroMetalShaderArtifacts {
  readonly shadow: string;
  readonly geometry: string;
  readonly lighting: string;
  readonly reflection: string;
  readonly reflectionReconstruct: string;
  readonly reflectionSelect: string;
  readonly temporal: string;
  readonly particles: string;
  readonly bloom: string;
  readonly composite: string;
}

export function buildArtifacts(): BroMetalShaderArtifacts {
  return {
    shadow: compileShader(shadowDefinition),
    geometry: compileShader(geometryDefinition),
    lighting: compileShader(lightingDefinition),
    reflection: buildReflectionShader(),
    reflectionReconstruct: buildReflectionReconstructShader(),
    reflectionSelect: buildReflectionSelectShader(),
    temporal: buildTemporalShader(),
    particles: compileShader(particleDefinition),
    bloom: compileShader(bloomDefinition),
    composite: compileShader(compositeDefinition),
  };
}
