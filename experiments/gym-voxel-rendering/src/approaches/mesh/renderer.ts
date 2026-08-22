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
  createSunViewProjection,
} from '../../render/cinematic.ts';
import { createLightingState } from '../../render/lighting.ts';
import cinematicPresentShader from '../../render/cinematic-present.shader.gen.ts';
import type {
  ApproachFactory,
  RenderStats,
  VoxelApproach,
} from '../../render/types.ts';
import type { RenderSettings } from '../../studio/settings.ts';
import { compileGreedyMesh } from './greedy-mesh.ts';
import meshSurfaceShader from './mesh-surface.shader.gen.ts';

const CLEAR_COLOR = Object.freeze([0, 0, 0, 1] as const);
const SHADOW_SIZE = 1536;
const TARGET_BYTES_PER_PIXEL = 12;
const FOG_DENSITY = 0.00165;

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

function uploadImmutableGeometry(program: MeshProgram, mesh: ReturnType<typeof compileGreedyMesh>): void {
  if (mesh.receipt.indices === 0) return;
  program.attributes.aPosition.set(mesh.positions);
  program.attributes.aNormal.set(mesh.normals);
  program.attributes.aColor.set(mesh.colors);
  program.attributes.aMaterial.set(mesh.materials);
  program.attributes.aEmissive.set(mesh.emissive);
  program.attributes.aWater.set(mesh.water);
  program.attributes.aAo.set(mesh.ao);
  program.setIndices(mesh.indices);
}

/** AO-aware greedy rasterizer with a static sun shadow and cinematic HDR presentation pass. */
export const createMeshApproach: ApproachFactory = async (options): Promise<VoxelApproach> => {
  let renderer: Renderer | null = null;
  let surfaceProgram: MeshProgram | null = null;
  let transparentProgram: MeshProgram | null = null;
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
    transparentProgram = createProgram(renderer, meshSurfaceShader, { blend: 'alpha' });
    presentationProgram = createProgram(renderer, cinematicPresentShader);
    shadowTarget = createRenderTarget(renderer, { width: SHADOW_SIZE, height: SHADOW_SIZE, depth: true });
    const mesh = compileGreedyMesh(options.scene, 'opaque');
    const transparentMesh = compileGreedyMesh(options.scene, 'transmissive');
    uploadImmutableGeometry(surfaceProgram, mesh);
    uploadImmutableGeometry(transparentProgram, transparentMesh);
    const fullscreen = createPlane({ width: 2, height: 2 });
    presentationProgram.attributes.aPosition.set(fullscreen.positions);
    presentationProgram.setIndices(fullscreen.indices);

    surfaceProgram.uniforms.uFogDensity.set(FOG_DENSITY);
    surfaceProgram.uniforms.uShadowTexel.set([1 / SHADOW_SIZE, 1 / SHADOW_SIZE]);
    transparentProgram.uniforms.uFogDensity.set(FOG_DENSITY);
    transparentProgram.uniforms.uShadowTexel.set([1 / SHADOW_SIZE, 1 / SHADOW_SIZE]);

    const ownedRenderer = renderer;
    const ownedSurface = surfaceProgram;
    const ownedTransparent = transparentProgram;
    const ownedPresentation = presentationProgram;
    const ownedShadow = shadowTarget;
    const hasGeometry = mesh.receipt.indices > 0;
    const hasTransparent = transparentMesh.receipt.indices > 0;
    const uniformBytesPerFrame = meshSurfaceShader.layout.uniformBlockSize
      * (hasTransparent ? 2 : 1)
      + cinematicPresentShader.layout.uniformBlockSize;
    let disposed = false;
    let shadowKey = '';
    let currentSettings: RenderSettings = options.initialSettings;
    let currentCamera: CameraSnapshot | null = null;
    let currentElapsedSeconds = 0;

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
      const lighting = createLightingState(
        currentSettings.lighting.timeOfDay,
        currentSettings.lighting.moonEnabled,
      );
      const primaryDirection = lighting.sunIntensity > 0.001
        ? lighting.sunDirection
        : lighting.moonDirection;
      const lightViewProjection = createSunViewProjection(options.scene, primaryDirection);
      for (const program of [ownedSurface, ownedTransparent]) {
        program.uniforms.uLightViewProjection.set(lightViewProjection);
        program.uniforms.uSunDirection.set(lighting.sunDirection);
        program.uniforms.uSunColor.set(lighting.sunColor);
        program.uniforms.uSunIntensity.set(lighting.sunIntensity);
        program.uniforms.uMoonDirection.set(lighting.moonDirection);
        program.uniforms.uMoonColor.set(lighting.moonColor);
        program.uniforms.uMoonIntensity.set(lighting.moonIntensity);
        program.uniforms.uSkyColor.set(lighting.skyColor);
        program.uniforms.uGroundColor.set(lighting.groundColor);
        program.uniforms.uAmbientIntensity.set(lighting.ambientIntensity);
        program.uniforms.uFogColor.set(lighting.fogColor);
      }
      if (hasGeometry && shadowKey !== lighting.key) {
        ownedSurface.uniforms.uShadowMap.set(target.texture);
        ownedSurface.uniforms.uShadowPass.set(1);
        ownedSurface.uniforms.uTransparentPass.set(0);
        ownedRenderer.drawTo(
          ownedShadow,
          () => ownedSurface.draw(),
          { clear: [1, 1, 1, 1] },
        );
        shadowKey = lighting.key;
      }
      for (const [program, transparent] of [
        [ownedSurface, false],
        [ownedTransparent, true],
      ] as const) {
        program.uniforms.uViewProjection.set(currentCamera.viewProjection);
        program.uniforms.uCameraPosition.set(currentCamera.position);
        program.uniforms.uCameraForward.set(currentCamera.forward);
        program.uniforms.uShadowMap.set(ownedShadow.texture);
        program.uniforms.uShadowPass.set(0);
        program.uniforms.uTransparentPass.set(Number(transparent));
        program.uniforms.uStylized.set(currentSettings.style === 'graphic' ? 1 : 0);
        program.uniforms.uMaterialVariation.set(currentSettings.materialVariation);
        program.uniforms.uTime.set(currentElapsedSeconds);
      }
      ownedRenderer.drawTo(target, () => {
        if (hasGeometry) ownedSurface.draw();
        if (hasTransparent) ownedTransparent.draw();
      }, { clear: [0, 0, 0, 0] });
      ownedPresentation.uniforms.uScene.set(target.texture);
      ownedPresentation.uniforms.uResolution.set([target.width, target.height]);
      ownedPresentation.uniforms.uFocusDistance.set(currentSettings.depthOfField.focusDistance);
      ownedPresentation.uniforms.uFocusRange.set(
        Math.max(1, currentSettings.depthOfField.focusDistance * 0.08),
      );
      ownedPresentation.uniforms.uAperture.set(currentSettings.depthOfField.aperture);
      ownedPresentation.uniforms.uDofEnabled.set(Number(currentSettings.depthOfField.enabled));
      ownedPresentation.uniforms.uExposure.set(currentSettings.exposure);
      ownedPresentation.uniforms.uStylized.set(currentSettings.style === 'graphic' ? 1 : 0);
      ownedPresentation.uniforms.uFinalColorGrade.set(Number(currentSettings.finalColorGrade));
      ownedPresentation.uniforms.uSkyColor.set(lighting.skyColor);
      ownedPresentation.uniforms.uFogColor.set(lighting.fogColor);
      ownedPresentation.uniforms.uSunDirection.set(lighting.sunDirection);
      ownedPresentation.uniforms.uSunColor.set(lighting.sunColor);
      ownedPresentation.uniforms.uSunIntensity.set(lighting.sunIntensity);
      ownedPresentation.uniforms.uMoonDirection.set(lighting.moonDirection);
      ownedPresentation.uniforms.uMoonColor.set(lighting.moonColor);
      ownedPresentation.uniforms.uMoonIntensity.set(lighting.moonIntensity);
      ownedPresentation.uniforms.uCameraForward.set(currentCamera.forward);
      ownedPresentation.uniforms.uCameraRight.set(currentCamera.right);
      ownedPresentation.uniforms.uCameraUp.set(currentCamera.up);
      ownedPresentation.uniforms.uTanHalfFov.set(Math.tan(currentCamera.verticalFovRadians * 0.5));
      ownedPresentation.draw();
    });
    const ownedStopLoop = stopLoop;

    const stats = (): RenderStats => {
      const targetBytes = (sceneTarget?.width ?? 0) * (sceneTarget?.height ?? 0) * TARGET_BYTES_PER_PIXEL;
      return Object.freeze({
        approach: 'mesh',
        implementation: 'shadowed AO greedy mesh + cinematic HDR',
        voxels: mesh.receipt.voxels,
        primitives: mesh.receipt.triangles + transparentMesh.receipt.triangles,
        drawCalls: Number(hasGeometry) + Number(hasTransparent) + 1,
        oneTimeBytes: mesh.receipt.bufferBytes + transparentMesh.receipt.bufferBytes
          + targetBytes
          + SHADOW_SIZE * SHADOW_SIZE * TARGET_BYTES_PER_PIXEL,
        uploadBytesPerFrame: uniformBytesPerFrame,
        detail: `${mesh.receipt.quads.toLocaleString()} opaque + ${transparentMesh.receipt.quads.toLocaleString()} transmissive quads · alpha water/glass · 1536² relightable shadow · ${currentSettings.depthOfField.enabled ? 'DoF on' : 'DoF off'} · ${currentSettings.style} materials · ${currentSettings.lighting.timeOfDay.toFixed(2)}h · receipts ${mesh.receipt.fingerprint}/${transparentMesh.receipt.fingerprint}`,
      });
    };

    return Object.freeze({
      frame(elapsedSeconds, camera, settings): void {
        if (disposed) return;
        currentCamera = camera;
        currentSettings = settings;
        currentElapsedSeconds = elapsedSeconds;
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
          ownedTransparent.dispose();
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
      transparentProgram?.dispose();
      surfaceProgram?.dispose();
    } finally {
      renderer?.destroy();
    }
    throw asError(error);
  }
};

export default createMeshApproach;
