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
import { buildFaceInstances, SHARED_FACE_QUAD } from './surface.ts';
import voxelInstancesShader from './voxel-instances.shader.gen.ts';

const CLEAR_COLOR = Object.freeze([0, 0, 0, 1] as const);
const SHADOW_SIZE = 1536;
const TARGET_BYTES_PER_PIXEL = 12;
const FOG_NEAR = 105;
const FOG_FAR = 360;

type InstanceProgram = BroMetalProgram<
  (typeof voxelInstancesShader)['attributes'],
  (typeof voxelInstancesShader)['instanceAttributes'],
  (typeof voxelInstancesShader)['uniforms']
>;

type PresentationProgram = BroMetalProgram<
  (typeof cinematicPresentShader)['attributes'],
  (typeof cinematicPresentShader)['instanceAttributes'],
  (typeof cinematicPresentShader)['uniforms']
>;

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function uploadImmutableInstances(
  program: InstanceProgram,
  scene: Parameters<typeof buildFaceInstances>[0],
  pass: Parameters<typeof buildFaceInstances>[1],
) {
  const build = buildFaceInstances(scene, pass);
  program.attributes.aPosition.set(SHARED_FACE_QUAD.positions);
  program.attributes.aCorner.set(SHARED_FACE_QUAD.cornerCodes);
  program.setIndices(SHARED_FACE_QUAD.indices);
  if (build.receipt.exposedFaces > 0) {
    program.instanceAttributes.iPosition.set(build.positions);
    program.instanceAttributes.iFace.set(build.faceCodes);
    program.instanceAttributes.iColorRoughness.set(build.colorRoughness);
    program.instanceAttributes.iMaterialPalette.set(build.materialPalette);
    program.instanceAttributes.iWater.set(build.water);
    program.instanceAttributes.iAo.set(build.cornerAo);
  }
  return build;
}

/** Exposed-face raster approach with a static sun shadow and cinematic HDR presentation pass. */
export const createInstancesApproach: ApproachFactory = async (options): Promise<VoxelApproach> => {
  let renderer: Renderer | null = null;
  let surfaceProgram: InstanceProgram | null = null;
  let transparentProgram: InstanceProgram | null = null;
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
    surfaceProgram = createProgram(renderer, voxelInstancesShader);
    transparentProgram = createProgram(renderer, voxelInstancesShader, { blend: 'alpha' });
    presentationProgram = createProgram(renderer, cinematicPresentShader);
    shadowTarget = createRenderTarget(renderer, { width: SHADOW_SIZE, height: SHADOW_SIZE, depth: true });
    const build = uploadImmutableInstances(surfaceProgram, options.scene, 'opaque');
    const transparentBuild = uploadImmutableInstances(
      transparentProgram,
      options.scene,
      'transmissive',
    );
    const fullscreen = createPlane({ width: 2, height: 2 });
    presentationProgram.attributes.aPosition.set(fullscreen.positions);
    presentationProgram.setIndices(fullscreen.indices);

    surfaceProgram.uniforms.uFogNear.set(FOG_NEAR);
    surfaceProgram.uniforms.uFogFar.set(FOG_FAR);
    surfaceProgram.uniforms.uShadowTexel.set([1 / SHADOW_SIZE, 1 / SHADOW_SIZE]);
    transparentProgram.uniforms.uFogNear.set(FOG_NEAR);
    transparentProgram.uniforms.uFogFar.set(FOG_FAR);
    transparentProgram.uniforms.uShadowTexel.set([1 / SHADOW_SIZE, 1 / SHADOW_SIZE]);

    const ownedRenderer = renderer;
    const ownedSurface = surfaceProgram;
    const ownedTransparent = transparentProgram;
    const ownedPresentation = presentationProgram;
    const ownedShadow = shadowTarget;
    const hasGeometry = build.receipt.exposedFaces > 0;
    const hasTransparent = transparentBuild.receipt.exposedFaces > 0;
    const uniformBytesPerFrame = voxelInstancesShader.layout.uniformBlockSize
      * (hasTransparent ? 2 : 1)
      + cinematicPresentShader.layout.uniformBlockSize;
    let disposed = false;
    let shadowKey = '';
    let currentSettings: RenderSettings = options.initialSettings;
    let pendingFrame: Readonly<{
      elapsedSeconds: number;
      camera: CameraSnapshot;
      settings: RenderSettings;
    }> | null = null;

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
      if (disposed || pendingFrame === null) return;
      const { elapsedSeconds, camera, settings } = pendingFrame;
      const target = ensureSceneTarget();
      const lighting = createLightingState(settings.lighting.timeOfDay, settings.lighting.moonEnabled);
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
        program.uniforms.uViewProjection.set(camera.viewProjection);
        program.uniforms.uViewPosition.set(camera.position);
        program.uniforms.uViewForward.set(camera.forward);
        program.uniforms.uShadowMap.set(ownedShadow.texture);
        program.uniforms.uShadowPass.set(0);
        program.uniforms.uTransparentPass.set(Number(transparent));
        program.uniforms.uStylized.set(settings.style === 'graphic' ? 1 : 0);
        program.uniforms.uMaterialVariation.set(settings.materialVariation);
        program.uniforms.uTime.set(elapsedSeconds);
      }
      ownedRenderer.drawTo(target, () => {
        if (hasGeometry) ownedSurface.draw();
        if (hasTransparent) ownedTransparent.draw();
      }, { clear: [0, 0, 0, 0] });
      ownedPresentation.uniforms.uScene.set(target.texture);
      ownedPresentation.uniforms.uResolution.set([target.width, target.height]);
      ownedPresentation.uniforms.uFocusDistance.set(settings.depthOfField.focusDistance);
      ownedPresentation.uniforms.uFocusRange.set(Math.max(1, settings.depthOfField.focusDistance * 0.08));
      ownedPresentation.uniforms.uAperture.set(settings.depthOfField.aperture);
      ownedPresentation.uniforms.uDofEnabled.set(Number(settings.depthOfField.enabled));
      ownedPresentation.uniforms.uExposure.set(settings.exposure);
      ownedPresentation.uniforms.uStylized.set(settings.style === 'graphic' ? 1 : 0);
      ownedPresentation.uniforms.uFinalColorGrade.set(Number(settings.finalColorGrade));
      ownedPresentation.uniforms.uSkyColor.set(lighting.skyColor);
      ownedPresentation.uniforms.uFogColor.set(lighting.fogColor);
      ownedPresentation.uniforms.uSunDirection.set(lighting.sunDirection);
      ownedPresentation.uniforms.uSunColor.set(lighting.sunColor);
      ownedPresentation.uniforms.uSunIntensity.set(lighting.sunIntensity);
      ownedPresentation.uniforms.uMoonDirection.set(lighting.moonDirection);
      ownedPresentation.uniforms.uMoonColor.set(lighting.moonColor);
      ownedPresentation.uniforms.uMoonIntensity.set(lighting.moonIntensity);
      ownedPresentation.uniforms.uCameraForward.set(camera.forward);
      ownedPresentation.uniforms.uCameraRight.set(camera.right);
      ownedPresentation.uniforms.uCameraUp.set(camera.up);
      ownedPresentation.uniforms.uTanHalfFov.set(Math.tan(camera.verticalFovRadians * 0.5));
      ownedPresentation.draw();
    });
    const ownedStopLoop = stopLoop;

    const stats = (): RenderStats => {
      const targetBytes = (sceneTarget?.width ?? 0) * (sceneTarget?.height ?? 0) * TARGET_BYTES_PER_PIXEL;
      return Object.freeze({
        approach: 'instances',
        implementation: 'shadowed face instances + cinematic HDR',
        voxels: build.receipt.voxelCount,
        primitives: build.receipt.triangles + transparentBuild.receipt.triangles,
        drawCalls: Number(hasGeometry) + Number(hasTransparent) + 1,
        oneTimeBytes: build.receipt.oneTimeBytes + transparentBuild.receipt.oneTimeBytes
          + targetBytes
          + SHADOW_SIZE * SHADOW_SIZE * TARGET_BYTES_PER_PIXEL,
        uploadBytesPerFrame: uniformBytesPerFrame,
        detail: `${build.receipt.exposedFaces.toLocaleString()} opaque + ${transparentBuild.receipt.exposedFaces.toLocaleString()} transmissive faces · alpha water/glass · 1536² relightable shadow · ${currentSettings.depthOfField.enabled ? 'DoF on' : 'DoF off'} · ${currentSettings.style} materials · ${currentSettings.lighting.timeOfDay.toFixed(2)}h · receipts ${build.receipt.fingerprint}/${transparentBuild.receipt.fingerprint}`,
      });
    };

    return Object.freeze({
      frame(elapsedSeconds, camera, settings): void {
        if (disposed) return;
        currentSettings = settings;
        pendingFrame = Object.freeze({ elapsedSeconds, camera, settings });
      },
      stats,
      dispose(): void {
        if (disposed) return;
        disposed = true;
        stopLoop?.();
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

export const createInstanceApproach = createInstancesApproach;

export default createInstancesApproach;
