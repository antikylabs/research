import "./style.css";

import { buildShareCards, SERIES_COLORS, shareCardIdFromSearch, type ShareCard } from "./export-cards.js";
import { downloadShareCardPng } from "./export-image.js";
import { LIBRARY_PAYLOADS } from "./generated/library-payloads.js";
import { METRICS, adapterLabel, availableMetrics, bytes, frameTimeBins, hasDataMovementEvidence, metricPageSizes, processGpuBusyBins, rankedByAverageFps, relativeWidth, summaryUrl, type BenchmarkSummary, type DemoSummary, type Distribution, type MetricDefinition } from "./model.js";
import { buildLibraryFootprintRows, buildRendererSnapshots, type LibraryPayload } from "./research-context.js";

const app = document.querySelector<HTMLElement>("#app");
if (app === null) throw new Error("Benchmark application root is missing");

const colors = SERIES_COLORS;

function escape(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

function preference(metric: MetricDefinition): string {
  if (metric.preference === "neutral") return "Diagnostic — no winner";
  return `${metric.preference === "lower" ? "Lower" : "Higher"} is better`;
}

function distributionChart(summary: BenchmarkSummary, metric: MetricDefinition): string {
  const entries = summary.demos.flatMap((demo) => {
    const distribution = demo.summary[metric.key];
    return distribution === null || distribution === undefined ? [] : [{ demo, distribution }];
  });
  const values = entries.flatMap(({ demo, distribution }) => [
    distribution.ci95High ?? distribution.max,
    distribution.max,
    ...(demo.samples?.[metric.key] ?? []),
  ]);
  return `<article class="chart">
    <header><div><p>${escape(metric.group)}</p><h3>${escape(metric.label)}</h3></div><span>${preference(metric)}</span></header>
    <div class="distributions">${entries.map(({ demo, distribution }, index) => {
      const samples = demo.samples?.[metric.key] ?? [distribution.mean];
      const low = distribution.ci95Low ?? distribution.min;
      const high = distribution.ci95High ?? distribution.max;
      return `<div class="distribution-row" style="--series:${colors[index % colors.length]}">
        <div class="distribution-label"><strong>${escape(demo.name)}</strong><span>${metric.format(distribution.mean)}</span></div>
        <div class="distribution-track" aria-label="${escape(demo.name)} mean ${escape(metric.format(distribution.mean))}">
          <i class="sample-range" style="left:${relativeWidth(distribution.min, values)}%;width:${Math.max(0, relativeWidth(distribution.max, values) - relativeWidth(distribution.min, values))}%"></i>
          <i class="confidence" style="left:${relativeWidth(Math.max(0, low), values)}%;width:${Math.max(0, relativeWidth(high, values) - relativeWidth(Math.max(0, low), values))}%"></i>
          ${samples.map((sample) => `<i class="sample" style="left:${relativeWidth(sample, values)}%"></i>`).join("")}
          <i class="mean" style="left:${relativeWidth(distribution.mean, values)}%"></i>
        </div>
        <small>95% CI ${metric.format(low)}–${metric.format(high)} · n=${distribution.count}</small>
      </div>`;
    }).join("")}</div>
    <div class="chart-key"><span><i class="dot"></i>run mean</span><span><i class="ci"></i>95% CI</span><span><i class="mean-key"></i>mean</span><span>zero-based axis</span></div>
  </article>`;
}

function frameTimeline(summary: BenchmarkSummary): string {
  const duration = summary.configuration.sampleDurationMs ?? 10_000;
  const series = summary.demos.map((demo) => ({ demo, points: frameTimeBins(demo, duration) })).filter(({ points }) => points.length > 1);
  if (series.length === 0) return `<article class="wide-chart unavailable"><p class="eyebrow">Frame pacing over time</p><h2>No raw frame series in this result</h2><p>Run the schema 2 benchmark to preserve every frame interval and render the warmed capture timeline.</p></article>`;
  const maximum = Math.max(50, ...series.flatMap(({ points }) => points.map(({ frameTimeMs }) => frameTimeMs)));
  const yMaximum = Math.ceil(maximum / 10) * 10;
  const width = 1_000;
  const height = 300;
  const top = 18;
  const bottom = 36;
  const plotHeight = height - top - bottom;
  const y = (value: number) => top + plotHeight - Math.min(1, value / yMaximum) * plotHeight;
  const guideValues = [16.67, 33.33, 50].filter((value) => value <= yMaximum);
  return `<article class="wide-chart">
    <header><div><p class="eyebrow">Frame pacing over time</p><h2>Median frame time by elapsed capture time</h2></div><span>All repetitions · ${Math.round(duration / 1_000)} s fixed window</span></header>
    <svg class="timeline" viewBox="0 0 ${width} ${height}" role="img" aria-label="Frame-time timeline">
      ${guideValues.map((value) => `<line class="guide" x1="0" x2="${width}" y1="${y(value)}" y2="${y(value)}"></line><text x="4" y="${y(value) - 5}">${value.toFixed(value % 1 === 0 ? 0 : 1)} ms</text>`).join("")}
      ${series.map(({ points }, index) => `<polyline style="--series:${colors[index % colors.length]}" points="${points.map(({ elapsedFraction, frameTimeMs }) => `${elapsedFraction * width},${y(frameTimeMs)}`).join(" ")}" />`).join("")}
      <text x="0" y="${height - 5}">0 s</text><text text-anchor="end" x="${width}" y="${height - 5}">${Math.round(duration / 1_000)} s</text>
    </svg>
    <div class="legend">${series.map(({ demo }, index) => `<span style="--series:${colors[index % colors.length]}"><i></i>${escape(demo.name)}</span>`).join("")}</div>
    <p class="caption">Each point is the median of frame intervals landing in the same elapsed-time bin across repetitions. Tail behavior remains visible in P95 and worst-frame distributions; raw intervals remain in <code>raw.json</code>.</p>
  </article>`;
}

function gpuUtilizationTimeline(summary: BenchmarkSummary): string {
  const duration = summary.configuration.sampleDurationMs ?? 10_000;
  const series = summary.demos.map((demo) => ({ demo, points: processGpuBusyBins(demo, duration) })).filter(({ points }) => points.length > 1);
  if (series.length === 0) return "";
  const maximum = Math.max(100, ...series.flatMap(({ points }) => points.map(({ utilizationPercent }) => utilizationPercent)));
  const yMaximum = Math.ceil(maximum / 25) * 25;
  const width = 1_000;
  const height = 300;
  const top = 18;
  const bottom = 36;
  const plotHeight = height - top - bottom;
  const y = (value: number) => top + plotHeight - Math.min(1, value / yMaximum) * plotHeight;
  const guides = [25, 50, 75, 100].filter((value) => value <= yMaximum);
  return `<article class="wide-chart">
    <header><div><p class="eyebrow">GPU demand over time</p><h2>Chrome GPU-process busy intervals</h2></div><span>Driver-accounted · median by elapsed-time bin</span></header>
    <svg class="timeline" viewBox="0 0 ${width} ${height}" role="img" aria-label="Chrome GPU-process busy percentage timeline">
      ${guides.map((value) => `<line class="guide" x1="0" x2="${width}" y1="${y(value)}" y2="${y(value)}"></line><text x="4" y="${y(value) - 5}">${value}%</text>`).join("")}
      ${series.map(({ points }, index) => `<polyline style="--series:${colors[index % colors.length]}" points="${points.map(({ elapsedFraction, utilizationPercent }) => `${elapsedFraction * width},${y(utilizationPercent)}`).join(" ")}" />`).join("")}
      <text x="0" y="${height - 5}">0 s</text><text text-anchor="end" x="${width}" y="${height - 5}">${Math.round(duration / 1_000)} s</text>
    </svg>
    <div class="legend">${series.map(({ demo }, index) => `<span style="--series:${colors[index % colors.length]}"><i></i>${escape(demo.name)}</span>`).join("")}</div>
    <p class="caption">This directional view derives interval utilization from the Chrome GPU process’s cumulative driver time. It is overlaid—not stacked—because renderer series are independent captures and do not form an additive total. It is a demand diagnostic, not portable shader-core occupancy.</p>
  </article>`;
}

function resourceStack(summary: BenchmarkSummary): string {
  const entries = summary.demos.flatMap((demo) => {
    const buffers = demo.summary.liveBufferBytes?.mean;
    const textures = demo.summary.liveTextureBytes?.mean;
    return buffers === undefined || textures === undefined ? [] : [{ buffers, demo, textures, total: buffers + textures }];
  });
  if (entries.length === 0) return "";
  const maximum = Math.max(...entries.map(({ total }) => total));
  return `<article class="wide-chart resource-chart">
    <header><div><p class="eyebrow">Additive composition</p><h2>Estimated live WebGPU resources</h2></div><span>Descriptor bytes, not physical residency</span></header>
    <div class="resource-bars">${entries.map(({ buffers, demo, textures, total }) => `<div class="resource-row">
      <div><strong>${escape(demo.name)}</strong><span>${bytes(total)}</span></div>
      <div class="resource-track" style="width:${total / maximum * 100}%"><i class="textures" style="width:${textures / total * 100}%"></i><i class="buffers" style="width:${buffers / total * 100}%"></i></div>
    </div>`).join("")}</div>
    <div class="chart-key"><span><i class="texture-key"></i>textures</span><span><i class="buffer-key"></i>buffers</span></div>
    <p class="caption">This is the one stacked view: buffer and texture bytes are additive. Frame times and utilization are overlaid or shown independently because stacking them would imply a false total.</p>
  </article>`;
}

function executionEnvironment(summary: BenchmarkSummary): string {
  const demo = summary.demos.find(({ evidence }) => evidence?.adapter !== undefined) ?? summary.demos[0];
  const evidence = demo?.evidence as {
    adapter?: { features?: string[]; info?: Record<string, string | number>; limits?: Record<string, number> } | null;
    userAgent?: string;
  } | undefined;
  const adapter = evidence?.adapter;
  const info = adapter?.info ?? {};
  const limits = adapter?.limits ?? {};
  const adapterName = adapterLabel(info);
  return `<section class="environment-section"><div><p class="eyebrow">Reproducibility record</p><h2>Execution environment</h2><p>Hardware identity and browser-exposed WebGPU capabilities are captured with every isolated run. Full adapter features and limits remain in the raw result.</p></div><dl>
    <div><dt>WebGPU adapter</dt><dd>${adapterName.length === 0 ? "Unavailable or browser-redacted" : escape(adapterName)}</dd></div>
    <div><dt>Adapter features</dt><dd>${adapter?.features === undefined ? "Unavailable" : `${adapter.features.length} exposed`}</dd></div>
    <div><dt>Max 2D texture</dt><dd>${limits.maxTextureDimension2D === undefined ? "Unavailable" : `${Number(limits.maxTextureDimension2D).toLocaleString()} px`}</dd></div>
    <div><dt>Max buffer</dt><dd>${limits.maxBufferSize === undefined ? "Unavailable" : bytes(Number(limits.maxBufferSize))}</dd></div>
    <div><dt>System memory</dt><dd>${summary.environment.memoryBytes === undefined ? "Not recorded" : bytes(summary.environment.memoryBytes)}</dd></div>
    <div><dt>Browser</dt><dd>${evidence?.userAgent === undefined ? "Unavailable" : escape(evidence.userAgent)}</dd></div>
  </dl></section>`;
}

function metricSection(summary: BenchmarkSummary, title: string, description: string, groups: MetricDefinition["group"][]): string {
  const metrics = availableMetrics(summary).filter(({ group }) => groups.includes(group));
  if (metrics.length === 0) return "";
  const sizes = groups.includes("Observed data movement")
    ? metricPageSizes(metrics.length, { first: 2, maximum: 4 })
    : groups.includes("GPU resource allocation")
      ? metricPageSizes(metrics.length, { first: 2, maximum: 4 })
      : metricPageSizes(metrics.length, { maximum: 4 });
  let offset = 0;
  const pages = sizes.map((size) => {
    const page = metrics.slice(offset, offset + size);
    offset += size;
    return page;
  });
  const sectionClass = groups.includes("Steady-state performance") ? " steady-state-section" : "";
  return `<section class="report-section${sectionClass}"><div class="section-heading"><div><p class="eyebrow">Measured distributions</p><h2>${escape(title)}</h2></div><p>${escape(description)}</p></div><div class="charts">${pages.map((page, index) => `<div class="chart-page">${index === 0 ? "" : `<div class="continued-heading"><p class="eyebrow">Measured distributions · continued</p><h2>${escape(title)}</h2></div>`}${page.map((metric) => distributionChart(summary, metric)).join("")}</div>`).join("")}</div></section>`;
}

function performanceOverview(summary: BenchmarkSummary): string {
  const ranking = rankedByAverageFps(summary);
  if (ranking.length === 0) return "";
  const leader = ranking[0]!;
  const runnerUp = ranking[1];
  const last = ranking.at(-1)!;
  const fps = (demo: DemoSummary) => `${demo.summary.averageFps!.mean.toFixed(1)} fps`;
  const placement = ranking.map((demo, index) => `${index + 1}. ${escape(demo.name)} — ${fps(demo)}`).join(" · ");
  return `<section class="interpretation"><div><p class="eyebrow">Result overview</p><h2>${escape(leader.name)} leads this renderer comparison</h2></div><div>
    <p><strong>On this scene and machine, ${escape(leader.name)} is the strongest renderer result at ${fps(leader)}.${runnerUp === undefined ? "" : ` ${escape(runnerUp.name)} is second at ${fps(runnerUp)}.`} ${escape(last.name)} is the least performant at ${fps(last)}.</strong></p>
    <p>Mean frame-rate order across ${summary.configuration.runs} repeated ${summary.configuration.sampleDurationMs === undefined ? "captures" : `${Math.round(summary.configuration.sampleDurationMs / 1_000)}-second captures`}: ${placement}.</p>
    <p>The sections below show the run-level uncertainty, frame pacing, GPU-process activity, data movement, resource use, and submitted WebGPU work behind that ordering.</p>
  </div></section>`;
}

function researchContext(summary: BenchmarkSummary): string {
  const seconds = Math.round((summary.configuration.sampleDurationMs ?? 10_000) / 1_000);
  const warmup = Math.round((summary.configuration.warmupDurationMs ?? 0) / 1_000);
  return `<section class="research-context"><div class="research-context-heading"><p class="eyebrow">Study design</p><h2>What this benchmark tests</h2><p>This is a renderer-level comparison of ahead-of-time shader authoring against runtime shader and graph preparation, together with a directional test of GPU-resident work versus CPU-source WebGPU API traffic.</p></div><div class="research-notes">
    <article><span>Question 01</span><h3>AOT versus runtime preparation</h3><p>BroMetal, TypeGPU-Antiky, and WESL ship static WGSL or generated artifacts. TypeGPU resolves its typed graph in the browser; Three.js builds its WebGPU/TSL graph at runtime. Every path still relies on the browser and driver to compile WGSL and create GPU pipelines.</p></article>
    <article><span>Question 02</span><h3>GPU-first execution</h3><p>The harness counts CPU-source queue writes, requested GPU→CPU mappings, mapped-write capacity, external-image copies, and GPU-internal copies separately. This tests the claim that renderer work can remain GPU-resident without inventing physical bus traffic.</p></article>
    <article><span>Common source</span><h3>Pinned Sponza workload</h3><p>All five demos load Georgi Nikolov’s <code>webgpu-sponza-demo</code> asset snapshot at commit <code>1c90e984…694c</code>: 103 primitives, 262,267 triangles, 69 material images, the same fixed camera, and 40.3 MiB of runtime source assets.</p></article>
    <article><span>Protocol</span><h3>Repeated isolated captures</h3><p>${summary.configuration.runs} fresh Chrome processes per renderer, ${warmup} s warmup, then ${seconds} s measured at 1440×900. Renderer order rotates by repetition; HTTP and persistent GPU shader caches are disabled.</p></article>
  </div></section>`;
}

function libraryPayloadFacts(payloads: readonly LibraryPayload[]): string {
  const rows = buildLibraryFootprintRows(payloads);
  return `<section class="library-payloads"><div class="section-heading"><div><p class="eyebrow">Package reference</p><h2>Library size: shipped and installed</h2></div><p>Browser payload measures runtime code delivered to users. Package contents and installed build stack measure the authoring machinery available on this machine, including its resolved production dependency closure.</p></div><div class="payload-grid">${rows.map((row) => `<article><span>${escape(row.name)} · ${escape(row.version)}</span><dl><div class="payload-browser"><dt>Browser gzip</dt><dd>${escape(row.browserPayload)}</dd></div><div><dt>Own package</dt><dd>${escape(row.packageFootprint)}</dd></div><div><dt>Installed build stack</dt><dd>${escape(row.installedFootprint)}</dd><small>${escape(row.dependencyLabel)}</small></div></dl><p>${row.minifiedPayload === null ? "AOT/link step excluded from the browser bundle" : `${escape(row.minifiedPayload)} minified · <code>${escape(row.entry ?? "")}</code>`}</p></article>`).join("")}</div><p class="caption">Own-package and installed-stack values sum logical file bytes from the pinned local installation; nested <code>node_modules</code> are counted once through the resolved production dependency graph. Dev dependencies, filesystem block overhead, demo code, and scene assets are excluded. Browser gzip is a separately bundled public-entry reference. The benchmark’s BroMetal-style demo is locally implemented from static WGSL and does not import the published runtime.</p></section>`;
}

function rendererSnapshots(summary: BenchmarkSummary, payloads: readonly LibraryPayload[]): string {
  const snapshots = buildRendererSnapshots(summary, payloads, import.meta.env.BASE_URL);
  return `<section class="renderer-snapshots"><div class="section-heading"><div><p class="eyebrow">Visual workload record</p><h2>One scene, five renderer paths</h2></div><p>Actual heavy-profile canvas captures use the same 1440×900 presentation crop and fixed camera. The overlay combines the current repeated benchmark means with the package-entry reference above.</p></div><div class="snapshot-grid">${snapshots.map((snapshot) => `<figure class="snapshot-card"><img src="${escape(snapshot.imageUrl)}" alt="${escape(snapshot.name)} rendering the pinned Sponza benchmark scene" /><figcaption><div class="snapshot-title"><strong>${escape(snapshot.name)}</strong><span>${escape(snapshot.path)}</span></div><dl>${snapshot.measurements.map(({ label, value }) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join("")}</dl></figcaption></figure>`).join("")}</div><p class="caption">Images are presentation-canvas captures from the checked heavy-profile comparison. Similar composition verifies the common camera and asset workload; the metrics describe the renderer executions, not pixel identity.</p></section>`;
}

function methodology(summary: BenchmarkSummary): string {
  const modern = summary.schemaVersion >= 2;
  return `<section class="methodology"><article><span>01</span><h3>Cold start is separate</h3><p>Startup and pipeline preparation retain fresh-process, no-cache behavior. They are not mixed into warmed frame-rate samples.</p></article><article><span>02</span><h3>Fixed observation window</h3><p>${modern ? `${Math.round((summary.configuration.warmupDurationMs ?? 0) / 1_000)} s warmup, then exactly ${Math.round((summary.configuration.sampleDurationMs ?? 0) / 1_000)} s measured.` : "Legacy data used competing duration and frame-count stopping rules."}</p></article><article><span>03</span><h3>Order effects</h3><p>${summary.configuration.scheduling === "counterbalanced-rotation" ? "Implementation order rotates across repetitions to distribute heat and temporal drift." : "This result did not counterbalance renderer order."}</p></article><article><span>04</span><h3>Uncertainty is visible</h3><p>Dots are individual run means. Intervals use a two-sided 95% Student t interval; five runs still provide limited power.</p></article></section>`;
}

function dataMovementScope(summary: BenchmarkSummary): string {
  const introduction = hasDataMovementEvidence(summary)
    ? "This capture classifies WebGPU API activity by direction. It does not infer a CPU↔GPU round trip from a one-way upload or an internal GPU copy."
    : "This result predates directional data-movement instrumentation. Re-run the benchmark before comparing upload, readback, mapping, external-copy, or GPU-internal-copy behavior.";
  return `<section class="movement-scope ${hasDataMovementEvidence(summary) ? "" : "unavailable"}"><div><p class="eyebrow">Measurement boundary</p><h2>Data movement, not assumed round trips</h2><p>${introduction}</p></div><dl>
    <div><dt>CPU source → GPU</dt><dd><code>queue.writeBuffer</code> and <code>queue.writeTexture</code>. Buffer payload is exact at the API boundary; known texture payload is logical texel/block bytes.</dd></div>
    <div><dt>GPU → CPU request</dt><dd><code>mapAsync(READ)</code> requested ranges. <code>getMappedRange</code> is counted as access but its bytes are not added again.</dd></div>
    <div><dt>External source → GPU</dt><dd><code>copyExternalImageToTexture</code> remains separate because video/image decode sources may already be GPU-resident.</dd></div>
    <div><dt>GPU-internal</dt><dd>Encoder copy commands are not CPU traffic. Known logical payload and calls describe graph movement only.</dd></div>
  </dl><p class="caption">Mapped writes report CPU-writable capacity, not confirmed modified bytes. Unknown texture formats are counted separately. These are browser-visible API measurements—not physical bus transactions, cache-line traffic, driver staging, or proof of hardware occupancy. On unified-memory systems, these counters do not map directly to a physical CPU/GPU interconnect.</p></section>`;
}

function publicationGallery(cards: ShareCard[]): string {
  return `<section class="publication-gallery screen-only" id="publication-figures"><div class="section-heading"><div><p class="eyebrow">Ready to publish</p><h2>Social image exports</h2></div><p>Purpose-built 1600 × 900 figures for Discord, X, presentations, and articles. Each PNG is generated from the current report data.</p></div><div class="publication-grid">${cards.map((card) => `<article class="publication-card" data-card="${card.id}"><div class="publication-preview">${card.svg}</div><div class="publication-card-footer"><div><h3>${escape(card.title)}</h3><p>${escape(card.description)}</p></div><button type="button" class="export-button" data-export-card="${card.id}">Download PNG</button></div></article>`).join("")}</div></section>`;
}

function attachPublicationActions(cards: ShareCard[]): void {
  document.querySelector<HTMLButtonElement>("#print-report")?.addEventListener("click", () => window.print());
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-export-card]")) {
    button.addEventListener("click", async () => {
      const card = cards.find(({ id }) => id === button.dataset.exportCard);
      if (card === undefined) return;
      const originalLabel = button.textContent ?? "Download PNG";
      button.disabled = true;
      button.textContent = "Rendering PNG…";
      try {
        await downloadShareCardPng(card);
        button.textContent = "Downloaded";
      } catch {
        button.textContent = "Export failed — retry";
      } finally {
        setTimeout(() => {
          button.disabled = false;
          button.textContent = originalLabel;
        }, 1_500);
      }
    });
  }
}

function attachUpload(): void {
  document.querySelector<HTMLInputElement>("#summary-file")?.addEventListener("change", async (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file !== undefined) render(JSON.parse(await file.text()) as BenchmarkSummary);
  });
}

function render(summary: BenchmarkSummary): void {
  const captureDuration = summary.configuration.sampleDurationMs === undefined ? "legacy" : `${(summary.configuration.sampleDurationMs / 1_000).toFixed(0)} s fixed`;
  const shareCards = buildShareCards(summary);
  const standaloneCardId = shareCardIdFromSearch(window.location.search);
  const standaloneCard = shareCards.find(({ id }) => id === standaloneCardId);
  document.body.classList.toggle("card-export", standaloneCard !== undefined);
  if (standaloneCard !== undefined) {
    app!.innerHTML = standaloneCard.svg;
    return;
  }
  app!.innerHTML = `<div class="print-only print-running-header">WebGPU AOT research / representative renderer benchmark</div>
  <section class="report-cover"><header class="hero">
    <div><p class="eyebrow">WebGPU AOT research</p><h1>Renderer benchmark report</h1><p>Repeated, fixed-duration browser measurements with the result first and the supporting performance, GPU, memory, traffic, and workload evidence below.</p></div>
    <div class="hero-actions screen-only"><button type="button" class="report-action" id="print-report">Print / save PDF</button><a class="report-action" href="#publication-figures">Export social figures</a><label class="upload">Open another summary<input id="summary-file" type="file" accept="application/json,.json" /></label></div>
  </header>
  <section class="metadata"><div><span>Profile</span><strong>${escape(summary.configuration.profile)}</strong></div><div><span>Runs / implementation</span><strong>${summary.configuration.runs}</strong></div><div><span>Measured window</span><strong>${captureDuration}</strong></div><div><span>Warmup</span><strong>${summary.configuration.warmupDurationMs === undefined ? "not recorded" : `${summary.configuration.warmupDurationMs / 1_000} s`}</strong></div><div><span>Machine</span><strong>${escape(summary.environment.arch)} · ${summary.environment.cpus} CPUs</strong></div><div><span>Captured</span><strong>${new Date(summary.generatedAt).toLocaleString()}</strong></div></section>
  ${performanceOverview(summary)}
  ${researchContext(summary)}</section>
  <div class="visual-evidence">${libraryPayloadFacts(LIBRARY_PAYLOADS)}${rendererSnapshots(summary, LIBRARY_PAYLOADS)}</div>
  ${executionEnvironment(summary)}
  ${frameTimeline(summary)}
  ${gpuUtilizationTimeline(summary)}
  ${metricSection(summary, "Steady-state performance", "Run-level means and confidence intervals show effect size and repeatability; the timeline shows direction over the capture.", ["Steady-state performance"])}
  ${dataMovementScope(summary)}
  ${metricSection(summary, "Observed data movement", "Queue writes are confirmed CPU-source API payloads; map reads are GPU-to-CPU readback requests. External-image paths, mapped-write capacity, and GPU-internal copies stay separate so the columns cannot be summed into a fabricated round-trip total.", ["Observed data movement"])}
  ${resourceStack(summary)}
  ${metricSection(summary, "Resource and system diagnostics", "WebGPU allocation is instrumented per page. Chrome process GPU time is driver-accounted; macOS device and memory counters are system-wide diagnostics, not portable hardware occupancy.", ["GPU resource allocation", "System GPU diagnostics"])}
  ${workloadTable(summary)}
  ${metricSection(summary, "Cold start and shipped artifacts", "Fresh browser processes preserve cold-start evidence; production build and GPU preparation metrics remain separate from warmed rendering.", ["Cold startup", "Production build", "GPU preparation"])}
  ${methodology(summary)}
  ${publicationGallery(shareCards)}
  <footer>Platform: ${escape(summary.environment.platform)} · Node ${escape(summary.environment.node)} · Schema ${summary.schemaVersion} · Raw runs and time series are retained with the report.</footer>`;
  attachPublicationActions(shareCards);
  attachUpload();
}

function workloadTable(summary: BenchmarkSummary): string {
  const metrics = availableMetrics(summary).filter(({ group }) => group === "WebGPU workload" || group === "Scene contract");
  if (metrics.length === 0) return "";
  return `<section class="report-section workload-section"><div class="section-heading"><div><p class="eyebrow">Workload accounting</p><h2>Scene and WebGPU operations</h2></div><p>Operation counts provide context for where each renderer spends work and help explain the measured frame-rate spread.</p></div><div class="table-scroll"><table class="metric-table"><thead><tr><th>Measurement</th>${summary.demos.map((demo) => `<th>${escape(demo.name)}</th>`).join("")}</tr></thead><tbody>${metrics.map((metric) => `<tr><th>${escape(metric.label)}</th>${summary.demos.map((demo) => `<td>${demo.summary[metric.key] === null || demo.summary[metric.key] === undefined ? "—" : metric.format(demo.summary[metric.key]!.mean)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`;
}

async function load(): Promise<void> {
  try {
    const response = await fetch(
      summaryUrl(window.location.search, import.meta.env.BASE_URL),
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json() as BenchmarkSummary);
  } catch {
    app!.innerHTML = `<section class="empty"><p class="eyebrow">WebGPU AOT benchmark</p><h1>No benchmark result yet</h1><p>Generate repeated production runs and browser captures, then this page will render the evidence report.</p><code>npm run benchmark --workspace benchmark</code><label class="upload">Open a summary.json<input id="summary-file" type="file" accept="application/json,.json" /></label></section>`;
    attachUpload();
  }
}

void load();
