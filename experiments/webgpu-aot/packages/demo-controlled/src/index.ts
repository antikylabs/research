import "./style.css";

import {
  CONTROLLED_EXPERIMENT,
  CONTROLLED_PROFILES,
  CONTROLLED_STATIC_TASK_ID,
  CONTROLLED_TASK_ID,
  resolveControlledImplementation,
  resolveControlledProfile,
  resolveControlledTaskDynamics,
} from "./contract.js";
import { startControlledRenderer } from "./renderer.js";
import type { ControlledTelemetry } from "./telemetry.js";

const canvas = document.querySelector<HTMLCanvasElement>("#demo");
const identity = document.querySelector<HTMLElement>("#identity");
if (canvas === null || identity === null) {
  throw new Error("Controlled benchmark page is incomplete");
}

const startupStartedAt = performance.now();
const parameters = new URLSearchParams(window.location.search);
const implementation = resolveControlledImplementation(
  parameters.get("implementation"),
);
const profileName = resolveControlledProfile(parameters.get("profile"));
const taskDynamics = resolveControlledTaskDynamics(parameters.get("staticTask"));
const profile = CONTROLLED_PROFILES[profileName];
identity.textContent = `${implementation.name} · byte-identical WGSL null control`;

const telemetry: ControlledTelemetry = {
  experiment: CONTROLLED_EXPERIMENT,
  height: profile.height,
  implementation: implementation.name,
  implementationId: implementation.id,
  profile: profileName,
  startupStartedAt,
  status: "initializing",
  taskDynamics,
  taskId: taskDynamics === "static"
    ? CONTROLLED_STATIC_TASK_ID
    : CONTROLLED_TASK_ID,
  width: profile.width,
};
(window as Window & { __WEBGPU_AOT__?: ControlledTelemetry }).__WEBGPU_AOT__ =
  telemetry;

startControlledRenderer(
  canvas,
  implementation.id,
  profileName,
  telemetry,
  taskDynamics,
).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  telemetry.error = message;
  telemetry.status = "error";
  identity.textContent = message;
  console.error(error);
});
