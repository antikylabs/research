import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  diffGpuCounters,
  sanitizeArtifactName,
} from "./comparison-metrics.mjs";

function diffWorkloadRecords(before, after, frameCount, mergeLogicalVariants) {
  const previousById = new Map(before.map((record) => [record.id, record]));
  const frames = Math.max(1, frameCount);
  const records = after
    .map((record) => {
      const previous = previousById.get(record.id) ?? {};
      const totals = {};
      const perFrame = {};
      for (const [key, value] of Object.entries(record)) {
        if (key === "id" || typeof value !== "number") continue;
        const difference = value - Number(previous[key] ?? 0);
        if (difference === 0) continue;
        totals[key] = difference;
        perFrame[key] = Number((difference / frames).toFixed(6));
      }
      return {
        id: record.id,
        kind: record.kind ?? previous.kind ?? null,
        label: record.label ?? previous.label ?? "",
        perFrame,
        totals,
      };
    })
    .filter((record) => Object.keys(record.totals).length > 0);
  const normalized = mergeLogicalVariants
    ? [...records.reduce((groups, record) => {
        const key = record.label
          ? `${record.kind ?? "unknown"}\u0000${record.label}`
          : `id\u0000${record.id}`;
        const existing = groups.get(key);
        if (existing === undefined) {
          groups.set(key, { ...record, physicalIds: [record.id] });
          return groups;
        }
        existing.physicalIds.push(record.id);
        for (const [name, value] of Object.entries(record.totals)) {
          existing.totals[name] = Number(existing.totals[name] ?? 0) + value;
          existing.perFrame[name] = Number(
            (existing.totals[name] / frames).toFixed(6),
          );
        }
        return groups;
      }, new Map()).values()].map((record) =>
        record.physicalIds.length > 1
          ? { ...record, variantCount: record.physicalIds.length }
          : (() => {
              const { physicalIds: _physicalIds, ...single } = record;
              return single;
            })(),
      )
    : records;
  return normalized.sort(
      (first, second) =>
        Object.values(second.totals).reduce(
          (sum, value) => sum + Math.abs(value),
          0,
        ) -
        Object.values(first.totals).reduce(
          (sum, value) => sum + Math.abs(value),
          0,
        ),
    );
}

export function diffGpuWorkload(before, after, frameCount) {
  return {
    passes: diffWorkloadRecords(
      before?.passes ?? [],
      after?.passes ?? [],
      frameCount,
      true,
    ),
    pipelines: diffWorkloadRecords(
      before?.pipelines ?? [],
      after?.pipelines ?? [],
      frameCount,
      false,
    ),
  };
}

export async function captureGpuFrameWindow(page, options) {
  const initial = await page.evaluate(() => ({
    observerAvailable: window.__WEBGPU_COMPARE__ !== undefined,
    frameIndex: window.__WEBGPU_AOT__?.latestFrame?.frameIndex ?? null,
  }));
  if (!initial.observerAvailable || initial.frameIndex === null) {
    throw new Error("WebGPU observer or frame telemetry is unavailable");
  }
  const startingFrame = options.captureFrame - options.frames;
  if (startingFrame < 0) {
    throw new Error("--capture-frame must be greater than --frames");
  }
  const targetFrame = options.captureFrame;
  if (initial.frameIndex > startingFrame) {
    throw new Error(
      `Capture frame ${targetFrame} cannot provide a ${options.frames}-frame window after frame ${initial.frameIndex}; increase --capture-frame`,
    );
  }
  const armFrameGate = (target, resume) => page.evaluate(({ resume, target }) => {
    const animation = window.__WEBGPU_COMPARE__?.animation;
    animation?.pauseWhen(
      () => (window.__WEBGPU_AOT__?.latestFrame?.frameIndex ?? -1) >= target,
    );
    if (resume) animation?.resume();
  }, { resume, target });
  const waitForFrame = (target) => page.waitForFunction(
    (frame) => {
      const telemetry = window.__WEBGPU_AOT__;
      return (
        telemetry?.status === "error" ||
        (telemetry?.latestFrame?.frameIndex ?? -1) >= frame
      );
    },
    target,
    { polling: 50, timeout: options.timeoutMs },
  );

  await armFrameGate(startingFrame, false);
  await waitForFrame(startingFrame);
  const before = await page.evaluate(() => ({
    counters: window.__WEBGPU_COMPARE__?.counters() ?? null,
    frameIndex: window.__WEBGPU_AOT__?.latestFrame?.frameIndex ?? null,
    workload: window.__WEBGPU_COMPARE__?.workload() ?? null,
  }));
  if (before.frameIndex !== startingFrame) {
    throw new Error(
      `WebGPU observer stopped at frame ${before.frameIndex}, expected ${startingFrame}`,
    );
  }
  await page.evaluate(
    ({ endingFrame, startingFrame }) => {
      window.__WEBGPU_COMPARE__?.beginTrace?.({ endingFrame, startingFrame });
    },
    { endingFrame: targetFrame, startingFrame },
  );
  await armFrameGate(targetFrame, true);
  await waitForFrame(targetFrame);
  const after = await page.evaluate(async () => {
    const observer = window.__WEBGPU_COMPARE__;
    observer?.animation?.pause();
    const clone = (value) =>
      value === null || value === undefined ? value ?? null : structuredClone(value);
    const executionTrace = clone(observer?.endTrace?.() ?? null);
    const snapshot = {
      animationState: clone(observer?.animation?.state() ?? null),
      capture: clone(observer?.capture() ?? null),
      counters: clone(observer?.counters() ?? null),
      error: window.__WEBGPU_AOT__?.error ?? null,
      executionTrace,
      frameIndex: window.__WEBGPU_AOT__?.latestFrame?.frameIndex ?? null,
      status: window.__WEBGPU_AOT__?.status ?? null,
      workload: clone(observer?.workload() ?? null),
    };
    const selectedReflectionProbe =
      (await observer?.probeSelectedReflection?.(
        snapshot.executionTrace,
        snapshot.frameIndex,
      )) ?? null;
    const bufferProbes =
      (await observer?.probeBuffers?.(snapshot.frameIndex)) ?? null;
    return {
      ...snapshot,
      bufferProbes,
      selectedReflectionProbe,
      textureProbes:
        (await observer?.probeTextures?.(snapshot.frameIndex)) ?? null,
    };
  });
  if (after.status === "error") {
    throw new Error(after.error ?? "Workload reported an error");
  }
  if (
    after.capture === null ||
    after.counters === null ||
    after.frameIndex === null ||
    after.workload === null ||
    before.workload === null
  ) {
    throw new Error("WebGPU observer stopped before measurement completed");
  }
  const observedFrames = Math.max(1, after.frameIndex - before.frameIndex);
  return {
    capture: {
      ...after.capture,
      bufferProbes: after.bufferProbes,
      executionTrace: after.executionTrace,
      selectedReflectionProbe: after.selectedReflectionProbe,
      synchronization: {
        animation: after.animationState,
        capturedFrameIndex: after.frameIndex,
        requestedFrameIndex: targetFrame,
      },
      textureProbes: after.textureProbes,
    },
    frameWindow: {
      endingFrame: after.frameIndex,
      startingFrame: before.frameIndex,
      ...diffGpuCounters(before.counters, after.counters, observedFrames),
    },
    workloadWindow: diffGpuWorkload(
      before.workload,
      after.workload,
      observedFrames,
    ),
  };
}

export async function captureCanvasRendering(page, outputDirectory, slug) {
  const canvas = page.locator("canvas").first();
  if ((await canvas.count()) === 0) {
    throw new Error("Demo canvas is missing");
  }
  const previousVisibility = await page.evaluate(() => {
    const selectors = [".loading-card", "#status"];
    return selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return null;
      const visibility = element.style.visibility;
      element.style.visibility = "hidden";
      return { selector, visibility };
    });
  });
  const screenshot = `${slug}-canvas.png`;
  let png;
  try {
    png = await canvas.screenshot({
      path: path.join(outputDirectory, screenshot),
      type: "png",
    });
  } finally {
    await page.evaluate((entries) => {
      for (const entry of entries) {
        if (entry === null) continue;
        const element = document.querySelector(entry.selector);
        if (element instanceof HTMLElement) {
          element.style.visibility = entry.visibility;
        }
      }
    }, previousVisibility);
  }
  const metrics = await page.evaluate(
    (base64) => window.__WEBGPU_COMPARE__?.analyzePng(base64) ?? null,
    png.toString("base64"),
  );
  if (metrics === null) {
    throw new Error("WebGPU observer could not analyze the canvas capture");
  }
  return { metrics, screenshot };
}

export async function persistShaderArtifacts(
  outputDirectory,
  slug,
  gpuCapture,
) {
  const relativeDirectory = path.posix.join("shaders", slug);
  const shaderDirectory = path.join(outputDirectory, "shaders", slug);
  await mkdir(shaderDirectory, { recursive: true });
  const filesByHash = new Map();
  const shaderModules = [];
  for (const shader of gpuCapture.shaderModules) {
    let fileName = filesByHash.get(shader.hash);
    if (fileName === undefined) {
      const label = sanitizeArtifactName(shader.label) || "shader";
      fileName = `${shader.hash}-${label}.wgsl`;
      filesByHash.set(shader.hash, fileName);
      await writeFile(path.join(shaderDirectory, fileName), shader.code);
    }
    const { code: _code, ...manifestEntry } = shader;
    shaderModules.push({
      ...manifestEntry,
      sourceFile: path.posix.join(relativeDirectory, fileName),
    });
  }
  const manifest = {
    pipelines: gpuCapture.pipelines,
    shaderModules,
  };
  const manifestFile = path.posix.join(relativeDirectory, "manifest.json");
  await writeFile(
    path.join(shaderDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return {
    ...gpuCapture,
    shaderManifest: manifestFile,
    shaderModules,
  };
}
