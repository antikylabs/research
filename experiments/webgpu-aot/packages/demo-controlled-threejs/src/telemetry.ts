import type { ControlledThreeProfile } from "./contract.js";

export interface ControlledThreeTelemetry {
  assetsReadyAt?: number;
  error?: string;
  experiment: "controlled-renderer-architecture";
  firstFrameAt?: number;
  height: number;
  implementation: "Three.js controlled framework";
  implementationId: "threejs-framework";
  latestFrame?: {
    cpuTimeMs: number;
    fps: number;
    frameIndex: number;
    lights: number;
    totalMeshes: number;
    visibleMeshes: number;
    vram: string;
  };
  profile: ControlledThreeProfile;
  startupStartedAt: number;
  status: "initializing" | "ready" | "error" | "stopped";
  taskDynamics: "static";
  taskId: "full-screen-static-32-light-ggx-aces-v1";
  width: number;
}
