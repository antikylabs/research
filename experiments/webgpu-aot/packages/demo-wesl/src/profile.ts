export const WORKLOAD_PROFILES = {
  smoke: { width: 1280, height: 720, lights: 32 },
  heavy: { width: 2560, height: 1440, lights: 32 },
  extreme: { width: 3840, height: 2160, lights: 32 },
} as const;

export const WESL_POST_EXPOSURE = 1;
export const WESL_POST_SPATIAL_BLEND = 0;

export type WorkloadProfileName = keyof typeof WORKLOAD_PROFILES;

export function resolveWorkloadProfile(value: string | null): WorkloadProfileName {
  return value === "smoke" || value === "extreme" ? value : "heavy";
}
