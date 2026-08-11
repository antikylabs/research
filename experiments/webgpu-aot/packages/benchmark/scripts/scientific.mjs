const SCENE_TASK_DIMENSIONS = Object.freeze([
  { key: "sceneWidth", label: "Render width", tolerance: 0 },
  { key: "sceneHeight", label: "Render height", tolerance: 0 },
  { key: "sceneMeshes", label: "Scene meshes", tolerance: 0 },
  { key: "sceneSimulatedLights", label: "Simulated lights", tolerance: 0 },
  { key: "sceneAnalyticLights", label: "Analytic light slots", tolerance: 0 },
  { key: "sceneParticles", label: "Particles", tolerance: 0 },
]);

const COMMAND_TOPOLOGY_DIMENSIONS = Object.freeze([
  { key: "maxSampleCount", label: "Maximum sample count", tolerance: 0 },
  { key: "drawIndexedCallsPerFrame", label: "Indexed draws / frame", tolerance: 0.01 },
  { key: "drawCallsPerFrame", label: "Non-indexed draws / frame", tolerance: 0.01 },
  { key: "totalIndicesPerFrame", label: "Submitted indices / frame", tolerance: 0.01 },
  { key: "totalVerticesPerFrame", label: "Submitted vertices / frame", tolerance: 0.01 },
  { key: "totalInstancesPerFrame", label: "Submitted instances / frame", tolerance: 0.01 },
  { key: "renderPassesPerFrame", label: "Render passes / frame", tolerance: 0.05 },
  { key: "computePassesPerFrame", label: "Compute passes / frame", tolerance: 0.05 },
  { key: "commandEncodersPerFrame", label: "Command encoders / frame", tolerance: 0.05 },
  { key: "queueSubmitsPerFrame", label: "Queue submits / frame", tolerance: 0.05 },
  { key: "submittedCommandBuffersPerFrame", label: "Submitted command buffers / frame", tolerance: 0.05 },
  { key: "writeBufferCallsPerFrame", label: "Buffer writes / frame", tolerance: 0.05 },
  { key: "writeBufferBytesPerFrame", label: "Buffer write bytes / frame", tolerance: 0.01 },
  { key: "writeTextureCallsPerFrame", label: "Texture writes / frame", tolerance: 0.05 },
  { key: "writeTextureBytesPerFrame", label: "Known texture write bytes / frame", tolerance: 0.01 },
  { key: "gpuToCpuMapReadCallsPerFrame", label: "GPU-to-CPU map requests / frame", tolerance: 0.05 },
  { key: "gpuInternalCopyCallsPerFrame", label: "GPU-internal copies / frame", tolerance: 0.05 },
]);

const DECLARED_SHADER_DIMENSIONS = Object.freeze([
  { key: "shadingPath", label: "Shading path" },
  { key: "directLighting", label: "Direct-light BRDF" },
  { key: "environmentLighting", label: "Environment-lighting model" },
  { key: "ambientOcclusion", label: "Ambient occlusion" },
  { key: "reflections", label: "Screen-space reflections" },
  { key: "temporalResolve", label: "Temporal resolve" },
  { key: "bloom", label: "Bloom" },
]);

export function buildRunSchedule(demos, runs) {
  const schedule = [];
  for (let repetition = 0; repetition < runs; repetition += 1) {
    for (let position = 0; position < demos.length; position += 1) {
      schedule.push({
        demo: demos[(position + repetition) % demos.length],
        index: repetition + 1,
        position,
        repetition,
      });
    }
  }
  return schedule;
}

export function deriveWebGpuMetrics({ before, after, frames }) {
  const result = {};
  const frameCount = Math.max(1, frames);
  const counterDifference = (key) => Number(after?.counters?.[key] ?? 0) - Number(before?.counters?.[key] ?? 0);
  for (const key of new Set([
    ...Object.keys(before?.counters ?? {}),
    ...Object.keys(after?.counters ?? {}),
  ])) {
    const difference = counterDifference(key);
    result[`${key}PerFrame`] = difference / frameCount;
  }
  const aggregatePerFrame = (keys) => keys.reduce((sum, key) => sum + counterDifference(key), 0) / frameCount;
  result.cpuToGpuQueueWriteCallsPerFrame = aggregatePerFrame(["writeBufferCalls", "writeTextureCalls"]);
  result.cpuToGpuQueueWriteBytesPerFrame = aggregatePerFrame(["writeBufferBytes", "writeTextureBytes"]);
  result.gpuToCpuMapReadCallsPerFrame = counterDifference("mapAsyncReadCalls") / frameCount;
  result.gpuToCpuMapReadBytesPerFrame = counterDifference("mapAsyncReadBytes") / frameCount;
  result.gpuInternalCopyCallsPerFrame = aggregatePerFrame([
    "copyBufferToBufferCalls", "copyBufferToTextureCalls", "copyTextureToBufferCalls", "copyTextureToTextureCalls",
  ]);
  result.gpuInternalCopyBytesPerFrame = aggregatePerFrame([
    "copyBufferToBufferBytes", "copyBufferToTextureBytes", "copyTextureToBufferBytes", "copyTextureToTextureBytes",
  ]);
  result.gpuInternalCopyUnknownByteCallsPerFrame = aggregatePerFrame([
    "copyBufferToTextureUnknownByteCalls", "copyTextureToBufferUnknownByteCalls", "copyTextureToTextureUnknownByteCalls",
  ]);
  result.preCaptureMappedAtCreationCalls = Number(before?.counters?.mappedAtCreationCalls ?? 0);
  result.preCaptureMappedAtCreationBytes = Number(before?.counters?.mappedAtCreationBytes ?? 0);
  const resources = after?.resources ?? {};
  return {
    ...result,
    estimatedLiveGpuBytes: Number(resources.liveBufferBytes ?? 0) + Number(resources.liveTextureBytes ?? 0),
    liveBufferBytes: Number(resources.liveBufferBytes ?? 0),
    liveBufferCount: Number(resources.liveBufferCount ?? 0),
    liveTextureBytes: Number(resources.liveTextureBytes ?? 0),
    liveTextureCount: Number(resources.liveTextureCount ?? 0),
    texturesWithUnknownSize: Number(resources.texturesWithUnknownSize ?? 0),
  };
}

function assessNumericDimensions(demos, definitions, gate) {
  return definitions.map(({ key, label, tolerance }) => {
    const entries = demos.flatMap((demo) => {
      const value = demo.summary?.[key]?.mean;
      return Number.isFinite(value) ? [{ id: demo.id, name: demo.name, value }] : [];
    });
    if (entries.length !== demos.length || entries.length === 0) {
      return { entries, gate, key, label, status: "unavailable" };
    }
    const values = entries.map(({ value }) => value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const relativeSpread = maximum === 0 ? 0 : (maximum - minimum) / maximum;
    return {
      entries,
      gate,
      key,
      label,
      relativeSpread,
      status: relativeSpread <= tolerance ? "matched" : "mismatched",
    };
  });
}

function assessDeclaredShaderDimensions(demos) {
  return DECLARED_SHADER_DIMENSIONS.map(({ key, label }) => {
    const entries = demos.flatMap((demo) => {
      const value = demo.rendererContract?.[key];
      return typeof value === "string" && value.length > 0 ? [{ id: demo.id, name: demo.name, value }] : [];
    });
    if (entries.length !== demos.length || entries.length === 0) {
      return { entries, gate: "declaredShaderContract", key, label, status: "unavailable" };
    }
    return {
      entries,
      gate: "declaredShaderContract",
      key,
      label,
      status: new Set(entries.map(({ value }) => value)).size === 1 ? "matched" : "mismatched",
    };
  });
}

function gateStatus(dimensions) {
  if (dimensions.some(({ status }) => status === "unavailable")) return "unavailable";
  if (dimensions.some(({ status }) => status === "mismatched")) return "mismatched";
  return "matched";
}

export function assessComparability(demos) {
  const nativeCohort = demos.filter(({ comparisonRole }) => comparisonRole !== "framework-reference");
  const references = demos.filter(({ comparisonRole }) => comparisonRole === "framework-reference");
  const sceneDimensions = assessNumericDimensions(demos, SCENE_TASK_DIMENSIONS, "sceneTask");
  const commandDimensions = assessNumericDimensions(nativeCohort, COMMAND_TOPOLOGY_DIMENSIONS, "nativeCommandTopology");
  const dimensions = [...sceneDimensions, ...commandDimensions];
  const declaredShaderDimensions = assessDeclaredShaderDimensions(nativeCohort);
  const gates = {
    sceneTask: { label: "Scene and task", status: gateStatus(sceneDimensions) },
    nativeCommandTopology: { label: "Native command topology", status: gateStatus(commandDimensions) },
    declaredShaderContract: { label: "Declared shader contract", status: gateStatus(declaredShaderDimensions) },
  };
  const allDimensions = [...dimensions, ...declaredShaderDimensions];
  const mismatches = allDimensions.filter(({ status }) => status === "mismatched");
  const hasComparison = nativeCohort.length >= 2;
  const attributionSafe = hasComparison && Object.values(gates).every(({ status }) => status === "matched");
  return {
    attributionSafe,
    cohortIds: nativeCohort.map(({ id }) => id),
    declaredShaderDimensions,
    dimensions,
    gates,
    mismatches: mismatches.map(({ gate, key, label, relativeSpread }) => ({ gate, key, label, relativeSpread })),
    referenceIds: references.map(({ id }) => id),
    verdict: !hasComparison
      ? "At least two implementations in the native cohort are required before renderer attribution can be assessed."
      : gates.sceneTask.status !== "matched"
        ? "The scene/task gate is incomplete or mismatched; results compare different experiments."
        : gates.nativeCommandTopology.status !== "matched"
          ? "The native command topologies differ; results compare whole renderer architectures, not shader authoring systems alone."
          : gates.declaredShaderContract.status !== "matched"
            ? "The native shader contracts differ even though the measured workload topology matches; authoring-system attribution is not supported."
            : references.length > 0
              ? "Scene, native command topology, and declared native shader contracts match. Limited attribution is supported within the native cohort; framework references remain a separate architectural comparison."
              : "Scene, command topology, and declared shader contracts match. Limited attribution is supported within this native cohort.",
  };
}
