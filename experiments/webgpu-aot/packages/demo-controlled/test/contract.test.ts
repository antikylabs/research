import { createHash } from "node:crypto";

import { create, globals } from "webgpu";
import { describe, expect, it } from "vitest";

import {
  CONTROLLED_IMPLEMENTATIONS,
  CONTROLLED_WORKLOAD,
  controlledShaderFor,
  hashControlledShader,
  resolveControlledTaskDynamics,
} from "../src/contract.js";
import { createControlledPipelines } from "../src/renderer.js";

Object.assign(globalThis, globals);

describe("controlled identical-WGSL experiment", () => {
  it("keeps five packaging identities outside the representative demos", () => {
    expect(CONTROLLED_IMPLEMENTATIONS).toEqual([
      { id: "brometal-aot", name: "BroMetal AOT artifact" },
      { id: "typegpu-runtime", name: "TypeGPU runtime artifact" },
      { id: "antiky-aot", name: "TypeGPU-Antiky AOT artifact" },
      { id: "wesl-static", name: "WESL static artifact" },
      { id: "threejs-framework", name: "Three.js framework artifact" },
    ]);
  });

  it("delivers byte-identical WGSL for every null-control identity", () => {
    const artifacts = CONTROLLED_IMPLEMENTATIONS.map(({ id }) =>
      controlledShaderFor(id),
    );
    expect(new Set(artifacts).size).toBe(1);
    expect(
      new Set(
        artifacts.map((source) =>
          createHash("sha256").update(source).digest("hex"),
        ),
      ).size,
    ).toBe(1);
  });

  it("publishes the SHA-256 of the shader bytes used by the browser", async () => {
    const source = controlledShaderFor("brometal-aot");
    await expect(hashControlledShader(source)).resolves.toBe(
      createHash("sha256").update(source).digest("hex"),
    );
  });

  it("pins one shared frame graph and workload", () => {
    expect(CONTROLLED_WORKLOAD).toEqual({
      analyticLights: 32,
      commandEncodersPerFrame: 1,
      drawCallsPerFrame: 2,
      renderPassesPerFrame: 2,
      sampleCount: 1,
      submittedCommandBuffersPerFrame: 1,
      uniformWriteBytesPerFrame: 16,
      uniformWriteCallsPerFrame: 1,
    });
  });

  it("keeps the null baseline dynamic but supports an explicit static architecture task", () => {
    expect(resolveControlledTaskDynamics(null)).toBe("dynamic");
    expect(resolveControlledTaskDynamics("1")).toBe("static");
  });

  it("creates the complete shared pipeline graph without Dawn validation errors", async () => {
    let gpu = create([]);
    let adapter = await gpu.requestAdapter();
    if (adapter === null) {
      gpu = create(["backend=null"]);
      adapter = await gpu.requestAdapter();
    }
    if (adapter === null) throw new Error("Dawn did not provide an adapter");

    const device = await adapter.requestDevice();
    try {
      device.pushErrorScope("validation");
      const graph = await createControlledPipelines(
        device,
        controlledShaderFor("brometal-aot"),
        "bgra8unorm",
      );
      expect(graph.scenePipeline).toBeDefined();
      expect(graph.compositePipeline).toBeDefined();
      expect(await device.popErrorScope()).toBeNull();
    } finally {
      device.destroy();
    }
  });
});
