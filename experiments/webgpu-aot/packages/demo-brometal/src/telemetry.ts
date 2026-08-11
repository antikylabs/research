import type { WorkloadProfileName } from "./profile.js";
import { BROMETAL_SUN } from "./sun.js";

export function countBroMetalIndexedGeometryDraws(primitiveCount: number): number {
  return primitiveCount * (BROMETAL_SUN.shadow.cascadeCount + 1);
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
