#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  compareVisualPresentation,
  comparisonPassed,
  evaluateSelectedReflectionQuality,
  extractParticleState,
  findParticleParity,
  findPreCompositeLightingCues,
  findSelectedReflectionComparison,
  findSharedRendererPairs,
  findVisualParity,
  renderHtmlReport,
  summarizeReport,
} from "./comparison-report.mjs";
import {
  captureCanvasRendering,
  captureGpuFrameWindow,
  persistShaderArtifacts,
} from "./comparison-capture.mjs";
import {
  analyzeLightingCuePng,
  calculateLightingCues,
  createLightingCueAnalyzerScript,
  findLightingCues,
  resolveActiveRenderBounds,
} from "./comparison-lighting.mjs";
import { createWebGpuObserverScript } from "./webgpu-observer.mjs";

export {
  compareVisualPresentation,
  comparisonPassed,
  calculateLightingCues,
  evaluateSelectedReflectionQuality,
  extractParticleState,
  findLightingCues,
  findParticleParity,
  findPreCompositeLightingCues,
  findSelectedReflectionComparison,
  findSharedRendererPairs,
  findVisualParity,
  renderHtmlReport,
  resolveActiveRenderBounds,
  summarizeReport,
};

const VIEWPORT = Object.freeze({ width: 1440, height: 900 });
const DEMOS = Object.freeze([
  { name: "BroMetal AOT", slug: "brometal", port: 4173 },
  { name: "TypeGPU runtime", slug: "typegpu", port: 4174 },
  { name: "TypeGPU-Antiky AOT", slug: "typegpu-antiky", port: 4175 },
  { name: "WESL static", slug: "wesl", port: 4176 },
  { name: "Three.js native", slug: "threejs", port: 4177 },
]);
const DEMO_SLUGS = new Set(DEMOS.map(({ slug }) => slug));
const VALID_PROFILES = new Set(["smoke", "heavy", "extreme"]);
const GENERIC_RESOURCE_ERROR =
  /^Failed to load resource: the server responded with a status of \d+/;

function positiveInteger(value, optionName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer`);
  }
  return parsed;
}

function normalizedHost(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`--host must be an HTTP URL, received ${value}`);
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error(`--host must be an HTTP URL, received ${value}`);
  }
  parsed.port = "";
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function regularExpression(value, optionName) {
  try {
    new RegExp(value, "i");
  } catch {
    throw new Error(`${optionName} must be a valid regular expression`);
  }
  return value;
}

export function parseArguments(arguments_) {
  const options = {
    bufferProbeBytes: 32_768,
    bufferProbePattern: "(?:particle|light|render|frame|cascade)",
    captureFrame: 12,
    channel: "chrome",
    frames: 5,
    headless: false,
    help: false,
    host: "http://127.0.0.1",
    maximumBufferProbes: 12,
    maximumTextureProbes: 24,
    maximumTraceCommands: 50_000,
    maximumTraceBufferWrites: 10_000,
    outputDirectory: "artifacts/visual-comparison",
    only: null,
    port: null,
    portOffset: 0,
    profile: "smoke",
    timeoutMs: 60_000,
    traceBufferWriteBytes: 32_768,
    traceBufferWritePattern: ".",
    textureProbePattern:
      "(?:ambient|occlusion|GTAO|AO$|HDR|environment|prefiltered|convolved|BRDF|(?:^|[^A-Za-z0-9])LUT(?:[^A-Za-z0-9]|$)|normal|surface|world.position|metalrough|reflection|SSR|bloom|history|temporal|TRAA|velocity|resolve$|output$)",
  };

  for (const argument of arguments_) {
    if (argument === "--headless") {
      options.headless = true;
    } else if (argument === "--headed") {
      options.headless = false;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument.startsWith("--channel=")) {
      options.channel = argument.slice("--channel=".length);
      if (options.channel.length === 0) {
        throw new Error("--channel cannot be empty");
      }
    } else if (argument.startsWith("--buffer-probe-bytes=")) {
      options.bufferProbeBytes = positiveInteger(
        argument.slice("--buffer-probe-bytes=".length),
        "--buffer-probe-bytes",
      );
    } else if (argument.startsWith("--buffer-probe-pattern=")) {
      options.bufferProbePattern = regularExpression(
        argument.slice("--buffer-probe-pattern=".length),
        "--buffer-probe-pattern",
      );
    } else if (argument.startsWith("--capture-frame=")) {
      options.captureFrame = positiveInteger(
        argument.slice("--capture-frame=".length),
        "--capture-frame",
      );
    } else if (argument.startsWith("--frames=")) {
      options.frames = positiveInteger(
        argument.slice("--frames=".length),
        "--frames",
      );
    } else if (argument.startsWith("--host=")) {
      options.host = normalizedHost(argument.slice("--host=".length));
    } else if (argument.startsWith("--max-buffer-probes=")) {
      options.maximumBufferProbes = positiveInteger(
        argument.slice("--max-buffer-probes=".length),
        "--max-buffer-probes",
      );
    } else if (argument.startsWith("--max-texture-probes=")) {
      options.maximumTextureProbes = positiveInteger(
        argument.slice("--max-texture-probes=".length),
        "--max-texture-probes",
      );
    } else if (argument.startsWith("--output=")) {
      options.outputDirectory = argument.slice("--output=".length);
      if (options.outputDirectory.length === 0) {
        throw new Error("--output cannot be empty");
      }
    } else if (argument.startsWith("--only=")) {
      options.only = argument.slice("--only=".length);
      if (!DEMO_SLUGS.has(options.only)) {
        throw new Error(`--only must be one of ${[...DEMO_SLUGS].join(", ")}`);
      }
    } else if (argument.startsWith("--port=")) {
      options.port = positiveInteger(argument.slice("--port=".length), "--port");
    } else if (argument.startsWith("--port-offset=")) {
      options.portOffset = positiveInteger(
        argument.slice("--port-offset=".length),
        "--port-offset",
      );
    } else if (argument.startsWith("--profile=")) {
      options.profile = argument.slice("--profile=".length);
      if (!VALID_PROFILES.has(options.profile)) {
        throw new Error(
          `--profile must be one of ${[...VALID_PROFILES].join(", ")}`,
        );
      }
    } else if (argument.startsWith("--timeout=")) {
      options.timeoutMs = positiveInteger(
        argument.slice("--timeout=".length),
        "--timeout",
      );
    } else if (argument.startsWith("--texture-probe-pattern=")) {
      options.textureProbePattern = regularExpression(
        argument.slice("--texture-probe-pattern=".length),
        "--texture-probe-pattern",
      );
    } else if (argument.startsWith("--trace-commands=")) {
      options.maximumTraceCommands = positiveInteger(
        argument.slice("--trace-commands=".length),
        "--trace-commands",
      );
    } else if (argument.startsWith("--trace-buffer-writes=")) {
      options.maximumTraceBufferWrites = positiveInteger(
        argument.slice("--trace-buffer-writes=".length),
        "--trace-buffer-writes",
      );
    } else if (argument.startsWith("--trace-buffer-write-bytes=")) {
      options.traceBufferWriteBytes = positiveInteger(
        argument.slice("--trace-buffer-write-bytes=".length),
        "--trace-buffer-write-bytes",
      );
    } else if (argument.startsWith("--trace-buffer-write-pattern=")) {
      options.traceBufferWritePattern = regularExpression(
        argument.slice("--trace-buffer-write-pattern=".length),
        "--trace-buffer-write-pattern",
      );
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (options.port !== null && options.only === null) {
    throw new Error("--port requires --only so its target is unambiguous");
  }
  if (options.port !== null && options.portOffset !== 0) {
    throw new Error("--port and --port-offset cannot be combined");
  }

  return options;
}

export function buildDemoTargets({
  host,
  only,
  port: portOverride,
  portOffset = 0,
  profile,
}) {
  return DEMOS.filter(({ slug }) => only === null || only === undefined || slug === only).map(({ name, slug, port }) => ({
    name,
    slug,
    url: `${host}:${portOverride ?? port + portOffset}/?profile=${encodeURIComponent(profile)}`,
  }));
}

export function classifyBrowserIssue(issue) {
  const message = String(issue.message);
  if (issue.kind === "console" && GENERIC_RESOURCE_ERROR.test(message)) {
    return null;
  }
  if (issue.kind === "response" && issue.url !== undefined) {
    const pathname = new URL(issue.url).pathname;
    if (pathname === "/favicon.ico") {
      return null;
    }
  }
  if (
    issue.kind === "console" &&
    !new Set(["warning", "error", "assert"]).has(issue.level)
  ) {
    return null;
  }

  const isGpuFailure =
    /\b(?:WebGPU|GPUValidationError|device lost|validation failed)\b/i.test(
      message,
    );
  const severity =
    isGpuFailure || issue.level === "error" || issue.level === "assert"
      ? "error"
      : "warning";
  return { kind: issue.kind, severity, message };
}

function appendIssue(issues, issue) {
  const classified = classifyBrowserIssue(issue);
  if (
    classified !== null &&
    !issues.some(
      (existing) =>
        existing.kind === classified.kind &&
        existing.message === classified.message,
    )
  ) {
    issues.push(classified);
  }
}

async function readPageState(page) {
  return page.evaluate(() => {
    const telemetry = window.__WEBGPU_AOT__ ?? null;
    const canvas = document.querySelector("canvas");
    const status = document.querySelector("#status");
    return {
      canvas:
        canvas === null
          ? null
          : {
              cssHeight: canvas.clientHeight,
              cssWidth: canvas.clientWidth,
              height: canvas.height,
              width: canvas.width,
            },
      gpuAvailable: navigator.gpu !== undefined,
      statusText: status?.textContent?.trim() ?? null,
      telemetry: JSON.parse(JSON.stringify(telemetry)),
    };
  });
}

async function compareTarget(browser, target, options, outputDirectory) {
  const startedAt = performance.now();
  const issues = [];
  const screenshot = `${target.slug}.png`;
  const screenshotPath = path.join(outputDirectory, screenshot);
  const context = await browser.newContext({
    colorScheme: "dark",
    deviceScaleFactor: 1,
    viewport: VIEWPORT,
  });
  await context.addInitScript({ content: createLightingCueAnalyzerScript() });
  await context.addInitScript({
    content: createWebGpuObserverScript({
      bufferProbeBytes: options.bufferProbeBytes,
      bufferProbePattern: options.bufferProbePattern,
      maximumBufferProbes: options.maximumBufferProbes,
      maximumTextureProbes: options.maximumTextureProbes,
      maximumTraceCommands: options.maximumTraceCommands,
      maximumTraceBufferWrites: options.maximumTraceBufferWrites,
      textureProbePattern: options.textureProbePattern,
      targetSlug: target.slug,
      traceBufferWriteBytes: options.traceBufferWriteBytes,
      traceBufferWritePattern: options.traceBufferWritePattern,
    }),
  });
  const page = await context.newPage();
  let canvasCapture = null;
  let frameWindow = null;
  let gpuCapture = null;
  let lightingCues = null;
  let workloadWindow = null;
  let state = null;
  let status = "failed";
  let screenshotWritten = false;

  page.on("console", (message) => {
    appendIssue(issues, {
      kind: "console",
      level: message.type(),
      message: message.text(),
    });
  });
  page.on("pageerror", (error) => {
    appendIssue(issues, {
      kind: "pageerror",
      level: "error",
      message: error.message,
    });
  });
  page.on("requestfailed", (request) => {
    appendIssue(issues, {
      kind: "request",
      level: "error",
      message: `${request.failure()?.errorText ?? "request failed"} ${request.url()}`,
      url: request.url(),
    });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      appendIssue(issues, {
        kind: "response",
        level: "error",
        message: `${response.status()} ${response.url()}`,
        url: response.url(),
      });
    }
  });
  page.on("crash", () => {
    appendIssue(issues, {
      kind: "crash",
      level: "error",
      message: "Renderer process crashed",
    });
  });

  try {
    await page.goto(target.url, {
      timeout: options.timeoutMs,
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () => {
        const telemetry = window.__WEBGPU_AOT__;
        return (
          telemetry?.status === "error" ||
          (telemetry?.status === "ready" &&
            (telemetry.latestFrame?.frameIndex ?? -1) >= 0)
        );
      },
      null,
      { timeout: options.timeoutMs },
    );
    state = await readPageState(page);
    if (state.telemetry?.status === "error") {
      appendIssue(issues, {
        kind: "telemetry",
        level: "error",
        message: state.telemetry.error ?? "Workload reported an error",
      });
    } else if (!state.gpuAvailable) {
      appendIssue(issues, {
        kind: "capability",
        level: "error",
        message: "navigator.gpu is unavailable",
      });
    } else if (state.canvas === null) {
      appendIssue(issues, {
        kind: "dom",
        level: "error",
        message: "Demo canvas is missing",
      });
    } else {
      const measurement = await captureGpuFrameWindow(page, options);
      frameWindow = measurement.frameWindow;
      workloadWindow = measurement.workloadWindow;
      gpuCapture = await persistShaderArtifacts(
        outputDirectory,
        target.slug,
        measurement.capture,
      );
      for (const message of gpuCapture.errors) {
        appendIssue(issues, {
          kind: "webgpu",
          level: message.startsWith("Unable to observe") ? "warning" : "error",
          message,
        });
      }
      state = await readPageState(page);
      status = "ready";
    }
  } catch (error) {
    appendIssue(issues, {
      kind: error?.name === "TimeoutError" ? "timeout" : "browser",
      level: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    try {
      state = await readPageState(page);
    } catch {
      state = null;
    }
  }

  try {
    await page.screenshot({ path: screenshotPath, type: "png" });
    screenshotWritten = true;
    if (state?.canvas !== null && state?.canvas !== undefined) {
      canvasCapture = await captureCanvasRendering(
        page,
        outputDirectory,
        target.slug,
      );
      lightingCues = await analyzeLightingCuePng(
        page,
        path.join(outputDirectory, canvasCapture.screenshot),
        state.canvas,
      );
    }
  } catch (error) {
    appendIssue(issues, {
      kind: "screenshot",
      level: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await context.close();
  }

  return {
    canvas: state?.canvas ?? null,
    canvasMetrics: canvasCapture?.metrics ?? null,
    canvasScreenshot: canvasCapture?.screenshot ?? null,
    durationMs: performance.now() - startedAt,
    frameWindow,
    gpu: gpuCapture,
    issues,
    lightingCues,
    name: target.name,
    screenshot: screenshotWritten ? screenshot : null,
    slug: target.slug,
    status,
    statusText: state?.statusText ?? null,
    telemetry: state?.telemetry ?? null,
    url: target.url,
    workloadWindow,
  };
}

async function loadChromium() {
  try {
    const playwright = await import("playwright-core");
    return playwright.chromium;
  } catch (error) {
    throw new Error(
      "Playwright is not installed. Run npm install before comparing demos.",
      { cause: error },
    );
  }
}

async function writeReports(outputDirectory, report) {
  const lightingCues = findLightingCues(report.results);
  const particleParity = findParticleParity(report.results);
  const preCompositeLightingCues = findPreCompositeLightingCues(report.results);
  const selectedReflectionComparison = findSelectedReflectionComparison(
    report.results,
  );
  await writeFile(
    path.join(outputDirectory, "report.json"),
    `${JSON.stringify(
      {
        ...report,
        lightingCues,
        particleParity,
        passed: comparisonPassed(report.results),
        preCompositeLightingCues,
        selectedReflectionComparison,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(outputDirectory, "summary.json"),
    `${JSON.stringify(summarizeReport(report), null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDirectory, "index.html"),
    renderHtmlReport(report),
  );
}

export async function runComparison(options) {
  const outputDirectory = path.resolve(options.outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  const chromium = await loadChromium();
  const browser = await chromium.launch({
    args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"],
    channel: options.channel === "chromium" ? undefined : options.channel,
    headless: options.headless,
    timeout: options.timeoutMs,
  });
  const report = {
    createdAt: new Date().toISOString(),
    profile: options.profile,
    results: [],
    viewport: VIEWPORT,
  };

  try {
    for (const target of buildDemoTargets(options)) {
      process.stdout.write(`Comparing ${target.name} at ${target.url}…\n`);
      const result = await compareTarget(
        browser,
        target,
        options,
        outputDirectory,
      );
      report.results.push(result);
      await writeReports(outputDirectory, report);
      const errorCount = result.issues.filter(
        (issue) => issue.severity === "error",
      ).length;
      process.stdout.write(
        `  ${result.status} in ${(result.durationMs / 1000).toFixed(
          2,
        )} s; ${errorCount} error${errorCount === 1 ? "" : "s"}\n`,
      );
    }
  } finally {
    await browser.close();
  }

  await writeReports(outputDirectory, report);
  return { outputDirectory, report };
}

function printHelp() {
  process.stdout.write(`Usage: npm run compare:demos -- [options]\n\nOptions:\n  --profile=smoke|heavy|extreme  Workload profile (default: smoke)\n  --timeout=MS                    Per-stage timeout (default: 60000)\n  --frames=N                      Measured workload frames (default: 5)\n  --capture-frame=N               Absolute synchronized frame (default: 12)\n  --trace-commands=N              Maximum exact window commands (default: 50000)\n  --trace-buffer-writes=N         Maximum queued write snapshots (default: 10000)\n  --trace-buffer-write-bytes=N    Bytes retained per queued write (default: 512)\n  --trace-buffer-write-pattern=R  Select traced buffer labels (default: all)\n  --buffer-probe-pattern=REGEX    Select labeled GPU buffers\n  --buffer-probe-bytes=N          Bytes retained per selected buffer\n  --max-buffer-probes=N           Maximum selected GPU buffers\n  --texture-probe-pattern=REGEX   Select labeled GPU targets\n  --max-texture-probes=N          Maximum selected GPU targets\n  --only=SLUG                     Capture one demo only\n  --port=PORT                     Override the port for a focused capture\n  --port-offset=N                 Shift every standard demo port by N\n  --headless                      Run Chrome without a visible window\n  --headed                        Run visible Chrome (default)\n  --channel=NAME                  Installed browser channel (default: chrome)\n  --host=URL                      Demo host without a port\n  --output=PATH                   Report directory\n  --help                          Show this help\n`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const { outputDirectory, report } = await runComparison(options);
  const passed = comparisonPassed(report.results);
  process.stdout.write(
    `\n${passed ? "PASS" : "FAIL"}: ${path.join(
      outputDirectory,
      "index.html",
    )}\n`,
  );
  if (!passed) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
