import { describe, expect, it } from 'vitest';

import cinematicPresentShader from '../../render/cinematic-present.shader.gen.ts';
import meshSurfaceShader from './mesh-surface.shader.gen.ts';

describe('generated greedy-mesh surface shader contract', () => {
  it('keeps every compiled mesh stream and the full physical-lighting uniform block', () => {
    expect(meshSurfaceShader.attributes).toEqual({
      aPosition: 'vec3',
      aNormal: 'vec3',
      aColor: 'vec3',
      aMaterial: 'vec4',
      aEmissive: 'float',
      aWater: 'float',
      aAo: 'float',
    });
    expect(meshSurfaceShader.uniforms).toMatchObject({
      uViewProjection: 'mat4',
      uLightViewProjection: 'mat4',
      uCameraPosition: 'vec3',
      uCameraForward: 'vec3',
      uSunDirection: 'vec3',
      uSunColor: 'vec3',
      uMoonDirection: 'vec3',
      uMoonColor: 'vec3',
      uMoonIntensity: 'float',
      uSkyColor: 'vec3',
      uGroundColor: 'vec3',
      uFogColor: 'vec3',
      uShadowMap: 'sampler2D',
      uShadowTexel: 'vec2',
      uShadowPass: 'float',
      uStylized: 'float',
      uMaterialVariation: 'float',
      uTime: 'float',
      uTransparentPass: 'float',
    });
    expect(meshSurfaceShader.layout.uniformBlockSize).toBe(304);
    expect(cinematicPresentShader.layout.uniformBlockSize).toBe(192);
  });

  it('retains energy conservation, AO, emissive, atmosphere, shadows, and HDR presentation', () => {
    const wgsl = meshSurfaceShader.wgslSrc;
    expect(wgsl).toContain('fn fresnelSchlick');
    expect(wgsl).toContain('fn distributionGgx');
    expect(wgsl).toContain('fn geometrySmith');
    expect(wgsl).toContain('(vec3f(1.0, 1.0, 1.0) - fresnel) * (1.0 - metallic)');
    expect(wgsl).toContain('baseColor * max(bm_in.vEmissive, 0.0)');
    expect(wgsl).toContain('clamp(bm_in.vAo, 0.0, 1.0)');
    expect(wgsl).toContain('exp(-bm_u.uFogDensity * distanceToCamera)');
    expect(wgsl).toContain('textureSample(uShadowMap');
    expect(wgsl).toContain('bm_u.uShadowPass');
    expect(wgsl).toContain('bm_u.uMoonIntensity');
    expect(wgsl).toContain('bm_u.uMaterialVariation');
    expect(wgsl).toContain('waterOpticalDepth');
    expect(wgsl).toContain('roughnessBand');
    expect(wgsl).toContain('metallic *');
    expect(wgsl).toContain('water *');
    expect(cinematicPresentShader.wgslSrc).toContain('tonemapACES(exposed)');
    expect(cinematicPresentShader.wgslSrc).toContain('encodeSrgb');
    expect(cinematicPresentShader.wgslSrc).toContain('bm_u.uFocusDistance');
    expect(cinematicPresentShader.wgslSrc).toContain('bm_u.uDofEnabled');
    expect(cinematicPresentShader.wgslSrc).toContain('bm_u.uFinalColorGrade');
    expect(cinematicPresentShader.wgslSrc).toContain('bm_u.uSunDirection');
    expect(cinematicPresentShader.wgslSrc).toContain('bm_u.uMoonIntensity');
    expect(cinematicPresentShader.wgslSrc).toContain('hasTransparentSky');
    expect(cinematicPresentShader.wgslSrc).toContain('fn cloudDensity');
    expect(cinematicPresentShader.wgslSrc).toContain('fn starField');
    expect(cinematicPresentShader.wgslSrc).toContain('bm_u.uCameraRight');
    expect(cinematicPresentShader.wgslSrc).toContain('bm_u.uTanHalfFov');
  });
});
