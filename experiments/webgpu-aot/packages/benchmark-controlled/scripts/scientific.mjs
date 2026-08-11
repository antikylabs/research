const CONTROLLED_COUNTERS = Object.freeze({
  commandEncodersPerFrame: 1,
  drawCallsPerFrame: 2,
  queueSubmitsPerFrame: 1,
  renderPassesPerFrame: 2,
  submittedCommandBuffersPerFrame: 1,
  writeBufferBytesPerFrame: 16,
  writeBufferCallsPerFrame: 1,
});

const COUNTER_TOLERANCE = 0.02;

export function buildControlledSchedule(implementations, runs) {
  const schedule = [];
  for (let repetition = 0; repetition < runs; repetition += 1) {
    for (let position = 0; position < implementations.length; position += 1) {
      schedule.push({
        demo: implementations[(position + repetition) % implementations.length],
        index: repetition + 1,
        position,
        repetition,
      });
    }
  }
  return schedule;
}

export function validateControlledCapture(capture, expectedId) {
  const telemetry = capture.telemetry ?? {};
  if (telemetry.experiment !== "identical-wgsl-null-control") {
    throw new Error(
      `experiment must be identical-wgsl-null-control; received ${telemetry.experiment}`,
    );
  }
  if (telemetry.implementationId !== expectedId) {
    throw new Error(
      `implementationId must be ${expectedId}; received ${telemetry.implementationId}`,
    );
  }
  if (typeof telemetry.shaderHash !== "string" || telemetry.shaderHash === "") {
    throw new Error("shaderHash is required for a controlled capture");
  }
  for (const [key, expected] of Object.entries(CONTROLLED_COUNTERS)) {
    const actual = Number(capture.metrics?.[key]);
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > COUNTER_TOLERANCE) {
      throw new Error(`${key} must be ${expected} ± ${COUNTER_TOLERANCE}; received ${actual}`);
    }
  }
}

function measuredCounter(implementation, key) {
  return Number(implementation.summary?.[key]?.mean);
}

export function assessNullControl(implementations) {
  const cohortComplete = implementations.length === 5;
  const shaderHashes = implementations.flatMap(({ evidence }) =>
    Array.isArray(evidence?.artifact?.shaderHashes)
      ? evidence.artifact.shaderHashes
      : [evidence?.artifact?.shaderHash]
  );
  const artifactHashMatched = cohortComplete && shaderHashes.length >= 5 &&
    shaderHashes.every(
      (hash) => typeof hash === "string" && hash === shaderHashes[0],
    );
  const dimensions = Object.entries(CONTROLLED_COUNTERS).map(
    ([key, expected]) => {
      const entries = implementations.map(({ id, name, summary }) => ({
        id,
        name,
        value: Number(summary?.[key]?.mean),
      }));
      const matched = cohortComplete && entries.every(
        ({ value }) =>
          Number.isFinite(value) && Math.abs(value - expected) <= COUNTER_TOLERANCE,
      );
      const status = !cohortComplete
        ? "unavailable"
        : matched
          ? "matched"
          : "mismatched";
      return { entries, expected, key, status };
    },
  );
  const contractMatched = artifactHashMatched &&
    dimensions.every(({ status }) => status === "matched");
  const fpsValues = implementations
    .map((implementation) => measuredCounter(implementation, "averageFps"))
    .filter(Number.isFinite);
  const fpsRelativeSpread = fpsValues.length < 2
    ? null
    : (Math.max(...fpsValues) - Math.min(...fpsValues)) / Math.max(...fpsValues);

  return {
    artifactHashMatched,
    causalClaimSupported: false,
    cohortComplete,
    contractMatched,
    dimensions,
    fpsRelativeSpread,
    purpose: "measurement-noise-and-order-effect-baseline",
    verdict: !cohortComplete
      ? "The null-control cohort is incomplete. This diagnostic run can validate one capture, but all five labels are required for an equivalence and noise-baseline verdict."
      : contractMatched
      ? "The byte-identical shader and command contract matched. Any observed spread is a measurement-noise baseline; these labels do not exercise different authoring-system generators and cannot support causal authoring-system claims."
      : "The null-control contract failed. Do not interpret performance spread until artifact and command equivalence are restored.",
  };
}

export { CONTROLLED_COUNTERS };
