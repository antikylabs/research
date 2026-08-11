export const WORKLOAD_PROFILES = {
  smoke: { width: 1280, height: 720, lights: 32 },
  heavy: { width: 2560, height: 1440, lights: 32 },
  extreme: { width: 3840, height: 2160, lights: 32 },
} as const;

export const ANTIKY_AMBIENT_OCCLUSION_STRENGTH = 6;
export const ANTIKY_COMPOSITE_EXPOSURE = 1;

export type WorkloadProfileName = keyof typeof WORKLOAD_PROFILES;

export function resolveWorkloadProfile(
  requested: string | null | undefined,
): WorkloadProfileName {
  return requested === "smoke" || requested === "extreme" ? requested : "heavy";
}
