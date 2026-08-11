import { describe, expect, it } from "vitest";

import { buildShareCards, shareCardIdFromSearch } from "../src/export-cards.js";
import type { BenchmarkSummary, Distribution } from "../src/model.js";

const measured = (mean: number): Distribution => ({
  ci95High: mean * 1.05,
  ci95Low: mean * .95,
  count: 5,
  mean,
  median: mean,
  min: mean * .9,
  max: mean * 1.1,
  p95: mean * 1.1,
  standardDeviation: mean * .04,
});

const summary: BenchmarkSummary = {
  schemaVersion: 2,
  generatedAt: "2026-08-10T00:00:00.000Z",
  configuration: { profile: "heavy", runs: 5, sampleDurationMs: 10_000, sampleFrames: 10, warmupDurationMs: 5_000 },
  environment: { arch: "arm64", cpus: 10, node: "v22", platform: "darwin" },
  demos: [
    ["brometal", "BroMetal", 55, 25, 3.3, 28, 14_192, 739_082_932, 77],
    ["typegpu", "TypeGPU", 38, 33, 3.7, 38, 17_472, 805_382_996, 75],
    ["typegpu-antiky", "TypeGPU-Antiky", 46, 27, 4.1, 31, 15_344, 838_935_300, 77],
    ["wesl", "WESL", 45, 27, 4.3, 32, 14_192, 823_126_888, 71],
    ["threejs", "Three.js", 12, 101, 10.6, 111, 59_172, 1_091_548_132, 63],
  ].map(([id, name, fps, p95, deviation, worst, upload, allocation, gpu], index) => ({
    id: String(id),
    name: String(name),
    runs: 5,
    summary: {
      averageFps: measured(Number(fps)),
      frameTimeP95Ms: measured(Number(p95)),
      frameTimeStandardDeviationMs: measured(Number(deviation)),
      frameTimeWorstMs: measured(Number(worst)),
      startupTimeMs: measured(300 + index * 20),
      firstRenderedFrameMs: measured(250 + index * 18),
      assetsReadyMs: measured(240 + index * 16),
      buildTimeMs: measured(700 + index * 120),
      bundleBytes: measured(820_000 + index * 210_000),
      bundleGzipBytes: measured(210_000 + index * 52_000),
      shaderPreparationMs: measured(4 + index * 2),
      pipelineCreationMs: measured(10 + index * 4),
      cpuToGpuQueueWriteCallsPerFrame: measured(index === 4 ? 327 : 4),
      cpuToGpuQueueWriteBytesPerFrame: measured(Number(upload)),
      estimatedLiveGpuBytes: measured(Number(allocation)),
      liveTextureBytes: measured(Number(allocation) - 10_000_000),
      liveBufferBytes: measured(10_000_000),
      liveTextureCount: measured(90 + index),
      liveBufferCount: measured(480 + index * 4),
      texturesWithUnknownSize: measured(index),
      gpuQueueDrainMs: measured(4 + index),
      systemGpuDeviceUtilizationPercent: measured(72 + index),
      processGpuUtilizationPercent: measured(Number(gpu)),
      systemGpuRendererUtilizationPercent: measured(60 + index),
      systemGpuTilerUtilizationPercent: measured(5 + index),
      systemGpuInUseMemoryBytes: measured(1_500_000_000 + index * 100_000_000),
      systemGpuAllocatedMemoryBytes: measured(7_000_000_000 + index * 100_000_000),
    },
  })),
};

describe("publication share cards", () => {
  it("accepts only named standalone publication figures", () => {
    expect(shareCardIdFromSearch("?card=steady-state-performance")).toBe("steady-state-performance");
    expect(shareCardIdFromSearch("?card=renderer-ranking&dataset=results-traffic")).toBe("renderer-ranking");
    expect(shareCardIdFromSearch("?card=cold-start-and-artifacts")).toBe("cold-start-and-artifacts");
    expect(shareCardIdFromSearch("?card=../../private")).toBeNull();
    expect(shareCardIdFromSearch("")).toBeNull();
  });

  it("builds six 1600 by 900 PNG-ready figures", () => {
    const cards = buildShareCards(summary);

    expect(cards.map(({ id }) => id)).toEqual([
      "renderer-ranking",
      "steady-state-performance",
      "gpu-footprint-and-traffic",
      "cpu-source-queue-writes",
      "resource-system-diagnostics",
      "cold-start-and-artifacts",
    ]);
    expect(cards.every(({ height, width }) => height === 900 && width === 1600)).toBe(true);
    expect(cards.every(({ fileName }) => fileName.endsWith(".png"))).toBe(true);
  });

  it("fits all four steady-state measurements and all renderers in one figure", () => {
    const card = buildShareCards(summary).find(({ id }) => id === "steady-state-performance")!;

    expect(card.svg.match(/data-metric=/g)).toHaveLength(4);
    for (const demo of summary.demos) expect(card.svg).toContain(demo.name);
    expect(card.svg).toContain('viewBox="0 0 1600 900"');
    expect(card.svg).not.toMatch(/NaN|undefined/);
  });

  it("puts the measured winner and publication protocol on the ranking figure", () => {
    const card = buildShareCards(summary).find(({ id }) => id === "renderer-ranking")!;

    expect(card.svg).toContain("BroMetal leads at 55.0 fps");
    expect(card.svg).toContain("5 independent runs");
    expect(card.svg).toContain("10 s measured");
    expect(card.svg).toContain("5 s warmup");
  });

  it("keeps calls and payload together in the CPU-source queue-write figure", () => {
    const card = buildShareCards(summary).find(({ id }) => id === "cpu-source-queue-writes")!;

    expect(card.svg.match(/data-metric=/g)).toHaveLength(2);
    expect(card.svg).toContain('data-metric="cpuToGpuQueueWriteCallsPerFrame"');
    expect(card.svg).toContain('data-metric="cpuToGpuQueueWriteBytesPerFrame"');
    expect(card.svg).toContain("81.8x BroMetal&apos;s call frequency");
    expect(card.svg).toContain("4.2x its known per-frame payload");
  });

  it("keeps every cold-start, build, and GPU-preparation metric in one figure", () => {
    const card = buildShareCards(summary).find(({ id }) => id === "cold-start-and-artifacts")!;
    const metricKeys = [
      "startupTimeMs", "firstRenderedFrameMs", "assetsReadyMs",
      "buildTimeMs", "bundleBytes", "bundleGzipBytes",
      "shaderPreparationMs", "pipelineCreationMs",
    ];

    for (const key of metricKeys) expect(card.svg).toContain(`data-metric="${key}"`);
  });

  it("keeps resource allocation and all system diagnostics in one figure", () => {
    const card = buildShareCards(summary).find(({ id }) => id === "resource-system-diagnostics")!;
    const metricKeys = [
      "estimatedLiveGpuBytes", "liveTextureBytes", "liveBufferBytes", "liveTextureCount",
      "liveBufferCount", "texturesWithUnknownSize", "gpuQueueDrainMs",
      "systemGpuDeviceUtilizationPercent", "processGpuUtilizationPercent",
      "systemGpuRendererUtilizationPercent", "systemGpuTilerUtilizationPercent",
      "systemGpuInUseMemoryBytes", "systemGpuAllocatedMemoryBytes",
    ];

    for (const key of metricKeys) expect(card.svg).toContain(`data-metric="${key}"`);
  });
});
