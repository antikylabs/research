import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateSelectedReflectionQuality,
  findSelectedReflectionComparison,
} from "../scripts/comparison-reflections.mjs";
import { publicSelectedReflectionProbe } from "../scripts/comparison-reflection-public.mjs";
import {
  renderHtmlReport,
  summarizeReport,
} from "../scripts/comparison-report.mjs";
import { createTextureProbePlan } from "../scripts/webgpu-analysis.mjs";

const REGIONS = [
  ...new Set(createTextureProbePlan().map(({ region }) => region)),
];

function syntheticPlan() {
  const indices = new Map(REGIONS.map((region) => [region, 0]));
  return createTextureProbePlan().map(({ region, x, y }) => {
    const sampleIndex = indices.get(region);
    indices.set(region, sampleIndex + 1);
    return { region, sampleIndex, x, y };
  });
}

function selectedReflectionProbe(scale = 1, provenanceSeed = 1) {
  const samples = syntheticPlan().map(
    ({ region, sampleIndex, x, y }) => {
      const regionIndex = REGIONS.indexOf(region);
      const value = scale * (regionIndex + 1) * (sampleIndex + 1) * 0.0001;
      return {
        channels: [value, value * 0.5, value * 0.25, 1],
        lod: (sampleIndex % 9) * 0.5,
        luminance: value * 0.58825,
        region,
        roughness: (sampleIndex % 5) * 0.25,
        x,
        y,
      };
    },
  );
  return {
    capturedFrameIndex: 12,
    issues: [],
    kind: "selected-reflection",
    provenance: {
      consumer: { pipelineId: provenanceSeed },
      formula: { kind: "roughness-squared", maxMipLevel: 4 },
      measurementPhase: "post-trace-paused",
    },
    samples,
    sampling: {
      coordinateSpace: "normalized-texture",
      pixelRule: "floor-point-then-pixel-center",
      planSampleCount: samples.length,
      recordStrideBytes: 32,
      sampleCount: samples.length,
    },
    status: "ready",
  };
}

function result(slug, probe) {
  const attachedProbe = structuredClone(probe);
  if (slug === "threejs") {
    attachedProbe.provenance.formula = {
      channel: "g",
      kind: "roughness-squared",
      maxMipLevel: 4,
      minMipLevel: 0,
      multiplier: 4,
    };
    for (const sample of attachedProbe.samples) {
      const roughness = sample.roughness ?? 0;
      sample.roughness = roughness;
      sample.lod = Math.min(roughness * roughness * 4, 4);
    }
  } else if (slug === "typegpu-antiky") {
    attachedProbe.provenance.formula = {
      kind: "constant-lod",
      lod: 0,
      maxMipLevel: 0,
    };
    for (const sample of attachedProbe.samples) {
      sample.roughness = null;
      sample.lod = 0;
    }
  }
  attachedProbe.provenance = {
    ...attachedProbe.provenance,
    targetSlug: slug,
    traceFrameIndex: attachedProbe.capturedFrameIndex - 1,
  };
  return {
    gpu: { selectedReflectionProbe: attachedProbe },
    name: slug === "threejs" ? "Three.js native" : "TypeGPU-Antiky AOT",
    slug,
  };
}

function uniformProbe(value) {
  const samples = syntheticPlan().map(({ region, x, y }) => ({
    channels: [value, value, value, 1],
    lod: 0,
    luminance: value,
    region,
    roughness: 0,
    x,
    y,
  }));
  return {
    capturedFrameIndex: 12,
    issues: [],
    kind: "selected-reflection",
    provenance: { measurementPhase: "post-trace-paused" },
    samples,
    sampling: {
      coordinateSpace: "normalized-texture",
      pixelRule: "floor-point-then-pixel-center",
      planSampleCount: samples.length,
      recordStrideBytes: 32,
      sampleCount: samples.length,
    },
    status: "ready",
  };
}

function capturedResult(slug, probe) {
  return {
    ...result(slug, probe),
    durationMs: 1000,
    frameWindow: null,
    gpu: {
      ...result(slug, probe).gpu,
      bindGroups: [],
      bufferProbes: null,
      buffers: [],
      devices: [],
      executionTrace: null,
      passSummaries: [],
      pipelines: [],
      samplers: [],
      shaderModules: [],
      textureProbes: { errors: [], results: [] },
      textures: [],
      textureViews: [],
    },
    issues: [],
    screenshot: null,
    status: "ready",
    telemetry: { latestFrame: { fps: 60 } },
    url: `http://127.0.0.1/${slug}`,
    workloadWindow: { passes: [], pipelines: [] },
  };
}

function roughnessSelectedAntikyResult(scale) {
  const candidate = result("typegpu-antiky", selectedReflectionProbe(scale));
  const probe = candidate.gpu.selectedReflectionProbe;
  probe.provenance.formula = {
    channel: "w",
    kind: "roughness-squared",
    maxMipLevel: 4,
    minMipLevel: 0,
    multiplier: 4,
  };
  probe.provenance.selectionSource = {
    channel: "w",
    format: "rgba16float",
    label: "Antiky five-mip roughness reflection pyramid",
    mipLevelCount: 5,
    rawTextureId: 80,
    samplerId: 72,
    surfaceTextureId: 100,
    surfaceViewId: 101,
    textureId: 90,
    viewId: 91,
  };
  probe.provenance.consumers = {
    bloomExtraction: {
      commandSequence: 8,
      executionIndex: 7,
      passSequence: 8,
      pipelineId: 200,
      shaderHash: "bloom",
      shaderId: 201,
      submissionSequence: 1,
    },
    finalPresentation: {
      commandSequence: 9,
      executionIndex: 8,
      passSequence: 9,
      pipelineId: 210,
      shaderHash: "final",
      shaderId: 202,
      submissionSequence: 1,
    },
    roughnessSelection: {
      commandSequence: 7,
      executionIndex: 6,
      passSequence: 7,
      pipelineId: 220,
      shaderHash: "4c0ad554",
      shaderId: 203,
      submissionSequence: 1,
    },
  };
  probe.provenance.latestWriter = {
    executionIndex: 6,
    label: "Antiky roughness-selected reflection",
    passSequence: 7,
    submissionSequence: 1,
    textureId: 70,
    viewIds: [71],
  };
  probe.provenance.mipWrites = Array.from({ length: 5 }, (_, mipLevel) => ({
    executionIndex: mipLevel + 1,
    mipLevel,
    passSequence: mipLevel + 2,
    pipelineIds: [230],
    rawTextureId: 80,
    submissionSequence: 1,
    textureId: 90,
    viewId: mipLevel + 92,
  }));
  probe.provenance.lodMeaning = "upstream-selection";
  probe.provenance.probeSampleLod = 0;
  probe.provenance.resources = {
    reflection: {
      format: "rgba16float",
      label: "Antiky roughness-selected reflection",
      textureId: 70,
      viewId: 71,
    },
    roughness: {
      channel: "w",
      format: "rgba16float",
      label: "Antiky AOT forward normal and roughness",
      textureId: 100,
      viewId: 101,
    },
    sampler: { samplerId: 72, settings: {} },
    source: "exact-traced-final-consumer-objects",
  };
  for (const [index, sample] of probe.samples.entries()) {
    sample.roughness = (index % 5) * 0.25;
    sample.lod = Math.min(sample.roughness * sample.roughness * 4, 4);
  }
  return candidate;
}

test("compares aligned selected-reflection samples without retaining raw values", () => {
  const comparison = findSelectedReflectionComparison([
    result("typegpu-antiky", selectedReflectionProbe(0.8, 9001)),
    result("threejs", selectedReflectionProbe(1, 17)),
  ]);

  assert.equal(comparison.reference.status, "ready");
  assert.equal(comparison.entries.length, 1);
  assert.equal(comparison.entries[0].status, "compared");
  assert.equal(comparison.entries[0].priority.sampleCount, 1_020);
  assert.ok(comparison.entries[0].priority.rgbLogRmse > 0);
  assert.ok(comparison.entries[0].regions.floor.logLuminanceMae > 0);
  assert.equal(JSON.stringify(comparison).includes('"samples"'), false);

  const randomizedIds = findSelectedReflectionComparison([
    result("typegpu-antiky", selectedReflectionProbe(0.8, 123456)),
    result("threejs", selectedReflectionProbe(1, 987654)),
  ]);
  assert.deepEqual(
    randomizedIds.entries[0].priority,
    comparison.entries[0].priority,
  );
});

test("fails closed when selected-reflection coordinates do not match the canonical plan", () => {
  const candidate = selectedReflectionProbe(0.8);
  candidate.samples.reverse();
  const comparison = findSelectedReflectionComparison([
    result("typegpu-antiky", candidate),
    result("threejs", selectedReflectionProbe(1)),
  ]);

  assert.equal(comparison.entries[0].status, "unavailable");
  assert.equal(
    comparison.entries[0].issues[0].code,
    "selected-reflection-plan-mismatch",
  );
});

test("accepts Antiky reflection selected from surface roughness channel w", () => {
  const comparison = findSelectedReflectionComparison([
    roughnessSelectedAntikyResult(0.8),
    result("threejs", selectedReflectionProbe(1)),
  ]);

  assert.equal(comparison.entries[0].status, "compared");
  assert.deepEqual(comparison.entries[0].evidence.provenance.formula, {
    channel: "w",
    kind: "roughness-squared",
    lod: null,
    maxMipLevel: 4,
    minMipLevel: 0,
    multiplier: 4,
  });
  assert.deepEqual(
    comparison.entries[0].evidence.provenance.selectionSource,
    {
      channel: "w",
      format: "rgba16float",
      label: "Antiky five-mip roughness reflection pyramid",
      mipLevelCount: 5,
      rawTextureId: 80,
      samplerId: 72,
      surfaceTextureId: 100,
      surfaceViewId: 101,
      textureId: 90,
      viewId: 91,
    },
  );
  assert.equal(
    comparison.entries[0].evidence.provenance.lodMeaning,
    "upstream-selection",
  );
  assert.equal(comparison.entries[0].evidence.provenance.probeSampleLod, 0);
});

test("compares WESL roughness-selected reflection beside Antiky", () => {
  const antiky = roughnessSelectedAntikyResult(0.8);
  const wesl = structuredClone(roughnessSelectedAntikyResult(0.9));
  wesl.slug = "wesl";
  wesl.name = "WESL static";
  wesl.gpu.selectedReflectionProbe.provenance.targetSlug = "wesl";
  wesl.gpu.selectedReflectionProbe.provenance.resources.reflection.label =
    "WESL roughness-selected reflection";
  wesl.gpu.selectedReflectionProbe.provenance.resources.roughness.label =
    "WESL linked normal and roughness target";
  wesl.gpu.selectedReflectionProbe.provenance.selectionSource.label =
    "WESL five-level reflection reconstruction pyramid";
  wesl.gpu.selectedReflectionProbe.provenance.latestWriter.viewIds = [999];

  const comparison = findSelectedReflectionComparison([
    antiky,
    wesl,
    result("threejs", selectedReflectionProbe(1)),
  ]);

  assert.deepEqual(
    comparison.entries.map(({ slug, status }) => ({ slug, status })),
    [
      { slug: "typegpu-antiky", status: "compared" },
      { slug: "wesl", status: "compared" },
    ],
  );
});

test("rejects missing or mismatched Antiky reflection graph provenance", () => {
  const reference = result("threejs", selectedReflectionProbe(1));

  const missing = roughnessSelectedAntikyResult(0.8);
  delete missing.gpu.selectedReflectionProbe.provenance.selectionSource;
  const missingComparison = findSelectedReflectionComparison([
    missing,
    reference,
  ]);
  assert.equal(missingComparison.entries[0].status, "unavailable");
  assert.equal(
    missingComparison.entries[0].issues.at(-1).code,
    "selected-reflection-provenance-invalid",
  );

  const incompleteMips = roughnessSelectedAntikyResult(0.8);
  incompleteMips.gpu.selectedReflectionProbe.provenance.mipWrites.pop();
  const incompleteMipComparison = findSelectedReflectionComparison([
    incompleteMips,
    reference,
  ]);
  assert.equal(incompleteMipComparison.entries[0].status, "unavailable");
  assert.equal(
    incompleteMipComparison.entries[0].issues.at(-1).code,
    "selected-reflection-provenance-invalid",
  );

  const missingConsumer = roughnessSelectedAntikyResult(0.8);
  delete missingConsumer.gpu.selectedReflectionProbe.provenance.consumers
    .bloomExtraction;
  const missingConsumerComparison = findSelectedReflectionComparison([
    missingConsumer,
    reference,
  ]);
  assert.equal(missingConsumerComparison.entries[0].status, "unavailable");
  assert.equal(
    missingConsumerComparison.entries[0].issues.at(-1).code,
    "selected-reflection-provenance-invalid",
  );

  const mismatchedWriter = roughnessSelectedAntikyResult(0.8);
  mismatchedWriter.gpu.selectedReflectionProbe.provenance.latestWriter
    .passSequence = 999;
  const mismatchedWriterComparison = findSelectedReflectionComparison([
    mismatchedWriter,
    reference,
  ]);
  assert.equal(mismatchedWriterComparison.entries[0].status, "unavailable");
  assert.equal(
    mismatchedWriterComparison.entries[0].issues.at(-1).code,
    "selected-reflection-provenance-invalid",
  );

  const mismatched = roughnessSelectedAntikyResult(0.8);
  mismatched.gpu.selectedReflectionProbe.provenance.selectionSource.surfaceTextureId = 999;
  const mismatchedComparison = findSelectedReflectionComparison([
    mismatched,
    reference,
  ]);
  assert.equal(mismatchedComparison.entries[0].status, "unavailable");
  assert.equal(
    mismatchedComparison.entries[0].issues.at(-1).code,
    "selected-reflection-provenance-invalid",
  );

  const mismatchedMip = roughnessSelectedAntikyResult(0.8);
  mismatchedMip.gpu.selectedReflectionProbe.provenance.mipWrites[2]
    .rawTextureId = 999;
  const mismatchedMipComparison = findSelectedReflectionComparison([
    mismatchedMip,
    reference,
  ]);
  assert.equal(mismatchedMipComparison.entries[0].status, "unavailable");
  assert.equal(
    mismatchedMipComparison.entries[0].issues.at(-1).code,
    "selected-reflection-provenance-invalid",
  );

  const disguised = roughnessSelectedAntikyResult(0.8);
  disguised.gpu.selectedReflectionProbe.provenance.formula = {
    kind: "constant-lod",
    lod: 0,
    maxMipLevel: 0,
  };
  for (const sample of disguised.gpu.selectedReflectionProbe.samples) {
    sample.lod = 0;
    sample.roughness = null;
  }
  const disguisedComparison = findSelectedReflectionComparison([
    disguised,
    reference,
  ]);
  assert.equal(disguisedComparison.entries[0].status, "unavailable");
  assert.equal(
    disguisedComparison.entries[0].issues.at(-1).code,
    "selected-reflection-provenance-invalid",
  );
});

test("calculates exact spatial HDR metrics and rejects malformed samples", () => {
  const comparison = findSelectedReflectionComparison([
    result("typegpu-antiky", uniformProbe(0)),
    result("threejs", uniformProbe(1)),
  ]);
  assert.deepEqual(comparison.entries[0].priority, {
    activeFractionDelta: -1,
    logLuminanceMae: 0.693147,
    maximumRatio: 0,
    meanRatio: 0,
    p99Ratio: 0,
    positiveMeanRatio: null,
    rgbLogRmse: 0.693147,
    sampleCount: 1_020,
  });

  const malformed = uniformProbe(0.5);
  malformed.samples[0].channels[3] = Number.NaN;
  const unavailable = findSelectedReflectionComparison([
    result("typegpu-antiky", malformed),
    result("threejs", uniformProbe(1)),
  ]);
  assert.equal(unavailable.entries[0].status, "unavailable");
  assert.equal(
    unavailable.entries[0].issues.at(-1).code,
    "selected-reflection-sample-invalid",
  );

  for (const invalidChannel of [1n]) {
    const invalid = uniformProbe(0.5);
    invalid.samples[0].channels[0] = invalidChannel;
    assert.doesNotThrow(() =>
      findSelectedReflectionComparison([
        result("typegpu-antiky", invalid),
        result("threejs", uniformProbe(1)),
      ]),
    );
  }
});

test("rejects incomplete, unsynchronized, and negative selected-reflection evidence", () => {
  const incomplete = uniformProbe(0.5);
  incomplete.samples = incomplete.samples.slice(0, 5);
  incomplete.sampling.sampleCount = 5;
  const incompleteComparison = findSelectedReflectionComparison([
    result("typegpu-antiky", incomplete),
    result("threejs", incomplete),
  ]);
  assert.equal(incompleteComparison.reference.status, "unavailable");

  const missingSampling = uniformProbe(0.5);
  delete missingSampling.sampling;
  assert.doesNotThrow(() =>
    findSelectedReflectionComparison([
      result("typegpu-antiky", missingSampling),
      result("threejs", uniformProbe(1)),
    ]),
  );
  assert.equal(
    findSelectedReflectionComparison([
      result("typegpu-antiky", missingSampling),
      result("threejs", uniformProbe(1)),
    ]).entries[0].status,
    "unavailable",
  );

  const malformedIssues = uniformProbe(0.5);
  malformedIssues.status = "unavailable";
  malformedIssues.issues = { code: "malformed" };
  assert.doesNotThrow(() =>
    findSelectedReflectionComparison([
      result("typegpu-antiky", malformedIssues),
      result("threejs", uniformProbe(1)),
    ]),
  );

  const unsynchronized = uniformProbe(0.5);
  unsynchronized.capturedFrameIndex = 13;
  const frameComparison = findSelectedReflectionComparison([
    result("typegpu-antiky", unsynchronized),
    result("threejs", uniformProbe(1)),
  ]);
  assert.equal(frameComparison.entries[0].status, "unavailable");

  const negative = uniformProbe(0);
  negative.samples[0].channels[0] = -1;
  negative.samples[0].luminance = -0.2126;
  const negativeComparison = findSelectedReflectionComparison([
    result("typegpu-antiky", negative),
    result("threejs", uniformProbe(0)),
  ]);
  assert.equal(negativeComparison.entries[0].status, "unavailable");

  const sharedWrongPlan = uniformProbe(0.5);
  sharedWrongPlan.samples[0].x += 0.0001;
  const wrongPlanComparison = findSelectedReflectionComparison([
    result("typegpu-antiky", structuredClone(sharedWrongPlan)),
    result("threejs", sharedWrongPlan),
  ]);
  assert.equal(wrongPlanComparison.reference.status, "unavailable");

  const wrongTarget = result("typegpu-antiky", uniformProbe(0.5));
  wrongTarget.gpu.selectedReflectionProbe.provenance.targetSlug = "threejs";
  const wrongTargetComparison = findSelectedReflectionComparison([
    wrongTarget,
    result("threejs", uniformProbe(1)),
  ]);
  assert.equal(wrongTargetComparison.entries[0].status, "unavailable");

  const staleTrace = result("typegpu-antiky", uniformProbe(0.5));
  staleTrace.gpu.selectedReflectionProbe.provenance.traceFrameIndex = 7;
  const staleComparison = findSelectedReflectionComparison([
    staleTrace,
    result("threejs", uniformProbe(1)),
  ]);
  assert.equal(staleComparison.entries[0].status, "unavailable");

  const wrongFormula = result("typegpu-antiky", uniformProbe(0.5));
  wrongFormula.gpu.selectedReflectionProbe.provenance.formula = {
    channel: "g",
    kind: "roughness-squared",
    maxMipLevel: 4,
    minMipLevel: 0,
    multiplier: 4,
  };
  const wrongFormulaComparison = findSelectedReflectionComparison([
    wrongFormula,
    result("threejs", uniformProbe(1)),
  ]);
  assert.equal(wrongFormulaComparison.entries[0].status, "unavailable");

  const wrongLod = result("threejs", uniformProbe(1));
  wrongLod.gpu.selectedReflectionProbe.samples[0].lod = 3;
  const wrongLodComparison = findSelectedReflectionComparison([
    result("typegpu-antiky", uniformProbe(0.5)),
    wrongLod,
  ]);
  assert.equal(wrongLodComparison.reference.status, "unavailable");
});

test("reports an unavailable Three reference without inventing comparison data", () => {
  const comparison = findSelectedReflectionComparison([
    result("typegpu-antiky", selectedReflectionProbe(0.8)),
  ]);

  assert.equal(comparison.reference.status, "unavailable");
  assert.equal(comparison.entries[0].status, "unavailable");
  assert.equal(
    comparison.entries[0].issues[0].code,
    "selected-reflection-reference-unavailable",
  );
});

test("publishes selected-reflection evidence without copying raw samples into the summary", () => {
  const referenceProbe = selectedReflectionProbe(1);
  referenceProbe.provenance.samples = [{ secret: "reference-raw" }];
  const candidateProbe = selectedReflectionProbe(0.8);
  candidateProbe.provenance.samples = [{ secret: "candidate-raw" }];
  candidateProbe.provenance.consumers = {
    samples: { pipelineId: 999 },
  };
  candidateProbe.regions = {
    samples: { sampleCount: 3 },
  };
  candidateProbe.luminance = {
    mean: 0.1,
    samples: [{ secret: "measurement-raw" }],
  };
  candidateProbe.issues = [
    {
      code: "diagnostic-warning",
      evidence: { samples: [0.125, 0.25, 0.5] },
      message: "Synthetic warning",
    },
  ];
  const report = {
    createdAt: "2026-08-10T00:00:00.000Z",
    profile: "heavy",
    results: [
      capturedResult("threejs", referenceProbe),
      capturedResult("typegpu-antiky", candidateProbe),
    ],
    viewport: { height: 900, width: 1440 },
  };

  const summary = summarizeReport(report);
  assert.equal(
    summary.selectedReflectionComparison.entries[0].status,
    "compared",
  );
  assert.equal(
    summary.results[1].selectedReflection.priority.sampleCount,
    1_020,
  );
  assert.equal(JSON.stringify(summary).includes('"samples"'), false);
  assert.equal(JSON.stringify(summary).includes("reference-raw"), false);
  assert.equal(JSON.stringify(summary).includes("candidate-raw"), false);
  assert.equal(JSON.stringify(summary).includes("measurement-raw"), false);
  assert.equal(
    summary.results[1].selectedReflection.issues[0].evidence.samples,
    undefined,
  );

  const html = renderHtmlReport(report);
  assert.match(html, /data-reflection-status="compared"/);
  assert.match(html, /0\.0\d+ RGB log RMSE/);
});

test("sanitizes malformed values under public selected-reflection keys", () => {
  const probe = selectedReflectionProbe(1);
  probe.luminance = {
    mean: { samples: probe.samples },
  };
  probe.sampling.sampleCount = { samples: probe.samples };
  probe.provenance.formula.maxMipLevel = { samples: probe.samples };
  probe.issues = [
    {
      code: "aliased-payload",
      evidence: {
        payload: probe.samples.map((sample) => ({
          ...sample,
          secret: "aliased-raw",
        })),
      },
      message: "Synthetic aliased payload",
    },
  ];

  const published = publicSelectedReflectionProbe(
    { name: "Three.js native", slug: "threejs" },
    probe,
  );
  const serialized = JSON.stringify(published);
  assert.equal(serialized.includes('"samples"'), false);
  assert.equal(serialized.includes("aliased-raw"), false);
  assert.equal(published.measurements.luminance.mean, null);
  assert.equal(published.evidence.sampling.sampleCount, null);
  assert.equal(published.evidence.provenance.formula.maxMipLevel, null);

  const invalidCandidate = result("typegpu-antiky", selectedReflectionProbe(1));
  invalidCandidate.gpu.selectedReflectionProbe.provenance.formula = {
    kind: "invalid",
    samples: probe.samples,
  };
  const invalidComparison = findSelectedReflectionComparison([
    invalidCandidate,
    result("threejs", selectedReflectionProbe(1)),
  ]);
  assert.equal(invalidComparison.entries[0].status, "unavailable");
  assert.equal(JSON.stringify(invalidComparison).includes('"samples"'), false);
});

test("requires spatial reflection error to beat an explicit control", () => {
  const control = findSelectedReflectionComparison([
    result("typegpu-antiky", selectedReflectionProbe(0.65)),
    result("threejs", selectedReflectionProbe(1)),
  ]).entries[0];
  const candidate = findSelectedReflectionComparison([
    result("typegpu-antiky", selectedReflectionProbe(0.85)),
    result("threejs", selectedReflectionProbe(1)),
  ]).entries[0];
  const quality = evaluateSelectedReflectionQuality(candidate, control);

  assert.equal(quality.status, "passed");
  assert.equal(quality.priorityImproved, true);
  assert.deepEqual(quality.regressedRegions, []);

  const spatiallyWorse = structuredClone(candidate);
  spatiallyWorse.priority.meanRatio = 1;
  spatiallyWorse.priority.rgbLogRmse = control.priority.rgbLogRmse + 0.01;
  const rejected = evaluateSelectedReflectionQuality(spatiallyWorse, control);
  assert.equal(rejected.status, "failed");
  assert.equal(rejected.priorityImproved, false);

  const withinTolerance = structuredClone(control);
  withinTolerance.priority.rgbLogRmse =
    control.priority.rgbLogRmse - 0.000001;
  assert.equal(
    evaluateSelectedReflectionQuality(withinTolerance, control).status,
    "failed",
  );

  const mismatchedFrame = structuredClone(candidate);
  mismatchedFrame.capturedFrameIndex = 99;
  assert.equal(
    evaluateSelectedReflectionQuality(mismatchedFrame, control).status,
    "unavailable",
  );

  const mismatchedSampling = structuredClone(candidate);
  mismatchedSampling.evidence.sampling.pixelRule = "nearest-corner";
  assert.equal(
    evaluateSelectedReflectionQuality(mismatchedSampling, control).status,
    "unavailable",
  );

  const differentReference = findSelectedReflectionComparison([
    result("typegpu-antiky", selectedReflectionProbe(0.65)),
    result("threejs", selectedReflectionProbe(1.2)),
  ]).entries[0];
  assert.equal(
    evaluateSelectedReflectionQuality(differentReference, control).status,
    "unavailable",
  );

  const impossibleMetrics = structuredClone(candidate);
  impossibleMetrics.priority.rgbLogRmse = -1;
  for (const region of ["floor", "leftFire", "rightFire"]) {
    impossibleMetrics.regions[region].rgbLogRmse = -1;
  }
  assert.equal(
    evaluateSelectedReflectionQuality(impossibleMetrics, control).status,
    "unavailable",
  );
});
