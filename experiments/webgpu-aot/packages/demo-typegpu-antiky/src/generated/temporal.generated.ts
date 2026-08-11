import type { AotShaderArtifact } from "typegpu-antiky";

export const shader = {
  "wgsl": "struct temporalVertex_Output {\n  @builtin(position) position: vec4f,\n  @location(0) uv: vec2f,\n}\n\n@vertex fn temporalVertex(@builtin(vertex_index) vertexIndex: u32) -> temporalVertex_Output {\n  var position = vec2f(-1);\n  if ((vertexIndex == 1u)) {\n    position = vec2f(3, -1);\n  }\n  if ((vertexIndex == 2u)) {\n    position = vec2f(-1, 3);\n  }\n  return temporalVertex_Output(vec4f(position, 0f, 1f), vec2f(((position.x * 0.5f) + 0.5f), (0.5f - (position.y * 0.5f))));\n}\n\n@group(0) @binding(3) var<uniform> settings: vec4f;\n\n@group(0) @binding(0) var currentHdr: texture_2d<f32>;\n\n@group(0) @binding(1) var ambient: texture_2d<f32>;\n\nfn antikyTemporalCurrent(pixel: vec2i) -> vec3f {\n  let color = textureLoad(currentHdr, pixel, 0).rgb;\n  let ambient_1 = textureLoad(ambient, pixel, 0).r;\n  return (color * ambient_1);\n}\n\n@group(0) @binding(2) var history: texture_2d<f32>;\n\nfn antikyTemporalClipAabb(historyColor: vec3f, minimumColor: vec3f, maximumColor: vec3f) -> vec3f {\n  let center = ((maximumColor + minimumColor) * 0.5f);\n  let extent = (((maximumColor - minimumColor) * 0.5f) + vec3f(1.0000000116860974e-7));\n  let delta = (historyColor - center);\n  let unit = abs((delta / extent));\n  let maximumUnit = max(max(unit.x, unit.y), unit.z);\n  return select(historyColor, (center + (delta / maximumUnit)), (maximumUnit > 1f));\n}\n\n@fragment fn temporalFragment(@builtin(position) position: vec4f) -> @location(0) vec4f {\n  let size = vec2i(settings.xy);\n  let maximumPixel = (size - vec2i(1));\n  let pixel = clamp(vec2i(floor(position.xy)), vec2i(), maximumPixel);\n  var firstMoment = vec3f();\n  var secondMoment = vec3f();\n  for (var y = -1; (y <= 1i); y += 1i) {\n    for (var x = -1; (x <= 1i); x += 1i) {\n      let samplePixel = clamp((pixel + vec2i(x, y)), vec2i(), maximumPixel);\n      let neighbor = max(antikyTemporalCurrent(samplePixel), vec3f());\n      firstMoment = (firstMoment + neighbor);\n      secondMoment = (secondMoment + (neighbor * neighbor));\n    }\n  }\n  let hasValidHistory = (settings.z > 0f);\n  let currentColor = antikyTemporalCurrent(pixel);\n  let mean = (firstMoment / 9f);\n  let deviation = sqrt(max(((secondMoment / 9f) - (mean * mean)), vec3f()));\n  let minimumColor = (mean - deviation);\n  let maximumColor = (mean + deviation);\n  let historyColor = textureLoad(history, pixel, 0).rgb;\n  let clippedHistory = antikyTemporalClipAabb(historyColor, minimumColor, maximumColor);\n  var currentWeight = select(1f, 0.05000000074505806f, hasValidHistory);\n  var historyWeight = (1f - currentWeight);\n  let luma = vec3f(0.2125999927520752, 0.7152000069618225, 0.0722000002861023);\n  let compressedCurrent = (currentColor / (max(max(currentColor.r, currentColor.g), currentColor.b) + 1f));\n  let compressedHistory = (clippedHistory / (max(max(clippedHistory.r, clippedHistory.g), clippedHistory.b) + 1f));\n  currentWeight *= (1f / (dot(compressedCurrent, luma) + 1f));\n  historyWeight *= (1f / (dot(compressedHistory, luma) + 1f));\n  let resolved = (((currentColor * currentWeight) + (clippedHistory * historyWeight)) / max((currentWeight + historyWeight), 1e-5f));\n  return vec4f(max(resolved, vec3f()), 1f);\n}",
  "entryPoints": {
    "vertex": "temporalVertex",
    "fragment": "temporalFragment"
  },
  "bindGroups": [
    {
      "group": 0,
      "entries": [
        {
          "name": "currentHdr",
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
          "name": "ambient",
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
          "name": "history",
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
