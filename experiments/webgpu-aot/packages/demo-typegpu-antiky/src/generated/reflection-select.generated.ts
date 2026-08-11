import type { AotShaderArtifact } from "typegpu-antiky";

export const shader = {
  "wgsl": "struct reflectionSelectVertex_Output {\n  @builtin(position) position: vec4f,\n  @location(0) uv: vec2f,\n}\n\n@vertex fn reflectionSelectVertex(@builtin(vertex_index) vertexIndex: u32) -> reflectionSelectVertex_Output {\n  var position = vec2f(-1);\n  if ((vertexIndex == 1u)) {\n    position = vec2f(3, -1);\n  }\n  if ((vertexIndex == 2u)) {\n    position = vec2f(-1, 3);\n  }\n  return reflectionSelectVertex_Output(vec4f(position, 0f, 1f), vec2f(((position.x * 0.5f) + 0.5f), (0.5f - (position.y * 0.5f))));\n}\n\n@group(0) @binding(1) var surface: texture_2d<f32>;\n\n@group(0) @binding(0) var reflection: texture_2d<f32>;\n\n@group(0) @binding(2) var sampler_1: sampler;\n\nstruct reflectionSelectFragment_Input {\n  @location(0) uv: vec2f,\n}\n\n@fragment fn reflectionSelectFragment(_arg_0: reflectionSelectFragment_Input, @builtin(position) position: vec4f) -> @location(0) vec4f {\n  let pixel = vec2i(floor(position.xy));\n  let roughness = textureLoad(surface, pixel, 0).w;\n  let lod = clamp(((roughness * roughness) * 4f), 0f, 4f);\n  return textureSampleLevel(reflection, sampler_1, _arg_0.uv, lod);\n}",
  "entryPoints": {
    "vertex": "reflectionSelectVertex",
    "fragment": "reflectionSelectFragment"
  },
  "bindGroups": [
    {
      "group": 0,
      "entries": [
        {
          "name": "reflection",
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
          "name": "sampler",
          "binding": 2,
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
