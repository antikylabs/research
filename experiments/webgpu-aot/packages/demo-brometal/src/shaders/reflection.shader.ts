import { compileShader, type ShaderDefinition } from "../compiler.js";
import { BROMETAL_REFLECTION_MARCH } from "../reflections.js";

const reflectionDefinition = {
  declarations: [
    `struct Frame {
  viewProjection: mat4x4f,
  model: mat4x4f,
  cameraPosition: vec4f,
  params: vec4f,
}`,
    `struct ScreenOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}`,
  ],
  bindings: [
    { group: 0, binding: 0, declaration: "var hdrTexture: texture_2d<f32>" },
    {
      group: 0,
      binding: 1,
      declaration: "var normalRoughnessTexture: texture_2d<f32>",
    },
    {
      group: 0,
      binding: 2,
      declaration: "var worldMetalTexture: texture_2d<f32>",
    },
    { group: 0, binding: 3, declaration: "var depthTexture: texture_depth_2d" },
    { group: 0, binding: 4, declaration: "var<uniform> frame: Frame" },
    { group: 0, binding: 5, declaration: "var linearSampler: sampler" },
  ],
  functions: [
    {
      attributes: ["@vertex"],
      signature: "reflectionVertex(@builtin(vertex_index) index: u32) -> ScreenOut",
      body: `
  var output: ScreenOut;
  let x = f32(i32(index & 1u) * 4 - 1);
  let y = f32(i32(index >> 1u) * 4 - 1);
  output.position = vec4f(x, y, 0.0, 1.0);
  output.uv = vec2f(x + 1.0, 1.0 - y) * 0.5;
  return output;`,
    },
    {
      signature: "projectReflectionPoint(position: vec3f) -> vec3f",
      body: `
  let clip = frame.viewProjection * vec4f(position, 1.0);
  let ndc = clip.xyz / max(clip.w, 0.0001);
  return vec3f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5, clip.w);`,
    },
    {
      signature:
        "broMetalReflectionHitTransfer(hitColor: vec3f, metallic: f32, planeDistance: f32, incident: vec3f, reflected: vec3f) -> vec3f",
      body: `
  let distanceRatio = 1.0 - planeDistance / 100.0;
  let attenuation = distanceRatio * distanceRatio;
  let grazing = (dot(incident, reflected) + 1.0) / 2.0;
  let weightedColor = hitColor * metallic * attenuation * grazing;
  let luminance = dot(weightedColor, vec3f(0.2126, 0.7152, 0.0722));
  let luminanceScale = min(10.0 / max(luminance, 0.0001), 1.0);
  return weightedColor * luminanceScale * 0.7;`,
    },
    {
      attributes: ["@fragment"],
      signature: "reflectionFragment(input: ScreenOut) -> @location(0) vec4f",
      body: `
  let pixel = vec2i(floor(input.position.xy));
  if (textureLoad(depthTexture, pixel, 0) >= 0.99999) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  let normalRoughness = textureLoad(normalRoughnessTexture, pixel, 0);
  let worldMetal = textureLoad(worldMetalTexture, pixel, 0);
  let normal = normalize(normalRoughness.xyz * 2.0 - vec3f(1.0));
  let position = worldMetal.xyz;
  let view = normalize(frame.cameraPosition.xyz - position);
  let reflected = normalize(reflect(-view, normal));
  if (dot(reflected, normal) <= 0.001) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  let size = vec2i(textureDimensions(worldMetalTexture));
  let maximum = size - vec2i(1);
  var hitColor = vec3f(0.0);
  var planeDistance = 0.0;
  var travel = ${BROMETAL_REFLECTION_MARCH.initialTravel};
  for (var step = 0; step < ${BROMETAL_REFLECTION_MARCH.stepCount}; step += 1) {
    travel += ${BROMETAL_REFLECTION_MARCH.stepBase} +
      f32(step) * ${BROMETAL_REFLECTION_MARCH.stepGrowth};
    let samplePosition = position + normal * 0.045 + reflected * travel;
    let projected = projectReflectionPoint(samplePosition);
    let uv = projected.xy;
    if (
      projected.z <= 0.0 ||
      uv.x <= 0.002 || uv.x >= 0.998 ||
      uv.y <= 0.002 || uv.y >= 0.998
    ) {
      break;
    }

    let samplePixel = clamp(vec2i(uv * vec2f(size)), vec2i(0), maximum);
    if (textureLoad(depthTexture, samplePixel, 0) >= 0.99999) {
      continue;
    }
    let scenePosition = textureLoad(worldMetalTexture, samplePixel, 0).xyz;
    let rayDepth = distance(frame.cameraPosition.xyz, samplePosition);
    let sceneDepth = distance(frame.cameraPosition.xyz, scenePosition);
    let crossing = rayDepth - sceneDepth;
    if (
      crossing >= 0.0 &&
      crossing <= ${BROMETAL_REFLECTION_MARCH.thicknessBase} +
        travel * ${BROMETAL_REFLECTION_MARCH.thicknessGrowth} &&
      distance(scenePosition, position) > 0.2
    ) {
      hitColor = textureSampleLevel(
        hdrTexture,
        linearSampler,
        uv,
        0.0,
      ).rgb;
      planeDistance = dot(scenePosition - position, normal);
      break;
    }
  }

  let reflection = broMetalReflectionHitTransfer(
    hitColor,
    worldMetal.w,
    planeDistance,
    -view,
    reflected,
  );
  return vec4f(reflection, 1.0);`,
    },
  ],
} satisfies ShaderDefinition;

export function buildReflectionShader(): string {
  return compileShader(reflectionDefinition);
}
