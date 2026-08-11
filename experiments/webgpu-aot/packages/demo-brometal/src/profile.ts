export const WORKLOAD_PROFILES = {
  smoke: { width: 1280, height: 720, analyticLights: 32 },
  heavy: { width: 2560, height: 1440, analyticLights: 32 },
  extreme: { width: 3840, height: 2160, analyticLights: 32 },
} as const;

export const BROMETAL_COMPOSITE_EXPOSURE = 1;

export type WorkloadProfileName = keyof typeof WORKLOAD_PROFILES;

export function createBroMetalCompositeSettings(
  width: number,
  height: number,
): Float32Array<ArrayBuffer> {
  return new Float32Array([0, BROMETAL_COMPOSITE_EXPOSURE, width, height]);
}

export function resolveWorkloadProfile(
  requested: string | null | undefined,
): WorkloadProfileName {
  return requested === "smoke" || requested === "extreme"
    ? requested
    : "heavy";
}
