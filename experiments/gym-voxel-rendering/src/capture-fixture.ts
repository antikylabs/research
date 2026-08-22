import type { ApproachId, PresentationStyle } from './render/types.ts';
import type { EnvironmentId } from './scene/studio-scenes.ts';
import { normalizeRenderSettings, type RenderSettings } from './studio/settings.ts';

export const VOXEL_CAPTURE_FIXTURE = 'voxel-rendering-evidence';

export type VoxelCapturePresentation = Readonly<{
  approach: ApproachId;
  style: PresentationStyle;
}>;

export type VoxelCaptureView = 'front' | 'right' | 'back' | 'left' | 'vista';

export type VoxelCaptureStudio = Readonly<{
  presentation: VoxelCapturePresentation;
  modelIndex: number;
  environmentId: EnvironmentId;
  settings: RenderSettings;
  view: VoxelCaptureView;
}>;

type VoxelCaptureVariant =
  | ApproachId
  | 'stylized'
  | 'model-pavilion'
  | 'model-rover'
  | 'model-shrine'
  | `environment-${EnvironmentId}`
  | 'night'
  | 'time-morning'
  | 'time-day'
  | 'time-golden'
  | 'time-evening'
  | 'time-night'
  | 'moon'
  | 'dof'
  | 'focus-near'
  | 'strong-aperture'
  | 'grade'
  | 'variation-high'
  | `view-${VoxelCaptureView}`;

export type VoxelCaptureFixtureControl = Readonly<{
  kind: 'variant';
  name: VoxelCaptureVariant;
  enabled: boolean;
}>;

export type VoxelCaptureFixtureRequest = Readonly<{
  schemaVersion: 1;
  fixtureName: string;
  controls: readonly VoxelCaptureFixtureControl[];
}>;

export type VoxelCaptureFixtureResult = Readonly<{
  schemaVersion: 1;
  fixtureName: typeof VOXEL_CAPTURE_FIXTURE;
  appliedControls: readonly VoxelCaptureFixtureControl[];
}>;

const APPROACHES = Object.freeze(['mesh', 'instances', 'raytrace'] as const);
const MODEL_VARIANTS = Object.freeze(['model-pavilion', 'model-rover', 'model-shrine'] as const);
const ENVIRONMENTS = Object.freeze([
  'pedestal', 'forest', 'snow-forest', 'mountains', 'beach', 'swamp',
] as const);
const VIEWS = Object.freeze(['front', 'right', 'back', 'left', 'vista'] as const);
const CONTROL_NAMES = new Set<string>([
  ...APPROACHES,
  'stylized',
  ...MODEL_VARIANTS,
  ...ENVIRONMENTS.map((environment) => `environment-${environment}`),
  'night',
  'time-morning',
  'time-day',
  'time-golden',
  'time-evening',
  'time-night',
  'moon',
  'dof',
  'focus-near',
  'strong-aperture',
  'grade',
  'variation-high',
  ...VIEWS.map((view) => `view-${view}`),
]);

/** Apply bounded evidence presets; renderer objects and arbitrary values remain private. */
export function applyVoxelCaptureFixture(
  current: VoxelCaptureStudio,
  request: VoxelCaptureFixtureRequest,
): Readonly<{
  studio: VoxelCaptureStudio;
  result: VoxelCaptureFixtureResult;
}> {
  if (request.schemaVersion !== 1 || request.fixtureName !== VOXEL_CAPTURE_FIXTURE) {
    throw new Error('Unknown voxel-rendering capture fixture.');
  }
  if (request.controls.length < 1 || request.controls.length > 8) {
    throw new Error('Voxel-rendering capture fixture needs 1 through 8 controls.');
  }

  const approachVariants: Record<ApproachId, boolean> = {
    mesh: current.presentation.approach === 'mesh',
    instances: current.presentation.approach === 'instances',
    raytrace: current.presentation.approach === 'raytrace',
  };
  let style = current.presentation.style;
  let modelIndex = current.modelIndex;
  let environmentId = current.environmentId;
  let settings = current.settings;
  let view = current.view;
  const identities = new Set<string>();
  const applied = request.controls.map((control) => {
    if (control.kind !== 'variant' || !CONTROL_NAMES.has(control.name)) {
      throw new Error('Unknown voxel-rendering capture variant.');
    }
    if (identities.has(control.name)) {
      throw new Error(`Duplicate voxel-rendering capture variant: ${control.name}.`);
    }
    identities.add(control.name);

    if (APPROACHES.includes(control.name as ApproachId)) {
      approachVariants[control.name as ApproachId] = control.enabled;
    } else if (control.name === 'stylized') {
      style = control.enabled ? 'graphic' : 'physical';
    } else if (MODEL_VARIANTS.includes(control.name as typeof MODEL_VARIANTS[number])) {
      if (control.enabled) modelIndex = MODEL_VARIANTS.indexOf(control.name as typeof MODEL_VARIANTS[number]);
    } else if (control.name.startsWith('environment-')) {
      if (control.enabled) environmentId = control.name.slice('environment-'.length) as EnvironmentId;
    } else if (control.name === 'night') {
      settings = { ...settings, lighting: { ...settings.lighting, timeOfDay: control.enabled ? 22 : 13.5 } };
    } else if (control.name === 'time-morning' && control.enabled) {
      settings = { ...settings, lighting: { ...settings.lighting, timeOfDay: 8 } };
    } else if (control.name === 'time-day' && control.enabled) {
      settings = { ...settings, lighting: { ...settings.lighting, timeOfDay: 13.5 } };
    } else if (control.name === 'time-golden' && control.enabled) {
      settings = { ...settings, lighting: { ...settings.lighting, timeOfDay: 16.5 } };
    } else if (control.name === 'time-evening' && control.enabled) {
      settings = { ...settings, lighting: { ...settings.lighting, timeOfDay: 18 } };
    } else if (control.name === 'time-night' && control.enabled) {
      settings = { ...settings, lighting: { ...settings.lighting, timeOfDay: 22 } };
    } else if (control.name === 'moon') {
      settings = { ...settings, lighting: { ...settings.lighting, moonEnabled: control.enabled } };
    } else if (control.name === 'dof') {
      settings = { ...settings, depthOfField: { ...settings.depthOfField, enabled: control.enabled } };
    } else if (control.name === 'focus-near') {
      settings = { ...settings, depthOfField: { ...settings.depthOfField, focusDistance: control.enabled ? 112 : 180 } };
    } else if (control.name === 'strong-aperture') {
      settings = { ...settings, depthOfField: { ...settings.depthOfField, aperture: control.enabled ? 1.15 : 0.14 } };
    } else if (control.name === 'grade') {
      settings = { ...settings, finalColorGrade: control.enabled };
    } else if (control.name === 'variation-high') {
      settings = { ...settings, materialVariation: control.enabled ? 0.72 : 0.15 };
    } else if (control.name.startsWith('view-') && control.enabled) {
      view = control.name.slice('view-'.length) as VoxelCaptureView;
    }
    return Object.freeze({ ...control });
  });

  const enabledApproaches = APPROACHES.filter((approach) => approachVariants[approach]);
  if (enabledApproaches.length !== 1) {
    throw new Error('Voxel-rendering capture fixture must enable exactly one approach.');
  }
  const presentation = Object.freeze({ approach: enabledApproaches[0]!, style });
  const studio = Object.freeze({
    presentation,
    modelIndex,
    environmentId,
    settings: normalizeRenderSettings({ ...settings, style }),
    view,
  });
  return Object.freeze({
    studio,
    result: Object.freeze({
      schemaVersion: 1,
      fixtureName: VOXEL_CAPTURE_FIXTURE,
      appliedControls: Object.freeze(applied),
    }),
  });
}
