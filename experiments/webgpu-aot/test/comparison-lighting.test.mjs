import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateLightingCues,
  findLightingCues,
  resolveActiveRenderBounds,
} from "../scripts/comparison-lighting.mjs";
import {
  calculateSampledLightingCues,
  findPreCompositeLightingCues,
} from "../scripts/comparison-hdr-lighting.mjs";
import { createTextureProbePlan } from "../scripts/webgpu-analysis.mjs";
import {
  renderHtmlReport,
  summarizeReport,
} from "../scripts/comparison-report.mjs";

const UPPER_SPILL = [0.461806, 0.154321, 0.565972, 0.302469];
const UPPER_CONTROL = [0.461806, 0.04321, 0.565972, 0.123457];
const FLOOR_POOL = [
  [0.465278, 0.460494],
  [0.548611, 0.460494],
  [0.6875, 0.753086],
  [0.329861, 0.753086],
];

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const [currentX, currentY] = polygon[index];
    const [previousX, previousY] = polygon[previous];
    const crosses =
      currentY > y !== previousY > y &&
      x <
        ((previousX - currentX) * (y - currentY)) /
          (previousY - currentY) +
          currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function fillPixel(pixels, width, x, y, value) {
  const offset = (y * width + x) * 4;
  pixels[offset] = value;
  pixels[offset + 1] = value;
  pixels[offset + 2] = value;
  pixels[offset + 3] = 255;
}

function inRectangle(x, y, [left, top, right, bottom]) {
  return x >= left && x < right && y >= top && y < bottom;
}

function semanticCueFixture({ floorPool = 192, upperSpill = 128 } = {}) {
  const width = 160;
  const height = 100;
  const active = resolveActiveRenderBounds(width, height, {
    height: 900,
    width: 1600,
  });
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const normalizedX = (x + 0.5 - active.left) / active.width;
      const normalizedY = (y + 0.5 - active.top) / active.height;
      let value = 64;
      if (inRectangle(normalizedX, normalizedY, UPPER_CONTROL)) value = 64;
      if (inRectangle(normalizedX, normalizedY, UPPER_SPILL)) {
        value = upperSpill;
      }
      if (pointInPolygon(normalizedX, normalizedY, FLOOR_POOL)) {
        value = floorPool;
      }
      fillPixel(pixels, width, x, y, value);
    }
  }
  return {
    active,
    height,
    pixels,
    renderSize: { height: 900, width: 1600 },
    width,
  };
}

function readyResult(slug, name, lightingCues) {
  return {
    canvas: { height: 900, width: 1600 },
    canvasMetrics: null,
    canvasScreenshot: `${slug}-canvas.png`,
    durationMs: 100,
    gpu: null,
    issues: [],
    lightingCues,
    name,
    screenshot: `${slug}.png`,
    slug,
    status: "ready",
    statusText: "ready",
    telemetry: null,
    url: `http://127.0.0.1/${slug}`,
  };
}

function sampledLightingFixture({
  control = 2,
  floorInterior = 4,
  floorRing = 1,
  upperSpill = 6,
} = {}) {
  return createTextureProbePlan().map((point) => {
    let luminance = 0;
    if (
      point.region === "upperGallery" &&
      inRectangle(point.x, point.y, UPPER_CONTROL)
    ) {
      luminance = control;
    }
    if (
      point.region === "upperGallery" &&
      inRectangle(point.x, point.y, UPPER_SPILL)
    ) {
      luminance = upperSpill;
    }
    if (
      (point.region === "floor" || point.region === "full") &&
      point.y >= 0.460494 &&
      point.y < 0.753086
    ) {
      const progress = (point.y - 0.460494) / (0.753086 - 0.460494);
      const left = 0.465278 + (0.329861 - 0.465278) * progress;
      const right = 0.548611 + (0.6875 - 0.548611) * progress;
      if (point.x >= left && point.x < right) {
        luminance = floorInterior;
      } else if (
        (point.x >= left - 0.0475 && point.x < left) ||
        (point.x >= right && point.x < right + 0.0475)
      ) {
        luminance = floorRing;
      }
    }
    return { ...point, luminance };
  });
}

function sampledLightingCues({
  floorContrast = 3,
  floorRatio = 4,
  upperContrast = 4,
  upperRatio = 3,
} = {}) {
  return {
    evidence: {
      arrayLayer: 0,
      coordinateSpace: "normalized-texture",
      luminance: "rec709-linear-hdr",
      mipLevel: 0,
      statistic: "arithmetic-mean",
    },
    floorPool: {
      brighterRowFraction: 1,
      contrast: floorContrast,
      interior: { luminanceMean: 4, luminanceMedian: 4, sampleCount: 24 },
      ratio: floorRatio,
      ring: { luminanceMean: 1, luminanceMedian: 1, sampleCount: 9 },
      rowCount: 5,
    },
    issues: [],
    status: "ready",
    upperSpill: {
      contrast: upperContrast,
      control: { luminanceMean: 2, luminanceMedian: 2, sampleCount: 5 },
      ratio: upperRatio,
      spill: { luminanceMean: 6, luminanceMedian: 6, sampleCount: 15 },
    },
  };
}

function withGpuProbes(result, textures, passes, probes) {
  return {
    ...result,
    gpu: {
      bindGroups: [],
      buffers: [],
      passSummaries: passes.map((pass, index) => ({
        bindGroupIds: [],
        depthStencilAttachment: null,
        id: index + 1,
        kind: "render",
        label: "",
        occurrences: 1,
        pipelineIds: [],
        ...pass,
      })),
      pipelines: [],
      shaderModules: [],
      textureProbes: {
        errors: [],
        results: probes.map((probe) => ({
          luminance: {
            aboveOneFraction: 0,
            activeFraction: 1,
            mean: 1,
            p90: 1,
            p99: 1,
            positiveMean: 1,
            rms: 1,
            zeroFraction: 0,
          },
          ...probe,
        })),
      },
      textures,
      textureViews: [],
    },
  };
}

test("derives the active 16:9 render from measured image and canvas dimensions", () => {
  assert.deepEqual(
    resolveActiveRenderBounds(160, 100, { height: 900, width: 1600 }),
    {
      bottom: 95,
      height: 90,
      left: 0,
      right: 160,
      top: 5,
      width: 160,
    },
  );
  assert.deepEqual(resolveActiveRenderBounds(80, 60, null), {
    bottom: 60,
    height: 60,
    left: 0,
    right: 80,
    top: 0,
    width: 80,
  });
});

test("measures the upper spill and floor pool from trimmed Rec709 pixels", () => {
  const fixture = semanticCueFixture();
  const cues = calculateLightingCues(
    fixture.pixels,
    fixture.width,
    fixture.height,
    fixture.renderSize,
  );

  assert.equal(cues.status, "ready");
  assert.deepEqual(cues.evidence.activeRenderBounds, fixture.active);
  assert.equal(cues.evidence.luminance, "rec709-display");
  assert.deepEqual(cues.evidence.trimmedPercentiles, [0.05, 0.95]);
  assert.ok(Math.abs(cues.upperSpill.contrast - 64 / 255) < 1e-6);
  assert.ok(Math.abs(cues.upperSpill.ratio - 2) < 1e-6);
  assert.ok(Math.abs(cues.floorPool.contrast - 128 / 255) < 1e-6);
  assert.ok(Math.abs(cues.floorPool.ratio - 3) < 1e-6);
  assert.equal(cues.floorPool.coherentRowFraction, 1);
  assert.ok(cues.upperSpill.spill.sampleCount > 0);
  assert.ok(cues.upperSpill.control.sampleCount > 0);
  assert.ok(cues.floorPool.interior.sampleCount > 0);
  assert.ok(cues.floorPool.ring.sampleCount > 0);
});

test("measures fixed-size linear-HDR cues from the existing sparse probe plan", () => {
  const injectedCalculate = Function(
    `return (${calculateSampledLightingCues.toString()});`,
  )();
  const cues = injectedCalculate(sampledLightingFixture());

  assert.equal(createTextureProbePlan().length, 1388);
  assert.equal(cues.status, "ready");
  assert.deepEqual(cues.evidence, {
    arrayLayer: 0,
    coordinateSpace: "normalized-texture",
    luminance: "rec709-linear-hdr",
    mipLevel: 0,
    statistic: "arithmetic-mean",
  });
  assert.deepEqual(cues.upperSpill, {
    contrast: 4,
    control: { luminanceMean: 2, luminanceMedian: 2, sampleCount: 5 },
    ratio: 3,
    spill: { luminanceMean: 6, luminanceMedian: 6, sampleCount: 15 },
  });
  assert.deepEqual(cues.floorPool, {
    brighterRowFraction: 1,
    contrast: 3,
    interior: { luminanceMean: 4, luminanceMedian: 4, sampleCount: 24 },
    ratio: 4,
    ring: { luminanceMean: 1, luminanceMedian: 1, sampleCount: 9 },
    rowCount: 5,
  });
  assert.equal("samples" in cues, false);
});

test("reports missing sampled HDR buckets without leaking raw samples", () => {
  const samples = sampledLightingFixture().filter(
    ({ region, x, y }) =>
      !(
        region === "upperGallery" &&
        inRectangle(x, y, UPPER_CONTROL)
      ),
  );
  const cues = calculateSampledLightingCues(samples);

  assert.equal(cues.status, "unavailable");
  assert.equal(cues.upperSpill, null);
  assert.equal(cues.floorPool, null);
  assert.equal(cues.issues[0].code, "sampled-lighting-regions-empty");
  assert.deepEqual(cues.issues[0].evidence, {
    controlSamples: 0,
    floorInteriorSamples: 24,
    floorRingSamples: 9,
    floorRows: 5,
    spillSamples: 15,
  });
  assert.doesNotMatch(JSON.stringify(cues), /"samples"/);
});

test("compares every measured cue with the same-run Three.js reference", () => {
  const referenceFixture = semanticCueFixture();
  const candidateFixture = semanticCueFixture({
    floorPool: 128,
    upperSpill: 96,
  });
  const referenceCues = calculateLightingCues(
    referenceFixture.pixels,
    referenceFixture.width,
    referenceFixture.height,
    referenceFixture.renderSize,
  );
  const candidateCues = calculateLightingCues(
    candidateFixture.pixels,
    candidateFixture.width,
    candidateFixture.height,
    candidateFixture.renderSize,
  );
  const lightingCues = findLightingCues([
    readyResult("brometal", "BroMetal AOT", candidateCues),
    readyResult("threejs", "Three.js native", referenceCues),
  ]);

  assert.equal(lightingCues.reference.status, "ready");
  assert.equal(lightingCues.entries[0].status, "compared");
  assert.ok(
    Math.abs(lightingCues.entries[0].relativeToThree.upperContrast - 0.5) <
      1e-5,
  );
  assert.ok(
    Math.abs(lightingCues.entries[0].relativeToThree.floorContrast - 0.5) <
      1e-5,
  );
  assert.ok(
    Math.abs(lightingCues.entries[0].relativeToThree.upperRatio - 0.75) <
      1e-5,
  );
  assert.ok(
    Math.abs(lightingCues.entries[0].relativeToThree.floorRatio - 2 / 3) <
      1e-5,
  );
});

test("selects Three raw scene MRT output and compares pre-composite HDR cues", () => {
  const prepass = sampledLightingCues({ upperContrast: 40 });
  const rawScene = sampledLightingCues();
  const traa = sampledLightingCues({ upperContrast: 80 });
  const reference = withGpuProbes(
    readyResult("threejs", "Three.js native", null),
    [
      { id: 1, label: "output" },
      { id: 2, label: "velocity" },
      { id: 3, label: "output" },
      { id: 4, label: "normal" },
      { id: 5, label: "metalrough" },
      { id: 6, label: "TRAANode.resolve" },
    ],
    [
      { colorAttachments: [{ textureId: 1 }, { textureId: 2 }] },
      {
        colorAttachments: [
          { textureId: 3 },
          { textureId: 4 },
          { textureId: 5 },
        ],
      },
      { colorAttachments: [{ textureId: 6 }] },
    ],
    [
      { label: "output", lightingCues: prepass, textureId: 1 },
      { label: "output", lightingCues: rawScene, textureId: 3 },
      { label: "TRAANode.resolve", lightingCues: traa, textureId: 6 },
    ],
  );
  const candidateCues = sampledLightingCues({
    floorContrast: 1.5,
    floorRatio: 2,
    upperContrast: 2,
    upperRatio: 1.5,
  });
  const candidate = withGpuProbes(
    readyResult("typegpu", "TypeGPU runtime", null),
    [{ id: 10, label: "TypeGPU resolved HDR color" }],
    [],
    [
      {
        label: "TypeGPU resolved HDR color",
        lightingCues: candidateCues,
        textureId: 10,
      },
    ],
  );

  const comparison = findPreCompositeLightingCues([candidate, reference]);

  assert.equal(comparison.reference.status, "ready");
  assert.equal(comparison.reference.evidence.textureId, 3);
  assert.equal(comparison.reference.upperSpill.contrast, 4);
  assert.equal(comparison.entries[0].status, "compared");
  assert.deepEqual(comparison.entries[0].relativeToThree, {
    floorContrast: 0.5,
    floorRatio: 0.5,
    upperContrast: 0.5,
    upperRatio: 0.5,
  });
});

test("reports evidence when cue pixels or the Three.js reference are absent", () => {
  const fixture = semanticCueFixture();
  const measured = calculateLightingCues(
    fixture.pixels,
    fixture.width,
    fixture.height,
    fixture.renderSize,
  );
  const missingReference = findLightingCues([
    readyResult("brometal", "BroMetal AOT", measured),
  ]);
  assert.equal(missingReference.reference.status, "unavailable");
  assert.equal(
    missingReference.reference.issues[0].code,
    "lighting-reference-result-missing",
  );
  assert.equal(missingReference.entries[0].status, "unavailable");
  assert.deepEqual(
    missingReference.entries[0].issues[0].evidence.referenceIssueCodes,
    ["lighting-reference-result-missing"],
  );

  const reference = readyResult("threejs", "Three.js native", measured);
  const candidate = readyResult("brometal", "BroMetal AOT", null);
  candidate.canvasScreenshot = null;
  const missingPixels = findLightingCues([candidate, reference]);
  assert.equal(missingPixels.entries[0].status, "unavailable");
  assert.equal(
    missingPixels.entries[0].issues[0].code,
    "lighting-pixels-unavailable",
  );
  assert.equal(
    missingPixels.entries[0].issues[0].evidence.canvasScreenshot,
    null,
  );
});

test("includes semantic lighting cues in condensed and HTML reports", () => {
  const fixture = semanticCueFixture();
  const measured = calculateLightingCues(
    fixture.pixels,
    fixture.width,
    fixture.height,
    fixture.renderSize,
  );
  const report = {
    createdAt: "2026-08-09T20:42:58.318Z",
    profile: "heavy",
    results: [
      readyResult("brometal", "BroMetal AOT", measured),
      readyResult("threejs", "Three.js native", measured),
    ],
    viewport: { height: 900, width: 1440 },
  };

  const summary = summarizeReport(report);
  assert.equal(summary.lightingCues.entries[0].status, "compared");
  assert.equal(summary.results[0].lightingCues.status, "ready");
  const html = renderHtmlReport(report);
  assert.match(html, /Upper gallery spill/);
  assert.match(html, /Floor light pool/);
  assert.match(html, /1\.000× Three\.js contrast/);
});

test("labels compact pre-composite HDR cues in summary and HTML reports", () => {
  const reference = withGpuProbes(
    readyResult("threejs", "Three.js native", null),
    [
      { id: 3, label: "output" },
      { id: 4, label: "normal" },
      { id: 5, label: "metalrough" },
    ],
    [
      {
        colorAttachments: [
          { textureId: 3 },
          { textureId: 4 },
          { textureId: 5 },
        ],
      },
    ],
    [{ label: "output", lightingCues: sampledLightingCues(), textureId: 3 }],
  );
  const candidate = withGpuProbes(
    readyResult("typegpu", "TypeGPU runtime", null),
    [{ id: 10, label: "TypeGPU resolved HDR color" }],
    [],
    [
      {
        label: "TypeGPU resolved HDR color",
        lightingCues: sampledLightingCues(),
        textureId: 10,
      },
    ],
  );
  const report = {
    createdAt: "2026-08-09T20:42:58.318Z",
    profile: "heavy",
    results: [candidate, reference],
    viewport: { height: 900, width: 1440 },
  };

  const summary = summarizeReport(report);
  assert.equal(summary.preCompositeLightingCues.reference.status, "ready");
  assert.equal(
    summary.results[0].preCompositeLightingCues.status,
    "compared",
  );
  assert.doesNotMatch(
    JSON.stringify(summary.preCompositeLightingCues),
    /"samples"/,
  );
  const html = renderHtmlReport(report);
  assert.match(html, /Pre-composite HDR/);
  assert.match(html, /brighter rows 100\.0%/);
  assert.doesNotMatch(html, /raw samples/i);
});
