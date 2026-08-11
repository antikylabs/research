import "./style.css";

import {
  CONTROLLED_THREE_TASK,
  resolveControlledThreeProfile,
} from "./contract.js";
import { startControlledThreeRenderer } from "./renderer.js";
import type { ControlledThreeTelemetry } from "./telemetry.js";

const canvas = document.querySelector<HTMLCanvasElement>("#demo");
const identity = document.querySelector<HTMLElement>("#identity");
if (canvas === null || identity === null) {
  throw new Error("Controlled Three.js page is incomplete");
}
const startupStartedAt = performance.now();
const profile = resolveControlledThreeProfile(
  new URLSearchParams(location.search).get("profile"),
);
canvas.width = profile.width;
canvas.height = profile.height;
identity.textContent = "Three.js controlled framework architecture arm";
const telemetry: ControlledThreeTelemetry = {
  experiment: "controlled-renderer-architecture",
  height: profile.height,
  implementation: "Three.js controlled framework",
  implementationId: "threejs-framework",
  profile: profile.name,
  startupStartedAt,
  status: "initializing",
  taskDynamics: "static",
  taskId: CONTROLLED_THREE_TASK.taskId,
  width: profile.width,
};
(window as Window & { __WEBGPU_AOT__?: ControlledThreeTelemetry })
  .__WEBGPU_AOT__ = telemetry;

startControlledThreeRenderer(
  canvas,
  profile.width,
  profile.height,
  telemetry,
).catch((error: unknown) => {
  telemetry.status = "error";
  telemetry.error = error instanceof Error ? error.message : String(error);
  identity.textContent = telemetry.error;
  console.error(error);
});
