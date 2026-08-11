import { bytes, type BenchmarkSummary, type DemoSummary } from "./model.js";

export interface LibraryPayload {
  dependencyCount: number;
  entry: string | null;
  gzipBytes: number;
  id: string;
  installedBytes: number;
  installedFileCount: number;
  minifiedBytes: number;
  name: string;
  packageBytes: number;
  packageFileCount: number;
  runtime: boolean;
  version: string;
}

export interface LibraryFootprintRow {
  browserPayload: string;
  dependencyLabel: string;
  entry: string | null;
  id: string;
  installedFootprint: string;
  minifiedPayload: string | null;
  name: string;
  packageFootprint: string;
  version: string;
}

export interface SnapshotMeasurement {
  label: string;
  value: string;
}

export interface RendererSnapshot {
  id: string;
  imageUrl: string;
  measurements: SnapshotMeasurement[];
  name: string;
  path: string;
}

const RENDERING_PATHS: Record<string, string> = {
  brometal: "AOT TypeScript → static WGSL",
  typegpu: "Runtime TypeGPU resolution",
  "typegpu-antiky": "AOT TypeGPU → static artifacts",
  wesl: "Static WESL linking → WGSL",
  threejs: "Runtime Three.js WebGPU / TSL",
};

function mean(demo: DemoSummary, key: string): number | null {
  const value = demo.summary[key]?.mean;
  return value === undefined || !Number.isFinite(value) ? null : value;
}

function fixed(value: number | null, suffix: string): string {
  return value === null ? "Unavailable" : `${value.toFixed(1)}${suffix}`;
}

function countPerFrame(value: number | null): string {
  if (value === null) return "Unavailable";
  return `${value.toLocaleString(undefined, { maximumFractionDigits: value < 10 ? 1 : 0 })} / frame`;
}

export function buildLibraryFootprintRows(payloads: readonly LibraryPayload[]): LibraryFootprintRow[] {
  return payloads.map((payload) => ({
    browserPayload: payload.runtime ? bytes(payload.gzipBytes) : "None shipped",
    dependencyLabel: payload.dependencyCount === 0
      ? "No production dependencies"
      : `${payload.dependencyCount} production ${payload.dependencyCount === 1 ? "dependency" : "dependencies"}`,
    entry: payload.entry,
    id: payload.id,
    installedFootprint: bytes(payload.installedBytes),
    minifiedPayload: payload.runtime ? bytes(payload.minifiedBytes) : null,
    name: payload.name,
    packageFootprint: bytes(payload.packageBytes),
    version: payload.version,
  }));
}

export function buildRendererSnapshots(
  summary: BenchmarkSummary,
  payloads: readonly LibraryPayload[],
  basePath: string,
): RendererSnapshot[] {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return summary.demos.map((demo) => {
    const payload = payloads.find(({ id }) => id === demo.id);
    const libraryPayload = payload === undefined
      ? "Unavailable"
      : payload.runtime
        ? bytes(payload.gzipBytes)
        : "None shipped";
    return {
      id: demo.id,
      imageUrl: `${normalizedBase}captures/${demo.id}.png`,
      measurements: [
        { label: "Mean FPS", value: fixed(mean(demo, "averageFps"), " fps") },
        { label: "P95 frame", value: fixed(mean(demo, "frameTimeP95Ms"), " ms") },
        { label: "GPU process", value: fixed(mean(demo, "processGpuUtilizationPercent"), "%") },
        { label: "CPU writes", value: countPerFrame(mean(demo, "cpuToGpuQueueWriteCallsPerFrame")) },
        { label: "Library gzip", value: libraryPayload },
      ],
      name: demo.name,
      path: RENDERING_PATHS[demo.id] ?? "Renderer-specific WebGPU path",
    };
  });
}
