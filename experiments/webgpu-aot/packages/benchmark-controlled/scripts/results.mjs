import { summarizeRuns } from "../../benchmark/scripts/metrics.mjs";

import { assessArchitectureControl } from "./architecture.mjs";
import { assessNullControl } from "./scientific.mjs";

function summarizeArchitectureImplementations(implementations) {
  return implementations.map((implementation) => {
    const summary = summarizeRuns(implementation.runs);
    return {
      comparisonRole: implementation.comparisonRole,
      evidence: implementation.runs[0]?.evidence ?? {},
      id: implementation.id,
      name: implementation.name,
      runs: implementation.runs.length,
      samples: Object.fromEntries(Object.keys(summary).map((key) => [
        key,
        implementation.runs
          .map((run) => run.metrics[key])
          .filter((value) => typeof value === "number" && Number.isFinite(value)),
      ])),
      series: implementation.runs.map((run) => ({
        index: run.index,
        ...run.series,
      })),
      summary,
    };
  });
}

export function buildControlledSummary(metadata, implementations) {
  const summarized = implementations.map((implementation) => {
    const summary = summarizeRuns(implementation.runs);
    const firstEvidence = implementation.runs[0]?.evidence ?? {};
    const shaderHashes = [...new Set(
      implementation.runs
        .map((run) => run.evidence?.artifact?.shaderHash)
        .filter((hash) => typeof hash === "string" && hash.length > 0),
    )];
    return {
      evidence: {
        ...firstEvidence,
        artifact: {
          ...(firstEvidence.artifact ?? {}),
          shaderHashes,
        },
      },
      id: implementation.id,
      name: implementation.name,
      runs: implementation.runs.length,
      samples: Object.fromEntries(
        Object.keys(summary).map((key) => [
          key,
          implementation.runs
            .map((run) => run.metrics[key])
            .filter((value) => typeof value === "number" && Number.isFinite(value)),
        ]),
      ),
      series: implementation.runs.map((run) => ({
        index: run.index,
        ...run.series,
      })),
      summary,
    };
  });
  return {
    schemaVersion: 1,
    generatedAt: metadata.generatedAt,
    configuration: metadata.configuration,
    environment: metadata.environment,
    experiment: {
      causalClaimSupported: false,
      id: "identical-wgsl-null-control",
      purpose: "measurement-noise-and-order-effect-baseline",
      scope: "All labels execute the same checked shader bytes and frame graph. This does not exercise four generator implementations.",
    },
    implementations: summarized,
    nullControl: assessNullControl(summarized),
  };
}

export function buildArchitectureSummary(metadata, implementations) {
  const summarized = summarizeArchitectureImplementations(implementations);
  return {
    schemaVersion: 1,
    generatedAt: metadata.generatedAt,
    configuration: metadata.configuration,
    environment: metadata.environment,
    experiment: {
      authoringSystemClaimSupported: false,
      id: "controlled-renderer-architecture",
      purpose: "raw-webgpu-versus-threejs-controlled-task",
      scope: "The raw WebGPU and Three.js constructions implement the same static full-screen 32-light GGX plus ACES task. Shader wrappers and measured command topology are renderer-specific outcomes.",
    },
    implementations: summarized,
    architectureControl: assessArchitectureControl(summarized),
  };
}
