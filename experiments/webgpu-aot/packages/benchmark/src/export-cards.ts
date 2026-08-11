import { METRICS, rankedByAverageFps, type BenchmarkSummary, type DemoSummary, type MetricDefinition } from "./model.js";

export const SERIES_COLORS = ["#0072b2", "#d55e00", "#009e73", "#cc79a7", "#e69f00"];

export interface ShareCard {
  description: string;
  fileName: string;
  height: 900;
  id: "renderer-ranking" | "steady-state-performance" | "gpu-footprint-and-traffic" | "cpu-source-queue-writes" | "resource-system-diagnostics" | "cold-start-and-artifacts";
  svg: string;
  title: string;
  width: 1600;
}

const SHARE_CARD_IDS: ShareCard["id"][] = [
  "renderer-ranking",
  "steady-state-performance",
  "gpu-footprint-and-traffic",
  "cpu-source-queue-writes",
  "resource-system-diagnostics",
  "cold-start-and-artifacts",
];

export function shareCardIdFromSearch(search: string): ShareCard["id"] | null {
  const candidate = new URLSearchParams(search).get("card");
  return SHARE_CARD_IDS.find((id) => id === candidate) ?? null;
}

const WIDTH = 1600;
const HEIGHT = 900;

function escapeXml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&apos;",
    '"': "&quot;",
  })[character]!);
}

function commonStyles(): string {
  return `<style>
    text { fill: #17212b; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-variant-numeric: tabular-nums; }
    .serif { font-family: Georgia, "Times New Roman", serif; font-weight: 600; }
    .kicker { fill: #1b5a7a; font-size: 15px; font-weight: 700; letter-spacing: 2.2px; }
    .meta { fill: #73808d; font-size: 14px; font-weight: 650; letter-spacing: 1px; }
    .title { font-size: 52px; letter-spacing: -1.5px; }
    .subtitle { fill: #566474; font-size: 19px; }
    .panel { fill: #f6f8f9; stroke: #cfd6dc; stroke-width: 1.5; }
    .panel-title { font-size: 25px; }
    .panel-meta { fill: #73808d; font-size: 12px; font-weight: 700; letter-spacing: .8px; }
    .label { font-size: 15px; font-weight: 650; }
    .value { fill: #35424f; font-size: 14px; font-weight: 650; }
    .track { fill: #dfe5e9; }
    .ci { stroke: #34414e; stroke-width: 2; }
    .ci-cap { stroke: #34414e; stroke-width: 2; }
    .mean-dot { stroke: #fff; stroke-width: 2; }
    .footnote { fill: #687683; font-size: 13px; }
    .matrix-heading { fill: #687683; font-size: 10px; font-weight: 700; letter-spacing: .35px; }
    .matrix-label { font-size: 13px; font-weight: 650; }
    .matrix-cell { fill: #e3e8eb; }
    .matrix-value { fill: #35424f; font-size: 11px; font-weight: 650; }
  </style>`;
}

function cardStart(id: ShareCard["id"], title: string, subtitle: string, summary: BenchmarkSummary): string {
  const date = new Date(summary.generatedAt).toISOString().slice(0, 10);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-labelledby="${id}-title" data-card="${id}">
    <title id="${id}-title">${escapeXml(title)}</title>
    ${commonStyles()}
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff" />
    <rect width="${WIDTH}" height="12" fill="#1b5a7a" />
    <text x="56" y="54" class="kicker">WEBGPU AOT RESEARCH / PUBLISHING FIGURE</text>
    <text x="1544" y="54" text-anchor="end" class="meta">${escapeXml(summary.configuration.profile.toUpperCase())} / ${date}</text>
    <text x="56" y="112" class="serif title">${escapeXml(title)}</text>
    <text x="56" y="148" class="subtitle">${escapeXml(subtitle)}</text>`;
}

function cardEnd(note: string): string {
  return `<line x1="56" y1="844" x2="1544" y2="844" stroke="#cfd6dc" />
    <text x="56" y="874" class="footnote">${escapeXml(note)}</text>
    <text x="1544" y="874" text-anchor="end" class="footnote">antiky-research / webgpu-aot</text>
  </svg>`;
}

function metric(key: string): MetricDefinition {
  const definition = METRICS.find((candidate) => candidate.key === key);
  if (definition === undefined) throw new Error(`Unknown publication metric: ${key}`);
  return definition;
}

function seriesColor(summary: BenchmarkSummary, demo: DemoSummary): string {
  return SERIES_COLORS[Math.max(0, summary.demos.findIndex(({ id }) => id === demo.id)) % SERIES_COLORS.length]!;
}

function metricEntries(summary: BenchmarkSummary, definition: MetricDefinition): Array<{ demo: DemoSummary; high: number; low: number; mean: number }> {
  return summary.demos.flatMap((demo) => {
    const distribution = demo.summary[definition.key];
    if (distribution === null || distribution === undefined || !Number.isFinite(distribution.mean)) return [];
    return [{
      demo,
      high: distribution.ci95High ?? distribution.max,
      low: distribution.ci95Low ?? distribution.min,
      mean: distribution.mean,
    }];
  });
}

function metricPanel(
  summary: BenchmarkSummary,
  definition: MetricDefinition,
  x: number,
  y: number,
  width: number,
  height: number,
  title = definition.shortLabel,
): string {
  const entries = metricEntries(summary, definition);
  const maximum = Math.max(1, ...entries.map(({ high, mean }) => Math.max(high, mean)));
  const labelWidth = width < 560 ? 126 : 142;
  const valueWidth = width < 560 ? 98 : 116;
  const trackX = x + 22 + labelWidth;
  const trackWidth = width - 44 - labelWidth - valueWidth;
  const firstRow = y + 110;
  const rowStep = Math.min(42, (height - 142) / Math.max(1, entries.length));
  const preference = definition.preference === "neutral" ? "DESCRIPTIVE" : `${definition.preference === "higher" ? "HIGHER" : "LOWER"} IS BETTER`;
  return `<g data-metric="${escapeXml(definition.key)}">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" class="panel" />
    <text x="${x + 22}" y="${y + 34}" class="panel-meta">${escapeXml(definition.group.toUpperCase())}</text>
    <text x="${x + width - 22}" y="${y + 34}" text-anchor="end" class="panel-meta">${preference}</text>
    <text x="${x + 22}" y="${y + 72}" class="serif panel-title">${escapeXml(title)}</text>
    ${entries.length === 0 ? `<text x="${x + 22}" y="${y + 122}" class="subtitle">No measurement recorded</text>` : entries.map(({ demo, high, low, mean }, index) => {
      const rowY = firstRow + index * rowStep;
      const color = seriesColor(summary, demo);
      const meanWidth = Math.max(2, mean / maximum * trackWidth);
      const lowX = trackX + Math.max(0, low) / maximum * trackWidth;
      const highX = trackX + Math.max(0, high) / maximum * trackWidth;
      const meanX = trackX + Math.max(0, mean) / maximum * trackWidth;
      return `<text x="${x + 22}" y="${rowY}" class="label">${escapeXml(demo.name)}</text>
        <rect x="${trackX}" y="${rowY - 14}" width="${trackWidth}" height="12" rx="2" class="track" />
        <rect x="${trackX}" y="${rowY - 14}" width="${meanWidth}" height="12" rx="2" fill="${color}" opacity=".78" />
        <line x1="${lowX}" y1="${rowY - 8}" x2="${highX}" y2="${rowY - 8}" class="ci" />
        <line x1="${lowX}" y1="${rowY - 13}" x2="${lowX}" y2="${rowY - 3}" class="ci-cap" />
        <line x1="${highX}" y1="${rowY - 13}" x2="${highX}" y2="${rowY - 3}" class="ci-cap" />
        <circle cx="${meanX}" cy="${rowY - 8}" r="5" fill="${color}" class="mean-dot" />
        <text x="${x + width - 22}" y="${rowY}" text-anchor="end" class="value">${escapeXml(definition.format(mean))}</text>`;
    }).join("")}
    <text x="${x + 22}" y="${y + height - 18}" class="footnote">Zero-based scale / bar is mean / whisker is 95% CI</text>
  </g>`;
}

interface MatrixColumn {
  key: string;
  label: string;
}

function metricMatrixPanel(
  summary: BenchmarkSummary,
  title: string,
  group: string,
  columns: MatrixColumn[],
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  const definitions = columns.map(({ key, label }) => ({ definition: metric(key), label }));
  const labelWidth = width < 560 ? 154 : 144;
  const innerWidth = width - labelWidth - 24;
  const columnWidth = innerWidth / definitions.length;
  const firstRow = y + 174;
  const rowStep = Math.min(80, (height - 220) / Math.max(1, summary.demos.length));
  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="${height}" class="panel" />
    <text x="${x + 22}" y="${y + 34}" class="panel-meta">${escapeXml(group.toUpperCase())}</text>
    <text x="${x + 22}" y="${y + 72}" class="serif panel-title">${escapeXml(title)}</text>
    <text x="${x + 22}" y="${y + 116}" class="panel-meta">RENDERER</text>
    ${definitions.map(({ definition, label }, columnIndex) => {
      const columnX = x + labelWidth + columnIndex * columnWidth;
      const entries = metricEntries(summary, definition);
      const maximum = Math.max(1, ...entries.map(({ high, mean }) => Math.max(high, mean)));
      return `<g data-metric="${escapeXml(definition.key)}">
        <text x="${columnX + columnWidth / 2}" y="${y + 116}" text-anchor="middle" class="matrix-heading">${escapeXml(label)}</text>
        ${summary.demos.map((demo, rendererIndex) => {
          const distribution = demo.summary[definition.key];
          const rowY = firstRow + rendererIndex * rowStep;
          if (distribution === null || distribution === undefined || !Number.isFinite(distribution.mean)) {
            return `<text x="${columnX + columnWidth / 2}" y="${rowY}" text-anchor="middle" class="matrix-value">—</text>`;
          }
          const color = seriesColor(summary, demo);
          const cellX = columnX + 5;
          const cellWidth = columnWidth - 10;
          const fillWidth = Math.max(2, distribution.mean / maximum * cellWidth);
          return `<rect x="${cellX}" y="${rowY - 25}" width="${cellWidth}" height="34" rx="2" class="matrix-cell" />
            <rect x="${cellX}" y="${rowY - 25}" width="${fillWidth}" height="34" rx="2" fill="${color}" opacity=".16" />
            <text x="${columnX + columnWidth / 2}" y="${rowY - 3}" text-anchor="middle" class="matrix-value">${escapeXml(definition.format(distribution.mean))}</text>`;
        }).join("")}
      </g>`;
    }).join("")}
    ${summary.demos.map((demo, rendererIndex) => {
      const rowY = firstRow + rendererIndex * rowStep;
      return `<circle cx="${x + 24}" cy="${rowY - 7}" r="5" fill="${seriesColor(summary, demo)}" />
        <text x="${x + 36}" y="${rowY - 3}" class="matrix-label">${escapeXml(demo.name)}</text>`;
    }).join("")}
  </g>`;
}

function rankingCard(summary: BenchmarkSummary): ShareCard {
  const ranking = rankedByAverageFps(summary);
  const leader = ranking[0];
  const runnerUp = ranking[1];
  const last = ranking.at(-1);
  const fpsMetric = metric("averageFps");
  const maximum = Math.max(1, ...ranking.map((demo) => demo.summary.averageFps!.ci95High ?? demo.summary.averageFps!.max));
  const headline = leader === undefined ? "Renderer ranking unavailable" : `${leader.name} leads at ${fpsMetric.format(leader.summary.averageFps!.mean)}`;
  const comparison = leader === undefined || last === undefined
    ? "No complete frame-rate ranking was recorded."
    : `${(leader.summary.averageFps!.mean / last.summary.averageFps!.mean).toFixed(1)}x the mean frame rate of ${last.name}${runnerUp === undefined ? "" : `; ${runnerUp.name} places second`}.`;
  const svg = `${cardStart("renderer-ranking", headline, comparison, summary)}
    <g>
      ${ranking.map((demo, index) => {
        const distribution = demo.summary.averageFps!;
        const rowY = 244 + index * 104;
        const trackX = 330;
        const trackWidth = 620;
        const color = seriesColor(summary, demo);
        const lowX = trackX + (distribution.ci95Low ?? distribution.min) / maximum * trackWidth;
        const highX = trackX + (distribution.ci95High ?? distribution.max) / maximum * trackWidth;
        const meanX = trackX + distribution.mean / maximum * trackWidth;
        return `<text x="64" y="${rowY}" class="serif" font-size="25">${index + 1}. ${escapeXml(demo.name)}</text>
          <rect x="${trackX}" y="${rowY - 25}" width="${trackWidth}" height="24" rx="3" class="track" />
          <rect x="${trackX}" y="${rowY - 25}" width="${distribution.mean / maximum * trackWidth}" height="24" rx="3" fill="${color}" opacity=".82" />
          <line x1="${lowX}" y1="${rowY - 13}" x2="${highX}" y2="${rowY - 13}" class="ci" />
          <line x1="${lowX}" y1="${rowY - 21}" x2="${lowX}" y2="${rowY - 5}" class="ci-cap" />
          <line x1="${highX}" y1="${rowY - 21}" x2="${highX}" y2="${rowY - 5}" class="ci-cap" />
          <circle cx="${meanX}" cy="${rowY - 13}" r="7" fill="${color}" class="mean-dot" />
          <text x="1010" y="${rowY}" text-anchor="end" class="value" font-size="18">${escapeXml(fpsMetric.format(distribution.mean))}</text>`;
      }).join("")}
    </g>
    <g aria-label="${summary.configuration.runs} independent runs; ${Math.round((summary.configuration.sampleDurationMs ?? 0) / 1_000)} s measured; ${Math.round((summary.configuration.warmupDurationMs ?? 0) / 1_000)} s warmup">
      <rect x="1070" y="202" width="474" height="514" class="panel" />
      <text x="1102" y="244" class="panel-meta">CAPTURE PROTOCOL</text>
      <text x="1102" y="300" class="serif" font-size="36">${summary.configuration.runs}</text><text x="1170" y="300" class="label">independent runs</text>
      <text x="1102" y="368" class="serif" font-size="36">${Math.round((summary.configuration.sampleDurationMs ?? 0) / 1_000)} s</text><text x="1200" y="368" class="label">measured</text>
      <text x="1102" y="436" class="serif" font-size="36">${Math.round((summary.configuration.warmupDurationMs ?? 0) / 1_000)} s</text><text x="1200" y="436" class="label">warmup</text>
      <line x1="1102" y1="478" x2="1512" y2="478" stroke="#cfd6dc" />
      <text x="1102" y="520" class="panel-meta">ISOLATION</text>
      <text x="1102" y="560" class="serif" font-size="27">Fresh Chrome</text>
      <text x="1102" y="592" class="subtitle">for every capture cell</text>
      <text x="1102" y="650" class="footnote">Counterbalanced renderer order</text>
      <text x="1102" y="676" class="footnote">Fixed heavy Sponza scene</text>
    </g>
    ${cardEnd("Mean warmed frame rate across repeated captures; whiskers show two-sided 95% confidence intervals.")}`;
  return {
    description: "The headline ranking, effect size, and capture protocol in one post-ready image.",
    fileName: "webgpu-renderer-ranking.png",
    height: HEIGHT,
    id: "renderer-ranking",
    svg,
    title: "Renderer ranking",
    width: WIDTH,
  };
}

function steadyStateCard(summary: BenchmarkSummary): ShareCard {
  const definitions = [
    metric("averageFps"),
    metric("frameTimeP95Ms"),
    metric("frameTimeStandardDeviationMs"),
    metric("frameTimeWorstMs"),
  ];
  const panelWidth = 730;
  const panelHeight = 304;
  const svg = `${cardStart(
    "steady-state-performance",
    "Steady-state performance",
    "All four warmed rendering measurements in one figure; means and 95% confidence intervals across runs.",
    summary,
  )}
    ${metricPanel(summary, definitions[0]!, 56, 178, panelWidth, panelHeight, "Average frame rate")}
    ${metricPanel(summary, definitions[1]!, 814, 178, panelWidth, panelHeight, "P95 frame time")}
    ${metricPanel(summary, definitions[2]!, 56, 506, panelWidth, panelHeight, "Frame-time variation")}
    ${metricPanel(summary, definitions[3]!, 814, 506, panelWidth, panelHeight, "Worst sampled frame")}
    ${cardEnd(`${summary.configuration.runs} independent runs per renderer / ${(summary.configuration.sampleDurationMs ?? 0) / 1_000} s measured after ${(summary.configuration.warmupDurationMs ?? 0) / 1_000} s warmup / zero-based scales.`)}`;
  return {
    description: "The complete four-panel steady-state section, composed specifically for a single 16:9 image.",
    fileName: "webgpu-steady-state-performance.png",
    height: HEIGHT,
    id: "steady-state-performance",
    svg,
    title: "All steady-state measurements",
    width: WIDTH,
  };
}

function gpuFootprintCard(summary: BenchmarkSummary): ShareCard {
  const svg = `${cardStart(
    "gpu-footprint-and-traffic",
    "GPU footprint and API traffic",
    "Three complementary diagnostics: per-frame CPU-source payload, live WebGPU allocation, and GPU-process demand.",
    summary,
  )}
    ${metricPanel(summary, metric("cpuToGpuQueueWriteBytesPerFrame"), 56, 186, 480, 620, "CPU-source writes / frame")}
    ${metricPanel(summary, metric("estimatedLiveGpuBytes"), 560, 186, 480, 620, "Live WebGPU allocation")}
    ${metricPanel(summary, metric("processGpuUtilizationPercent"), 1064, 186, 480, 620, "Chrome GPU-process busy")}
    ${cardEnd("API payload and descriptor-derived allocation are browser-visible measurements; they are not physical bus traffic or hardware occupancy.")}`;
  return {
    description: "A compact comparison of upload pressure, descriptor-derived GPU allocation, and Chrome GPU-process demand.",
    fileName: "webgpu-gpu-footprint-and-traffic.png",
    height: HEIGHT,
    id: "gpu-footprint-and-traffic",
    svg,
    title: "GPU footprint and traffic",
    width: WIDTH,
  };
}

function cpuSourceQueueWritesCard(summary: BenchmarkSummary): ShareCard {
  const brometal = summary.demos.find(({ id }) => id === "brometal");
  const threejs = summary.demos.find(({ id }) => id === "threejs");
  const brometalCalls = brometal?.summary.cpuToGpuQueueWriteCallsPerFrame?.mean;
  const threejsCalls = threejs?.summary.cpuToGpuQueueWriteCallsPerFrame?.mean;
  const brometalPayload = brometal?.summary.cpuToGpuQueueWriteBytesPerFrame?.mean;
  const threejsPayload = threejs?.summary.cpuToGpuQueueWriteBytesPerFrame?.mean;
  const comparison = brometalCalls !== undefined && threejsCalls !== undefined && brometalCalls > 0
    && brometalPayload !== undefined && threejsPayload !== undefined && brometalPayload > 0
    ? `${(threejsCalls / brometalCalls).toFixed(1)}x BroMetal's call frequency and ${(threejsPayload / brometalPayload).toFixed(1)}x its known per-frame payload in Three.js.`
    : "Call frequency and known API payload measured independently at the browser boundary.";
  const svg = `${cardStart(
    "cpu-source-queue-writes",
    "CPU-source queue writes per frame",
    comparison,
    summary,
  )}
    ${metricPanel(summary, metric("cpuToGpuQueueWriteCallsPerFrame"), 56, 186, 730, 620, "Queue-write calls / frame")}
    ${metricPanel(summary, metric("cpuToGpuQueueWriteBytesPerFrame"), 814, 186, 730, 620, "Known queue-write payload / frame")}
    ${cardEnd("Queue writes are CPU-source API uploads, not GPU-to-CPU returns or proof of physical bus traffic; full report retains run-level samples.")}`;
  return {
    description: "A focused calls-and-payload comparison of confirmed CPU-source WebGPU queue writes.",
    fileName: "webgpu-cpu-source-queue-writes.png",
    height: HEIGHT,
    id: "cpu-source-queue-writes",
    svg,
    title: "CPU-source queue writes",
    width: WIDTH,
  };
}

function resourceSystemDiagnosticsCard(summary: BenchmarkSummary): ShareCard {
  const resourceColumns: MatrixColumn[] = [
    { key: "estimatedLiveGpuBytes", label: "Total" },
    { key: "liveTextureBytes", label: "Textures" },
    { key: "liveBufferBytes", label: "Buffers" },
    { key: "liveTextureCount", label: "Texture #" },
    { key: "liveBufferCount", label: "Buffer #" },
    { key: "texturesWithUnknownSize", label: "Unknown #" },
    { key: "gpuQueueDrainMs", label: "Queue drain" },
  ];
  const systemColumns: MatrixColumn[] = [
    { key: "systemGpuDeviceUtilizationPercent", label: "Device" },
    { key: "processGpuUtilizationPercent", label: "Chrome busy" },
    { key: "systemGpuRendererUtilizationPercent", label: "Renderer" },
    { key: "systemGpuTilerUtilizationPercent", label: "Tiler" },
    { key: "systemGpuInUseMemoryBytes", label: "In-use mem" },
    { key: "systemGpuAllocatedMemoryBytes", label: "Allocated" },
  ];
  const svg = `${cardStart(
    "resource-system-diagnostics",
    "Resource and system diagnostics",
    "Application-owned WebGPU resources beside Chrome-process and system-wide GPU measurements.",
    summary,
  )}
    ${metricMatrixPanel(summary, "WebGPU resource accounting", "Application scope", resourceColumns, 56, 186, 730, 620)}
    ${metricMatrixPanel(summary, "GPU utilization and memory", "System diagnostics", systemColumns, 814, 186, 730, 620)}
    ${cardEnd("Application allocation is descriptor-derived; Chrome-process and system-wide counters have different scopes and must not be summed.")}`;
  return {
    description: "Every resource-allocation and system-GPU dimension from the report in one renderer-by-metric figure.",
    fileName: "webgpu-resource-system-diagnostics.png",
    height: HEIGHT,
    id: "resource-system-diagnostics",
    svg,
    title: "Resource and system diagnostics",
    width: WIDTH,
  };
}

function coldStartAndArtifactsCard(summary: BenchmarkSummary): ShareCard {
  const svg = `${cardStart(
    "cold-start-and-artifacts",
    "Cold start and shipped artifacts",
    "Fresh-process startup, production build output, and GPU preparation remain separate and visible.",
    summary,
  )}
    ${metricMatrixPanel(summary, "Cold startup", "Fresh Chrome", [
      { key: "startupTimeMs", label: "Ready" },
      { key: "firstRenderedFrameMs", label: "First frame" },
      { key: "assetsReadyMs", label: "Assets" },
    ], 56, 186, 480, 620)}
    ${metricMatrixPanel(summary, "Production build", "Shipped artifact", [
      { key: "buildTimeMs", label: "Build" },
      { key: "bundleBytes", label: "Bundle" },
      { key: "bundleGzipBytes", label: "Gzip" },
    ], 560, 186, 480, 620)}
    ${metricMatrixPanel(summary, "GPU preparation", "Fresh process", [
      { key: "shaderPreparationMs", label: "Shaders" },
      { key: "pipelineCreationMs", label: "Pipelines" },
    ], 1064, 186, 480, 620)}
    ${cardEnd("Cells show means across fresh-process runs; production artifact measurements are separate from warmed rendering performance.")}`;
  return {
    description: "All cold-start, production-build, bundle, shader, and pipeline measurements in one compact figure.",
    fileName: "webgpu-cold-start-and-artifacts.png",
    height: HEIGHT,
    id: "cold-start-and-artifacts",
    svg,
    title: "Cold start and shipped artifacts",
    width: WIDTH,
  };
}

export function buildShareCards(summary: BenchmarkSummary): ShareCard[] {
  return [
    rankingCard(summary),
    steadyStateCard(summary),
    gpuFootprintCard(summary),
    cpuSourceQueueWritesCard(summary),
    resourceSystemDiagnosticsCard(summary),
    coldStartAndArtifactsCard(summary),
  ];
}
