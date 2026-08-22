import { voxelDiorama, type SceneDefinition } from '../dsl/index.js';
import type { ProjectProfile } from '../dsl/types.js';

import {
  createDiagnostic,
  compareStableText,
  diagnosticCodes,
  sortDiagnostics,
  type Diagnostic,
  type DiagnosticLocation,
} from './diagnostics.js';

export type ProjectProfilePolicy = Omit<ProjectProfile, 'kind' | 'id' | 'version'>;

export interface ExpandedProjectProfile {
  readonly id: string;
  readonly version: string;
  readonly selection: 'default' | 'explicit';
  readonly semanticPath: string;
  readonly profile: ProjectProfile;
  readonly policyPaths: readonly string[];
}

export interface ProfileConflictEvidence {
  readonly policyPath: string;
  readonly existingSource: string;
  readonly incomingSource: string;
  readonly existingValue: unknown;
  readonly incomingValue: unknown;
}

export interface ProfileProvenance {
  readonly profile: { readonly id: string; readonly version: string };
  readonly selection: 'default' | 'explicit';
  readonly semanticPath: string;
  readonly policyPaths: readonly string[];
}

export interface ProfileExpansionResult {
  readonly profiles: readonly ExpandedProjectProfile[];
  readonly policy?: ProjectProfilePolicy;
  readonly provenance: readonly ProfileProvenance[];
  readonly conflicts: readonly ProfileConflictEvidence[];
  readonly diagnostics: readonly Diagnostic[];
}

const supportedProfiles = new Map<string, ProjectProfile>([
  [`${voxelDiorama.id}@${voxelDiorama.version}`, voxelDiorama],
]);

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isProjectProfileRecord(value: unknown): value is ProjectProfile {
  return isPlainRecord(value)
    && value.kind === 'project-profile'
    && typeof value.id === 'string'
    && typeof value.version === 'string'
    && isPlainRecord(value.coordinatePolicy)
    && isPlainRecord(value.seedPolicy)
    && isPlainRecord(value.schema)
    && Array.isArray(value.systems)
    && isPlainRecord(value.validation)
    && isPlainRecord(value.render)
    && isPlainRecord(value.outputs);
}

function comparable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(comparable).join(',')}]`;
  if (isPlainRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${comparable(value[key])}`).join(',')}}`;
  }
  if (typeof value === 'number' && Object.is(value, -0)) return '0';
  if (typeof value === 'bigint') return `bigint:${value.toString()}`;
  if (typeof value === 'symbol') return `symbol:${value.description ?? ''}`;
  if (typeof value === 'function') return 'function';
  return JSON.stringify(value) ?? String(value);
}

function equalValue(left: unknown, right: unknown): boolean {
  return comparable(left) === comparable(right);
}

function clonePolicyValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clonePolicyValue);
  if (isPlainRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, clonePolicyValue(value[key])]));
  }
  return value;
}

function profileIdentityPart(value: unknown, key: 'id' | 'version'): string {
  if (!isPlainRecord(value)) return '';
  const part = value[key];
  return typeof part === 'string' ? part : '';
}

function policyEntries(profile: ProjectProfile): Readonly<Record<string, unknown>> {
  return {
    coordinatePolicy: profile.coordinatePolicy,
    outputs: profile.outputs,
    render: profile.render,
    schema: profile.schema,
    seedPolicy: profile.seedPolicy,
    systems: profile.systems,
    validation: profile.validation,
  };
}

function leafPaths(value: unknown, path: string): string[] {
  if (Array.isArray(value)) {
    return value.length === 0
      ? [path]
      : value.flatMap((item, index) => leafPaths(item, `${path}[${index}]`));
  }
  if (!isPlainRecord(value)) return [path];
  const keys = Object.keys(value).sort();
  if (keys.length === 0) return [path];
  return keys.flatMap((key) => leafPaths(value[key], `${path}.${key}`));
}

function compareConflicts(left: ProfileConflictEvidence, right: ProfileConflictEvidence): number {
  return compareStableText(left.policyPath, right.policyPath)
    || compareStableText(left.existingSource, right.existingSource)
    || compareStableText(left.incomingSource, right.incomingSource)
    || compareStableText(comparable(left.existingValue), comparable(right.existingValue))
    || compareStableText(comparable(left.incomingValue), comparable(right.incomingValue));
}

function mergeProfileValue(
  target: Record<string, unknown>,
  sources: Map<string, string>,
  incoming: unknown,
  incomingSource: string,
  path: string,
  conflicts: ProfileConflictEvidence[],
): void {
  const key = path.slice(path.lastIndexOf('.') + 1);
  const existing = target[key];
  if (existing === undefined) {
    target[key] = clonePolicyValue(incoming);
    for (const leafPath of leafPaths(incoming, path)) sources.set(leafPath, incomingSource);
    return;
  }

  if (isPlainRecord(existing) && isPlainRecord(incoming)) {
    const mutableExisting = existing as Record<string, unknown>;
    for (const childKey of Object.keys(incoming).sort()) {
      mergeProfileValue(mutableExisting, sources, incoming[childKey], incomingSource, `${path}.${childKey}`, conflicts);
    }
    return;
  }
  if (equalValue(existing, incoming)) return;

  const priorSource = sources.get(path);
  conflicts.push({
    policyPath: path,
    existingSource: priorSource ?? '(earlier profile)',
    incomingSource,
    existingValue: existing,
    incomingValue: incoming,
  });
}

/** Expand profile data in stable identity order and retain evidence for every rejected merge. */
export function expandProfiles(scene: SceneDefinition): ProfileExpansionResult {
  const diagnostics: Diagnostic[] = [];
  const conflicts: ProfileConflictEvidence[] = [];
  const authoredProfiles = [...((scene.profiles ?? []) as readonly unknown[])];
  const candidates = (authoredProfiles.length === 0
    ? [{ profile: voxelDiorama, authoredIndex: -1, semanticPath: '$.profiles', selection: 'default' as const }]
    : authoredProfiles.map((profile, authoredIndex) => ({
      profile,
      authoredIndex,
      semanticPath: `$.profiles[${authoredIndex}]`,
      selection: 'explicit' as const,
    })))
    .sort((left, right) => compareStableText(profileIdentityPart(left.profile, 'id'), profileIdentityPart(right.profile, 'id'))
      || compareStableText(profileIdentityPart(left.profile, 'version'), profileIdentityPart(right.profile, 'version'))
      || left.authoredIndex - right.authoredIndex);
  const seen = new Map<string, string>();
  const expanded: ExpandedProjectProfile[] = [];
  const merged: Record<string, unknown> = {};
  const sources = new Map<string, string>();

  for (const candidate of candidates) {
    const { profile, selection, semanticPath } = candidate;
    if (!isPlainRecord(profile) || profile.kind !== 'project-profile'
      || typeof profile.id !== 'string' || profile.id.length === 0
      || typeof profile.version !== 'string' || profile.version.length === 0) {
      diagnostics.push(createDiagnostic({
        code: diagnosticCodes.profileInvalid,
        severity: 'error',
        message: 'Profiles require kind, non-empty id, and non-empty version.',
        semanticPath,
      }));
      continue;
    }
    const requiredPolicyKeys = [
      'coordinatePolicy',
      'seedPolicy',
      'schema',
      'systems',
      'validation',
      'render',
      'outputs',
    ] as const;
    const missingPolicyKey = requiredPolicyKeys.find((key) => profile[key] === undefined);
    if (missingPolicyKey !== undefined) {
      diagnostics.push(createDiagnostic({
        code: diagnosticCodes.profileInvalid,
        severity: 'error',
        message: `Profile policy is missing required field ${missingPolicyKey}.`,
        semanticPath: `${semanticPath}.${missingPolicyKey}`,
      }));
      continue;
    }
    const invalidObjectPolicyKey = [
      'coordinatePolicy',
      'seedPolicy',
      'schema',
      'validation',
      'render',
      'outputs',
    ].find((key) => !isPlainRecord(profile[key]));
    if (invalidObjectPolicyKey !== undefined || !Array.isArray(profile.systems)
      || !isProjectProfileRecord(profile)) {
      const invalidKey = invalidObjectPolicyKey ?? 'systems';
      diagnostics.push(createDiagnostic({
        code: diagnosticCodes.profileInvalid,
        severity: 'error',
        message: `Profile policy field ${invalidKey} has an invalid container.`,
        semanticPath: `${semanticPath}.${invalidKey}`,
      }));
      continue;
    }
    const typedProfile = profile;
    const identity = `${typedProfile.id}@${typedProfile.version}`;
    const priorPath = seen.get(identity);
    if (priorPath !== undefined) {
      diagnostics.push(createDiagnostic({
        code: diagnosticCodes.profileDuplicate,
        severity: 'error',
        message: `Profile ${identity} is selected more than once.`,
        semanticPath,
        related: [{ semanticPath: priorPath, message: 'The first selection is here.' }],
      }));
      continue;
    }
    seen.set(identity, semanticPath);

    const installedProfile = supportedProfiles.get(identity);
    if (installedProfile === undefined) {
      diagnostics.push(createDiagnostic({
        code: diagnosticCodes.profileUnsupported,
        severity: 'error',
        message: `Project profile ${identity} is not supported by compiler v0.1.`,
        semanticPath,
        hint: 'Goal 1 supports voxel-diorama@0.1.0 only.',
      }));
    } else if (!equalValue(typedProfile, installedProfile)) {
      diagnostics.push(createDiagnostic({
        code: diagnosticCodes.profileContentMismatch,
        severity: 'error',
        message: `Project profile ${identity} does not match the compiler-installed definition.`,
        semanticPath,
        hint: 'Import the named profile from @antiky/contracts/dsl instead of recreating it.',
      }));
      continue;
    }

    const entries = policyEntries(typedProfile);
    const paths = Object.keys(entries).sort().flatMap((key) => leafPaths(entries[key], `$.${key}`));
    expanded.push({
      id: typedProfile.id,
      version: typedProfile.version,
      selection,
      semanticPath,
      profile: typedProfile,
      policyPaths: paths,
    });
    for (const key of Object.keys(entries).sort()) {
      mergeProfileValue(merged, sources, entries[key], semanticPath, `$.${key}`, conflicts);
    }
  }

  conflicts.sort(compareConflicts);
  for (const conflict of conflicts) {
    const related: DiagnosticLocation[] = [
      { semanticPath: conflict.existingSource, message: `Provides ${comparable(conflict.existingValue)}.` },
      { semanticPath: conflict.incomingSource, message: `Provides ${comparable(conflict.incomingValue)}.` },
    ];
    diagnostics.push(createDiagnostic({
      code: diagnosticCodes.profileConflict,
      severity: 'error',
      message: `Selected profiles provide incompatible values for ${conflict.policyPath}.`,
      semanticPath: conflict.incomingSource,
      related,
    }));
  }

  // This is an exact typed incompatibility, not prose interpretation: the named voxel profile
  // cannot coexist with a direction that explicitly forbids the profile's medium itself.
  const voxelProfile = expanded.find(({ id }) => id === 'voxel-diorama');
  if (voxelProfile !== undefined) {
    const explicitVoxelExclusions = new Set(['voxel', 'voxel art', 'voxel diorama', 'voxels']);
    for (const [index, avoided] of (scene.visual?.avoid ?? []).entries()) {
      if (typeof avoided !== 'string') continue;
      if (!explicitVoxelExclusions.has(avoided.trim().toLowerCase())) continue;
      const semanticPath = `$.visual.avoid[${index}]`;
      conflicts.push({
        policyPath: '$.visual.avoid',
        existingSource: voxelProfile.semanticPath,
        incomingSource: semanticPath,
        existingValue: voxelProfile.id,
        incomingValue: avoided,
      });
      diagnostics.push(createDiagnostic({
        code: diagnosticCodes.profileDirectionConflict,
        severity: 'error',
        message: `${voxelProfile.id}@${voxelProfile.version} conflicts with an explicit prohibition of voxel art.`,
        semanticPath,
        related: [{ semanticPath: voxelProfile.semanticPath, message: 'The incompatible profile is selected here.' }],
      }));
    }
  }

  conflicts.sort(compareConflicts);
  const provenance: ProfileProvenance[] = expanded.map(({ id, version, selection, semanticPath, policyPaths }) => ({
    profile: { id, version },
    selection,
    semanticPath,
    policyPaths,
  }));
  const policy = expanded.length === 0 ? undefined : merged as ProjectProfilePolicy;
  return {
    profiles: expanded,
    ...(policy === undefined ? {} : { policy }),
    provenance,
    conflicts,
    diagnostics: sortDiagnostics(diagnostics),
  };
}

export const expandProjectProfiles = expandProfiles;
