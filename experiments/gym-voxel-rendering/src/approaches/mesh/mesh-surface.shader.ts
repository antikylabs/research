import {
  clamp,
  cos,
  dot,
  exp,
  floor,
  length,
  max,
  mix,
  normalize,
  pow,
  shader,
  sin,
  step,
  texture,
  vec2,
  vec3,
  vec4,
  type Vec3,
} from 'brometal';

function fresnelSchlick(cosTheta: number, f0: Vec3): Vec3 {
  const grazing = pow(1 - clamp(cosTheta, 0, 1), 5);
  return f0.add(vec3(1, 1, 1).sub(f0).scale(grazing));
}

function distributionGgx(normal: Vec3, halfway: Vec3, roughness: number): number {
  const alpha = roughness * roughness;
  const alphaSquared = alpha * alpha;
  const ndoth = max(dot(normal, halfway), 0);
  const denominator = ndoth * ndoth * (alphaSquared - 1) + 1;
  return alphaSquared / max(3.14159265 * denominator * denominator, 0.0001);
}

function geometrySchlickGgx(ndot: number, roughness: number): number {
  const directRoughness = roughness + 1;
  const k = directRoughness * directRoughness / 8;
  return ndot / max(ndot * (1 - k) + k, 0.0001);
}

function geometrySmith(normal: Vec3, view: Vec3, light: Vec3, roughness: number): number {
  const ndotv = max(dot(normal, view), 0);
  const ndotl = max(dot(normal, light), 0);
  return geometrySchlickGgx(ndotv, roughness) * geometrySchlickGgx(ndotl, roughness);
}

/** Linear-HDR greedy surface pass with a light-space depth mode and soft shadow lookup. */
export default shader({
  attributes: {
    aPosition: 'vec3',
    aNormal: 'vec3',
    aColor: 'vec3',
    aMaterial: 'vec4',
    aEmissive: 'float',
    aWater: 'float',
    aAo: 'float',
  },
  uniforms: {
    uViewProjection: 'mat4',
    uLightViewProjection: 'mat4',
    uCameraPosition: 'vec3',
    uCameraForward: 'vec3',
    uSunDirection: 'vec3',
    uSunColor: 'vec3',
    uSunIntensity: 'float',
    uMoonDirection: 'vec3',
    uMoonColor: 'vec3',
    uMoonIntensity: 'float',
    uSkyColor: 'vec3',
    uGroundColor: 'vec3',
    uAmbientIntensity: 'float',
    uFogColor: 'vec3',
    uFogDensity: 'float',
    uShadowMap: 'sampler2D',
    uShadowTexel: 'vec2',
    uShadowPass: 'float',
    /** Zero is photorealistic; one adds the deliberately stylized presentation. */
    uStylized: 'float',
    uMaterialVariation: 'float',
    uTime: 'float',
    uTransparentPass: 'float',
  },
  varyings: {
    vWorld: 'vec3',
    vNormal: 'vec3',
    vColor: 'vec3',
    vMaterial: 'vec4',
    vEmissive: 'float',
    vWater: 'float',
    vAo: 'float',
    vLightClip: 'vec4',
  },

  vertex(
    { aPosition, aNormal, aColor, aMaterial, aEmissive, aWater, aAo },
    { uViewProjection, uLightViewProjection, uShadowPass },
    varying,
  ) {
    varying.vWorld = aPosition;
    varying.vNormal = aNormal;
    varying.vColor = aColor;
    varying.vMaterial = aMaterial;
    varying.vEmissive = aEmissive;
    varying.vWater = aWater;
    varying.vAo = aAo;
    const world = vec4(aPosition, 1);
    const lightClip = uLightViewProjection.mul(world);
    varying.vLightClip = lightClip;
    return mix(uViewProjection.mul(world), lightClip, step(0.5, uShadowPass));
  },

  fragment(
    {
      uCameraPosition,
      uCameraForward,
      uSunDirection,
      uSunColor,
      uSunIntensity,
      uMoonDirection,
      uMoonColor,
      uMoonIntensity,
      uSkyColor,
      uGroundColor,
      uAmbientIntensity,
      uFogColor,
      uFogDensity,
      uShadowMap,
      uShadowTexel,
      uShadowPass,
      uStylized,
      uMaterialVariation,
      uTime,
      uTransparentPass,
    },
    { vWorld, vNormal, vColor, vMaterial, vEmissive, vWater, vAo, vLightClip },
  ) {
    const rawNormal = normalize(vNormal);
    const waterTop = clamp(vWater, 0, 1) * step(0.7, rawNormal.y);
    const waterNormal = normalize(vec3(
      sin(vWorld.x * 0.43 + uTime * 1.37) * 0.12,
      1,
      cos(vWorld.z * 0.37 - uTime * 1.11) * 0.12,
    ));
    const normal = normalize(mix(rawNormal, waterNormal, waterTop));
    const view = normalize(uCameraPosition.sub(vWorld));
    const light = normalize(uSunDirection);
    const halfway = normalize(view.add(light));
    const ndotl = max(dot(normal, light), 0);
    const ndotv = max(dot(normal, view), 0);
    const roughness = clamp(vMaterial.x, 0.08, 1);
    const metallic = clamp(vMaterial.y, 0, 1);
    const glass = clamp(vMaterial.z, 0, 1);
    const water = clamp(vWater, 0, 1);
    const waterOpticalDepth = clamp(1 / max(ndotv, 0.15), 1, 6);
    const waterAttenuation = pow(0.84, waterOpticalDepth);
    const palette = clamp(vMaterial.w, 0, 1);
    const breakup = sin(dot(vWorld, vec3(0.71, 1.17, 0.43)) + palette * 91 + uTime * 0.025);
    const variedColor = vColor.scale(1 + breakup * uMaterialVariation * 0.12);
    const waterColor = mix(
      variedColor,
      vec3(0.025, 0.22, 0.34),
      water * (0.34 + waterOpticalDepth * 0.055),
    ).scale(mix(1, waterAttenuation, water * 0.38));
    const baseColor = waterColor;

    const dielectricF0 = vec3(0.04, 0.04, 0.04);
    const f0 = mix(dielectricF0, baseColor, metallic);
    const fresnel = fresnelSchlick(max(dot(halfway, view), 0), f0);
    const distribution = distributionGgx(normal, halfway, roughness);
    const geometry = geometrySmith(normal, view, light, roughness);
    const specular = fresnel.scale(
      distribution * geometry / max(4 * ndotv * ndotl, 0.0001),
    );
    const diffuseWeight = vec3(1, 1, 1).sub(fresnel).scale(1 - metallic);
    const diffuse = diffuseWeight.mul(baseColor).scale(1 / 3.14159265);

    const lightNdc = vLightClip.xyz.scale(1 / max(vLightClip.w, 0.0001));
    const shadowUv = vec2(lightNdc.x * 0.5 + 0.5, 0.5 - lightNdc.y * 0.5);
    const compareDepth = lightNdc.z - (0.0007 + (1 - ndotl) * 0.0024);
    let shadow = step(compareDepth, texture(uShadowMap, shadowUv).x);
    shadow = shadow + step(compareDepth, texture(uShadowMap, shadowUv.add(vec2(uShadowTexel.x, 0))).x);
    shadow = shadow + step(compareDepth, texture(uShadowMap, shadowUv.sub(vec2(uShadowTexel.x, 0))).x);
    shadow = shadow + step(compareDepth, texture(uShadowMap, shadowUv.add(vec2(0, uShadowTexel.y))).x);
    shadow = shadow + step(compareDepth, texture(uShadowMap, shadowUv.sub(vec2(0, uShadowTexel.y))).x);
    shadow = shadow / 5;
    if (shadowUv.x < 0 || shadowUv.x > 1 || shadowUv.y < 0 || shadowUv.y > 1) shadow = 1;

    const sunRadiance = uSunColor.scale(uSunIntensity);
    const direct = diffuse.add(specular)
      .mul(sunRadiance)
      .scale(ndotl * mix(0.14, 1, shadow));
    const moonLight = normalize(uMoonDirection);
    const moonNdotl = max(dot(normal, moonLight), 0);
    const moonHalfway = normalize(view.add(moonLight));
    const moonFresnel = fresnelSchlick(max(dot(moonHalfway, view), 0), f0);
    const moonSpecular = moonFresnel.scale(
      distributionGgx(normal, moonHalfway, roughness)
      * geometrySmith(normal, view, moonLight, roughness)
      / max(4 * ndotv * moonNdotl, 0.0001),
    );
    const moonDirect = diffuse.add(moonSpecular)
      .mul(uMoonColor.scale(uMoonIntensity))
      .scale(moonNdotl * mix(0.18, 1, shadow));
    const hemisphere = mix(uGroundColor, uSkyColor, normal.y * 0.5 + 0.5);
    const localVisibility = mix(0.22, 1, clamp(vAo, 0, 1));
    const ambientDiffuse = baseColor
      .mul(hemisphere)
      .scale((1 - metallic) * uAmbientIntensity);
    const ambientSpecular = f0
      .mul(uSkyColor)
      .scale(uAmbientIntensity * (1 - roughness) * 0.38);
    const emitted = baseColor.scale(max(vEmissive, 0));
    const transmission = uSkyColor.mul(baseColor)
      .scale(glass * (0.18 + pow(1 - ndotv, 3) * 0.42));
    const physical = direct.add(moonDirect)
      .add(ambientDiffuse.add(ambientSpecular).scale(localVisibility))
      .add(emitted)
      .add(transmission);

    const band = floor(ndotl * 4 + 0.999) / 4;
    const rim = pow(1 - ndotv, 3);
    const graphicVisibility = mix(0.55, 1, clamp(vAo, 0, 1));
    const materialBand = floor(palette * 7) / 7;
    const roughnessBand = floor(roughness * 3 + 0.5) / 3;
    const graphic = baseColor
      .scale((0.5 + band * 1.2) * mix(0.5, 1, shadow) * graphicVisibility
        * (1 - roughnessBand * 0.12))
      .add(mix(vec3(0.16, 0.045, 0.18), vec3(0.06, 0.3, 0.48), materialBand).scale(0.24))
      .add(vec3(0.08, 0.44, 0.78).scale(rim * 0.42))
      .add(vec3(1, 0.42, 0.08).scale(metallic * (0.08 + rim * 0.5)))
      .add(vec3(0.1, 0.64, 0.78).scale(glass * (0.2 + rim * 0.55)))
      .add(vec3(0.02, 0.32, 0.46).scale(water * (0.18 + waterTop * 0.12)))
      .add(emitted.scale(1.35));
    const lit = mix(physical, graphic, clamp(uStylized, 0, 1));

    const distanceToCamera = length(uCameraPosition.sub(vWorld));
    const fog = 1 - exp(-uFogDensity * distanceToCamera);
    const atmospheric = mix(lit, uFogColor, clamp(fog, 0, 0.88));
    const focalDepth = max(dot(vWorld.sub(uCameraPosition), uCameraForward), 0.001);
    const mainOutput = vec4(atmospheric, focalDepth);
    const fresnelOpacity = pow(1 - ndotv, 4);
    const glassOpacity = clamp(0.07 + fresnelOpacity * 0.68, 0.07, 0.82);
    const waterOpacity = clamp(
      0.22 + waterOpticalDepth * 0.055 + fresnelOpacity * 0.48 + waterTop * 0.05,
      0.24,
      0.92,
    );
    const transparentOutput = vec4(
      atmospheric,
      mix(glassOpacity, waterOpacity, water),
    );
    const surfaceOutput = mix(mainOutput, transparentOutput, step(0.5, uTransparentPass));
    const lightDepth = clamp(vLightClip.z / max(vLightClip.w, 0.0001), 0, 1);
    return mix(surfaceOutput, vec4(lightDepth, lightDepth, lightDepth, 1), step(0.5, uShadowPass));
  },
});
