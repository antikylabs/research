import { describe, expect, it } from "vitest";

import { METRICS, adapterLabel, availableMetrics, frameTimeBins, hasDataMovementEvidence, metricPageSizes, processGpuBusyBins, rankedByAverageFps, relativeWidth, summaryUrl, winner, type BenchmarkSummary } from "../src/model.js";

const distribution = (mean: number, min = mean, max = mean) => ({
  ci95High: max,
  ci95Low: min,
  count: 2,
  mean,
  median: mean,
  min,
  max,
  p95: max,
  standardDeviation: (max - min) / 2,
});

const summary: BenchmarkSummary = {
  schemaVersion: 2,
  generatedAt: "2026-08-10T00:00:00.000Z",
  configuration: { profile: "heavy", runs: 2, sampleDurationMs: 10_000, sampleFrames: 10 },
  environment: { arch: "arm64", cpus: 8, node: "v22", platform: "test" },
  demos: [
    { id: "a", name: "A", runs: 2, samples: { averageFps: [59, 61] }, series: [{ index: 1, frameTimesMs: [20, 20, 30, 30] }], summary: { averageFps: distribution(60, 59, 61), buildTimeMs: null } },
    { id: "b", name: "B", runs: 2, samples: { averageFps: [88, 92] }, series: [{ index: 1, frameTimesMs: [10, 10, 15, 15] }], summary: { averageFps: distribution(90, 88, 92), buildTimeMs: null } },
  ],
};

describe("benchmark dashboard model", () => {
  it("keeps only metrics with actual measurements", () => {
    expect(availableMetrics(summary).map(({ key }) => key)).toEqual(["averageFps"]);
  });

  it("selects winners in the metric's preferred direction", () => {
    expect(winner(summary, METRICS[0])?.id).toBe("b");
  });

  it("orders the renderer overview by measured average frame rate", () => {
    expect(rankedByAverageFps(summary).map(({ name }) => name)).toEqual(["B", "A"]);
  });

  it("normalizes chart bars against the largest measurement", () => {
    expect(relativeWidth(60, [60, 90])).toBeCloseTo(66.6667);
  });

  it("bins every repeated frame series by elapsed capture time", () => {
    expect(frameTimeBins(summary.demos[0], 100, 2)).toEqual([
      { elapsedFraction: 0.25, frameTimeMs: 20 },
      { elapsedFraction: 0.75, frameTimeMs: 30 },
    ]);
  });

  it("does not declare a winner for diagnostic metrics", () => {
    const diagnostic = METRICS.find(({ key }) => key === "systemGpuDeviceUtilizationPercent")!;
    expect(winner(summary, diagnostic)).toBeNull();
  });

  it("exposes command volume dimensions instead of hiding them in raw counters", () => {
    expect(METRICS.filter(({ group }) => group === "WebGPU workload").map(({ key }) => key)).toEqual(expect.arrayContaining([
      "commandEncodersPerFrame",
      "submittedCommandBuffersPerFrame",
      "totalIndicesPerFrame",
      "totalInstancesPerFrame",
      "totalVerticesPerFrame",
    ]));
  });

  it("keeps directional transfer metrics separate from GPU-internal copies", () => {
    const movement = METRICS.filter(({ group }) => group === "Observed data movement").map(({ key }) => key);
    expect(movement).toEqual(expect.arrayContaining([
      "cpuToGpuQueueWriteCallsPerFrame",
      "cpuToGpuQueueWriteBytesPerFrame",
      "gpuToCpuMapReadCallsPerFrame",
      "gpuToCpuMapReadBytesPerFrame",
      "copyExternalImageToTextureCallsPerFrame",
      "copyExternalImageToTextureBytesPerFrame",
      "gpuInternalCopyCallsPerFrame",
      "gpuInternalCopyBytesPerFrame",
      "preCaptureMappedAtCreationCalls",
      "preCaptureMappedAtCreationBytes",
    ]));
  });

  it("distinguishes legacy results from captures with data-movement evidence", () => {
    expect(hasDataMovementEvidence(summary)).toBe(false);
    expect(hasDataMovementEvidence({
      ...summary,
      demos: summary.demos.map((demo) => ({
        ...demo,
        summary: { ...demo.summary, cpuToGpuQueueWriteBytesPerFrame: distribution(64) },
      })),
    })).toBe(true);
  });

  it("derives a directional Chrome GPU-process utilization series from cumulative driver time", () => {
    const demo = {
      ...summary.demos[0],
      series: [{
        index: 1,
        systemGpuSamples: [
          { elapsedMs: 0, processGpuTimeNs: 1_000_000 },
          { elapsedMs: 1_000, processGpuTimeNs: 501_000_000 },
          { elapsedMs: 2_000, processGpuTimeNs: 1_251_000_000 },
        ],
      }],
    };
    expect(processGpuBusyBins(demo, 2_000, 2)).toEqual([
      { elapsedFraction: 0.25, utilizationPercent: 50 },
      { elapsedFraction: 0.75, utilizationPercent: 75 },
    ]);
  });

  it("hides stale zero-valued system utilization when process GPU time advances", () => {
    const withStaleSystemUtilization: BenchmarkSummary = {
      ...summary,
      demos: summary.demos.map((demo) => ({
        ...demo,
        summary: {
          processGpuUtilizationPercent: distribution(50),
          systemGpuDeviceUtilizationPercent: distribution(0),
        },
      })),
    };
    expect(availableMetrics(withStaleSystemUtilization).map(({ key }) => key)).toEqual(["processGpuUtilizationPercent"]);
  });

  it("formats redacted adapter identity without empty separators", () => {
    expect(adapterLabel({ architecture: "metal-3", description: "", device: "", vendor: "apple" })).toBe("apple · metal-3");
    expect(adapterLabel({})).toBe("");
  });

  it("selects the preserved traffic campaign without accepting arbitrary result paths", () => {
    expect(summaryUrl("")).toBe("/results/latest/summary.json");
    expect(summaryUrl("?dataset=results-traffic")).toBe("/results-traffic/latest/summary.json");
    expect(summaryUrl("", "/representative/")).toBe("/representative/results/latest/summary.json");
    expect(summaryUrl("?dataset=results-traffic", "/representative/")).toBe("/representative/results-traffic/latest/summary.json");
    expect(summaryUrl("?dataset=../../private")).toBe("/results/latest/summary.json");
  });

  it("balances long print sections without leaving one metric on a page", () => {
    expect(metricPageSizes(13, { first: 2, maximum: 4 })).toEqual([2, 3, 4, 4]);
    expect(metricPageSizes(18, { first: 2, maximum: 4 })).toEqual([2, 4, 4, 4, 4]);
    expect(metricPageSizes(8, { maximum: 4 })).toEqual([4, 4]);
  });
});
