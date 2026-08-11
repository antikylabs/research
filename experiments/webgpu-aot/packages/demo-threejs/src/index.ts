import "./style.css";

import * as THREE from "three/webgpu";

import { loadEnvironmentAndSponza } from "./assets.js";
import { createLightRig } from "./light-rig.js";
import { createLoadingDisplay } from "./loading.js";
import { createNativeRenderPipeline } from "./pipeline.js";
import { resolveWorkloadProfile, WORKLOAD_PROFILES } from "./profile.js";
import type { WorkloadTelemetry } from "./telemetry.js";

const FIXED_TIME_STEP_SECONDS = 1 / 60;
const startupStartedAt = performance.now();
const canvas = document.querySelector<HTMLCanvasElement>("#demo");

if (canvas === null) {
  throw new Error("Demo canvas was not found");
}
const demoCanvas: HTMLCanvasElement = canvas;

const profileName = resolveWorkloadProfile(
  new URLSearchParams(window.location.search).get("profile"),
);
const profile = WORKLOAD_PROFILES[profileName];
const display = createLoadingDisplay(document);
const telemetry: WorkloadTelemetry = {
  implementation: "Three.js native",
  profile: profileName,
  status: "initializing",
  width: profile.width,
  height: profile.height,
  startupStartedAt,
};
(window as Window & { __WEBGPU_AOT__?: WorkloadTelemetry }).__WEBGPU_AOT__ = telemetry;

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "Three.js managed";
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB tracked`;
}

async function start(): Promise<void> {
  if (navigator.gpu === undefined) {
    throw new Error("WebGPU is unavailable in this browser");
  }

  display.update(1, 8, "Initializing the native Three.js WebGPU backend");
  const renderer = new THREE.WebGPURenderer({
    canvas: demoCanvas,
    antialias: false,
    alpha: false,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(profile.width, profile.height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  await renderer.init();
  display.update(2, 8, "Verifying the framework-selected GPU backend");

  if (
    (renderer.backend as { readonly isWebGPUBackend?: boolean })
      .isWebGPUBackend !== true
  ) {
    renderer.dispose();
    throw new Error("Three.js initialized without its WebGPU backend");
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    70,
    profile.width / profile.height,
    0.1,
    100,
  );
  camera.position.set(9.3, 3.4, -0.35);
  camera.lookAt(0, 2, 0);
  camera.updateMatrixWorld();
  display.update(3, 8, "Constructing the framework scene and camera graph");

  telemetry.status = "loading";
  display.update(4, 8, "Loading all 103 Sponza primitives and 69 textures");
  const assets = await loadEnvironmentAndSponza(scene, renderer);
  display.update(6, 8, "Compiling native materials, shadows, and environment maps");
  const lightRig = createLightRig(scene, camera);
  const nativePipeline = createNativeRenderPipeline(renderer, scene, camera);
  display.update(7, 8, "Building the ten-stage TSL post-processing graph");
  telemetry.assetsReadyAt = performance.now();

  let frameIndex = 0;
  let previousCallbackTime: number | undefined;
  let smoothedFps = 0;
  let stopped = false;

  const stopWithError = (error: unknown): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    const message = error instanceof Error ? error.message : String(error);
    telemetry.status = "error";
    telemetry.error = message;
    display.fail(message);
    console.error(error);
    void renderer.setAnimationLoop(null);
  };

  renderer.onDeviceLost = (info): void => {
    stopWithError(`WebGPU device lost: ${info.message}`);
  };

  await renderer.setAnimationLoop((callbackTime): void => {
    if (stopped) {
      return;
    }

    try {
      const cpuStartedAt = performance.now();
      if (frameIndex > 0) {
        lightRig.step(
          frameIndex * FIXED_TIME_STEP_SECONDS,
          FIXED_TIME_STEP_SECONDS,
        );
      }
      lightRig.updateBillboards();
      nativePipeline.render();
      const cpuTimeMs = performance.now() - cpuStartedAt;

      const elapsed =
        previousCallbackTime === undefined
          ? 0
          : Math.max(callbackTime - previousCallbackTime, 0.001);
      previousCallbackTime = callbackTime;
      if (elapsed > 0) {
        const currentFps = 1000 / elapsed;
        smoothedFps =
          smoothedFps === 0
            ? currentFps
            : smoothedFps * 0.9 + currentFps * 0.1;
      }

      if (telemetry.firstFrameAt === undefined) {
        telemetry.firstFrameAt = performance.now();
        telemetry.status = "ready";
      }
      telemetry.latestFrame = {
        frameIndex,
        cpuTimeMs,
        fps: smoothedFps,
        lights: lightRig.pointLightCount,
        visibleMeshes: assets.meshCount,
        totalMeshes: assets.meshCount,
        vram: formatBytes(renderer.info.memory.total),
      };

      if (frameIndex % 30 === 0) {
        display.ready(
          `Three.js native · ${profileName} ${profile.width}×${profile.height} · ` +
            `${assets.meshCount} meshes · ${lightRig.pointLightCount} simulated lights · ` +
            `${lightRig.analyticPointLightCount} native forward slots · ` +
            `${nativePipeline.stageCount} TSL stages · ${smoothedFps.toFixed(1)} fps`,
        );
      }
      frameIndex += 1;
    } catch (error: unknown) {
      stopWithError(error);
    }
  });
}

start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  telemetry.status = "error";
  telemetry.error = message;
  display.fail(message);
  console.error(error);
});
