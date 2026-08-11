export const ARCHITECTURE_IMPLEMENTATIONS = Object.freeze([
  {
    comparisonRole: "raw-webgpu-reference",
    id: "raw-webgpu-control",
    name: "Raw WebGPU control",
    query: { implementation: "brometal-aot", staticTask: "1" },
    telemetryImplementationId: "brometal-aot",
    workspace: "demo-controlled",
  },
  {
    comparisonRole: "framework-architecture",
    id: "threejs-framework",
    name: "Three.js controlled framework",
    query: {},
    telemetryImplementationId: "threejs-framework",
    workspace: "demo-controlled-threejs",
  },
]);

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function parseArchitectureArguments(arguments_) {
  const options = {
    channel: "chrome",
    headless: true,
    help: false,
    only: null,
    output: "public/architecture-results",
    profile: "heavy",
    runs: 10,
    sampleDurationMs: 10_000,
    sampleFrames: 10,
    timeoutMs: 120_000,
    warmupDurationMs: 5_000,
  };
  for (const argument of arguments_) {
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--headed") options.headless = false;
    else if (argument.startsWith("--channel=")) options.channel = argument.slice(10);
    else if (argument.startsWith("--only=")) options.only = argument.slice(7);
    else if (argument.startsWith("--output=")) options.output = argument.slice(9);
    else if (argument.startsWith("--profile=")) options.profile = argument.slice(10);
    else if (argument.startsWith("--runs=")) options.runs = positiveInteger(argument.slice(7), "--runs");
    else if (argument.startsWith("--sample-frames=")) options.sampleFrames = positiveInteger(argument.slice(16), "--sample-frames");
    else if (argument.startsWith("--sample-seconds=")) {
      const seconds = positiveInteger(argument.slice(17), "--sample-seconds");
      if (seconds < 10) throw new Error("--sample-seconds must be at least 10 seconds");
      options.sampleDurationMs = seconds * 1_000;
    } else if (argument.startsWith("--warmup-seconds=")) {
      options.warmupDurationMs = positiveInteger(argument.slice(17), "--warmup-seconds") * 1_000;
    } else if (argument.startsWith("--timeout=")) options.timeoutMs = positiveInteger(argument.slice(10), "--timeout");
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (options.only !== null && !ARCHITECTURE_IMPLEMENTATIONS.some(({ id }) => id === options.only)) {
    throw new Error(`--only must be one of ${ARCHITECTURE_IMPLEMENTATIONS.map(({ id }) => id).join(", ")}`);
  }
  if (!new Set(["smoke", "heavy", "extreme"]).has(options.profile)) {
    throw new Error("--profile must be smoke, heavy, or extreme");
  }
  return options;
}

export function validateArchitectureCapture(capture, implementation) {
  const telemetry = capture.telemetry ?? {};
  if (telemetry.implementationId !== implementation.telemetryImplementationId) {
    throw new Error(`implementationId must be ${implementation.telemetryImplementationId}; received ${telemetry.implementationId}`);
  }
  if (telemetry.taskId !== "full-screen-static-32-light-ggx-aces-v1") {
    throw new Error(`taskId must be full-screen-static-32-light-ggx-aces-v1; received ${telemetry.taskId}`);
  }
  const expected = {
    maxSampleCount: 1,
    sceneAnalyticLights: 32,
    sceneHeight: Number(telemetry.height ?? capture.metrics?.sceneHeight),
    sceneMeshes: 1,
    sceneWidth: Number(telemetry.width ?? capture.metrics?.sceneWidth),
  };
  for (const [key, value] of Object.entries(expected)) {
    const actual = Number(capture.metrics?.[key]);
    if (!Number.isFinite(actual) || actual !== value) {
      throw new Error(`${key} must be ${value}; received ${actual}`);
    }
  }
}

const TASK_DIMENSIONS = Object.freeze([
  "sceneWidth",
  "sceneHeight",
  "sceneMeshes",
  "sceneAnalyticLights",
  "maxSampleCount",
]);

export function assessArchitectureControl(implementations) {
  const cohortComplete = implementations.length === 2 &&
    new Set(implementations.map(({ id }) => id)).size === 2;
  const taskIds = implementations.map(({ evidence }) => evidence?.task?.taskId);
  const taskIdMatched = cohortComplete && taskIds.every(
    (taskId) => taskId === "full-screen-static-32-light-ggx-aces-v1",
  );
  const dimensions = TASK_DIMENSIONS.map((key) => {
    const entries = implementations.map(({ id, name, summary }) => ({
      id,
      name,
      value: Number(summary?.[key]?.mean),
    }));
    const matched = cohortComplete && entries.every(({ value }) =>
      Number.isFinite(value) && value === entries[0]?.value
    );
    return {
      entries,
      key,
      status: !cohortComplete ? "unavailable" : matched ? "matched" : "mismatched",
    };
  });
  const taskMatched = taskIdMatched && dimensions.every(
    ({ status }) => status === "matched",
  );
  return {
    authoringSystemClaimSupported: false,
    cohortComplete,
    dimensions,
    rendererArchitectureClaimSupported: taskMatched,
    taskIdMatched,
    taskMatched,
    verdict: !cohortComplete
      ? "The architecture-control cohort is incomplete."
      : taskMatched
        ? "The controlled task and dimensions match. Differences in observed API traffic, CPU encoding, command topology, and pacing describe these raw-WebGPU and Three.js renderer constructions on this workload; they do not prove general authoring-system superiority."
        : "The controlled task gate failed. Do not attribute measured differences to renderer architecture.",
  };
}
