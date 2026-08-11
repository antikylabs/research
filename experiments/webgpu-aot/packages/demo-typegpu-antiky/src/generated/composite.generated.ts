import type { AotShaderArtifact } from "typegpu-antiky";

export const shader = {
  "wgsl": "struct compositeVertex_Output {\n  @builtin(position) position: vec4f,\n  @location(0) uv: vec2f,\n}\n\n@vertex fn compositeVertex(@builtin(vertex_index) vertexIndex: u32) -> compositeVertex_Output {\n  var position = vec2f(-1);\n  if ((vertexIndex == 1u)) {\n    position = vec2f(3, -1);\n  }\n  if ((vertexIndex == 2u)) {\n    position = vec2f(-1, 3);\n  }\n  return compositeVertex_Output(vec4f(position, 0f, 1f), vec2f(((position.x * 0.5f) + 0.5f), (0.5f - (position.y * 0.5f))));\n}\n\n@group(0) @binding(0) var temporal: texture_2d<f32>;\n\n@group(0) @binding(6) var reflection: texture_2d<f32>;\n\n@group(0) @binding(7) var sampler_1: sampler;\n\n@group(0) @binding(1) var bloomLevel0: texture_2d<f32>;\n\n@group(0) @binding(2) var bloomLevel1: texture_2d<f32>;\n\n@group(0) @binding(3) var bloomLevel2: texture_2d<f32>;\n\n@group(0) @binding(4) var bloomLevel3: texture_2d<f32>;\n\n@group(0) @binding(5) var bloomLevel4: texture_2d<f32>;\n\nfn antikyCombinedBloom(uv: vec2f) -> vec3f {\n  let level0 = textureSampleLevel(bloomLevel0, sampler_1, uv, 0).rgb;\n  let level1 = textureSampleLevel(bloomLevel1, sampler_1, uv, 0).rgb;\n  let level2 = textureSampleLevel(bloomLevel2, sampler_1, uv, 0).rgb;\n  let level3 = textureSampleLevel(bloomLevel3, sampler_1, uv, 0).rgb;\n  let level4 = textureSampleLevel(bloomLevel4, sampler_1, uv, 0).rgb;\n  return (((level0 * 0.179496f) + (level1 * 0.143748f)) + (((level2 * 0.108f) + (level3 * 0.072252f)) + (level4 * 0.036504f)));\n}\n\n@group(0) @binding(8) var<uniform> settings: vec4f;\n\nfn antikyAcesFilmicToneMapping(color: vec3f) -> vec3f {\n  let exposed = (color / 0.6f);\n  let inputColor = vec3f((((exposed.r * 0.59719f) + (exposed.g * 0.35458f)) + (exposed.b * 0.04823f)), (((exposed.r * 0.076f) + (exposed.g * 0.90834f)) + (exposed.b * 0.01566f)), (((exposed.r * 0.0284f) + (exposed.g * 0.13383f)) + (exposed.b * 0.83777f)));\n  let fitted = (((inputColor * (inputColor + vec3f(0.024578599259257317))) - vec3f(9.053700341610238e-5)) / ((inputColor * ((inputColor + vec3f(0.4329510033130646)) * vec3f(0.9837290048599243))) + vec3f(0.23808099329471588)));\n  return clamp(vec3f((((fitted.r * 1.60475f) - (fitted.g * 0.53108f)) - (fitted.b * 0.07367f)), (((fitted.r * -0.10208f) + (fitted.g * 1.10813f)) - (fitted.b * 0.00605f)), (((fitted.r * -0.00327f) - (fitted.g * 0.07276f)) + (fitted.b * 1.07602f))), vec3f(), vec3f(1));\n}\n\nfn antikySrgbTransferOetf(color: vec3f) -> vec3f {\n  let high = ((pow(color, vec3f(0.41666001081466675)) * vec3f(1.0549999475479126)) - vec3f(0.054999999701976776));\n  let low = (color * vec3f(12.920000076293945));\n  return vec3f(select(high.r, low.r, (color.r <= 0.0031308f)), select(high.g, low.g, (color.g <= 0.0031308f)), select(high.b, low.b, (color.b <= 0.0031308f)));\n}\n\nstruct compositeFragment_Input {\n  @location(0) uv: vec2f,\n}\n\n@fragment fn compositeFragment(_arg_0: compositeFragment_Input, @builtin(position) position: vec4f) -> @location(0) vec4f {\n  let pixel = vec2i(floor(position.xy));\n  var current = textureLoad(temporal, pixel, 0).rgb;\n  let reflection_1 = textureSampleLevel(reflection, sampler_1, _arg_0.uv, 0).rgb;\n  current = (current + reflection_1);\n  let bloom = antikyCombinedBloom(_arg_0.uv);\n  let linearDisplay = (current + bloom);\n  let toneMapped = antikyAcesFilmicToneMapping((linearDisplay * settings.y));\n  let display = antikySrgbTransferOetf(toneMapped);\n  return vec4f(display, 1f);\n}",
  "entryPoints": {
    "vertex": "compositeVertex",
    "fragment": "compositeFragment"
  },
  "bindGroups": [
    {
      "group": 0,
      "entries": [
        {
          "name": "temporal",
          "binding": 0,
          "visibility": [
            "fragment"
          ],
          "texture": {
            "sampleType": "unfilterable-float",
            "viewDimension": "2d"
          }
        },
        {
          "name": "bloomLevel0",
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
          "name": "bloomLevel1",
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
          "name": "bloomLevel2",
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
          "name": "bloomLevel3",
          "binding": 4,
          "visibility": [
            "fragment"
          ],
          "texture": {
            "sampleType": "float",
            "viewDimension": "2d"
          }
        },
        {
          "name": "bloomLevel4",
          "binding": 5,
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
          "binding": 6,
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
          "binding": 7,
          "visibility": [
            "fragment"
          ],
          "sampler": {
            "type": "filtering"
          }
        },
        {
          "name": "settings",
          "binding": 8,
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
        "format": "bgra8unorm"
      }
    ]
  },
  "kind": "render"
} as const satisfies AotShaderArtifact;
