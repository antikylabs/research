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
  vec3,
  vec4,
  type Vec3,
} from 'brometal';
import { tonemapACES } from 'brometal/shader-functions';

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

function geometrySmith(
  normal: Vec3,
  view: Vec3,
  light: Vec3,
  roughness: number,
): number {
  const ndotv = max(dot(normal, view), 0);
  const ndotl = max(dot(normal, light), 0);
  return geometrySchlickGgx(ndotv, roughness) * geometrySchlickGgx(ndotl, roughness);
}

function channelToDisplay(channel: number): number {
  const safe = max(channel, 0);
  const low = safe * 12.92;
  const high = pow(safe, 0.4166666666666667) * 1.055 - 0.055;
  return mix(low, high, step(0.0031308, safe));
}

function encodeSrgb(color: Vec3): Vec3 {
  return vec3(
    channelToDisplay(color.x),
    channelToDisplay(color.y),
    channelToDisplay(color.z),
  );
}

/**
 * One-pass physical surface control for the greedy mesh.
 *
 * Source colors arrive in linear light. `uSunDirection` points from the
 * surface toward the sun. All lighting and fog remain linear until exposure,
 * ACES, and the final sRGB output transform at the bottom of the fragment.
 */
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
    uCameraPosition: 'vec3',
    uSunDirection: 'vec3',
    uSunColor: 'vec3',
    uSunIntensity: 'float',
    uSkyColor: 'vec3',
    uGroundColor: 'vec3',
    uAmbientIntensity: 'float',
    uFogColor: 'vec3',
    uFogDensity: 'float',
    uExposure: 'float',
    /** Zero is physical; one adds the deliberately graphic presentation. */
    uGraphic: 'float',
  },
  varyings: {
    vWorld: 'vec3',
    vNormal: 'vec3',
    vColor: 'vec3',
    vMaterial: 'vec2',
    vEmissive: 'float',
    vAo: 'float',
  },

  vertex(
    { aPosition, aNormal, aColor, aMaterial, aEmissive, aAo },
    { uViewProjection },
    varying,
  ) {
    varying.vWorld = aPosition;
    varying.vNormal = aNormal;
    varying.vColor = aColor;
    varying.vMaterial = aMaterial;
    varying.vEmissive = aEmissive;
    varying.vAo = aAo;
    return uViewProjection.mul(vec4(aPosition, 1));
  },

  fragment(
    {
      uCameraPosition,
      uSunDirection,
      uSunColor,
      uSunIntensity,
      uSkyColor,
      uGroundColor,
      uAmbientIntensity,
      uFogColor,
      uFogDensity,
      uExposure,
      uGraphic,
    },
    { vWorld, vNormal, vColor, vMaterial, vEmissive, vAo },
  ) {
    const normal = normalize(vNormal);
    const view = normalize(uCameraPosition.sub(vWorld));
    const light = normalize(uSunDirection);
    const halfway = normalize(view.add(light));
    const ndotl = max(dot(normal, light), 0);
    const ndotv = max(dot(normal, view), 0);
    const roughness = clamp(vMaterial.x, 0.08, 1);
    const metallic = clamp(vMaterial.y, 0, 1);

    // Cook-Torrance GGX. Fresnel also removes the reflected energy from the
    // diffuse lobe, and metals carry no diffuse lobe at all.
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
    const sunRadiance = uSunColor.scale(uSunIntensity);
    const direct = diffuse.add(specular).mul(sunRadiance).scale(ndotl);

    // This is an explicit environment approximation, not image-based lighting:
    // diffuse hemisphere irradiance plus a restrained sky-tinted F0 response.
    const hemisphere = mix(
      uGroundColor,
      uSkyColor,
      normal.y * 0.5 + 0.5,
    );
    const localVisibility = mix(0.28, 1, clamp(vAo, 0, 1));
    const ambientDiffuse = vColor
      .mul(hemisphere)
      .scale((1 - metallic) * uAmbientIntensity);
    const ambientSpecular = f0
      .mul(uSkyColor)
      .scale(uAmbientIntensity * (1 - roughness) * 0.32);
    const emitted = vColor.scale(max(vEmissive, 0));
    const physical = direct
      .add(ambientDiffuse.add(ambientSpecular).scale(localVisibility))
      .add(emitted);

    // The geometry representation remains unchanged in Graphic mode. The
    // presentation adds readable bands and a cool rim while retaining the
    // physical path as the style-zero endpoint.
    const band = floor(ndotl * 4 + 0.999) / 4;
    const rim = pow(1 - ndotv, 3);
    const graphic = vColor
      .mul(mix(uGroundColor, uSkyColor, normal.y * 0.5 + 0.5))
      .scale(0.34 + band * 1.15)
      .add(uSkyColor.scale(rim * 0.42))
      .add(emitted.scale(1.25))
      .scale(localVisibility);
    const lit = mix(physical, graphic, clamp(uGraphic, 0, 1));

    const distanceToCamera = length(uCameraPosition.sub(vWorld));
    const fog = 1 - exp(-uFogDensity * distanceToCamera);
    const atmospheric = mix(lit, uFogColor, clamp(fog, 0, 0.94));
    const display = encodeSrgb(tonemapACES(atmospheric.scale(uExposure)));
    return vec4(display, 1);
  },
});
