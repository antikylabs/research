import { createInstancesApproach } from './approaches/instances/index.ts';
import { createMeshApproach } from './approaches/mesh/index.ts';
import { createRaytraceApproach } from './approaches/raytrace/index.ts';
import { OrbitCamera } from './camera/orbit-camera.ts';
import type {
  ApproachFactory,
  ApproachId,
  PresentationStyle,
  RenderStats,
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
  frame(platformTimeSeconds: number): void;
  dispose(): void;
}>;

type AntikyGameEntry = (
  context: AntikyHostContext,
) => AntikyGameInstance | Promise<AntikyGameInstance>;

export type AntikyPresentation = Readonly<{
  approach: ApproachId;
  style: PresentationStyle;
}>;

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
  const presentation = selectAntikyPresentation(window.location.search);
  const scene = createBuiltInScene();
  const camera = new OrbitCamera();
  let pendingError: Error | null = null;
  const approach = await FACTORIES[presentation.approach]({
    canvas,
    scene,
    initialStyle: presentation.style,
    onError(error) {
      pendingError = error;
    },
  });
  let framesSinceReport = 0;
  report(measurements(approach.stats(), presentation));

  return Object.freeze({
    frame(platformTimeSeconds: number): void {
      if (pendingError !== null) throw pendingError;
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
      approach.dispose();
    },
  });
};

export default mountVoxelStudy;
