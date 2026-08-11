import type {
  ControlledImplementationId,
  ControlledProfile,
} from "./contract.js";

export interface ControlledTelemetry {
  implementation: string;
  implementationId: ControlledImplementationId;
  experiment: "identical-wgsl-null-control";
  profile: ControlledProfile;
  status: "initializing" | "ready" | "error" | "stopped";
  taskDynamics: "dynamic" | "static";
  taskId:
    | "full-screen-32-light-ggx-aces-v1"
    | "full-screen-static-32-light-ggx-aces-v1";
  width: number;
  height: number;
  startupStartedAt: number;
  shaderHash?: string;
  assetsReadyAt?: number;
  firstFrameAt?: number;
  error?: string;
  latestFrame?: {
    cpuTimeMs: number;
    fps: number;
    frameIndex: number;
    lights: number;
    totalMeshes: number;
    visibleMeshes: number;
    vram: string;
  };
}
