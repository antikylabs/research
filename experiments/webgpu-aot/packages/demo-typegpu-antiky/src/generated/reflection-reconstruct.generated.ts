import type { AotShaderArtifact } from "typegpu-antiky";

export const shader = {
  "wgsl": "struct reflectionReconstructVertex_Output {\n  @builtin(position) position: vec4f,\n  @location(0) uv: vec2f,\n}\n\n@vertex fn reflectionReconstructVertex(@builtin(vertex_index) vertexIndex: u32) -> reflectionReconstructVertex_Output {\n  var position = vec2f(-1);\n  if ((vertexIndex == 1u)) {\n    position = vec2f(3, -1);\n  }\n  if ((vertexIndex == 2u)) {\n    position = vec2f(-1, 3);\n  }\n  return reflectionReconstructVertex_Output(vec4f(position, 0f, 1f), vec2f(((position.x * 0.5f) + 0.5f), (0.5f - (position.y * 0.5f))));\n}\n\n@group(0) @binding(2) var<uniform> settings: vec4f;\n\n@group(0) @binding(0) var rawReflection: texture_2d<f32>;\n\n@group(0) @binding(1) var sampler_1: sampler;\n\nstruct reflectionReconstructFragment_Input {\n  @location(0) uv: vec2f,\n}\n\n@fragment fn reflectionReconstructFragment(_arg_0: reflectionReconstructFragment_Input, @builtin(position) position: vec4f) -> @location(0) vec4f {\n  let spread = settings.z;\n  if ((spread < 0.5f)) {\n    let pixel = vec2i(floor(position.xy));\n    return textureLoad(rawReflection, pixel, 0);\n  }\n  let texelStep = settings.xy;\n  let separation = max(spread, 1f);\n  var color = vec4f();\n  for (var offsetX = -3; (offsetX <= 3i); offsetX += 1i) {\n    for (var offsetY = -3; (offsetY <= 3i); offsetY += 1i) {\n      let offset = ((vec2f(f32(offsetX), f32(offsetY)) * texelStep) * separation);\n      color = (color + textureSampleLevel(rawReflection, sampler_1, (_arg_0.uv + offset), 0));\n    }\n  }\n  return (color / 49f);\n}",
  "entryPoints": {
    "vertex": "reflectionReconstructVertex",
    "fragment": "reflectionReconstructFragment"
  },
  "bindGroups": [
    {
      "group": 0,
      "entries": [
        {
          "name": "rawReflection",
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
          "name": "sampler",
          "binding": 1,
          "visibility": [
            "fragment"
          ],
          "sampler": {
            "type": "filtering"
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
        "format": "rgba16float"
      }
    ]
  },
  "kind": "render"
} as const satisfies AotShaderArtifact;
