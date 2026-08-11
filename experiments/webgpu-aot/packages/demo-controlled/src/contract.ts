import { CONTROLLED_WGSL } from "./shader.js";

export const CONTROLLED_IMPLEMENTATIONS = [
  { id: "brometal-aot", name: "BroMetal AOT artifact" },
  { id: "typegpu-runtime", name: "TypeGPU runtime artifact" },
  { id: "antiky-aot", name: "TypeGPU-Antiky AOT artifact" },
  { id: "wesl-static", name: "WESL static artifact" },
  { id: "threejs-framework", name: "Three.js framework artifact" },
] as const;

export type ControlledImplementationId =
  (typeof CONTROLLED_IMPLEMENTATIONS)[number]["id"];

export const CONTROLLED_EXPERIMENT = "identical-wgsl-null-control" as const;
export const CONTROLLED_TASK_ID = "full-screen-32-light-ggx-aces-v1" as const;
export const CONTROLLED_STATIC_TASK_ID = "full-screen-static-32-light-ggx-aces-v1" as const;

export const CONTROLLED_WORKLOAD = Object.freeze({
  analyticLights: 32,
  commandEncodersPerFrame: 1,
  drawCallsPerFrame: 2,
  renderPassesPerFrame: 2,
  sampleCount: 1,
  submittedCommandBuffersPerFrame: 1,
  uniformWriteBytesPerFrame: 16,
  uniformWriteCallsPerFrame: 1,
});

export const CONTROLLED_PROFILES = Object.freeze({
  smoke: { height: 720, width: 1280 },
  heavy: { height: 1440, width: 2560 },
  extreme: { height: 2160, width: 3840 },
});

export type ControlledProfile = keyof typeof CONTROLLED_PROFILES;

export function resolveControlledImplementation(
  requested: string | null | undefined,
): (typeof CONTROLLED_IMPLEMENTATIONS)[number] {
  return CONTROLLED_IMPLEMENTATIONS.find(({ id }) => id === requested) ??
    CONTROLLED_IMPLEMENTATIONS[0];
}

export function resolveControlledProfile(
  requested: string | null | undefined,
): ControlledProfile {
  return requested === "smoke" || requested === "extreme"
    ? requested
    : "heavy";
}

export function resolveControlledTaskDynamics(
  staticRequested: string | null | undefined,
): "dynamic" | "static" {
  return staticRequested === "1" ? "static" : "dynamic";
}

export function controlledShaderFor(
  implementation: ControlledImplementationId,
): string {
  if (!CONTROLLED_IMPLEMENTATIONS.some(({ id }) => id === implementation)) {
    throw new Error(`Unknown controlled implementation: ${implementation}`);
  }
  return CONTROLLED_WGSL;
}

export async function hashControlledShader(source: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
