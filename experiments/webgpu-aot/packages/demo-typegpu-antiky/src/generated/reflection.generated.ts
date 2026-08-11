import type { AotShaderArtifact } from "typegpu-antiky";

export const shader = {
  "wgsl": "struct reflectionVertex_Output {\n  @builtin(position) position: vec4f,\n  @location(0) uv: vec2f,\n}\n\n@vertex fn reflectionVertex(@builtin(vertex_index) vertexIndex: u32) -> reflectionVertex_Output {\n  var position = vec2f(-1);\n  if ((vertexIndex == 1u)) {\n    position = vec2f(3, -1);\n  }\n  if ((vertexIndex == 2u)) {\n    position = vec2f(-1, 3);\n  }\n  return reflectionVertex_Output(vec4f(position, 0f, 1f), vec2f(((position.x * 0.5f) + 0.5f), (0.5f - (position.y * 0.5f))));\n}\n\nstruct AntikyReflectionFrame {\n  viewProjection: mat4x4f,\n  model: mat4x4f,\n  nearShadowViewProjection: mat4x4f,\n  farShadowViewProjection: mat4x4f,\n  cameraPosition: vec4f,\n  settings: vec4f,\n}\n\n@group(0) @binding(4) var<uniform> frame: AntikyReflectionFrame;\n\n@group(0) @binding(3) var depth: texture_depth_2d;\n\n@group(0) @binding(1) var surface: texture_2d<f32>;\n\n@group(0) @binding(2) var worldMetal: texture_2d<f32>;\n\nfn antikyProjectReflectionPoint(position: vec3f) -> vec3f {\n  let clip = (frame.viewProjection * vec4f(position, 1f));\n  let ndc = (clip.xyz / max(clip.w, 1e-4f));\n  return vec3f(((ndc.x * 0.5f) + 0.5f), (0.5f - (ndc.y * 0.5f)), clip.w);\n}\n\n@group(0) @binding(0) var hdr: texture_2d<f32>;\n\n@group(0) @binding(5) var sampler_1: sampler;\n\nfn antikyReflectionHitTransfer(hitColor: vec3f, metallic: f32, planeDistance: f32, incident: vec3f, reflected: vec3f) -> vec3f {\n  let distanceRatio = (1f - (planeDistance / 100f));\n  let attenuation = (distanceRatio * distanceRatio);\n  let grazing = ((dot(incident, reflected) + 1f) / 2f);\n  let weightedColor = (hitColor * ((metallic * attenuation) * grazing));\n  let luminance = dot(weightedColor, vec3f(0.2125999927520752, 0.7152000069618225, 0.0722000002861023));\n  let luminanceScale = min((10f / max(luminance, 1e-4f)), 1f);\n  return (weightedColor * (luminanceScale * 0.7f));\n}\n\n@fragment fn reflectionFragment(@builtin(position) position: vec4f) -> @location(0) vec4f {\n  let size = vec2i(frame.settings.yz);\n  let maximum = (size - vec2i(1));\n  let pixel = clamp(vec2i(floor(position.xy)), vec2i(), maximum);\n  if ((textureLoad(depth, pixel, 0) >= 0.99999f)) {\n    return vec4f(0, 0, 0, 1);\n  }\n  let encodedSurface = textureLoad(surface, pixel, 0);\n  let worldMetal_1 = textureLoad(worldMetal, pixel, 0);\n  let normal = normalize(((encodedSurface.xyz * 2f) - vec3f(1)));\n  let worldPosition = worldMetal_1.xyz;\n  let view = normalize((frame.cameraPosition.xyz - worldPosition));\n  let reflected = normalize(reflect(-(view), normal));\n  if ((dot(reflected, normal) <= 1e-3f)) {\n    return vec4f(0, 0, 0, 1);\n  }\n  var hitColor = vec3f();\n  var planeDistance = 0f;\n  var travel = 0.1599999964237213f;\n  for (var step_1 = 0; (step_1 < 24i); step_1 += 1i) {\n    travel += (0.1f + (f32(step_1) * 0.024f));\n    let samplePosition = ((worldPosition + (normal * 0.045f)) + (reflected * travel));\n    let projected = antikyProjectReflectionPoint(samplePosition);\n    let uv = projected.xy;\n    if ((((((projected.z <= 0f) || (uv.x <= 2e-3f)) || (uv.x >= 0.998f)) || (uv.y <= 2e-3f)) || (uv.y >= 0.998f))) {\n      break;\n    }\n    let samplePixel = clamp(vec2i((uv * vec2f(size))), vec2i(), maximum);\n    if ((textureLoad(depth, samplePixel, 0) >= 0.99999f)) {\n      continue;\n    }\n    let scenePosition = textureLoad(worldMetal, samplePixel, 0).xyz;\n    let rayDepth = distance(frame.cameraPosition.xyz, samplePosition);\n    let sceneDepth = distance(frame.cameraPosition.xyz, scenePosition);\n    let crossing = (rayDepth - sceneDepth);\n    if ((((crossing >= 0f) && (crossing <= (0.11f + (travel * 0.028f)))) && (distance(scenePosition, worldPosition) > 0.2f))) {\n      hitColor = textureSampleLevel(hdr, sampler_1, uv, 0).rgb;\n      planeDistance = dot((scenePosition - worldPosition), normal);\n      break;\n    }\n  }\n  let reflection = antikyReflectionHitTransfer(hitColor, worldMetal_1.w, planeDistance, -(view), reflected);\n  return vec4f(reflection, 1f);\n}",
  "entryPoints": {
    "vertex": "reflectionVertex",
    "fragment": "reflectionFragment"
  },
  "bindGroups": [
    {
      "group": 0,
      "entries": [
        {
          "name": "hdr",
          "binding": 0,
          "visibility": [
            "fragment"
          ],
          "texture": {
            "sampleType": "float",
            "viewDimension": "2d"
          }
        },
        {
          "name": "surface",
          "binding": 1,
          "visibility": [
            "fragment"
          ],
          "texture": {
            "sampleType": "unfilterable-float",
            "viewDimension": "2d"
          }
        },
        {
          "name": "worldMetal",
          "binding": 2,
          "visibility": [
            "fragment"
          ],
          "texture": {
            "sampleType": "unfilterable-float",
            "viewDimension": "2d"
          }
        },
        {
          "name": "depth",
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
          "name": "frame",
          "binding": 4,
          "visibility": [
            "fragment"
          ],
          "buffer": {
            "type": "uniform",
            "minBindingSize": 288
          }
        },
        {
          "name": "sampler",
          "binding": 5,
          "visibility": [
            "fragment"
          ],
          "sampler": {
            "type": "filtering"
          }
        }
      ]
    }
  ],
  "pipeline": {
    "vertexBuffers": [],
    "primitive": {
      "topology": "triangle-list",
      "cullMode": "none"
    },
    "targets": [
      {
        "format": "rgba16float"
      }
    ]
  },
  "kind": "render"
} as const satisfies AotShaderArtifact;
