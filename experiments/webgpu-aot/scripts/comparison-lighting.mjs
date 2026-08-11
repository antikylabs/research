import { readFile } from "node:fs/promises";

function rounded(value) {
  if (!Number.isFinite(value)) return null;
  const result = Number(value.toFixed(6));
  return Object.is(result, -0) ? 0 : result;
}

function issue(code, message, evidence = {}) {
  return { code, evidence, message };
}

export function resolveActiveRenderBounds(
  imageWidth,
  imageHeight,
  renderSize,
) {
  const width = Number(imageWidth);
  const height = Number(imageHeight);
  const renderWidth = Number(renderSize?.width);
  const renderHeight = Number(renderSize?.height);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(renderWidth) ||
    !Number.isFinite(renderHeight) ||
    renderWidth <= 0 ||
    renderHeight <= 0
  ) {
    return {
      bottom: height,
      height,
      left: 0,
      right: width,
      top: 0,
      width,
    };
  }

  const imageAspect = width / height;
  const renderAspect = renderWidth / renderHeight;
  let activeWidth = width;
  let activeHeight = height;
  if (imageAspect > renderAspect) {
    activeWidth = height * renderAspect;
  } else if (imageAspect < renderAspect) {
    activeHeight = width / renderAspect;
  }
  const left = (width - activeWidth) / 2;
  const top = (height - activeHeight) / 2;
  return {
    bottom: top + activeHeight,
    height: activeHeight,
    left,
    right: left + activeWidth,
    top,
    width: activeWidth,
  };
}

export function calculateLightingCues(
  pixels,
  imageWidth,
  imageHeight,
  renderSize,
  resolveBounds = resolveActiveRenderBounds,
) {
  const width = Number(imageWidth);
  const height = Number(imageHeight);
  const unavailable = (code, message, evidence = {}) => ({
    evidence,
    floorPool: null,
    issues: [{ code, evidence, message }],
    status: "unavailable",
    upperSpill: null,
  });
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    pixels === null ||
    pixels === undefined ||
    Number(pixels.length) < width * height * 4
  ) {
    return unavailable(
      "lighting-pixels-invalid",
      "Lighting cues require a complete RGBA canvas capture.",
      {
        expectedBytes:
          Number.isFinite(width) && Number.isFinite(height)
            ? width * height * 4
            : null,
        imageHeight: Number.isFinite(height) ? height : null,
        imageWidth: Number.isFinite(width) ? width : null,
        pixelBytes: Number(pixels?.length ?? 0),
      },
    );
  }

  const upperSpillBounds = [0.461806, 0.154321, 0.565972, 0.302469];
  const upperControlBounds = [0.461806, 0.04321, 0.565972, 0.123457];
  const floorTop = 0.460494;
  const floorBottom = 0.753086;
  const floorTopLeft = 0.465278;
  const floorTopRight = 0.548611;
  const floorBottomLeft = 0.329861;
  const floorBottomRight = 0.6875;
  const floorRingWidth = 0.0475;
  const active = resolveBounds(width, height, renderSize);
  const round = (value) => {
    if (!Number.isFinite(value)) return null;
    const result = Number(value.toFixed(6));
    return Object.is(result, -0) ? 0 : result;
  };
  const luminanceAt = (x, y) => {
    const offset = (y * width + x) * 4;
    return (
      0.2126 * pixels[offset] +
      0.7152 * pixels[offset + 1] +
      0.0722 * pixels[offset + 2]
    ) / 255;
  };
  const insideRectangle = (x, y, bounds) =>
    x >= bounds[0] && x < bounds[2] && y >= bounds[1] && y < bounds[3];
  const median = (values) => {
    const sorted = values.toSorted((first, second) => first - second);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  };
  const summarize = (values) => {
    if (values.length === 0) {
      return {
        luminanceMedian: null,
        luminanceP05: null,
        luminanceP95: null,
        rawTrimmedMean: null,
        sampleCount: 0,
        trimmedMean: null,
        trimmedSampleCount: 0,
      };
    }
    const sorted = values.toSorted((first, second) => first - second);
    const lower = sorted[Math.floor((sorted.length - 1) * 0.05)];
    const upper = sorted[Math.floor((sorted.length - 1) * 0.95)];
    const trimmed = sorted.filter((value) => value >= lower && value <= upper);
    const trimmedMean =
      trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length;
    return {
      rawTrimmedMean: trimmedMean,
      luminanceMedian: round(median(sorted)),
      luminanceP05: round(sorted[Math.floor((sorted.length - 1) * 0.05)]),
      luminanceP95: round(sorted[Math.floor((sorted.length - 1) * 0.95)]),
      sampleCount: sorted.length,
      trimmedMean: round(trimmedMean),
      trimmedSampleCount: trimmed.length,
    };
  };
  const contrastAndRatio = (subject, control) => ({
    contrast:
      subject.rawTrimmedMean === null || control.rawTrimmedMean === null
        ? null
        : round(subject.rawTrimmedMean - control.rawTrimmedMean),
    ratio:
      subject.rawTrimmedMean === null ||
      control.rawTrimmedMean === null ||
      control.rawTrimmedMean === 0
        ? null
        : round(subject.rawTrimmedMean / control.rawTrimmedMean),
  });

  const spillValues = [];
  const controlValues = [];
  const floorValues = [];
  const ringValues = [];
  const floorRows = new Map();
  const startX = Math.max(0, Math.floor(active.left));
  const endX = Math.min(width, Math.ceil(active.right));
  const startY = Math.max(0, Math.floor(active.top));
  const endY = Math.min(height, Math.ceil(active.bottom));
  for (let y = startY; y < endY; y += 1) {
    const normalizedY = (y + 0.5 - active.top) / active.height;
    for (let x = startX; x < endX; x += 1) {
      const normalizedX = (x + 0.5 - active.left) / active.width;
      const luminance = luminanceAt(x, y);
      if (insideRectangle(normalizedX, normalizedY, upperSpillBounds)) {
        spillValues.push(luminance);
      }
      if (insideRectangle(normalizedX, normalizedY, upperControlBounds)) {
        controlValues.push(luminance);
      }
      if (normalizedY < floorTop || normalizedY >= floorBottom) continue;

      const progress = (normalizedY - floorTop) / (floorBottom - floorTop);
      const left =
        floorTopLeft + (floorBottomLeft - floorTopLeft) * progress;
      const right =
        floorTopRight + (floorBottomRight - floorTopRight) * progress;
      const row = floorRows.get(y) ?? { interior: [], ring: [] };
      if (normalizedX >= left && normalizedX < right) {
        floorValues.push(luminance);
        row.interior.push(luminance);
      } else if (
        (normalizedX >= left - floorRingWidth && normalizedX < left) ||
        (normalizedX >= right && normalizedX < right + floorRingWidth)
      ) {
        ringValues.push(luminance);
        row.ring.push(luminance);
      }
      floorRows.set(y, row);
    }
  }

  const spill = summarize(spillValues);
  const control = summarize(controlValues);
  const interior = summarize(floorValues);
  const ring = summarize(ringValues);
  const publicSummary = ({ rawTrimmedMean: _rawTrimmedMean, ...summary }) =>
    summary;
  const comparableRows = [...floorRows.values()].filter(
    (row) => row.interior.length > 0 && row.ring.length > 0,
  );
  const coherentRows = comparableRows.filter(
    (row) => median(row.interior) - median(row.ring) > 0.04,
  ).length;
  if (
    spill.sampleCount === 0 ||
    control.sampleCount === 0 ||
    interior.sampleCount === 0 ||
    ring.sampleCount === 0 ||
    comparableRows.length === 0
  ) {
    return unavailable(
      "lighting-regions-empty",
      "The measured active render does not contain every lighting cue region.",
      {
        activeRenderBounds: active,
        controlSamples: control.sampleCount,
        floorInteriorSamples: interior.sampleCount,
        floorRingSamples: ring.sampleCount,
        floorRows: comparableRows.length,
        spillSamples: spill.sampleCount,
      },
    );
  }

  return {
    evidence: {
      activeRenderBounds: active,
      activeRenderSource:
        Number(renderSize?.width) > 0 && Number(renderSize?.height) > 0
          ? "measured-canvas-render-size"
          : "full-image-fallback",
      imageHeight: height,
      imageWidth: width,
      luminance: "rec709-display",
      floorRingWidth,
      renderSize: {
        height: Number(renderSize?.height) || null,
        width: Number(renderSize?.width) || null,
      },
      trimmedPercentiles: [0.05, 0.95],
    },
    floorPool: {
      ...contrastAndRatio(interior, ring),
      coherentRowFraction: round(coherentRows / comparableRows.length),
      coherentRows,
      interior: publicSummary(interior),
      ring: publicSummary(ring),
      rowCount: comparableRows.length,
    },
    issues: [],
    status: "ready",
    upperSpill: {
      ...contrastAndRatio(spill, control),
      control: publicSummary(control),
      spill: publicSummary(spill),
    },
  };
}

function installLightingCueAnalyzer(calculate_, resolveBounds_) {
  globalThis.__WEBGPU_LIGHTING_CUES__ = (pixels, width, height, renderSize) =>
    calculate_(pixels, width, height, renderSize, resolveBounds_);
}

export function createLightingCueAnalyzerScript() {
  return `(${installLightingCueAnalyzer.toString()})(${calculateLightingCues.toString()}, ${resolveActiveRenderBounds.toString()});`;
}

export async function analyzeLightingCuePng(page, filePath, renderSize) {
  try {
    const png = await readFile(filePath);
    return await page.evaluate(
      async ({ base64, renderSize: measuredRenderSize }) => {
        const analyze = globalThis.__WEBGPU_LIGHTING_CUES__;
        if (typeof analyze !== "function") {
          return {
            evidence: { analyzerInstalled: false },
            floorPool: null,
            issues: [
              {
                code: "lighting-analyzer-unavailable",
                evidence: { analyzerInstalled: false },
                message: "The browser lighting-cue analyzer was not installed.",
              },
            ],
            status: "unavailable",
            upperSpill: null,
          };
        }
        const response = await fetch(`data:image/png;base64,${base64}`);
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(
          0,
          0,
          bitmap.width,
          bitmap.height,
        ).data;
        const result = analyze(
          pixels,
          bitmap.width,
          bitmap.height,
          measuredRenderSize,
        );
        bitmap.close();
        return result;
      },
      { base64: png.toString("base64"), renderSize },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      evidence: { filePath, message },
      floorPool: null,
      issues: [
        issue(
          "lighting-png-analysis-failed",
          "The clean canvas PNG could not be decoded for lighting cues.",
          { filePath, message },
        ),
      ],
      status: "unavailable",
      upperSpill: null,
    };
  }
}

function publicCues(result) {
  const measurements = result?.lightingCues;
  if (measurements?.status === "ready") {
    return {
      evidence: measurements.evidence,
      floorPool: measurements.floorPool,
      issues: measurements.issues ?? [],
      name: result?.name ?? null,
      slug: result?.slug ?? null,
      status: "ready",
      upperSpill: measurements.upperSpill,
    };
  }
  const evidence = {
    canvas: result?.canvas ?? null,
    canvasMetricsAvailable: result?.canvasMetrics !== null &&
      result?.canvasMetrics !== undefined,
    canvasScreenshot: result?.canvasScreenshot ?? null,
    measurementEvidence: measurements?.evidence ?? null,
  };
  return {
    evidence,
    floorPool: null,
    issues:
      measurements?.issues?.length > 0
        ? measurements.issues
        : [
            issue(
              "lighting-pixels-unavailable",
              "No decoded clean-canvas pixels were available for lighting cues.",
              evidence,
            ),
          ],
    name: result?.name ?? null,
    slug: result?.slug ?? null,
    status: "unavailable",
    upperSpill: null,
  };
}

function unavailableReference() {
  return {
    evidence: { expectedSlug: "threejs" },
    floorPool: null,
    issues: [
      issue(
        "lighting-reference-result-missing",
        "The comparison has no Three.js lighting-cue reference capture.",
        { expectedSlug: "threejs" },
      ),
    ],
    name: null,
    slug: "threejs",
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

export function findLightingCues(results) {
  const availableResults = results ?? [];
  const referenceResult = availableResults.find(
    (result) => result.slug === "threejs",
  );
  const reference =
    referenceResult === undefined
      ? unavailableReference()
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
              "lighting-reference-unavailable",
              "Relative lighting cues require complete Three.js pixel measurements.",
              {
                referenceIssueCodes: reference.issues.map(
                  ({ code }) => code,
                ),
                referenceStatus: reference.status,
              },
            ),
          ],
          status: "unavailable",
        };
      }
      return {
        ...candidate,
        relativeToThree: {
          floorCoherentRowFraction: relativeMetric(
            candidate.floorPool.coherentRowFraction,
            reference.floorPool.coherentRowFraction,
          ),
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
