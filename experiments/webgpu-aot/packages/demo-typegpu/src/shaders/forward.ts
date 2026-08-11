import tgpu, { common, d, std } from "typegpu";

import { ambientFragment } from "./ambient.js";
import { bloomFragment, bloomVertex } from "./bloom.js";
import { compositeFragment } from "./composite.js";
import { FrameSchema } from "./frame.js";
import {
  LightSchema,
  MAX_FORWARD_LIGHTS,
  updateLights,
} from "./lights.js";
import {
  particleFragment,
  particleVertex,
  updateParticles,
} from "./particles.js";
import { reflectionFragment } from "./reflection.js";
import {
  reflectionReconstructFragment,
  reflectionSelectFragment,
} from "./reflection-reconstruct.js";
import { shadowVertex } from "./shadow.js";
import { temporalFragment } from "./temporal.js";
import {
  createTypeGpuSunPlan,
  TYPEGPU_SHADOW_RESOLUTION,
  TYPEGPU_SUN,
} from "../sun.js";

export {
  TYPEGPU_PARTICLE_COUNT,
  TYPEGPU_SIMULATED_LIGHT_COUNT,
} from "./particles.js";
export { FrameSchema } from "./frame.js";
export {
  computeLayout,
  LightSchema,
  MAX_FORWARD_LIGHTS,
  TYPEGPU_CURVE_POINT_COUNT,
  updateLights,
} from "./lights.js";

export const TYPEGPU_ENVIRONMENT_MAX_MIP = 8;
export const TYPEGPU_IBL_DIFFUSE_GAIN = 1;
export const TYPEGPU_IBL_SPECULAR_GAIN = 1;
export const TYPEGPU_BACKGROUND_ENVIRONMENT_GAIN = 0.22;
export const MaterialSchema = d
  .struct({
    baseColorFactor: d.vec4f,
    factors: d.vec4f,
  })
  .$name("TypeGpuMaterial");
export const sceneLayout = tgpu
  .bindGroupLayout({
    frame: { uniform: FrameSchema, visibility: ["vertex", "fragment", "compute"] },
    lights: {
      storage: d.arrayOf(LightSchema, MAX_FORWARD_LIGHTS),
      access: "readonly",
      visibility: ["vertex", "fragment"],
    },
    nearShadow: { texture: d.textureDepth2d(), visibility: ["fragment"] },
    farShadow: { texture: d.textureDepth2d(), visibility: ["fragment"] },
    shadowSampler: { sampler: "comparison", visibility: ["fragment"] },
    environmentMap: { texture: d.textureCube(d.f32), visibility: ["fragment"] },
    environmentSampler: { sampler: "filtering", visibility: ["fragment"] },
  })
  .$idx(0)
  .$name("typeGpuSceneLayout");
export const materialLayout = tgpu
  .bindGroupLayout({
    sampler: { sampler: "filtering", visibility: ["fragment"] },
    baseColor: { texture: d.texture2d(d.f32), visibility: ["fragment"] },
    normal: { texture: d.texture2d(d.f32), visibility: ["fragment"] },
    metallicRoughness: {
      texture: d.texture2d(d.f32),
      visibility: ["fragment"],
    },
    material: { uniform: MaterialSchema, visibility: ["fragment"] },
  })
  .$idx(1)
  .$name("typeGpuMaterialLayout");
export const positionLayout = tgpu
  .vertexLayout((count) => d.disarrayOf(d.vec3f, count))
  .$name("positionLayout");
export const normalLayout = tgpu
  .vertexLayout((count) => d.disarrayOf(d.vec3f, count))
  .$name("normalLayout");
export const texcoordLayout = tgpu
  .vertexLayout((count) => d.disarrayOf(d.vec2f, count))
  .$name("texcoordLayout");

const fresnelSchlick = tgpu
  .fn([d.f32, d.vec3f], d.vec3f)((cosine, reflectance) => {
    "use gpu";
    return std.add(
      reflectance,
      std.mul(
        std.sub(d.vec3f(1), reflectance),
        std.pow(1 - cosine, 5),
      ),
    );
  })
  .$name("fresnelSchlick");

const directBrdf = tgpu
  .fn(
    [d.vec3f, d.vec3f, d.vec3f, d.vec3f, d.f32, d.f32],
    d.vec3f,
  )((normal, view, light, albedo, metallic, roughness) => {
    "use gpu";
    const halfway = std.normalize(std.add(view, light));
    const nDotL = std.max(std.dot(normal, light), 0);
    const nDotV = std.max(std.dot(normal, view), 0);
    const nDotH = std.max(std.dot(normal, halfway), 0);
    const a = roughness * roughness;
    const a2 = a * a;
    const denominator = nDotH * nDotH * (a2 - 1) + 1;
    const distribution = a2 / std.max(Math.PI * denominator * denominator, 0.0001);
    const k = ((roughness + 1) * (roughness + 1)) / 8;
    const geometry =
      (nDotL / std.max(nDotL * (1 - k) + k, 0.0001)) *
      (nDotV / std.max(nDotV * (1 - k) + k, 0.0001));
    const baseReflectance = std.mix(d.vec3f(0.04), albedo, metallic);
    const fresnel = fresnelSchlick(std.max(std.dot(halfway, view), 0), baseReflectance);
    const specular = std.div(
      std.mul(distribution * geometry, fresnel),
      std.max(4 * nDotV * nDotL, 0.001),
    );
    const diffuse = std.mul(
      (1 - metallic) / Math.PI,
      std.mul(std.sub(d.vec3f(1), fresnel), albedo),
    );
    return std.mul(std.add(diffuse, specular), nDotL);
  })
  .$name("directBrdf");

const environmentDirection = tgpu
  .fn([d.vec3f], d.vec3f)((direction) => {
    "use gpu";
    return d.vec3f(-direction.x, direction.y, direction.z);
  })
  .$name("typeGpuEnvironmentDirection");

const environmentBrdf = tgpu
  .fn(
    [d.vec3f, d.vec3f, d.vec3f, d.f32, d.f32, d.f32],
    d.vec3f,
  )((normal, view, albedo, metallic, roughness, ambientOcclusion) => {
    "use gpu";
    const nDotV = std.clamp(std.dot(normal, view), 0, 1);
    const roughnessSquared = roughness * roughness;
    const reflected = std.reflect(std.neg(view), normal);
    const reflectedDirection = std.normalize(
      std.mix(reflected, normal, roughnessSquared * roughnessSquared),
    );
    const irradiance = std.textureSampleLevel(
      sceneLayout.$.environmentMap,
      sceneLayout.$.environmentSampler,
      environmentDirection(normal),
      sceneLayout.$.frame.environment.x * 0.72,
    ).rgb;
    const radiance = std.textureSampleLevel(
      sceneLayout.$.environmentMap,
      sceneLayout.$.environmentSampler,
      environmentDirection(reflectedDirection),
      roughness * sceneLayout.$.frame.environment.x,
    ).rgb;

    const approximation = std.add(
      std.mul(roughness, d.vec4f(-1, -0.0275, -0.572, 0.022)),
      d.vec4f(1, 0.0425, 1.04, -0.04),
    );
    const integrated =
      std.min(
        approximation.x * approximation.x,
        std.exp2(-9.28 * nDotV),
      ) * approximation.x + approximation.y;
    const dfg = std.add(
      std.mul(d.vec2f(-1.04, 1.04), integrated),
      approximation.zw,
    );
    const energyMissing = 1 - dfg.x - dfg.y;

    const dielectricF0 = d.vec3f(0.04);
    const dielectricSingle = std.add(
      std.mul(dielectricF0, dfg.x),
      d.vec3f(dfg.y),
    );
    const dielectricAverage = std.add(
      dielectricF0,
      std.div(std.sub(d.vec3f(1), dielectricF0), 21),
    );
    const dielectricMulti = std.div(
      std.mul(
        std.mul(dielectricSingle, dielectricAverage),
        energyMissing,
      ),
      std.max(
        std.sub(
          d.vec3f(1),
          std.mul(dielectricAverage, energyMissing),
        ),
        d.vec3f(0.000001),
      ),
    );

    const metalSingle = std.add(std.mul(albedo, dfg.x), d.vec3f(dfg.y));
    const metalAverage = std.add(
      albedo,
      std.div(std.sub(d.vec3f(1), albedo), 21),
    );
    const metalMulti = std.div(
      std.mul(std.mul(metalSingle, metalAverage), energyMissing),
      std.max(
        std.sub(d.vec3f(1), std.mul(metalAverage, energyMissing)),
        d.vec3f(0.000001),
      ),
    );

    const singleScattering = std.mix(
      dielectricSingle,
      metalSingle,
      metallic,
    );
    const multiScattering = std.mix(
      dielectricMulti,
      metalMulti,
      metallic,
    );
    const diffuseEnergy = std.sub(
      std.sub(d.vec3f(1), dielectricSingle),
      dielectricMulti,
    );
    const specularOcclusion = std.clamp(
      ambientOcclusion +
        std.pow(
          nDotV + ambientOcclusion,
          std.exp2(-1 - 16 * roughness),
        ) -
        1,
      0,
      1,
    );
    const diffuse = std.mul(
      irradiance,
      std.mul(
        std.mul(
          std.mul(albedo, 1 - metallic),
          diffuseEnergy,
        ),
        ambientOcclusion * sceneLayout.$.frame.environment.y,
      ),
    );
    const specular = std.mul(
      std.add(
        std.mul(radiance, singleScattering),
        std.mul(irradiance, multiScattering),
      ),
      specularOcclusion * sceneLayout.$.frame.environment.z,
    );
    return std.add(diffuse, specular);
  })
  .$name("typeGpuEnvironmentBrdf");

const TYPEGPU_SUN_PLAN = createTypeGpuSunPlan(16 / 9);
const TYPEGPU_SHADOW_TEXEL_SIZE = 1 / TYPEGPU_SHADOW_RESOLUTION;

const sampleSunCascade = tgpu
  .fn(
    [d.textureDepth2d(), d.mat4x4f, d.vec3f, d.f32],
    d.f32,
  )((shadowMap, viewProjection, position, bias) => {
    "use gpu";
    const clip = std.mul(viewProjection, d.vec4f(position, 1));
    if (clip.w <= 0) return 1;

    const ndc = std.div(clip.xyz, clip.w);
    const uv = d.vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    const edgeGuard = TYPEGPU_SHADOW_TEXEL_SIZE * 1.5;
    if (
      uv.x <= edgeGuard ||
      uv.x >= 1 - edgeGuard ||
      uv.y <= edgeGuard ||
      uv.y >= 1 - edgeGuard ||
      ndc.z <= 0 ||
      ndc.z >= 1
    ) {
      return 1;
    }

    let visibility = d.f32(0);
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const offset = std.mul(
          d.vec2f(d.f32(offsetX), d.f32(offsetY)),
          TYPEGPU_SHADOW_TEXEL_SIZE,
        );
        visibility += std.textureSampleCompareLevel(
          shadowMap,
          sceneLayout.$.shadowSampler,
          std.add(uv, offset),
          ndc.z + bias,
        );
      }
    }
    return visibility / 9;
  })
  .$name("typeGpuSampleSunCascade");

export const forwardVertex = tgpu
  .vertexFn({
    in: { position: d.vec3f, normal: d.vec3f, uv: d.vec2f },
    out: {
      position: d.builtin.position,
      worldPosition: d.vec3f,
      normal: d.vec3f,
      uv: d.vec2f,
    },
  })((input) => {
    "use gpu";
    const world = std.mul(sceneLayout.$.frame.model, d.vec4f(input.position, 1));
    return {
      position: std.mul(sceneLayout.$.frame.viewProjection, world),
      worldPosition: world.xyz,
      normal: std.normalize(
        std.mul(sceneLayout.$.frame.model, d.vec4f(input.normal, 0)).xyz,
      ),
      uv: input.uv,
    };
  })
  .$name("forwardVertex");

export const forwardFragment = tgpu
  .fragmentFn({
    in: {
      worldPosition: d.vec3f,
      normal: d.vec3f,
      uv: d.vec2f,
      frontFacing: d.builtin.frontFacing,
    },
    out: {
      color: d.location(0, d.vec4f),
      surface: d.location(1, d.vec4f),
      worldMetal: d.location(2, d.vec4f),
    },
  })((input) => {
    "use gpu";
    const base = std.mul(
      std.textureSample(materialLayout.$.baseColor, materialLayout.$.sampler, input.uv),
      materialLayout.$.material.baseColorFactor,
    );
    if (
      materialLayout.$.material.factors.x > 0 &&
      base.a < materialLayout.$.material.factors.x
    ) {
      std.discard();
    }

    const faceNormal = std.normalize(
      std.select(std.neg(input.normal), input.normal, input.frontFacing),
    );
    const positionDx = std.dpdx(input.worldPosition);
    const positionDy = std.dpdy(input.worldPosition);
    const uvDx = std.dpdx(input.uv);
    const uvDy = std.dpdy(input.uv);
    const determinant = uvDx.x * uvDy.y - uvDx.y * uvDy.x;
    let tangent = std.normalize(
      std.sub(positionDx, std.mul(faceNormal, std.dot(faceNormal, positionDx))),
    );
    let bitangent = std.normalize(std.cross(faceNormal, tangent));
    if (std.abs(determinant) > 0.00001) {
      tangent = std.normalize(
        std.div(
          std.sub(std.mul(positionDx, uvDy.y), std.mul(positionDy, uvDx.y)),
          determinant,
        ),
      );
      bitangent = std.normalize(
        std.div(
          std.add(std.mul(positionDx, -uvDy.x), std.mul(positionDy, uvDx.x)),
          determinant,
        ),
      );
    }
    const sampledNormal = std.sub(
      std.mul(
        std.textureSample(materialLayout.$.normal, materialLayout.$.sampler, input.uv).xyz,
        2,
      ),
      d.vec3f(1),
    );
    const worldNormal = std.normalize(
      std.add(
        std.add(std.mul(tangent, sampledNormal.x), std.mul(bitangent, sampledNormal.y)),
        std.mul(faceNormal, sampledNormal.z),
      ),
    );
    const materialSample = std.textureSample(
      materialLayout.$.metallicRoughness,
      materialLayout.$.sampler,
      input.uv,
    );
    const metallic = std.clamp(
      materialSample.b * materialLayout.$.material.factors.y,
      0,
      1,
    );
    const roughness = std.clamp(
      materialSample.g * materialLayout.$.material.factors.z,
      0.045,
      1,
    );
    const view = std.normalize(
      std.sub(sceneLayout.$.frame.cameraPosition.xyz, input.worldPosition),
    );

    const sunDirection = d.vec3f(
      TYPEGPU_SUN.direction[0],
      TYPEGPU_SUN.direction[1],
      TYPEGPU_SUN.direction[2],
    );
    const sunLighting = std.mul(
      directBrdf(
        worldNormal,
        view,
        sunDirection,
        base.rgb,
        metallic,
        roughness,
      ),
      std.mul(
        d.vec3f(
          TYPEGPU_SUN.color[0],
          TYPEGPU_SUN.color[1],
          TYPEGPU_SUN.color[2],
        ),
        TYPEGPU_SUN.intensity,
      ),
    );
    let localLighting = d.vec3f(0);
    for (let index = 0; index < MAX_FORWARD_LIGHTS; index += 1) {
      if (index >= d.i32(sceneLayout.$.frame.settings.x)) break;
      const light = sceneLayout.$.lights[index];
      const toLight = std.sub(light.positionRadius.xyz, input.worldPosition);
      const distance = std.length(toLight);
      if (distance < light.positionRadius.w) {
        const direction = std.div(toLight, std.max(distance, 0.001));
        const distanceRatio = distance / light.positionRadius.w;
        const cutoff = std.clamp(1 - std.pow(distanceRatio, 4), 0, 1);
        const attenuation =
          (1 / std.max(distance * distance, 0.01)) * cutoff * cutoff;
        localLighting = std.add(
          localLighting,
          std.mul(
            directBrdf(
              worldNormal,
              view,
              direction,
              base.rgb,
              metallic,
              roughness,
            ),
            std.mul(
              light.colorIntensity.rgb,
              light.colorIntensity.w * attenuation,
            ),
          ),
        );
      }
    }

    const receiverPosition = std.add(
      input.worldPosition,
      std.mul(worldNormal, TYPEGPU_SUN.shadow.normalBias),
    );
    const nearVisibility = sampleSunCascade(
      sceneLayout.$.nearShadow,
      sceneLayout.$.frame.nearShadowViewProjection,
      receiverPosition,
      TYPEGPU_SUN.shadow.biases[0],
    );
    const farVisibility = sampleSunCascade(
      sceneLayout.$.farShadow,
      sceneLayout.$.frame.farShadowViewProjection,
      receiverPosition,
      TYPEGPU_SUN.shadow.biases[1],
    );
    const viewDepth = std.dot(
      std.sub(input.worldPosition, sceneLayout.$.frame.cameraPosition.xyz),
      d.vec3f(
        TYPEGPU_SUN_PLAN.cameraForward[0],
        TYPEGPU_SUN_PLAN.cameraForward[1],
        TYPEGPU_SUN_PLAN.cameraForward[2],
      ),
    );
    let visibility = std.mix(
      nearVisibility,
      farVisibility,
      std.smoothstep(
        TYPEGPU_SUN_PLAN.fadeStartDistance,
        TYPEGPU_SUN_PLAN.fadeEndDistance,
        viewDepth,
      ),
    );
    if (viewDepth <= TYPEGPU_SUN_PLAN.fadeStartDistance) {
      visibility = nearVisibility;
    }
    if (viewDepth >= TYPEGPU_SUN_PLAN.fadeEndDistance) {
      visibility = farVisibility;
    }
    const imageBasedLighting = environmentBrdf(
      worldNormal,
      view,
      base.rgb,
      metallic,
      roughness,
      1,
    );
    const shadowedSun = std.mul(sunLighting, visibility);
    let color = std.add(
      std.add(shadowedSun, localLighting),
      imageBasedLighting,
    );
    return {
      color: d.vec4f(color, base.a),
      surface: d.vec4f(std.add(std.mul(worldNormal, 0.5), 0.5), roughness),
      worldMetal: d.vec4f(input.worldPosition, metallic),
    };
  })
  .$name("forwardFragment");

export const backgroundFragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: {
      color: d.location(0, d.vec4f),
      surface: d.location(1, d.vec4f),
      worldMetal: d.location(2, d.vec4f),
    },
  })((input) => {
    "use gpu";
    const clip = d.vec4f(input.uv.x * 2 - 1, 1 - input.uv.y * 2, 1, 1);
    const projected = std.mul(sceneLayout.$.frame.inverseViewProjection, clip);
    const farPosition = std.div(projected.xyz, projected.w);
    const direction = std.normalize(
      std.sub(farPosition, sceneLayout.$.frame.cameraPosition.xyz),
    );
    const environment = std.mul(
      std.textureSampleLevel(
        sceneLayout.$.environmentMap,
        sceneLayout.$.environmentSampler,
        environmentDirection(direction),
        0,
      ).rgb,
      sceneLayout.$.frame.environment.w,
    );
    return {
      color: d.vec4f(environment, 1),
      surface: d.vec4f(0),
      worldMetal: d.vec4f(0),
    };
  })
  .$name("backgroundFragment");

export function resolveTypeGpuRendererWGSL(): {
  readonly forward: string;
  readonly background: string;
  readonly shadow: string;
  readonly compute: string;
  readonly particleCompute: string;
  readonly bloom: string;
  readonly ambient: string;
  readonly composite: string;
  readonly particles: string;
  readonly reflection: string;
  readonly reflectionReconstruct: string;
  readonly reflectionSelect: string;
  readonly temporal: string;
} {
  const options = { names: "strict" as const };
  return {
    forward: tgpu.resolve([forwardVertex, forwardFragment], options),
    background: tgpu.resolve([common.fullScreenTriangle, backgroundFragment], options),
    shadow: tgpu.resolve([shadowVertex], options),
    compute: tgpu.resolve([updateLights], options),
    particleCompute: tgpu.resolve([updateParticles], options),
    bloom: tgpu.resolve([bloomVertex, bloomFragment], options),
    ambient: tgpu.resolve([common.fullScreenTriangle, ambientFragment], options),
    composite: tgpu.resolve([common.fullScreenTriangle, compositeFragment], options),
    particles: tgpu.resolve([particleVertex, particleFragment], options),
    reflection: tgpu.resolve([common.fullScreenTriangle, reflectionFragment], options),
    reflectionReconstruct: tgpu.resolve(
      [common.fullScreenTriangle, reflectionReconstructFragment],
      options,
    ),
    reflectionSelect: tgpu.resolve(
      [common.fullScreenTriangle, reflectionSelectFragment],
      options,
    ),
    temporal: tgpu.resolve([common.fullScreenTriangle, temporalFragment], options),
  };
}
