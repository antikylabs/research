export const DEMOS = Object.freeze([
  {
    comparisonRole: "native-authoring-system",
    id: "brometal",
    name: "BroMetal",
    rendererContract: {
      ambientOcclusion: "depth-normal-16",
      bloom: "five-level-separable-gaussian",
      directLighting: "ggx-correlated-multiscatter",
      environmentLighting: "source-cube-analytic-dfg-multiscatter",
      reflections: "depth-march-24",
      shadingPath: "deferred-screen-space",
      temporalResolve: "halton-history-clamp",
    },
    scene: { analyticLights: { smoke: 32, heavy: 32, extreme: 32 }, particles: 406 },
    workspace: "demo-brometal",
  },
  {
    comparisonRole: "native-authoring-system",
    id: "typegpu",
    name: "TypeGPU",
    rendererContract: {
      ambientOcclusion: "depth-normal-16",
      bloom: "five-level-separable-gaussian",
      directLighting: "ggx-schlick-smith",
      environmentLighting: "source-cube-analytic-dfg",
      reflections: "depth-march-24",
      shadingPath: "forward-material",
      temporalResolve: "halton-history-clamp",
    },
    scene: { analyticLights: { smoke: 32, heavy: 32, extreme: 32 }, particles: 406 },
    workspace: "demo-typegpu",
  },
  {
    comparisonRole: "native-authoring-system",
    id: "typegpu-antiky",
    name: "TypeGPU-Antiky",
    rendererContract: {
      ambientOcclusion: "depth-normal-16",
      bloom: "five-level-separable-gaussian",
      directLighting: "normalized-blinn-phong",
      environmentLighting: "source-cube-analytic-dfg-multiscatter",
      reflections: "depth-march-24",
      shadingPath: "forward-material",
      temporalResolve: "halton-history-clamp",
    },
    scene: { analyticLights: { smoke: 32, heavy: 32, extreme: 32 }, particles: 406 },
    workspace: "demo-typegpu-antiky",
  },
  {
    comparisonRole: "native-authoring-system",
    id: "wesl",
    name: "WESL",
    rendererContract: {
      ambientOcclusion: "depth-normal-16",
      bloom: "five-level-separable-gaussian",
      directLighting: "ggx-smith",
      environmentLighting: "prefiltered-cubes-brdf-lut",
      reflections: "depth-march-24",
      shadingPath: "forward-material",
      temporalResolve: "halton-history-clamp",
    },
    scene: { analyticLights: { smoke: 32, heavy: 32, extreme: 32 }, particles: 406 },
    workspace: "demo-wesl",
  },
  {
    comparisonRole: "framework-reference",
    id: "threejs",
    name: "Three.js",
    rendererContract: {
      ambientOcclusion: "three-gtao-8",
      bloom: "three-bloom-node",
      directLighting: "three-node-material",
      environmentLighting: "three-pmrem",
      reflections: "three-ssr-quality-0.5",
      shadingPath: "framework-managed",
      temporalResolve: "three-traa",
    },
    scene: { analyticLights: { smoke: 32, heavy: 32, extreme: 32 }, particles: 406 },
    workspace: "demo-threejs",
  },
]);

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function parseArguments(arguments_) {
  const options = { channel: "chrome", headless: true, help: false, only: null, output: "public/results", profile: "heavy", runs: 5, sampleDurationMs: 10_000, sampleFrames: 10, timeoutMs: 120_000, warmupDurationMs: 5_000 };
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
    }
    else if (argument.startsWith("--warmup-seconds=")) options.warmupDurationMs = positiveInteger(argument.slice(17), "--warmup-seconds") * 1_000;
    else if (argument.startsWith("--timeout=")) options.timeoutMs = positiveInteger(argument.slice(10), "--timeout");
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (options.only !== null && !DEMOS.some(({ id }) => id === options.only)) throw new Error(`--only must be one of ${DEMOS.map(({ id }) => id).join(", ")}`);
  if (!new Set(["smoke", "heavy", "extreme"]).has(options.profile)) throw new Error("--profile must be smoke, heavy, or extreme");
  return options;
}
