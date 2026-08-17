import {
  abs,
  clamp,
  dot,
  floor,
  max,
  mix,
  normalize,
  pow,
  shader,
  sin,
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
import { hash21, tonemapACES } from 'brometal/shader-functions';

function displayChannel(channel: number): number {
  const safe = max(channel, 0);
  return mix(safe * 12.92, pow(safe, 0.4166666667) * 1.055 - 0.055, step(0.0031308, safe));
}

function encodeSrgb(color: Vec3): Vec3 {
  return vec3(displayChannel(color.x), displayChannel(color.y), displayChannel(color.z));
}

function cloudDensity(direction: Vec3): number {
  const broad = sin(dot(direction, vec3(12.7, 3.1, 8.9)) * 2.15);
  const crossing = sin(dot(direction, vec3(-7.3, 5.7, 15.1)) * 3.4);
  const wisps = sin(dot(direction, vec3(23.9, -4.1, 17.7)) * 4.8);
  const structure = broad * 0.55 + crossing * 0.3 + wisps * 0.15;
  return smoothstep(0.2, 0.78, structure) * smoothstep(-0.08, 0.34, direction.y);
}

function starField(direction: Vec3, daylight: number): number {
  const cell = vec2(
    floor(direction.x * 311 + direction.y * 137),
    floor(direction.z * 311 - direction.y * 89),
  );
  const seed = hash21(cell);
  const visibleSky = smoothstep(-0.05, 0.42, direction.y);
  return step(0.994, seed) * visibleSky * clamp(1 - daylight * 2.5, 0, 1);
}

function backdrop(
  direction: Vec3,
  stylized: number,
  skyColor: Vec3,
  fogColor: Vec3,
  sunDirection: Vec3,
  sunColor: Vec3,
  sunIntensity: number,
  moonDirection: Vec3,
  moonColor: Vec3,
  moonIntensity: number,
): Vec3 {
  const daylight = clamp(sunIntensity / 5.2, 0, 1);
  const elevation = clamp(direction.y * 1.7 + 0.16, 0, 1);
  const physicalTop = skyColor.scale(0.5);
  const physicalHorizon = mix(fogColor.scale(0.7), skyColor.scale(0.42), daylight * 0.35);
  const graphicTop = mix(skyColor, vec3(0.018, 0.055, 0.09), 0.42);
  const graphicHorizon = mix(fogColor, vec3(0.25, 0.075, 0.16), 0.38);
  const physical = mix(physicalHorizon, physicalTop, pow(elevation, 0.62));
  const graphic = mix(graphicHorizon, graphicTop, smoothstep(0.02, 0.88, elevation));
  const sunAlignment = max(dot(direction, sunDirection), 0);
  const moonAlignment = max(dot(direction, moonDirection), 0);
  const sun = pow(sunAlignment, mix(900, 520, stylized));
  const halo = pow(sunAlignment, mix(18, 28, stylized));
  const moon = pow(moonAlignment, mix(1250, 720, stylized));
  const moonHalo = pow(moonAlignment, 42);
  const clouds = cloudDensity(direction);
  const cloudShade = mix(fogColor.scale(0.82), vec3(0.9, 0.94, 1), 0.38 + daylight * 0.48);
  const cloudLight = pow(sunAlignment, 7) * daylight;
  const cloudOpacity = clouds * mix(0.26, 0.38, stylized) * (0.28 + daylight * 0.72);
  const stars = starField(direction, daylight);
  const base = mix(physical, graphic, stylized);
  return mix(base, cloudShade.add(sunColor.scale(cloudLight * 0.2)), cloudOpacity)
    .add(vec3(0.72, 0.82, 1).scale(stars * mix(0.8, 1.35, stylized)))
    .add(sunColor.scale((sun * 2.6 + halo * 0.075) * sunIntensity))
    .add(moonColor.scale((moon * 2 + moonHalo * 0.055) * moonIntensity));
}

function composited(sample: Vec4, background: Vec3): Vec3 {
  return mix(background, sample.xyz, step(0.001, sample.w));
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
    uDofEnabled: 'float',
    uExposure: 'float',
    uStylized: 'float',
    uFinalColorGrade: 'float',
    uSkyColor: 'vec3',
    uFogColor: 'vec3',
    uSunDirection: 'vec3',
    uSunColor: 'vec3',
    uSunIntensity: 'float',
    uMoonDirection: 'vec3',
    uMoonColor: 'vec3',
    uMoonIntensity: 'float',
    uCameraForward: 'vec3',
    uCameraRight: 'vec3',
    uCameraUp: 'vec3',
    uTanHalfFov: 'float',
  },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition }, _uniforms, varyings) {
    const clip = vec4(aPosition.x, aPosition.y, 0, 1);
    varyings.vUv = targetUv(clip);
    return clip;
  },

  fragment(
    {
      uScene,
      uResolution,
      uFocusDistance,
      uFocusRange,
      uAperture,
      uDofEnabled,
      uExposure,
      uStylized,
      uFinalColorGrade,
      uSkyColor,
      uFogColor,
      uSunDirection,
      uSunColor,
      uSunIntensity,
      uMoonDirection,
      uMoonColor,
      uMoonIntensity,
      uCameraForward,
      uCameraRight,
      uCameraUp,
      uTanHalfFov,
    },
    { vUv },
  ) {
    const centerSample = texture(uScene, vUv);
    // Opaque surfaces store axial depth in alpha. Alpha-only transmissive pixels over the sky store
    // opacity instead; hold those at the focus plane so opacity is never misread as a near depth
    // and expanded into a bright DoF halo. Water over opaque geometry retains a weighted far depth.
    const hasOpaqueDepth = step(1, centerSample.w);
    const hasTransparentSky = step(0.001, centerSample.w) * (1 - hasOpaqueDepth);
    const fallbackDepth = mix(
      uFocusDistance + uFocusRange * 5,
      uFocusDistance,
      hasTransparentSky,
    );
    const centerDepth = mix(fallbackDepth, centerSample.w, hasOpaqueDepth);
    const focusError = abs(centerDepth - uFocusDistance);
    const circle = smoothstep(uFocusRange, uFocusRange * 4, focusError)
      * uAperture * clamp(uDofEnabled, 0, 1);
    const radius = clamp(circle * 5.5, 0.25, 5.5);
    const pixel = vec2(radius / uResolution.x, radius / uResolution.y);

    const screen = vec2(
      (vUv.x * 2 - 1) * (uResolution.x / uResolution.y),
      1 - vUv.y * 2,
    );
    const viewDirection = normalize(
      uCameraForward
        .add(uCameraRight.scale(screen.x * uTanHalfFov))
        .add(uCameraUp.scale(screen.y * uTanHalfFov)),
    );
    const background = backdrop(
      viewDirection,
      uStylized,
      uSkyColor,
      uFogColor,
      uSunDirection,
      uSunColor,
      uSunIntensity,
      uMoonDirection,
      uMoonColor,
      uMoonIntensity,
    );
    let color = composited(centerSample, background).scale(0.18);
    const offset1 = pixel.mul(vec2(0.9239, 0.3827));
    const offset2 = pixel.mul(vec2(0.3827, 0.9239));
    const offset3 = pixel.mul(vec2(-0.3827, 0.9239));
    const offset4 = pixel.mul(vec2(-0.9239, 0.3827));
    const offset5 = pixel.mul(vec2(-0.9239, -0.3827));
    const offset6 = pixel.mul(vec2(-0.3827, -0.9239));
    const offset7 = pixel.mul(vec2(0.3827, -0.9239));
    const offset8 = pixel.mul(vec2(0.9239, -0.3827));
    color = color.add(composited(texture(uScene, vUv.add(offset1)), background).scale(0.1025));
    color = color.add(composited(texture(uScene, vUv.add(offset2)), background).scale(0.1025));
    color = color.add(composited(texture(uScene, vUv.add(offset3)), background).scale(0.1025));
    color = color.add(composited(texture(uScene, vUv.add(offset4)), background).scale(0.1025));
    color = color.add(composited(texture(uScene, vUv.add(offset5)), background).scale(0.1025));
    color = color.add(composited(texture(uScene, vUv.add(offset6)), background).scale(0.1025));
    color = color.add(composited(texture(uScene, vUv.add(offset7)), background).scale(0.1025));
    color = color.add(composited(texture(uScene, vUv.add(offset8)), background).scale(0.1025));

    const bloomPixel = vec2(5 / uResolution.x, 5 / uResolution.y);
    let bloom = bright(composited(texture(uScene, vUv.add(vec2(bloomPixel.x, 0))), background));
    bloom = bloom.add(bright(composited(texture(uScene, vUv.sub(vec2(bloomPixel.x, 0))), background)));
    bloom = bloom.add(bright(composited(texture(uScene, vUv.add(vec2(0, bloomPixel.y))), background)));
    bloom = bloom.add(bright(composited(texture(uScene, vUv.sub(vec2(0, bloomPixel.y))), background)));
    color = color.add(bloom.scale(mix(0.065, 0.09, uStylized)));

    const posterized = mix(color, vec3(
      floor(color.x * 7 + 0.5) / 7,
      floor(color.y * 7 + 0.5) / 7,
      floor(color.z * 7 + 0.5) / 7,
    ), uStylized * 0.24 * clamp(uFinalColorGrade, 0, 1));
    const luminance = dot(posterized, vec3(0.2126, 0.7152, 0.0722));
    const saturated = mix(vec3(luminance, luminance, luminance), posterized, 1.12);
    const highlight = smoothstep(0.28, 1.35, luminance);
    const splitToned = saturated.mul(mix(
      vec3(0.93, 0.98, 1.06),
      vec3(1.08, 1.015, 0.92),
      highlight,
    ));
    const contrasted = vec3(
      max((splitToned.x - 0.06) * 1.1 + 0.06, 0),
      max((splitToned.y - 0.06) * 1.1 + 0.06, 0),
      max((splitToned.z - 0.06) * 1.1 + 0.06, 0),
    );
    const graded = mix(posterized, contrasted, clamp(uFinalColorGrade, 0, 1));
    const centered = vUv.sub(vec2(0.5, 0.5));
    const vignette = smoothstep(0.86, 0.28, dot(centered, centered));
    const exposed = graded.scale(uExposure * mix(0.9 + vignette * 0.1, 1, uStylized));
    return vec4(encodeSrgb(tonemapACES(exposed)), 1);
  },
});
