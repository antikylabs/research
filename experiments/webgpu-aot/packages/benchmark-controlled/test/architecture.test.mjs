import assert from "node:assert/strict";
import test from "node:test";

import {
  ARCHITECTURE_IMPLEMENTATIONS,
  assessArchitectureControl,
  parseArchitectureArguments,
  validateArchitectureCapture,
} from "../scripts/architecture.mjs";

const taskMetrics = {
  maxSampleCount: 1,
  sceneAnalyticLights: 32,
  sceneHeight: 1440,
  sceneMeshes: 1,
  sceneWidth: 2560,
};

test("architecture control includes raw WebGPU and a real Three.js adapter", () => {
  assert.deepEqual(
    ARCHITECTURE_IMPLEMENTATIONS.map(({ id, workspace }) => ({ id, workspace })),
    [
      { id: "raw-webgpu-control", workspace: "demo-controlled" },
      { id: "threejs-framework", workspace: "demo-controlled-threejs" },
    ],
  );
  const options = parseArchitectureArguments([]);
  assert.equal(options.runs, 10);
  assert.equal(options.sampleDurationMs, 10_000);
  assert.equal(options.output, "public/architecture-results");
});

test("architecture capture validation pins the task but allows topology to differ", () => {
  assert.doesNotThrow(() => validateArchitectureCapture({
    metrics: { ...taskMetrics, drawCallsPerFrame: 37 },
    telemetry: {
      implementationId: "threejs-framework",
      taskId: "full-screen-static-32-light-ggx-aces-v1",
    },
  }, ARCHITECTURE_IMPLEMENTATIONS[1]));
  assert.throws(() => validateArchitectureCapture({
    metrics: { ...taskMetrics, sceneAnalyticLights: 16 },
    telemetry: {
      implementationId: "threejs-framework",
      taskId: "full-screen-static-32-light-ggx-aces-v1",
    },
  }, ARCHITECTURE_IMPLEMENTATIONS[1]), /sceneAnalyticLights/);
});

test("architecture assessment supports only a narrow renderer claim", () => {
  const implementations = ARCHITECTURE_IMPLEMENTATIONS.map((implementation) => ({
    ...implementation,
    evidence: {
      task: {
        height: 1440,
        lights: 32,
        meshes: 1,
        taskId: "full-screen-static-32-light-ggx-aces-v1",
        width: 2560,
      },
    },
    summary: Object.fromEntries(
      Object.entries(taskMetrics).map(([key, mean]) => [key, { mean }]),
    ),
  }));
  const assessment = assessArchitectureControl(implementations);
  assert.equal(assessment.taskMatched, true);
  assert.equal(assessment.rendererArchitectureClaimSupported, true);
  assert.equal(assessment.authoringSystemClaimSupported, false);
  assert.match(assessment.verdict, /controlled task/i);
});
