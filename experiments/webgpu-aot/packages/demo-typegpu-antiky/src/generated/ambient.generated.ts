import type { AotShaderArtifact } from "typegpu-antiky";

export const shader = {
  "wgsl": "struct ambientVertex_Output {\n  @builtin(position) position: vec4f,\n}\n\n@vertex fn ambientVertex(@builtin(vertex_index) vertexIndex: u32) -> ambientVertex_Output {\n  var position = vec2f(-1);\n  if ((vertexIndex == 1u)) {\n    position = vec2f(3, -1);\n  }\n  if ((vertexIndex == 2u)) {\n    position = vec2f(-1, 3);\n  }\n  return ambientVertex_Output(vec4f(position, 0f, 1f));\n}\n\n@group(0) @binding(2) var<uniform> settings: vec4f;\n\n@group(0) @binding(0) var depth: texture_depth_2d;\n\n@group(0) @binding(1) var normal: texture_2d<f32>;\n\n@fragment fn ambientFragment(@builtin(position) position: vec4f) -> @location(0) vec4f {\n  let size = vec2i(settings.xy);\n  let maximum = (size - vec2i(1));\n  let pixel = clamp(vec2i(floor(position.xy)), vec2i(), maximum);\n  let centerDepth = textureLoad(depth, pixel, 0);\n  if ((centerDepth >= 0.99999f)) {\n    return vec4f(1);\n  }\n  let centerNormal = normalize(((textureLoad(normal, pixel, 0).xyz * 2f) - vec3f(1)));\n  var occlusion = 0f;\n  for (var sampleIndex = 0; (sampleIndex < 16i); sampleIndex += 1i) {\n    let angle = (f32(sampleIndex) * 0.39269908169872414f);\n    let ring = (1f + f32((sampleIndex % 4i)));\n    let radius = (settings.z * ring);\n    let offset = vec2i(i32(round((cos(angle) * radius))), i32(round((sin(angle) * radius))));\n    let samplePixel = clamp((pixel + offset), vec2i(), maximum);\n    let sampleDepth = textureLoad(depth, samplePixel, 0);\n    let sampleNormal = normalize(((textureLoad(normal, samplePixel, 0).xyz * 2f) - vec3f(1)));\n    let depthOcclusion = smoothstep(2.5e-4f, (5e-3f + (radius * 3.5e-4f)), (centerDepth - sampleDepth));\n    let normalCrease = clamp((1f - dot(centerNormal, sampleNormal)), 0f, 1f);\n    occlusion += (depthOcclusion * (0.7f + (normalCrease * 0.3f)));\n  }\n  let ambient = clamp((1f - ((occlusion / 16f) * settings.w)), 0.38f, 1f);\n  return vec4f(ambient, ambient, ambient, 1f);\n}",
  "entryPoints": {
    "vertex": "ambientVertex",
    "fragment": "ambientFragment"
  },
  "bindGroups": [
    {
      "group": 0,
      "entries": [
        {
          "name": "depth",
          "binding": 0,
          "visibility": [
            "fragment"
          ],
          "texture": {
            "sampleType": "depth",
            "viewDimension": "2d"
          }
        },
        {
          "name": "normal",
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
          "name": "settings",
          "binding": 2,
          "visibility": [
            "fragment"
          ],
          "buffer": {
            "type": "uniform",
            "minBindingSize": 16
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
        "format": "r8unorm"
      }
    ]
  },
  "kind": "render"
} as const satisfies AotShaderArtifact;
