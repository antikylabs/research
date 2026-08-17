import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CameraSnapshot } from '../../camera/types.ts';
import type { VoxelMaterial, VoxelScene } from '../../scene/types.ts';
import { DEFAULT_RENDER_SETTINGS } from '../../studio/settings.ts';

const brometal = vi.hoisted(() => ({
  createProgram: vi.fn(),
  createRenderer: vi.fn(),
  createRenderTarget: vi.fn(),
  createStorageBuffer: vi.fn(),
}));

vi.mock('brometal', async (importOriginal) => ({
  ...await importOriginal<typeof import('brometal')>(),
  createProgram: brometal.createProgram,
  createRenderer: brometal.createRenderer,
  createRenderTarget: brometal.createRenderTarget,
  createStorageBuffer: brometal.createStorageBuffer,
}));

import { createRaytraceApproach } from './renderer.ts';

const setter = () => ({ set: vi.fn() });

function material(paletteIndex: number): VoxelMaterial {
  return Object.freeze({
    paletteIndex,
    srgb: [0.6, 0.4, 0.2] as const,
    linear: [0.32, 0.13, 0.03] as const,
    roughness: 0.5,
    metallic: 0,
    emission: 0,
    glass: 0,
    water: 0,
    sourceType: '_diffuse',
  });
}

const fixtureScene: VoxelScene = Object.freeze({
  name: 'ray lifecycle fixture',
  dimensions: [2, 2, 2] as const,
  origin: [-1, -1, -1] as const,
  cells: Object.freeze([Object.freeze({ x: 1, y: 1, z: 1, paletteIndex: 4 })]),
  materials: Object.freeze(Array.from({ length: 256 }, (_, index) => material(index))),
  bounds: Object.freeze({ min: [-1, -1, -1] as const, max: [1, 1, 1] as const }),
  receipt: Object.freeze({
    source: 'built-in',
    sourceBytes: 0,
    parseMilliseconds: 0,
    modelCount: 1,
    selectedModel: 0,
    voxelCount: 1,
    warnings: Object.freeze([]),
  }),
  fingerprint: 'ray-lifecycle',
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
  revision: 3,
});

function pathProgram() {
  return {
    attributes: { aPosition: setter() },
    instanceAttributes: {},
    uniforms: Object.fromEntries([
      'uPrevious', 'uResolution', 'uSampleCount', 'uCameraPosition', 'uCameraForward',
      'uCameraRight', 'uCameraUp', 'uTanHalfFov', 'uFocalDistance', 'uAperture',
      'uVolumeOrigin', 'uVolumeDimensions', 'uSunDirection', 'uSunColor', 'uSunIntensity',
      'uMoonDirection', 'uMoonColor', 'uMoonIntensity', 'uSkyColor', 'uFogColor', 'uStylized',
      'uMaterialVariation', 'uTraversalCap', 'uSeed', 'uVolume', 'uMaterialColor',
      'uMaterialSurface',
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
      'uAccumulation', 'uResolution', 'uExposure', 'uGraphic', 'uFinalColorGrade',
    ].map((name) => [name, setter()])),
    setIndices: vi.fn(),
    draw: vi.fn(),
    dispose: vi.fn(),
  };
}

function createDoubles() {
  let loopCallback: (() => void) | null = null;
  const stopLoop = vi.fn();
  const path = pathProgram();
  const presentation = presentationProgram();
  const targets: Array<{
    width: number;
    height: number;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];
  const storage = Array.from({ length: 3 }, () => ({ dispose: vi.fn() }));
  const renderer = {
    canvas: { width: 640, height: 360 } as HTMLCanvasElement,
    loop: vi.fn((callback: () => void) => {
      loopCallback = callback;
      return stopLoop;
    }),
    drawTo: vi.fn((_target: unknown, draw: () => void) => draw()),
    destroy: vi.fn(),
  };
  brometal.createRenderer.mockResolvedValue(renderer);
  brometal.createProgram.mockReturnValueOnce(path).mockReturnValueOnce(presentation);
  for (const buffer of storage) brometal.createStorageBuffer.mockReturnValueOnce(buffer);
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
    path,
    presentation,
    targets,
    storage,
    renderer,
    stopLoop,
    drawFrame(): void {
      if (loopCallback === null) throw new Error('Raytrace renderer loop was not installed.');
      loopCallback();
    },
  };
}

describe('path-trace renderer lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('classifies control resets and disposes all accumulation resources once', async () => {
    const doubles = createDoubles();
    const onError = vi.fn();
    const approach = await createRaytraceApproach({
      canvas: {} as HTMLCanvasElement,
      scene: fixtureScene,
      initialSettings: DEFAULT_RENDER_SETTINGS,
      onError,
    });

    approach.frame(0, camera, DEFAULT_RENDER_SETTINGS);
    doubles.drawFrame();
    expect(approach.stats()).toMatchObject({ sampleCount: 1, resetReason: 'initial' });

    const presentationOnly = {
      ...DEFAULT_RENDER_SETTINGS,
      exposure: 2,
      finalColorGrade: false,
    };
    approach.frame(1, camera, presentationOnly);
    doubles.drawFrame();
    expect(approach.stats()).toMatchObject({ sampleCount: 2, resetReason: 'initial' });
    expect(doubles.presentation.uniforms.uExposure!.set).toHaveBeenLastCalledWith(2);
    expect(doubles.presentation.uniforms.uFinalColorGrade!.set).toHaveBeenLastCalledWith(0);

    const refocused = {
      ...presentationOnly,
      depthOfField: { enabled: true, focusDistance: 42, aperture: 1.6 },
    };
    approach.frame(2, camera, refocused);
    doubles.drawFrame();
    expect(approach.stats()).toMatchObject({ sampleCount: 1, resetReason: 'camera' });
    expect(doubles.path.uniforms.uFocalDistance!.set).toHaveBeenLastCalledWith(42);
    expect(doubles.path.uniforms.uAperture!.set).toHaveBeenLastCalledWith(1.6);

    approach.frame(3, camera, { ...refocused, style: 'graphic', materialVariation: 0.8 });
    doubles.drawFrame();
    expect(approach.stats()).toMatchObject({ sampleCount: 1, resetReason: 'material-light' });
    expect(doubles.path.uniforms.uStylized!.set).toHaveBeenLastCalledWith(1);
    expect(doubles.path.uniforms.uMaterialVariation!.set).toHaveBeenLastCalledWith(0.8);
    expect(approach.stats().detail).toMatch(/5\/pixel/);

    approach.dispose();
    approach.dispose();
    const drawsBeforeDisposedFrame = doubles.presentation.draw.mock.calls.length;
    approach.frame(4, camera, DEFAULT_RENDER_SETTINGS);
    doubles.drawFrame();

    expect(onError).not.toHaveBeenCalled();
    expect(doubles.stopLoop).toHaveBeenCalledOnce();
    expect(doubles.path.dispose).toHaveBeenCalledOnce();
    expect(doubles.presentation.dispose).toHaveBeenCalledOnce();
    expect(doubles.storage).toHaveLength(3);
    for (const buffer of doubles.storage) expect(buffer.dispose).toHaveBeenCalledOnce();
    expect(doubles.targets).toHaveLength(2);
    for (const target of doubles.targets) expect(target.dispose).toHaveBeenCalledOnce();
    expect(doubles.renderer.destroy).toHaveBeenCalledOnce();
    expect(doubles.presentation.draw).toHaveBeenCalledTimes(drawsBeforeDisposedFrame);
  });
});
