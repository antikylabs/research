import type { WorkloadProfileName } from "./profile.js";

export interface WorkloadFrameMetrics {
  readonly frameIndex: number;
  readonly cpuTimeMs: number;
  readonly fps: number;
  readonly lights: number;
  readonly visibleMeshes: number;
  readonly totalMeshes: number;
  readonly vram: string;
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
  latestFrame?: WorkloadFrameMetrics;
  error?: string;
}
