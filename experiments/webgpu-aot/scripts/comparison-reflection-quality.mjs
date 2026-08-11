import { createTextureProbePlan } from "./webgpu-analysis.mjs";

const PRIORITY_REGIONS = Object.freeze([
  "floor",
  "leftFire",
  "rightFire",
]);
const EXPECTED_COORDINATE_SPACE = "normalized-texture";
const EXPECTED_MEASUREMENT_PHASE = "post-trace-paused";
const EXPECTED_PIXEL_RULE = "floor-point-then-pixel-center";
const EXPECTED_RECORD_STRIDE_BYTES = 32;
const EXPECTED_SLUG = "typegpu-antiky";
const EXPECTED_SAMPLE_PLAN = createTextureProbePlan();
const EXPECTED_SAMPLE_COUNT = EXPECTED_SAMPLE_PLAN.length;
const EXPECTED_PRIORITY_SAMPLE_COUNT = EXPECTED_SAMPLE_PLAN.filter(({ region }) =>
  PRIORITY_REGIONS.includes(region),
).length;
const EXPECTED_REGION_SAMPLE_COUNTS = Object.fromEntries(
  PRIORITY_REGIONS.map((region) => [
    region,
    EXPECTED_SAMPLE_PLAN.filter((point) => point.region === region).length,
  ]),
);

function rounded(value) {
  if (!Number.isFinite(value)) return null;
  const result = Number(value.toFixed(6));
  return Object.is(result, -0) ? 0 : result;
}

function issue(code, message, evidence = {}) {
  return { code, evidence, message };
}

export function evaluateSelectedReflectionQuality(
  candidate,
  control,
  epsilon = 1e-5,
) {
  const invalidEvidence = [];
  if (candidate?.status !== "compared") invalidEvidence.push("candidate");
  if (control?.status !== "compared") invalidEvidence.push("control");
  if (!Number.isFinite(epsilon) || epsilon < 0) invalidEvidence.push("epsilon");
  const candidatePriority = candidate?.priority?.rgbLogRmse;
  const controlPriority = control?.priority?.rgbLogRmse;
  if (!Number.isFinite(candidatePriority) || candidatePriority < 0) {
    invalidEvidence.push("candidate-priority");
  }
  if (!Number.isFinite(controlPriority) || controlPriority < 0) {
    invalidEvidence.push("control-priority");
  }
  if (
    !/^[a-f0-9]{64}$/.test(candidate?.referenceFingerprint ?? "") ||
    candidate.referenceFingerprint !== control?.referenceFingerprint
  ) {
    invalidEvidence.push("reference-fingerprint-mismatch");
  }
  for (const [name, entry] of [
    ["candidate", candidate],
    ["control", control],
  ]) {
    const sampling = entry?.evidence?.sampling;
    if (
      !Number.isInteger(entry?.capturedFrameIndex) ||
      sampling?.coordinateSpace !== EXPECTED_COORDINATE_SPACE ||
      sampling?.pixelRule !== EXPECTED_PIXEL_RULE ||
      sampling?.planSampleCount !== EXPECTED_SAMPLE_COUNT ||
      sampling?.recordStrideBytes !== EXPECTED_RECORD_STRIDE_BYTES ||
      sampling?.sampleCount !== EXPECTED_SAMPLE_COUNT ||
      entry?.evidence?.provenance?.measurementPhase !==
        EXPECTED_MEASUREMENT_PHASE ||
      entry?.evidence?.provenance?.targetSlug !== EXPECTED_SLUG ||
      entry?.evidence?.provenance?.traceFrameIndex !==
        entry.capturedFrameIndex - 1 ||
      entry?.slug !== EXPECTED_SLUG ||
      entry?.priority?.sampleCount !== EXPECTED_PRIORITY_SAMPLE_COUNT
    ) {
      invalidEvidence.push(`${name}-capture-contract`);
    }
  }
  if (candidate?.capturedFrameIndex !== control?.capturedFrameIndex) {
    invalidEvidence.push("captured-frame-mismatch");
  }
  for (const region of PRIORITY_REGIONS) {
    if (
      !Number.isFinite(candidate?.regions?.[region]?.rgbLogRmse) ||
      candidate.regions[region].rgbLogRmse < 0
    ) {
      invalidEvidence.push(`candidate-${region}`);
    }
    if (
      !Number.isFinite(control?.regions?.[region]?.rgbLogRmse) ||
      control.regions[region].rgbLogRmse < 0
    ) {
      invalidEvidence.push(`control-${region}`);
    }
    if (
      candidate?.regions?.[region]?.sampleCount !==
        EXPECTED_REGION_SAMPLE_COUNTS[region] ||
      control?.regions?.[region]?.sampleCount !==
        EXPECTED_REGION_SAMPLE_COUNTS[region]
    ) {
      invalidEvidence.push(`sample-count-${region}`);
    }
  }
  if (invalidEvidence.length > 0) {
    return {
      issues: [
        issue(
          "selected-reflection-quality-evidence-invalid",
          "An explicit candidate and control comparison are required for the selected-reflection quality gate.",
          { invalidEvidence },
        ),
      ],
      priorityImproved: false,
      regressedRegions: [],
      status: "unavailable",
    };
  }

  const regions = Object.fromEntries(
    PRIORITY_REGIONS.map((region) => {
      const candidateValue = candidate.regions[region].rgbLogRmse;
      const controlValue = control.regions[region].rgbLogRmse;
      return [
        region,
        {
          candidate: candidateValue,
          control: controlValue,
          delta: rounded(candidateValue - controlValue),
          regressed: candidateValue > controlValue + epsilon,
        },
      ];
    }),
  );
  const regressedRegions = PRIORITY_REGIONS.filter(
    (region) => regions[region].regressed,
  );
  const priorityImproved = candidatePriority < controlPriority - epsilon;
  return {
    epsilon,
    issues: [],
    priority: {
      candidate: candidatePriority,
      control: controlPriority,
      delta: rounded(candidatePriority - controlPriority),
    },
    priorityImproved,
    regions,
    regressedRegions,
    status:
      priorityImproved && regressedRegions.length === 0 ? "passed" : "failed",
  };
}
