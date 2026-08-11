import * as THREE from "three/webgpu";
import {
  pass,
  screenUV,
  uv,
  wgslFn,
} from "three/tsl";

import { CONTROLLED_THREE_TASK } from "./contract.js";
import {
  CONTROLLED_THREE_COMPOSITE_WGSL,
  CONTROLLED_THREE_SCENE_WGSL,
} from "./shader.js";
import type { ControlledThreeTelemetry } from "./telemetry.js";

function createFullScreenGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2),
  );
  return geometry;
}

export async function startControlledThreeRenderer(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  telemetry: ControlledThreeTelemetry,
): Promise<void> {
  const renderer = new THREE.WebGPURenderer({
    alpha: false,
    antialias: false,
    canvas,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.NoToneMapping;
  await renderer.init();
  if (
    (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend !== true
  ) {
    renderer.dispose();
    throw new Error("Three.js initialized without its WebGPU backend");
  }

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const sceneFunction = wgslFn<{
    uv: THREE.Node;
  }>(CONTROLLED_THREE_SCENE_WGSL);
  const compositeFunction = wgslFn<{ color: THREE.Node }>(
    CONTROLLED_THREE_COMPOSITE_WGSL,
  );
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = sceneFunction({
    uv: uv(),
  }) as THREE.Node<"vec4">;
  material.depthTest = false;
  material.depthWrite = false;
  const mesh = new THREE.Mesh(createFullScreenGeometry(), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const scenePass = pass(scene, camera, {
    depthBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    stencilBuffer: false,
    type: THREE.HalfFloatType,
  });
  const renderPipeline = new THREE.RenderPipeline(renderer);
  renderPipeline.outputNode = compositeFunction({
    color: scenePass.getTextureNode().sample(screenUV).rgb,
  });
  telemetry.assetsReadyAt = performance.now();

  let frameIndex = 0;
  let previousTime: number | undefined;
  let smoothedFps = 0;
  let stopped = false;
  const fail = (error: unknown): void => {
    if (stopped) return;
    stopped = true;
    telemetry.status = "error";
    telemetry.error = error instanceof Error ? error.message : String(error);
    console.error(error);
    void renderer.setAnimationLoop(null);
  };
  renderer.onDeviceLost = (info): void => fail(
    `WebGPU device lost: ${info.message}`,
  );

  await renderer.setAnimationLoop((timeMs): void => {
    if (stopped) return;
    try {
      const cpuStarted = performance.now();
      renderPipeline.render();
      const cpuTimeMs = performance.now() - cpuStarted;
      const elapsed = previousTime === undefined ? 0 : timeMs - previousTime;
      previousTime = timeMs;
      if (elapsed > 0) {
        const fps = 1000 / elapsed;
        smoothedFps = smoothedFps === 0 ? fps : smoothedFps * 0.9 + fps * 0.1;
      }
      telemetry.firstFrameAt ??= performance.now();
      telemetry.status = "ready";
      telemetry.latestFrame = {
        cpuTimeMs,
        fps: smoothedFps,
        frameIndex,
        lights: CONTROLLED_THREE_TASK.analyticLights,
        totalMeshes: 1,
        visibleMeshes: 1,
        vram: `${(renderer.info.memory.total / (1024 * 1024)).toFixed(1)} MiB Three.js tracked`,
      };
      frameIndex += 1;
    } catch (error: unknown) {
      fail(error);
    }
  });
}
