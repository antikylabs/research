import "./style.css";

import { createLoadingDisplay } from "./loading.js";
import { resolveWorkloadProfile, WORKLOAD_PROFILES } from "./profile.js";
import { startAntikyRenderer } from "./renderer.js";
import type { WorkloadTelemetry } from "./telemetry.js";

const startupStartedAt = performance.now();
const canvas = document.querySelector<HTMLCanvasElement>("#demo");

if (canvas === null) throw new Error("Demo canvas was not found");

const profileName = resolveWorkloadProfile(
  new URLSearchParams(window.location.search).get("profile"),
);
const profile = WORKLOAD_PROFILES[profileName];
const display = createLoadingDisplay(document);
const telemetry: WorkloadTelemetry = {
  implementation: "TypeGPU-Antiky AOT",
  profile: profileName,
  status: "initializing",
  width: profile.width,
  height: profile.height,
  startupStartedAt,
};
(window as Window & { __WEBGPU_AOT__?: WorkloadTelemetry }).__WEBGPU_AOT__ = telemetry;

startAntikyRenderer(canvas, profileName, display, telemetry).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  telemetry.status = "error";
  telemetry.error = message;
  display.fail(message);
  console.error(error);
});
