import { createTextureProbePlan } from "./webgpu-analysis.mjs";
import {
  publicSelectedReflectionProbe,
  selectedReflectionIssues,
} from "./comparison-reflection-public.mjs";

export { evaluateSelectedReflectionQuality } from "./comparison-reflection-quality.mjs";

const COMPARED_SLUGS = Object.freeze(["typegpu-antiky", "wesl"]);
const REFERENCE_SLUG = "threejs";
const PRIORITY_REGIONS = Object.freeze([
  "floor",
  "leftFire",
  "rightFire",
]);
const EXPECTED_COORDINATE_SPACE = "normalized-texture";
const EXPECTED_PIXEL_RULE = "floor-point-then-pixel-center";
const EXPECTED_MEASUREMENT_PHASE = "post-trace-paused";
const EXPECTED_RECORD_STRIDE_BYTES = 32;
const EXPECTED_SAMPLE_PLAN = Object.freeze(createTextureProbePlan());
const REQUIRED_REGIONS = Object.freeze([
  ...new Set(EXPECTED_SAMPLE_PLAN.map(({ region }) => region)),
]);
const EXPECTED_SAMPLE_COUNT = EXPECTED_SAMPLE_PLAN.length;
const ACTIVE_LUMINANCE_THRESHOLD = 1e-5;
const FORMULA_TOLERANCE = 1e-5;

function rounded(value) {
  if (!Number.isFinite(value)) return null;
  const result = Number(value.toFixed(6));
  return Object.is(result, -0) ? 0 : result;
}

function issue(code, message, evidence = {}) {
  return { code, evidence, message };
}

function publicIssue(entry) {
  return selectedReflectionIssues({ issues: [entry] })[0] ?? null;
}

function unavailableReference(code, message, evidence = {}) {
  return {
    capturedFrameIndex: null,
    evidence,
    issues: [issue(code, message, evidence)],
    name: null,
    sampleFingerprint: null,
    slug: REFERENCE_SLUG,
    status: "unavailable",
  };
}

function finiteSample(sample) {
  const shapeIsValid =
    sample !== null &&
    typeof sample === "object" &&
    typeof sample.region === "string" &&
    Number.isFinite(sample.x) &&
    Number.isFinite(sample.y) &&
    Array.isArray(sample.channels) &&
    sample.channels.length === 4 &&
    sample.channels.every(Number.isFinite) &&
    Number.isFinite(sample.luminance) &&
    Number.isFinite(sample.lod) &&
    sample.x >= 0 &&
    sample.x <= 1 &&
    sample.y >= 0 &&
    sample.y <= 1;
  if (!shapeIsValid) return false;
  const expectedLuminance =
    sample.channels[0] * 0.2126 +
    sample.channels[1] * 0.7152 +
    sample.channels[2] * 0.0722;
  return (
    sample.channels.slice(0, 3).every((value) => value >= 0) &&
    sample.luminance >= 0 &&
    Math.abs(sample.luminance - expectedLuminance) <=
      1e-6 * Math.max(1, expectedLuminance) &&
    sample.lod >= 0 &&
    sample.lod <= 4 &&
    (sample.roughness === null ||
      (Number.isFinite(sample.roughness) &&
        sample.roughness >= 0 &&
        sample.roughness <= 1))
  );
}

function validateAntikyGraphProvenance(probe) {
  const provenance = probe.provenance;
  const consumers = provenance?.consumers;
  const latestWriter = provenance?.latestWriter;
  const mipWrites = provenance?.mipWrites;
  const resources = provenance?.resources;
  const selectionSource = provenance?.selectionSource;
  const requiredConsumers = [
    consumers?.roughnessSelection,
    consumers?.bloomExtraction,
    consumers?.finalPresentation,
  ];
  const consumerShapeValid = requiredConsumers.every(
    (consumer) =>
      Number.isInteger(consumer?.commandSequence) &&
      Number.isInteger(consumer?.executionIndex) &&
      Number.isInteger(consumer?.passSequence) &&
      Number.isInteger(consumer?.pipelineId) &&
      Number.isInteger(consumer?.submissionSequence),
  );
  const mipLevels = Array.isArray(mipWrites)
    ? mipWrites.map(({ mipLevel }) => mipLevel)
    : [];
  const mipShapeValid =
    Array.isArray(mipWrites) &&
    mipWrites.length === 5 &&
    mipLevels.every((mipLevel, index) => mipLevel === index) &&
    new Set(mipWrites.map(({ passSequence }) => passSequence)).size === 5 &&
    new Set(mipWrites.map(({ viewId }) => viewId)).size === 5 &&
    mipWrites.every(
      (write, index) =>
        Number.isInteger(write?.executionIndex) &&
        Number.isInteger(write?.passSequence) &&
        Number.isInteger(write?.submissionSequence) &&
        Array.isArray(write?.pipelineIds) &&
        write.pipelineIds.length === 1 &&
        Number.isInteger(write.pipelineIds[0]) &&
        Number.isInteger(write?.rawTextureId) &&
        Number.isInteger(write?.textureId) &&
        Number.isInteger(write?.viewId) &&
        (index === 0 ||
          write.executionIndex > mipWrites[index - 1].executionIndex),
    );
  const reflection = resources?.reflection;
  const roughness = resources?.roughness;
  const sampler = resources?.sampler;
  const resourceShapeValid =
    resources?.source === "exact-traced-final-consumer-objects" &&
    reflection?.format === "rgba16float" &&
    typeof reflection?.label === "string" &&
    Number.isInteger(reflection?.textureId) &&
    Number.isInteger(reflection?.viewId) &&
    roughness?.channel === "w" &&
    roughness?.format === "rgba16float" &&
    typeof roughness?.label === "string" &&
    Number.isInteger(roughness?.textureId) &&
    Number.isInteger(roughness?.viewId) &&
    Number.isInteger(sampler?.samplerId);
  const selectionShapeValid =
    selectionSource?.channel === "w" &&
    selectionSource?.format === "rgba16float" &&
    typeof selectionSource?.label === "string" &&
    selectionSource?.mipLevelCount === 5 &&
    Number.isInteger(selectionSource?.rawTextureId) &&
    Number.isInteger(selectionSource?.samplerId) &&
    Number.isInteger(selectionSource?.surfaceTextureId) &&
    Number.isInteger(selectionSource?.surfaceViewId) &&
    Number.isInteger(selectionSource?.textureId) &&
    Number.isInteger(selectionSource?.viewId);
  const selector = consumers?.roughnessSelection;
  const graphAligned =
    consumerShapeValid &&
    mipShapeValid &&
    resourceShapeValid &&
    selectionShapeValid &&
    mipWrites.at(-1).executionIndex < selector.executionIndex &&
    selector.executionIndex < consumers.bloomExtraction.executionIndex &&
    consumers.bloomExtraction.executionIndex <
      consumers.finalPresentation.executionIndex &&
    latestWriter?.executionIndex === selector.executionIndex &&
    latestWriter?.passSequence === selector.passSequence &&
    latestWriter?.submissionSequence === selector.submissionSequence &&
    /roughness-selected reflection/i.test(String(latestWriter?.label)) &&
    Array.isArray(latestWriter?.viewIds) &&
    latestWriter.viewIds.length === 1 &&
    latestWriter.textureId === reflection.textureId &&
    mipWrites.every(
      (write) =>
        write.rawTextureId === selectionSource.rawTextureId &&
        write.textureId === selectionSource.textureId,
    ) &&
    selectionSource.surfaceTextureId === roughness.textureId &&
    selectionSource.surfaceViewId === roughness.viewId &&
    new Set([
      reflection.textureId,
      roughness.textureId,
      selectionSource.rawTextureId,
      selectionSource.textureId,
    ]).size === 4;
  if (graphAligned) return null;
  return issue(
    "selected-reflection-provenance-invalid",
    "The Antiky selected-reflection diagnostic does not preserve a coherent reconstruction and selection graph.",
    {
      consumerShapeValid,
      mipLevels,
      mipShapeValid,
      resourceShapeValid,
      selectionShapeValid,
    },
  );
}

function validateFormulaContract(probe, expectedSlug) {
  const formula = probe.provenance?.formula;
  if (expectedSlug === REFERENCE_SLUG) {
    const validFormula =
      formula?.kind === "roughness-squared" &&
      formula.channel === "g" &&
      formula.multiplier === 4 &&
      formula.minMipLevel === 0 &&
      formula.maxMipLevel === 4;
    if (!validFormula) {
      return issue(
        "selected-reflection-formula-invalid",
        "The Three.js selected-reflection diagnostic does not describe its roughness-squared LOD contract.",
        { formula: formula ?? null },
      );
    }
    const mismatchIndex = probe.samples.findIndex((sample) => {
      if (!Number.isFinite(sample.roughness)) return true;
      const expectedLod = Math.min(sample.roughness * sample.roughness * 4, 4);
      return Math.abs(sample.lod - expectedLod) > FORMULA_TOLERANCE;
    });
    if (mismatchIndex >= 0) {
      const sample = probe.samples[mismatchIndex];
      return issue(
        "selected-reflection-sample-formula-mismatch",
        "A Three.js selected-reflection sample does not match roughness squared times four.",
        {
          lod: sample.lod,
          roughness: sample.roughness,
          sampleIndex: mismatchIndex,
        },
      );
    }
    return null;
  }

  const hasSelectionSource =
    probe.provenance?.selectionSource !== null &&
    probe.provenance?.selectionSource !== undefined;
  const hasRoughnessResource =
    probe.provenance?.resources?.roughness !== null &&
    probe.provenance?.resources?.roughness !== undefined;
  const hasMipWrites =
    Array.isArray(probe.provenance?.mipWrites) &&
    probe.provenance.mipWrites.length > 0;
  const graphClaimed =
    hasSelectionSource ||
    hasRoughnessResource ||
    hasMipWrites ||
    probe.provenance?.lodMeaning === "upstream-selection";
  if (graphClaimed && formula?.kind !== "roughness-squared") {
    return issue(
      "selected-reflection-provenance-invalid",
      "The Antiky selected-reflection graph is disguised as a different selection contract.",
      { formula: formula ?? null },
    );
  }
  if (formula?.kind === "roughness-squared") {
    const validFormula =
      formula.channel === "w" &&
      formula.multiplier === 4 &&
      formula.minMipLevel === 0 &&
      formula.maxMipLevel === 4 &&
      probe.provenance?.lodMeaning === "upstream-selection" &&
      probe.provenance?.probeSampleLod === 0;
    if (!validFormula) {
      return issue(
        "selected-reflection-formula-invalid",
        "The Antiky selected-reflection diagnostic does not describe its surface-roughness LOD contract.",
        { formula },
      );
    }
    const provenanceIssue = validateAntikyGraphProvenance(probe);
    if (provenanceIssue !== null) return provenanceIssue;
    const mismatchIndex = probe.samples.findIndex((sample) => {
      if (!Number.isFinite(sample.roughness)) return true;
      const expectedLod = Math.min(sample.roughness * sample.roughness * 4, 4);
      return Math.abs(sample.lod - expectedLod) > FORMULA_TOLERANCE;
    });
    if (mismatchIndex >= 0) {
      const sample = probe.samples[mismatchIndex];
      return issue(
        "selected-reflection-sample-formula-mismatch",
        "An Antiky selected-reflection sample does not match surface roughness squared times four.",
        {
          lod: sample.lod,
          roughness: sample.roughness,
          sampleIndex: mismatchIndex,
        },
      );
    }
    return null;
  }

  if (
    formula?.kind !== "constant-lod" ||
    formula.lod !== 0 ||
    formula.maxMipLevel !== 0
  ) {
    return issue(
      "selected-reflection-formula-invalid",
      "The Antiky selected-reflection diagnostic does not describe its explicit LOD-zero contract.",
      { formula: formula ?? null },
    );
  }
  const mismatchIndex = probe.samples.findIndex(
    (sample) => sample.roughness !== null || Math.abs(sample.lod) > 1e-7,
  );
  if (mismatchIndex >= 0) {
    const sample = probe.samples[mismatchIndex];
    return issue(
      "selected-reflection-sample-formula-mismatch",
      "An Antiky selected-reflection sample does not match its explicit LOD-zero consumer.",
      {
        lod: sample.lod,
        roughness: sample.roughness,
        sampleIndex: mismatchIndex,
      },
    );
  }
  return null;
}

function validateReadyProbe(probe, expectedSlug) {
  if (probe?.status !== "ready") {
    return issue(
      "selected-reflection-probe-unavailable",
      "The selected-reflection GPU diagnostic is unavailable.",
      {
        probeIssueCodes: selectedReflectionIssues(probe).map(({ code }) => code),
        probeStatus: probe?.status ?? null,
      },
    );
  }
  if (probe.kind !== "selected-reflection") {
    return issue(
      "selected-reflection-kind-invalid",
      "The semantic reflection diagnostic has an unexpected result kind.",
      { kind: probe.kind ?? null },
    );
  }
  if (!Number.isInteger(probe.capturedFrameIndex)) {
    return issue(
      "selected-reflection-frame-invalid",
      "The selected-reflection diagnostic is not tied to a captured frame.",
      { capturedFrameIndex: probe.capturedFrameIndex ?? null },
    );
  }
  if (probe.provenance?.measurementPhase !== EXPECTED_MEASUREMENT_PHASE) {
    return issue(
      "selected-reflection-phase-invalid",
      "The selected-reflection diagnostic was not measured after the trace while animation was paused.",
      { measurementPhase: probe.provenance?.measurementPhase ?? null },
    );
  }
  if (probe.provenance?.targetSlug !== expectedSlug) {
    return issue(
      "selected-reflection-target-mismatch",
      "The selected-reflection diagnostic was resolved for a different renderer.",
      {
        actualSlug: probe.provenance?.targetSlug ?? null,
        expectedSlug,
      },
    );
  }
  if (probe.provenance?.traceFrameIndex !== probe.capturedFrameIndex - 1) {
    return issue(
      "selected-reflection-trace-frame-mismatch",
      "The selected-reflection diagnostic does not use the trace frame immediately preceding capture telemetry.",
      {
        capturedFrameIndex: probe.capturedFrameIndex,
        traceFrameIndex: probe.provenance?.traceFrameIndex ?? null,
      },
    );
  }
  if (
    probe.sampling?.coordinateSpace !== EXPECTED_COORDINATE_SPACE ||
    probe.sampling?.pixelRule !== EXPECTED_PIXEL_RULE ||
    probe.sampling?.planSampleCount !== EXPECTED_SAMPLE_COUNT ||
    probe.sampling?.recordStrideBytes !== EXPECTED_RECORD_STRIDE_BYTES
  ) {
    return issue(
      "selected-reflection-sampling-invalid",
      "The selected-reflection diagnostic uses an unsupported coordinate or pixel sampling contract.",
      {
        coordinateSpace: probe.sampling?.coordinateSpace ?? null,
        planSampleCount: probe.sampling?.planSampleCount ?? null,
        pixelRule: probe.sampling?.pixelRule ?? null,
        recordStrideBytes: probe.sampling?.recordStrideBytes ?? null,
      },
    );
  }
  if (!Array.isArray(probe.samples) || probe.samples.length === 0) {
    return issue(
      "selected-reflection-samples-missing",
      "The selected-reflection diagnostic has no aligned samples.",
      { sampleCount: probe.samples?.length ?? null },
    );
  }
  const invalidIndex = probe.samples.findIndex(
    (sample) => !finiteSample(sample),
  );
  if (invalidIndex >= 0) {
    return issue(
      "selected-reflection-sample-invalid",
      "The selected-reflection diagnostic contains a non-finite or malformed sample.",
      { sampleIndex: invalidIndex },
    );
  }
  if (
    probe.sampling.sampleCount !== EXPECTED_SAMPLE_COUNT ||
    probe.samples.length !== EXPECTED_SAMPLE_COUNT
  ) {
    return issue(
      "selected-reflection-sample-count-mismatch",
      "The selected-reflection sample payload does not match its declared plan.",
      {
        declaredSampleCount: probe.sampling.sampleCount,
        expectedSampleCount: EXPECTED_SAMPLE_COUNT,
        sampleCount: probe.samples.length,
      },
    );
  }
  const planMismatchIndex = probe.samples.findIndex((sample, index) => {
    const expected = EXPECTED_SAMPLE_PLAN[index];
    return (
      sample.region !== expected.region ||
      sample.x !== expected.x ||
      sample.y !== expected.y
    );
  });
  if (planMismatchIndex >= 0) {
    const actual = probe.samples[planMismatchIndex];
    const expected = EXPECTED_SAMPLE_PLAN[planMismatchIndex];
    return issue(
      "selected-reflection-plan-mismatch",
      "The selected-reflection coordinates do not match the canonical probe plan.",
      {
        actual: { region: actual.region, x: actual.x, y: actual.y },
        expected,
        sampleIndex: planMismatchIndex,
      },
    );
  }
  return validateFormulaContract(probe, expectedSlug);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values, fraction) {
  const sorted = values.toSorted((first, second) => first - second);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

function ratio(candidate, reference) {
  return reference === 0 ? null : rounded(candidate / reference);
}

function summarizeSamples(candidate, reference) {
  const rgbSquaredErrors = [];
  const logLuminanceErrors = [];
  const candidateLuminance = [];
  const referenceLuminance = [];
  for (let index = 0; index < reference.length; index += 1) {
    const candidateSample = candidate[index];
    const referenceSample = reference[index];
    for (let channel = 0; channel < 3; channel += 1) {
      const candidateValue = Math.max(candidateSample.channels[channel], 0);
      const referenceValue = Math.max(referenceSample.channels[channel], 0);
      const difference =
        Math.log1p(candidateValue) - Math.log1p(referenceValue);
      rgbSquaredErrors.push(difference * difference);
    }
    const candidateValue = Math.max(candidateSample.luminance, 0);
    const referenceValue = Math.max(referenceSample.luminance, 0);
    candidateLuminance.push(candidateValue);
    referenceLuminance.push(referenceValue);
    logLuminanceErrors.push(
      Math.abs(Math.log1p(candidateValue) - Math.log1p(referenceValue)),
    );
  }

  const candidatePositive = candidateLuminance.filter(
    (value) => value > ACTIVE_LUMINANCE_THRESHOLD,
  );
  const referencePositive = referenceLuminance.filter(
    (value) => value > ACTIVE_LUMINANCE_THRESHOLD,
  );
  const candidateActiveFraction =
    candidatePositive.length / candidateLuminance.length;
  const referenceActiveFraction =
    referencePositive.length / referenceLuminance.length;

  return {
    activeFractionDelta: rounded(
      candidateActiveFraction - referenceActiveFraction,
    ),
    logLuminanceMae: rounded(mean(logLuminanceErrors)),
    maximumRatio: ratio(
      Math.max(...candidateLuminance),
      Math.max(...referenceLuminance),
    ),
    meanRatio: ratio(
      mean(candidateLuminance),
      mean(referenceLuminance),
    ),
    p99Ratio: ratio(
      quantile(candidateLuminance, 0.99),
      quantile(referenceLuminance, 0.99),
    ),
    positiveMeanRatio:
      candidatePositive.length === 0 || referencePositive.length === 0
        ? null
        : ratio(mean(candidatePositive), mean(referencePositive)),
    rgbLogRmse: rounded(Math.sqrt(mean(rgbSquaredErrors))),
    sampleCount: reference.length,
  };
}

function groupByRegion(samples) {
  const regions = new Map();
  for (const sample of samples) {
    const values = regions.get(sample.region) ?? [];
    values.push(sample);
    regions.set(sample.region, values);
  }
  return regions;
}

function unavailableCandidate(result, probe, candidateIssue) {
  const entry = publicSelectedReflectionProbe(result, probe);
  return {
    ...entry,
    issues: [...entry.issues, publicIssue(candidateIssue)].filter(Boolean),
    status: "unavailable",
  };
}

export function findSelectedReflectionComparison(results) {
  const availableResults = Array.isArray(results) ? results : [];
  const referenceResult = availableResults.find(
    ({ slug }) => slug === REFERENCE_SLUG,
  );
  const candidateResults = availableResults.filter(
    ({ slug }) => COMPARED_SLUGS.includes(slug),
  );
  const referenceProbe = referenceResult?.gpu?.selectedReflectionProbe;
  const referenceValidation = validateReadyProbe(referenceProbe, REFERENCE_SLUG);
  const referencePublic = publicSelectedReflectionProbe(
    referenceResult,
    referenceProbe,
  );
  const reference =
    referenceResult === undefined
      ? unavailableReference(
          "selected-reflection-reference-missing",
          "The comparison has no Three.js selected-reflection reference.",
          { expectedSlug: REFERENCE_SLUG },
        )
      : referenceValidation === null
        ? referencePublic
        : {
            ...referencePublic,
            issues: [
              ...referencePublic.issues,
              publicIssue(referenceValidation),
            ].filter(Boolean),
            status: "unavailable",
          };

  const entries = candidateResults.map((result) => {
    const probe = result.gpu?.selectedReflectionProbe;
    const validation = validateReadyProbe(probe, result.slug);
    if (validation !== null) {
      return unavailableCandidate(result, probe, validation);
    }
    if (reference.status !== "ready") {
      return unavailableCandidate(
        result,
        probe,
        issue(
          "selected-reflection-reference-unavailable",
          "Selected-reflection comparison requires a ready Three.js semantic reference.",
          { referenceIssueCodes: reference.issues.map(({ code }) => code) },
        ),
      );
    }
    if (probe.capturedFrameIndex !== referenceProbe.capturedFrameIndex) {
      return unavailableCandidate(
        result,
        probe,
        issue(
          "selected-reflection-frame-mismatch",
          "Candidate and reference selected-reflection diagnostics were captured at different frames.",
          {
            candidateFrameIndex: probe.capturedFrameIndex,
            referenceFrameIndex: referenceProbe.capturedFrameIndex,
          },
        ),
      );
    }

    const candidateRegions = groupByRegion(probe.samples);
    const referenceRegions = groupByRegion(referenceProbe.samples);
    const missingRegion = REQUIRED_REGIONS.find(
      (name) =>
        candidateRegions.get(name)?.length === 0 ||
        referenceRegions.get(name)?.length === 0,
    );
    if (missingRegion !== undefined) {
      return unavailableCandidate(
        result,
        probe,
        issue(
          "selected-reflection-region-missing",
          "The selected-reflection plan does not contain every required comparison region.",
          { region: missingRegion },
        ),
      );
    }
    const regions = {};
    for (const [name, referenceSamples] of referenceRegions) {
      const candidateSamples = candidateRegions.get(name);
      if (
        candidateSamples === undefined ||
        candidateSamples.length !== referenceSamples.length
      ) {
        return unavailableCandidate(
          result,
          probe,
          issue(
            "selected-reflection-region-mismatch",
            "Candidate and reference selected-reflection region plans differ.",
            {
              candidateSampleCount: candidateSamples?.length ?? 0,
              referenceSampleCount: referenceSamples.length,
              region: name,
            },
          ),
        );
      }
      regions[name] = summarizeSamples(candidateSamples, referenceSamples);
    }

    const priorityCandidate = probe.samples.filter(({ region }) =>
      PRIORITY_REGIONS.includes(region),
    );
    const priorityReference = referenceProbe.samples.filter(({ region }) =>
      PRIORITY_REGIONS.includes(region),
    );
    return {
      ...publicSelectedReflectionProbe(result, probe),
      priority: summarizeSamples(priorityCandidate, priorityReference),
      priorityRegions: [...PRIORITY_REGIONS],
      referenceFingerprint: reference.sampleFingerprint,
      regions,
      status: "compared",
    };
  });

  return { entries, reference };
}
