import type { ApproachId, PresentationStyle } from './render/types.ts';

export const VOXEL_CAPTURE_FIXTURE = 'voxel-rendering-evidence';

export type VoxelCapturePresentation = Readonly<{
  approach: ApproachId;
  style: PresentationStyle;
}>;

export type VoxelCaptureFixtureControl = Readonly<{
  kind: 'variant';
  name: 'mesh' | 'instances' | 'raytrace' | 'stylized';
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
const CONTROL_NAMES = new Set<string>([...APPROACHES, 'stylized']);

/** Apply only semantic evidence variants; renderer objects remain private to the game. */
export function applyVoxelCaptureFixture(
  current: VoxelCapturePresentation,
  request: VoxelCaptureFixtureRequest,
): Readonly<{
  presentation: VoxelCapturePresentation;
  result: VoxelCaptureFixtureResult;
}> {
  if (request.schemaVersion !== 1 || request.fixtureName !== VOXEL_CAPTURE_FIXTURE) {
    throw new Error('Unknown voxel-rendering capture fixture.');
  }
  if (request.controls.length < 1 || request.controls.length > 8) {
    throw new Error('Voxel-rendering capture fixture needs 1 through 8 controls.');
  }

  const variants: Record<string, boolean> = {
    mesh: current.approach === 'mesh',
    instances: current.approach === 'instances',
    raytrace: current.approach === 'raytrace',
    stylized: current.style === 'graphic',
  };
  const identities = new Set<string>();
  const applied = request.controls.map((control) => {
    if (control.kind !== 'variant' || !CONTROL_NAMES.has(control.name)) {
      throw new Error('Unknown voxel-rendering capture variant.');
    }
    if (identities.has(control.name)) {
      throw new Error(`Duplicate voxel-rendering capture variant: ${control.name}.`);
    }
    identities.add(control.name);
    variants[control.name] = control.enabled;
    return Object.freeze({ ...control });
  });

  const enabledApproaches = APPROACHES.filter((approach) => variants[approach]);
  if (enabledApproaches.length !== 1) {
    throw new Error('Voxel-rendering capture fixture must enable exactly one approach.');
  }
  const presentation = Object.freeze({
    approach: enabledApproaches[0]!,
    style: variants.stylized ? 'graphic' : 'physical',
  } as const);
  return Object.freeze({
    presentation,
    result: Object.freeze({
      schemaVersion: 1,
      fixtureName: VOXEL_CAPTURE_FIXTURE,
      appliedControls: Object.freeze(applied),
    }),
  });
}
