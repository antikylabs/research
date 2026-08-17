import {
  clamp,
  dot,
  exp,
  floor,
  length,
  max,
  mix,
  normalize,
  pow,
  shader,
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
    aMaterial: 'vec2',
    aEmissive: 'float',
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
  },
  varyings: {
    vWorld: 'vec3',
    vNormal: 'vec3',
    vColor: 'vec3',
    vMaterial: 'vec2',
    vEmissive: 'float',
    vAo: 'float',
    vLightClip: 'vec4',
  },

  vertex(
    { aPosition, aNormal, aColor, aMaterial, aEmissive, aAo },
    { uViewProjection, uLightViewProjection, uShadowPass },
    varying,
  ) {
    varying.vWorld = aPosition;
    varying.vNormal = aNormal;
    varying.vColor = aColor;
    varying.vMaterial = aMaterial;
    varying.vEmissive = aEmissive;
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
      uSkyColor,
      uGroundColor,
      uAmbientIntensity,
      uFogColor,
      uFogDensity,
      uShadowMap,
      uShadowTexel,
      uShadowPass,
      uStylized,
    },
    { vWorld, vNormal, vColor, vMaterial, vEmissive, vAo, vLightClip },
  ) {
    const normal = normalize(vNormal);
    const view = normalize(uCameraPosition.sub(vWorld));
    const light = normalize(uSunDirection);
    const halfway = normalize(view.add(light));
    const ndotl = max(dot(normal, light), 0);
    const ndotv = max(dot(normal, view), 0);
    const roughness = clamp(vMaterial.x, 0.08, 1);
    const metallic = clamp(vMaterial.y, 0, 1);

    const dielectricF0 = vec3(0.04, 0.04, 0.04);
    const f0 = mix(dielectricF0, vColor, metallic);
    const fresnel = fresnelSchlick(max(dot(halfway, view), 0), f0);
    const distribution = distributionGgx(normal, halfway, roughness);
    const geometry = geometrySmith(normal, view, light, roughness);
    const specular = fresnel.scale(
      distribution * geometry / max(4 * ndotv * ndotl, 0.0001),
    );
    const diffuseWeight = vec3(1, 1, 1).sub(fresnel).scale(1 - metallic);
    const diffuse = diffuseWeight.mul(vColor).scale(1 / 3.14159265);

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
    const hemisphere = mix(uGroundColor, uSkyColor, normal.y * 0.5 + 0.5);
    const localVisibility = mix(0.22, 1, clamp(vAo, 0, 1));
    const ambientDiffuse = vColor
      .mul(hemisphere)
      .scale((1 - metallic) * uAmbientIntensity);
    const ambientSpecular = f0
      .mul(uSkyColor)
      .scale(uAmbientIntensity * (1 - roughness) * 0.38);
    const emitted = vColor.scale(max(vEmissive, 0));
    const physical = direct
      .add(ambientDiffuse.add(ambientSpecular).scale(localVisibility))
      .add(emitted);

    const band = floor(ndotl * 4 + 0.999) / 4;
    const rim = pow(1 - ndotv, 3);
    const graphicVisibility = mix(0.55, 1, clamp(vAo, 0, 1));
    const graphic = vColor
      .scale((0.5 + band * 1.2) * mix(0.5, 1, shadow) * graphicVisibility)
      .add(mix(vec3(0.16, 0.045, 0.18), vec3(0.06, 0.3, 0.48), normal.y * 0.5 + 0.5).scale(0.2))
      .add(vec3(0.08, 0.44, 0.78).scale(rim * 0.42))
      .add(emitted.scale(1.35));
    const lit = mix(physical, graphic, clamp(uStylized, 0, 1));

    const distanceToCamera = length(uCameraPosition.sub(vWorld));
    const fog = 1 - exp(-uFogDensity * distanceToCamera);
    const atmospheric = mix(lit, uFogColor, clamp(fog, 0, 0.88));
    const focalDepth = max(dot(vWorld.sub(uCameraPosition), uCameraForward), 0.001);
    const mainOutput = vec4(atmospheric, focalDepth);
    const lightDepth = clamp(vLightClip.z / max(vLightClip.w, 0.0001), 0, 1);
    return mix(mainOutput, vec4(lightDepth, lightDepth, lightDepth, 1), step(0.5, uShadowPass));
  },
});
