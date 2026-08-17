import {
  createProgram,
  createRenderer,
  type BroMetalProgram,
  type Renderer,
} from 'brometal';

import type { CameraSnapshot } from '../../camera/types.ts';
import type {
  ApproachFactory,
  PresentationStyle,
  RenderStats,
  VoxelApproach,
} from '../../render/types.ts';
import { compileGreedyMesh } from './greedy-mesh.ts';
import meshSurfaceShader from './mesh-surface.shader.gen.ts';

const CLEAR_COLOR = Object.freeze([0.008, 0.012, 0.025, 1] as const);
const SUN_DIRECTION = Object.freeze([0.46, 0.82, 0.34] as const);
const SUN_COLOR = Object.freeze([1, 0.79, 0.57] as const);
const SKY_COLOR = Object.freeze([0.18, 0.34, 0.7] as const);
const GROUND_COLOR = Object.freeze([0.16, 0.065, 0.035] as const);
const FOG_COLOR = Object.freeze([0.018, 0.042, 0.095] as const);

type MeshProgram = BroMetalProgram<
  (typeof meshSurfaceShader)['attributes'],
  (typeof meshSurfaceShader)['instanceAttributes'],
  (typeof meshSurfaceShader)['uniforms']
>;

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function sceneDiagonal(dimensions: readonly [number, number, number]): number {
  return Math.max(1, Math.hypot(dimensions[0], dimensions[1], dimensions[2]));
}

function uploadImmutableGeometry(program: MeshProgram, mesh: ReturnType<typeof compileGreedyMesh>): void {
  if (mesh.receipt.indices === 0) return;
  program.attributes.aPosition.set(mesh.positions);
  program.attributes.aNormal.set(mesh.normals);
  program.attributes.aColor.set(mesh.colors);
  program.attributes.aMaterial.set(mesh.materials);
  program.attributes.aEmissive.set(mesh.emissive);
  program.attributes.aAo.set(mesh.ao);
  program.setIndices(mesh.indices);
}

/**
 * AO-aware greedy surface rasterizer. Geometry is compiled and uploaded during
 * construction. The shared frame boundary publishes state for the official
 * BroMetal loop, whose draws update only the uniform block.
 */
export const createMeshApproach: ApproachFactory = async (options): Promise<VoxelApproach> => {
  let renderer: Renderer | null = null;
  let program: MeshProgram | null = null;
  let stopLoop: (() => void) | null = null;
  try {
    renderer = await createRenderer(options.canvas, {
      clearColor: CLEAR_COLOR,
      cull: 'back',
      onError: (error) => options.onError(asError(error)),
    });
    program = createProgram(renderer, meshSurfaceShader);
    const mesh = compileGreedyMesh(options.scene);
    uploadImmutableGeometry(program, mesh);

    const diagonal = sceneDiagonal(options.scene.dimensions);
    program.uniforms.uSunDirection.set(SUN_DIRECTION);
    program.uniforms.uSunColor.set(SUN_COLOR);
    program.uniforms.uSunIntensity.set(4.8);
    program.uniforms.uSkyColor.set(SKY_COLOR);
    program.uniforms.uGroundColor.set(GROUND_COLOR);
    program.uniforms.uAmbientIntensity.set(0.72);
    program.uniforms.uFogColor.set(FOG_COLOR);
    program.uniforms.uFogDensity.set(0.5 / diagonal);
    program.uniforms.uExposure.set(1.18);
    program.uniforms.uGraphic.set(options.initialStyle === 'graphic' ? 1 : 0);

    const ownedRenderer = renderer;
    const ownedProgram = program;
    const drawCalls = mesh.receipt.indices === 0 ? 0 : 1;
    const uniformBytesPerDraw = meshSurfaceShader.layout.uniformBlockSize;
    let disposed = false;
    let currentStyle: PresentationStyle = options.initialStyle;
    let currentCamera: CameraSnapshot | null = null;

    stopLoop = ownedRenderer.loop(() => {
      if (disposed || drawCalls === 0 || currentCamera === null) return;
      ownedProgram.uniforms.uViewProjection.set(currentCamera.viewProjection);
      ownedProgram.uniforms.uCameraPosition.set(currentCamera.position);
      ownedProgram.uniforms.uGraphic.set(currentStyle === 'graphic' ? 1 : 0);
      ownedProgram.draw();
    });
    const ownedStopLoop = stopLoop;

    const stats = (): RenderStats => Object.freeze({
      approach: 'mesh',
      implementation: 'AO-aware greedy surface mesh',
      voxels: mesh.receipt.voxels,
      primitives: mesh.receipt.triangles,
      drawCalls,
      oneTimeBytes: mesh.receipt.bufferBytes,
      uploadBytesPerFrame: drawCalls * uniformBytesPerDraw,
      detail: `${mesh.receipt.quads.toLocaleString()} greedy quads from ${mesh.receipt.exposedUnitFaces.toLocaleString()} exposed faces · ${mesh.receipt.culledInternalFaces.toLocaleString()} internal faces removed · 0 B/frame geometry · ${currentStyle} lighting · receipt ${mesh.receipt.fingerprint}`,
    });

    return Object.freeze({
      frame(_elapsedSeconds, camera, style): void {
        if (disposed) return;
        currentCamera = camera;
        currentStyle = style;
      },
      stats,
      dispose(): void {
        if (disposed) return;
        disposed = true;
        ownedStopLoop();
        try {
          ownedProgram.dispose();
        } finally {
          ownedRenderer.destroy();
        }
      },
    });
  } catch (error) {
    try {
      stopLoop?.();
      program?.dispose();
    } finally {
      renderer?.destroy();
    }
    throw asError(error);
  }
};

export default createMeshApproach;
