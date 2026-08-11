export const CONTROLLED_IMPLEMENTATIONS = Object.freeze([
  { id: "brometal-aot", name: "BroMetal AOT artifact" },
  { id: "typegpu-runtime", name: "TypeGPU runtime artifact" },
  { id: "antiky-aot", name: "TypeGPU-Antiky AOT artifact" },
  { id: "wesl-static", name: "WESL static artifact" },
  { id: "threejs-framework", name: "Three.js framework artifact" },
]);

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function parseControlledArguments(arguments_) {
  const options = {
    channel: "chrome",
    headless: true,
    help: false,
    only: null,
    output: "public/results",
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
    else if (argument.startsWith("--runs=")) {
      options.runs = positiveInteger(argument.slice(7), "--runs");
    } else if (argument.startsWith("--sample-frames=")) {
      options.sampleFrames = positiveInteger(
        argument.slice(16),
        "--sample-frames",
      );
    } else if (argument.startsWith("--sample-seconds=")) {
      const seconds = positiveInteger(
        argument.slice(17),
        "--sample-seconds",
      );
      if (seconds < 10) {
        throw new Error("--sample-seconds must be at least 10 seconds");
      }
      options.sampleDurationMs = seconds * 1_000;
    } else if (argument.startsWith("--warmup-seconds=")) {
      options.warmupDurationMs = positiveInteger(
        argument.slice(17),
        "--warmup-seconds",
      ) * 1_000;
    } else if (argument.startsWith("--timeout=")) {
      options.timeoutMs = positiveInteger(argument.slice(10), "--timeout");
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (
    options.only !== null &&
    !CONTROLLED_IMPLEMENTATIONS.some(({ id }) => id === options.only)
  ) {
    throw new Error(
      `--only must be one of ${CONTROLLED_IMPLEMENTATIONS.map(({ id }) => id).join(", ")}`,
    );
  }
  if (!new Set(["smoke", "heavy", "extreme"]).has(options.profile)) {
    throw new Error("--profile must be smoke, heavy, or extreme");
  }
  return options;
}
