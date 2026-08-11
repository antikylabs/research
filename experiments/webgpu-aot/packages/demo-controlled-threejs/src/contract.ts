export const CONTROLLED_THREE_TASK = Object.freeze({
  analyticLights: 32,
  comparisonRole: "framework-architecture",
  logicalDraws: 2,
  logicalRenderStages: 2,
  sampleCount: 1,
  taskId: "full-screen-static-32-light-ggx-aces-v1",
});

const PROFILES = Object.freeze({
  smoke: { height: 720, name: "smoke", width: 1280 },
  heavy: { height: 1440, name: "heavy", width: 2560 },
  extreme: { height: 2160, name: "extreme", width: 3840 },
} as const);

export type ControlledThreeProfile = keyof typeof PROFILES;

export function resolveControlledThreeProfile(requested: string | null) {
  return requested === "smoke" || requested === "extreme"
    ? PROFILES[requested]
    : PROFILES.heavy;
}
