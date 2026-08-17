import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CameraSnapshot } from '../../camera/types.ts';
import type { VoxelMaterial, VoxelScene } from '../../scene/types.ts';
import { DEFAULT_RENDER_SETTINGS } from '../../studio/settings.ts';

const brometal = vi.hoisted(() => ({
  createProgram: vi.fn(),
  createRenderer: vi.fn(),
  createRenderTarget: vi.fn(),
}));

vi.mock('brometal', async (importOriginal) => ({
  ...await importOriginal<typeof import('brometal')>(),
  createProgram: brometal.createProgram,
  createRenderer: brometal.createRenderer,
  createRenderTarget: brometal.createRenderTarget,
}));

import { createInstancesApproach } from './renderer.ts';

const setter = () => ({ set: vi.fn() });

function material(paletteIndex: number): VoxelMaterial {
  return Object.freeze({
    paletteIndex,
    srgb: [0.5, 0.3, 0.2] as const,
    linear: [0.22, 0.07, 0.03] as const,
    roughness: paletteIndex === 2 ? 0.04 : 0.6,
    metallic: paletteIndex === 1 ? 0.7 : 0,
    emission: 0,
    glass: paletteIndex === 2 ? 0.92 : 0,
    water: paletteIndex === 2 ? 1 : 0,
    sourceType: paletteIndex === 2 ? '_water' : '_diffuse',
  });
}

const fixtureScene: VoxelScene = Object.freeze({
  name: 'instance lifecycle fixture',
  dimensions: [2, 1, 1] as const,
  origin: [0, 0, 0] as const,
  cells: Object.freeze([
    Object.freeze({ x: 0, y: 0, z: 0, paletteIndex: 1 }),
    Object.freeze({ x: 1, y: 0, z: 0, paletteIndex: 2 }),
  ]),
  materials: Object.freeze(Array.from({ length: 256 }, (_, index) => material(index))),
  bounds: Object.freeze({ min: [0, 0, 0] as const, max: [2, 1, 1] as const }),
  receipt: Object.freeze({
    source: 'built-in',
    sourceBytes: 0,
    parseMilliseconds: 0,
    modelCount: 1,
    selectedModel: 0,
    voxelCount: 2,
    warnings: Object.freeze([]),
  }),
  fingerprint: 'instances-lifecycle',
});

const camera: CameraSnapshot = Object.freeze({
  position: [4, 3, 2] as const,
  target: [0, 0, 0] as const,
  forward: [-1, 0, 0] as const,
  right: [0, 0, 1] as const,
  up: [0, 1, 0] as const,
  viewProjection: new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]),
  verticalFovRadians: Math.PI / 3,
  revision: 1,
});

function surfaceProgram() {
  return {
    attributes: { aPosition: setter(), aCorner: setter() },
    instanceAttributes: {
      iPosition: setter(),
      iFace: setter(),
      iColorRoughness: setter(),
      iMaterialPalette: setter(),
      iWater: setter(),
      iAo: setter(),
    },
    uniforms: Object.fromEntries([
      'uViewProjection', 'uLightViewProjection', 'uViewPosition', 'uViewForward',
      'uSunDirection', 'uSunColor', 'uSunIntensity', 'uMoonDirection', 'uMoonColor',
      'uMoonIntensity', 'uSkyColor', 'uGroundColor', 'uFogColor', 'uFogNear', 'uFogFar',
      'uShadowMap', 'uShadowTexel', 'uShadowPass', 'uStylized', 'uMaterialVariation',
      'uTime', 'uTransparentPass',
    ].map((name) => [name, setter()])),
    setIndices: vi.fn(),
    draw: vi.fn(),
    dispose: vi.fn(),
  };
}

function presentationProgram() {
  return {
    attributes: { aPosition: setter() },
    instanceAttributes: {},
    uniforms: Object.fromEntries([
      'uScene', 'uResolution', 'uFocusDistance', 'uFocusRange', 'uAperture',
      'uDofEnabled', 'uExposure', 'uStylized', 'uFinalColorGrade', 'uSkyColor',
      'uFogColor', 'uSunDirection', 'uSunColor', 'uSunIntensity', 'uMoonDirection',
      'uMoonColor', 'uMoonIntensity', 'uCameraForward', 'uCameraRight', 'uCameraUp',
      'uTanHalfFov',
    ].map((name) => [name, setter()])),
    setIndices: vi.fn(),
    draw: vi.fn(),
    dispose: vi.fn(),
  };
}

function createDoubles() {
  let loopCallback: (() => void) | null = null;
  const stopLoop = vi.fn();
  const opaque = surfaceProgram();
  const transparent = surfaceProgram();
  const presentation = presentationProgram();
  const targets: Array<{ dispose: ReturnType<typeof vi.fn> }> = [];
  const renderer = {
    canvas: { width: 1280, height: 720 } as HTMLCanvasElement,
    loop: vi.fn((callback: () => void) => {
      loopCallback = callback;
      return stopLoop;
    }),
    drawTo: vi.fn((_target: unknown, draw: () => void) => draw()),
    destroy: vi.fn(),
  };
  brometal.createRenderer.mockResolvedValue(renderer);
  brometal.createProgram
    .mockReturnValueOnce(opaque)
    .mockReturnValueOnce(transparent)
    .mockReturnValueOnce(presentation);
  brometal.createRenderTarget.mockImplementation(
    (_renderer: unknown, options: { width: number; height: number }) => {
      const target = {
        width: options.width,
        height: options.height,
        texture: Object.freeze({}),
        dispose: vi.fn(),
      };
      targets.push(target);
      return target;
    },
  );
  return {
    opaque,
    transparent,
    presentation,
    renderer,
    stopLoop,
    targets,
    drawFrame(): void {
      if (loopCallback === null) throw new Error('Instance renderer loop was not installed.');
      loopCallback();
    },
  };
}

describe('face-instance renderer lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates shared studio controls and disposes every owned resource once', async () => {
    const doubles = createDoubles();
    const approach = await createInstancesApproach({
      canvas: {} as HTMLCanvasElement,
      scene: fixtureScene,
      initialSettings: DEFAULT_RENDER_SETTINGS,
      onError: vi.fn(),
    });

    expect(brometal.createProgram.mock.calls[1]![2]).toEqual({ blend: 'alpha' });
    expect(doubles.opaque.instanceAttributes.iPosition.set).toHaveBeenCalledOnce();
    expect(doubles.transparent.instanceAttributes.iWater.set).toHaveBeenCalledOnce();

    const changed = {
      ...DEFAULT_RENDER_SETTINGS,
      style: 'graphic' as const,
      depthOfField: { enabled: false, focusDistance: 44, aperture: 1.7 },
      lighting: { timeOfDay: 1.5, moonEnabled: false },
      exposure: 1.8,
      finalColorGrade: false,
      materialVariation: 0.75,
    };
    approach.frame(2.5, camera, changed);
    doubles.drawFrame();

    expect(doubles.opaque.uniforms.uStylized!.set).toHaveBeenLastCalledWith(1);
    expect(doubles.opaque.uniforms.uFogNear!.set).toHaveBeenCalledWith(105);
    expect(doubles.opaque.uniforms.uFogFar!.set).toHaveBeenCalledWith(360);
    expect(doubles.transparent.uniforms.uFogNear!.set).toHaveBeenCalledWith(105);
    expect(doubles.transparent.uniforms.uFogFar!.set).toHaveBeenCalledWith(360);
    expect(doubles.transparent.uniforms.uMaterialVariation!.set).toHaveBeenLastCalledWith(0.75);
    expect(doubles.presentation.uniforms.uFocusDistance!.set).toHaveBeenLastCalledWith(44);
    expect(doubles.presentation.uniforms.uAperture!.set).toHaveBeenLastCalledWith(1.7);
    expect(doubles.presentation.uniforms.uDofEnabled!.set).toHaveBeenLastCalledWith(0);
    expect(doubles.presentation.uniforms.uFinalColorGrade!.set).toHaveBeenLastCalledWith(0);
    expect(doubles.presentation.uniforms.uMoonIntensity!.set).toHaveBeenLastCalledWith(0);
    expect(doubles.presentation.uniforms.uCameraForward!.set).toHaveBeenLastCalledWith(camera.forward);
    expect(doubles.presentation.uniforms.uCameraRight!.set).toHaveBeenLastCalledWith(camera.right);
    expect(doubles.presentation.uniforms.uCameraUp!.set).toHaveBeenLastCalledWith(camera.up);
    expect(doubles.presentation.uniforms.uTanHalfFov!.set).toHaveBeenLastCalledWith(
      Math.tan(camera.verticalFovRadians * 0.5),
    );
    expect(doubles.opaque.draw).toHaveBeenCalledTimes(2);
    expect(doubles.transparent.draw).toHaveBeenCalledOnce();
    expect(doubles.presentation.draw).toHaveBeenCalledOnce();

    approach.dispose();
    approach.dispose();
    approach.frame(3, camera, DEFAULT_RENDER_SETTINGS);
    doubles.drawFrame();

    expect(doubles.stopLoop).toHaveBeenCalledOnce();
    expect(doubles.opaque.dispose).toHaveBeenCalledOnce();
    expect(doubles.transparent.dispose).toHaveBeenCalledOnce();
    expect(doubles.presentation.dispose).toHaveBeenCalledOnce();
    expect(doubles.targets).toHaveLength(2);
    for (const target of doubles.targets) expect(target.dispose).toHaveBeenCalledOnce();
    expect(doubles.renderer.destroy).toHaveBeenCalledOnce();
    expect(doubles.presentation.draw).toHaveBeenCalledOnce();
  });
});
