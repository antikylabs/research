import { describe, expect, it } from 'vitest';

import { RAYTRACE_MAX_TRAVERSAL_STEPS } from './volume.ts';
import pathSampleShader from './shaders/path-sample.shader.gen.ts';
import presentationShader from './shaders/presentation.shader.gen.ts';

describe('raytrace generated shader contracts', () => {
  it('compiles a bounded storage-backed progressive sample with every required traversal', () => {
    expect(pathSampleShader.uniforms).toMatchObject({
      uPrevious: 'sampler2D',
      uVolume: 'storage',
      uMaterialColor: 'storage',
      uMaterialSurface: 'storage',
      uSampleCount: 'float',
    });
    expect(pathSampleShader.wgslSrc).toContain('var<storage, read> uVolume');
    expect(pathSampleShader.wgslSrc).toContain('var<storage, read> uMaterialColor');
    expect(pathSampleShader.wgslSrc).toContain('var<storage, read> uMaterialSurface');
    expect(pathSampleShader.wgslSrc.match(/for \(/g)?.length).toBeGreaterThanOrEqual(4);
    expect(pathSampleShader.wgslSrc).toContain(
      `let maximumTraversalSteps = ${RAYTRACE_MAX_TRAVERSAL_STEPS}.0;`,
    );
    expect(pathSampleShader.wgslSrc).toContain('uSampleCount');
    expect(pathSampleShader.uniforms).toMatchObject({
      uStylized: 'float',
      uMaterialVariation: 'float',
      uMoonIntensity: 'float',
    });
    expect(pathSampleShader.wgslSrc).toContain('transmissionMaterial');
    expect(pathSampleShader.wgslSrc).toContain('materialSurface0.w');
    expect(pathSampleShader.wgslSrc).toContain('stylizedMaterialColor0');
    expect(pathSampleShader.wgslSrc).toContain('roughnessBand0');
    expect(pathSampleShader.uniforms.uFogColor).toBe('vec3');
    expect(pathSampleShader.wgslSrc).toContain('fn cloudDensity');
    expect(pathSampleShader.wgslSrc).toContain('fn starField');
  });

  it('keeps final grading and exposure presentation-only while material stylization accumulates', () => {
    expect(presentationShader.uniforms).toMatchObject({
      uAccumulation: 'sampler2D',
      uExposure: 'float',
      uGraphic: 'float',
      uFinalColorGrade: 'float',
    });
    expect(pathSampleShader.uniforms).not.toHaveProperty('uExposure');
    expect(pathSampleShader.uniforms).not.toHaveProperty('uGraphic');
    expect(pathSampleShader.uniforms).toHaveProperty('uStylized');
    expect(presentationShader.wgslSrc).toContain('uGraphic');
    expect(presentationShader.wgslSrc).toContain('uFinalColorGrade');
  });
});
