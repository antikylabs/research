import { describe, expect, it } from "vitest";

import {
  availableControlledMetrics,
  architectureControlStatus,
  controlledFrameTimeBins,
  controlledReportUrl,
  formatControlledValue,
  nullControlStatus,
  type ControlledSummary,
  type ArchitectureSummary,
} from "../src/model.js";

const distribution = (mean: number) => ({
  ci95High: mean + 1,
  ci95Low: mean - 1,
  count: 2,
  max: mean + 1,
  mean,
  median: mean,
  min: mean - 1,
  p95: mean + 1,
  standardDeviation: 1,
});

const summary: ControlledSummary = {
  configuration: {
    profile: "heavy",
    runs: 2,
    sampleDurationMs: 10_000,
    sampleFrames: 10,
    warmupDurationMs: 5_000,
  },
  environment: { arch: "arm64", cpus: 10, node: "v22", platform: "test" },
  experiment: {
    causalClaimSupported: false,
    id: "identical-wgsl-null-control",
    purpose: "measurement-noise-and-order-effect-baseline",
    scope: "same bytes",
  },
  generatedAt: "2026-08-10T00:00:00.000Z",
  implementations: [{
    evidence: {},
    id: "brometal-aot",
    name: "BroMetal label",
    runs: 2,
    samples: { averageFps: [49, 51] },
    series: [{ frameTimesMs: [20, 20, 22, 18], index: 1 }],
    summary: {
      averageFps: distribution(50),
      cpuToGpuQueueWriteBytesPerFrame: distribution(16),
      frameTimeP95Ms: distribution(22),
    },
  }],
  nullControl: {
    artifactHashMatched: true,
    causalClaimSupported: false,
    cohortComplete: true,
    contractMatched: true,
    dimensions: [],
    fpsRelativeSpread: 0.02,
    purpose: "measurement-noise-and-order-effect-baseline",
    verdict: "Noise baseline.",
  },
  schemaVersion: 1,
};

const architectureSummary: ArchitectureSummary = {
  architectureControl: {
    authoringSystemClaimSupported: false,
    cohortComplete: true,
    dimensions: [],
    rendererArchitectureClaimSupported: true,
    taskIdMatched: true,
    taskMatched: true,
    verdict: "Controlled task matched.",
  },
  configuration: summary.configuration,
  environment: summary.environment,
  experiment: {
    authoringSystemClaimSupported: false,
    id: "controlled-renderer-architecture",
    purpose: "raw-webgpu-versus-threejs-controlled-task",
    scope: "same task",
  },
  generatedAt: summary.generatedAt,
  implementations: summary.implementations,
  schemaVersion: 1,
};

describe("controlled report model", () => {
  it("reports a gate status without inventing an authoring-system winner", () => {
    expect(nullControlStatus(summary)).toEqual({
      label: "Contract matched",
      tone: "matched",
    });
    expect(summary.experiment.causalClaimSupported).toBe(false);
  });

  it("separates a matched renderer-architecture gate from authoring claims", () => {
    expect(architectureControlStatus(architectureSummary)).toEqual({
      label: "Controlled task matched",
      tone: "matched",
    });
    expect(
      architectureSummary.architectureControl.authoringSystemClaimSupported,
    ).toBe(false);
  });

  it("only exposes measured dimensions", () => {
    expect(availableControlledMetrics(summary).map(({ key }) => key)).toEqual([
      "averageFps",
      "frameTimeP95Ms",
      "cpuToGpuQueueWriteBytesPerFrame",
    ]);
  });

  it("formats scientific values with their units", () => {
    expect(formatControlledValue("averageFps", 50.123)).toBe("50.1 fps");
    expect(formatControlledValue("estimatedLiveGpuBytes", 1024)).toBe("1.00 KiB");
  });

  it("bins frame time by elapsed capture time instead of frame index", () => {
    expect(controlledFrameTimeBins(summary.implementations[0], 80, 2)).toEqual([
      { elapsedFraction: 0.25, frameTimeMs: 20 },
      { elapsedFraction: 0.75, frameTimeMs: 20 },
    ]);
  });

  it("resolves controlled datasets beneath the report base path", () => {
    expect(controlledReportUrl("/", "results")).toBe("/results/latest/summary.json");
    expect(controlledReportUrl("/controlled/", "results")).toBe("/controlled/results/latest/summary.json");
    expect(controlledReportUrl("/controlled/", "architecture-results")).toBe("/controlled/architecture-results/latest/summary.json");
  });
});
