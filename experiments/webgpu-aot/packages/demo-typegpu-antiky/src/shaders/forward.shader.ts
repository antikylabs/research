import tgpu, { d, std } from "typegpu";

import { defineShader } from "typegpu-antiky/shader";

import { ANTIKY_SUN, createAntikySunPlan } from "../sun.js";

const MAX_LIGHTS = 64;
const SUN_PLAN = createAntikySunPlan(16 / 9);
const SUN_TEXEL_SIZE = 1 / SUN_PLAN.resolution;

const Frame = d
  .struct({
    viewProjection: d.mat4x4f,
    model: d.mat4x4f,
    nearShadowViewProjection: d.mat4x4f,
    farShadowViewProjection: d.mat4x4f,
    cameraPosition: d.vec4f,
    settings: d.vec4f,
  })
  .$name("AntikyForwardFrame");

const Light = d
  .struct({
    positionRadius: d.vec4f,
    colorIntensity: d.vec4f,
  })
  .$name("AntikyForwardLight");

const Material = d
  .struct({
    baseColorFactor: d.vec4f,
    factors: d.vec4f,
  })
  .$name("AntikyForwardMaterial");

const sceneLayout = tgpu
  .bindGroupLayout({
    frame: { uniform: Frame, visibility: ["vertex", "fragment"] },
    lights: {
      storage: d.arrayOf(Light, MAX_LIGHTS),
      access: "readonly",
      visibility: ["fragment"],
    },
    nearShadow: { texture: d.textureDepth2d(), visibility: ["fragment"] },
    farShadow: { texture: d.textureDepth2d(), visibility: ["fragment"] },
    shadowSampler: { sampler: "comparison", visibility: ["fragment"] },
    environmentSampler: { sampler: "filtering", visibility: ["fragment"] },
    environmentMap: {
      texture: d.textureCube(d.f32),
      visibility: ["fragment"],
    },
  })
  .$idx(0)
  .$name("antikyForwardSceneLayout");

const materialLayout = tgpu
  .bindGroupLayout({
    sampler: { sampler: "filtering", visibility: ["fragment"] },
    baseColor: { texture: d.texture2d(d.f32), visibility: ["fragment"] },
    normal: { texture: d.texture2d(d.f32), visibility: ["fragment"] },
    metallicRoughness: {
      texture: d.texture2d(d.f32),
      visibility: ["fragment"],
    },
    material: { uniform: Material, visibility: ["fragment"] },
  })
  .$idx(1)
  .$name("antikyForwardMaterialLayout");

const shade = tgpu
  .fn(
    [d.vec3f, d.vec3f, d.vec3f, d.vec3f, d.f32, d.f32],
    d.vec3f,
  )((normal, view, light, albedo, metallic, roughness) => {
    "use gpu";
    const halfway = std.normalize(std.add(view, light));
    const nDotL = std.max(std.dot(normal, light), 0);
    const nDotH = std.max(std.dot(normal, halfway), 0);
    const vDotH = std.max(std.dot(view, halfway), 0);
    const reflectance = std.mix(d.vec3f(0.035), albedo, metallic);
    const fresnel = std.add(
      reflectance,
      std.mul(std.sub(d.vec3f(1), reflectance), std.pow(1 - vDotH, 5)),
    );
    const gloss = std.max(2 / std.max(roughness * roughness, 0.002) - 2, 1);
    const specular = std.mul(
      fresnel,
      ((gloss + 2) / (2 * Math.PI)) * std.pow(nDotH, gloss),
    );
    const diffuse = std.mul(
      std.mul(std.sub(d.vec3f(1), fresnel), albedo),
      (1 - metallic) / Math.PI,
    );
    return std.mul(std.add(diffuse, specular), nDotL);
  })
  .$name("antikyPbrShade");

const environmentDirection = tgpu
  .fn([d.vec3f], d.vec3f)((direction) => {
    "use gpu";
    return d.vec3f(-direction.x, direction.y, direction.z);
  })
  .$name("antikyEnvironmentDirection");

const environmentLighting = tgpu
  .fn(
    [d.vec3f, d.vec3f, d.vec3f, d.f32, d.f32],
    d.vec3f,
  )((normal, view, albedo, metallic, roughness) => {
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
      5.76,
    ).rgb;
    const radiance = std.textureSampleLevel(
      sceneLayout.$.environmentMap,
      sceneLayout.$.environmentSampler,
      environmentDirection(reflectedDirection),
      roughness * 8,
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
    const diffuse = std.mul(
      irradiance,
      std.mul(
        std.mul(albedo, 1 - metallic),
        diffuseEnergy,
      ),
    );
    const specular = std.add(
      std.mul(radiance, singleScattering),
      std.mul(irradiance, multiScattering),
    );
    return std.add(diffuse, specular);
  })
  .$name("antikyEnvironmentLighting");

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
    const edgeGuard = SUN_TEXEL_SIZE * 1.5;
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
          SUN_TEXEL_SIZE,
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
  .$name("antikySampleSunCascade");

const forwardVertex = tgpu
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

const forwardFragment = tgpu
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
    const pDx = std.dpdx(input.worldPosition);
    const pDy = std.dpdy(input.worldPosition);
    const uvDx = std.dpdx(input.uv);
    const uvDy = std.dpdy(input.uv);
    const determinant = uvDx.x * uvDy.y - uvDx.y * uvDy.x;
    let tangent = std.normalize(
      std.sub(pDx, std.mul(faceNormal, std.dot(faceNormal, pDx))),
    );
    let bitangent = std.normalize(std.cross(faceNormal, tangent));
    if (std.abs(determinant) > 0.00001) {
      tangent = std.normalize(
        std.div(
          std.sub(std.mul(pDx, uvDy.y), std.mul(pDy, uvDx.y)),
          determinant,
        ),
      );
      bitangent = std.normalize(
        std.div(
          std.add(std.mul(pDx, -uvDy.x), std.mul(pDy, uvDx.x)),
          determinant,
        ),
      );
    }
    const mapNormal = std.sub(
      std.mul(
        std.textureSample(materialLayout.$.normal, materialLayout.$.sampler, input.uv).xyz,
        2,
      ),
      d.vec3f(1),
    );
    const normal = std.normalize(
      std.add(
        std.add(std.mul(tangent, mapNormal.x), std.mul(bitangent, mapNormal.y)),
        std.mul(faceNormal, mapNormal.z),
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
      0.04,
      1,
    );
    const view = std.normalize(
      std.sub(sceneLayout.$.frame.cameraPosition.xyz, input.worldPosition),
    );
    const sunDirection = d.vec3f(
      ANTIKY_SUN.direction[0],
      ANTIKY_SUN.direction[1],
      ANTIKY_SUN.direction[2],
    );
    const sunColor = d.vec3f(
      ANTIKY_SUN.color[0],
      ANTIKY_SUN.color[1],
      ANTIKY_SUN.color[2],
    );
    let color = std.mul(
      shade(normal, view, sunDirection, base.rgb, metallic, roughness),
      std.mul(sunColor, ANTIKY_SUN.intensity),
    );
    let pointLighting = d.vec3f(0);

    for (let index = 0; index < MAX_LIGHTS; index += 1) {
      if (index >= d.i32(sceneLayout.$.frame.settings.x)) break;
      const light = sceneLayout.$.lights[index];
      const toLight = std.sub(light.positionRadius.xyz, input.worldPosition);
      const distanceSquared = std.dot(toLight, toLight);
      const distance = std.sqrt(std.max(distanceSquared, 0.000001));
      if (distance < light.positionRadius.w) {
        const direction = std.div(toLight, std.max(distance, 0.001));
        const distanceRatio = distance / light.positionRadius.w;
        const distanceRatioSquared = distanceRatio * distanceRatio;
        const cutoff = std.clamp(
          1 - distanceRatioSquared * distanceRatioSquared,
          0,
          1,
        );
        const attenuation =
          (1 / std.max(distanceSquared, 0.01)) * cutoff * cutoff;
        pointLighting = std.add(
          pointLighting,
          std.mul(
            shade(normal, view, direction, base.rgb, metallic, roughness),
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
      std.mul(normal, ANTIKY_SUN.shadow.normalBias),
    );
    const nearVisibility = sampleSunCascade(
      sceneLayout.$.nearShadow,
      sceneLayout.$.frame.nearShadowViewProjection,
      receiverPosition,
      ANTIKY_SUN.shadow.biases[0],
    );
    const farVisibility = sampleSunCascade(
      sceneLayout.$.farShadow,
      sceneLayout.$.frame.farShadowViewProjection,
      receiverPosition,
      ANTIKY_SUN.shadow.biases[1],
    );
    const viewDepth = std.dot(
      std.sub(input.worldPosition, sceneLayout.$.frame.cameraPosition.xyz),
      d.vec3f(
        SUN_PLAN.cameraForward[0],
        SUN_PLAN.cameraForward[1],
        SUN_PLAN.cameraForward[2],
      ),
    );
    let shadow = std.mix(
      nearVisibility,
      farVisibility,
      std.smoothstep(
        SUN_PLAN.fadeStartDistance,
        SUN_PLAN.fadeEndDistance,
        viewDepth,
      ),
    );
    if (viewDepth <= SUN_PLAN.fadeStartDistance) shadow = nearVisibility;
    if (viewDepth >= SUN_PLAN.fadeEndDistance) shadow = farVisibility;
    const environment = environmentLighting(
      normal,
      view,
      base.rgb,
      metallic,
      roughness,
    );
    color = std.add(
      std.add(std.mul(color, shadow), pointLighting),
      environment,
    );
    return {
      color: d.vec4f(color, base.a),
      surface: d.vec4f(std.add(std.mul(normal, 0.5), 0.5), roughness),
      worldMetal: d.vec4f(input.worldPosition, metallic),
    };
  })
  .$name("forwardFragment");

export default defineShader({
  vertex: forwardVertex,
  fragment: forwardFragment,
  entryPoints: { vertex: "forwardVertex", fragment: "forwardFragment" },
  bindGroups: [
    {
      group: 0,
      entries: [
        { name: "frame", binding: 0, visibility: ["vertex", "fragment"], buffer: { type: "uniform", minBindingSize: 288 } },
        { name: "lights", binding: 1, visibility: ["fragment"], buffer: { type: "read-only-storage", minBindingSize: 2048 } },
        { name: "nearShadow", binding: 2, visibility: ["fragment"], texture: { sampleType: "depth", viewDimension: "2d" } },
        { name: "farShadow", binding: 3, visibility: ["fragment"], texture: { sampleType: "depth", viewDimension: "2d" } },
        { name: "shadowSampler", binding: 4, visibility: ["fragment"], sampler: { type: "comparison" } },
        { name: "environmentSampler", binding: 5, visibility: ["fragment"], sampler: { type: "filtering" } },
        { name: "environmentMap", binding: 6, visibility: ["fragment"], texture: { sampleType: "float", viewDimension: "cube" } },
      ],
    },
    {
      group: 1,
      entries: [
        { name: "sampler", binding: 0, visibility: ["fragment"], sampler: { type: "filtering" } },
        { name: "baseColor", binding: 1, visibility: ["fragment"], texture: { sampleType: "float", viewDimension: "2d" } },
        { name: "normal", binding: 2, visibility: ["fragment"], texture: { sampleType: "float", viewDimension: "2d" } },
        { name: "metallicRoughness", binding: 3, visibility: ["fragment"], texture: { sampleType: "float", viewDimension: "2d" } },
        { name: "material", binding: 4, visibility: ["fragment"], buffer: { type: "uniform", minBindingSize: 32 } },
      ],
    },
  ],
  pipeline: {
    vertexBuffers: [
      { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
      { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }] },
      { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: "float32x2" }] },
    ],
    primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
    targets: [
      { format: "rgba16float" },
      { format: "rgba16float" },
      { format: "rgba16float" },
    ],
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
  },
});
