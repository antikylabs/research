import tgpu, { d, std } from "typegpu";

import { defineShader } from "typegpu-antiky/shader";

export const ANTIKY_TEMPORAL_CURRENT_WEIGHT = 0.05;

const temporalLayout = tgpu
  .bindGroupLayout({
    currentHdr: {
      texture: d.texture2d(d.f32),
      sampleType: "unfilterable-float",
      visibility: ["fragment"],
    },
    ambient: { texture: d.texture2d(d.f32), visibility: ["fragment"] },
    history: {
      texture: d.texture2d(d.f32),
      sampleType: "unfilterable-float",
      visibility: ["fragment"],
    },
    settings: { uniform: d.vec4f, visibility: ["fragment"] },
  })
  .$idx(0)
  .$name("antikyTemporalLayout");

const temporalVertex = tgpu
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
  .$name("temporalVertex");

const sampleCurrent = tgpu
  .fn([d.vec2i], d.vec3f)((pixel) => {
    "use gpu";
    const color = std.textureLoad(temporalLayout.$.currentHdr, pixel, 0).rgb;
    const ambient = std.textureLoad(temporalLayout.$.ambient, pixel, 0).r;
    return std.mul(color, ambient);
  })
  .$name("antikyTemporalCurrent");

const clipAabb = tgpu
  .fn([d.vec3f, d.vec3f, d.vec3f], d.vec3f)(
    (historyColor, minimumColor, maximumColor) => {
      "use gpu";
      const center = std.mul(std.add(maximumColor, minimumColor), 0.5);
      const extent = std.add(
        std.mul(std.sub(maximumColor, minimumColor), 0.5),
        d.vec3f(0.0000001),
      );
      const delta = std.sub(historyColor, center);
      const unit = std.abs(std.div(delta, extent));
      const maximumUnit = std.max(std.max(unit.x, unit.y), unit.z);
      return std.select(
        historyColor,
        std.add(center, std.div(delta, maximumUnit)),
        maximumUnit > 1,
      );
    },
  )
  .$name("antikyTemporalClipAabb");

const temporalFragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f, position: d.builtin.position },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const size = d.vec2i(temporalLayout.$.settings.xy);
    const maximumPixel = std.sub(size, d.vec2i(1));
    const pixel = std.clamp(
      d.vec2i(std.floor(input.position.xy)),
      d.vec2i(0),
      maximumPixel,
    );

    let firstMoment = d.vec3f(0);
    let secondMoment = d.vec3f(0);
    for (let y = -1; y <= 1; y += 1) {
      for (let x = -1; x <= 1; x += 1) {
        const samplePixel = std.clamp(
          std.add(pixel, d.vec2i(x, y)),
          d.vec2i(0),
          maximumPixel,
        );
        const neighbor = std.max(sampleCurrent(samplePixel), d.vec3f(0));
        firstMoment = std.add(firstMoment, neighbor);
        secondMoment = std.add(secondMoment, std.mul(neighbor, neighbor));
      }
    }

    const hasValidHistory = temporalLayout.$.settings.z > 0;

    const currentColor = sampleCurrent(pixel);
    const mean = std.div(firstMoment, 9);
    const deviation = std.sqrt(
      std.max(
        std.sub(std.div(secondMoment, 9), std.mul(mean, mean)),
        d.vec3f(0),
      ),
    );
    const minimumColor = std.sub(mean, deviation);
    const maximumColor = std.add(mean, deviation);
    const historyColor = std.textureLoad(
      temporalLayout.$.history,
      pixel,
      0,
    ).rgb;
    const clippedHistory = clipAabb(
      historyColor,
      minimumColor,
      maximumColor,
    );

    let currentWeight = std.select(
      d.f32(1),
      d.f32(ANTIKY_TEMPORAL_CURRENT_WEIGHT),
      hasValidHistory,
    );
    let historyWeight = 1 - currentWeight;
    const luma = d.vec3f(0.2126, 0.7152, 0.0722);
    const compressedCurrent = std.div(
      currentColor,
      std.max(std.max(currentColor.r, currentColor.g), currentColor.b) + 1,
    );
    const compressedHistory = std.div(
      clippedHistory,
      std.max(
        std.max(clippedHistory.r, clippedHistory.g),
        clippedHistory.b,
      ) + 1,
    );
    currentWeight *= 1 / (std.dot(compressedCurrent, luma) + 1);
    historyWeight *= 1 / (std.dot(compressedHistory, luma) + 1);
    const resolved = std.div(
      std.add(
        std.mul(currentColor, currentWeight),
        std.mul(clippedHistory, historyWeight),
      ),
      std.max(currentWeight + historyWeight, 0.00001),
    );
    return d.vec4f(std.max(resolved, d.vec3f(0)), 1);
  })
  .$name("temporalFragment");

export default defineShader({
  vertex: temporalVertex,
  fragment: temporalFragment,
  entryPoints: { vertex: "temporalVertex", fragment: "temporalFragment" },
  bindGroups: [
    {
      group: 0,
      entries: [
        {
          name: "currentHdr",
          binding: 0,
          visibility: ["fragment"],
          texture: { sampleType: "unfilterable-float", viewDimension: "2d" },
        },
        {
          name: "ambient",
          binding: 1,
          visibility: ["fragment"],
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          name: "history",
          binding: 2,
          visibility: ["fragment"],
          texture: { sampleType: "unfilterable-float", viewDimension: "2d" },
        },
        {
          name: "settings",
          binding: 3,
          visibility: ["fragment"],
          buffer: { type: "uniform", minBindingSize: 16 },
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
