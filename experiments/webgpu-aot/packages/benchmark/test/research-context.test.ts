import { describe, expect, it } from "vitest";

import {
  buildLibraryFootprintRows,
  buildRendererSnapshots,
  type LibraryPayload,
} from "../src/research-context.js";
import type { BenchmarkSummary, Distribution } from "../src/model.js";

const measured = (mean: number): Distribution => ({
  count: 5,
  mean,
  median: mean,
  min: mean,
  max: mean,
  p95: mean,
  standardDeviation: 0,
});

const summary = {
  configuration: { profile: "heavy", runs: 5, sampleFrames: 10 },
  demos: [
    ["brometal", "BroMetal", 54.8, 25, 77.3, 4],
    ["typegpu", "TypeGPU", 37.6, 33.4, 74.6, 4],
    ["typegpu-antiky", "TypeGPU-Antiky", 46.1, 26.9, 77.2, 4],
    ["wesl", "WESL", 45.8, 26.8, 71.5, 4],
    ["threejs", "Three.js", 12.1, 100.8, 63.5, 327],
  ].map(([id, name, fps, p95, gpu, writes]) => ({
    id: String(id),
    name: String(name),
    runs: 5,
    summary: {
      averageFps: measured(Number(fps)),
      cpuToGpuQueueWriteCallsPerFrame: measured(Number(writes)),
      frameTimeP95Ms: measured(Number(p95)),
      processGpuUtilizationPercent: measured(Number(gpu)),
    },
  })),
  environment: { arch: "arm64", cpus: 14, node: "v22", platform: "darwin" },
  generatedAt: "2026-08-11T02:16:34.470Z",
  schemaVersion: 2,
} satisfies BenchmarkSummary;

const payloads: LibraryPayload[] = summary.demos.map((demo, index) => ({
  entry: index === 2 || index === 3 ? null : `${demo.id}/public-entry`,
  dependencyCount: index,
  gzipBytes: index === 2 || index === 3 ? 0 : 7_000 + index * 20_000,
  id: demo.id,
  installedBytes: 1_000_000 + index * 4_000_000,
  installedFileCount: 100 + index,
  minifiedBytes: index === 2 || index === 3 ? 0 : 20_000 + index * 60_000,
  name: demo.name,
  packageBytes: 100_000 + index * 200_000,
  packageFileCount: 20 + index,
  runtime: index !== 2 && index !== 3,
  version: "1.0.0",
}));

describe("research context", () => {
  it("builds one real-image snapshot with the same overlay fields for every renderer", () => {
    const snapshots = buildRendererSnapshots(summary, payloads, "/representative/");

    expect(snapshots).toHaveLength(5);
    expect(snapshots.map(({ id }) => id)).toEqual(summary.demos.map(({ id }) => id));
    for (const snapshot of snapshots) {
      expect(snapshot.imageUrl).toBe(`/representative/captures/${snapshot.id}.png`);
      expect(snapshot.measurements.map(({ label }) => label)).toEqual([
        "Mean FPS",
        "P95 frame",
        "GPU process",
        "CPU writes",
        "Library gzip",
      ]);
      expect(snapshot.measurements.every(({ value }) => !/NaN|undefined/.test(value))).toBe(true);
    }
    expect(snapshots.at(-1)?.measurements[3]?.value).toBe("327 / frame");
  });

  it("labels build-time-only systems as having no browser runtime library", () => {
    const snapshots = buildRendererSnapshots(summary, payloads, "/");

    expect(snapshots.find(({ id }) => id === "typegpu-antiky")?.measurements.at(-1)?.value).toBe("None shipped");
    expect(snapshots.find(({ id }) => id === "wesl")?.measurements.at(-1)?.value).toBe("None shipped");
  });

  it("presents shipped payload separately from package and installed build-time footprint", () => {
    const rows = buildLibraryFootprintRows(payloads);

    expect(rows[0]).toMatchObject({
      browserPayload: "6.84 KiB",
      dependencyLabel: "No production dependencies",
      installedFootprint: "976.56 KiB",
      packageFootprint: "97.66 KiB",
    });
    expect(rows[2]).toMatchObject({
      browserPayload: "None shipped",
      dependencyLabel: "2 production dependencies",
    });
  });
});
