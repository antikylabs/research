import {
  abs,
  clamp,
  cos,
  dot,
  floor,
  length,
  max,
  mix,
  normalize,
  pow,
  sin,
  smoothstep,
  step,
  texture,
  vec2,
  vec3,
  vec4,
  shader,
} from 'brometal';
import {
  fresnel,
  hemisphereLight,
  specGGX,
  toonShade,
} from 'brometal/shader-functions';

/** One shared quad, instanced once per exposed voxel face with HDR shadowed lighting. */
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
    iWater: 'float',
    iAo: 'vec4',
  },
  uniforms: {
    uViewProjection: 'mat4',
    uLightViewProjection: 'mat4',
    uViewPosition: 'vec3',
    uViewForward: 'vec3',
    uSunDirection: 'vec3',
    uSunColor: 'vec3',
    uSunIntensity: 'float',
    uMoonDirection: 'vec3',
    uMoonColor: 'vec3',
    uMoonIntensity: 'float',
    uSkyColor: 'vec3',
    uGroundColor: 'vec3',
    uFogColor: 'vec3',
    uFogNear: 'float',
    uFogFar: 'float',
    uShadowMap: 'sampler2D',
    uShadowTexel: 'vec2',
    uShadowPass: 'float',
    uStylized: 'float',
    uMaterialVariation: 'float',
    uTime: 'float',
    uTransparentPass: 'float',
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
    vWater: 'float',
    vAo: 'float',
    vLightClip: 'vec4',
  },

  vertex(
    { aPosition, aCorner, iPosition, iFace, iColorRoughness, iMaterialPalette, iWater, iAo },
    { uViewProjection, uLightViewProjection, uShadowPass },
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
    const lightClip = uLightViewProjection.mul(vec4(world, 1));
    v.vWorld = world;
    v.vNormal = normal;
    v.vColor = iColorRoughness.xyz;
    v.vRoughness = iColorRoughness.w;
    v.vMetallic = iMaterialPalette.x;
    v.vEmission = iMaterialPalette.y;
    v.vGlass = iMaterialPalette.z;
    v.vPalette = iMaterialPalette.w;
    v.vWater = iWater;
    v.vAo = ao;
    v.vLightClip = lightClip;
    return mix(uViewProjection.mul(vec4(world, 1)), lightClip, step(0.5, uShadowPass));
  },

  fragment(
    {
      uViewPosition,
      uViewForward,
      uSunDirection,
      uSunColor,
      uSunIntensity,
      uMoonDirection,
      uMoonColor,
      uMoonIntensity,
      uSkyColor,
      uGroundColor,
      uFogColor,
      uFogNear,
      uFogFar,
      uShadowMap,
      uShadowTexel,
      uShadowPass,
      uStylized,
      uMaterialVariation,
      uTime,
      uTransparentPass,
    },
    {
      vWorld,
      vNormal,
      vColor,
      vRoughness,
      vMetallic,
      vEmission,
      vGlass,
      vPalette,
      vWater,
      vAo,
      vLightClip,
    },
  ) {
    const rawNormal = normalize(vNormal);
    const waterTop = clamp(vWater, 0, 1) * step(0.7, rawNormal.y);
    const waterNormal = normalize(vec3(
      sin(vWorld.x * 0.43 + uTime * 1.37) * 0.12,
      1,
      cos(vWorld.z * 0.37 - uTime * 1.11) * 0.12,
    ));
    const normal = normalize(mix(rawNormal, waterNormal, waterTop));
    const lightDirection = normalize(uSunDirection);
    const viewDirection = normalize(uViewPosition.sub(vWorld));
    const ao = 0.3 + clamp(vAo, 0, 1) * 0.7;
    const roughness = clamp(vRoughness, 0.08, 1);
    const metallic = clamp(vMetallic, 0, 1);
    const glass = clamp(vGlass, 0, 1);
    const water = clamp(vWater, 0, 1);
    const waterOpticalDepth = clamp(1 / max(dot(normal, viewDirection), 0.15), 1, 6);
    const waterAttenuation = pow(0.84, waterOpticalDepth);
    const breakup = sin(dot(vWorld, vec3(0.67, 1.31, 0.47)) + vPalette * 113 + uTime * 0.025);
    const varied = vColor.scale(1 + breakup * uMaterialVariation * 0.12);
    const glassBase = mix(varied, vec3(0.08, 0.38, 0.48), glass * 0.4);
    const base = mix(
      glassBase,
      vec3(0.025, 0.22, 0.34),
      water * (0.36 + waterOpticalDepth * 0.052),
    ).scale(mix(1, waterAttenuation, water * 0.38));
    const ambient = hemisphereLight(normal, uSkyColor, uGroundColor);
    const diffuse = max(dot(normal, lightDirection), 0);

    const lightNdc = vLightClip.xyz.scale(1 / max(vLightClip.w, 0.0001));
    const shadowUv = vec2(lightNdc.x * 0.5 + 0.5, 0.5 - lightNdc.y * 0.5);
    const compareDepth = lightNdc.z - (0.0007 + (1 - diffuse) * 0.0024);
    let shadow = step(compareDepth, texture(uShadowMap, shadowUv).x);
    shadow = shadow + step(compareDepth, texture(uShadowMap, shadowUv.add(vec2(uShadowTexel.x, 0))).x);
    shadow = shadow + step(compareDepth, texture(uShadowMap, shadowUv.sub(vec2(uShadowTexel.x, 0))).x);
    shadow = shadow + step(compareDepth, texture(uShadowMap, shadowUv.add(vec2(0, uShadowTexel.y))).x);
    shadow = shadow + step(compareDepth, texture(uShadowMap, shadowUv.sub(vec2(0, uShadowTexel.y))).x);
    shadow = shadow / 5;
    if (shadowUv.x < 0 || shadowUv.x > 1 || shadowUv.y < 0 || shadowUv.y > 1) shadow = 1;

    const f0 = mix(vec3(0.04), base, metallic);
    const physicalDiffuse = base
      .mul(ambient.scale(0.58).add(uSunColor.scale(
        uSunIntensity * diffuse * mix(0.14, 1, shadow),
      )))
      .scale((1 - metallic) * ao);
    const physicalSpecular = f0
      .mul(uSunColor)
      .scale(uSunIntensity * specGGX(normal, lightDirection, viewDirection, roughness)
        * shadow * (0.4 + 0.6 * ao));
    const moonDirection = normalize(uMoonDirection);
    const moonDiffuse = max(dot(normal, moonDirection), 0);
    const moon = base.mul(uMoonColor).scale(
      uMoonIntensity * moonDiffuse * mix(0.18, 1, shadow) * (1 - metallic * 0.5),
    ).add(f0.mul(uMoonColor).scale(
      uMoonIntensity * specGGX(normal, moonDirection, viewDirection, roughness) * shadow,
    ));
    const physicalReflection = f0.mul(ambient).scale(0.14 + metallic * 0.3 + glass * 0.42);
    let physical = physicalDiffuse.add(physicalSpecular).add(physicalReflection).add(moon);

    const banded = toonShade(normal, lightDirection, 4);
    const upward = max(normal.y, 0);
    const downward = max(-normal.y, 0);
    const sideShape = 0.82 + upward * 0.18 - downward * 0.16 + abs(normal.x) * 0.035;
    const rim = fresnel(normal, viewDirection, 3);
    const graphicLight = (0.5 + banded * 1.2) * (0.55 + ao * 0.45)
      * sideShape * mix(0.5, 1, shadow);
    const materialFamily = floor(vPalette * 12) / 12;
    const roughnessBand = floor(roughness * 3 + 0.5) / 3;
    let graphic = base.scale(
      graphicLight * (0.9 + materialFamily * 0.22) * (1 - roughnessBand * 0.12),
    );
    graphic = graphic.add(mix(
      vec3(0.08, 0.44, 0.78),
      vec3(0.8, 0.18, 0.42),
      materialFamily,
    ).scale(rim * (0.18 + vPalette * 0.1)));
    graphic = graphic.add(vec3(0.95, 0.2, 0.38).scale(step(0.72, diffuse) * 0.09));
    graphic = graphic.add(vec3(1, 0.42, 0.08).scale(metallic * (0.08 + rim * 0.5)));
    graphic = graphic.add(vec3(0.12, 0.7, 0.82).scale(glass * (0.18 + rim * 0.5)));
    graphic = graphic.add(vec3(0.02, 0.32, 0.46).scale(water * (0.18 + waterTop * 0.12)));

    const emissionPulse = 0.96 + sin(uTime * 1.2 + vPalette * 31) * 0.04;
    const emissive = base.scale(max(vEmission, 0) * emissionPulse * 2.15);
    physical = physical.add(emissive);
    graphic = graphic.add(emissive.scale(1.18));

    let color = mix(physical, graphic, step(0.5, uStylized));
    const distanceToCamera = length(uViewPosition.sub(vWorld));
    const fog = smoothstep(uFogNear, uFogFar, distanceToCamera);
    color = mix(color, uFogColor, fog * mix(0.52, 0.66, uStylized));
    const focalDepth = max(dot(vWorld.sub(uViewPosition), uViewForward), 0.001);
    const mainOutput = vec4(color, focalDepth);
    const fresnelOpacity = pow(1 - max(dot(normal, viewDirection), 0), 4);
    const glassOpacity = clamp(0.07 + fresnelOpacity * 0.68, 0.07, 0.82);
    const waterOpacity = clamp(
      0.22 + waterOpticalDepth * 0.055 + fresnelOpacity * 0.48 + waterTop * 0.05,
      0.24,
      0.92,
    );
    const transparentOutput = vec4(color, mix(
      glassOpacity,
      waterOpacity,
      water,
    ));
    const surfaceOutput = mix(mainOutput, transparentOutput, step(0.5, uTransparentPass));
    const lightDepth = clamp(vLightClip.z / max(vLightClip.w, 0.0001), 0, 1);
    return mix(surfaceOutput, vec4(lightDepth, lightDepth, lightDepth, 1), step(0.5, uShadowPass));
  },
});
