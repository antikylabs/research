import assert from "node:assert/strict";
import test from "node:test";

import { CONTROLLED_IMPLEMENTATIONS } from "../scripts/config.mjs";
import {
  assessNullControl,
  buildControlledSchedule,
  validateControlledCapture,
} from "../scripts/scientific.mjs";

const expectedMetrics = {
  commandEncodersPerFrame: 1,
  drawCallsPerFrame: 2,
  queueSubmitsPerFrame: 1,
  renderPassesPerFrame: 2,
  submittedCommandBuffersPerFrame: 1,
  writeBufferBytesPerFrame: 16,
  writeBufferCallsPerFrame: 1,
};

test("ten repetitions put every identity in every order position twice", () => {
  const schedule = buildControlledSchedule(CONTROLLED_IMPLEMENTATIONS, 10);
  assert.equal(schedule.length, 50);
  for (const implementation of CONTROLLED_IMPLEMENTATIONS) {
    const positions = schedule
      .filter(({ demo }) => demo.id === implementation.id)
      .map(({ position }) => position);
    assert.deepEqual(
      [0, 1, 2, 3, 4].map((position) =>
        positions.filter((candidate) => candidate === position).length,
      ),
      [2, 2, 2, 2, 2],
    );
  }
});

test("capture validation rejects a mislabeled or structurally different run", () => {
  const valid = {
    metrics: expectedMetrics,
    telemetry: {
      experiment: "identical-wgsl-null-control",
      implementationId: "brometal-aot",
      shaderHash: "same-hash",
    },
  };
  assert.doesNotThrow(() =>
    validateControlledCapture(valid, "brometal-aot"),
  );
  assert.throws(
    () => validateControlledCapture({
      ...valid,
      metrics: { ...expectedMetrics, drawCallsPerFrame: 3 },
    }, "brometal-aot"),
    /drawCallsPerFrame/,
  );
  assert.throws(
    () => validateControlledCapture(valid, "wesl-static"),
    /implementationId/,
  );
});

test("the null-control verdict checks artifacts without claiming a winner", () => {
  const implementations = CONTROLLED_IMPLEMENTATIONS.map((implementation) => ({
    ...implementation,
    evidence: { artifact: { shaderHash: "same-hash" } },
    summary: Object.fromEntries(
      Object.entries(expectedMetrics).map(([key, mean]) => [key, { mean }]),
    ),
  }));
  const assessment = assessNullControl(implementations);
  assert.equal(assessment.contractMatched, true);
  assert.equal(assessment.causalClaimSupported, false);
  assert.match(assessment.verdict, /noise baseline/i);
  assert.doesNotMatch(assessment.verdict, /winner/i);
});

test("the null-control gate fails when hashes differ", () => {
  const implementations = CONTROLLED_IMPLEMENTATIONS.map((implementation, index) => ({
    ...implementation,
    evidence: { artifact: { shaderHash: `hash-${index}` } },
    summary: Object.fromEntries(
      Object.entries(expectedMetrics).map(([key, mean]) => [key, { mean }]),
    ),
  }));
  const assessment = assessNullControl(implementations);
  assert.equal(assessment.contractMatched, false);
  assert.equal(assessment.artifactHashMatched, false);
});

test("a single-label diagnostic is incomplete rather than a mismatch", () => {
  const assessment = assessNullControl([{
    ...CONTROLLED_IMPLEMENTATIONS[0],
    evidence: { artifact: { shaderHash: "same-hash" } },
    summary: Object.fromEntries(
      Object.entries(expectedMetrics).map(([key, mean]) => [key, { mean }]),
    ),
  }]);
  assert.equal(assessment.cohortComplete, false);
  assert.equal(assessment.contractMatched, false);
  assert.ok(assessment.dimensions.every(({ status }) => status === "unavailable"));
  assert.match(assessment.verdict, /incomplete/i);
});
