import {
  createPlane,
  createProgram,
  createRenderer,
  createRenderTarget,
  createStorageBuffer,
  type BroMetalProgram,
  type BroMetalStorageBuffer,
  type Renderer,
  type RenderTarget,
} from 'brometal';

import type { CameraSnapshot } from '../../camera/types.ts';
import { cameraFocusDistance } from '../../render/cinematic.ts';
import type {
  ApproachFactory,
  PresentationStyle,
  RenderStats,
  VoxelApproach,
} from '../../render/types.ts';
import {
  RaytraceResetTracker,
  type RaytraceSampleDefinition,
} from './accumulation.ts';
import pathSampleShader from './shaders/path-sample.shader.gen.ts';
import presentationShader from './shaders/presentation.shader.gen.ts';
import { createDenseVoxelStorage } from './volume.ts';

const CLEAR_COLOR = Object.freeze([0.008, 0.012, 0.025, 1] as const);
const SUN_DIRECTION = Object.freeze([-0.57, 0.63, 0.53] as const);
const SUN_COLOR = Object.freeze([4.8, 2.15, 0.9] as const);
const SKY_COLOR = Object.freeze([0.035, 0.08, 0.18] as const);
const MAX_SAMPLES = 512;
const RAYS_PER_PIXEL_SAMPLE = 4;
const RGBA16F_BYTES_PER_PIXEL = 8;
const MATERIAL_LIGHT_KEY = 'golden-hour-sun--0.57-0.63-0.53-v3';
const INTEGRATOR_KEY = 'dense-dda-two-secondary-soft-shadow-thin-lens-v3';

type PathProgram = BroMetalProgram<
  (typeof pathSampleShader)['attributes'],
  (typeof pathSampleShader)['instanceAttributes'],
  (typeof pathSampleShader)['uniforms']
>;

type PresentationProgram = BroMetalProgram<
  (typeof presentationShader)['attributes'],
  (typeof presentationShader)['instanceAttributes'],
  (typeof presentationShader)['uniforms']
>;

type AccumulationTargets = {
  read: RenderTarget;
  write: RenderTarget;
};

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function disposeTargets(targets: AccumulationTargets): Error[] {
  const errors: Error[] = [];
  for (const target of [targets.read, targets.write]) {
    try {
      target.dispose();
    } catch (error) {
      errors.push(asError(error));
    }
  }
  return errors;
}

function createAccumulationTargets(
  renderer: Renderer,
  width: number,
  height: number,
): AccumulationTargets {
  let read: RenderTarget | null = null;
  try {
    // BroMetal render targets are RGBA16F with nearest sampling by default, which is exactly what
    // an accumulation buffer needs: interpolation would mix unrelated pixels' sample histories.
    read = createRenderTarget(renderer, { width, height });
    const write = createRenderTarget(renderer, { width, height });
    return { read, write };
  } catch (error) {
    if (read === null) throw error;
    try {
      read.dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [asError(error), asError(cleanupError)],
        'Raytrace accumulation-target construction and rollback both failed.',
      );
    }
    throw error;
  }
}

function makeDefinition(
  sceneFingerprint: string,
  camera: CameraSnapshot,
  style: PresentationStyle,
  width: number,
  height: number,
): RaytraceSampleDefinition {
  return Object.freeze({
    sceneFingerprint,
    cameraRevision: camera.revision,
    viewportWidth: width,
    viewportHeight: height,
    materialLightKey: MATERIAL_LIGHT_KEY,
    integratorKey: INTEGRATOR_KEY,
    presentationKey: style,
  });
}

/**
 * Dense-grid progressive path tracer. The host's `frame` call only publishes state; rendering stays
 * inside BroMetal's official loop so no runtime internals or patched present path are required.
 */
export const createRaytraceApproach: ApproachFactory = async (options): Promise<VoxelApproach> => {
  const dense = createDenseVoxelStorage(options.scene);
  let renderer: Renderer | null = null;
  let pathProgram: PathProgram | null = null;
  let presentationProgram: PresentationProgram | null = null;
  let volumeBuffer: BroMetalStorageBuffer | null = null;
  let materialColorBuffer: BroMetalStorageBuffer | null = null;
  let materialSurfaceBuffer: BroMetalStorageBuffer | null = null;
  let stopLoop: (() => void) | null = null;
  let targets: AccumulationTargets | null = null;

  try {
    renderer = await createRenderer(options.canvas, {
      antialias: false,
      clearColor: CLEAR_COLOR,
      cull: 'none',
      onError: (error) => options.onError(asError(error)),
    });
    pathProgram = createProgram(renderer, pathSampleShader);
    presentationProgram = createProgram(renderer, presentationShader);
    volumeBuffer = createStorageBuffer(renderer, dense.volumeData);
    materialColorBuffer = createStorageBuffer(renderer, dense.materialColor);
    materialSurfaceBuffer = createStorageBuffer(renderer, dense.materialSurface);

    const quad = createPlane({ width: 2, height: 2 });
    pathProgram.attributes.aPosition.set(quad.positions);
    pathProgram.setIndices(quad.indices);
    presentationProgram.attributes.aPosition.set(quad.positions);
    presentationProgram.setIndices(quad.indices);

    pathProgram.uniforms.uVolume.set(volumeBuffer);
    pathProgram.uniforms.uMaterialColor.set(materialColorBuffer);
    pathProgram.uniforms.uMaterialSurface.set(materialSurfaceBuffer);
    pathProgram.uniforms.uVolumeOrigin.set(dense.origin);
    pathProgram.uniforms.uVolumeDimensions.set(dense.dimensions);
    pathProgram.uniforms.uSunDirection.set(SUN_DIRECTION);
    pathProgram.uniforms.uSunColor.set(SUN_COLOR);
    pathProgram.uniforms.uSkyColor.set(SKY_COLOR);
    pathProgram.uniforms.uTraversalCap.set(dense.traversalCap);
    presentationProgram.uniforms.uExposure.set(1.12);
    presentationProgram.uniforms.uGraphic.set(options.initialStyle === 'graphic' ? 1 : 0);

    const ownedRenderer = renderer;
    const ownedPathProgram = pathProgram;
    const ownedPresentationProgram = presentationProgram;
    const ownedVolumeBuffer = volumeBuffer;
    const ownedMaterialColorBuffer = materialColorBuffer;
    const ownedMaterialSurfaceBuffer = materialSurfaceBuffer;
    const quadBytes = (quad.positions.byteLength + quad.indices.byteLength) * 2;
    let disposed = false;
    let runtimeFailed = false;
    let currentCamera: CameraSnapshot | null = null;
    let currentStyle: PresentationStyle = options.initialStyle;
    let currentElapsedSeconds = 0;
    let tracker: RaytraceResetTracker | null = null;
    let lastDrawCalls = 0;
    let lastRayBudget = 0;
    let lastUploadBytes = 0;

    const reportErrors = (message: string, errors: readonly Error[]): void => {
      if (errors.length === 0) return;
      options.onError(errors.length === 1 ? errors[0]! : new AggregateError(errors, message));
    };

    const ensureTargets = (width: number, height: number): AccumulationTargets => {
      if (targets !== null && targets.read.width === width && targets.read.height === height) {
        return targets;
      }
      const replacement = createAccumulationTargets(ownedRenderer, width, height);
      const previous = targets;
      targets = replacement;
      if (previous !== null) {
        reportErrors('Raytrace accumulation-target replacement cleanup failed.', disposeTargets(previous));
      }
      return replacement;
    };

    const drawFrame = (): void => {
      if (disposed || runtimeFailed || currentCamera === null) return;
      const width = Math.max(1, ownedRenderer.canvas.width);
      const height = Math.max(1, ownedRenderer.canvas.height);
      const currentTargets = ensureTargets(width, height);
      const definition = makeDefinition(
        options.scene.fingerprint,
        currentCamera,
        currentStyle,
        width,
        height,
      );
      if (tracker === null) tracker = new RaytraceResetTracker(definition);
      else tracker.update(definition);

      let sampled = false;
      if (tracker.sampleCount < MAX_SAMPLES) {
        ownedPathProgram.uniforms.uPrevious.set(currentTargets.read.texture);
        ownedPathProgram.uniforms.uResolution.set([width, height]);
        ownedPathProgram.uniforms.uSampleCount.set(tracker.sampleCount);
        ownedPathProgram.uniforms.uCameraPosition.set(currentCamera.position);
        ownedPathProgram.uniforms.uCameraForward.set(currentCamera.forward);
        ownedPathProgram.uniforms.uCameraRight.set(currentCamera.right);
        ownedPathProgram.uniforms.uCameraUp.set(currentCamera.up);
        ownedPathProgram.uniforms.uTanHalfFov.set(Math.tan(currentCamera.verticalFovRadians * 0.5));
        ownedPathProgram.uniforms.uFocalDistance.set(cameraFocusDistance(currentCamera));
        ownedPathProgram.uniforms.uAperture.set(1.2);
        ownedPathProgram.uniforms.uSeed.set(
          currentElapsedSeconds + tracker.generation * 101.317 + tracker.sampleCount * 0.618,
        );
        ownedRenderer.drawTo(currentTargets.write, () => ownedPathProgram.draw());
        const previousRead = currentTargets.read;
        currentTargets.read = currentTargets.write;
        currentTargets.write = previousRead;
        tracker.recordSample();
        sampled = true;
      }

      ownedPresentationProgram.uniforms.uAccumulation.set(currentTargets.read.texture);
      ownedPresentationProgram.uniforms.uResolution.set([width, height]);
      ownedPresentationProgram.uniforms.uGraphic.set(currentStyle === 'graphic' ? 1 : 0);
      ownedPresentationProgram.draw();
      lastDrawCalls = sampled ? 2 : 1;
      lastRayBudget = sampled ? width * height * RAYS_PER_PIXEL_SAMPLE : 0;
      lastUploadBytes = presentationShader.layout.uniformBlockSize
        + (sampled ? pathSampleShader.layout.uniformBlockSize : 0);
    };

    stopLoop = ownedRenderer.loop(() => {
      try {
        drawFrame();
      } catch (error) {
        runtimeFailed = true;
        stopLoop?.();
        options.onError(asError(error));
      }
    });
    const ownedStopLoop = stopLoop;

    const stats = (): RenderStats => {
      const width = targets?.read.width ?? 0;
      const height = targets?.read.height ?? 0;
      const targetBytes = width * height * RGBA16F_BYTES_PER_PIXEL * 2;
      const sampleCount = tracker?.sampleCount ?? 0;
      const resetReason = tracker?.lastResetReason ?? 'initial';
      const maxRayBudget = width * height * RAYS_PER_PIXEL_SAMPLE;
      return Object.freeze({
        approach: 'raytrace',
        implementation: 'dense vec4 DDA progressive path tracer',
        voxels: dense.occupiedVoxels,
        primitives: lastRayBudget,
        drawCalls: lastDrawCalls,
        oneTimeBytes: dense.byteLength + quadBytes + targetBytes,
        uploadBytesPerFrame: lastUploadBytes,
        sampleCount,
        resetReason,
        detail: `${dense.dimensions.join(' × ')} dense grid · ${dense.volumeByteLength.toLocaleString()} B volume · 2 × RGBA16F running mean · ≤ ${maxRayBudget.toLocaleString()} rays/sample (${RAYS_PER_PIXEL_SAMPLE}/pixel) · ${dense.traversalCap}-step cap · ${currentStyle} presentation · ${sampleCount}/${MAX_SAMPLES} samples`,
      });
    };

    return Object.freeze({
      frame(elapsedSeconds, camera, style): void {
        if (disposed || runtimeFailed) return;
        currentElapsedSeconds = elapsedSeconds;
        currentCamera = camera;
        currentStyle = style;
      },
      stats,
      dispose(): void {
        if (disposed) return;
        disposed = true;
        const errors: Error[] = [];
        const attempt = (dispose: () => void): void => {
          try {
            dispose();
          } catch (error) {
            errors.push(asError(error));
          }
        };
        attempt(ownedStopLoop);
        if (targets !== null) errors.push(...disposeTargets(targets));
        attempt(() => ownedPresentationProgram.dispose());
        attempt(() => ownedPathProgram.dispose());
        attempt(() => ownedMaterialSurfaceBuffer.dispose());
        attempt(() => ownedMaterialColorBuffer.dispose());
        attempt(() => ownedVolumeBuffer.dispose());
        attempt(() => ownedRenderer.destroy());
        reportErrors('Raytrace teardown encountered multiple failures.', errors);
      },
    });
  } catch (error) {
    const primary = asError(error);
    const cleanupErrors: Error[] = [];
    const rollback = (dispose: (() => void) | undefined): void => {
      if (dispose === undefined) return;
      try {
        dispose();
      } catch (cleanupError) {
        cleanupErrors.push(asError(cleanupError));
      }
    };
    rollback(stopLoop ?? undefined);
    if (targets !== null) cleanupErrors.push(...disposeTargets(targets));
    rollback(presentationProgram === null ? undefined : () => presentationProgram?.dispose());
    rollback(pathProgram === null ? undefined : () => pathProgram?.dispose());
    rollback(materialSurfaceBuffer === null ? undefined : () => materialSurfaceBuffer?.dispose());
    rollback(materialColorBuffer === null ? undefined : () => materialColorBuffer?.dispose());
    rollback(volumeBuffer === null ? undefined : () => volumeBuffer?.dispose());
    rollback(renderer === null ? undefined : () => renderer?.destroy());
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [primary, ...cleanupErrors],
        'Raytrace construction failed and rollback encountered additional failures.',
      );
    }
    throw primary;
  }
};

export default createRaytraceApproach;
