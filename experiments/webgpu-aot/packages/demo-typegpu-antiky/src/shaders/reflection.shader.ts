import tgpu, { d, std } from "typegpu";

import { defineShader } from "typegpu-antiky/shader";

import { ANTIKY_REFLECTION_HIT_TRANSFER } from "../reflection.js";

const Frame = d
  .struct({
    viewProjection: d.mat4x4f,
    model: d.mat4x4f,
    nearShadowViewProjection: d.mat4x4f,
    farShadowViewProjection: d.mat4x4f,
    cameraPosition: d.vec4f,
    settings: d.vec4f,
  })
  .$name("AntikyReflectionFrame");

const reflectionLayout = tgpu
  .bindGroupLayout({
    hdr: { texture: d.texture2d(d.f32), visibility: ["fragment"] },
    surface: {
      texture: d.texture2d(d.f32),
      sampleType: "unfilterable-float",
      visibility: ["fragment"],
    },
    worldMetal: {
      texture: d.texture2d(d.f32),
      sampleType: "unfilterable-float",
      visibility: ["fragment"],
    },
    depth: { texture: d.textureDepth2d(), visibility: ["fragment"] },
    frame: { uniform: Frame, visibility: ["fragment"] },
    sampler: { sampler: "filtering", visibility: ["fragment"] },
  })
  .$idx(0)
  .$name("antikyReflectionLayout");

const reflectionVertex = tgpu
  .vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex },
    out: { position: d.builtin.position, uv: d.vec2f },
  })((input) => {
    "use gpu";
    let position = d.vec2f(-1, -1);
    if (input.vertexIndex === 1) position = d.vec2f(3, -1);
    if (input.vertexIndex === 2) position = d.vec2f(-1, 3);
    return {
      position: d.vec4f(position, 0, 1),
      uv: d.vec2f(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5),
    };
  })
  .$name("reflectionVertex");

const projectPoint = tgpu
  .fn([d.vec3f], d.vec3f)((position) => {
    "use gpu";
    const clip = std.mul(
      reflectionLayout.$.frame.viewProjection,
      d.vec4f(position, 1),
    );
    const ndc = std.div(clip.xyz, std.max(clip.w, 0.0001));
    return d.vec3f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5, clip.w);
  })
  .$name("antikyProjectReflectionPoint");

const transferReflectionHit = tgpu
  .fn(
    [d.vec3f, d.f32, d.f32, d.vec3f, d.vec3f],
    d.vec3f,
  )((hitColor, metallic, planeDistance, incident, reflected) => {
    "use gpu";
    const distanceRatio =
      1 - planeDistance / ANTIKY_REFLECTION_HIT_TRANSFER.maxDistance;
    const attenuation = distanceRatio * distanceRatio;
    const grazing = (std.dot(incident, reflected) + 1) / 2;
    const weightedColor = std.mul(
      hitColor,
      metallic * attenuation * grazing,
    );
    const luminance = std.dot(
      weightedColor,
      d.vec3f(
        ANTIKY_REFLECTION_HIT_TRANSFER.luminanceWeights[0],
        ANTIKY_REFLECTION_HIT_TRANSFER.luminanceWeights[1],
        ANTIKY_REFLECTION_HIT_TRANSFER.luminanceWeights[2],
      ),
    );
    const luminanceScale = std.min(
      ANTIKY_REFLECTION_HIT_TRANSFER.maxLuminance /
        std.max(luminance, 0.0001),
      1,
    );
    return std.mul(
      weightedColor,
      luminanceScale * ANTIKY_REFLECTION_HIT_TRANSFER.intensity,
    );
  })
  .$name("antikyReflectionHitTransfer");

const reflectionFragment = tgpu
  .fragmentFn({
    in: { position: d.builtin.position, uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const size = d.vec2i(reflectionLayout.$.frame.settings.yz);
    const maximum = std.sub(size, d.vec2i(1));
    const pixel = std.clamp(
      d.vec2i(std.floor(input.position.xy)),
      d.vec2i(0),
      maximum,
    );
    if (std.textureLoad(reflectionLayout.$.depth, pixel, 0) >= 0.99999) {
      return d.vec4f(0, 0, 0, 1);
    }

    const encodedSurface = std.textureLoad(
      reflectionLayout.$.surface,
      pixel,
      0,
    );
    const worldMetal = std.textureLoad(
      reflectionLayout.$.worldMetal,
      pixel,
      0,
    );
    const normal = std.normalize(
      std.sub(std.mul(encodedSurface.xyz, 2), d.vec3f(1)),
    );
    const worldPosition = worldMetal.xyz;
    const view = std.normalize(
      std.sub(reflectionLayout.$.frame.cameraPosition.xyz, worldPosition),
    );
    const reflected = std.normalize(std.reflect(std.neg(view), normal));
    if (std.dot(reflected, normal) <= 0.001) return d.vec4f(0, 0, 0, 1);

    let hitColor = d.vec3f(0);
    let planeDistance = d.f32(0);
    let travel = d.f32(0.16);
    for (let step = 0; step < 24; step += 1) {
      travel += 0.1 + d.f32(step) * 0.024;
      const samplePosition = std.add(
        std.add(worldPosition, std.mul(normal, 0.045)),
        std.mul(reflected, travel),
      );
      const projected = projectPoint(samplePosition);
      const uv = projected.xy;
      if (
        projected.z <= 0 ||
        uv.x <= 0.002 ||
        uv.x >= 0.998 ||
        uv.y <= 0.002 ||
        uv.y >= 0.998
      ) {
        break;
      }

      const samplePixel = std.clamp(
        d.vec2i(std.mul(uv, d.vec2f(size))),
        d.vec2i(0),
        maximum,
      );
      if (std.textureLoad(reflectionLayout.$.depth, samplePixel, 0) >= 0.99999) {
        continue;
      }
      const scenePosition = std.textureLoad(
        reflectionLayout.$.worldMetal,
        samplePixel,
        0,
      ).xyz;
      const rayDepth = std.distance(
        reflectionLayout.$.frame.cameraPosition.xyz,
        samplePosition,
      );
      const sceneDepth = std.distance(
        reflectionLayout.$.frame.cameraPosition.xyz,
        scenePosition,
      );
      const crossing = rayDepth - sceneDepth;
      if (
        crossing >= 0 &&
        crossing <= 0.11 + travel * 0.028 &&
        std.distance(scenePosition, worldPosition) > 0.2
      ) {
        hitColor = std.textureSampleLevel(
          reflectionLayout.$.hdr,
          reflectionLayout.$.sampler,
          uv,
          0,
        ).rgb;
        planeDistance = std.dot(
          std.sub(scenePosition, worldPosition),
          normal,
        );
        break;
      }
    }

    const reflection = transferReflectionHit(
      hitColor,
      worldMetal.w,
      planeDistance,
      std.neg(view),
      reflected,
    );
    return d.vec4f(reflection, 1);
  })
  .$name("reflectionFragment");

export default defineShader({
  vertex: reflectionVertex,
  fragment: reflectionFragment,
  entryPoints: {
    vertex: "reflectionVertex",
    fragment: "reflectionFragment",
  },
  bindGroups: [
    {
      group: 0,
      entries: [
        {
          name: "hdr",
          binding: 0,
          visibility: ["fragment"],
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          name: "surface",
          binding: 1,
          visibility: ["fragment"],
          texture: { sampleType: "unfilterable-float", viewDimension: "2d" },
        },
        {
          name: "worldMetal",
          binding: 2,
          visibility: ["fragment"],
          texture: { sampleType: "unfilterable-float", viewDimension: "2d" },
        },
        {
          name: "depth",
          binding: 3,
          visibility: ["fragment"],
          texture: { sampleType: "depth", viewDimension: "2d" },
        },
        {
          name: "frame",
          binding: 4,
          visibility: ["fragment"],
          buffer: { type: "uniform", minBindingSize: 288 },
        },
        {
          name: "sampler",
          binding: 5,
          visibility: ["fragment"],
          sampler: { type: "filtering" },
        },
      ],
    },
  ],
  pipeline: {
    vertexBuffers: [],
    primitive: { topology: "triangle-list", cullMode: "none" },
    targets: [{ format: "rgba16float" }],
  },
});
