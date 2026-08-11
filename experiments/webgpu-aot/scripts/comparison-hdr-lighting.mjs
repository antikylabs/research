const HDR_LABEL_BY_SLUG = Object.freeze({
  brometal: "BroMetal Deferred HDR",
  typegpu: "TypeGPU resolved HDR color",
  "typegpu-antiky": "Antiky AOT forward HDR",
  wesl: "WESL forward HDR target",
});

function rounded(value) {
  if (!Number.isFinite(value)) return null;
  const result = Number(value.toFixed(6));
  return Object.is(result, -0) ? 0 : result;
}

function issue(code, message, evidence = {}) {
  return { code, evidence, message };
}

export function calculateSampledLightingCues(samples) {
  const UPPER_SPILL = [0.461806, 0.154321, 0.565972, 0.302469];
  const UPPER_CONTROL = [0.461806, 0.04321, 0.565972, 0.123457];
  const FLOOR_TOP = 0.460494;
  const FLOOR_BOTTOM = 0.753086;
  const FLOOR_TOP_LEFT = 0.465278;
  const FLOOR_TOP_RIGHT = 0.548611;
  const FLOOR_BOTTOM_LEFT = 0.329861;
  const FLOOR_BOTTOM_RIGHT = 0.6875;
  const FLOOR_RING_WIDTH = 0.0475;
  const evidence = {
    arrayLayer: 0,
    coordinateSpace: "normalized-texture",
    luminance: "rec709-linear-hdr",
    mipLevel: 0,
    statistic: "arithmetic-mean",
  };
  const round = (value) => {
    if (!Number.isFinite(value)) return null;
    const result = Number(value.toFixed(6));
    return Object.is(result, -0) ? 0 : result;
  };
  const insideRectangle = (x, y, bounds) =>
    x >= bounds[0] && x < bounds[2] && y >= bounds[1] && y < bounds[3];
  const mean = (values) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const median = (values) => {
    const sorted = [...values].sort((first, second) => first - second);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  };
  const summary = (values) => ({
    luminanceMean: round(mean(values)),
    luminanceMedian: round(median(values)),
    sampleCount: values.length,
  });
  const contrastAndRatio = (subject, control) => {
    const subjectMean = mean(subject);
    const controlMean = mean(control);
    return {
      contrast: round(subjectMean - controlMean),
      ratio: controlMean === 0 ? null : round(subjectMean / controlMean),
    };
  };
  const normalizedSamples = Array.isArray(samples)
    ? samples.filter(
        ({ luminance, x, y }) =>
          Number.isFinite(luminance) &&
          Number.isFinite(x) &&
          Number.isFinite(y),
      )
    : [];
  const spill = [];
  const control = [];
  const interior = [];
  const ring = [];
  const floorRows = new Map();

  for (const sample of normalizedSamples) {
    if (sample.region === "upperGallery") {
      if (insideRectangle(sample.x, sample.y, UPPER_SPILL)) {
        spill.push(sample.luminance);
      }
      if (insideRectangle(sample.x, sample.y, UPPER_CONTROL)) {
        control.push(sample.luminance);
      }
    }
    if (
      (sample.region !== "floor" && sample.region !== "full") ||
      sample.y < FLOOR_TOP ||
      sample.y >= FLOOR_BOTTOM
    ) {
      continue;
    }

    const progress = (sample.y - FLOOR_TOP) / (FLOOR_BOTTOM - FLOOR_TOP);
    const left =
      FLOOR_TOP_LEFT + (FLOOR_BOTTOM_LEFT - FLOOR_TOP_LEFT) * progress;
    const right =
      FLOOR_TOP_RIGHT + (FLOOR_BOTTOM_RIGHT - FLOOR_TOP_RIGHT) * progress;
    const row = floorRows.get(sample.y) ?? { interior: [], ring: [] };
    if (sample.x >= left && sample.x < right) {
      interior.push(sample.luminance);
      row.interior.push(sample.luminance);
    } else if (
      (sample.x >= left - FLOOR_RING_WIDTH && sample.x < left) ||
      (sample.x >= right && sample.x < right + FLOOR_RING_WIDTH)
    ) {
      ring.push(sample.luminance);
      row.ring.push(sample.luminance);
    }
    floorRows.set(sample.y, row);
  }

  const comparableRows = [...floorRows.values()].filter(
    (row) => row.interior.length > 0 && row.ring.length > 0,
  );
  if (
    spill.length === 0 ||
    control.length === 0 ||
    interior.length === 0 ||
    ring.length === 0 ||
    comparableRows.length === 0
  ) {
    const counts = {
      controlSamples: control.length,
      floorInteriorSamples: interior.length,
      floorRingSamples: ring.length,
      floorRows: comparableRows.length,
      spillSamples: spill.length,
    };
    return {
      evidence,
      floorPool: null,
      issues: [
        {
          code: "sampled-lighting-regions-empty",
          evidence: counts,
          message:
            "The base HDR texture probe does not contain every lighting cue bucket.",
        },
      ],
      status: "unavailable",
      upperSpill: null,
    };
  }

  const brighterRows = comparableRows.filter(
    (row) => mean(row.interior) > mean(row.ring),
  ).length;
  return {
    evidence,
    floorPool: {
      ...contrastAndRatio(interior, ring),
      brighterRowFraction: round(brighterRows / comparableRows.length),
      interior: summary(interior),
      ring: summary(ring),
      rowCount: comparableRows.length,
    },
    issues: [],
    status: "ready",
    upperSpill: {
      ...contrastAndRatio(spill, control),
      control: summary(control),
      spill: summary(spill),
    },
  };
}

function threeRawSceneTextureId(gpu) {
  const textures = new Map(
    (gpu?.textures ?? []).map((texture) => [texture.id, texture]),
  );
  for (const pass of gpu?.passSummaries ?? []) {
    const textureIds = (pass.colorAttachments ?? [])
      .filter((attachment) => attachment !== null)
      .map((attachment) => attachment.textureId);
    const labels = textureIds.map((textureId) => textures.get(textureId)?.label);
    if (!labels.includes("normal") || !labels.includes("metalrough")) continue;
    const outputIndex = labels.indexOf("output");
    if (outputIndex >= 0) return textureIds[outputIndex];
  }
  return null;
}

function selectHdrProbe(result) {
  const probes = result?.gpu?.textureProbes?.results ?? [];
  if (result?.slug === "threejs") {
    const textureId = threeRawSceneTextureId(result.gpu);
    return probes.find((probe) => probe.textureId === textureId) ?? null;
  }
  const label = HDR_LABEL_BY_SLUG[result?.slug];
  return label === undefined
    ? null
    : probes.find((probe) => probe.label === label) ?? null;
}

function publicCues(result) {
  const probe = selectHdrProbe(result);
  const measurements = probe?.lightingCues;
  if (measurements?.status === "ready") {
    return {
      evidence: {
        ...measurements.evidence,
        label: probe.label,
        textureId: probe.textureId,
      },
      floorPool: measurements.floorPool,
      issues: measurements.issues ?? [],
      name: result?.name ?? null,
      slug: result?.slug ?? null,
      status: "ready",
      upperSpill: measurements.upperSpill,
    };
  }
  const evidence = {
    availableLabels: (result?.gpu?.textureProbes?.results ?? []).map(
      ({ label }) => label,
    ),
    measurementEvidence: measurements?.evidence ?? null,
    selectedLabel: probe?.label ?? null,
    selectedTextureId: probe?.textureId ?? null,
  };
  return {
    evidence,
    floorPool: null,
    issues:
      measurements?.issues?.length > 0
        ? measurements.issues
        : [
            issue(
              "pre-composite-hdr-unavailable",
              "The exact pre-composite HDR texture probe is unavailable.",
              evidence,
            ),
          ],
    name: result?.name ?? null,
    slug: result?.slug ?? null,
    status: "unavailable",
    upperSpill: null,
  };
}

function relativeMetric(candidate, reference) {
  if (
    typeof candidate !== "number" ||
    typeof reference !== "number" ||
    reference === 0
  ) {
    return null;
  }
  return rounded(candidate / reference);
}

export function findPreCompositeLightingCues(results) {
  const availableResults = results ?? [];
  const referenceResult = availableResults.find(
    (result) => result.slug === "threejs",
  );
  const reference =
    referenceResult === undefined
      ? {
          evidence: { expectedSlug: "threejs" },
          floorPool: null,
          issues: [
            issue(
              "pre-composite-reference-missing",
              "The comparison has no Three.js pre-composite HDR reference.",
              { expectedSlug: "threejs" },
            ),
          ],
          name: null,
          slug: "threejs",
          status: "unavailable",
          upperSpill: null,
        }
      : publicCues(referenceResult);
  const entries = availableResults
    .filter((result) => result !== referenceResult)
    .map((result) => {
      const candidate = publicCues(result);
      if (candidate.status !== "ready") return candidate;
      if (reference.status !== "ready") {
        return {
          ...candidate,
          issues: [
            ...candidate.issues,
            issue(
              "pre-composite-reference-unavailable",
              "Relative pre-composite HDR cues require the Three.js raw scene MRT output.",
              { referenceStatus: reference.status },
            ),
          ],
          status: "unavailable",
        };
      }
      return {
        ...candidate,
        relativeToThree: {
          floorContrast: relativeMetric(
            candidate.floorPool.contrast,
            reference.floorPool.contrast,
          ),
          floorRatio: relativeMetric(
            candidate.floorPool.ratio,
            reference.floorPool.ratio,
          ),
          upperContrast: relativeMetric(
            candidate.upperSpill.contrast,
            reference.upperSpill.contrast,
          ),
          upperRatio: relativeMetric(
            candidate.upperSpill.ratio,
            reference.upperSpill.ratio,
          ),
        },
        status: "compared",
      };
    });

  return { entries, reference };
}
