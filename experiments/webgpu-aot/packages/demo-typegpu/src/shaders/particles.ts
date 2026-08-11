import tgpu, { d, std } from "typegpu";

import { FrameSchema } from "./frame.js";
import { TYPEGPU_CURVE_POINT_COUNT } from "./lights.js";

export const TYPEGPU_FIRE_PARTICLE_COUNT = 256;
export const TYPEGPU_CURVE_PARTICLE_COUNT = 150;
export const TYPEGPU_PARTICLE_COUNT =
  TYPEGPU_FIRE_PARTICLE_COUNT + TYPEGPU_CURVE_PARTICLE_COUNT;
export const TYPEGPU_SIMULATED_LIGHT_COUNT = 474;

export const ParticleSeedSchema = d
  .struct({
    originLife: d.vec4f,
    velocitySpeed: d.vec4f,
    colorRadius: d.vec4f,
  })
  .$name("TypeGpuParticleSeed");

export const ParticleSchema = d
  .struct({
    positionSize: d.vec4f,
    colorLife: d.vec4f,
  })
  .$name("TypeGpuParticle");

export const particleComputeLayout = tgpu
  .bindGroupLayout({
    particles: {
      storage: d.arrayOf(ParticleSchema, TYPEGPU_PARTICLE_COUNT),
      access: "mutable",
      visibility: ["compute"],
    },
    seeds: {
      storage: d.arrayOf(ParticleSeedSchema, TYPEGPU_PARTICLE_COUNT),
      access: "readonly",
      visibility: ["compute"],
    },
    clock: { uniform: d.vec4f, visibility: ["compute"] },
    curvePoints: {
      storage: d.arrayOf(d.vec4f, TYPEGPU_CURVE_POINT_COUNT),
      access: "readonly",
      visibility: ["compute"],
    },
  })
  .$idx(0)
  .$name("typeGpuParticleComputeLayout");

export const particleRenderLayout = tgpu
  .bindGroupLayout({
    frame: { uniform: FrameSchema, visibility: ["vertex"] },
    particles: {
      storage: d.arrayOf(ParticleSchema, TYPEGPU_PARTICLE_COUNT),
      access: "readonly",
      visibility: ["vertex"],
    },
  })
  .$idx(0)
  .$name("typeGpuParticleRenderLayout");

const particleNoise = tgpu
  .fn([d.vec3f], d.f32)((point) => {
    "use gpu";
    return std.fract(
      std.sin(std.dot(point, d.vec3f(12.9898, 78.233, 45.164))) *
        43758.5453,
    );
  })
  .$name("typeGpuParticleNoise");

const particleCurlNoise = tgpu
  .fn([d.vec3f], d.vec3f)((point) => {
    "use gpu";
    const epsilon = d.f32(0.1);
    const offsetX = d.vec3f(epsilon, 0, 0);
    const offsetY = d.vec3f(0, epsilon, 0);
    const offsetZ = d.vec3f(0, 0, epsilon);
    const nx = particleNoise(std.add(point, offsetX));
    const ny = particleNoise(std.add(point, offsetY));
    const nz = particleNoise(std.add(point, offsetZ));
    return d.vec3f(
      (ny - particleNoise(std.sub(point, offsetX))) / (2 * epsilon),
      (nz - particleNoise(std.sub(point, offsetY))) / (2 * epsilon),
      (nx - particleNoise(std.sub(point, offsetZ))) / (2 * epsilon),
    );
  })
  .$name("typeGpuParticleCurlNoise");

export const updateParticles = tgpu
  .computeFn({
    in: { id: d.builtin.globalInvocationId },
    workgroupSize: [64],
  })((input) => {
    "use gpu";
    const index = input.id.x;
    if (index >= d.u32(TYPEGPU_PARTICLE_COUNT)) return;
    if (particleComputeLayout.$.clock.x <= 0) return;

    let particle = ParticleSchema(
      particleComputeLayout.$.particles[index],
    );
    const seed = particleComputeLayout.$.seeds[index];
    let life =
      particle.colorLife.w +
      seed.velocitySpeed.w * particleComputeLayout.$.clock.y;
    if (life >= 1) {
      life = 0;
      particle.positionSize.x = seed.originLife.x;
      particle.positionSize.y = seed.originLife.y;
      particle.positionSize.z = seed.originLife.z;
    }

    if (index < d.u32(TYPEGPU_FIRE_PARTICLE_COUNT)) {
      const noisePoint = d.vec3f(
        particle.positionSize.x * 0.05,
        particle.positionSize.y * 0.05 +
          particleComputeLayout.$.clock.x * 0.05,
        particle.positionSize.z * 0.05,
      );
      const turbulence = particleCurlNoise(noisePoint);
      particle.positionSize.x +=
        (seed.velocitySpeed.x + turbulence.x * 0.2) *
        particleComputeLayout.$.clock.y;
      particle.positionSize.y +=
        (seed.velocitySpeed.y + turbulence.y * 0.2) *
        particleComputeLayout.$.clock.y;
      particle.positionSize.z +=
        (seed.velocitySpeed.z + turbulence.z * 0.2) *
        particleComputeLayout.$.clock.y;
      particle.positionSize.w =
        seed.colorRadius.w * std.max(0, 1 - life);
    } else {
      const scaled = std.min(life, 0.99999994) * 239;
      const startIndex = d.u32(std.floor(scaled));
      const endIndex = std.min(startIndex + 1, 239);
      const local = scaled - d.f32(startIndex);
      const point = std.mix(
        particleComputeLayout.$.curvePoints[startIndex],
        particleComputeLayout.$.curvePoints[endIndex],
        local,
      );
      particle.positionSize = d.vec4f(
        std.add(point.xyz, seed.velocitySpeed.xyz),
        seed.colorRadius.w,
      );
    }
    particle.colorLife = d.vec4f(seed.colorRadius.xyz, life);
    particleComputeLayout.$.particles[index] = ParticleSchema(particle);
  })
  .$name("updateParticles");

export const particleVertex = tgpu
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
    if (input.vertexIndex === 5) {
      corner = d.vec2f(1, 1);
    }
    const particle = particleRenderLayout.$.particles[input.instanceIndex];
    const clip = std.mul(
      particleRenderLayout.$.frame.viewProjection,
      d.vec4f(particle.positionSize.xyz, 1),
    );
    const aspectCorrection =
      particleRenderLayout.$.frame.settings.z /
      particleRenderLayout.$.frame.settings.y;
    const projectionScale = 1.428148;
    clip.x +=
      corner.x *
      particle.positionSize.w *
      aspectCorrection *
      projectionScale;
    clip.y += corner.y * particle.positionSize.w * projectionScale;
    return {
      position: clip,
      color: particle.colorLife.rgb,
    };
  })
  .$name("particleVertex");

export const particleFragment = tgpu
  .fragmentFn({
    in: { color: d.vec3f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    return d.vec4f(input.color, 1);
  })
  .$name("particleFragment");
