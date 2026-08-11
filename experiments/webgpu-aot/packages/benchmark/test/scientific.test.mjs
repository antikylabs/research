import assert from "node:assert/strict";
import test from "node:test";

import {
  assessComparability,
  buildRunSchedule,
  deriveWebGpuMetrics,
} from "../scripts/scientific.mjs";

test("counterbalances demo order across five repetitions", () => {
  const demos = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];
  const schedule = buildRunSchedule(demos, 5);
  assert.equal(schedule.length, 25);
  for (const demo of demos) {
    const positions = schedule
      .filter(({ demo: candidate }) => candidate.id === demo.id)
      .map(({ position }) => position)
      .sort();
    assert.deepEqual(positions, [0, 1, 2, 3, 4]);
  }
});

test("derives per-frame WebGPU work and live allocation estimates", () => {
  const metrics = deriveWebGpuMetrics({
    after: {
      counters: {
        copyBufferToBufferBytes: 256,
        copyBufferToBufferCalls: 4,
        copyTextureToBufferBytes: 128,
        copyTextureToBufferCalls: 2,
        drawIndexedCalls: 206,
        mapAsyncReadBytes: 64,
        mapAsyncReadCalls: 2,
        mappedAtCreationBytes: 512,
        mappedAtCreationCalls: 4,
        queueSubmits: 2,
        renderPasses: 50,
        writeBufferBytes: 96,
        writeBufferCalls: 6,
        writeTextureBytes: 32,
        writeTextureCalls: 2,
      },
      resources: { liveBufferBytes: 10, liveTextureBytes: 90, liveBufferCount: 2, liveTextureCount: 3, texturesWithUnknownSize: 1 },
    },
    before: {
      counters: {
        drawIndexedCalls: 0,
        mapAsyncReadBytes: 0,
        mapAsyncReadCalls: 0,
        mappedAtCreationBytes: 512,
        mappedAtCreationCalls: 4,
        queueSubmits: 0,
        renderPasses: 2,
        writeBufferBytes: 0,
        writeBufferCalls: 0,
        writeTextureBytes: 0,
        writeTextureCalls: 0,
      },
    },
    frames: 2,
  });
  assert.equal(metrics.drawIndexedCallsPerFrame, 103);
  assert.equal(metrics.renderPassesPerFrame, 24);
  assert.equal(metrics.queueSubmitsPerFrame, 1);
  assert.equal(metrics.cpuToGpuQueueWriteCallsPerFrame, 4);
  assert.equal(metrics.cpuToGpuQueueWriteBytesPerFrame, 64);
  assert.equal(metrics.gpuToCpuMapReadCallsPerFrame, 1);
  assert.equal(metrics.gpuToCpuMapReadBytesPerFrame, 32);
  assert.equal(metrics.gpuInternalCopyCallsPerFrame, 3);
  assert.equal(metrics.gpuInternalCopyBytesPerFrame, 192);
  assert.equal(metrics.preCaptureMappedAtCreationCalls, 4);
  assert.equal(metrics.preCaptureMappedAtCreationBytes, 512);
  assert.equal(metrics.estimatedLiveGpuBytes, 100);
});

test("refuses attribution when measured workloads differ materially", () => {
  const audit = assessComparability([
    { id: "a", name: "A", summary: { drawIndexedCallsPerFrame: { mean: 309 }, sceneWidth: { mean: 2560 } } },
    { id: "b", name: "B", summary: { drawIndexedCallsPerFrame: { mean: 412 }, sceneWidth: { mean: 2560 } } },
  ]);
  assert.equal(audit.attributionSafe, false);
  assert.equal(audit.dimensions.find(({ key }) => key === "sceneWidth").status, "matched");
  assert.equal(audit.dimensions.find(({ key }) => key === "drawIndexedCallsPerFrame").status, "mismatched");
});

test("refuses attribution when only one implementation was captured", () => {
  const audit = assessComparability([
    { id: "a", name: "A", summary: { sceneWidth: { mean: 2560 } } },
  ]);
  assert.equal(audit.attributionSafe, false);
  assert.match(audit.verdict, /two implementations/);
});

const measured = (value) => ({ mean: value });
const nativeDemo = (id, overrides = {}) => ({
  comparisonRole: "native-authoring-system",
  id,
  name: id.toUpperCase(),
  rendererContract: {
    ambientOcclusion: "depth-normal-16",
    bloom: "five-level-separable",
    directLighting: "ggx-schlick",
    environmentLighting: "source-cube-analytic-dfg",
    reflections: "depth-march-24",
    shadingPath: "forward-material",
    temporalResolve: "halton-history-clamp",
  },
  summary: {
    commandEncodersPerFrame: measured(1),
    computePassesPerFrame: measured(0),
    drawCallsPerFrame: measured(22),
    drawIndexedCallsPerFrame: measured(309),
    maxSampleCount: measured(1),
    queueSubmitsPerFrame: measured(1),
    renderPassesPerFrame: measured(25),
    sceneAnalyticLights: measured(32),
    sceneHeight: measured(900),
    sceneMeshes: measured(103),
    sceneParticles: measured(406),
    sceneSimulatedLights: measured(32),
    sceneWidth: measured(1440),
    submittedCommandBuffersPerFrame: measured(1),
    totalIndicesPerFrame: measured(1234),
    totalInstancesPerFrame: measured(406),
    totalVerticesPerFrame: measured(5678),
    gpuInternalCopyCallsPerFrame: measured(0),
    gpuToCpuMapReadCallsPerFrame: measured(0),
    writeBufferCallsPerFrame: measured(4),
    writeBufferBytesPerFrame: measured(14208),
    writeTextureCallsPerFrame: measured(0),
    writeTextureBytesPerFrame: measured(0),
  },
  ...overrides,
});

test("requires scene, native command topology, and declared shader contracts before attribution", () => {
  const audit = assessComparability([
    nativeDemo("a"),
    nativeDemo("b", { rendererContract: { ...nativeDemo("b").rendererContract, directLighting: "normalized-blinn-phong" } }),
    {
      ...nativeDemo("threejs"),
      comparisonRole: "framework-reference",
      name: "Three.js",
      rendererContract: { ...nativeDemo("threejs").rendererContract, shadingPath: "framework-managed" },
      summary: { ...nativeDemo("threejs").summary, drawIndexedCallsPerFrame: measured(384) },
    },
  ]);
  assert.deepEqual(audit.cohortIds, ["a", "b"]);
  assert.deepEqual(audit.referenceIds, ["threejs"]);
  assert.equal(audit.gates.sceneTask.status, "matched");
  assert.equal(audit.gates.nativeCommandTopology.status, "matched");
  assert.equal(audit.gates.declaredShaderContract.status, "mismatched");
  assert.equal(audit.attributionSafe, false);
  assert.equal(audit.declaredShaderDimensions.find(({ key }) => key === "directLighting").status, "mismatched");
  assert.match(audit.verdict, /shader contracts differ/i);
});

test("does not let the framework reference invalidate an otherwise matched native topology", () => {
  const audit = assessComparability([
    nativeDemo("a"),
    nativeDemo("b"),
    {
      ...nativeDemo("threejs"),
      comparisonRole: "framework-reference",
      summary: { ...nativeDemo("threejs").summary, drawIndexedCallsPerFrame: measured(384) },
    },
  ]);
  assert.equal(audit.gates.nativeCommandTopology.status, "matched");
  assert.equal(audit.attributionSafe, true);
});
