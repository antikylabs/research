import {
  clamp,
  dot,
  floor,
  max,
  mix,
  shader,
  smoothstep,
  targetUv,
  texture,
  vec2,
  vec3,
  vec4,
} from 'brometal';
import { adjustSaturation, gammaCorrect, tonemapACES } from 'brometal/shader-functions';

/** Presentation-only bloom, vignette and grading over accumulated radiance. */
export default shader({
  attributes: { aPosition: 'vec3' },
  uniforms: {
    uAccumulation: 'sampler2D',
    uResolution: 'vec2',
    uExposure: 'float',
    uGraphic: 'float',
  },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition }, _uniforms, varyings) {
    const clip = vec4(aPosition.x, aPosition.y, 0, 1);
    varyings.vUv = targetUv(clip);
    return clip;
  },

  fragment({ uAccumulation, uResolution, uExposure, uGraphic }, { vUv }) {
    const hdr = texture(uAccumulation, vUv).xyz;
    const pixel = vec2(4 / uResolution.x, 4 / uResolution.y);
    let glow = texture(uAccumulation, vUv.add(vec2(pixel.x, 0))).xyz;
    glow = glow.add(texture(uAccumulation, vUv.sub(vec2(pixel.x, 0))).xyz);
    glow = glow.add(texture(uAccumulation, vUv.add(vec2(0, pixel.y))).xyz);
    glow = glow.add(texture(uAccumulation, vUv.sub(vec2(0, pixel.y))).xyz);
    const glowLuminance = dot(glow, vec3(0.2126, 0.7152, 0.0722)) * 0.25;
    const bloomed = hdr.add(glow.scale(smoothstep(1.1, 5, glowLuminance) * 0.055));
    const center = vUv.sub(vec2(0.5, 0.5));
    const vignette = smoothstep(0.82, 0.24, dot(center, center));
    const physical = gammaCorrect(tonemapACES(bloomed.scale(uExposure * (0.9 + vignette * 0.1))), 2.2);
    const saturated = adjustSaturation(physical, 1.18);
    const bands = vec3(
      floor(saturated.x * 11 + 0.5) / 11,
      floor(saturated.y * 11 + 0.5) / 11,
      floor(saturated.z * 11 + 0.5) / 11,
    );
    const bandLuminance = dot(bands, vec3(0.2126, 0.7152, 0.0722));
    const graphic = clamp(
      bands.scale(1.02)
        .add(vec3(0.015, 0.11, 0.2).scale((1 - bandLuminance) * 0.24))
        .add(vec3(0.12, 0.035, 0.055).scale(bandLuminance * 0.16))
        .add(vec3(0.005, 0.018, 0.035).scale(1 - vignette)),
      0,
      1,
    );
    return vec4(mix(physical, graphic, max(0, uGraphic)), 1);
  },
});
