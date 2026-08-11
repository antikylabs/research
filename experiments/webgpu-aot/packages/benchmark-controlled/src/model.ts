export interface Distribution {
  ci95High?: number;
  ci95Low?: number;
  count: number;
  max: number;
  mean: number;
  median: number;
  min: number;
  p95: number;
  standardDeviation: number;
}

export interface ControlledSeries {
  frameTimesMs?: number[];
  index: number;
  systemGpuSamples?: Array<Record<string, number>>;
}

export interface ControlledImplementation {
  evidence: Record<string, unknown>;
  id: string;
  name: string;
  runs: number;
  samples: Record<string, number[]>;
  series: ControlledSeries[];
  summary: Record<string, Distribution | null>;
}

export interface ControlledSummary {
  configuration: {
    profile: string;
    runs: number;
    sampleDurationMs: number;
    sampleFrames: number;
    warmupDurationMs: number;
  };
  environment: {
    arch: string;
    cpus: number;
    memoryBytes?: number;
    node: string;
    platform: string;
  };
  experiment: {
    causalClaimSupported: false;
    id: "identical-wgsl-null-control";
    purpose: "measurement-noise-and-order-effect-baseline";
    scope: string;
  };
  generatedAt: string;
  implementations: ControlledImplementation[];
  nullControl: {
    artifactHashMatched: boolean;
    causalClaimSupported: false;
    cohortComplete: boolean;
    contractMatched: boolean;
    dimensions: Array<{
      entries: Array<{ id: string; name: string; value: number }>;
      expected: number;
      key: string;
      status: "matched" | "mismatched" | "unavailable";
    }>;
    fpsRelativeSpread: number | null;
    purpose: string;
    verdict: string;
  };
  schemaVersion: number;
  sharedArtifact?: {
    buildTimeMs: number;
    bytes: number;
    files: number;
    gzipBytes: number;
  };
}

export interface ArchitectureSummary {
  architectureControl: {
    authoringSystemClaimSupported: false;
    cohortComplete: boolean;
    dimensions: Array<{
      entries: Array<{ id: string; name: string; value: number }>;
      key: string;
      status: "matched" | "mismatched" | "unavailable";
    }>;
    rendererArchitectureClaimSupported: boolean;
    taskIdMatched: boolean;
    taskMatched: boolean;
    verdict: string;
  };
  configuration: ControlledSummary["configuration"];
  environment: ControlledSummary["environment"];
  experiment: {
    authoringSystemClaimSupported: false;
    id: "controlled-renderer-architecture";
    purpose: "raw-webgpu-versus-threejs-controlled-task";
    scope: string;
  };
  generatedAt: string;
  implementations: ControlledImplementation[];
  schemaVersion: number;
}

export interface ControlledMetric {
  description: string;
  group:
    | "Performance distribution"
    | "CPU and GPU timing"
    | "CPU↔GPU API traffic"
    | "GPU resources"
    | "Frame graph"
    | "Startup and package";
  key: string;
  label: string;
  unit: string;
}

const bytes = (value: number): string => {
  const units = ["B", "KiB", "MiB", "GiB"];
  let scaled = value;
  let index = 0;
  while (scaled >= 1024 && index < units.length - 1) {
    scaled /= 1024;
    index += 1;
  }
  return `${scaled.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

export const CONTROLLED_METRICS: ControlledMetric[] = [
  { key: "averageFps", label: "Average frame rate", unit: "fps", group: "Performance distribution", description: "Mean requestAnimationFrame cadence during each fixed capture." },
  { key: "frameTimeP95Ms", label: "P95 frame time", unit: "ms", group: "Performance distribution", description: "95th-percentile browser animation-frame interval." },
  { key: "frameTimeStandardDeviationMs", label: "Within-run frame σ", unit: "ms", group: "Performance distribution", description: "Sample standard deviation of browser animation-frame intervals." },
  { key: "frameTimeWorstMs", label: "Worst sampled frame", unit: "ms", group: "Performance distribution", description: "Largest observed browser animation-frame interval." },
  { key: "cpuFrameTimeMs", label: "CPU encoding time", unit: "ms", group: "CPU and GPU timing", description: "Application-side time to update, encode, and submit the latest frame; not total CPU utilization." },
  { key: "gpuQueueDrainMs", label: "End-capture queue drain", unit: "ms", group: "CPU and GPU timing", description: "Time for onSubmittedWorkDone after the measurement snapshot; a queue-backlog diagnostic, not GPU frame time." },
  { key: "processGpuUtilizationPercent", label: "Chrome GPU-process busy", unit: "%", group: "CPU and GPU timing", description: "GPU driver time attributed to Chrome's GPU process where the platform exposes it." },
  { key: "systemGpuDeviceUtilizationPercent", label: "System GPU utilization", unit: "%", group: "CPU and GPU timing", description: "System-wide device utilization; unavailable when macOS reports stale counters." },
  { key: "cpuToGpuQueueWriteBytesPerFrame", label: "CPU-source queue-write payload", unit: "bytes / frame", group: "CPU↔GPU API traffic", description: "Known queue.writeBuffer plus queue.writeTexture payload; logical API volume, not physical bus traffic." },
  { key: "cpuToGpuQueueWriteCallsPerFrame", label: "CPU-source queue writes", unit: "calls / frame", group: "CPU↔GPU API traffic", description: "queue.writeBuffer plus queue.writeTexture call count." },
  { key: "gpuToCpuMapReadBytesPerFrame", label: "GPU→CPU mapped readback range", unit: "bytes / frame", group: "CPU↔GPU API traffic", description: "Requested mapAsync(READ) range counted once; not proof of a discrete-memory transfer." },
  { key: "gpuToCpuMapReadCallsPerFrame", label: "GPU→CPU map-read requests", unit: "calls / frame", group: "CPU↔GPU API traffic", description: "Observed mapAsync(READ) requests." },
  { key: "mapAsyncWriteBytesPerFrame", label: "Mapped writable range", unit: "bytes / frame", group: "CPU↔GPU API traffic", description: "Requested mapAsync(WRITE) capacity; JavaScript mutations are not observable, so this is not confirmed upload volume." },
  { key: "mapAsyncWriteCallsPerFrame", label: "Mapped write requests", unit: "calls / frame", group: "CPU↔GPU API traffic", description: "Observed mapAsync(WRITE) requests." },
  { key: "preCaptureMappedAtCreationBytes", label: "Pre-capture mapped capacity", unit: "bytes", group: "CPU↔GPU API traffic", description: "Buffer capacity mapped at creation before the sample window; an upper bound on writable capacity." },
  { key: "preCaptureMappedAtCreationCalls", label: "Pre-capture mapped buffers", unit: "buffers", group: "CPU↔GPU API traffic", description: "Buffers created mapped before capture; reported separately from steady-state traffic." },
  { key: "copyExternalImageToTextureBytesPerFrame", label: "External-image destination payload", unit: "bytes / frame", group: "CPU↔GPU API traffic", description: "Known destination texel volume. Source residency is unknown, so it is not counted as CPU→GPU traffic." },
  { key: "copyExternalImageToTextureCallsPerFrame", label: "External-image copies", unit: "calls / frame", group: "CPU↔GPU API traffic", description: "copyExternalImageToTexture calls with unknown CPU/GPU source residency." },
  { key: "copyExternalImageToTextureUnknownByteCallsPerFrame", label: "External copies with unknown size", unit: "calls / frame", group: "CPU↔GPU API traffic", description: "External copies omitted from known-byte totals because destination size could not be derived." },
  { key: "writeTextureUnknownByteCallsPerFrame", label: "Texture writes with unknown size", unit: "calls / frame", group: "CPU↔GPU API traffic", description: "Upload calls excluded from the known-byte total because the destination format size could not be derived." },
  { key: "gpuInternalCopyBytesPerFrame", label: "GPU-internal copy bytes", unit: "bytes / frame", group: "CPU↔GPU API traffic", description: "Encoded GPU copy volume, separated from CPU↔GPU traffic." },
  { key: "gpuInternalCopyCallsPerFrame", label: "GPU-internal copies", unit: "calls / frame", group: "CPU↔GPU API traffic", description: "Encoded buffer/texture copy commands; these do not imply a CPU round trip." },
  { key: "gpuInternalCopyUnknownByteCallsPerFrame", label: "GPU copies with unknown size", unit: "calls / frame", group: "CPU↔GPU API traffic", description: "GPU-internal copies excluded from known-byte totals." },
  { key: "writeBufferBytesPerFrame", label: "queue.writeBuffer bytes", unit: "bytes / frame", group: "CPU↔GPU API traffic", description: "Logical buffer upload volume observed at the WebGPU API." },
  { key: "writeBufferCallsPerFrame", label: "queue.writeBuffer calls", unit: "calls / frame", group: "CPU↔GPU API traffic", description: "Buffer upload call count." },
  { key: "estimatedLiveGpuBytes", label: "Estimated WebGPU allocation", unit: "bytes", group: "GPU resources", description: "Descriptor-derived live buffer and texture bytes; not physical VRAM residency." },
  { key: "liveTextureBytes", label: "Estimated texture allocation", unit: "bytes", group: "GPU resources", description: "Descriptor-derived live texture bytes." },
  { key: "liveBufferBytes", label: "Live buffer allocation", unit: "bytes", group: "GPU resources", description: "Sum of live application-created GPUBuffer sizes." },
  { key: "systemGpuInUseMemoryBytes", label: "System GPU in-use memory", unit: "bytes", group: "GPU resources", description: "System-wide driver counter; not process attribution." },
  { key: "renderPassesPerFrame", label: "Render passes", unit: "/ frame", group: "Frame graph", description: "Instrumented render-pass encodes per rendered frame." },
  { key: "computePassesPerFrame", label: "Compute passes", unit: "/ frame", group: "Frame graph", description: "Instrumented compute-pass encodes per rendered frame." },
  { key: "drawCallsPerFrame", label: "Draw calls", unit: "/ frame", group: "Frame graph", description: "Instrumented non-indexed draws per rendered frame." },
  { key: "drawIndexedCallsPerFrame", label: "Indexed draw calls", unit: "/ frame", group: "Frame graph", description: "Instrumented indexed draws per rendered frame." },
  { key: "commandEncodersPerFrame", label: "Command encoders", unit: "/ frame", group: "Frame graph", description: "Instrumented command encoders created per rendered frame." },
  { key: "queueSubmitsPerFrame", label: "Queue submits", unit: "/ frame", group: "Frame graph", description: "Instrumented queue submissions per rendered frame." },
  { key: "submittedCommandBuffersPerFrame", label: "Submitted command buffers", unit: "/ frame", group: "Frame graph", description: "Command buffers passed to queue.submit per rendered frame." },
  { key: "startupTimeMs", label: "Page startup to ready", unit: "ms", group: "Startup and package", description: "Navigation start until the renderer reports its first complete frame." },
  { key: "firstRenderedFrameMs", label: "Time to first frame", unit: "ms", group: "Startup and package", description: "Demo startup timestamp to its first complete rendered frame." },
  { key: "shaderPreparationMs", label: "Shader-module preparation", unit: "ms", group: "Startup and package", description: "Observed synchronous createShaderModule preparation time." },
  { key: "pipelineCreationMs", label: "Pipeline creation", unit: "ms", group: "Startup and package", description: "Observed synchronous and asynchronous render/compute pipeline creation duration." },
  { key: "bundleBytes", label: "Production bundle", unit: "bytes", group: "Startup and package", description: "Built application bytes served for this architecture arm." },
  { key: "bundleGzipBytes", label: "Production bundle (gzip)", unit: "bytes", group: "Startup and package", description: "Sum of per-file gzip sizes for comparable text assets." },
];

export function availableControlledMetrics(
  summary: ControlledSummary | ArchitectureSummary,
): ControlledMetric[] {
  return CONTROLLED_METRICS.filter(({ key }) =>
    summary.implementations.some(
      (implementation) => implementation.summary[key] !== undefined &&
        implementation.summary[key] !== null,
    )
  );
}

export function controlledReportUrl(
  basePath: string,
  dataset: "results" | "architecture-results",
): string {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${normalizedBase}${dataset}/latest/summary.json`;
}

export function architectureControlStatus(summary: ArchitectureSummary): {
  label: string;
  tone: "matched" | "failed" | "incomplete";
} {
  if (!summary.architectureControl.cohortComplete) {
    return { label: "Cohort incomplete", tone: "incomplete" };
  }
  return summary.architectureControl.taskMatched
    ? { label: "Controlled task matched", tone: "matched" }
    : { label: "Task gate failed", tone: "failed" };
}

export function formatControlledValue(key: string, value: number): string {
  const metric = CONTROLLED_METRICS.find((candidate) => candidate.key === key);
  if (metric?.unit.startsWith("bytes")) return bytes(value);
  if (metric?.unit === "fps") return `${value.toFixed(1)} fps`;
  if (metric?.unit === "ms") return `${value.toFixed(value >= 100 ? 0 : 2)} ms`;
  if (metric?.unit === "%") return `${value.toFixed(1)}%`;
  return value.toLocaleString(undefined, {
    maximumFractionDigits: value < 10 ? 2 : 0,
  });
}

export function nullControlStatus(summary: ControlledSummary): {
  label: string;
  tone: "matched" | "failed" | "incomplete";
} {
  if (!summary.nullControl.cohortComplete) {
    return { label: "Cohort incomplete", tone: "incomplete" };
  }
  return summary.nullControl.contractMatched
    ? { label: "Contract matched", tone: "matched" }
    : { label: "Contract failed", tone: "failed" };
}

export function controlledFrameTimeBins(
  implementation: ControlledImplementation,
  durationMs: number,
  binCount = 80,
): Array<{ elapsedFraction: number; frameTimeMs: number }> {
  const buckets = Array.from({ length: binCount }, () => [] as number[]);
  for (const run of implementation.series) {
    let elapsed = 0;
    for (const frameTime of run.frameTimesMs ?? []) {
      elapsed += frameTime;
      const index = Math.min(
        binCount - 1,
        Math.max(0, Math.floor(elapsed / durationMs * binCount)),
      );
      buckets[index].push(frameTime);
    }
  }
  return buckets.flatMap((values, index) => {
    if (values.length === 0) return [];
    values.sort((first, second) => first - second);
    const middle = Math.floor(values.length / 2);
    const median = values.length % 2 === 0
      ? (values[middle - 1] + values[middle]) / 2
      : values[middle];
    return [{
      elapsedFraction: (index + 0.5) / binCount,
      frameTimeMs: median,
    }];
  });
}
