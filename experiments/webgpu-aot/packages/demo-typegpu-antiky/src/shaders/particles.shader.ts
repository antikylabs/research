import tgpu, { d, std } from "typegpu";

import { defineShader } from "typegpu-antiky/shader";

const PARTICLE_COUNT = 406;

const Frame = d
  .struct({
    viewProjection: d.mat4x4f,
    model: d.mat4x4f,
    nearShadowViewProjection: d.mat4x4f,
    farShadowViewProjection: d.mat4x4f,
    cameraPosition: d.vec4f,
    settings: d.vec4f,
  })
  .$name("AntikyParticleFrame");

const Particle = d
  .struct({
    positionSize: d.vec4f,
    colorIntensity: d.vec4f,
  })
  .$name("AntikyParticle");

const particleLayout = tgpu
  .bindGroupLayout({
    frame: { uniform: Frame, visibility: ["vertex"] },
    particles: {
      storage: d.arrayOf(Particle, PARTICLE_COUNT),
      access: "readonly",
      visibility: ["vertex"],
    },
  })
  .$idx(0)
  .$name("antikyParticleLayout");

const particleVertex = tgpu
  .vertexFn({
    in: {
      vertexIndex: d.builtin.vertexIndex,
      instanceIndex: d.builtin.instanceIndex,
    },
    out: {
      position: d.builtin.position,
      color: d.vec3f,
    },
  })((input) => {
    "use gpu";
    let corner = d.vec2f(-1, -1);
    if (input.vertexIndex === 1 || input.vertexIndex === 4) {
      corner = d.vec2f(1, -1);
    }
    if (input.vertexIndex === 2 || input.vertexIndex === 3) {
      corner = d.vec2f(-1, 1);
    }
    if (input.vertexIndex === 5) corner = d.vec2f(1, 1);

    const particle = particleLayout.$.particles[input.instanceIndex];
    let clip = std.mul(
      particleLayout.$.frame.viewProjection,
      d.vec4f(particle.positionSize.xyz, 1),
    );
    const aspectCorrection =
      particleLayout.$.frame.settings.z /
      particleLayout.$.frame.settings.y;
    const projectionScale = d.f32(1.428148);
    clip.x +=
      corner.x *
      particle.positionSize.w *
      aspectCorrection *
      projectionScale;
    clip.y += corner.y * particle.positionSize.w * projectionScale;
    return {
      position: clip,
      color: particle.colorIntensity.rgb,
    };
  })
  .$name("particleVertex");

const particleFragment = tgpu
  .fragmentFn({
    in: { color: d.vec3f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    return d.vec4f(input.color, 1);
  })
  .$name("particleFragment");

export default defineShader({
  vertex: particleVertex,
  fragment: particleFragment,
  entryPoints: { vertex: "particleVertex", fragment: "particleFragment" },
  bindGroups: [
    {
      group: 0,
      entries: [
        {
          name: "frame",
          binding: 0,
          visibility: ["vertex"],
          buffer: { type: "uniform", minBindingSize: 288 },
        },
        {
          name: "particles",
          binding: 1,
          visibility: ["vertex"],
          buffer: { type: "read-only-storage", minBindingSize: 12992 },
        },
      ],
    },
  ],
  pipeline: {
    vertexBuffers: [],
    primitive: { topology: "triangle-list", cullMode: "none" },
    targets: [
      {
        format: "rgba16float",
        blend: {
          color: {
            operation: "add",
            srcFactor: "src-alpha",
            dstFactor: "one",
          },
          alpha: { operation: "add", srcFactor: "one", dstFactor: "one" },
        },
      },
    ],
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: false,
      depthCompare: "less-equal",
    },
  },
});
