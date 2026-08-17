import { createInstancesApproach } from './approaches/instances/index.ts';
import { createMeshApproach } from './approaches/mesh/index.ts';
import { createRaytraceApproach } from './approaches/raytrace/index.ts';
import { OrbitCamera } from './camera/orbit-camera.ts';
import {
  applyVoxelCaptureFixture,
  type VoxelCaptureFixtureRequest,
  type VoxelCaptureFixtureResult,
  type VoxelCapturePresentation,
} from './capture-fixture.ts';
import type {
  ApproachFactory,
  ApproachId,
  PresentationStyle,
  RenderStats,
  VoxelApproach,
} from './render/types.ts';
import { createBuiltInScene } from './scene/built-in.ts';

type AntikyMeasurements = Readonly<{
  instances?: number;
  drawCalls?: number;
  uploadBytesPerFrame?: number;
  note?: string;
}>;

type AntikyHostContext = Readonly<{
  canvas: HTMLCanvasElement;
  report(measurements: AntikyMeasurements): void;
}>;

type AntikyGameInstance = Readonly<{
  inspection: Readonly<{
    applyCaptureFixture(
      request: VoxelCaptureFixtureRequest,
    ): VoxelCaptureFixtureResult | Promise<VoxelCaptureFixtureResult>;
  }>;
  frame(platformTimeSeconds: number): void;
  dispose(): void;
}>;

type AntikyGameEntry = (
  context: AntikyHostContext,
) => AntikyGameInstance | Promise<AntikyGameInstance>;

export type AntikyPresentation = VoxelCapturePresentation;

const FACTORIES: Readonly<Record<ApproachId, ApproachFactory>> = Object.freeze({
  mesh: createMeshApproach,
  instances: createInstancesApproach,
  raytrace: createRaytraceApproach,
});

export function selectAntikyPresentation(search: string): AntikyPresentation {
  const parameters = new URLSearchParams(search);
  const requestedApproach = parameters.get('approach');
  const requestedStyle = parameters.get('style');
  const approach: ApproachId = requestedApproach === 'instances' || requestedApproach === 'raytrace'
    ? requestedApproach
    : 'mesh';
  const style: PresentationStyle = requestedStyle === 'graphic' ? 'graphic' : 'physical';
  return Object.freeze({ approach, style });
}

function measurements(stats: RenderStats, presentation: AntikyPresentation): AntikyMeasurements {
  return Object.freeze({
    ...(presentation.approach === 'instances'
      ? { instances: Math.floor(stats.primitives / 2) }
      : {}),
    drawCalls: stats.drawCalls,
    uploadBytesPerFrame: stats.uploadBytesPerFrame,
    note: `${presentation.approach}/${presentation.style} · ${stats.voxels.toLocaleString()} voxels · ${stats.detail}`,
  });
}

/** Antiky CLI/Studio game-module entry for managed WebGPU inspection and canvas capture. */
const mountVoxelStudy: AntikyGameEntry = async ({ canvas, report }) => {
  let presentation = selectAntikyPresentation(window.location.search);
  const scene = createBuiltInScene();
  const camera = new OrbitCamera();
  let pendingError: Error | null = null;
  let disposed = false;
  const createApproach = (selected: AntikyPresentation) => FACTORIES[selected.approach]({
      canvas,
      scene,
      initialStyle: selected.style,
      onError(error) {
        pendingError = error;
      },
    });
  let approach: VoxelApproach | null = await createApproach(presentation);
  let framesSinceReport = 0;
  report(measurements(approach.stats(), presentation));

  return Object.freeze({
    inspection: Object.freeze({
      async applyCaptureFixture(request: VoxelCaptureFixtureRequest): Promise<VoxelCaptureFixtureResult> {
        const applied = applyVoxelCaptureFixture(presentation, request);
        const approachChanged = applied.presentation.approach !== presentation.approach;
        presentation = applied.presentation;
        if (approachChanged) {
          const previous = approach;
          if (previous === null) throw new Error('Voxel-rendering renderer replacement is already active.');
          approach = null;
          previous.dispose();
          pendingError = null;
          if (disposed) throw new Error('Voxel-rendering game is disposed.');
          approach = await createApproach(presentation);
        }
        const activeApproach = approach;
        if (activeApproach === null) throw new Error('Voxel-rendering renderer replacement failed.');
        report(measurements(activeApproach.stats(), presentation));
        return applied.result;
      },
    }),
    frame(platformTimeSeconds: number): void {
      if (pendingError !== null) throw pendingError;
      if (disposed || approach === null) return;
      const width = Math.max(1, canvas.width || canvas.clientWidth);
      const height = Math.max(1, canvas.height || canvas.clientHeight);
      approach.frame(
        platformTimeSeconds,
        camera.snapshot(width / height),
        presentation.style,
      );
      framesSinceReport += 1;
      if (framesSinceReport >= 12) {
        framesSinceReport = 0;
        report(measurements(approach.stats(), presentation));
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      approach?.dispose();
    },
  });
};

export default mountVoxelStudy;
