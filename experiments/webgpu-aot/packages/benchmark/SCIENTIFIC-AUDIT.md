# Scientific audit of the renderer benchmark

## Verdict

The original extreme gaps were substantially artifacts of how the demos were built. WESL was executing an extra 103-draw depth prepass plus three full-resolution compute ambient passes; TypeGPU used 4× MSAA, more analytic lights, and GPU compute simulation; BroMetal allowed a much longer reflection trace and computed an expensive ambient field that its final image did not consume. Those were renderer-demo differences, not evidence about WESL, TypeGPU, BroMetal, or AOT as authoring systems.

After removing those confounders, the four native demos are much closer. They now match on scene/task inputs and nearly all observable command topology. Their five-run FPS confidence intervals overlap substantially. The remaining result is still **not authoring-system attribution-safe**, however, because:

1. the native command streams still differ by one background draw and by buffer-write volume; and
2. source audit confirms different shading paths, direct-light BRDFs, and environment-lighting algorithms.

Three.js is intentionally retained as a separate representative framework reference. Its much lower frame rate is real for this complete demo, but its 27 submits, 327 buffer writes, different framework shaders, and larger resource graph make it categorically different from the native authoring-system cohort.

The defensible conclusion is: **these complete renderer architectures perform differently on this machine; this experiment does not isolate the causal effect of shader authoring system or AOT compilation.**

## Audited heavy-profile result

The [latest summary](./public/results/latest/summary.json) and [raw runs](./public/results/latest/raw.json) were generated on 2026-08-10 with five counterbalanced repetitions, a five-second warmup, and an equal ten-second measured window for every capture.

| Implementation | Mean FPS (95% CI) | Mean P95 frame | Chrome GPU-process busy | Queue drain | Estimated live WebGPU allocation |
| --- | ---: | ---: | ---: | ---: | ---: |
| BroMetal | 39.18 (30.75–47.60) | 35.3 ms | 46.6% | 87.7 ms | 704.8 MiB |
| TypeGPU | 28.57 (23.72–33.41) | 43.6 ms | 49.2% | 128.9 ms | 768.1 MiB |
| TypeGPU-Antiky | 32.62 (27.87–37.38) | 38.8 ms | 44.2% | 106.9 ms | 800.1 MiB |
| WESL | 32.83 (29.64–36.03) | 37.0 ms | 39.5% | 112.6 ms | 785.0 MiB |
| Three.js framework reference | 8.38 (7.45–9.31) | 140.1 ms | 32.0% | 452.3 ms | 1041.0 MiB |

With only five repetitions, the native intervals are wide. BroMetal has the highest sample mean, but its interval overlaps TypeGPU-Antiky and WESL and narrowly overlaps TypeGPU. The data do not support a strong native ranking. Three.js is clearly separated statistically in this sample, but the architecture gate fails so that difference cannot be attributed to framework syntax or TSL alone.

## Three validity gates

The report now evaluates equivalence in stages instead of treating matching draw counts as proof of matching shader work.

| Gate | Result | Evidence |
| --- | --- | --- |
| Scene and task | Matched | 2560×1440, 103 meshes, 474 simulated lights, 32 analytic lights, and 406 particles in every implementation |
| Native command topology | Mismatched | All four use 25 render passes, 309 indexed draws, zero compute passes, one encoder/submit/command buffer, and four buffer writes; TypeGPU/WESL add one explicit background draw, and write volume spans 14,192–17,472 bytes/frame |
| Declared shader contract | Mismatched | AO, 24-step SSR, temporal resolve, and five-level bloom match; shading path, direct-light BRDF, and environment-lighting model do not |

Three.js is excluded from the native topology and shader-contract gates. Including it would answer a different question: representative framework architecture versus four explicitly managed native architectures.

## Current command evidence

| Implementation | Render passes | Indexed draws | Other draws | Compute | Encoders / submits | Buffer writes | Write bytes | Submitted indices |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| BroMetal | 25 | 309 | 22 | 0 | 1 / 1 | 4 | 14,192 | 2,360,403 |
| TypeGPU | 25 | 309 | 23 | 0 | 1 / 1 | 4 | 17,472 | 2,360,403 |
| TypeGPU-Antiky | 25 | 309 | 22 | 0 | 1 / 1 | 4 | 15,344 | 2,360,403 |
| WESL | 25 | 309 | 23 | 0 | 1 / 1 | 4 | 14,192 | 2,360,403 |
| Three.js | 25 | 384 | 21 | 0 | 27 / 27 | 327 | 55,713 | 3,150,924 |

The extra native non-indexed draw is an explicit environment background in TypeGPU and WESL; BroMetal integrates its background in deferred lighting and Antiky uses the render clear. Adding dummy draws would make the table prettier while making the experiment less honest, so the gate reports the mismatch.

Buffer-write volume also remains structurally different even though call count is aligned. The renderers use different frame/material structures and update payload sizes. That difference may itself be an outcome of their authored data models, but it prevents a claim that only shader compilation mode changed.

## Shader work that is still not equivalent

The source-audited contract is explicit in the result JSON:

| Implementation | Shading path | Direct lighting | Environment lighting |
| --- | --- | --- | --- |
| BroMetal | Deferred screen-space | Correlated GGX with multiscattering | Source cube with analytic DFG and multiscattering |
| TypeGPU | Forward material | GGX/Schlick/Smith | Source cube with analytic DFG |
| TypeGPU-Antiky | Forward material | Normalized Blinn-Phong-style specular | Source cube with analytic DFG and multiscattering |
| WESL | Forward material | GGX/Smith | Prefiltered diffuse/specular cubes plus BRDF LUT |
| Three.js | Framework-managed | Three node material | Three PMREM |

These algorithms can produce similar display pixels while executing different arithmetic, texture sampling, intermediate formats, and startup preparation. Top-level pass/draw equality cannot reveal those costs. This is the principal remaining reason the experiment is not a compiler or authoring-system microbenchmark.

## What the demo cleanup proved

The before/after audit identified genuine self-inflicted artifacts:

- **WESL:** removed a full 103-draw depth prepass and three full-resolution compute AO/blur passes (172,800 workgroups/frame). It now uses the shared 16-sample depth/normal AO and the common 25-pass, zero-compute frame graph.
- **TypeGPU:** changed 4× MSAA to one sample, aligned analytic lights to 32, moved simulation to the shared CPU boundary, added the same temporal stage, and replaced its different noisy/world-position AO with the shared 16-sample depth/normal kernel.
- **BroMetal:** bounded SSR to the shared 24-step trace, replaced an expensive full-resolution horizon AO that was computed but not consumed, fed the aligned AO into temporal resolve, and removed a static composite buffer write from the per-frame path.
- **All four native demos:** now execute 309 indexed draws, 25 render passes, zero compute passes, one submit, four dynamic buffer writes, 32 analytic lights, one sample, and the same AO/SSR/temporal/bloom stage counts.

The corrected native results—roughly 29–39 FPS rather than the previous 3–44 FPS spread—show how much of the old ranking was construction. The remaining spread is plausibly a combination of real shader/renderer architecture differences and system noise.

## Resource and GPU diagnostics

| Implementation | Descriptor-estimated WebGPU allocation | System GPU in-use memory | System GPU allocated memory |
| --- | ---: | ---: | ---: |
| BroMetal | 704.8 MiB | 1.81 GiB | 6.64 GiB |
| TypeGPU | 768.1 MiB | 1.87 GiB | 6.65 GiB |
| TypeGPU-Antiky | 800.1 MiB | 1.89 GiB | 6.75 GiB |
| WESL | 785.0 MiB | 1.89 GiB | 6.78 GiB |
| Three.js | 1041.0 MiB | 2.37 GiB | 7.29 GiB |

These columns measure different things:

- The WebGPU allocation estimate sums live application-created buffer and texture descriptor sizes. It excludes browser/driver overhead and swapchain images and is **not physical VRAM residency**.
- On this Apple unified-memory system, `ioreg` memory counters are system-wide. They can include the browser, window system, and unrelated processes; they are diagnostics, not a per-demo attribution.
- Chrome GPU-process busy percentage is derived from changes in cumulative driver-accounted GPU time. It is not shader-core occupancy. Three.js being slower while showing a lower process-busy percentage is direct evidence that this proxy must not be treated as “GPU utilization caused the result.”
- End-of-window `GPUQueue.onSubmittedWorkDone()` time is a backlog proxy. It is not a pass-level GPU duration.

The browser exposed the same Apple `metal-3` adapter, subgroup size 32, feature set, and limits for every capture. The machine record is Apple arm64, 14 logical CPUs, 24 GiB system memory, Darwin 25.5.0, and Headless Chrome 151. Adapter identity, features, limits, user agent, and full time series are retained in raw evidence.

Physical per-process VRAM and standardized hardware utilization are not exposed by WebGPU. The adapter supports timestamp queries, but this benchmark does not inject timestamp scopes into library-managed graphs because doing so would modify different renderers differently. A next iteration should add renderer-owned, identically placed timestamp scopes and report per-stage GPU time separately. See the [current WebGPU specification](https://www.w3.org/TR/webgpu/).

## CPU/GPU data-movement evidence

New captures retain directional WebGPU API counters intended to test claims that one renderer keeps more work and data GPU-resident than another:

- **CPU-source → GPU:** `GPUQueue.writeBuffer` calls and API payload bytes, plus `GPUQueue.writeTexture` calls and known-format logical texel/block bytes.
- **GPU → CPU readback request:** `GPUBuffer.mapAsync(GPUMapMode.READ)` calls and requested mapped ranges. A later `getMappedRange` call is recorded as access but its range is not added to the byte total again.
- **CPU-writable mapping capacity:** buffers created mapped and `mapAsync(GPUMapMode.WRITE)` requested ranges. JavaScript mutations inside the returned memory cannot be observed, so these bytes are an upper bound on writable capacity—not confirmed uploads.
- **External source → GPU:** `GPUQueue.copyExternalImageToTexture` calls and known destination logical bytes. The source may be CPU memory, a decoded image, or an already GPU-resident video/image resource, so this category is not counted as CPU→GPU traffic.
- **GPU-internal graph movement:** buffer/texture copy commands and known logical bytes. These commands do not imply a CPU round trip.

This instrumentation can support a narrow statement such as “demo A issued fewer WebGPU queue uploads or application-visible readbacks per rendered frame than demo B.” It cannot by itself support “demo A caused less physical CPU/GPU bus traffic.” WebGPU does not expose driver staging copies, cache-line movement, page migration, or physical interconnect counters, and this benchmark machine uses unified memory. A low upload count also says nothing about CPU scene-graph, culling, JavaScript, or command-encoding work that does not cross an instrumented data API.

Texture and external-copy byte values are logical known-format destination payloads. Row padding, implementation-specific compression, browser conversions, and unknown formats are excluded and unknown-size calls are reported separately. Therefore calls and logical bytes should be compared as two independent workload dimensions, not multiplied or summed into a synthetic “round-trip” score.

## Direction, variance, and order effects

The report uses overlaid line charts for median-binned frame time and Chrome GPU-process busy intervals. These are independent outcomes, so stacking them would imply a false additive total. The only stacked chart is buffers plus textures, which are genuinely additive descriptor bytes.

The five raw runs show meaningful system drift. System-wide GPU in-use memory generally declined as the campaign progressed, while several process-busy samples increased. Individual native FPS values varied substantially; BroMetal ranged from 30.43 to 48.28 FPS and TypeGPU from 24.46 to 33.88 FPS. Counterbalanced rotation ensured every implementation occupied every order position once, preventing one renderer from always being first or last, but it cannot remove thermal, power, operating-system, or driver variation.

Five repetitions are enough to expose this instability and calculate a small-sample Student t interval, not enough for high statistical power. The report therefore shows every run and confidence interval and does not apply winner labels to diagnostic/workload metrics. Multi-machine replication and more randomized blocks are required before portable claims.

## Visual and scene evidence

The final controlled heavy capture passed for all five implementations with no browser or WebGPU errors. It verified the 2560×1440 canvas, synchronized frame 12, final-pixel lighting cues, and semantic parity of all 406 particles. The command/resource counts above came from the same synchronized workload window.

The visual audit also reports missing evidence instead of silently passing it: the exact TypeGPU pre-composite HDR probe was unavailable, and WESL's selected-reflection diagnostic did not provide complete comparable evidence. Those omissions do not invalidate the benchmark capture, but they prevent claims of exact intermediate-buffer equivalence.

Visual/task similarity is not computational equivalence. The scene gate proves the same task population; the shader gate records why equal-looking output can still cost different amounts.

## Cache and process isolation

Every one of the 25 measurements used:

- a fresh production build and fresh Chrome process;
- a temporary browser profile;
- a unique run URL;
- DevTools HTTP cache disabled;
- `Cache-Control: no-store` from the local server;
- Chrome's persistent GPU shader disk cache disabled;
- a separate five-second warmup followed by a fixed ten-second measured window; and
- counterbalanced rotating implementation order.

This prevents page/HTTP/browser-profile reuse and substantially reduces WebGPU shader-cache carryover. It cannot flush operating-system filesystem caches, driver-internal caches, or shared hardware state. The protocol distributes those effects; it does not claim they are absent.

Cold startup, shader/pipeline preparation, production build time, bundle size, and warmed rendering remain separate metrics. TypeGPU-Antiky's build emitted a duplicate-TypeGPU-version warning for the same version during each AOT generation step; that warning is part of build-path evidence and is a reason not to interpret build time as compiler throughput in isolation.

## Claims this experiment can and cannot support

Supported:

> On this machine and configuration, the four corrected native demos delivered overlapping but different frame-rate distributions while performing a closely aligned scene and top-level frame graph. Three.js delivered a materially different whole-framework result. Resource, command, startup, and pacing differences are real properties of these demos.

Not supported:

- “BroMetal is intrinsically faster.”
- “WESL is intrinsically slower or faster.”
- “AOT compilation caused the runtime ranking.”
- “The descriptor allocation column is physical VRAM.”
- “Chrome GPU-process busy percentage is hardware occupancy.”

To isolate authoring system or AOT causally, add a separate microbenchmark in which all four native implementations consume byte-identical buffers/textures and execute shader-equivalent kernels with identical target formats, background strategy, bind-group layout, update byte counts, and timestamp scopes. Keep this suite as the representative whole-application benchmark and report the two experiments separately.
