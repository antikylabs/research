import type { AotShaderArtifact } from "typegpu-antiky";

export const shader = {
  "wgsl": "struct AntikyShadowFrame {\n  lightViewProjection: mat4x4f,\n  model: mat4x4f,\n}\n\n@group(0) @binding(0) var<uniform> frame: AntikyShadowFrame;\n\nstruct shadowVertex_Output {\n  @builtin(position) position: vec4f,\n}\n\n@vertex fn shadowVertex(@location(0) position: vec3f) -> shadowVertex_Output {\n  let world = (frame.model * vec4f(position, 1f));\n  return shadowVertex_Output((frame.lightViewProjection * world));\n}\n\n@fragment fn shadowFragment() -> @location(0) vec4f {\n  return vec4f(1);\n}",
  "entryPoints": {
    "vertex": "shadowVertex",
    "fragment": "shadowFragment"
  },
  "bindGroups": [
    {
      "group": 0,
      "entries": [
        {
          "name": "frame",
          "binding": 0,
          "visibility": [
            "vertex"
          ],
          "buffer": {
            "type": "uniform",
            "minBindingSize": 128
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
      }
    ],
    "primitive": {
      "topology": "triangle-list",
      "cullMode": "back",
      "frontFace": "cw"
    },
    "targets": [
      {
        "format": "r8unorm"
      }
    ],
    "depthStencil": {
      "format": "depth24plus",
      "depthWriteEnabled": true,
      "depthCompare": "less-equal"
    }
  },
  "kind": "render"
} as const satisfies AotShaderArtifact;
