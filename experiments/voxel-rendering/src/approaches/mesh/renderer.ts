import {
  createPlane,
  createProgram,
  createRenderer,
  createRenderTarget,
  type BroMetalProgram,
  type Renderer,
  type RenderTarget,
} from 'brometal';

import type { CameraSnapshot } from '../../camera/types.ts';
import {
  cameraFocusDistance,
  createSunViewProjection,
} from '../../render/cinematic.ts';
import cinematicPresentShader from '../../render/cinematic-present.shader.gen.ts';
import type {
  ApproachFactory,
  PresentationStyle,
  RenderStats,
  VoxelApproach,
} from '../../render/types.ts';
import { compileGreedyMesh } from './greedy-mesh.ts';
import meshSurfaceShader from './mesh-surface.shader.gen.ts';

const CLEAR_COLOR = Object.freeze([0, 0, 0, 1] as const);
const SUN_DIRECTION = Object.freeze([-0.57, 0.63, 0.53] as const);
const SUN_COLOR = Object.freeze([1, 0.46, 0.19] as const);
const SKY_COLOR = Object.freeze([0.075, 0.17, 0.31] as const);
const GROUND_COLOR = Object.freeze([0.13, 0.055, 0.026] as const);
const FOG_COLOR = Object.freeze([0.17, 0.07, 0.055] as const);
const SHADOW_SIZE = 1536;
const TARGET_BYTES_PER_PIXEL = 12;

type MeshProgram = BroMetalProgram<
  (typeof meshSurfaceShader)['attributes'],
  (typeof meshSurfaceShader)['instanceAttributes'],
  (typeof meshSurfaceShader)['uniforms']
>;

type PresentationProgram = BroMetalProgram<
  (typeof cinematicPresentShader)['attributes'],
  (typeof cinematicPresentShader)['instanceAttributes'],
  (typeof cinematicPresentShader)['uniforms']
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

/** AO-aware greedy rasterizer with a static sun shadow and cinematic HDR presentation pass. */
export const createMeshApproach: ApproachFactory = async (options): Promise<VoxelApproach> => {
  let renderer: Renderer | null = null;
  let surfaceProgram: MeshProgram | null = null;
  let presentationProgram: PresentationProgram | null = null;
  let shadowTarget: RenderTarget | null = null;
  let sceneTarget: RenderTarget | null = null;
  let stopLoop: (() => void) | null = null;
  try {
    renderer = await createRenderer(options.canvas, {
      antialias: false,
      clearColor: CLEAR_COLOR,
      cull: 'back',
      onError: (error) => options.onError(asError(error)),
    });
    surfaceProgram = createProgram(renderer, meshSurfaceShader);
    presentationProgram = createProgram(renderer, cinematicPresentShader);
    shadowTarget = createRenderTarget(renderer, { width: SHADOW_SIZE, height: SHADOW_SIZE, depth: true });
    const mesh = compileGreedyMesh(options.scene);
    uploadImmutableGeometry(surfaceProgram, mesh);
    const fullscreen = createPlane({ width: 2, height: 2 });
    presentationProgram.attributes.aPosition.set(fullscreen.positions);
    presentationProgram.setIndices(fullscreen.indices);

    const diagonal = sceneDiagonal(options.scene.dimensions);
    surfaceProgram.uniforms.uLightViewProjection.set(createSunViewProjection(options.scene, SUN_DIRECTION));
    surfaceProgram.uniforms.uSunDirection.set(SUN_DIRECTION);
    surfaceProgram.uniforms.uSunColor.set(SUN_COLOR);
    surfaceProgram.uniforms.uSunIntensity.set(4.8);
    surfaceProgram.uniforms.uSkyColor.set(SKY_COLOR);
    surfaceProgram.uniforms.uGroundColor.set(GROUND_COLOR);
    surfaceProgram.uniforms.uAmbientIntensity.set(0.56);
    surfaceProgram.uniforms.uFogColor.set(FOG_COLOR);
    surfaceProgram.uniforms.uFogDensity.set(0.2 / diagonal);
    surfaceProgram.uniforms.uShadowTexel.set([1 / SHADOW_SIZE, 1 / SHADOW_SIZE]);

    const ownedRenderer = renderer;
    const ownedSurface = surfaceProgram;
    const ownedPresentation = presentationProgram;
    const ownedShadow = shadowTarget;
    const hasGeometry = mesh.receipt.indices > 0;
    const uniformBytesPerFrame = meshSurfaceShader.layout.uniformBlockSize
      + cinematicPresentShader.layout.uniformBlockSize;
    let disposed = false;
    let shadowReady = false;
    let currentStyle: PresentationStyle = options.initialStyle;
    let currentCamera: CameraSnapshot | null = null;

    const ensureSceneTarget = (): RenderTarget => {
      const width = Math.max(1, ownedRenderer.canvas.width);
      const height = Math.max(1, ownedRenderer.canvas.height);
      if (sceneTarget !== null && sceneTarget.width === width && sceneTarget.height === height) {
        return sceneTarget;
      }
      const replacement = createRenderTarget(ownedRenderer, { width, height, depth: true });
      sceneTarget?.dispose();
      sceneTarget = replacement;
      return replacement;
    };

    stopLoop = ownedRenderer.loop(() => {
      if (disposed || currentCamera === null) return;
      const target = ensureSceneTarget();
      if (hasGeometry && !shadowReady) {
        ownedSurface.uniforms.uShadowMap.set(target.texture);
        ownedSurface.uniforms.uShadowPass.set(1);
        ownedRenderer.drawTo(
          ownedShadow,
          () => ownedSurface.draw(),
          { clear: [1, 1, 1, 1] },
        );
        shadowReady = true;
      }
      if (hasGeometry) {
        ownedSurface.uniforms.uViewProjection.set(currentCamera.viewProjection);
        ownedSurface.uniforms.uCameraPosition.set(currentCamera.position);
        ownedSurface.uniforms.uCameraForward.set(currentCamera.forward);
        ownedSurface.uniforms.uShadowMap.set(ownedShadow.texture);
        ownedSurface.uniforms.uShadowPass.set(0);
        ownedSurface.uniforms.uStylized.set(currentStyle === 'graphic' ? 1 : 0);
        ownedRenderer.drawTo(target, () => ownedSurface.draw(), { clear: [0, 0, 0, 0] });
      } else {
        ownedRenderer.drawTo(target, () => {}, { clear: [0, 0, 0, 0] });
      }
      ownedPresentation.uniforms.uScene.set(target.texture);
      ownedPresentation.uniforms.uResolution.set([target.width, target.height]);
      ownedPresentation.uniforms.uFocusDistance.set(cameraFocusDistance(currentCamera));
      ownedPresentation.uniforms.uFocusRange.set(currentStyle === 'graphic' ? 15 : 14);
      ownedPresentation.uniforms.uAperture.set(currentStyle === 'graphic' ? 0.55 : 0.8);
      ownedPresentation.uniforms.uExposure.set(currentStyle === 'graphic' ? 1.12 : 1.15);
      ownedPresentation.uniforms.uStylized.set(currentStyle === 'graphic' ? 1 : 0);
      ownedPresentation.draw();
    });
    const ownedStopLoop = stopLoop;

    const stats = (): RenderStats => {
      const targetBytes = (sceneTarget?.width ?? 0) * (sceneTarget?.height ?? 0) * TARGET_BYTES_PER_PIXEL;
      return Object.freeze({
        approach: 'mesh',
        implementation: 'shadowed AO greedy mesh + cinematic HDR',
        voxels: mesh.receipt.voxels,
        primitives: mesh.receipt.triangles,
        drawCalls: hasGeometry ? 2 : 1,
        oneTimeBytes: mesh.receipt.bufferBytes
          + targetBytes
          + SHADOW_SIZE * SHADOW_SIZE * TARGET_BYTES_PER_PIXEL,
        uploadBytesPerFrame: uniformBytesPerFrame,
        detail: `${mesh.receipt.quads.toLocaleString()} greedy quads · ${mesh.receipt.exposedUnitFaces.toLocaleString()} exposed faces · 1536² soft sun shadow · HDR bloom + depth of field · ${currentStyle} grade · receipt ${mesh.receipt.fingerprint}`,
      });
    };

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
          sceneTarget?.dispose();
          ownedShadow.dispose();
          ownedPresentation.dispose();
          ownedSurface.dispose();
        } finally {
          ownedRenderer.destroy();
        }
      },
    });
  } catch (error) {
    try {
      stopLoop?.();
      shadowTarget?.dispose();
      presentationProgram?.dispose();
      surfaceProgram?.dispose();
    } finally {
      renderer?.destroy();
    }
    throw asError(error);
  }
};

export default createMeshApproach;
