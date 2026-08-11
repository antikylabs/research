import type { AotShaderArtifact } from "typegpu-antiky";

export const shader = {
  "wgsl": "struct bloomVertex_Output {\n  @builtin(position) position: vec4f,\n  @location(0) uv: vec2f,\n}\n\n@vertex fn bloomVertex(@builtin(vertex_index) vertexIndex: u32) -> bloomVertex_Output {\n  var position = vec2f(-1);\n  if ((vertexIndex == 1u)) {\n    position = vec2f(3, -1);\n  }\n  if ((vertexIndex == 2u)) {\n    position = vec2f(-1, 3);\n  }\n  return bloomVertex_Output(vec4f(position, 0f, 1f), vec2f(((position.x * 0.5f) + 0.5f), (0.5f - (position.y * 0.5f))));\n}\n\n@group(0) @binding(3) var<uniform> settings: vec4f;\n\n@group(0) @binding(1) var reflection: texture_2d<f32>;\n\n@group(0) @binding(2) var sampler_1: sampler;\n\n@group(0) @binding(0) var source: texture_2d<f32>;\n\nfn antikyBloomSample(uv: vec2f) -> vec3f {\n  return textureSampleLevel(source, sampler_1, uv, 0).rgb;\n}\n\nstruct bloomFragment_Input {\n  @location(0) uv: vec2f,\n}\n\n@fragment fn bloomFragment(_arg_0: bloomFragment_Input) -> @location(0) vec4f {\n  let texel = settings.xy;\n  let direction = settings.zw;\n  if ((length(direction) < 0.5f)) {\n    let reflection_1 = textureSampleLevel(reflection, sampler_1, _arg_0.uv, 0).rgb;\n    let color = (antikyBloomSample(_arg_0.uv) + reflection_1);\n    let luminance = dot(color, vec3f(0.2125999927520752, 0.7152000069618225, 0.0722000002861023));\n    return vec4f((color * smoothstep(1f, 1.01f, luminance)), 1f);\n  }\n  let kernelRadius = length(direction);\n  let axis = (normalize(direction) * texel);\n  if ((kernelRadius < 1.5f)) {\n    var color = vec3f();\n    var weightTotal = 0f;\n    for (var offset = -6; (offset <= 6i); offset += 1i) {\n      let distance_1 = f32(offset);\n      let weight = exp((-((distance_1 * distance_1)) / 18f));\n      color = (color + (antikyBloomSample((_arg_0.uv + (axis * distance_1))) * weight));\n      weightTotal += weight;\n    }\n    return vec4f((color / weightTotal), 1f);\n  }\n  let sigma = (kernelRadius / 3f);\n  let centerWeight = (0.39894f / sigma);\n  var color = (antikyBloomSample(_arg_0.uv) * centerWeight);\n  for (var offset = 1; (offset < 22i); offset += 1i) {\n    let distance_1 = f32(offset);\n    if ((distance_1 >= kernelRadius)) {\n      break;\n    }\n    let weight = ((0.39894f * exp((((-0.5f * distance_1) * distance_1) / (sigma * sigma)))) / sigma);\n    color = (color + ((antikyBloomSample((_arg_0.uv + (axis * distance_1))) + antikyBloomSample((_arg_0.uv - (axis * distance_1)))) * weight));\n  }\n  return vec4f(color, 1f);\n}",
  "entryPoints": {
    "vertex": "bloomVertex",
    "fragment": "bloomFragment"
  },
  "bindGroups": [
    {
      "group": 0,
      "entries": [
        {
          "name": "source",
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
          "name": "reflection",
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
          "name": "sampler",
          "binding": 2,
          "visibility": [
            "fragment"
          ],
          "sampler": {
            "type": "filtering"
          }
        },
        {
          "name": "settings",
          "binding": 3,
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
