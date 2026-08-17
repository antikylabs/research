import {
  abs,
  clamp,
  distance,
  dot,
  floor,
  max,
  mix,
  pow,
  shader,
  smoothstep,
  step,
  targetUv,
  texture,
  vec2,
  vec3,
  vec4,
  type Vec2,
  type Vec3,
  type Vec4,
} from 'brometal';
import { tonemapACES } from 'brometal/shader-functions';

function displayChannel(channel: number): number {
  const safe = max(channel, 0);
  return mix(safe * 12.92, pow(safe, 0.4166666667) * 1.055 - 0.055, step(0.0031308, safe));
}

function encodeSrgb(color: Vec3): Vec3 {
  return vec3(displayChannel(color.x), displayChannel(color.y), displayChannel(color.z));
}

function backdrop(uv: Vec2, stylized: number): Vec3 {
  const physicalTop = vec3(0.012, 0.024, 0.052);
  const physicalHorizon = vec3(0.24, 0.07, 0.028);
  const graphicTop = vec3(0.018, 0.055, 0.09);
  const graphicHorizon = vec3(0.25, 0.075, 0.16);
  const horizon = smoothstep(0.02, 0.92, uv.y);
  const physical = mix(physicalTop, physicalHorizon, horizon);
  const graphic = mix(graphicTop, graphicHorizon, horizon);
  const sunDistance = distance(uv, vec2(0.18, 0.27));
  const sunRadius = mix(0.12, 0.08, stylized);
  const haloRadius = mix(0.32, 0.2, stylized);
  const sun = pow(clamp(1 - sunDistance / sunRadius, 0, 1), 7);
  const halo = pow(clamp(1 - sunDistance / haloRadius, 0, 1), 3);
  return mix(physical, graphic, stylized)
    .add(mix(vec3(0.8, 0.25, 0.06), vec3(1.2, 0.22, 0.55), stylized).scale(sun))
    .add(mix(vec3(0.16, 0.035, 0.01), vec3(0.07, 0.025, 0.12), stylized).scale(halo));
}

function composited(sample: Vec4, uv: Vec2, stylized: number): Vec3 {
  return mix(backdrop(uv, stylized), sample.xyz, step(0.001, sample.w));
}

function bright(color: Vec3): Vec3 {
  const luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return color.scale(smoothstep(0.72, 2.4, luminance));
}

/** HDR presentation shared by both raster approaches: DoF, bloom, grade and backdrop. */
export default shader({
  attributes: { aPosition: 'vec3' },
  uniforms: {
    uScene: 'sampler2D',
    uResolution: 'vec2',
    uFocusDistance: 'float',
    uFocusRange: 'float',
    uAperture: 'float',
    uExposure: 'float',
    uStylized: 'float',
  },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition }, _uniforms, varyings) {
    const clip = vec4(aPosition.x, aPosition.y, 0, 1);
    varyings.vUv = targetUv(clip);
    return clip;
  },

  fragment(
    { uScene, uResolution, uFocusDistance, uFocusRange, uAperture, uExposure, uStylized },
    { vUv },
  ) {
    const centerSample = texture(uScene, vUv);
    const centerDepth = mix(uFocusDistance + uFocusRange * 5, centerSample.w, step(0.001, centerSample.w));
    const focusError = abs(centerDepth - uFocusDistance);
    const circle = smoothstep(uFocusRange, uFocusRange * 4, focusError) * uAperture;
    const radius = clamp(circle * 5.5, 0.25, 5.5);
    const pixel = vec2(radius / uResolution.x, radius / uResolution.y);

    let color = composited(centerSample, vUv, uStylized).scale(0.18);
    const offset1 = pixel.mul(vec2(0.9239, 0.3827));
    const offset2 = pixel.mul(vec2(0.3827, 0.9239));
    const offset3 = pixel.mul(vec2(-0.3827, 0.9239));
    const offset4 = pixel.mul(vec2(-0.9239, 0.3827));
    const offset5 = pixel.mul(vec2(-0.9239, -0.3827));
    const offset6 = pixel.mul(vec2(-0.3827, -0.9239));
    const offset7 = pixel.mul(vec2(0.3827, -0.9239));
    const offset8 = pixel.mul(vec2(0.9239, -0.3827));
    color = color.add(composited(texture(uScene, vUv.add(offset1)), vUv.add(offset1), uStylized).scale(0.1025));
    color = color.add(composited(texture(uScene, vUv.add(offset2)), vUv.add(offset2), uStylized).scale(0.1025));
    color = color.add(composited(texture(uScene, vUv.add(offset3)), vUv.add(offset3), uStylized).scale(0.1025));
    color = color.add(composited(texture(uScene, vUv.add(offset4)), vUv.add(offset4), uStylized).scale(0.1025));
    color = color.add(composited(texture(uScene, vUv.add(offset5)), vUv.add(offset5), uStylized).scale(0.1025));
    color = color.add(composited(texture(uScene, vUv.add(offset6)), vUv.add(offset6), uStylized).scale(0.1025));
    color = color.add(composited(texture(uScene, vUv.add(offset7)), vUv.add(offset7), uStylized).scale(0.1025));
    color = color.add(composited(texture(uScene, vUv.add(offset8)), vUv.add(offset8), uStylized).scale(0.1025));

    const bloomPixel = vec2(5 / uResolution.x, 5 / uResolution.y);
    let bloom = bright(composited(texture(uScene, vUv.add(vec2(bloomPixel.x, 0))), vUv, uStylized));
    bloom = bloom.add(bright(composited(texture(uScene, vUv.sub(vec2(bloomPixel.x, 0))), vUv, uStylized)));
    bloom = bloom.add(bright(composited(texture(uScene, vUv.add(vec2(0, bloomPixel.y))), vUv, uStylized)));
    bloom = bloom.add(bright(composited(texture(uScene, vUv.sub(vec2(0, bloomPixel.y))), vUv, uStylized)));
    color = color.add(bloom.scale(mix(0.065, 0.09, uStylized)));

    const graded = mix(color, vec3(
      floor(color.x * 7 + 0.5) / 7,
      floor(color.y * 7 + 0.5) / 7,
      floor(color.z * 7 + 0.5) / 7,
    ), uStylized * 0.24);
    const centered = vUv.sub(vec2(0.5, 0.5));
    const vignette = smoothstep(0.86, 0.28, dot(centered, centered));
    const exposed = graded.scale(uExposure * mix(0.9 + vignette * 0.1, 1, uStylized));
    return vec4(encodeSrgb(tonemapACES(exposed)), 1);
  },
});
