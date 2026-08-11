import { create, globals } from "webgpu";
import { describe, expect, it } from "vitest";
import * as THREE from "three/webgpu";

import { createLightRig } from "../src/light-rig.js";
import { createNativeRenderPipeline } from "../src/pipeline.js";

Object.assign(globalThis, globals);
Object.defineProperty(globalThis, "self", {
  configurable: true,
  value: {
    cancelAnimationFrame(): void {},
    requestAnimationFrame(): number {
      return 0;
    },
  },
});

function createHeadlessCanvas(): HTMLCanvasElement {
  return {
    height: 64,
    style: {},
    width: 64,
  } as unknown as HTMLCanvasElement;
}

describe("Three.js native WebGPU workload", () => {
  it("submits the complete light, shadow, and TSL graph through Dawn", async () => {
    let gpu = create([]);
    let adapter = await gpu.requestAdapter();
    if (adapter === null) {
      gpu = create(["backend=null"]);
      adapter = await gpu.requestAdapter();
    }
    if (adapter === null) {
      throw new Error("Dawn did not provide a WebGPU adapter");
    }
    const device = await adapter.requestDevice();
    const renderer = new THREE.WebGPURenderer({
      canvas: createHeadlessCanvas(),
      device,
      alpha: false,
    });
    const errors: string[] = [];

    try {
      await renderer.init();
      renderer.onError = (errorMessage): void => {
        errors.push(String(errorMessage));
      };
      renderer.setSize(64, 64, false);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setRenderTarget(
        new THREE.RenderTarget(64, 64, {
          depthBuffer: true,
          stencilBuffer: true,
          type: THREE.HalfFloatType,
        }),
      );

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
      camera.position.set(9.3, 3.4, -0.35);
      camera.lookAt(0, 2, 0);
      camera.updateMatrixWorld();
      const material = new THREE.MeshStandardMaterial({
        metalness: 0.2,
        roughness: 0.6,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
      mesh.position.y = 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      const lightRig = createLightRig(scene, camera);
      expect(lightRig.pointLightCount).toBe(474);
      const pipeline = createNativeRenderPipeline(renderer, scene, camera);
      pipeline.render();
      await device.queue.onSubmittedWorkDone();

      expect(errors).toEqual([]);
      expect(renderer.info.render.drawCalls).toBeGreaterThan(0);
      expect(renderer.info.memory.renderTargets).toBeGreaterThan(3);
    } finally {
      renderer.dispose();
      device.destroy();
    }
  }, 90_000);
});
