import type { AotShaderArtifact } from "typegpu-antiky";

export const shader = {
  "wgsl": "struct AntikyParticle {\n  positionSize: vec4f,\n  colorIntensity: vec4f,\n}\n\n@group(0) @binding(1) var<storage, read> particles: array<AntikyParticle, 406>;\n\nstruct AntikyParticleFrame {\n  viewProjection: mat4x4f,\n  model: mat4x4f,\n  nearShadowViewProjection: mat4x4f,\n  farShadowViewProjection: mat4x4f,\n  cameraPosition: vec4f,\n  settings: vec4f,\n}\n\n@group(0) @binding(0) var<uniform> frame: AntikyParticleFrame;\n\nstruct particleVertex_Output {\n  @builtin(position) position: vec4f,\n  @location(0) color: vec3f,\n}\n\n@vertex fn particleVertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> particleVertex_Output {\n  var corner = vec2f(-1);\n  if (((vertexIndex == 1u) || (vertexIndex == 4u))) {\n    corner = vec2f(1, -1);\n  }\n  if (((vertexIndex == 2u) || (vertexIndex == 3u))) {\n    corner = vec2f(-1, 1);\n  }\n  if ((vertexIndex == 5u)) {\n    corner = vec2f(1);\n  }\n  let particle = (&particles[instanceIndex]);\n  var clip = (frame.viewProjection * vec4f((*particle).positionSize.xyz, 1f));\n  let aspectCorrection = (frame.settings.z / frame.settings.y);\n  const projectionScale = 1.4281480312347412f;\n  clip.x += (((corner.x * (*particle).positionSize.w) * aspectCorrection) * projectionScale);\n  clip.y += ((corner.y * (*particle).positionSize.w) * projectionScale);\n  return particleVertex_Output(clip, (*particle).colorIntensity.rgb);\n}\n\nstruct particleFragment_Input {\n  @location(0) color: vec3f,\n}\n\n@fragment fn particleFragment(_arg_0: particleFragment_Input) -> @location(0) vec4f {\n  return vec4f(_arg_0.color, 1f);\n}",
  "entryPoints": {
    "vertex": "particleVertex",
    "fragment": "particleFragment"
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
            "minBindingSize": 288
          }
        },
        {
          "name": "particles",
          "binding": 1,
          "visibility": [
            "vertex"
          ],
          "buffer": {
            "type": "read-only-storage",
            "minBindingSize": 12992
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
        "format": "rgba16float",
        "blend": {
          "color": {
            "operation": "add",
            "srcFactor": "src-alpha",
            "dstFactor": "one"
          },
          "alpha": {
            "operation": "add",
            "srcFactor": "one",
            "dstFactor": "one"
          }
        }
      }
    ],
    "depthStencil": {
      "format": "depth24plus",
      "depthWriteEnabled": false,
      "depthCompare": "less-equal"
    }
  },
  "kind": "render"
} as const satisfies AotShaderArtifact;
