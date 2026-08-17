import {
  abs,
  clamp,
  dot,
  length,
  max,
  mix,
  normalize,
  sin,
  smoothstep,
  step,
  vec3,
  vec4,
  shader,
} from 'brometal';
import {
  fresnel,
  gammaCorrect,
  hemisphereLight,
  specGGX,
  tonemapACES,
  toonShade,
} from 'brometal/shader-functions';

/**
 * One shared quad, instanced once per exposed voxel face.
 *
 * Face codes must stay aligned with surface.ts:
 *   0 +Z, 1 -Z, 2 +Y, 3 -Y, 4 +X, 5 -X.
 * Glass remains intentionally opaque in this experiment; iMaterialPalette.z only applies a tint.
 */
export default shader({
  attributes: {
    aPosition: 'vec3',
    aCorner: 'float',
  },
  instanceAttributes: {
    iPosition: 'vec3',
    iFace: 'float',
    iColorRoughness: 'vec4',
    iMaterialPalette: 'vec4',
    iAo: 'vec4',
  },
  uniforms: {
    uViewProjection: 'mat4',
    uViewPosition: 'vec3',
    uSunDirection: 'vec3',
    uSunColor: 'vec3',
    uSkyColor: 'vec3',
    uGroundColor: 'vec3',
    uFogColor: 'vec3',
    uFogNear: 'float',
    uFogFar: 'float',
    uStyle: 'float',
    uTime: 'float',
  },
  varyings: {
    vWorld: 'vec3',
    vNormal: 'vec3',
    vColor: 'vec3',
    vRoughness: 'float',
    vMetallic: 'float',
    vEmission: 'float',
    vGlass: 'float',
    vPalette: 'float',
    vAo: 'float',
  },

  vertex(
    { aPosition, aCorner, iPosition, iFace, iColorRoughness, iMaterialPalette, iAo },
    { uViewProjection },
    v,
  ) {
    let local = vec3(aPosition.x, aPosition.y, 0.5);
    let normal = vec3(0, 0, 1);
    if (iFace > 0.5 && iFace < 1.5) {
      local = vec3(-aPosition.x, aPosition.y, -0.5);
      normal = vec3(0, 0, -1);
    } else if (iFace > 1.5 && iFace < 2.5) {
      local = vec3(aPosition.x, 0.5, -aPosition.y);
      normal = vec3(0, 1, 0);
    } else if (iFace > 2.5 && iFace < 3.5) {
      local = vec3(aPosition.x, -0.5, aPosition.y);
      normal = vec3(0, -1, 0);
    } else if (iFace > 3.5 && iFace < 4.5) {
      local = vec3(0.5, aPosition.y, -aPosition.x);
      normal = vec3(1, 0, 0);
    } else if (iFace > 4.5) {
      local = vec3(-0.5, aPosition.y, aPosition.x);
      normal = vec3(-1, 0, 0);
    }

    let ao = iAo.x;
    if (aCorner > 0.5 && aCorner < 1.5) {
      ao = iAo.y;
    } else if (aCorner > 1.5 && aCorner < 2.5) {
      ao = iAo.z;
    } else if (aCorner > 2.5) {
      ao = iAo.w;
    }

    const world = iPosition.add(local);
    v.vWorld = world;
    v.vNormal = normal;
    v.vColor = iColorRoughness.xyz;
    v.vRoughness = iColorRoughness.w;
    v.vMetallic = iMaterialPalette.x;
    v.vEmission = iMaterialPalette.y;
    v.vGlass = iMaterialPalette.z;
    v.vPalette = iMaterialPalette.w;
    v.vAo = ao;
    return uViewProjection.mul(vec4(world, 1));
  },

  fragment(
    {
      uViewPosition,
      uSunDirection,
      uSunColor,
      uSkyColor,
      uGroundColor,
      uFogColor,
      uFogNear,
      uFogFar,
      uStyle,
      uTime,
    },
    { vWorld, vNormal, vColor, vRoughness, vMetallic, vEmission, vGlass, vPalette, vAo },
  ) {
    const normal = normalize(vNormal);
    const lightDirection = normalize(uSunDirection);
    const viewDirection = normalize(uViewPosition.sub(vWorld));
    const ao = 0.36 + clamp(vAo, 0, 1) * 0.64;
    const roughness = clamp(vRoughness, 0.08, 1);
    const metallic = clamp(vMetallic, 0, 1);
    const glass = clamp(vGlass, 0, 1);
    const base = mix(vColor, vec3(0.19, 0.52, 0.72), glass * 0.34);
    const ambient = hemisphereLight(normal, uSkyColor, uGroundColor);
    const diffuse = max(dot(normal, lightDirection), 0);

    // Physical alternative: energy-aware metal/dielectric split with a GGX highlight.
    const f0 = mix(vec3(0.04), base, metallic);
    const physicalDiffuse = base
      .mul(ambient.scale(0.62).add(uSunColor.scale(diffuse)))
      .scale((1 - metallic) * ao);
    const physicalSpecular = f0
      .mul(uSunColor)
      .scale(specGGX(normal, lightDirection, viewDirection, roughness) * (0.45 + 0.55 * ao));
    const physicalReflection = f0.mul(ambient).scale(0.13 + metallic * 0.22);
    let physical = physicalDiffuse.add(physicalSpecular).add(physicalReflection);

    // Graphic alternative: stable bands, directional face shaping and a cool rim.
    const banded = toonShade(normal, lightDirection, 4);
    const upward = max(normal.y, 0);
    const downward = max(-normal.y, 0);
    const sideShape = 0.82 + upward * 0.18 - downward * 0.16 + abs(normal.x) * 0.035;
    const rim = fresnel(normal, viewDirection, 3);
    const graphicLight = (0.34 + banded * 0.82) * ao * sideShape;
    let graphic = base.scale(graphicLight);
    graphic = graphic.add(vec3(0.12, 0.42, 0.76).scale(rim * (0.12 + vPalette * 0.08)));
    graphic = graphic.add(uSunColor.scale(step(0.72, diffuse) * 0.08));

    // Emissive palette entries stay legible in both styles and breathe subtly without moving geometry.
    const emissionPulse = 0.94 + sin(uTime * 1.8 + vPalette * 31) * 0.06;
    const emissive = base.scale(max(vEmission, 0) * emissionPulse * 2.1);
    physical = physical.add(emissive);
    graphic = graphic.add(emissive.scale(1.2));

    const graphicWeight = step(0.5, uStyle);
    let color = mix(physical, graphic, graphicWeight);
    const distanceToCamera = length(uViewPosition.sub(vWorld));
    const fog = smoothstep(uFogNear, uFogFar, distanceToCamera);
    color = mix(color, uFogColor, fog * (0.58 + graphicWeight * 0.18));
    return vec4(gammaCorrect(tonemapACES(color), 2.2), 1);
  },
});
