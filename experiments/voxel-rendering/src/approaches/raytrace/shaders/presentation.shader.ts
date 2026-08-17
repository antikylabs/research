import { clamp, floor, max, mix, shader, targetUv, texture, vec3, vec4 } from 'brometal';
import { adjustSaturation, gammaCorrect, tonemapACES } from 'brometal/shader-functions';

/** Presentation-only grading. Changing these uniforms must not invalidate accumulated radiance. */
export default shader({
  attributes: { aPosition: 'vec3' },
  uniforms: {
    uAccumulation: 'sampler2D',
    uExposure: 'float',
    uGraphic: 'float',
  },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition }, _uniforms, varyings) {
    const clip = vec4(aPosition.x, aPosition.y, 0, 1);
    varyings.vUv = targetUv(clip);
    return clip;
  },

  fragment({ uAccumulation, uExposure, uGraphic }, { vUv }) {
    const hdr = texture(uAccumulation, vUv).xyz.scale(uExposure);
    const physical = gammaCorrect(tonemapACES(hdr), 2.2);
    const saturated = adjustSaturation(physical, 1.24);
    const bands = vec3(
      floor(saturated.x * 7 + 0.5) / 7,
      floor(saturated.y * 7 + 0.5) / 7,
      floor(saturated.z * 7 + 0.5) / 7,
    );
    const graphic = clamp(bands.scale(1.08).add(vec3(0.012, 0.006, 0.02)), 0, 1);
    return vec4(mix(physical, graphic, max(0, uGraphic)), 1);
  },
});
