import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

export function summarize(values) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const squaredDifference = finite.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  const variance = finite.length === 1 ? 0 : squaredDifference / (finite.length - 1);
  const standardDeviation = Math.sqrt(variance);
  const criticalValues = [
    12.706205, 4.302653, 3.182446, 2.776445, 2.570582, 2.446912,
    2.364624, 2.306004, 2.262157, 2.228139, 2.200985, 2.178813,
    2.160369, 2.144787, 2.13145, 2.119905, 2.109816, 2.100922,
    2.093024, 2.085963, 2.079614, 2.073873, 2.068658, 2.063899,
    2.059539, 2.055529, 2.051831, 2.048407, 2.04523, 2.042272,
  ];
  const degreesOfFreedom = finite.length - 1;
  const critical = degreesOfFreedom <= 0
    ? 0
    : criticalValues[Math.min(degreesOfFreedom, criticalValues.length) - 1] ?? 1.96;
  const margin = critical * standardDeviation / Math.sqrt(finite.length);
  const round = (value) => Number(value.toFixed(6));
  const percentile = (fraction) => finite[Math.min(finite.length - 1, Math.ceil(finite.length * fraction) - 1)];
  return {
    ci95High: round(mean + margin),
    ci95Low: round(mean - margin),
    count: finite.length,
    mean,
    median: percentile(0.5),
    min: finite[0],
    max: finite.at(-1),
    p95: percentile(0.95),
    standardDeviation,
  };
}

export function summarizeRuns(runs) {
  const keys = new Set(runs.flatMap((run) => Object.keys(run.metrics)));
  return Object.fromEntries([...keys].sort().map((key) => [
    key,
    summarize(runs.map((run) => run.metrics[key]).filter((value) => typeof value === "number")),
  ]));
}

export async function measureDirectory(directory) {
  const totals = { bytes: 0, files: 0, gzipBytes: 0 };
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) {
        const info = await stat(target);
        totals.bytes += info.size;
        totals.files += 1;
        if (/\.(?:css|html|js|json|map|svg|txt|wgsl)$/i.test(entry.name)) {
          totals.gzipBytes += gzipSync(await readFile(target)).byteLength;
        } else {
          totals.gzipBytes += info.size;
        }
      }
    }
  }
  await visit(directory);
  return totals;
}

export function buildSummary(metadata, demos) {
  return {
    schemaVersion: 2,
    generatedAt: metadata.generatedAt,
    configuration: metadata.configuration,
    environment: metadata.environment,
    demos: demos.map((demo) => {
      const summary = summarizeRuns(demo.runs);
      return {
        comparisonRole: demo.comparisonRole,
        evidence: demo.runs[0]?.evidence ?? {},
        id: demo.id,
        name: demo.name,
        rendererContract: demo.rendererContract,
        runs: demo.runs.length,
        samples: Object.fromEntries(Object.keys(summary).map((key) => [
          key,
          demo.runs.map((run) => run.metrics[key]).filter((value) => typeof value === "number" && Number.isFinite(value)),
        ])),
        series: demo.runs.map((run) => ({ index: run.index, ...run.series })),
        summary,
      };
    }),
  };
}
