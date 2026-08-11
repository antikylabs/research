import { execFile } from "node:child_process";
import { promisify } from "node:util";

const executeFile = promisify(execFile);

function numberFor(output, label) {
  const match = output.match(new RegExp(`"${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"=(\\d+)`));
  return match === null ? null : Number(match[1]);
}

function processGpuTime(output, processId) {
  if (!Number.isInteger(Number(processId))) return null;
  const creator = output.indexOf(`"IOUserClientCreator" = "pid ${processId},`);
  if (creator < 0) return null;
  const start = output.lastIndexOf("+-o AGXDeviceUserClient", creator);
  const next = output.indexOf("+-o AGXDeviceUserClient", creator + 1);
  const block = output.slice(Math.max(0, start), next < 0 ? output.length : next);
  const values = [...block.matchAll(/"accumulatedGPUTime"=(\d+)/g)].map((match) => Number(match[1]));
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
}

export function parseMacGpuStatistics(output, processId = null) {
  const deviceUtilizationPercent = numberFor(output, "Device Utilization %");
  if (deviceUtilizationPercent === null) return null;
  const result = {
    allocatedMemoryBytes: numberFor(output, "Alloc system memory"),
    deviceUtilizationPercent,
    inUseMemoryBytes: numberFor(output, "In use system memory"),
    rendererUtilizationPercent: numberFor(output, "Renderer Utilization %"),
    tilerUtilizationPercent: numberFor(output, "Tiler Utilization %"),
  };
  const processGpuTimeNs = processGpuTime(output, processId);
  return processGpuTimeNs === null ? result : { ...result, processGpuTimeNs };
}

export function deriveProcessGpuUtilization(samples) {
  const utilization = [];
  for (let index = 1; index < samples.length; index += 1) {
    const elapsedMs = Number(samples[index].elapsedMs) - Number(samples[index - 1].elapsedMs);
    const gpuTimeNs = Number(samples[index].processGpuTimeNs) - Number(samples[index - 1].processGpuTimeNs);
    if (elapsedMs > 0 && Number.isFinite(gpuTimeNs) && gpuTimeNs >= 0) utilization.push(gpuTimeNs / 1_000_000 / elapsedMs * 100);
  }
  return utilization;
}

export function hasUsableDeviceUtilization(samples, processUtilization) {
  if (processUtilization.length === 0) return true;
  return samples.some((sample) => [
    sample.deviceUtilizationPercent,
    sample.rendererUtilizationPercent,
    sample.tilerUtilizationPercent,
  ].some((value) => Number(value) > 0));
}

export function createSystemGpuSampler({
  intervalMs = 1_000,
  platform = process.platform,
  processId = null,
} = {}) {
  const samples = [];
  let active = false;
  let inFlight = Promise.resolve();
  let startedAt = 0;
  let timer = null;

  const sample = async () => {
    if (!active || platform !== "darwin") return;
    try {
      const { stdout } = await executeFile(
        "ioreg",
        ["-r", "-c", "AGXAccelerator", "-l", "-k", "PerformanceStatistics"],
        { maxBuffer: 16 * 1024 * 1024 },
      );
      const values = parseMacGpuStatistics(stdout, processId);
      if (values !== null) samples.push({ elapsedMs: performance.now() - startedAt, ...values });
    } catch {
      active = false;
    }
    if (active) timer = setTimeout(() => { inFlight = sample(); }, intervalMs);
  };

  return {
    method: platform === "darwin" ? "macos-ioreg-system-wide" : "unavailable",
    start() {
      active = true;
      startedAt = performance.now();
      inFlight = sample();
    },
    async stop() {
      active = false;
      if (timer !== null) clearTimeout(timer);
      await inFlight;
      return samples;
    },
  };
}
