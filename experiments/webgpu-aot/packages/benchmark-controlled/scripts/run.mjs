#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createInstrumentationScript } from "../../benchmark/scripts/instrumentation.mjs";
import { BROWSER_ISOLATION_ARGUMENTS } from "../../benchmark/scripts/isolation.mjs";
import {
  measureDirectory,
  summarize,
} from "../../benchmark/scripts/metrics.mjs";
import { deriveWebGpuMetrics } from "../../benchmark/scripts/scientific.mjs";
import {
  createSystemGpuSampler,
  deriveProcessGpuUtilization,
  hasUsableDeviceUtilization,
} from "../../benchmark/scripts/system-gpu.mjs";

import {
  CONTROLLED_IMPLEMENTATIONS,
  parseControlledArguments,
} from "./config.mjs";
import { buildControlledSummary } from "./results.mjs";
import {
  buildControlledSchedule,
  validateControlledCapture,
} from "./scientific.mjs";

const packageDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryDirectory = path.resolve(packageDirectory, "../..");
const demoDirectory = path.join(repositoryDirectory, "packages/demo-controlled");

function usage() {
  return `Usage: npm run benchmark --workspace benchmark-controlled -- [options]

  --runs=N             captures per label (default 10; balanced over five labels)
  --sample-frames=N    minimum intervals required for a valid capture (default 10)
  --sample-seconds=N   fixed steady-state duration; at least 10 (default 10)
  --warmup-seconds=N   steady-state warmup before sampling (default 5)
  --profile=NAME       smoke, heavy, or extreme (default heavy)
  --only=ID            diagnose one controlled label
  --headed             show Chrome while measuring
  --output=PATH         output beneath benchmark-controlled
  --channel=NAME        Playwright browser channel (default chrome)
  --timeout=MS          per-page timeout`;
}

function command(command_, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(command_, arguments_, {
      cwd: repositoryDirectory,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command_} exited with ${code ?? signal}`));
    });
  });
}

async function buildSharedArtifact() {
  const started = performance.now();
  await command("npm", ["run", "build", "--workspace", "demo-controlled"]);
  return {
    buildTimeMs: performance.now() - started,
    bundle: await measureDirectory(path.join(demoDirectory, "dist")),
  };
}

function serve(directory) {
  const types = {
    ".css": "text/css",
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".wgsl": "text/plain",
  };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      const relative = pathname === "/"
        ? "index.html"
        : pathname.replace(/^\/+/, "");
      const target = path.resolve(directory, relative);
      if (!target.startsWith(`${path.resolve(directory)}${path.sep}`)) {
        throw new Error("Invalid path");
      }
      const body = await readFile(target);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": types[path.extname(target)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        url: `http://127.0.0.1:${server.address().port}`,
      });
    });
  });
}

function captureUrl(host, profile, runId, implementationId, query = {}) {
  const url = new URL(host);
  url.searchParams.set("benchmarkRun", runId);
  url.searchParams.set("implementation", implementationId);
  url.searchParams.set("profile", profile);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function measureRuntime(
  chromium,
  implementation,
  options,
  runId,
  capture = {},
) {
  const hosted = await serve(
    capture.distDirectory ?? path.join(demoDirectory, "dist"),
  );
  const browser = await chromium.launch({
    args: BROWSER_ISOLATION_ARGUMENTS,
    channel: options.channel,
    headless: options.headless,
  });
  const browserTools = await browser.newBrowserCDPSession();
  const context = await browser.newContext({
    viewport: { height: 900, width: 1440 },
  });
  await context.addInitScript({ content: createInstrumentationScript() });
  const page = await context.newPage();
  const developerTools = await context.newCDPSession(page);
  await developerTools.send("Network.enable");
  await developerTools.send("Network.setCacheDisabled", {
    cacheDisabled: true,
  });
  let systemGpuSampler;
  const started = performance.now();
  try {
    await page.goto(
      captureUrl(
        hosted.url,
        options.profile,
        runId,
        implementation.id,
        capture.query,
      ),
      { waitUntil: "domcontentloaded", timeout: options.timeoutMs },
    );
    await page.waitForFunction(() => {
      const telemetry = window.__WEBGPU_AOT__;
      if (telemetry?.status === "error") {
        throw new Error(telemetry.error ?? "Controlled demo failed");
      }
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
    const gpuProcessId = processInformation.processInfo
      ?.find(({ type }) => type.toLowerCase() === "gpu")?.id ?? null;
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
        latestFrame: sourceTelemetry?.latestFrame === undefined
          ? undefined
          : { ...sourceTelemetry.latestFrame },
      };
      return {
        after,
        benchmark: {
          frameTimes,
          gpuQueueDrainMs: await measurements.drainGpu(),
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
    if (
      frame === null ||
      browserMetrics.benchmark.frameTimes.length < options.sampleFrames
    ) {
      throw new Error(
        `${implementation.name} produced ${browserMetrics.benchmark.frameTimes.length} frame intervals; ${options.sampleFrames} are required`,
      );
    }
    const telemetry = browserMetrics.telemetry;
    const renderedFrames = Math.max(
      1,
      Number(browserMetrics.after.telemetryFrameIndex ?? 0) -
        Number(before.telemetryFrameIndex ?? 0),
    );
    const processGpuUtilization = deriveProcessGpuUtilization(systemGpuSamples);
    const deviceUtilizationAvailable = hasUsableDeviceUtilization(
      systemGpuSamples,
      processGpuUtilization,
    );
    const metrics = {
      assetsReadyMs: telemetry.assetsReadyAt === undefined
        ? null
        : telemetry.assetsReadyAt - telemetry.startupStartedAt,
      averageFps: 1000 / frame.mean,
      captureDurationMs,
      capturedFrames: browserMetrics.benchmark.frameTimes.length,
      cpuFrameTimeMs: telemetry.latestFrame?.cpuTimeMs ?? null,
      firstRenderedFrameMs: telemetry.firstFrameAt - telemetry.startupStartedAt,
      frameTimeMeanMs: frame.mean,
      frameTimeP95Ms: frame.p95,
      frameTimeStandardDeviationMs: frame.standardDeviation,
      frameTimeWorstMs: frame.max,
      gpuQueueDrainMs: browserMetrics.benchmark.gpuQueueDrainMs,
      maxSampleCount: browserMetrics.benchmark.maxSampleCount,
      navigationEncodedBytes: browserMetrics.navigation?.encodedBodySize ?? null,
      navigationTransferBytes: browserMetrics.navigation?.transferSize ?? null,
      pipelineCreationMs: browserMetrics.benchmark.pipelineCreationMs,
      pipelineCreations: browserMetrics.benchmark.pipelineCreations,
      processGpuUtilizationPercent: summarize(processGpuUtilization)?.mean ?? null,
      renderedFrames,
      sceneAnalyticLights: telemetry.latestFrame?.lights ?? null,
      sceneHeight: telemetry.height,
      sceneMeshes: telemetry.latestFrame?.totalMeshes ?? null,
      sceneVisibleMeshes: telemetry.latestFrame?.visibleMeshes ?? null,
      sceneWidth: telemetry.width,
      shaderModules: browserMetrics.benchmark.shaderModules,
      shaderPreparationMs: browserMetrics.benchmark.shaderPreparationMs,
      startupTimeMs,
      systemGpuAllocatedMemoryBytes: summarize(
        systemGpuSamples
          .map(({ allocatedMemoryBytes }) => allocatedMemoryBytes)
          .filter(Number.isFinite),
      )?.mean ?? null,
      systemGpuDeviceUtilizationPercent: deviceUtilizationAvailable
        ? summarize(
          systemGpuSamples
            .map(({ deviceUtilizationPercent }) => deviceUtilizationPercent)
            .filter(Number.isFinite),
        )?.mean ?? null
        : null,
      systemGpuInUseMemoryBytes: summarize(
        systemGpuSamples
          .map(({ inUseMemoryBytes }) => inUseMemoryBytes)
          .filter(Number.isFinite),
      )?.mean ?? null,
      systemGpuRendererUtilizationPercent: deviceUtilizationAvailable
        ? summarize(
          systemGpuSamples
            .map(({ rendererUtilizationPercent }) => rendererUtilizationPercent)
            .filter(Number.isFinite),
        )?.mean ?? null
        : null,
      systemGpuTilerUtilizationPercent: deviceUtilizationAvailable
        ? summarize(
          systemGpuSamples
            .map(({ tilerUtilizationPercent }) => tilerUtilizationPercent)
            .filter(Number.isFinite),
        )?.mean ?? null
        : null,
      warmupDurationMs: options.warmupDurationMs,
      ...deriveWebGpuMetrics({
        after: browserMetrics.after,
        before,
        frames: renderedFrames,
      }),
    };
    if (capture.validate === undefined) {
      validateControlledCapture({ metrics, telemetry }, implementation.id);
    } else {
      capture.validate({ metrics, telemetry }, implementation);
    }
    return {
      evidence: {
        adapter: browserMetrics.after.adapter,
        artifact: {
          shaderHash: telemetry.shaderHash,
          shaderHashAlgorithm: "SHA-256",
          shaderHashSource: "exact string passed to GPUDevice.createShaderModule",
        },
        cpuGpuTraffic: {
          caveat: "API-observed logical transfer volume. It is not a PCIe or unified-memory bus trace, and GPU-internal copies are reported separately from CPU↔GPU transfers.",
          method: "WebGPU API prototype instrumentation",
        },
        dataMovement: browserMetrics.after.dataMovement,
        task: {
          experiment: telemetry.experiment,
          height: telemetry.height,
          lights: telemetry.latestFrame?.lights ?? null,
          meshes: telemetry.latestFrame?.totalMeshes ?? null,
          taskId: telemetry.taskId ?? null,
          taskDynamics: telemetry.taskDynamics ?? null,
          width: telemetry.width,
        },
        resourceAllocation: {
          caveat: "Descriptor-based application allocation estimate; excludes browser/driver overhead, swapchain images, and physical residency.",
          method: "instrumented-createBuffer-createTexture-destroy",
        },
        systemGpu: {
          deviceUtilizationAvailable,
          gpuProcessId,
          method: systemGpuSampler.method,
          samples: systemGpuSamples.length,
        },
        userAgent: browserMetrics.userAgent,
      },
      metrics,
      series: {
        frameTimesMs: browserMetrics.benchmark.frameTimes,
        systemGpuSamples,
      },
    };
  } finally {
    await systemGpuSampler?.stop();
    await developerTools.detach().catch(() => {});
    await context.close();
    await browserTools.detach().catch(() => {});
    await browser.close();
    await new Promise((resolve) => hosted.server.close(resolve));
  }
}

async function main() {
  const options = parseControlledArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const selected = CONTROLLED_IMPLEMENTATIONS.filter(
    ({ id }) => options.only === null || options.only === id,
  );
  const sharedArtifact = await buildSharedArtifact();
  const { chromium } = await import("playwright-core");
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
      viewport: { height: 900, width: 1440 },
      warmupDurationMs: options.warmupDurationMs,
    },
    environment: {
      arch: os.arch(),
      cpus: os.cpus().length,
      memoryBytes: os.totalmem(),
      node: process.version,
      platform: `${os.platform()} ${os.release()}`,
    },
    sharedArtifact: {
      buildTimeMs: sharedArtifact.buildTimeMs,
      ...sharedArtifact.bundle,
    },
  };
  const outputRoot = path.resolve(packageDirectory, options.output);
  const runDirectory = path.join(
    outputRoot,
    startedAt.toISOString().replace(/[:.]/g, "-"),
  );
  await mkdir(runDirectory, { recursive: true });
  const implementations = selected.map((implementation) => ({
    ...implementation,
    runs: [],
  }));
  const resultsById = new Map(
    implementations.map((implementation) => [implementation.id, implementation]),
  );
  for (
    const { demo, index, position } of buildControlledSchedule(
      selected,
      options.runs,
    )
  ) {
    console.log(
      `\n[${demo.name}] run ${index}/${options.runs} · order ${position + 1}/${selected.length}`,
    );
    const runId = `${demo.id}-${index}-${startedAt.getTime()}`;
    const runtime = await measureRuntime(
      chromium,
      demo,
      options,
      runId,
    );
    const run = {
      evidence: runtime.evidence,
      index,
      isolation: {
        browserProcess: "fresh",
        gpuShaderDiskCache: "disabled",
        httpCache: "disabled",
        runId,
      },
      metrics: runtime.metrics,
      orderPosition: position + 1,
      series: runtime.series,
    };
    resultsById.get(demo.id).runs.push(run);
    await writeFile(
      path.join(runDirectory, `${demo.id}-${index}.json`),
      `${JSON.stringify(run, null, 2)}\n`,
    );
  }
  for (const implementation of implementations) {
    implementation.runs.sort((first, second) => first.index - second.index);
  }
  const raw = {
    schemaVersion: 1,
    ...metadata,
    experiment: {
      causalClaimSupported: false,
      id: "identical-wgsl-null-control",
      purpose: "measurement-noise-and-order-effect-baseline",
    },
    implementations,
  };
  const summary = buildControlledSummary(metadata, implementations);
  summary.sharedArtifact = metadata.sharedArtifact;
  await writeFile(
    path.join(runDirectory, "raw.json"),
    `${JSON.stringify(raw, null, 2)}\n`,
  );
  await writeFile(
    path.join(runDirectory, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  const latest = path.join(outputRoot, "latest");
  await mkdir(latest, { recursive: true });
  await cp(path.join(runDirectory, "raw.json"), path.join(latest, "raw.json"));
  await cp(
    path.join(runDirectory, "summary.json"),
    path.join(latest, "summary.json"),
  );
  console.log(
    `\nSaved controlled raw runs and summary to ${path.relative(repositoryDirectory, runDirectory)}`,
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
