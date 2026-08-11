import type { WorkloadProfileName } from "./profile.js";

export function countTypeGpuIndexedGeometryDraws(
  primitiveCount: number,
): number {
  return primitiveCount * 3;
}

export interface WorkloadTelemetry {
  implementation: string;
  profile: WorkloadProfileName;
  status: "initializing" | "loading" | "ready" | "error" | "stopped";
  width: number;
  height: number;
  startupStartedAt: number;
  assetsReadyAt?: number;
  firstFrameAt?: number;
  error?: string;
  latestFrame?: {
    frameIndex: number;
    cpuTimeMs: number;
    fps: number;
    lights: number;
    visibleMeshes: number;
    totalMeshes: number;
    vram: string;
  };
}
