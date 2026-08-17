import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CameraSnapshot } from '../../camera/types.ts';
import type { Vec3Tuple, VoxelMaterial, VoxelScene } from '../../scene/types.ts';

const brometal = vi.hoisted(() => ({
  createProgram: vi.fn(),
  createRenderer: vi.fn(),
}));

vi.mock('brometal', async (importOriginal) => ({
  ...await importOriginal<typeof import('brometal')>(),
  createProgram: brometal.createProgram,
  createRenderer: brometal.createRenderer,
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
  const dimensions: Vec3Tuple = empty ? [0, 0, 0] : [1, 1, 1];
  const maximum: Vec3Tuple = empty ? [0, 0, 0] : [1, 1, 1];
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
  const attributes = {
    aPosition: { set: set() },
    aNormal: { set: set() },
    aColor: { set: set() },
    aMaterial: { set: set() },
    aEmissive: { set: set() },
    aAo: { set: set() },
  };
  const uniforms = {
    uViewProjection: { set: set() },
    uCameraPosition: { set: set() },
    uSunDirection: { set: set() },
    uSunColor: { set: set() },
    uSunIntensity: { set: set() },
    uSkyColor: { set: set() },
    uGroundColor: { set: set() },
    uAmbientIntensity: { set: set() },
    uFogColor: { set: set() },
    uFogDensity: { set: set() },
    uExposure: { set: set() },
    uGraphic: { set: set() },
  };
  const program = {
    attributes,
    instanceAttributes: {},
    uniforms,
    setIndices: vi.fn(),
    draw: vi.fn(),
    dispatch: vi.fn(),
    dispose: vi.fn(),
  };
  const renderer = {
    backend: 'webgpu',
    canvas: {} as HTMLCanvasElement,
    aspect: 1,
    loop: vi.fn((draw: () => void) => {
      loopCallback = draw;
      return stopLoop;
    }),
    drawTo: vi.fn(),
    destroy: vi.fn(),
  };
  brometal.createRenderer.mockResolvedValue(renderer);
  brometal.createProgram.mockReturnValue(program);
  return {
    attributes,
    uniforms,
    program,
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

    expect(doubles.attributes.aPosition.set).toHaveBeenCalledTimes(1);
    expect(doubles.attributes.aNormal.set).toHaveBeenCalledTimes(1);
    expect(doubles.attributes.aColor.set).toHaveBeenCalledTimes(1);
    expect(doubles.attributes.aMaterial.set).toHaveBeenCalledTimes(1);
    expect(doubles.attributes.aEmissive.set).toHaveBeenCalledTimes(1);
    expect(doubles.attributes.aAo.set).toHaveBeenCalledTimes(1);
    expect(doubles.program.setIndices).toHaveBeenCalledTimes(1);

    approach.frame(1, camera, 'physical');
    doubles.drawFrame();
    approach.frame(2, camera, 'graphic');
    doubles.drawFrame();

    for (const attribute of Object.values(doubles.attributes)) {
      expect(attribute.set).toHaveBeenCalledTimes(1);
    }
    expect(doubles.program.setIndices).toHaveBeenCalledTimes(1);
    expect(doubles.uniforms.uViewProjection.set).toHaveBeenCalledTimes(2);
    expect(doubles.uniforms.uCameraPosition.set).toHaveBeenCalledTimes(2);
    expect(doubles.uniforms.uGraphic.set).toHaveBeenLastCalledWith(1);
    expect(doubles.program.draw).toHaveBeenCalledTimes(2);

    expect(approach.stats()).toMatchObject({
      approach: 'mesh',
      implementation: 'AO-aware greedy surface mesh',
      voxels: 1,
      primitives: 12,
      drawCalls: 1,
      uploadBytesPerFrame: 176,
    });
    expect(approach.stats().oneTimeBytes).toBeGreaterThan(0);
    expect(approach.stats().detail).toMatch(/0 B\/frame geometry/);
    expect(approach.stats().detail).toMatch(/graphic lighting/);
  });

  it('does not upload or draw nonexistent geometry for an empty scene', async () => {
    const doubles = createDoubles();
    const approach = await createMeshApproach({
      canvas: {} as HTMLCanvasElement,
      scene: scene(true),
      initialStyle: 'physical',
      onError: vi.fn(),
    });

    for (const attribute of Object.values(doubles.attributes)) {
      expect(attribute.set).not.toHaveBeenCalled();
    }
    expect(doubles.program.setIndices).not.toHaveBeenCalled();
    approach.frame(0, camera, 'physical');
    doubles.drawFrame();
    expect(doubles.program.draw).not.toHaveBeenCalled();
    expect(approach.stats()).toMatchObject({
      primitives: 0,
      drawCalls: 0,
      oneTimeBytes: 0,
      uploadBytesPerFrame: 0,
    });
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
    expect(doubles.program.dispose).toHaveBeenCalledOnce();
    expect(doubles.renderer.destroy).toHaveBeenCalledOnce();
    expect(doubles.program.draw).not.toHaveBeenCalled();
  });

  it('destroys a renderer when program construction fails', async () => {
    const doubles = createDoubles();
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
