import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArchitectureSummary,
  buildControlledSummary,
} from "../scripts/results.mjs";

test("controlled summaries retain null-control labels and raw samples", () => {
  const metadata = {
    configuration: { runs: 2, sampleDurationMs: 10_000 },
    environment: { platform: "test" },
    generatedAt: "2026-08-10T00:00:00.000Z",
  };
  const implementations = [{
    id: "brometal-aot",
    name: "BroMetal AOT artifact",
    runs: [
      {
        evidence: { artifact: { shaderHash: "same" } },
        index: 1,
        metrics: { averageFps: 50 },
        series: { frameTimesMs: [20] },
      },
      {
        evidence: { artifact: { shaderHash: "same" } },
        index: 2,
        metrics: { averageFps: 60 },
        series: { frameTimesMs: [16.67] },
      },
    ],
  }];

  const summary = buildControlledSummary(metadata, implementations);
  assert.equal(summary.experiment.id, "identical-wgsl-null-control");
  assert.equal(summary.experiment.causalClaimSupported, false);
  assert.deepEqual(summary.implementations[0].samples.averageFps, [50, 60]);
  assert.equal(summary.implementations[0].summary.averageFps.mean, 55);
  assert.deepEqual(summary.implementations[0].series, [
    { frameTimesMs: [20], index: 1 },
    { frameTimesMs: [16.67], index: 2 },
  ]);
  assert.deepEqual(
    summary.implementations[0].evidence.artifact.shaderHashes,
    ["same"],
  );
});

test("architecture summaries keep renderer and authoring claims separate", () => {
  const metadata = {
    configuration: { runs: 1, sampleDurationMs: 10_000 },
    environment: { platform: "test" },
    generatedAt: "2026-08-10T00:00:00.000Z",
  };
  const taskMetrics = {
    maxSampleCount: 1,
    sceneAnalyticLights: 32,
    sceneHeight: 1440,
    sceneMeshes: 1,
    sceneWidth: 2560,
  };
  const implementations = ["raw-webgpu-control", "threejs-framework"].map((id) => ({
    id,
    name: id,
    runs: [{
      evidence: { task: { taskId: "full-screen-static-32-light-ggx-aces-v1" } },
      index: 1,
      metrics: taskMetrics,
      series: {},
    }],
  }));
  const summary = buildArchitectureSummary(metadata, implementations);
  assert.equal(summary.experiment.id, "controlled-renderer-architecture");
  assert.equal(summary.architectureControl.taskMatched, true);
  assert.equal(summary.architectureControl.rendererArchitectureClaimSupported, true);
  assert.equal(summary.architectureControl.authoringSystemClaimSupported, false);
});
