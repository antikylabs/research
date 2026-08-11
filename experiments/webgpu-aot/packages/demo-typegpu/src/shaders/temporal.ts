import tgpu, { d, std } from "typegpu";

export const TYPEGPU_TEMPORAL_CURRENT_WEIGHT = 0.05;

export const temporalLayout = tgpu
  .bindGroupLayout({
    currentHdr: {
      texture: d.texture2d(d.f32),
      sampleType: "unfilterable-float",
      visibility: ["fragment"],
    },
    currentAmbient: { texture: d.texture2d(d.f32), visibility: ["fragment"] },
    history: {
      texture: d.texture2d(d.f32),
      sampleType: "unfilterable-float",
      visibility: ["fragment"],
    },
    settings: { uniform: d.vec4f, visibility: ["fragment"] },
  })
  .$idx(0)
  .$name("typeGpuTemporalLayout");

const sampleCurrent = tgpu
  .fn([d.vec2i], d.vec3f)((pixel) => {
    "use gpu";
    const color = std.textureLoad(temporalLayout.$.currentHdr, pixel, 0).rgb;
    const ambient = std.textureLoad(
      temporalLayout.$.currentAmbient,
      pixel,
      0,
    ).r;
    return std.mul(color, ambient);
  })
  .$name("typeGpuTemporalCurrent");

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
  .$name("typeGpuTemporalClipAabb");

export const temporalFragment = tgpu
  .fragmentFn({
    in: { position: d.builtin.position },
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
    const currentColor = sampleCurrent(pixel);
    const mean = std.div(firstMoment, 9);
    const deviation = std.sqrt(
      std.max(
        std.sub(std.div(secondMoment, 9), std.mul(mean, mean)),
        d.vec3f(0),
      ),
    );
    const historyColor = std.textureLoad(
      temporalLayout.$.history,
      pixel,
      0,
    ).rgb;
    const clippedHistory = clipAabb(
      historyColor,
      std.sub(mean, deviation),
      std.add(mean, deviation),
    );
    const hasValidHistory = temporalLayout.$.settings.z > 0;
    let currentWeight = std.select(
      d.f32(1),
      d.f32(TYPEGPU_TEMPORAL_CURRENT_WEIGHT),
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
