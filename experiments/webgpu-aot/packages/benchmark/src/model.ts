export interface Distribution {
  ci95High?: number;
  ci95Low?: number;
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  p95: number;
  standardDeviation: number;
}

export interface RunSeries {
  index: number;
  frameTimesMs?: number[];
  systemGpuSamples?: Array<Record<string, number>>;
}

export interface DemoSummary {
  comparisonRole?: "native-authoring-system" | "framework-reference";
  evidence?: Record<string, unknown>;
  id: string;
  name: string;
  rendererContract?: Record<string, string>;
  runs: number;
  samples?: Record<string, number[]>;
  series?: RunSeries[];
  summary: Record<string, Distribution | null>;
}

export interface ComparabilityDimension {
  entries: Array<{ id: string; name: string; value: number }>;
  gate?: "sceneTask" | "nativeCommandTopology";
  key: string;
  label: string;
  relativeSpread?: number;
  status: "matched" | "mismatched" | "unavailable";
}

export interface DeclaredComparabilityDimension {
  entries: Array<{ id: string; name: string; value: string }>;
  gate: "declaredShaderContract";
  key: string;
  label: string;
  status: "matched" | "mismatched" | "unavailable";
}

export interface ComparabilityGate {
  label: string;
  status: "matched" | "mismatched" | "unavailable";
}

export interface BenchmarkSummary {
  schemaVersion: number;
  generatedAt: string;
  configuration: {
    profile: string;
    runs: number;
    sampleDurationMs?: number;
    sampleFrames: number;
    scheduling?: string;
    warmupDurationMs?: number;
  };
  environment: { arch: string; cpus: number; memoryBytes?: number; node: string; platform: string };
  comparability?: {
    attributionSafe: boolean;
    cohortIds?: string[];
    declaredShaderDimensions?: DeclaredComparabilityDimension[];
    dimensions: ComparabilityDimension[];
    gates?: {
      sceneTask: ComparabilityGate;
      nativeCommandTopology: ComparabilityGate;
      declaredShaderContract: ComparabilityGate;
    };
    mismatches: Array<{ gate?: string; key: string; label: string; relativeSpread?: number }>;
    referenceIds?: string[];
    verdict: string;
  };
  demos: DemoSummary[];
}

export type MetricPreference = "higher" | "lower" | "neutral";

export interface MetricDefinition {
  key: string;
  label: string;
  shortLabel: string;
  unit: string;
  preference: MetricPreference;
  group: "Steady-state performance" | "Cold startup" | "Production build" | "GPU preparation" | "GPU resource allocation" | "System GPU diagnostics" | "Observed data movement" | "WebGPU workload" | "Scene contract";
  format(value: number): string;
}

const milliseconds = (value: number) => `${value.toFixed(value >= 100 ? 0 : 2)} ms`;
const count = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: value < 10 ? 2 : 0 });
const percentage = (value: number) => `${value.toFixed(1)}%`;
export const bytes = (value: number): string => {
  const units = ["B", "KiB", "MiB", "GiB"];
  let scaled = value;
  let index = 0;
  while (scaled >= 1024 && index < units.length - 1) { scaled /= 1024; index += 1; }
  return `${scaled.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

export function adapterLabel(info: Record<string, string | number>): string {
  return [info.vendor, info.architecture, info.device, info.description]
    .filter((value, index, values) => value !== undefined && value !== "" && values.indexOf(value) === index)
    .join(" · ");
}

export const METRICS: MetricDefinition[] = [
  { key: "averageFps", label: "Average frame rate", shortLabel: "Average FPS", unit: "fps", preference: "higher", group: "Steady-state performance", format: (value) => `${value.toFixed(1)} fps` },
  { key: "frameTimeP95Ms", label: "95th percentile frame time", shortLabel: "P95 frame", unit: "ms", preference: "lower", group: "Steady-state performance", format: milliseconds },
  { key: "frameTimeStandardDeviationMs", label: "Within-run frame-time variation", shortLabel: "Frame σ", unit: "ms", preference: "lower", group: "Steady-state performance", format: milliseconds },
  { key: "frameTimeWorstMs", label: "Worst sampled frame", shortLabel: "Worst frame", unit: "ms", preference: "lower", group: "Steady-state performance", format: milliseconds },
  { key: "estimatedLiveGpuBytes", label: "Estimated live WebGPU allocation", shortLabel: "WebGPU allocation", unit: "bytes", preference: "lower", group: "GPU resource allocation", format: bytes },
  { key: "liveTextureBytes", label: "Estimated live texture allocation", shortLabel: "Textures", unit: "bytes", preference: "lower", group: "GPU resource allocation", format: bytes },
  { key: "liveBufferBytes", label: "Estimated live buffer allocation", shortLabel: "Buffers", unit: "bytes", preference: "lower", group: "GPU resource allocation", format: bytes },
  { key: "liveTextureCount", label: "Live application-created textures", shortLabel: "Texture count", unit: "textures", preference: "neutral", group: "GPU resource allocation", format: count },
  { key: "liveBufferCount", label: "Live application-created buffers", shortLabel: "Buffer count", unit: "buffers", preference: "neutral", group: "GPU resource allocation", format: count },
  { key: "texturesWithUnknownSize", label: "Textures omitted from byte estimate", shortLabel: "Unknown textures", unit: "textures", preference: "neutral", group: "GPU resource allocation", format: count },
  { key: "gpuQueueDrainMs", label: "End-of-capture GPU queue drain", shortLabel: "Queue drain", unit: "ms", preference: "lower", group: "GPU resource allocation", format: milliseconds },
  { key: "systemGpuDeviceUtilizationPercent", label: "System-wide GPU device utilization", shortLabel: "GPU utilization", unit: "%", preference: "neutral", group: "System GPU diagnostics", format: percentage },
  { key: "processGpuUtilizationPercent", label: "Chrome GPU-process busy time", shortLabel: "Process GPU busy", unit: "%", preference: "neutral", group: "System GPU diagnostics", format: percentage },
  { key: "systemGpuRendererUtilizationPercent", label: "System-wide renderer utilization", shortLabel: "Renderer utilization", unit: "%", preference: "neutral", group: "System GPU diagnostics", format: percentage },
  { key: "systemGpuTilerUtilizationPercent", label: "System-wide tiler utilization", shortLabel: "Tiler utilization", unit: "%", preference: "neutral", group: "System GPU diagnostics", format: percentage },
  { key: "systemGpuInUseMemoryBytes", label: "System-wide GPU in-use memory", shortLabel: "GPU in-use memory", unit: "bytes", preference: "neutral", group: "System GPU diagnostics", format: bytes },
  { key: "systemGpuAllocatedMemoryBytes", label: "System-wide GPU allocated memory", shortLabel: "GPU allocated memory", unit: "bytes", preference: "neutral", group: "System GPU diagnostics", format: bytes },
  { key: "cpuToGpuQueueWriteCallsPerFrame", label: "CPU-source queue writes per frame", shortLabel: "CPU→GPU writes", unit: "/ frame", preference: "neutral", group: "Observed data movement", format: count },
  { key: "cpuToGpuQueueWriteBytesPerFrame", label: "Known CPU-source queue-write payload per frame", shortLabel: "CPU→GPU payload", unit: "bytes / frame", preference: "neutral", group: "Observed data movement", format: bytes },
  { key: "writeTextureUnknownByteCallsPerFrame", label: "Texture writes with unknown payload size per frame", shortLabel: "Unknown texture writes", unit: "/ frame", preference: "neutral", group: "Observed data movement", format: count },
  { key: "gpuToCpuMapReadCallsPerFrame", label: "GPU-to-CPU map-read requests per frame", shortLabel: "GPU→CPU reads", unit: "/ frame", preference: "neutral", group: "Observed data movement", format: count },
  { key: "gpuToCpuMapReadBytesPerFrame", label: "GPU-to-CPU mapped readback range per frame", shortLabel: "GPU→CPU range", unit: "bytes / frame", preference: "neutral", group: "Observed data movement", format: bytes },
  { key: "mapAsyncWriteCallsPerFrame", label: "Mapped write requests per frame", shortLabel: "Map-write requests", unit: "/ frame", preference: "neutral", group: "Observed data movement", format: count },
  { key: "mapAsyncWriteBytesPerFrame", label: "Mapped writable range per frame", shortLabel: "Map-write capacity", unit: "bytes / frame", preference: "neutral", group: "Observed data movement", format: bytes },
  { key: "mappedAtCreationCallsPerFrame", label: "Buffers mapped at creation per frame", shortLabel: "Mapped creation", unit: "/ frame", preference: "neutral", group: "Observed data movement", format: count },
  { key: "mappedAtCreationBytesPerFrame", label: "Mapped-at-creation writable capacity per frame", shortLabel: "Creation-map capacity", unit: "bytes / frame", preference: "neutral", group: "Observed data movement", format: bytes },
  { key: "preCaptureMappedAtCreationCalls", label: "Buffers mapped at creation before capture", shortLabel: "Pre-capture creation maps", unit: "buffers", preference: "neutral", group: "Observed data movement", format: count },
  { key: "preCaptureMappedAtCreationBytes", label: "Mapped-at-creation capacity before capture", shortLabel: "Pre-capture map capacity", unit: "bytes", preference: "neutral", group: "Observed data movement", format: bytes },
  { key: "getMappedRangeCallsPerFrame", label: "Mapped-range access calls per frame", shortLabel: "Mapped accesses", unit: "/ frame", preference: "neutral", group: "Observed data movement", format: count },
  { key: "copyExternalImageToTextureCallsPerFrame", label: "External-image copies to GPU textures per frame", shortLabel: "External→GPU copies", unit: "/ frame", preference: "neutral", group: "Observed data movement", format: count },
  { key: "copyExternalImageToTextureBytesPerFrame", label: "Known external-image destination payload per frame", shortLabel: "External→GPU payload", unit: "bytes / frame", preference: "neutral", group: "Observed data movement", format: bytes },
  { key: "copyExternalImageToTextureUnknownByteCallsPerFrame", label: "External-image copies with unknown payload size per frame", shortLabel: "Unknown external copies", unit: "/ frame", preference: "neutral", group: "Observed data movement", format: count },
  { key: "gpuInternalCopyCallsPerFrame", label: "GPU-internal copy commands per frame", shortLabel: "GPU-internal copies", unit: "/ frame", preference: "neutral", group: "Observed data movement", format: count },
  { key: "gpuInternalCopyBytesPerFrame", label: "Known logical GPU-internal copy payload per frame", shortLabel: "GPU-internal payload", unit: "bytes / frame", preference: "neutral", group: "Observed data movement", format: bytes },
  { key: "gpuInternalCopyUnknownByteCallsPerFrame", label: "GPU-internal copies with unknown payload size per frame", shortLabel: "Unknown internal copies", unit: "/ frame", preference: "neutral", group: "Observed data movement", format: count },
  { key: "renderPassesPerFrame", label: "Render passes per frame", shortLabel: "Render passes", unit: "/ frame", preference: "neutral", group: "WebGPU workload", format: count },
  { key: "computePassesPerFrame", label: "Compute passes per frame", shortLabel: "Compute passes", unit: "/ frame", preference: "neutral", group: "WebGPU workload", format: count },
  { key: "drawIndexedCallsPerFrame", label: "Indexed draws per frame", shortLabel: "Indexed draws", unit: "/ frame", preference: "neutral", group: "WebGPU workload", format: count },
  { key: "drawCallsPerFrame", label: "Non-indexed draws per frame", shortLabel: "Draws", unit: "/ frame", preference: "neutral", group: "WebGPU workload", format: count },
  { key: "totalIndicesPerFrame", label: "Submitted indices per frame", shortLabel: "Indices", unit: "/ frame", preference: "neutral", group: "WebGPU workload", format: count },
  { key: "totalVerticesPerFrame", label: "Submitted non-indexed vertices per frame", shortLabel: "Vertices", unit: "/ frame", preference: "neutral", group: "WebGPU workload", format: count },
  { key: "totalInstancesPerFrame", label: "Submitted draw instances per frame", shortLabel: "Instances", unit: "/ frame", preference: "neutral", group: "WebGPU workload", format: count },
  { key: "totalDispatchedWorkgroupsPerFrame", label: "Compute workgroups per frame", shortLabel: "Workgroups", unit: "/ frame", preference: "neutral", group: "WebGPU workload", format: count },
  { key: "commandEncodersPerFrame", label: "Command encoders per frame", shortLabel: "Encoders", unit: "/ frame", preference: "neutral", group: "WebGPU workload", format: count },
  { key: "queueSubmitsPerFrame", label: "Queue submits per frame", shortLabel: "Queue submits", unit: "/ frame", preference: "neutral", group: "WebGPU workload", format: count },
  { key: "submittedCommandBuffersPerFrame", label: "Submitted command buffers per frame", shortLabel: "Command buffers", unit: "/ frame", preference: "neutral", group: "WebGPU workload", format: count },
  { key: "maxSampleCount", label: "Maximum render sample count", shortLabel: "Max samples", unit: "samples", preference: "neutral", group: "WebGPU workload", format: count },
  { key: "sceneWidth", label: "Render width", shortLabel: "Width", unit: "px", preference: "neutral", group: "Scene contract", format: count },
  { key: "sceneHeight", label: "Render height", shortLabel: "Height", unit: "px", preference: "neutral", group: "Scene contract", format: count },
  { key: "sceneMeshes", label: "Scene meshes", shortLabel: "Meshes", unit: "meshes", preference: "neutral", group: "Scene contract", format: count },
  { key: "sceneVisibleMeshes", label: "Visible scene meshes", shortLabel: "Visible meshes", unit: "meshes", preference: "neutral", group: "Scene contract", format: count },
  { key: "sceneSimulatedLights", label: "Simulated scene lights", shortLabel: "Simulated lights", unit: "lights", preference: "neutral", group: "Scene contract", format: count },
  { key: "sceneAnalyticLights", label: "Analytic lights evaluated", shortLabel: "Analytic lights", unit: "lights", preference: "neutral", group: "Scene contract", format: count },
  { key: "sceneParticles", label: "Rendered particles", shortLabel: "Particles", unit: "particles", preference: "neutral", group: "Scene contract", format: count },
  { key: "startupTimeMs", label: "Page startup to ready", shortLabel: "Startup", unit: "ms", preference: "lower", group: "Cold startup", format: milliseconds },
  { key: "firstRenderedFrameMs", label: "Time to first rendered frame", shortLabel: "First frame", unit: "ms", preference: "lower", group: "Cold startup", format: milliseconds },
  { key: "assetsReadyMs", label: "Time until assets are ready", shortLabel: "Assets ready", unit: "ms", preference: "lower", group: "Cold startup", format: milliseconds },
  { key: "buildTimeMs", label: "Production build time", shortLabel: "Build time", unit: "ms", preference: "lower", group: "Production build", format: milliseconds },
  { key: "bundleBytes", label: "Production bundle size", shortLabel: "Bundle", unit: "bytes", preference: "lower", group: "Production build", format: bytes },
  { key: "bundleGzipBytes", label: "Production bundle size (gzip)", shortLabel: "Gzip bundle", unit: "bytes", preference: "lower", group: "Production build", format: bytes },
  { key: "shaderPreparationMs", label: "Shader module preparation", shortLabel: "Shaders", unit: "ms", preference: "lower", group: "GPU preparation", format: milliseconds },
  { key: "pipelineCreationMs", label: "Pipeline creation", shortLabel: "Pipelines", unit: "ms", preference: "lower", group: "GPU preparation", format: milliseconds },
];

export function hasDataMovementEvidence(summary: BenchmarkSummary): boolean {
  const keys = METRICS.filter(({ group }) => group === "Observed data movement").map(({ key }) => key);
  return summary.demos.some((demo) => keys.some((key) => demo.summary[key] !== null && demo.summary[key] !== undefined));
}

export function summaryUrl(search: string, basePath = "/"): string {
  const dataset = new URLSearchParams(search).get("dataset");
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const directory = dataset === "results-traffic" ? "results-traffic" : "results";
  return `${normalizedBase}${directory}/latest/summary.json`;
}

export function availableMetrics(summary: BenchmarkSummary): MetricDefinition[] {
  const staleSystemUtilization = summary.demos.some((demo) => Number(demo.summary.processGpuUtilizationPercent?.mean) > 0)
    && summary.demos.every((demo) => [
      demo.summary.systemGpuDeviceUtilizationPercent?.mean,
      demo.summary.systemGpuRendererUtilizationPercent?.mean,
      demo.summary.systemGpuTilerUtilizationPercent?.mean,
    ].every((value) => value === undefined || value === null || value === 0));
  const staleKeys = new Set([
    "systemGpuDeviceUtilizationPercent",
    "systemGpuRendererUtilizationPercent",
    "systemGpuTilerUtilizationPercent",
  ]);
  return METRICS.filter(({ key }) => (!staleSystemUtilization || !staleKeys.has(key))
    && summary.demos.some((demo) => demo.summary[key] !== null && demo.summary[key] !== undefined));
}

export function winner(summary: BenchmarkSummary, metric: MetricDefinition): DemoSummary | null {
  if (metric.preference === "neutral") return null;
  const candidates = summary.demos.filter((demo) => demo.summary[metric.key] !== null && demo.summary[metric.key] !== undefined);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, demo) => {
    const value = demo.summary[metric.key]!.mean;
    const bestValue = best.summary[metric.key]!.mean;
    return metric.preference === "lower" ? (value < bestValue ? demo : best) : (value > bestValue ? demo : best);
  });
}

export function rankedByAverageFps(summary: BenchmarkSummary): DemoSummary[] {
  return summary.demos
    .filter((demo) => Number.isFinite(demo.summary.averageFps?.mean))
    .sort((left, right) => right.summary.averageFps!.mean - left.summary.averageFps!.mean);
}

export function relativeWidth(value: number, values: number[]): number {
  const maximum = Math.max(...values.filter(Number.isFinite));
  return maximum <= 0 ? 0 : (value / maximum) * 100;
}

export function metricPageSizes(
  metricCount: number,
  options: { first?: number; maximum?: number } = {},
): number[] {
  if (!Number.isInteger(metricCount) || metricCount <= 0) return [];
  const maximum = Math.max(1, Math.floor(options.maximum ?? 4));
  const sizes: number[] = [];
  let remaining = metricCount;
  if (options.first !== undefined && remaining > options.first) {
    const first = Math.max(1, Math.floor(options.first));
    sizes.push(first);
    remaining -= first;
  }
  const pageCount = Math.ceil(remaining / maximum);
  const base = Math.floor(remaining / pageCount);
  const largerPages = remaining % pageCount;
  for (let index = 0; index < pageCount; index += 1) {
    sizes.push(base + (index >= pageCount - largerPages ? 1 : 0));
  }
  return sizes;
}

export function frameTimeBins(demo: DemoSummary, durationMs: number, binCount = 80): Array<{ elapsedFraction: number; frameTimeMs: number }> {
  const buckets = Array.from({ length: binCount }, () => [] as number[]);
  for (const run of demo.series ?? []) {
    let elapsed = 0;
    for (const frameTime of run.frameTimesMs ?? []) {
      elapsed += frameTime;
      const index = Math.min(binCount - 1, Math.max(0, Math.floor(elapsed / durationMs * binCount)));
      buckets[index].push(frameTime);
    }
  }
  return buckets.flatMap((values, index) => {
    if (values.length === 0) return [];
    values.sort((first, second) => first - second);
    const middle = Math.floor(values.length / 2);
    const median = values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
    return [{ elapsedFraction: (index + 0.5) / binCount, frameTimeMs: median }];
  });
}

export function processGpuBusyBins(demo: DemoSummary, durationMs: number, binCount = 20): Array<{ elapsedFraction: number; utilizationPercent: number }> {
  const buckets = Array.from({ length: binCount }, () => [] as number[]);
  for (const run of demo.series ?? []) {
    const samples = run.systemGpuSamples ?? [];
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      const elapsedMs = Number(current.elapsedMs) - Number(previous.elapsedMs);
      const gpuTimeNs = Number(current.processGpuTimeNs) - Number(previous.processGpuTimeNs);
      if (!(elapsedMs > 0) || !Number.isFinite(gpuTimeNs) || gpuTimeNs < 0) continue;
      const midpointMs = (Number(previous.elapsedMs) + Number(current.elapsedMs)) / 2;
      const bucket = Math.min(binCount - 1, Math.max(0, Math.floor(midpointMs / durationMs * binCount)));
      buckets[bucket].push(gpuTimeNs / 1_000_000 / elapsedMs * 100);
    }
  }
  return buckets.flatMap((values, index) => {
    if (values.length === 0) return [];
    values.sort((first, second) => first - second);
    const middle = Math.floor(values.length / 2);
    const median = values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
    return [{ elapsedFraction: (index + 0.5) / binCount, utilizationPercent: median }];
  });
}
