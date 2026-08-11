import assert from "node:assert/strict";
import test from "node:test";

import { deriveProcessGpuUtilization, hasUsableDeviceUtilization, parseMacGpuStatistics } from "../scripts/system-gpu.mjs";

test("parses macOS system-wide GPU utilization and memory counters", () => {
  const output = '"PerformanceStatistics" = {"In use system memory"=959594496,"Alloc system memory"=6014320640,"Tiler Utilization %"=5,"Renderer Utilization %"=52,"Device Utilization %"=52}\n+-o AGXDeviceUserClient { "AppUsage" = ({"API"="Metal","accumulatedGPUTime"=120000000},{"API"="Metal","accumulatedGPUTime"=30000000}) "IOUserClientCreator" = "pid 4321, Google Chrome Helper" }';
  assert.deepEqual(parseMacGpuStatistics(output, 4321), {
    allocatedMemoryBytes: 6014320640,
    deviceUtilizationPercent: 52,
    inUseMemoryBytes: 959594496,
    processGpuTimeNs: 150000000,
    rendererUtilizationPercent: 52,
    tilerUtilizationPercent: 5,
  });
  assert.equal(parseMacGpuStatistics("unsupported"), null);
});

test("derives process GPU busy percentage from cumulative driver time", () => {
  assert.deepEqual(deriveProcessGpuUtilization([
    { elapsedMs: 0, processGpuTimeNs: 100_000_000 },
    { elapsedMs: 1_000, processGpuTimeNs: 600_000_000 },
    { elapsedMs: 2_000, processGpuTimeNs: 850_000_000 },
  ]), [50, 25]);
});

test("rejects stale zero-valued device utilization while process GPU time advances", () => {
  assert.equal(hasUsableDeviceUtilization([
    { deviceUtilizationPercent: 0, rendererUtilizationPercent: 0, tilerUtilizationPercent: 0 },
    { deviceUtilizationPercent: 0, rendererUtilizationPercent: 0, tilerUtilizationPercent: 0 },
  ], [50]), false);
  assert.equal(hasUsableDeviceUtilization([
    { deviceUtilizationPercent: 10, rendererUtilizationPercent: 8, tilerUtilizationPercent: 2 },
  ], [50]), true);
});
