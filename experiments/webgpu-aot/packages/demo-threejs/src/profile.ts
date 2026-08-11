export const WORKLOAD_PROFILES = {
  smoke: { width: 1280, height: 720, benchmark: false },
  heavy: { width: 2560, height: 1440, benchmark: true },
  extreme: { width: 3840, height: 2160, benchmark: true },
} as const;

export type WorkloadProfileName = keyof typeof WORKLOAD_PROFILES;

export function resolveWorkloadProfile(
  requested: string | null | undefined,
): WorkloadProfileName {
  return requested === "smoke" || requested === "extreme"
    ? requested
    : "heavy";
}
