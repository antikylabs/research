import {
  createProgram,
  createRenderer,
  type BroMetalProgram,
  type Renderer,
} from 'brometal';

import type {
  ApproachFactory,
  PresentationStyle,
  RenderStats,
  VoxelApproach,
} from '../../render/types.ts';
import type { CameraSnapshot } from '../../camera/types.ts';
import { buildFaceInstances, SHARED_FACE_QUAD } from './surface.ts';
import voxelInstancesShader from './voxel-instances.shader.gen.ts';

const SUN_DIRECTION = Object.freeze([0.46, 0.82, 0.34] as const);
const SUN_COLOR = Object.freeze([2.1, 1.62, 0.98] as const);
const SKY_COLOR = Object.freeze([0.2, 0.34, 0.66] as const);
const GROUND_COLOR = Object.freeze([0.075, 0.045, 0.07] as const);
const FOG_COLOR = Object.freeze([0.025, 0.06, 0.13] as const);
const CLEAR_COLOR = Object.freeze([0.012, 0.016, 0.03, 1] as const);

type InstanceProgram = BroMetalProgram<
  (typeof voxelInstancesShader)['attributes'],
  (typeof voxelInstancesShader)['instanceAttributes'],
  (typeof voxelInstancesShader)['uniforms']
>;

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function sceneDiagonal(dimensions: readonly [number, number, number]): number {
  return Math.max(1, Math.hypot(dimensions[0], dimensions[1], dimensions[2]));
}

function uploadImmutableInstances(program: InstanceProgram, scene: Parameters<typeof buildFaceInstances>[0]) {
  const build = buildFaceInstances(scene);
  program.attributes.aPosition.set(SHARED_FACE_QUAD.positions);
  program.attributes.aCorner.set(SHARED_FACE_QUAD.cornerCodes);
  program.setIndices(SHARED_FACE_QUAD.indices);
  if (build.receipt.exposedFaces > 0) {
    program.instanceAttributes.iPosition.set(build.positions);
    program.instanceAttributes.iFace.set(build.faceCodes);
    program.instanceAttributes.iColorRoughness.set(build.colorRoughness);
    program.instanceAttributes.iMaterialPalette.set(build.materialPalette);
    program.instanceAttributes.iAo.set(build.cornerAo);
  }
  return build;
}

/**
 * Exposed-face raster approach. `frame` publishes the host's latest snapshot to BroMetal's public
 * render loop; this owns one renderer, one program, immutable buffers, and deterministic teardown.
 */
export const createInstancesApproach: ApproachFactory = async (options): Promise<VoxelApproach> => {
  let renderer: Renderer | null = null;
  let program: InstanceProgram | null = null;
  try {
    renderer = await createRenderer(options.canvas, {
      clearColor: CLEAR_COLOR,
      cull: 'back',
      onError: (error) => options.onError(asError(error)),
    });
    program = createProgram(renderer, voxelInstancesShader);
    const build = uploadImmutableInstances(program, options.scene);
    const diagonal = sceneDiagonal(options.scene.dimensions);
    program.uniforms.uSunDirection.set(SUN_DIRECTION);
    program.uniforms.uSunColor.set(SUN_COLOR);
    program.uniforms.uSkyColor.set(SKY_COLOR);
    program.uniforms.uGroundColor.set(GROUND_COLOR);
    program.uniforms.uFogColor.set(FOG_COLOR);
    program.uniforms.uFogNear.set(diagonal * 1.25);
    program.uniforms.uFogFar.set(diagonal * 3.5);

    const ownedRenderer = renderer;
    const ownedProgram = program;
    const drawCalls = build.receipt.exposedFaces === 0 ? 0 : 1;
    const uniformBytesPerDraw = voxelInstancesShader.layout.uniformBlockSize;
    let disposed = false;
    let currentStyle: PresentationStyle = options.initialStyle;
    let pendingFrame: Readonly<{
      elapsedSeconds: number;
      camera: CameraSnapshot;
      style: PresentationStyle;
    }> | null = null;

    const stopLoop = ownedRenderer.loop(() => {
      if (disposed || pendingFrame === null) return;
      const { elapsedSeconds, camera, style } = pendingFrame;
      if (drawCalls === 0) return;
      ownedProgram.uniforms.uViewProjection.set(camera.viewProjection);
      ownedProgram.uniforms.uViewPosition.set(camera.position);
      ownedProgram.uniforms.uStyle.set(style === 'graphic' ? 1 : 0);
      ownedProgram.uniforms.uTime.set(elapsedSeconds);
      ownedProgram.draw();
    });

    const stats = (): RenderStats => Object.freeze({
      approach: 'instances',
      implementation: 'exposed-face quad instances',
      voxels: build.receipt.voxelCount,
      primitives: build.receipt.triangles,
      drawCalls,
      oneTimeBytes: build.receipt.oneTimeBytes,
      uploadBytesPerFrame: drawCalls * uniformBytesPerDraw,
      detail: `${build.receipt.exposedFaces.toLocaleString()} exposed faces · ${build.receipt.culledFaces.toLocaleString()} internal faces removed · ${currentStyle} lighting · receipt ${build.receipt.fingerprint}`,
    });

    return Object.freeze({
      frame(elapsedSeconds, camera, style): void {
        if (disposed) return;
        currentStyle = style;
        pendingFrame = Object.freeze({ elapsedSeconds, camera, style });
      },
      stats,
      dispose(): void {
        if (disposed) return;
        disposed = true;
        stopLoop();
        try {
          ownedProgram.dispose();
        } finally {
          ownedRenderer.destroy();
        }
      },
    });
  } catch (error) {
    try {
      program?.dispose();
    } finally {
      renderer?.destroy();
    }
    throw asError(error);
  }
};

export const createInstanceApproach = createInstancesApproach;

export default createInstancesApproach;
