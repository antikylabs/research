#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { DEMOS, parseArguments } from "./config.mjs";
import { capturePresentation } from "./capture.mjs";
import { createInstrumentationScript } from "./instrumentation.mjs";
import { BROWSER_ISOLATION_ARGUMENTS, createCaptureUrl } from "./isolation.mjs";
import { buildSummary, measureDirectory, summarize } from "./metrics.mjs";
import { assessComparability, buildRunSchedule, deriveWebGpuMetrics } from "./scientific.mjs";
import { createSystemGpuSampler, deriveProcessGpuUtilization, hasUsableDeviceUtilization } from "./system-gpu.mjs";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = path.resolve(packageDirectory, "../..");

function usage() {
  return `Usage: npm run benchmark --workspace benchmark -- [options]\n\n  --runs=N            production builds and browser samples per demo (default 5)\n  --sample-frames=N    minimum intervals required for a valid capture (default 10)\n  --sample-seconds=N   fixed steady-state duration; at least 10 (default 10)\n  --warmup-seconds=N   steady-state warmup before sampling (default 5)\n  --profile=NAME       smoke, heavy, or extreme (default heavy)\n  --only=ID            benchmark one implementation\n  --headed             show Chrome while measuring\n  --output=PATH        output beneath the benchmark package\n  --channel=NAME       Playwright browser channel (default chrome)\n  --timeout=MS         per-page timeout`;
}

function command(command_, arguments_, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command_, arguments_, { cwd: repositoryDirectory, stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit", ...options });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code, signal) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command_} exited with ${code ?? signal}\n${stderr}`)));
  });
}

async function buildDemo(demo) {
  const started = performance.now();
  await command("npm", ["run", "build", "--workspace", demo.workspace]);
  const buildTimeMs = performance.now() - started;
  const bundle = await measureDirectory(path.join(repositoryDirectory, "packages", demo.workspace, "dist"));
  return { buildTimeMs, bundleBytes: bundle.bytes, bundleFiles: bundle.files, bundleGzipBytes: bundle.gzipBytes };
}

function serve(directory) {
  const types = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".wgsl": "text/plain" };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const target = path.resolve(directory, relative);
      if (!target.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error("Invalid path");
      const body = await readFile(target);
      response.writeHead(200, { "cache-control": "no-store", "content-type": types[path.extname(target)] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function measureRuntime(chromium, demo, options, runId, capturePath = null) {
  const dist = path.join(repositoryDirectory, "packages", demo.workspace, "dist");
  const hosted = await serve(dist);
  const browser = await chromium.launch({
    args: BROWSER_ISOLATION_ARGUMENTS,
    channel: options.channel,
    headless: options.headless,
  });
  const browserTools = await browser.newBrowserCDPSession();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript({ content: createInstrumentationScript() });
  const page = await context.newPage();
  const developerTools = await context.newCDPSession(page);
  await developerTools.send("Network.enable");
  await developerTools.send("Network.setCacheDisabled", { cacheDisabled: true });
  const started = performance.now();
  let systemGpuSampler;
  try {
    await page.goto(createCaptureUrl(hosted.url, options.profile, runId), { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForFunction(() => {
      const telemetry = window.__WEBGPU_AOT__;
      if (telemetry?.status === "error") throw new Error(telemetry.error ?? "Demo failed");
      return telemetry?.status === "ready";
    }, null, { timeout: options.timeoutMs });
    const startupTimeMs = performance.now() - started;
    await page.waitForTimeout(options.warmupDurationMs);
    const before = await page.evaluate(() => {
      window.__BENCHMARK__.frameTimes = [];
      window.__BENCHMARK__.sampleGeneration += 1;
      return window.__BENCHMARK__.snapshot();
    });
    const processInformation = await browserTools.send("SystemInfo.getProcessInfo");
    const gpuProcessId = processInformation.processInfo?.find(({ type }) => type.toLowerCase() === "gpu")?.id ?? null;
    systemGpuSampler = createSystemGpuSampler({ processId: gpuProcessId });
    systemGpuSampler.start();
    const sampleStartedAt = performance.now();
    await page.waitForTimeout(options.sampleDurationMs);
    const captureDurationMs = performance.now() - sampleStartedAt;
    const systemGpuSamples = await systemGpuSampler.stop();
    const browserMetrics = await page.evaluate(async () => {
      const measurements = window.__BENCHMARK__;
      const frameTimes = [...measurements.frameTimes];
      const after = measurements.snapshot();
      const sourceTelemetry = window.__WEBGPU_AOT__;
      const telemetry = {
        ...sourceTelemetry,
        latestFrame: sourceTelemetry?.latestFrame === undefined ? undefined : { ...sourceTelemetry.latestFrame },
      };
      const gpuQueueDrainMs = await measurements.drainGpu();
      return {
        after,
        benchmark: {
          frameTimes,
          gpuQueueDrainMs,
          maxSampleCount: measurements.maxSampleCount,
          pipelineCreationMs: measurements.pipelineCreationMs,
          pipelineCreations: measurements.pipelineCreations,
          shaderPreparationMs: measurements.shaderPreparationMs,
          shaderModules: measurements.shaderModules,
        },
        navigation: performance.getEntriesByType("navigation")[0]?.toJSON(),
        telemetry,
        userAgent: navigator.userAgent,
      };
    });
    const frame = summarize(browserMetrics.benchmark.frameTimes);
    if (frame === null || browserMetrics.benchmark.frameTimes.length < options.sampleFrames) {
      throw new Error(`${demo.name} produced ${browserMetrics.benchmark.frameTimes.length} frame intervals; ${options.sampleFrames} are required for a valid fixed-duration capture`);
    }
    if (capturePath !== null) await capturePresentation(page, capturePath);
    const telemetry = browserMetrics.telemetry;
    const renderedFrames = Math.max(1, Number(browserMetrics.after.telemetryFrameIndex ?? 0) - Number(before.telemetryFrameIndex ?? 0));
    const processGpuUtilization = deriveProcessGpuUtilization(systemGpuSamples);
    const deviceUtilizationAvailable = hasUsableDeviceUtilization(systemGpuSamples, processGpuUtilization);
    return {
      evidence: {
        adapter: browserMetrics.after.adapter,
        dataMovement: browserMetrics.after.dataMovement,
        presentationCapture: capturePath === null ? undefined : {
          file: `captures/${demo.id}.png`,
          profile: options.profile,
          run: 1,
          viewport: { height: 900, width: 1440 },
        },
        resourceAllocation: {
          caveat: "Descriptor-based application allocation estimate; excludes browser/driver overhead and swapchain images, and is not physical VRAM residency.",
          method: "instrumented-createBuffer-createTexture-destroy",
        },
        scene: {
          analyticLights: "benchmark contract checked against implementation source",
          dimensions: "demo telemetry",
          meshesAndSimulatedLights: "demo per-frame telemetry",
          particles: "benchmark contract checked against implementation source",
        },
        systemGpu: {
          caveat: systemGpuSamples.length === 0
            ? "Unavailable on this platform."
            : deviceUtilizationAvailable
              ? "Process utilization uses the Chrome GPU process's cumulative driver time; memory and device/renderer/tiler counters are system-wide."
              : "Process utilization uses cumulative Chrome GPU-process driver time; macOS returned stale zero-valued device/renderer/tiler fields, so those fields are unavailable. Memory counters remain system-wide.",
          deviceUtilizationAvailable,
          gpuProcessId,
          method: systemGpuSampler.method,
          samples: systemGpuSamples.length,
        },
        userAgent: browserMetrics.userAgent,
      },
      metrics: {
        startupTimeMs,
        warmupDurationMs: options.warmupDurationMs,
        captureDurationMs,
        capturedFrames: browserMetrics.benchmark.frameTimes.length,
        renderedFrames,
        firstRenderedFrameMs: telemetry.firstFrameAt - telemetry.startupStartedAt,
        assetsReadyMs: telemetry.assetsReadyAt === undefined ? null : telemetry.assetsReadyAt - telemetry.startupStartedAt,
        shaderPreparationMs: browserMetrics.benchmark.shaderPreparationMs,
        shaderModules: browserMetrics.benchmark.shaderModules,
        pipelineCreationMs: browserMetrics.benchmark.pipelineCreationMs,
        pipelineCreations: browserMetrics.benchmark.pipelineCreations,
        averageFps: 1000 / frame.mean,
        frameTimeMeanMs: frame.mean,
        frameTimeP95Ms: frame.p95,
        frameTimeStandardDeviationMs: frame.standardDeviation,
        frameTimeWorstMs: frame.max,
        telemetryFps: telemetry.latestFrame?.fps ?? null,
        cpuFrameTimeMs: telemetry.latestFrame?.cpuTimeMs ?? null,
        gpuQueueDrainMs: browserMetrics.benchmark.gpuQueueDrainMs,
        navigationTransferBytes: browserMetrics.navigation?.transferSize ?? null,
        navigationEncodedBytes: browserMetrics.navigation?.encodedBodySize ?? null,
        sceneAnalyticLights: demo.scene.analyticLights[options.profile],
        sceneHeight: telemetry.height,
        sceneMeshes: telemetry.latestFrame?.totalMeshes ?? null,
        sceneParticles: demo.scene.particles,
        sceneSimulatedLights: telemetry.latestFrame?.lights ?? null,
        sceneVisibleMeshes: telemetry.latestFrame?.visibleMeshes ?? null,
        sceneWidth: telemetry.width,
        maxSampleCount: browserMetrics.benchmark.maxSampleCount,
        ...deriveWebGpuMetrics({ after: browserMetrics.after, before, frames: renderedFrames }),
        processGpuUtilizationPercent: summarize(processGpuUtilization)?.mean ?? null,
        systemGpuAllocatedMemoryBytes: summarize(systemGpuSamples.map(({ allocatedMemoryBytes }) => allocatedMemoryBytes).filter(Number.isFinite))?.mean ?? null,
        systemGpuDeviceUtilizationPercent: deviceUtilizationAvailable ? summarize(systemGpuSamples.map(({ deviceUtilizationPercent }) => deviceUtilizationPercent).filter(Number.isFinite))?.mean ?? null : null,
        systemGpuInUseMemoryBytes: summarize(systemGpuSamples.map(({ inUseMemoryBytes }) => inUseMemoryBytes).filter(Number.isFinite))?.mean ?? null,
        systemGpuRendererUtilizationPercent: deviceUtilizationAvailable ? summarize(systemGpuSamples.map(({ rendererUtilizationPercent }) => rendererUtilizationPercent).filter(Number.isFinite))?.mean ?? null : null,
        systemGpuTilerUtilizationPercent: deviceUtilizationAvailable ? summarize(systemGpuSamples.map(({ tilerUtilizationPercent }) => tilerUtilizationPercent).filter(Number.isFinite))?.mean ?? null : null,
      },
      series: {
        frameTimesMs: browserMetrics.benchmark.frameTimes,
        systemGpuSamples,
      },
    };
  } finally {
    await systemGpuSampler?.stop();
    await context.close();
    await browserTools.detach();
    await browser.close();
    await new Promise((resolve) => hosted.server.close(resolve));
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { console.log(usage()); return; }
  const { chromium } = await import("playwright-core");
  const selected = DEMOS.filter(({ id }) => options.only === null || options.only === id);
  const startedAt = new Date();
  const metadata = {
    generatedAt: startedAt.toISOString(),
    configuration: {
      cacheIsolation: {
        browserProcessPerRun: true,
        gpuShaderDiskCacheDisabled: true,
        httpCacheDisabled: true,
        uniqueRunUrl: true,
      },
      profile: options.profile,
      runs: options.runs,
      sampleDurationMs: options.sampleDurationMs,
      sampleFrames: options.sampleFrames,
      sampleFramesSemantics: "minimum-validity-check",
      scheduling: "counterbalanced-rotation",
      viewport: { width: 1440, height: 900 },
      warmupDurationMs: options.warmupDurationMs,
    },
    environment: { arch: os.arch(), cpus: os.cpus().length, memoryBytes: os.totalmem(), node: process.version, platform: `${os.platform()} ${os.release()}` },
  };
  const outputRoot = path.resolve(packageDirectory, options.output);
  const runDirectory = path.join(outputRoot, startedAt.toISOString().replace(/[:.]/g, "-"));
  await mkdir(runDirectory, { recursive: true });
  const captureDirectory = path.join(runDirectory, "captures");
  await mkdir(captureDirectory, { recursive: true });
  const demos = selected.map((demo) => ({ ...demo, runs: [] }));
  const resultsById = new Map(demos.map((demo) => [demo.id, demo]));
  for (const { demo, index, position } of buildRunSchedule(selected, options.runs)) {
    console.log(`\n[${demo.name}] run ${index}/${options.runs} · order ${position + 1}/${selected.length}`);
    const build = await buildDemo(demo);
    const runId = `${demo.id}-${index}-${startedAt.getTime()}`;
    const capturePath = index === 1 ? path.join(captureDirectory, `${demo.id}.png`) : null;
    const runtime = await measureRuntime(chromium, demo, options, runId, capturePath);
    const run = {
      index,
      orderPosition: position + 1,
      isolation: {
        browserProcess: "fresh",
        gpuShaderDiskCache: "disabled",
        httpCache: "disabled",
        runId,
      },
      evidence: runtime.evidence,
      metrics: { ...build, ...runtime.metrics },
      series: runtime.series,
    };
    resultsById.get(demo.id).runs.push(run);
    await writeFile(path.join(runDirectory, `${demo.id}-${index}.json`), `${JSON.stringify(run, null, 2)}\n`);
  }
  for (const demo of demos) demo.runs.sort((first, second) => first.index - second.index);
  const raw = { schemaVersion: 2, ...metadata, demos };
  const summary = buildSummary(metadata, demos);
  summary.comparability = assessComparability(summary.demos);
  await writeFile(path.join(runDirectory, "raw.json"), `${JSON.stringify(raw, null, 2)}\n`);
  await writeFile(path.join(runDirectory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  const latest = path.join(outputRoot, "latest");
  await mkdir(latest, { recursive: true });
  await cp(path.join(runDirectory, "raw.json"), path.join(latest, "raw.json"));
  await cp(path.join(runDirectory, "summary.json"), path.join(latest, "summary.json"));
  await cp(captureDirectory, path.join(packageDirectory, "public/captures"), { recursive: true });
  console.log(`\nSaved raw runs and summary to ${path.relative(repositoryDirectory, runDirectory)}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
