#!/usr/bin/env node

import { spawn } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { measureDirectory } from "../../benchmark/scripts/metrics.mjs";

import {
  ARCHITECTURE_IMPLEMENTATIONS,
  parseArchitectureArguments,
  validateArchitectureCapture,
} from "./architecture.mjs";
import { buildArchitectureSummary } from "./results.mjs";
import { measureRuntime } from "./run.mjs";
import { buildControlledSchedule } from "./scientific.mjs";

const packageDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryDirectory = path.resolve(packageDirectory, "../..");

function usage() {
  return `Usage: npm run benchmark:architecture --workspace benchmark-controlled -- [options]

  --runs=N             captures per implementation (default 10)
  --sample-frames=N    minimum intervals required for a valid capture (default 10)
  --sample-seconds=N   fixed steady-state duration; at least 10 (default 10)
  --warmup-seconds=N   steady-state warmup before sampling (default 5)
  --profile=NAME       smoke, heavy, or extreme (default heavy)
  --only=ID            diagnose raw-webgpu-control or threejs-framework
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

async function buildArtifact(implementation) {
  const started = performance.now();
  await command("npm", ["run", "build", "--workspace", implementation.workspace]);
  const directory = path.join(
    repositoryDirectory,
    "packages",
    implementation.workspace,
    "dist",
  );
  return {
    buildTimeMs: performance.now() - started,
    directory,
    ...await measureDirectory(directory),
  };
}

async function main() {
  const options = parseArchitectureArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const selected = ARCHITECTURE_IMPLEMENTATIONS.filter(
    ({ id }) => options.only === null || options.only === id,
  );
  const artifactEntries = await Promise.all(
    selected.map(async (implementation) => [
      implementation.id,
      await buildArtifact(implementation),
    ]),
  );
  const artifacts = Object.fromEntries(artifactEntries);
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
  const byId = new Map(
    implementations.map((implementation) => [implementation.id, implementation]),
  );
  for (
    const { demo, index, position } of buildControlledSchedule(
      selected,
      options.runs,
    )
  ) {
    console.log(
      `\n[${demo.name}] architecture run ${index}/${options.runs} · order ${position + 1}/${selected.length}`,
    );
    const runId = `architecture-${demo.id}-${index}-${startedAt.getTime()}`;
    const artifact = artifacts[demo.id];
    const runtime = await measureRuntime(
      chromium,
      demo,
      options,
      runId,
      {
        distDirectory: artifact.directory,
        query: demo.query,
        validate: validateArchitectureCapture,
      },
    );
    const run = {
      evidence: {
        ...runtime.evidence,
        packageArtifact: {
          buildTimeMs: artifact.buildTimeMs,
          bytes: artifact.bytes,
          files: artifact.files,
          gzipBytes: artifact.gzipBytes,
        },
      },
      index,
      isolation: {
        browserProcess: "fresh",
        gpuShaderDiskCache: "disabled",
        httpCache: "disabled",
        runId,
      },
      metrics: {
        ...runtime.metrics,
        bundleBytes: artifact.bytes,
        bundleGzipBytes: artifact.gzipBytes,
      },
      orderPosition: position + 1,
      series: runtime.series,
    };
    byId.get(demo.id).runs.push(run);
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
      authoringSystemClaimSupported: false,
      id: "controlled-renderer-architecture",
      purpose: "raw-webgpu-versus-threejs-controlled-task",
    },
    implementations,
  };
  const summary = buildArchitectureSummary(metadata, implementations);
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
    `\nSaved architecture-control runs to ${path.relative(repositoryDirectory, runDirectory)}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
