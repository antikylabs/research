import {
  abs,
  clamp,
  cos,
  cross,
  dot,
  floor,
  max,
  min,
  mix,
  normalize,
  pow,
  reflect,
  shader,
  sin,
  smoothstep,
  sqrt,
  step,
  storageRead,
  targetUv,
  texture,
  vec2,
  vec3,
  vec4,
  type Vec2,
  type Vec3,
} from 'brometal';
import { hash21 } from 'brometal/shader-functions';

function safeComponent(value: number): number {
  const fallback = mix(-0.000001, 0.000001, step(0, value));
  return mix(fallback, value, step(0.000001, abs(value)));
}

function volumeInterval(origin: Vec3, direction: Vec3, low: Vec3, high: Vec3): Vec2 {
  const safe = vec3(
    safeComponent(direction.x),
    safeComponent(direction.y),
    safeComponent(direction.z),
  );
  const a = low.sub(origin).div(safe);
  const b = high.sub(origin).div(safe);
  const near = vec3(min(a.x, b.x), min(a.y, b.y), min(a.z, b.z));
  const far = vec3(max(a.x, b.x), max(a.y, b.y), max(a.z, b.z));
  return vec2(max(max(near.x, near.y), near.z), min(min(far.x, far.y), far.z));
}

function boundaryNormal(point: Vec3, low: Vec3, high: Vec3): Vec3 {
  let normal = vec3(0, 0, 0);
  let chosen = 0;
  if (abs(point.x - low.x) < 0.004) {
    normal = vec3(-1, 0, 0);
    chosen = 1;
  }
  if (chosen < 0.5 && abs(point.x - high.x) < 0.004) {
    normal = vec3(1, 0, 0);
    chosen = 1;
  }
  if (chosen < 0.5 && abs(point.y - low.y) < 0.004) {
    normal = vec3(0, -1, 0);
    chosen = 1;
  }
  if (chosen < 0.5 && abs(point.y - high.y) < 0.004) {
    normal = vec3(0, 1, 0);
    chosen = 1;
  }
  if (chosen < 0.5 && abs(point.z - low.z) < 0.004) {
    normal = vec3(0, 0, -1);
    chosen = 1;
  }
  if (chosen < 0.5 && abs(point.z - high.z) < 0.004) {
    normal = vec3(0, 0, 1);
  }
  return normal;
}

function surfaceNormal(normal: Vec3, direction: Vec3): Vec3 {
  let fallback = vec3(mix(1, -1, step(0, direction.x)), 0, 0);
  let largest = abs(direction.x);
  if (abs(direction.y) > largest) {
    fallback = vec3(0, mix(1, -1, step(0, direction.y)), 0);
    largest = abs(direction.y);
  }
  if (abs(direction.z) > largest) {
    fallback = vec3(0, 0, mix(1, -1, step(0, direction.z)));
  }
  const valid = step(0.5, abs(normal.x) + abs(normal.y) + abs(normal.z));
  return mix(fallback, normal, valid);
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

function skyRadiance(
  direction: Vec3,
  skyColor: Vec3,
  fogColor: Vec3,
  sunDirection: Vec3,
  sunColor: Vec3,
  sunIntensity: number,
  moonDirection: Vec3,
  moonColor: Vec3,
  moonIntensity: number,
  stylized: number,
): Vec3 {
  const daylight = clamp(sunIntensity / 5.2, 0, 1);
  const elevation = clamp(direction.y * 1.7 + 0.16, 0, 1);
  const physical = mix(
    mix(fogColor.scale(0.7), skyColor.scale(0.42), daylight * 0.35),
    skyColor.scale(0.5),
    pow(elevation, 0.62),
  );
  const graphic = mix(
    mix(fogColor, vec3(0.25, 0.075, 0.16), 0.38),
    mix(skyColor, vec3(0.018, 0.055, 0.09), 0.42),
    smoothstep(0.02, 0.88, elevation),
  );
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
  return mix(mix(physical, graphic, stylized), cloudShade.add(
    sunColor.scale(cloudLight * 0.2),
  ), cloudOpacity)
    .add(vec3(0.72, 0.82, 1).scale(stars * mix(0.8, 1.35, stylized)))
    .add(sunColor.scale((sun * 2.6 + halo * 0.075) * sunIntensity))
    .add(moonColor.scale((moon * 2 + moonHalo * 0.055) * moonIntensity));
}

function bounceDirection(
  incoming: Vec3,
  normal: Vec3,
  random: Vec2,
  roughness: number,
  metallic: number,
  glass: number,
): Vec3 {
  const phi = random.x * 6.283185307;
  const radial = sqrt(random.y);
  const vertical = sqrt(max(1 - random.y, 0));
  const reference = mix(vec3(0, 1, 0), vec3(1, 0, 0), step(0.85, abs(normal.y)));
  const tangent = normalize(cross(reference, normal));
  const bitangent = cross(normal, tangent);
  const diffuse = normalize(
    tangent.scale(radial * cos(phi))
      .add(bitangent.scale(radial * sin(phi)))
      .add(normal.scale(vertical)),
  );
  const mirror = normalize(reflect(incoming, normal));
  const specularWeight = clamp(
    metallic * 0.72 + glass * 0.88 + (1 - roughness) * 0.18,
    0,
    0.96,
  );
  return normalize(mix(diffuse, mirror, specularWeight));
}

/**
 * One stochastic sample of a bounded dense-grid path tracer.
 *
 * BroMetal storage values cannot be passed into shader helpers, so each traversal is deliberately
 * visible here: primary, direct-light shadow, transmission, first secondary, and second secondary.
 * All five use a fixed upper bound and stop doing work once their active flag is cleared.
 */
export default shader({
  attributes: { aPosition: 'vec3' },
  uniforms: {
    uPrevious: 'sampler2D',
    uResolution: 'vec2',
    uSampleCount: 'float',
    uCameraPosition: 'vec3',
    uCameraForward: 'vec3',
    uCameraRight: 'vec3',
    uCameraUp: 'vec3',
    uTanHalfFov: 'float',
    uFocalDistance: 'float',
    uAperture: 'float',
    uVolumeOrigin: 'vec3',
    uVolumeDimensions: 'vec3',
    uSunDirection: 'vec3',
    uSunColor: 'vec3',
    uSunIntensity: 'float',
    uMoonDirection: 'vec3',
    uMoonColor: 'vec3',
    uMoonIntensity: 'float',
    uSkyColor: 'vec3',
    uFogColor: 'vec3',
    uStylized: 'float',
    uMaterialVariation: 'float',
    uTraversalCap: 'float',
    uSeed: 'float',
  },
  storage: {
    uVolume: 'vec4',
    uMaterialColor: 'vec4',
    uMaterialSurface: 'vec4',
  },
  varyings: { vUv: 'vec2' },

  vertex({ aPosition }, _uniforms, varyings) {
    const clip = vec4(aPosition.x, aPosition.y, 0, 1);
    varyings.vUv = targetUv(clip);
    return clip;
  },

  fragment(
    {
      uPrevious,
      uResolution,
      uSampleCount,
      uCameraPosition,
      uCameraForward,
      uCameraRight,
      uCameraUp,
      uTanHalfFov,
      uFocalDistance,
      uAperture,
      uVolumeOrigin,
      uVolumeDimensions,
      uSunDirection,
      uSunColor,
      uSunIntensity,
      uMoonDirection,
      uMoonColor,
      uMoonIntensity,
      uSkyColor,
      uFogColor,
      uStylized,
      uMaterialVariation,
      uTraversalCap,
      uSeed,
      uVolume,
      uMaterialColor,
      uMaterialSurface,
    },
    { vUv },
  ) {
    // Matches RAYTRACE_MAX_TRAVERSAL_STEPS for the 384 × 128 × 384 studio world.
    const maximumTraversalSteps = 899;
    const pixel = vec2(floor(vUv.x * uResolution.x), floor(vUv.y * uResolution.y));
    const jitterX = hash21(pixel.add(vec2(uSampleCount * 0.75487766, uSeed * 0.13))) - 0.5;
    const jitterY = hash21(pixel.add(vec2(uSeed * 0.37, uSampleCount * 0.56984029 + 19.1))) - 0.5;
    const sampleUv = vUv.add(vec2(jitterX / uResolution.x, jitterY / uResolution.y));
    const screen = vec2(
      (sampleUv.x * 2 - 1) * (uResolution.x / uResolution.y),
      1 - sampleUv.y * 2,
    );
    const pinholeDirection = normalize(
      uCameraForward
        .add(uCameraRight.scale(screen.x * uTanHalfFov))
        .add(uCameraUp.scale(screen.y * uTanHalfFov)),
    );
    const lensAngle = hash21(pixel.add(vec2(uSampleCount * 2.31 + 17.4, uSeed * 0.71))) * 6.283185307;
    const lensRadius = sqrt(hash21(pixel.add(vec2(uSeed * 0.43 + 9.2, uSampleCount * 1.19)))) * uAperture;
    const lensOffset = uCameraRight.scale(cos(lensAngle) * lensRadius)
      .add(uCameraUp.scale(sin(lensAngle) * lensRadius));
    const focalPoint = uCameraPosition.add(pinholeDirection.scale(
      uFocalDistance / max(dot(pinholeDirection, uCameraForward), 0.1),
    ));
    const rayOrigin0 = uCameraPosition.add(lensOffset);
    const rayDirection0 = normalize(focalPoint.sub(rayOrigin0));
    const volumeLow = uVolumeOrigin;
    const volumeHigh = uVolumeOrigin.add(uVolumeDimensions);

    // Primary traversal.
    const interval0 = volumeInterval(rayOrigin0, rayDirection0, volumeLow, volumeHigh);
    const start0 = max(interval0.x, 0);
    const startPoint0 = rayOrigin0.add(rayDirection0.scale(start0 + 0.002));
    let cellX0 = floor(clamp(startPoint0.x - volumeLow.x, 0, uVolumeDimensions.x - 1));
    let cellY0 = floor(clamp(startPoint0.y - volumeLow.y, 0, uVolumeDimensions.y - 1));
    let cellZ0 = floor(clamp(startPoint0.z - volumeLow.z, 0, uVolumeDimensions.z - 1));
    const safeX0 = safeComponent(rayDirection0.x);
    const safeY0 = safeComponent(rayDirection0.y);
    const safeZ0 = safeComponent(rayDirection0.z);
    const stepX0 = mix(-1, 1, step(0, rayDirection0.x));
    const stepY0 = mix(-1, 1, step(0, rayDirection0.y));
    const stepZ0 = mix(-1, 1, step(0, rayDirection0.z));
    const deltaX0 = abs(1 / safeX0);
    const deltaY0 = abs(1 / safeY0);
    const deltaZ0 = abs(1 / safeZ0);
    let maxX0 = (volumeLow.x + cellX0 + step(0, stepX0) - rayOrigin0.x) / safeX0;
    let maxY0 = (volumeLow.y + cellY0 + step(0, stepY0) - rayOrigin0.y) / safeY0;
    let maxZ0 = (volumeLow.z + cellZ0 + step(0, stepZ0) - rayOrigin0.z) / safeZ0;
    let distance0 = start0;
    let normal0 = boundaryNormal(startPoint0, volumeLow, volumeHigh);
    let material0 = 0;
    let hit0 = 0;
    let active0 = step(start0, interval0.y) * step(0, interval0.y);
    for (let i = 0; i < maximumTraversalSteps && active0 > 0.5 && i < uTraversalCap; i = i + 1) {
      if (active0 > 0.5 && i < uTraversalCap) {
        const index0 = cellX0
          + cellY0 * uVolumeDimensions.x
          + cellZ0 * uVolumeDimensions.x * uVolumeDimensions.y;
        const packedIndex0 = floor(index0 * 0.25);
        const lane0 = index0 - packedIndex0 * 4;
        const packedVoxel0 = storageRead(uVolume, packedIndex0);
        let voxel0 = packedVoxel0.x;
        if (lane0 > 0.5) voxel0 = packedVoxel0.y;
        if (lane0 > 1.5) voxel0 = packedVoxel0.z;
        if (lane0 > 2.5) voxel0 = packedVoxel0.w;
        if (voxel0 > 0.5) {
          material0 = voxel0;
          hit0 = 1;
          active0 = 0;
        } else {
          const next0 = min(min(maxX0, maxY0), maxZ0);
          if (next0 > interval0.y) {
            active0 = 0;
          } else {
            let chosen0 = 0;
            if (maxX0 <= next0 + 0.00001) {
              cellX0 = cellX0 + stepX0;
              maxX0 = maxX0 + deltaX0;
              normal0 = vec3(0 - stepX0, 0, 0);
              chosen0 = 1;
            }
            if (maxY0 <= next0 + 0.00001) {
              cellY0 = cellY0 + stepY0;
              maxY0 = maxY0 + deltaY0;
              if (chosen0 < 0.5) normal0 = vec3(0, 0 - stepY0, 0);
              chosen0 = 1;
            }
            if (maxZ0 <= next0 + 0.00001) {
              cellZ0 = cellZ0 + stepZ0;
              maxZ0 = maxZ0 + deltaZ0;
              if (chosen0 < 0.5) normal0 = vec3(0, 0, 0 - stepZ0);
            }
            distance0 = next0;
            if (cellX0 < 0 || cellY0 < 0 || cellZ0 < 0
              || cellX0 >= uVolumeDimensions.x
              || cellY0 >= uVolumeDimensions.y
              || cellZ0 >= uVolumeDimensions.z) active0 = 0;
          }
        }
      }
    }

    const baseShadingNormal0 = surfaceNormal(normal0, rayDirection0);
    const materialColor0 = storageRead(uMaterialColor, material0);
    const materialSurface0 = storageRead(uMaterialSurface, material0);
    const hitPoint0 = rayOrigin0.add(rayDirection0.scale(distance0));
    const safeHitPoint0 = mix(rayOrigin0, hitPoint0, hit0);
    const water0 = materialSurface0.w;
    const waterUpFace0 = step(0.5, abs(baseShadingNormal0.y));
    const waterRipple0 = vec3(
      sin(hitPoint0.x * 0.42 + hitPoint0.z * 0.17) * 0.1,
      0,
      cos(hitPoint0.z * 0.38 - hitPoint0.x * 0.13) * 0.1,
    );
    const shadingNormal0 = normalize(baseShadingNormal0.add(
      waterRipple0.scale(water0 * waterUpFace0),
    ));
    const useSun = step(0.001, uSunIntensity);
    const primaryLightDirection = normalize(mix(uMoonDirection, uSunDirection, useSun));
    const primaryLightColor = uSunColor.scale(uSunIntensity)
      .add(uMoonColor.scale(uMoonIntensity));
    const directNdl = max(dot(shadingNormal0, primaryLightDirection), 0);

    // Direct-light shadow traversal.
    const rayOriginS = safeHitPoint0.add(shadingNormal0.scale(0.002));
    const shadowNoiseX = hash21(pixel.add(vec2(uSampleCount * 4.13 + 3.9, uSeed * 1.7))) - 0.5;
    const shadowNoiseY = hash21(pixel.add(vec2(uSeed * 2.3 + 21.7, uSampleCount * 3.47))) - 0.5;
    const rayDirectionS = normalize(primaryLightDirection
      .add(uCameraRight.scale(shadowNoiseX * 0.035))
      .add(uCameraUp.scale(shadowNoiseY * 0.035)));
    const intervalS = volumeInterval(rayOriginS, rayDirectionS, volumeLow, volumeHigh);
    const startS = max(intervalS.x, 0);
    const startPointS = rayOriginS.add(rayDirectionS.scale(startS + 0.002));
    let cellXS = floor(clamp(startPointS.x - volumeLow.x, 0, uVolumeDimensions.x - 1));
    let cellYS = floor(clamp(startPointS.y - volumeLow.y, 0, uVolumeDimensions.y - 1));
    let cellZS = floor(clamp(startPointS.z - volumeLow.z, 0, uVolumeDimensions.z - 1));
    const safeXS = safeComponent(rayDirectionS.x);
    const safeYS = safeComponent(rayDirectionS.y);
    const safeZS = safeComponent(rayDirectionS.z);
    const stepXS = mix(-1, 1, step(0, rayDirectionS.x));
    const stepYS = mix(-1, 1, step(0, rayDirectionS.y));
    const stepZS = mix(-1, 1, step(0, rayDirectionS.z));
    const deltaXS = abs(1 / safeXS);
    const deltaYS = abs(1 / safeYS);
    const deltaZS = abs(1 / safeZS);
    let maxXS = (volumeLow.x + cellXS + step(0, stepXS) - rayOriginS.x) / safeXS;
    let maxYS = (volumeLow.y + cellYS + step(0, stepYS) - rayOriginS.y) / safeYS;
    let maxZS = (volumeLow.z + cellZS + step(0, stepZS) - rayOriginS.z) / safeZS;
    let shadowHit = 0;
    let activeS = hit0 * step(0.00001, directNdl) * step(startS, intervalS.y) * step(0, intervalS.y);
    for (let i = 0; i < maximumTraversalSteps && activeS > 0.5 && i < uTraversalCap; i = i + 1) {
      if (activeS > 0.5 && i < uTraversalCap) {
        const indexS = cellXS
          + cellYS * uVolumeDimensions.x
          + cellZS * uVolumeDimensions.x * uVolumeDimensions.y;
        const packedIndexS = floor(indexS * 0.25);
        const laneS = indexS - packedIndexS * 4;
        const packedVoxelS = storageRead(uVolume, packedIndexS);
        let voxelS = packedVoxelS.x;
        if (laneS > 0.5) voxelS = packedVoxelS.y;
        if (laneS > 1.5) voxelS = packedVoxelS.z;
        if (laneS > 2.5) voxelS = packedVoxelS.w;
        const shadowSurface = storageRead(uMaterialSurface, voxelS);
        if (voxelS > 0.5 && shadowSurface.z < 0.5) {
          shadowHit = 1;
          activeS = 0;
        } else {
          const nextS = min(min(maxXS, maxYS), maxZS);
          if (nextS > intervalS.y) {
            activeS = 0;
          } else {
            if (maxXS <= nextS + 0.00001) {
              cellXS = cellXS + stepXS;
              maxXS = maxXS + deltaXS;
            }
            if (maxYS <= nextS + 0.00001) {
              cellYS = cellYS + stepYS;
              maxYS = maxYS + deltaYS;
            }
            if (maxZS <= nextS + 0.00001) {
              cellZS = cellZS + stepZS;
              maxZS = maxZS + deltaZS;
            }
            if (cellXS < 0 || cellYS < 0 || cellZS < 0
              || cellXS >= uVolumeDimensions.x
              || cellYS >= uVolumeDimensions.y
              || cellZS >= uVolumeDimensions.z) activeS = 0;
          }
        }
      }
    }

    const visibility = 1 - shadowHit;
    const glass0 = materialSurface0.z;

    // Continue through transmissive voxels to the first different solid or the sky. This is a
    // separate bounded DDA, so water and glass reveal actual scene geometry instead of faking
    // translucency with an opaque surface.
    const rayOriginT = safeHitPoint0.add(rayDirection0.scale(0.002));
    const intervalT = volumeInterval(rayOriginT, rayDirection0, volumeLow, volumeHigh);
    const startT = max(intervalT.x, 0);
    const startPointT = rayOriginT.add(rayDirection0.scale(startT + 0.002));
    let cellXT = floor(clamp(startPointT.x - volumeLow.x, 0, uVolumeDimensions.x - 1));
    let cellYT = floor(clamp(startPointT.y - volumeLow.y, 0, uVolumeDimensions.y - 1));
    let cellZT = floor(clamp(startPointT.z - volumeLow.z, 0, uVolumeDimensions.z - 1));
    const safeXT = safeComponent(rayDirection0.x);
    const safeYT = safeComponent(rayDirection0.y);
    const safeZT = safeComponent(rayDirection0.z);
    const stepXT = mix(-1, 1, step(0, rayDirection0.x));
    const stepYT = mix(-1, 1, step(0, rayDirection0.y));
    const stepZT = mix(-1, 1, step(0, rayDirection0.z));
    const deltaXT = abs(1 / safeXT);
    const deltaYT = abs(1 / safeYT);
    const deltaZT = abs(1 / safeZT);
    let maxXT = (volumeLow.x + cellXT + step(0, stepXT) - rayOriginT.x) / safeXT;
    let maxYT = (volumeLow.y + cellYT + step(0, stepYT) - rayOriginT.y) / safeYT;
    let maxZT = (volumeLow.z + cellZT + step(0, stepZT) - rayOriginT.z) / safeZT;
    let transmissionDistance = startT;
    let transmissionMaterial = 0;
    let transmissionFound = 0;
    let activeT = hit0 * step(0.5, glass0) * step(startT, intervalT.y) * step(0, intervalT.y);
    for (let i = 0; i < maximumTraversalSteps && activeT > 0.5 && i < uTraversalCap; i = i + 1) {
      if (activeT > 0.5 && i < uTraversalCap) {
        const indexT = cellXT
          + cellYT * uVolumeDimensions.x
          + cellZT * uVolumeDimensions.x * uVolumeDimensions.y;
        const packedIndexT = floor(indexT * 0.25);
        const laneT = indexT - packedIndexT * 4;
        const packedVoxelT = storageRead(uVolume, packedIndexT);
        let voxelT = packedVoxelT.x;
        if (laneT > 0.5) voxelT = packedVoxelT.y;
        if (laneT > 1.5) voxelT = packedVoxelT.z;
        if (laneT > 2.5) voxelT = packedVoxelT.w;
        if (voxelT > 0.5 && abs(voxelT - material0) > 0.5) {
          transmissionMaterial = voxelT;
          transmissionFound = 1;
          activeT = 0;
        } else {
          const nextT = min(min(maxXT, maxYT), maxZT);
          if (nextT > intervalT.y) {
            transmissionDistance = intervalT.y;
            activeT = 0;
          } else {
            if (maxXT <= nextT + 0.00001) {
              cellXT = cellXT + stepXT;
              maxXT = maxXT + deltaXT;
            }
            if (maxYT <= nextT + 0.00001) {
              cellYT = cellYT + stepYT;
              maxYT = maxYT + deltaYT;
            }
            if (maxZT <= nextT + 0.00001) {
              cellZT = cellZT + stepZT;
              maxZT = maxZT + deltaZT;
            }
            transmissionDistance = nextT;
            if (cellXT < 0 || cellYT < 0 || cellZT < 0
              || cellXT >= uVolumeDimensions.x
              || cellYT >= uVolumeDimensions.y
              || cellZT >= uVolumeDimensions.z) activeT = 0;
          }
        }
      }
    }
    const transmissionColor = storageRead(uMaterialColor, transmissionMaterial).xyz;
    const transmissionSky = skyRadiance(
      rayDirection0,
      uSkyColor,
      uFogColor,
      uSunDirection,
      uSunColor,
      uSunIntensity,
      uMoonDirection,
      uMoonColor,
      uMoonIntensity,
      uStylized,
    );
    const behindColor = mix(transmissionSky, transmissionColor, transmissionFound);
    const glassAttenuation = pow(0.985, max(transmissionDistance, 0));
    const waterAttenuation = pow(0.91, max(transmissionDistance, 0));
    const waterTint = mix(vec3(0.025, 0.18, 0.24), materialColor0.xyz, 0.42);
    const transmitted0 = mix(
      behindColor.scale(glassAttenuation),
      behindColor.mul(waterTint).scale(1.35 * waterAttenuation),
      water0,
    );
    const paletteFamily0 = floor(material0 / 24) / 11;
    const breakup0 = sin(dot(hitPoint0, vec3(0.73, 1.19, 0.41)) + material0 * 0.37);
    const variedColor0 = materialColor0.xyz.scale(1 + breakup0 * uMaterialVariation * 0.12);
    const graphicColor0 = mix(
      variedColor0,
      variedColor0.scale(0.78).add(mix(
        vec3(0.04, 0.24, 0.5),
        vec3(0.7, 0.08, 0.28),
        paletteFamily0,
      ).scale(0.28)),
      uStylized,
    );
    const roughnessBand0 = floor(materialSurface0.x * 3 + 0.5) / 3;
    const stylizedMaterialColor0 = graphicColor0
      .scale(1 - roughnessBand0 * 0.12 * uStylized)
      .add(vec3(1, 0.42, 0.08).scale(materialSurface0.y * 0.18 * uStylized))
      .add(vec3(0.1, 0.64, 0.78).scale(glass0 * 0.16 * uStylized))
      .add(vec3(0.02, 0.32, 0.46).scale(water0 * 0.18 * uStylized));
    const stylizedNdl = floor(directNdl * 4 + 0.999) / 4;
    const shapedNdl = mix(directNdl, stylizedNdl, uStylized);
    const diffuse0 = stylizedMaterialColor0
      .mul(uSkyColor.scale(0.12).add(primaryLightColor.scale(shapedNdl * visibility)))
      .scale(1 - glass0 * 0.68);
    const reflectedSun0 = reflect(primaryLightDirection.scale(-1), shadingNormal0);
    const specular0 = pow(max(dot(reflectedSun0, rayDirection0.scale(-1)), 0),
      6 + (1 - materialSurface0.x) * 90)
      * (0.04 + materialSurface0.y * 0.75 + glass0 * 1.15)
      * visibility;
    const environmentReflection0 = skyRadiance(
      reflect(rayDirection0, shadingNormal0),
      uSkyColor,
      uFogColor,
      uSunDirection,
      uSunColor,
      uSunIntensity,
      uMoonDirection,
      uMoonColor,
      uMoonIntensity,
      uStylized,
    ).scale(glass0 * 0.82 + materialSurface0.y * 0.2);
    let radiance = skyRadiance(
      rayDirection0,
      uSkyColor,
      uFogColor,
      uSunDirection,
      uSunColor,
      uSunIntensity,
      uMoonDirection,
      uMoonColor,
      uMoonIntensity,
      uStylized,
    )
      .scale(1 - hit0)
      .add(stylizedMaterialColor0.scale(materialColor0.w * hit0))
      .add(diffuse0.scale(hit0))
      .add(primaryLightColor.scale(specular0 * hit0))
      .add(environmentReflection0.scale(hit0))
      .add(transmitted0.scale(hit0 * glass0 * (0.78 - water0 * 0.12)));

    const random1 = vec2(
      hash21(pixel.add(vec2(uSampleCount * 1.73 + 7.1, uSeed + 3.7))),
      hash21(pixel.add(vec2(uSeed + 31.9, uSampleCount * 2.17 + 11.3))),
    );
    const rayDirection1 = bounceDirection(
      rayDirection0,
      shadingNormal0,
      random1,
      materialSurface0.x,
      materialSurface0.y,
      materialSurface0.z,
    );
    const rayOrigin1 = safeHitPoint0.add(shadingNormal0.scale(0.002));

    // First secondary traversal.
    const interval1 = volumeInterval(rayOrigin1, rayDirection1, volumeLow, volumeHigh);
    const start1 = max(interval1.x, 0);
    const startPoint1 = rayOrigin1.add(rayDirection1.scale(start1 + 0.002));
    let cellX1 = floor(clamp(startPoint1.x - volumeLow.x, 0, uVolumeDimensions.x - 1));
    let cellY1 = floor(clamp(startPoint1.y - volumeLow.y, 0, uVolumeDimensions.y - 1));
    let cellZ1 = floor(clamp(startPoint1.z - volumeLow.z, 0, uVolumeDimensions.z - 1));
    const safeX1 = safeComponent(rayDirection1.x);
    const safeY1 = safeComponent(rayDirection1.y);
    const safeZ1 = safeComponent(rayDirection1.z);
    const stepX1 = mix(-1, 1, step(0, rayDirection1.x));
    const stepY1 = mix(-1, 1, step(0, rayDirection1.y));
    const stepZ1 = mix(-1, 1, step(0, rayDirection1.z));
    const deltaX1 = abs(1 / safeX1);
    const deltaY1 = abs(1 / safeY1);
    const deltaZ1 = abs(1 / safeZ1);
    let maxX1 = (volumeLow.x + cellX1 + step(0, stepX1) - rayOrigin1.x) / safeX1;
    let maxY1 = (volumeLow.y + cellY1 + step(0, stepY1) - rayOrigin1.y) / safeY1;
    let maxZ1 = (volumeLow.z + cellZ1 + step(0, stepZ1) - rayOrigin1.z) / safeZ1;
    let distance1 = start1;
    let normal1 = boundaryNormal(startPoint1, volumeLow, volumeHigh);
    let material1 = 0;
    let hit1 = 0;
    let active1 = hit0 * step(start1, interval1.y) * step(0, interval1.y);
    for (let i = 0; i < maximumTraversalSteps && active1 > 0.5 && i < uTraversalCap; i = i + 1) {
      if (active1 > 0.5 && i < uTraversalCap) {
        const index1 = cellX1
          + cellY1 * uVolumeDimensions.x
          + cellZ1 * uVolumeDimensions.x * uVolumeDimensions.y;
        const packedIndex1 = floor(index1 * 0.25);
        const lane1 = index1 - packedIndex1 * 4;
        const packedVoxel1 = storageRead(uVolume, packedIndex1);
        let voxel1 = packedVoxel1.x;
        if (lane1 > 0.5) voxel1 = packedVoxel1.y;
        if (lane1 > 1.5) voxel1 = packedVoxel1.z;
        if (lane1 > 2.5) voxel1 = packedVoxel1.w;
        if (voxel1 > 0.5) {
          material1 = voxel1;
          hit1 = 1;
          active1 = 0;
        } else {
          const next1 = min(min(maxX1, maxY1), maxZ1);
          if (next1 > interval1.y) {
            active1 = 0;
          } else {
            let chosen1 = 0;
            if (maxX1 <= next1 + 0.00001) {
              cellX1 = cellX1 + stepX1;
              maxX1 = maxX1 + deltaX1;
              normal1 = vec3(0 - stepX1, 0, 0);
              chosen1 = 1;
            }
            if (maxY1 <= next1 + 0.00001) {
              cellY1 = cellY1 + stepY1;
              maxY1 = maxY1 + deltaY1;
              if (chosen1 < 0.5) normal1 = vec3(0, 0 - stepY1, 0);
              chosen1 = 1;
            }
            if (maxZ1 <= next1 + 0.00001) {
              cellZ1 = cellZ1 + stepZ1;
              maxZ1 = maxZ1 + deltaZ1;
              if (chosen1 < 0.5) normal1 = vec3(0, 0, 0 - stepZ1);
            }
            distance1 = next1;
            if (cellX1 < 0 || cellY1 < 0 || cellZ1 < 0
              || cellX1 >= uVolumeDimensions.x
              || cellY1 >= uVolumeDimensions.y
              || cellZ1 >= uVolumeDimensions.z) active1 = 0;
          }
        }
      }
    }

    const shadingNormal1 = surfaceNormal(normal1, rayDirection1);
    const materialColor1 = storageRead(uMaterialColor, material1);
    const materialSurface1 = storageRead(uMaterialSurface, material1);
    const hitPoint1 = rayOrigin1.add(rayDirection1.scale(distance1));
    const safeHitPoint1 = mix(rayOrigin1, hitPoint1, hit1);
    const throughput0 = materialColor0.xyz.scale(
      0.56 + materialSurface0.y * 0.28 + materialSurface0.z * 0.2,
    );
    const bounceLight1 = materialColor1.xyz.scale(materialColor1.w)
      .add(materialColor1.xyz.mul(uSkyColor).scale(max(dot(shadingNormal1, vec3(0, 1, 0)), 0) * 0.18));
    radiance = radiance.add(
      throughput0.mul(
        skyRadiance(
          rayDirection1,
          uSkyColor,
          uFogColor,
          uSunDirection,
          uSunColor,
          uSunIntensity,
          uMoonDirection,
          uMoonColor,
          uMoonIntensity,
          uStylized,
        ).scale(1 - hit1)
          .add(bounceLight1.scale(hit1)),
      ).scale(hit0),
    );

    const random2 = vec2(
      hash21(pixel.add(vec2(uSampleCount * 2.91 + 43.7, uSeed + 13.1))),
      hash21(pixel.add(vec2(uSeed + 71.3, uSampleCount * 3.31 + 5.9))),
    );
    const rayDirection2 = bounceDirection(
      rayDirection1,
      shadingNormal1,
      random2,
      materialSurface1.x,
      materialSurface1.y,
      materialSurface1.z,
    );
    const rayOrigin2 = safeHitPoint1.add(shadingNormal1.scale(0.002));

    // Second secondary traversal.
    const interval2 = volumeInterval(rayOrigin2, rayDirection2, volumeLow, volumeHigh);
    const start2 = max(interval2.x, 0);
    const startPoint2 = rayOrigin2.add(rayDirection2.scale(start2 + 0.002));
    let cellX2 = floor(clamp(startPoint2.x - volumeLow.x, 0, uVolumeDimensions.x - 1));
    let cellY2 = floor(clamp(startPoint2.y - volumeLow.y, 0, uVolumeDimensions.y - 1));
    let cellZ2 = floor(clamp(startPoint2.z - volumeLow.z, 0, uVolumeDimensions.z - 1));
    const safeX2 = safeComponent(rayDirection2.x);
    const safeY2 = safeComponent(rayDirection2.y);
    const safeZ2 = safeComponent(rayDirection2.z);
    const stepX2 = mix(-1, 1, step(0, rayDirection2.x));
    const stepY2 = mix(-1, 1, step(0, rayDirection2.y));
    const stepZ2 = mix(-1, 1, step(0, rayDirection2.z));
    const deltaX2 = abs(1 / safeX2);
    const deltaY2 = abs(1 / safeY2);
    const deltaZ2 = abs(1 / safeZ2);
    let maxX2 = (volumeLow.x + cellX2 + step(0, stepX2) - rayOrigin2.x) / safeX2;
    let maxY2 = (volumeLow.y + cellY2 + step(0, stepY2) - rayOrigin2.y) / safeY2;
    let maxZ2 = (volumeLow.z + cellZ2 + step(0, stepZ2) - rayOrigin2.z) / safeZ2;
    let distance2 = start2;
    let normal2 = boundaryNormal(startPoint2, volumeLow, volumeHigh);
    let material2 = 0;
    let hit2 = 0;
    let active2 = hit0 * hit1 * step(start2, interval2.y) * step(0, interval2.y);
    for (let i = 0; i < maximumTraversalSteps && active2 > 0.5 && i < uTraversalCap; i = i + 1) {
      if (active2 > 0.5 && i < uTraversalCap) {
        const index2 = cellX2
          + cellY2 * uVolumeDimensions.x
          + cellZ2 * uVolumeDimensions.x * uVolumeDimensions.y;
        const packedIndex2 = floor(index2 * 0.25);
        const lane2 = index2 - packedIndex2 * 4;
        const packedVoxel2 = storageRead(uVolume, packedIndex2);
        let voxel2 = packedVoxel2.x;
        if (lane2 > 0.5) voxel2 = packedVoxel2.y;
        if (lane2 > 1.5) voxel2 = packedVoxel2.z;
        if (lane2 > 2.5) voxel2 = packedVoxel2.w;
        if (voxel2 > 0.5) {
          material2 = voxel2;
          hit2 = 1;
          active2 = 0;
        } else {
          const next2 = min(min(maxX2, maxY2), maxZ2);
          if (next2 > interval2.y) {
            active2 = 0;
          } else {
            let chosen2 = 0;
            if (maxX2 <= next2 + 0.00001) {
              cellX2 = cellX2 + stepX2;
              maxX2 = maxX2 + deltaX2;
              normal2 = vec3(0 - stepX2, 0, 0);
              chosen2 = 1;
            }
            if (maxY2 <= next2 + 0.00001) {
              cellY2 = cellY2 + stepY2;
              maxY2 = maxY2 + deltaY2;
              if (chosen2 < 0.5) normal2 = vec3(0, 0 - stepY2, 0);
              chosen2 = 1;
            }
            if (maxZ2 <= next2 + 0.00001) {
              cellZ2 = cellZ2 + stepZ2;
              maxZ2 = maxZ2 + deltaZ2;
              if (chosen2 < 0.5) normal2 = vec3(0, 0, 0 - stepZ2);
            }
            distance2 = next2;
            if (cellX2 < 0 || cellY2 < 0 || cellZ2 < 0
              || cellX2 >= uVolumeDimensions.x
              || cellY2 >= uVolumeDimensions.y
              || cellZ2 >= uVolumeDimensions.z) active2 = 0;
          }
        }
      }
    }

    const shadingNormal2 = surfaceNormal(normal2, rayDirection2);
    const materialColor2 = storageRead(uMaterialColor, material2);
    const throughput1 = materialColor1.xyz.scale(
      0.48 + materialSurface1.y * 0.25 + materialSurface1.z * 0.18,
    );
    const bounceLight2 = materialColor2.xyz.scale(materialColor2.w)
      .add(materialColor2.xyz.mul(uSkyColor).scale(max(dot(shadingNormal2, vec3(0, 1, 0)), 0) * 0.12));
    radiance = radiance.add(
      throughput0.mul(throughput1).mul(
        skyRadiance(
          rayDirection2,
          uSkyColor,
          uFogColor,
          uSunDirection,
          uSunColor,
          uSunIntensity,
          uMoonDirection,
          uMoonColor,
          uMoonIntensity,
          uStylized,
        ).scale(1 - hit2)
          .add(bounceLight2.scale(hit2)),
      ).scale(hit0 * hit1),
    );

    const primarySky = skyRadiance(
      rayDirection0,
      uSkyColor,
      uFogColor,
      uSunDirection,
      uSunColor,
      uSunIntensity,
      uMoonDirection,
      uMoonColor,
      uMoonIntensity,
      uStylized,
    );
    const atmosphere = smoothstep(105, 360, distance0) * hit0 * 0.48;
    radiance = mix(radiance, primarySky, atmosphere);

    const previous = texture(uPrevious, vUv);
    const nextCount = uSampleCount + 1;
    const mean = previous.xyz.add(radiance.sub(previous.xyz).scale(1 / nextCount));
    return vec4(mean, 1);
  },
});
