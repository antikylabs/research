import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CameraSnapshot } from '../../camera/types.ts';
import type { Vec3Tuple, VoxelMaterial, VoxelScene } from '../../scene/types.ts';

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

import { createMeshApproach } from './renderer.ts';

const set = () => vi.fn<(value: number | readonly number[] | Float32Array) => void>();

function material(paletteIndex: number): VoxelMaterial {
  const result: VoxelMaterial = {
    paletteIndex,
    srgb: [0.8, 0.3, 0.1],
    linear: [0.604, 0.073, 0.01],
    roughness: 0.42,
    metallic: 0.18,
    emission: 0.2,
    glass: 0,
    sourceType: '_diffuse',
  };
  return Object.freeze(result);
}

function scene(empty = false): VoxelScene {
  const materials = Array.from({ length: 256 }, (_, index) => material(index));
  const cells = empty ? [] : [{ x: 0, y: 0, z: 0, paletteIndex: 4 }];
  const dimensions: Vec3Tuple = [1, 1, 1];
  const maximum: Vec3Tuple = [1, 1, 1];
  return Object.freeze({
    name: empty ? 'empty' : 'single voxel',
    dimensions,
    origin: [0, 0, 0] as const,
    cells: Object.freeze(cells),
    materials: Object.freeze(materials),
    bounds: Object.freeze({ min: [0, 0, 0] as const, max: maximum }),
    receipt: Object.freeze({
      source: 'built-in',
      sourceBytes: 0,
      parseMilliseconds: 0,
      modelCount: 1,
      selectedModel: 0,
      voxelCount: cells.length,
      warnings: Object.freeze([]),
    }),
    fingerprint: 'renderer-fixture',
  });
}

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

function createDoubles() {
  let loopCallback: (() => void) | null = null;
  const stopLoop = vi.fn();
  const surfaceAttributes = {
    aPosition: { set: set() },
    aNormal: { set: set() },
    aColor: { set: set() },
    aMaterial: { set: set() },
    aEmissive: { set: set() },
    aAo: { set: set() },
  };
  const surfaceUniforms = {
    uViewProjection: { set: set() },
    uLightViewProjection: { set: set() },
    uCameraPosition: { set: set() },
    uCameraForward: { set: set() },
    uSunDirection: { set: set() },
    uSunColor: { set: set() },
    uSunIntensity: { set: set() },
    uSkyColor: { set: set() },
    uGroundColor: { set: set() },
    uAmbientIntensity: { set: set() },
    uFogColor: { set: set() },
    uFogDensity: { set: set() },
    uShadowMap: { set: set() },
    uShadowTexel: { set: set() },
    uShadowPass: { set: set() },
    uStylized: { set: set() },
  };
  const surfaceProgram = {
    attributes: surfaceAttributes,
    instanceAttributes: {},
    uniforms: surfaceUniforms,
    setIndices: vi.fn(),
    draw: vi.fn(),
    dispatch: vi.fn(),
    dispose: vi.fn(),
  };
  const presentationAttributes = { aPosition: { set: set() } };
  const presentationUniforms = {
    uScene: { set: set() },
    uResolution: { set: set() },
    uFocusDistance: { set: set() },
    uFocusRange: { set: set() },
    uAperture: { set: set() },
    uExposure: { set: set() },
    uStylized: { set: set() },
  };
  const presentationProgram = {
    attributes: presentationAttributes,
    instanceAttributes: {},
    uniforms: presentationUniforms,
    setIndices: vi.fn(),
    draw: vi.fn(),
    dispatch: vi.fn(),
    dispose: vi.fn(),
  };
  const targets: Array<{
    width: number;
    height: number;
    texture: object;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];
  const renderer = {
    backend: 'webgpu',
    canvas: { width: 1280, height: 720 } as HTMLCanvasElement,
    aspect: 1,
    loop: vi.fn((draw: () => void) => {
      loopCallback = draw;
      return stopLoop;
    }),
    drawTo: vi.fn((_target, draw: () => void) => draw()),
    destroy: vi.fn(),
  };
  brometal.createRenderer.mockResolvedValue(renderer);
  brometal.createProgram
    .mockReturnValueOnce(surfaceProgram)
    .mockReturnValueOnce(presentationProgram);
  brometal.createRenderTarget.mockImplementation((_renderer, options) => {
    const target = {
      width: options.width,
      height: options.height,
      texture: Object.freeze({ width: options.width, height: options.height }),
      dispose: vi.fn(),
    };
    targets.push(target);
    return target;
  });
  return {
    surfaceAttributes,
    surfaceUniforms,
    surfaceProgram,
    presentationAttributes,
    presentationUniforms,
    presentationProgram,
    targets,
    renderer,
    stopLoop,
    drawFrame(): void {
      if (loopCallback === null) throw new Error('Renderer loop was not installed');
      loopCallback();
    },
  };
}

describe('greedy mesh BroMetal factory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads every geometry stream once and only changes uniforms while framing', async () => {
    const doubles = createDoubles();
    const approach = await createMeshApproach({
      canvas: {} as HTMLCanvasElement,
      scene: scene(),
      initialStyle: 'physical',
      onError: vi.fn(),
    });

    expect(doubles.surfaceAttributes.aPosition.set).toHaveBeenCalledTimes(1);
    expect(doubles.surfaceAttributes.aNormal.set).toHaveBeenCalledTimes(1);
    expect(doubles.surfaceAttributes.aColor.set).toHaveBeenCalledTimes(1);
    expect(doubles.surfaceAttributes.aMaterial.set).toHaveBeenCalledTimes(1);
    expect(doubles.surfaceAttributes.aEmissive.set).toHaveBeenCalledTimes(1);
    expect(doubles.surfaceAttributes.aAo.set).toHaveBeenCalledTimes(1);
    expect(doubles.surfaceProgram.setIndices).toHaveBeenCalledTimes(1);
    expect(doubles.presentationAttributes.aPosition.set).toHaveBeenCalledTimes(1);
    expect(doubles.presentationProgram.setIndices).toHaveBeenCalledTimes(1);

    approach.frame(1, camera, 'physical');
    doubles.drawFrame();
    approach.frame(2, camera, 'graphic');
    doubles.drawFrame();

    for (const attribute of Object.values(doubles.surfaceAttributes)) {
      expect(attribute.set).toHaveBeenCalledTimes(1);
    }
    expect(doubles.surfaceProgram.setIndices).toHaveBeenCalledTimes(1);
    expect(doubles.surfaceUniforms.uViewProjection.set).toHaveBeenCalledTimes(2);
    expect(doubles.surfaceUniforms.uCameraPosition.set).toHaveBeenCalledTimes(2);
    expect(doubles.surfaceUniforms.uCameraForward.set).toHaveBeenCalledTimes(2);
    expect(doubles.surfaceUniforms.uStylized.set).toHaveBeenLastCalledWith(1);
    expect(doubles.surfaceProgram.draw).toHaveBeenCalledTimes(3);
    expect(doubles.presentationProgram.draw).toHaveBeenCalledTimes(2);
    expect(doubles.renderer.drawTo).toHaveBeenCalledTimes(3);

    expect(approach.stats()).toMatchObject({
      approach: 'mesh',
      implementation: 'shadowed AO greedy mesh + cinematic HDR',
      voxels: 1,
      primitives: 12,
      drawCalls: 2,
      uploadBytesPerFrame: 288,
    });
    expect(approach.stats().oneTimeBytes).toBeGreaterThan(0);
    expect(approach.stats().detail).toMatch(/soft sun shadow/);
    expect(approach.stats().detail).toMatch(/graphic grade/);
  });

  it('does not upload or draw nonexistent geometry for an empty scene', async () => {
    const doubles = createDoubles();
    const approach = await createMeshApproach({
      canvas: {} as HTMLCanvasElement,
      scene: scene(true),
      initialStyle: 'physical',
      onError: vi.fn(),
    });

    for (const attribute of Object.values(doubles.surfaceAttributes)) {
      expect(attribute.set).not.toHaveBeenCalled();
    }
    expect(doubles.surfaceProgram.setIndices).not.toHaveBeenCalled();
    approach.frame(0, camera, 'physical');
    doubles.drawFrame();
    expect(doubles.surfaceProgram.draw).not.toHaveBeenCalled();
    expect(doubles.presentationProgram.draw).toHaveBeenCalledOnce();
    expect(approach.stats()).toMatchObject({
      primitives: 0,
      drawCalls: 1,
      uploadBytesPerFrame: 288,
    });
    expect(approach.stats().oneTimeBytes).toBeGreaterThan(0);
  });

  it('forwards asynchronous GPU faults and disposes resources exactly once', async () => {
    const doubles = createDoubles();
    const onError = vi.fn();
    const approach = await createMeshApproach({
      canvas: {} as HTMLCanvasElement,
      scene: scene(),
      initialStyle: 'physical',
      onError,
    });
    const rendererOptions = brometal.createRenderer.mock.calls[0]![1]!;
    rendererOptions.onError?.('device disappeared' as never);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));

    approach.dispose();
    approach.dispose();
    approach.frame(3, camera, 'graphic');
    doubles.drawFrame();
    expect(doubles.stopLoop).toHaveBeenCalledOnce();
    expect(doubles.surfaceProgram.dispose).toHaveBeenCalledOnce();
    expect(doubles.presentationProgram.dispose).toHaveBeenCalledOnce();
    expect(doubles.targets).toHaveLength(1);
    for (const target of doubles.targets) expect(target.dispose).toHaveBeenCalledOnce();
    expect(doubles.renderer.destroy).toHaveBeenCalledOnce();
    expect(doubles.surfaceProgram.draw).not.toHaveBeenCalled();
  });

  it('destroys a renderer when program construction fails', async () => {
    const doubles = createDoubles();
    brometal.createProgram.mockReset();
    brometal.createProgram.mockImplementation(() => {
      throw new Error('pipeline rejected');
    });

    await expect(createMeshApproach({
      canvas: {} as HTMLCanvasElement,
      scene: scene(),
      initialStyle: 'physical',
      onError: vi.fn(),
    })).rejects.toThrow('pipeline rejected');
    expect(doubles.renderer.destroy).toHaveBeenCalledOnce();
  });
});
