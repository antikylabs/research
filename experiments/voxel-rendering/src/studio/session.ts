import type { ApproachId } from '../render/types.ts';
import type { EnvironmentId } from '../scene/studio-scenes.ts';
import {
  DEFAULT_RENDER_SETTINGS,
  normalizeRenderSettings,
  type RenderSettings,
} from './settings.ts';

export type StudioSessionState = Readonly<{
  approachId: ApproachId;
  selectedModelId: string;
  environmentId: EnvironmentId;
  settings: RenderSettings;
  rendererGeneration: number;
}>;

export type StudioSessionAction =
  | Readonly<{ type: 'select-approach'; approachId: ApproachId }>
  | Readonly<{ type: 'select-model'; modelId: string }>
  | Readonly<{ type: 'select-environment'; environmentId: EnvironmentId }>
  | Readonly<{ type: 'update-settings'; settings: RenderSettings }>
  | Readonly<{ type: 'reload-renderer' }>;

export function createStudioSessionState(initialModelId: string): StudioSessionState {
  if (initialModelId.length === 0) throw new Error('Studio session needs an initial model.');
  return Object.freeze({
    approachId: 'mesh',
    selectedModelId: initialModelId,
    environmentId: 'pedestal',
    settings: DEFAULT_RENDER_SETTINGS,
    rendererGeneration: 0,
  });
}

/** Host-owned state reducer. Reloading changes only the pipeline generation. */
export function reduceStudioSession(
  current: StudioSessionState,
  action: StudioSessionAction,
): StudioSessionState {
  switch (action.type) {
    case 'select-approach':
      return Object.freeze({ ...current, approachId: action.approachId });
    case 'select-model':
      if (action.modelId.length === 0) throw new Error('Studio model id cannot be empty.');
      return Object.freeze({ ...current, selectedModelId: action.modelId });
    case 'select-environment':
      return Object.freeze({ ...current, environmentId: action.environmentId });
    case 'update-settings':
      return Object.freeze({ ...current, settings: normalizeRenderSettings(action.settings) });
    case 'reload-renderer':
      return Object.freeze({ ...current, rendererGeneration: current.rendererGeneration + 1 });
  }
}
