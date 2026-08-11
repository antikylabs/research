import tgpu, { d, std } from "typegpu";

export const MAX_FORWARD_LIGHTS = 64;
export const TYPEGPU_CURVE_POINT_COUNT = 240;

export const LightSchema = d
  .struct({
    basePosition: d.vec4f,
    positionRadius: d.vec4f,
    colorIntensity: d.vec4f,
    motion: d.vec4f,
  })
  .$name("TypeGpuLight");

export const computeLayout = tgpu
  .bindGroupLayout({
    lights: {
      storage: d.arrayOf(LightSchema, MAX_FORWARD_LIGHTS),
      access: "mutable",
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
  .$name("typeGpuComputeLayout");

const lightNoise = tgpu
  .fn([d.vec3f], d.f32)((point) => {
    "use gpu";
    return std.fract(
      std.sin(std.dot(point, d.vec3f(12.9898, 78.233, 45.164))) *
        43758.5453,
    );
  })
  .$name("typeGpuLightNoise");

const lightCurlNoise = tgpu
  .fn([d.vec3f], d.vec3f)((point) => {
    "use gpu";
    const epsilon = d.f32(0.1);
    const offsetX = d.vec3f(epsilon, 0, 0);
    const offsetY = d.vec3f(0, epsilon, 0);
    const offsetZ = d.vec3f(0, 0, epsilon);
    const nx = lightNoise(std.add(point, offsetX));
    const ny = lightNoise(std.add(point, offsetY));
    const nz = lightNoise(std.add(point, offsetZ));
    return d.vec3f(
      (ny - lightNoise(std.sub(point, offsetX))) / (2 * epsilon),
      (nz - lightNoise(std.sub(point, offsetY))) / (2 * epsilon),
      (nx - lightNoise(std.sub(point, offsetZ))) / (2 * epsilon),
    );
  })
  .$name("typeGpuLightCurlNoise");

export const updateLights = tgpu
  .computeFn({
    in: { id: d.builtin.globalInvocationId },
    workgroupSize: [64],
  })((input) => {
    "use gpu";
    const index = input.id.x;
    if (index >= d.u32(computeLayout.$.clock.w)) return;
    let light = LightSchema(computeLayout.$.lights[index]);
    if (index < 4) return;
    if (index < 20) {
      if (computeLayout.$.clock.x > 0) {
        let life = light.basePosition.w + light.motion.w * (1 / 60);
        if (life >= 1) {
          life = 0;
          light.positionRadius.x = light.basePosition.x;
          light.positionRadius.y = light.basePosition.y;
          light.positionRadius.z = light.basePosition.z;
        }
        light.basePosition.w = life;
        const noisePoint = d.vec3f(
          light.positionRadius.x * 0.05,
          light.positionRadius.y * 0.05 + computeLayout.$.clock.x * 0.05,
          light.positionRadius.z * 0.05,
        );
        const turbulence = lightCurlNoise(noisePoint);
        light.positionRadius.x +=
          (light.motion.x + turbulence.x * 0.2) * (1 / 60);
        light.positionRadius.y +=
          (light.motion.y + turbulence.y * 0.2) * (1 / 60);
        light.positionRadius.z +=
          (light.motion.z + turbulence.z * 0.2) * (1 / 60);
      }
      light.colorIntensity.w = 4 * std.max(0, 1 - light.basePosition.w);
    } else if (index < 28) {
      const sourceIndex = ((index - 20) * 150) / 8;
      const life = std.fract(
        d.f32(sourceIndex) / 150 + computeLayout.$.clock.x * 0.01,
      );
      const scaled = std.min(life, 0.99999994) * 239;
      const startIndex = d.u32(std.floor(scaled));
      const endIndex = std.min(startIndex + 1, 239);
      const local = scaled - d.f32(startIndex);
      const point = std.mix(
        computeLayout.$.curvePoints[startIndex],
        computeLayout.$.curvePoints[endIndex],
        local,
      );
      light.positionRadius = d.vec4f(
        std.add(point.xyz, light.motion.xyz),
        4,
      );
      light.colorIntensity.w = 4;
    } else if (index < 32) {
      const life = std.fract(
        light.basePosition.w + computeLayout.$.clock.x * 0.01,
      );
      const phase = life + life * light.motion.y * 30;
      const fade =
        std.smoothstep(0, 0.1, life) *
        (1 - std.smoothstep(0.9, 1, life));
      light.positionRadius = d.vec4f(
        life * 15 - 7.5,
        std.cos(phase) * 1.2 + 3.5,
        std.sin(phase) * 1.075 + light.motion.x,
        std.max(0.001, 2 * fade),
      );
      light.colorIntensity.w = 2 * fade;
    }
    computeLayout.$.lights[index] = LightSchema(light);
  })
  .$name("updateLights");
