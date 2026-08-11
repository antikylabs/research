import "./style.css";

import {
  architectureControlStatus,
  availableControlledMetrics,
  controlledFrameTimeBins,
  controlledReportUrl,
  formatControlledValue,
  type ArchitectureSummary,
  type ControlledImplementation,
  type ControlledMetric,
} from "./model.js";

const COLORS = ["#0072b2", "#d55e00"];

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function measurementCell(
  implementation: ControlledImplementation,
  metric: ControlledMetric,
): string {
  const distribution = implementation.summary[metric.key];
  if (distribution === undefined || distribution === null) return "<td>—</td>";
  const interval = distribution.ci95Low === undefined || distribution.ci95High === undefined
    ? ""
    : `<small>95% CI ${escapeHtml(formatControlledValue(metric.key, distribution.ci95Low))}–${escapeHtml(formatControlledValue(metric.key, distribution.ci95High))}</small>`;
  const points = (implementation.samples[metric.key] ?? [])
    .map((value) => formatControlledValue(metric.key, value))
    .join(" · ");
  return `<td><strong>${escapeHtml(formatControlledValue(metric.key, distribution.mean))}</strong>${interval}<small>runs: ${escapeHtml(points)}</small></td>`;
}

function metricsTable(
  summary: ArchitectureSummary,
  metrics: ControlledMetric[],
): string {
  return `<div class="table-scroll"><table>
    <thead><tr><th>Measurement</th>${summary.implementations.map(({ name }) => `<th>${escapeHtml(name)}</th>`).join("")}</tr></thead>
    <tbody>${metrics.map((metric) => `<tr><th><span>${escapeHtml(metric.label)}</span><small>${escapeHtml(metric.description)}</small></th>${summary.implementations.map((implementation) => measurementCell(implementation, metric)).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

function frameDirection(summary: ArchitectureSummary): string {
  const width = 880;
  const height = 260;
  const left = 48;
  const top = 18;
  const plotWidth = 816;
  const plotHeight = 192;
  const series = summary.implementations.map((implementation) => ({
    implementation,
    points: controlledFrameTimeBins(
      implementation,
      summary.configuration.sampleDurationMs,
      80,
    ),
  }));
  const values = series.flatMap(({ points }) => points.map(({ frameTimeMs }) => frameTimeMs)).sort((a, b) => a - b);
  const ceiling = Math.max(1, values[Math.min(values.length - 1, Math.ceil(values.length * .99) - 1)] ?? 1);
  const paths = series.map(({ points }, index) => {
    const d = points.map(({ elapsedFraction, frameTimeMs }, point) => {
      const x = left + elapsedFraction * plotWidth;
      const y = top + (1 - Math.min(frameTimeMs, ceiling) / ceiling) * plotHeight;
      return `${point === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return `<path d="${d}" fill="none" stroke="${COLORS[index]}" stroke-width="2" />`;
  }).join("");
  return `<article class="chart-card timeline-card"><div class="chart-heading"><div><h3>Frame-time direction</h3><p>Median elapsed-time bins across runs, clipped at the pooled 99th percentile. Independent renderer traces are overlaid, never stacked.</p></div></div><div class="legend">${series.map(({ implementation }, index) => `<span><i style="background:${COLORS[index]}"></i>${escapeHtml(implementation.name)}</span>`).join("")}</div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Architecture-control frame time over capture"><line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" class="axis"/><line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" class="axis"/><text x="${left - 8}" y="${top + 4}" text-anchor="end">${ceiling.toFixed(1)} ms</text><text x="${left}" y="${height - 12}">0 s</text><text x="${left + plotWidth}" y="${height - 12}" text-anchor="end">${summary.configuration.sampleDurationMs / 1000} s</text>${paths}</svg></article>`;
}

function render(summary: ArchitectureSummary): void {
  const root = document.querySelector<HTMLElement>("#app");
  if (root === null) throw new Error("Report root is missing");
  const status = architectureControlStatus(summary);
  const metrics = availableControlledMetrics(summary);
  const groups = [...new Set(metrics.map(({ group }) => group))];
  const dimensions = summary.architectureControl.dimensions.map(({ key, entries, status: gate }) =>
    `<tr><th>${escapeHtml(key)}</th>${entries.map(({ value }) => `<td>${escapeHtml(value)}</td>`).join("")}<td><span class="gate ${gate}">${escapeHtml(gate)}</span></td></tr>`
  ).join("");
  root.innerHTML = `
    <header class="hero">
      <p class="eyebrow">Controlled renderer architecture arm</p>
      <h1>Raw WebGPU vs Three.js</h1>
      <p class="lede">Both constructions execute the same static full-screen 32-light GGX task and ACES stage at the same resolution. Three.js genuinely runs through <code>WebGPURenderer</code>; its command topology and API-visible data movement are outcomes.</p>
      <p><a href="${import.meta.env.BASE_URL}">Open the byte-identical five-label null baseline</a></p>
      <div class="gate-summary ${status.tone}"><span>${escapeHtml(status.label)}</span><strong>${summary.architectureControl.rendererArchitectureClaimSupported ? "Narrow architecture comparison enabled" : "Do not attribute differences"}</strong><p>${escapeHtml(summary.architectureControl.verdict)}</p></div>
    </header>
    <section class="warning"><strong>Claim boundary</strong><p>This can compare the baseline orchestration of these raw-WebGPU and Three.js renderer constructions on a static controlled task. It does not exercise a dynamic scene graph, cannot establish that BroMetal as an authoring system is intrinsically superior, and the wrappers are not byte-identical shaders. Queue payloads remain API observations, not physical unified-memory traffic.</p></section>
    <section><div class="section-heading"><div><p class="eyebrow">Task gate</p><h2>Matched inputs; topology is measured</h2></div><p>Unlike the null baseline, command counts are intentionally not forced equal: framework orchestration is the independent variable.</p></div><article class="panel"><div class="table-scroll"><table><thead><tr><th>Dimension</th>${summary.implementations.map(({ name }) => `<th>${escapeHtml(name)}</th>`).join("")}<th>Gate</th></tr></thead><tbody>${dimensions}</tbody></table></div></article></section>
    <section><div class="section-heading"><div><p class="eyebrow">Direction and variation</p><h2>Capture behavior over time</h2></div><p>Raw samples and small-sample confidence intervals remain available below.</p></div>${frameDirection(summary)}</section>
    <section><div class="section-heading"><div><p class="eyebrow">Evidence</p><h2>Timing, traffic, allocation, and command graph</h2></div><p>Call counts and known logical bytes are shown independently. Unknown-byte operations are not silently treated as zero volume.</p></div>${groups.map((group) => `<article class="metric-group"><h3>${escapeHtml(group)}</h3>${metricsTable(summary, metrics.filter((metric) => metric.group === group))}</article>`).join("")}</section>
    <section class="methodology"><div class="section-heading"><div><p class="eyebrow">Protocol</p><h2>Controlled and isolated</h2></div></div><dl><div><dt>Capture</dt><dd>${summary.configuration.runs} runs each · ${summary.configuration.warmupDurationMs / 1000} s warmup · ${summary.configuration.sampleDurationMs / 1000} s fixed sample</dd></div><div><dt>Order</dt><dd>Counterbalanced rotation between raw WebGPU and Three.js.</dd></div><div><dt>Isolation</dt><dd>Fresh Chrome process, unique URL, HTTP cache disabled, no-store server, persistent GPU shader disk cache disabled.</dd></div><div><dt>Environment</dt><dd>${escapeHtml(summary.environment.platform)} · ${escapeHtml(summary.environment.arch)} · ${summary.environment.cpus} logical CPUs</dd></div></dl><p class="method-note">Limits: application CPU encoding time is not total process CPU utilization; queue drain is not pass-level GPU time; descriptor bytes are not physical VRAM; WebGPU instrumentation cannot observe driver staging, page migration, or cache traffic.</p></section>`;
}

async function main(): Promise<void> {
  const response = await fetch(controlledReportUrl(import.meta.env.BASE_URL, "architecture-results"), {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Unable to load architecture results (${response.status})`);
  render(await response.json() as ArchitectureSummary);
}

main().catch((error: unknown) => {
  const root = document.querySelector<HTMLElement>("#app");
  if (root !== null) {
    const message = error instanceof Error ? error.message : String(error);
    root.innerHTML = `<div class="error"><h1>Architecture report unavailable</h1><p>${escapeHtml(message)}</p><code>npm run benchmark:architecture --workspace benchmark-controlled</code></div>`;
  }
});
