import type { AotShaderArtifact } from "typegpu-antiky";

export const shader = {
  "wgsl": "struct AntikyForwardFrame {\n  viewProjection: mat4x4f,\n  model: mat4x4f,\n  nearShadowViewProjection: mat4x4f,\n  farShadowViewProjection: mat4x4f,\n  cameraPosition: vec4f,\n  settings: vec4f,\n}\n\n@group(0) @binding(0) var<uniform> frame: AntikyForwardFrame;\n\nstruct forwardVertex_Output {\n  @builtin(position) position: vec4f,\n  @location(0) worldPosition: vec3f,\n  @location(1) normal: vec3f,\n  @location(2) uv: vec2f,\n}\n\n@vertex fn forwardVertex(@location(0) position: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f) -> forwardVertex_Output {\n  let world = (frame.model * vec4f(position, 1f));\n  return forwardVertex_Output((frame.viewProjection * world), world.xyz, normalize((frame.model * vec4f(normal, 0f)).xyz), uv);\n}\n\n@group(1) @binding(1) var baseColor: texture_2d<f32>;\n\n@group(1) @binding(0) var sampler_1: sampler;\n\nstruct AntikyForwardMaterial {\n  baseColorFactor: vec4f,\n  factors: vec4f,\n}\n\n@group(1) @binding(4) var<uniform> material: AntikyForwardMaterial;\n\n@group(1) @binding(2) var normal: texture_2d<f32>;\n\n@group(1) @binding(3) var metallicRoughness: texture_2d<f32>;\n\nfn antikyPbrShade(normal_1: vec3f, view: vec3f, light: vec3f, albedo: vec3f, metallic: f32, roughness: f32) -> vec3f {\n  let halfway = normalize((view + light));\n  let nDotL = max(dot(normal_1, light), 0f);\n  let nDotH = max(dot(normal_1, halfway), 0f);\n  let vDotH = max(dot(view, halfway), 0f);\n  let reflectance = mix(vec3f(0.03500000014901161), albedo, metallic);\n  let fresnel = (reflectance + ((vec3f(1) - reflectance) * pow((1f - vDotH), 5f)));\n  let gloss = max(((2f / max((roughness * roughness), 2e-3f)) - 2f), 1f);\n  let specular = (fresnel * (((gloss + 2f) / 6.283185307179586f) * pow(nDotH, gloss)));\n  let diffuse = (((vec3f(1) - fresnel) * albedo) * ((1f - metallic) / 3.141592653589793f));\n  return ((diffuse + specular) * nDotL);\n}\n\nstruct AntikyForwardLight {\n  positionRadius: vec4f,\n  colorIntensity: vec4f,\n}\n\n@group(0) @binding(1) var<storage, read> lights: array<AntikyForwardLight, 64>;\n\n@group(0) @binding(4) var shadowSampler: sampler_comparison;\n\nfn antikySampleSunCascade(shadowMap: texture_depth_2d, viewProjection: mat4x4f, position: vec3f, bias: f32) -> f32 {\n  let clip = (viewProjection * vec4f(position, 1f));\n  if ((clip.w <= 0f)) {\n    return 1f;\n  }\n  let ndc = (clip.xyz / clip.w);\n  let uv = vec2f(((ndc.x * 0.5f) + 0.5f), (0.5f - (ndc.y * 0.5f)));\n  const edgeGuard = 3.662109375e-4;\n  if (((((((uv.x <= edgeGuard) || (uv.x >= (1f - edgeGuard))) || (uv.y <= edgeGuard)) || (uv.y >= (1f - edgeGuard))) || (ndc.z <= 0f)) || (ndc.z >= 1f))) {\n    return 1f;\n  }\n  var visibility = 0f;\n  for (var offsetY = -1; (offsetY <= 1i); offsetY += 1i) {\n    for (var offsetX = -1; (offsetX <= 1i); offsetX += 1i) {\n      let offset = (vec2f(f32(offsetX), f32(offsetY)) * 2.44140625e-4f);\n      visibility += textureSampleCompareLevel(shadowMap, shadowSampler, (uv + offset), (ndc.z + bias));\n    }\n  }\n  return (visibility / 9f);\n}\n\n@group(0) @binding(2) var nearShadow: texture_depth_2d;\n\n@group(0) @binding(3) var farShadow: texture_depth_2d;\n\nfn antikyEnvironmentDirection(direction: vec3f) -> vec3f {\n  return vec3f(-(direction.x), direction.y, direction.z);\n}\n\n@group(0) @binding(6) var environmentMap: texture_cube<f32>;\n\n@group(0) @binding(5) var environmentSampler: sampler;\n\nfn antikyEnvironmentLighting(normal_1: vec3f, view: vec3f, albedo: vec3f, metallic: f32, roughness: f32) -> vec3f {\n  let nDotV = clamp(dot(normal_1, view), 0f, 1f);\n  let roughnessSquared = (roughness * roughness);\n  let reflected = reflect(-(view), normal_1);\n  let reflectedDirection = normalize(mix(reflected, normal_1, (roughnessSquared * roughnessSquared)));\n  let irradiance = textureSampleLevel(environmentMap, environmentSampler, antikyEnvironmentDirection(normal_1), 5.76).rgb;\n  let radiance = textureSampleLevel(environmentMap, environmentSampler, antikyEnvironmentDirection(reflectedDirection), (roughness * 8f)).rgb;\n  let approximation = ((roughness * vec4f(-1, -0.027499999850988388, -0.5720000267028809, 0.02199999988079071)) + vec4f(1, 0.042500000447034836, 1.0399999618530273, -0.03999999910593033));\n  let integrated = ((min((approximation.x * approximation.x), exp2((-9.28f * nDotV))) * approximation.x) + approximation.y);\n  let dfg = ((vec2f(-1.0399999618530273, 1.0399999618530273) * integrated) + approximation.zw);\n  let energyMissing = ((1f - dfg.x) - dfg.y);\n  let dielectricF0 = vec3f(0.03999999910593033);\n  let dielectricSingle = ((dielectricF0 * dfg.x) + vec3f(dfg.y));\n  let dielectricAverage = (dielectricF0 + ((vec3f(1) - dielectricF0) / 21f));\n  let dielectricMulti = (((dielectricSingle * dielectricAverage) * energyMissing) / max((vec3f(1) - (dielectricAverage * energyMissing)), vec3f(9.999999974752427e-7)));\n  let metalSingle = ((albedo * dfg.x) + vec3f(dfg.y));\n  let metalAverage = (albedo + ((vec3f(1) - albedo) / 21f));\n  let metalMulti = (((metalSingle * metalAverage) * energyMissing) / max((vec3f(1) - (metalAverage * energyMissing)), vec3f(9.999999974752427e-7)));\n  let singleScattering = mix(dielectricSingle, metalSingle, metallic);\n  let multiScattering = mix(dielectricMulti, metalMulti, metallic);\n  let diffuseEnergy = ((vec3f(1) - dielectricSingle) - dielectricMulti);\n  let diffuse = (irradiance * ((albedo * (1f - metallic)) * diffuseEnergy));\n  let specular = ((radiance * singleScattering) + (irradiance * multiScattering));\n  return (diffuse + specular);\n}\n\nstruct forwardFragment_Output {\n  @location(0) color: vec4f,\n  @location(1) surface: vec4f,\n  @location(2) worldMetal: vec4f,\n}\n\nstruct forwardFragment_Input {\n  @location(0) worldPosition: vec3f,\n  @location(1) normal: vec3f,\n  @location(2) uv: vec2f,\n}\n\n@fragment fn forwardFragment(_arg_0: forwardFragment_Input, @builtin(front_facing) frontFacing: bool) -> forwardFragment_Output {\n  let base = (textureSample(baseColor, sampler_1, _arg_0.uv) * material.baseColorFactor);\n  if (((material.factors.x > 0f) && (base.a < material.factors.x))) {\n    discard;;\n  }\n  let faceNormal = normalize(select(-(_arg_0.normal), _arg_0.normal, frontFacing));\n  let pDx = dpdx(_arg_0.worldPosition);\n  let pDy = dpdy(_arg_0.worldPosition);\n  let uvDx = dpdx(_arg_0.uv);\n  let uvDy = dpdy(_arg_0.uv);\n  let determinant_1 = ((uvDx.x * uvDy.y) - (uvDx.y * uvDy.x));\n  var tangent = normalize((pDx - (faceNormal * dot(faceNormal, pDx))));\n  var bitangent = normalize(cross(faceNormal, tangent));\n  if ((abs(determinant_1) > 1e-5f)) {\n    tangent = normalize((((pDx * uvDy.y) - (pDy * uvDx.y)) / determinant_1));\n    bitangent = normalize((((pDx * -(uvDy.x)) + (pDy * uvDx.x)) / determinant_1));\n  }\n  let mapNormal = ((textureSample(normal, sampler_1, _arg_0.uv).xyz * 2f) - vec3f(1));\n  let normal_1 = normalize((((tangent * mapNormal.x) + (bitangent * mapNormal.y)) + (faceNormal * mapNormal.z)));\n  let materialSample = textureSample(metallicRoughness, sampler_1, _arg_0.uv);\n  let metallic = clamp((materialSample.b * material.factors.y), 0f, 1f);\n  let roughness = clamp((materialSample.g * material.factors.z), 0.04f, 1f);\n  let view = normalize((frame.cameraPosition.xyz - _arg_0.worldPosition));\n  let sunDirection = vec3f(0.0010204070713371038, 0.9999989867210388, 0.0010204070713371038);\n  let sunColor = vec3f(0.21559999883174896, 0.26269999146461487, 0.33329999446868896);\n  var color = (antikyPbrShade(normal_1, view, sunDirection, base.rgb, metallic, roughness) * (sunColor * 2f));\n  var pointLighting = vec3f();\n  for (var index = 0; (index < 64i); index += 1i) {\n    if ((index >= i32(frame.settings.x))) {\n      break;\n    }\n    let light = (&lights[index]);\n    let toLight = ((*light).positionRadius.xyz - _arg_0.worldPosition);\n    let distanceSquared = dot(toLight, toLight);\n    let distance_1 = sqrt(max(distanceSquared, 1e-6f));\n    if ((distance_1 < (*light).positionRadius.w)) {\n      let direction = (toLight / max(distance_1, 1e-3f));\n      let distanceRatio = (distance_1 / (*light).positionRadius.w);\n      let distanceRatioSquared = (distanceRatio * distanceRatio);\n      let cutoff = clamp((1f - (distanceRatioSquared * distanceRatioSquared)), 0f, 1f);\n      let attenuation = (((1f / max(distanceSquared, 0.01f)) * cutoff) * cutoff);\n      pointLighting = (pointLighting + (antikyPbrShade(normal_1, view, direction, base.rgb, metallic, roughness) * ((*light).colorIntensity.rgb * ((*light).colorIntensity.w * attenuation))));\n    }\n  }\n  let receiverPosition = (_arg_0.worldPosition + (normal_1 * 0.015f));\n  let nearVisibility = antikySampleSunCascade(nearShadow, frame.nearShadowViewProjection, receiverPosition, -1.5e-4f);\n  let farVisibility = antikySampleSunCascade(farShadow, frame.farShadowViewProjection, receiverPosition, -3e-4f);\n  let viewDepth = dot((_arg_0.worldPosition - frame.cameraPosition.xyz), vec3f(-0.9881741404533386, -0.14875739812850952, 0.03718934953212738));\n  var shadow = mix(nearVisibility, farVisibility, smoothstep(25.72128055077705f, 27.490997109391337f, viewDepth));\n  if ((viewDepth <= 25.72128055077705f)) {\n    shadow = nearVisibility;\n  }\n  if ((viewDepth >= 27.490997109391337f)) {\n    shadow = farVisibility;\n  }\n  let environment = antikyEnvironmentLighting(normal_1, view, base.rgb, metallic, roughness);\n  color = (((color * shadow) + pointLighting) + environment);\n  return forwardFragment_Output(vec4f(color, base.a), vec4f(((normal_1 * 0.5f) + 0.5f), roughness), vec4f(_arg_0.worldPosition, metallic));\n}",
  "entryPoints": {
    "vertex": "forwardVertex",
    "fragment": "forwardFragment"
  },
  "bindGroups": [
    {
      "group": 0,
      "entries": [
        {
          "name": "frame",
          "binding": 0,
          "visibility": [
            "vertex",
            "fragment"
          ],
          "buffer": {
            "type": "uniform",
            "minBindingSize": 288
          }
        },
        {
          "name": "lights",
          "binding": 1,
          "visibility": [
            "fragment"
          ],
          "buffer": {
            "type": "read-only-storage",
            "minBindingSize": 2048
          }
        },
        {
          "name": "nearShadow",
          "binding": 2,
          "visibility": [
            "fragment"
          ],
          "texture": {
            "sampleType": "depth",
            "viewDimension": "2d"
          }
        },
        {
          "name": "farShadow",
          "binding": 3,
          "visibility": [
            "fragment"
          ],
          "texture": {
            "sampleType": "depth",
            "viewDimension": "2d"
          }
        },
        {
          "name": "shadowSampler",
          "binding": 4,
          "visibility": [
            "fragment"
          ],
          "sampler": {
            "type": "comparison"
          }
        },
        {
          "name": "environmentSampler",
          "binding": 5,
          "visibility": [
            "fragment"
          ],
          "sampler": {
            "type": "filtering"
          }
        },
        {
          "name": "environmentMap",
          "binding": 6,
          "visibility": [
            "fragment"
          ],
          "texture": {
            "sampleType": "float",
            "viewDimension": "cube"
          }
        }
      ]
    },
    {
      "group": 1,
      "entries": [
        {
          "name": "sampler",
          "binding": 0,
          "visibility": [
            "fragment"
          ],
          "sampler": {
            "type": "filtering"
          }
        },
        {
          "name": "baseColor",
          "binding": 1,
          "visibility": [
            "fragment"
          ],
          "texture": {
            "sampleType": "float",
            "viewDimension": "2d"
          }
        },
        {
          "name": "normal",
          "binding": 2,
          "visibility": [
            "fragment"
          ],
          "texture": {
            "sampleType": "float",
            "viewDimension": "2d"
          }
        },
        {
          "name": "metallicRoughness",
          "binding": 3,
          "visibility": [
            "fragment"
          ],
          "texture": {
            "sampleType": "float",
            "viewDimension": "2d"
          }
        },
        {
          "name": "material",
          "binding": 4,
          "visibility": [
            "fragment"
          ],
          "buffer": {
            "type": "uniform",
            "minBindingSize": 32
          }
        }
      ]
    }
  ],
  "pipeline": {
    "vertexBuffers": [
      {
        "arrayStride": 12,
        "attributes": [
          {
            "shaderLocation": 0,
            "offset": 0,
            "format": "float32x3"
          }
        ]
      },
      {
        "arrayStride": 12,
        "attributes": [
          {
            "shaderLocation": 1,
            "offset": 0,
            "format": "float32x3"
          }
        ]
      },
      {
        "arrayStride": 8,
        "attributes": [
          {
            "shaderLocation": 2,
            "offset": 0,
            "format": "float32x2"
          }
        ]
      }
    ],
    "primitive": {
      "topology": "triangle-list",
      "cullMode": "back",
      "frontFace": "ccw"
    },
    "targets": [
      {
        "format": "rgba16float"
      },
      {
        "format": "rgba16float"
      },
      {
        "format": "rgba16float"
      }
    ],
    "depthStencil": {
      "format": "depth24plus",
      "depthWriteEnabled": true,
      "depthCompare": "less"
    }
  },
  "kind": "render"
} as const satisfies AotShaderArtifact;
