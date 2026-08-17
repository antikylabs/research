import { describe, expect, it } from 'vitest';

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
    expect(pathSampleShader.wgslSrc).toContain('uSampleCount');
  });

  it('keeps presentation style and exposure out of the accumulation shader', () => {
    expect(presentationShader.uniforms).toMatchObject({
      uAccumulation: 'sampler2D',
      uExposure: 'float',
      uGraphic: 'float',
    });
    expect(pathSampleShader.uniforms).not.toHaveProperty('uExposure');
    expect(pathSampleShader.uniforms).not.toHaveProperty('uGraphic');
    expect(presentationShader.wgslSrc).toContain('uGraphic');
  });
});
