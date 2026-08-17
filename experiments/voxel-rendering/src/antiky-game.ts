import { createInstancesApproach } from './approaches/instances/index.ts';
import { createMeshApproach } from './approaches/mesh/index.ts';
import { createRaytraceApproach } from './approaches/raytrace/index.ts';
import { FlyCamera } from './camera/fly-camera.ts';
import {
  applyVoxelCaptureFixture,
  type VoxelCaptureFixtureRequest,
  type VoxelCaptureFixtureResult,
  type VoxelCapturePresentation,
  type VoxelCaptureStudio,
  type VoxelCaptureView,
} from './capture-fixture.ts';
import type {
  ApproachFactory,
  ApproachId,
  PresentationStyle,
  RenderStats,
  VoxelApproach,
} from './render/types.ts';
import {
  composeStudioScene,
  ENVIRONMENT_PRESETS,
  listBundledSubjects,
  type EnvironmentId,
} from './scene/studio-scenes.ts';
import {
  DEFAULT_RENDER_SETTINGS,
  normalizeRenderSettings,
  type RenderSettings,
} from './studio/settings.ts';

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

export type AntikyStudioSelection = Readonly<{
  presentation: AntikyPresentation;
  modelIndex: number;
  environmentId: EnvironmentId;
  settings: RenderSettings;
}>;

type CaptureCameraPose = Readonly<{
  position: readonly [number, number, number];
  yaw: number;
  pitch: number;
}>;

const CAPTURE_CAMERAS: Readonly<Record<Exclude<VoxelCaptureView, 'vista'>, CaptureCameraPose>> = Object.freeze({
  front: Object.freeze({ position: [56, 44, 146] as const, yaw: -0.37, pitch: -0.14 }),
  right: Object.freeze({ position: [146, 44, -56] as const, yaw: -1.94, pitch: -0.14 }),
  back: Object.freeze({ position: [-56, 44, -146] as const, yaw: 2.77, pitch: -0.14 }),
  left: Object.freeze({ position: [-146, 44, 56] as const, yaw: 1.20, pitch: -0.14 }),
});

// Each vista crosses a biome landmark before resolving on the model at the sanctuary center.
const VISTA_CAPTURE_CAMERAS: Readonly<Record<EnvironmentId, CaptureCameraPose>> = Object.freeze({
  pedestal: CAPTURE_CAMERAS.front,
  forest: Object.freeze({ position: [-118, 50, 135] as const, yaw: 0.59, pitch: -0.15 }),
  'snow-forest': Object.freeze({ position: [112, 48, 138] as const, yaw: -0.43, pitch: -0.14 }),
  mountains: Object.freeze({ position: [-112, 62, 142] as const, yaw: 0.50, pitch: -0.16 }),
  beach: Object.freeze({ position: [-126, 44, 158] as const, yaw: 0.61, pitch: -0.11 }),
  swamp: Object.freeze({ position: [-124, 43, 142] as const, yaw: 0.60, pitch: -0.10 }),
});

function captureCamera(view: VoxelCaptureView, environment: EnvironmentId): FlyCamera {
  return new FlyCamera(view === 'vista' ? VISTA_CAPTURE_CAMERAS[environment] : CAPTURE_CAMERAS[view]);
}

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

function numberParameter(parameters: URLSearchParams, name: string, fallback: number): number {
  const raw = parameters.get(name);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function selectAntikyStudio(search: string): AntikyStudioSelection {
  const parameters = new URLSearchParams(search);
  const presentation = selectAntikyPresentation(search);
  const requestedModel = Math.floor(numberParameter(parameters, 'model', 0));
  const modelIndex = Math.max(0, Math.min(listBundledSubjects().length - 1, requestedModel));
  const requestedEnvironment = parameters.get('environment');
  const environmentId = ENVIRONMENT_PRESETS.some(
    (preset) => preset.id === requestedEnvironment,
  ) ? requestedEnvironment as EnvironmentId : 'pedestal';
  const settings = normalizeRenderSettings({
    ...DEFAULT_RENDER_SETTINGS,
    style: presentation.style,
    depthOfField: {
      enabled: parameters.get('dof') !== 'off',
      focusDistance: numberParameter(
        parameters,
        'focus',
        DEFAULT_RENDER_SETTINGS.depthOfField.focusDistance,
      ),
      aperture: numberParameter(
        parameters,
        'aperture',
        DEFAULT_RENDER_SETTINGS.depthOfField.aperture,
      ),
    },
    lighting: {
      timeOfDay: numberParameter(
        parameters,
        'time',
        DEFAULT_RENDER_SETTINGS.lighting.timeOfDay,
      ),
      moonEnabled: parameters.get('moon') !== 'off',
    },
    exposure: numberParameter(parameters, 'exposure', DEFAULT_RENDER_SETTINGS.exposure),
    finalColorGrade: parameters.get('grade') !== 'off',
    materialVariation: numberParameter(
      parameters,
      'variation',
      DEFAULT_RENDER_SETTINGS.materialVariation,
    ),
  });
  return Object.freeze({ presentation, modelIndex, environmentId, settings });
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
  const initial = selectAntikyStudio(window.location.search);
  let studio: VoxelCaptureStudio = Object.freeze({ ...initial, view: 'front' });
  let scene = composeStudioScene(
    listBundledSubjects()[studio.modelIndex]!,
    studio.environmentId,
  );
  let camera = captureCamera(studio.view, studio.environmentId);
  let pendingError: Error | null = null;
  let disposed = false;
  const createApproach = () => FACTORIES[studio.presentation.approach]({
      canvas,
      scene,
      initialSettings: studio.settings,
      onError(error) {
        pendingError = error;
      },
    });
  let approach: VoxelApproach | null = await createApproach();
  let framesSinceReport = 0;
  report(measurements(approach.stats(), studio.presentation));

  return Object.freeze({
    inspection: Object.freeze({
      async applyCaptureFixture(request: VoxelCaptureFixtureRequest): Promise<VoxelCaptureFixtureResult> {
        const applied = applyVoxelCaptureFixture(studio, request);
        const rendererChanged = applied.studio.presentation.approach
          !== studio.presentation.approach;
        const sceneChanged = applied.studio.modelIndex !== studio.modelIndex
          || applied.studio.environmentId !== studio.environmentId;
        const viewChanged = applied.studio.view !== studio.view;
        studio = applied.studio;
        if (sceneChanged) {
          scene = composeStudioScene(
            listBundledSubjects()[studio.modelIndex]!,
            studio.environmentId,
          );
        }
        if (viewChanged || (sceneChanged && studio.view === 'vista')) {
          camera = captureCamera(studio.view, studio.environmentId);
        }
        if (rendererChanged || sceneChanged || viewChanged) {
          const previous = approach;
          if (previous === null) throw new Error('Voxel-rendering renderer replacement is already active.');
          approach = null;
          previous.dispose();
          pendingError = null;
          if (disposed) throw new Error('Voxel-rendering game is disposed.');
          approach = await createApproach();
        }
        const activeApproach = approach;
        if (activeApproach === null) throw new Error('Voxel-rendering renderer replacement failed.');
        report(measurements(activeApproach.stats(), studio.presentation));
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
        studio.settings,
      );
      framesSinceReport += 1;
      if (framesSinceReport >= 12) {
        framesSinceReport = 0;
        report(measurements(approach.stats(), studio.presentation));
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
