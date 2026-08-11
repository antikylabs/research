import "./style.css";

import {
  availableControlledMetrics,
  controlledFrameTimeBins,
  controlledReportUrl,
  formatControlledValue,
  nullControlStatus,
  type ControlledImplementation,
  type ControlledMetric,
  type ControlledSummary,
  type Distribution,
} from "./model.js";

const COLORS = ["#0072b2", "#d55e00", "#009e73", "#cc79a7", "#e69f00"];

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function distributionFor(
  implementation: ControlledImplementation,
  key: string,
): Distribution | null {
  return implementation.summary[key] ?? null;
}

function distributionChart(
  summary: ControlledSummary,
  metric: ControlledMetric,
): string {
  const groups = summary.implementations.flatMap((implementation, index) => {
    const distribution = distributionFor(implementation, metric.key);
    return distribution === null ? [] : [{ distribution, implementation, index }];
  });
  if (groups.length === 0) return "";
  const candidates = groups.flatMap(({ distribution, implementation }) => [
    distribution.ci95Low ?? distribution.min,
    distribution.ci95High ?? distribution.max,
    ...implementation.samples[metric.key] ?? [],
  ]);
  const minimum = Math.min(...candidates);
  const maximum = Math.max(...candidates);
  const padding = Math.max(
    (maximum - minimum) * 0.12,
    Math.abs(maximum) * 0.02,
    0.01,
  );
  const low = minimum - padding;
  const high = maximum + padding;
  const width = 880;
  const height = 260;
  const top = 24;
  const bottom = 60;
  const plotHeight = height - top - bottom;
  const y = (value: number) =>
    top + (high - value) / (high - low) * plotHeight;
  const step = width / groups.length;
  const marks = groups.map(({ distribution, implementation, index }) => {
    const x = step * (index + 0.5);
    const ciLow = distribution.ci95Low ?? distribution.mean;
    const ciHigh = distribution.ci95High ?? distribution.mean;
    const samples = implementation.samples[metric.key] ?? [];
    const dots = samples.map((value, runIndex) => {
      const jitter = ((runIndex * 17) % 11 - 5) * 2.2;
      return `<circle cx="${x + jitter}" cy="${y(value)}" r="3.8" class="sample" />`;
    }).join("");
    return `${dots}
      <line x1="${x}" y1="${y(ciHigh)}" x2="${x}" y2="${y(ciLow)}" class="interval" />
      <line x1="${x - 8}" y1="${y(ciHigh)}" x2="${x + 8}" y2="${y(ciHigh)}" class="interval" />
      <line x1="${x - 8}" y1="${y(ciLow)}" x2="${x + 8}" y2="${y(ciLow)}" class="interval" />
      <circle cx="${x}" cy="${y(distribution.mean)}" r="6" fill="${COLORS[index % COLORS.length]}" class="mean" />
      <text x="${x}" y="${height - 27}" text-anchor="middle">${escapeHtml(implementation.name)}</text>`;
  }).join("");
  return `<article class="chart-card">
    <div class="chart-heading"><div><h3>${escapeHtml(metric.label)}</h3><p>${escapeHtml(metric.description)}</p></div><span>dots = runs · bar = 95% CI · center = mean</span></div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(metric.label)} distribution">
      <line x1="0" y1="${y(low)}" x2="${width}" y2="${y(low)}" class="axis" />
      <text x="8" y="${top + 2}" class="axis-label">${escapeHtml(formatControlledValue(metric.key, high))}</text>
      <text x="8" y="${height - bottom - 7}" class="axis-label">${escapeHtml(formatControlledValue(metric.key, low))}</text>
      ${marks}
    </svg>
  </article>`;
}

function timeSeriesChart(summary: ControlledSummary): string {
  const width = 880;
  const height = 300;
  const left = 52;
  const right = 16;
  const top = 20;
  const bottom = 44;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const series = summary.implementations.map((implementation) => ({
    implementation,
    points: controlledFrameTimeBins(
      implementation,
      summary.configuration.sampleDurationMs,
      80,
    ),
  }));
  const values = series.flatMap(({ points }) =>
    points.map(({ frameTimeMs }) => frameTimeMs)
  ).sort((first, second) => first - second);
  const ceiling = Math.max(
    1,
    values[Math.min(values.length - 1, Math.ceil(values.length * 0.99) - 1)] ?? 1,
  );
  const x = (fraction: number) => left + fraction * plotWidth;
  const y = (value: number) =>
    top + (1 - Math.min(value, ceiling) / ceiling) * plotHeight;
  const lines = series.map(({ points }, index) => {
    const path = points.map(({ elapsedFraction, frameTimeMs }, pointIndex) =>
      `${pointIndex === 0 ? "M" : "L"}${x(elapsedFraction).toFixed(1)},${y(frameTimeMs).toFixed(1)}`
    ).join(" ");
    return `<path d="${path}" fill="none" stroke="${COLORS[index % COLORS.length]}" stroke-width="2" />`;
  }).join("");
  const legend = series.map(({ implementation }, index) =>
    `<span><i style="background:${COLORS[index % COLORS.length]}"></i>${escapeHtml(implementation.name)}</span>`
  ).join("");
  return `<article class="chart-card timeline-card">
    <div class="chart-heading"><div><h3>Frame-time direction across capture</h3><p>Median frame interval in elapsed-time bins, pooled across runs. The y-axis clips at the pooled 99th percentile so isolated stalls do not flatten the trace.</p></div><span>elapsed capture time →</span></div>
    <div class="legend">${legend}</div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Frame time over normalized capture duration">
      <line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" class="axis" />
      <line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" class="axis" />
      <text x="${left - 8}" y="${top + 4}" text-anchor="end" class="axis-label">${ceiling.toFixed(1)} ms</text>
      <text x="${left - 8}" y="${top + plotHeight + 4}" text-anchor="end" class="axis-label">0 ms</text>
      <text x="${left}" y="${height - 13}" class="axis-label">0 s</text>
      <text x="${left + plotWidth}" y="${height - 13}" text-anchor="end" class="axis-label">${summary.configuration.sampleDurationMs / 1000} s</text>
      ${lines}
    </svg>
    <p class="method-note"><strong>Why this is not stacked:</strong> frame times from separate runs are independent measurements; adding their vertical values has no physical meaning. Overlaying aligned traces reveals drift, thermal direction, and order effects without implying a cumulative quantity.</p>
  </article>`;
}

function metricsTable(
  summary: ControlledSummary,
  metrics: ControlledMetric[],
): string {
  return `<div class="table-scroll"><table>
    <thead><tr><th>Measurement</th>${summary.implementations.map(({ name }) => `<th>${escapeHtml(name)}</th>`).join("")}</tr></thead>
    <tbody>${metrics.map((metric) => `<tr>
      <th><span>${escapeHtml(metric.label)}</span><small>${escapeHtml(metric.description)}</small></th>
      ${summary.implementations.map((implementation) => {
        const value = distributionFor(implementation, metric.key);
        if (value === null) return "<td>—</td>";
        const interval = value.ci95Low === undefined || value.ci95High === undefined
          ? ""
          : `<small>95% CI ${escapeHtml(formatControlledValue(metric.key, value.ci95Low))}–${escapeHtml(formatControlledValue(metric.key, value.ci95High))}</small>`;
        return `<td><strong>${escapeHtml(formatControlledValue(metric.key, value.mean))}</strong>${interval}</td>`;
      }).join("")}
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function render(summary: ControlledSummary): void {
  const root = document.querySelector<HTMLElement>("#app");
  if (root === null) throw new Error("Report root is missing");
  const status = nullControlStatus(summary);
  const metrics = availableControlledMetrics(summary);
  const chartMetrics = metrics.filter(({ key }) =>
    [
      "averageFps",
      "frameTimeP95Ms",
      "processGpuUtilizationPercent",
      "cpuToGpuQueueWriteBytesPerFrame",
    ].includes(key)
  );
  const metricGroups = [...new Set(metrics.map(({ group }) => group))];
  const shaderHashes = summary.implementations.map(({ name, evidence }) => {
    const artifact = evidence.artifact as { shaderHash?: string } | undefined;
    return `<li><span>${escapeHtml(name)}</span><code>${escapeHtml(artifact?.shaderHash ?? "unavailable")}</code></li>`;
  }).join("");
  const dimensions = summary.nullControl.dimensions.map((dimension) =>
    `<tr><th>${escapeHtml(dimension.key)}</th><td>${dimension.expected}</td><td><span class="gate ${dimension.status}">${dimension.status}</span></td></tr>`
  ).join("");
  root.innerHTML = `
    <header class="hero">
      <p class="eyebrow">Controlled companion experiment</p>
      <h1>Byte-identical WebGPU null baseline</h1>
      <p class="lede">This report measures the noise floor of the benchmark machinery. Five labels execute one shared production bundle, the same SHA-256-checked WGSL bytes, and the same two-pass command graph.</p>
      <p><a href="${import.meta.env.BASE_URL}architecture.html">Open the real raw WebGPU vs Three.js architecture control</a></p>
      <div class="gate-summary ${status.tone}"><span>${escapeHtml(status.label)}</span><strong>${summary.nullControl.artifactHashMatched ? "Identical shader hash" : "Shader hash mismatch"}</strong><p>${escapeHtml(summary.nullControl.verdict)}</p></div>
    </header>

    <section class="warning" aria-label="Causal scope">
      <strong>No authoring-system causal claim</strong>
      <p>${escapeHtml(summary.experiment.scope)} The labels are experimental cells, not four independently generated artifacts. This suite is intentionally additive; the representative demos and architectural benchmark remain unchanged.</p>
    </section>

    <section>
      <div class="section-heading"><div><p class="eyebrow">Validity gate</p><h2>Artifact and frame-graph equivalence</h2></div><p>A capture is rejected before aggregation if its label, experiment id, shader hash, or command counts violate the pinned contract.</p></div>
      <div class="validity-grid">
        <article class="panel"><h3>Exact shader artifact</h3><ul class="hashes">${shaderHashes}</ul></article>
        <article class="panel"><h3>Per-frame command contract</h3><div class="table-scroll"><table><thead><tr><th>Counter</th><th>Expected</th><th>Gate</th></tr></thead><tbody>${dimensions}</tbody></table></div></article>
      </div>
    </section>

    <section>
      <div class="section-heading"><div><p class="eyebrow">Distributions</p><h2>Run-level evidence, not decorative rankings</h2></div><p>Every point is retained. Means are paired with Student-t 95% confidence intervals; no “winner” badge is calculated for a null control.</p></div>
      <div class="charts">${chartMetrics.map((metric) => distributionChart(summary, metric)).join("")}</div>
      ${timeSeriesChart(summary)}
    </section>

    <section>
      <div class="section-heading"><div><p class="eyebrow">Measured dimensions</p><h2>Timing, traffic, allocation, and commands</h2></div><p>CPU↔GPU values are logical API-observed volume. They are not hardware-bus counters, and GPU-internal copies are kept separate.</p></div>
      ${metricGroups.map((group) => `<article class="metric-group"><h3>${escapeHtml(group)}</h3>${metricsTable(summary, metrics.filter((metric) => metric.group === group))}</article>`).join("")}
    </section>

    <section class="methodology">
      <div class="section-heading"><div><p class="eyebrow">Protocol</p><h2>What was controlled</h2></div></div>
      <dl>
        <div><dt>Capture</dt><dd>${summary.configuration.runs} runs per label · ${summary.configuration.warmupDurationMs / 1000} s warmup · ${summary.configuration.sampleDurationMs / 1000} s fixed sample</dd></div>
        <div><dt>Order</dt><dd>Counterbalanced rotation; with ${summary.configuration.runs} runs across ${summary.implementations.length} labels, each label occupies every order position ${summary.configuration.runs / summary.implementations.length} times.</dd></div>
        <div><dt>Cache isolation</dt><dd>Fresh Chrome process per cell, unique URL, HTTP cache disabled, no-store server, persistent GPU shader disk cache disabled.</dd></div>
        <div><dt>Environment</dt><dd>${escapeHtml(summary.environment.platform)} · ${summary.environment.arch} · ${summary.environment.cpus} logical CPUs · ${escapeHtml(summary.environment.node)}</dd></div>
        <div><dt>Generated</dt><dd>${escapeHtml(new Date(summary.generatedAt).toLocaleString())}</dd></div>
      </dl>
      <p class="method-note">Limits: browser animation cadence is not direct GPU timestamp-query time; descriptor allocation is not physical VRAM residency; macOS utilization and memory counters may be system-wide; API instrumentation does not observe driver-internal transfers or unified-memory cache traffic. Those limits are part of the claim boundary, not footnotes to ignore.</p>
    </section>`;
}

async function main(): Promise<void> {
  const response = await fetch(controlledReportUrl(import.meta.env.BASE_URL, "results"), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `Unable to load controlled benchmark results (${response.status})`,
    );
  }
  render(await response.json() as ControlledSummary);
}

main().catch((error: unknown) => {
  const root = document.querySelector<HTMLElement>("#app");
  if (root !== null) {
    const message = error instanceof Error ? error.message : String(error);
    root.innerHTML = `<div class="error"><h1>Controlled report unavailable</h1><p>${escapeHtml(message)}</p><code>npm run benchmark --workspace benchmark-controlled</code></div>`;
  }
});
