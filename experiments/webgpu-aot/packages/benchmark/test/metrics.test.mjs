import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildSummary, measureDirectory, summarize } from "../scripts/metrics.mjs";

test("summarizes repeated samples with distribution metrics", () => {
  assert.deepEqual(summarize([40, 10, Number.NaN, 30, 20]), {
    ci95High: 45.542601,
    ci95Low: 4.457399,
    count: 4,
    mean: 25,
    median: 20,
    min: 10,
    max: 40,
    p95: 40,
    standardDeviation: Math.sqrt(500 / 3),
  });
  assert.equal(summarize([]), null);
});

test("measures all production bundle files recursively", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "webgpu-benchmark-"));
  await mkdir(path.join(directory, "assets"));
  await writeFile(path.join(directory, "index.html"), "12345");
  await writeFile(path.join(directory, "assets", "app.js"), "1234567");
  await writeFile(path.join(directory, "image.bin"), "123");
  const result = await measureDirectory(directory);
  assert.equal(result.bytes, 15);
  assert.equal(result.files, 3);
  assert.ok(result.gzipBytes > 3);
});

test("builds a machine-readable comparison without discarding raw run counts", () => {
  const summary = buildSummary(
    { generatedAt: "2026-08-10T00:00:00.000Z", configuration: { runs: 2 }, environment: { platform: "test" } },
    [{ comparisonRole: "native-authoring-system", id: "a", name: "A", rendererContract: { shadingPath: "forward" }, runs: [
      { index: 1, evidence: { gpu: "measured" }, metrics: { fps: 50 }, series: { frameTimesMs: [20] } },
      { index: 2, evidence: { gpu: "measured" }, metrics: { fps: 70 }, series: { frameTimesMs: [14] } },
    ] }],
  );
  assert.equal(summary.schemaVersion, 2);
  assert.equal(summary.demos[0].runs, 2);
  assert.equal(summary.demos[0].summary.fps.mean, 60);
  assert.deepEqual(summary.demos[0].samples.fps, [50, 70]);
  assert.deepEqual(summary.demos[0].series[0], { frameTimesMs: [20], index: 1 });
  assert.deepEqual(summary.demos[0].evidence, { gpu: "measured" });
  assert.equal(summary.demos[0].comparisonRole, "native-authoring-system");
  assert.deepEqual(summary.demos[0].rendererContract, { shadingPath: "forward" });
});
