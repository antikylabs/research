# Controlled WebGPU benchmark

This package is an additive companion to `packages/benchmark`. It does not replace or modify the representative demos.

The representative benchmark asks: **How do these complete renderer demos behave?**

This package contains two deliberately separate controls:

1. **Null baseline:** How much variation does the measurement system produce when five experimental labels execute the exact same WebGPU artifact and command graph?
2. **Renderer-architecture arm:** How do raw WebGPU and a real Three.js `WebGPURenderer` construction differ while executing the same static 32-light GGX plus ACES task?

That is a null control, not an authoring-system comparison. All five labels use one production bundle and one SHA-256-checked WGSL string. The report therefore never names a winner and sets `causalClaimSupported` to `false`. A future generator-controlled phase can add separately generated artifacts only after defining and validating a stronger shader/resource/output equivalence contract.

The architecture arm is not byte-identical: Three.js owns the shader wrapper, render pipeline, command encoding, and submission. Those differences are the measured independent variable. Its task gate can support a narrow baseline statement about these two renderer constructions on this static task, but it does not exercise dynamic scene-graph traffic and still sets `authoringSystemClaimSupported` to `false`.

## Protocol

- Five labels: BroMetal AOT, TypeGPU runtime, TypeGPU-Antiky AOT, WESL static, and Three.js framework.
- Ten captures per label by default, giving every label every order position twice.
- Five-second steady-state warmup and fixed ten-second capture.
- Fresh Chrome process and profile for every cell.
- Unique run URL, DevTools HTTP cache disabled, `Cache-Control: no-store`, and persistent GPU shader disk cache disabled.
- One shared 2560×1440 default workload, 32-light GGX fragment loop, ACES composite, two render passes, two draws, one encoder, one submit, and one 16-byte queue write per rendered frame.
- Capture rejection when the experiment label or command graph is wrong.
- Cross-cell validity gate for exact shader hashes and expected command counters.

The ten-run default takes roughly thirteen minutes because it performs 50 isolated captures of at least 15 seconds including warmup.

```sh
npm run benchmark --workspace benchmark-controlled
npm run report --workspace benchmark-controlled
```

The real raw-WebGPU versus Three.js architecture campaign is separate:

```sh
npm run benchmark:architecture --workspace benchmark-controlled
npm run report --workspace benchmark-controlled
# then open /architecture.html
```

For a single-label runtime diagnostic that still retains the ten-second capture floor:

```sh
npm run benchmark --workspace benchmark-controlled -- --runs=1 --only=brometal-aot --profile=smoke --output=public/verification
```

A single-label result is reported as an incomplete cohort, not a failed equivalence gate.

## Recorded result

The 2026-08-10 null campaign completed all 50 captures. Every label reported the same shader SHA-256, two render passes, two draws, one encoder, one submit, and one 16-byte queue write per frame. Mean FPS across the five labels spanned 119.9871 to 120.0551, a 0.0567% relative spread. The overlapping confidence intervals and display-capped frame rate make that spread a noise-floor observation, not a ranking.

The separate static architecture campaign completed 20 captures and passed its task gate. Both constructions were display capped near 120 FPS, so it does not support a throughput winner. Raw WebGPU used one encoder and one submit per frame; Three.js used two of each. The instrumented CPU frame-encoding mean was 0.05 ms for raw WebGPU and 0.18 ms for Three.js. Descriptor-estimated live WebGPU allocations were 29,491,216 and 44,237,288 bytes, and gzip bundle sizes were 4,716 and 232,658 bytes, respectively. Both had zero steady-state queue writes and zero map-read requests because this controlled task is static; use the representative dynamic-scene campaign to study per-frame data movement.

Chrome GPU-process busy percentages differed substantially, but that counter includes process-level work and is neither GPU occupancy nor a renderer-specific hardware utilization measurement. It is retained as a diagnostic proxy and is not used to rank the implementations.

## Interpretation boundary

Supported:

> Under this protocol, byte-identical WebGPU work varied by the observed run distribution and order/thermal conditions on this machine. That spread is a lower-bound noise and scheduling baseline for comparisons run with the same machinery.

Not supported:

- One authoring system is faster than another.
- The five null-control labels are independently generated artifacts.
- WebGPU descriptor bytes are physical VRAM residency.
- API payload bytes are physical CPU/GPU bus traffic.
- A one-way queue upload is a CPU/GPU round trip.
- Chrome GPU-process busy time is shader-core occupancy.

The report uses raw run dots plus Student-t 95% confidence intervals. Frame-time direction is an overlaid elapsed-time plot rather than a stacked chart: independent frame times are not additive, so stacking them would create a visually impressive but scientifically meaningless total.

## Data movement

The shared instrumentation separates:

- CPU-source queue writes (`writeBuffer` and `writeTexture`);
- GPU-to-CPU `mapAsync(READ)` request ranges;
- mapped writable capacity, which is not the same as confirmed uploaded bytes;
- external-image copies, whose source residency is unknown; and
- GPU-internal copy commands, which do not imply CPU traffic.

These are logical API observations. WebGPU does not expose driver staging, cache-line traffic, page migration, or a physical interconnect counter. That limitation is especially important on unified-memory machines.

## Three.js architecture arm

The real Three.js adapter lives in `packages/demo-controlled-threejs`. It uses `WebGPURenderer`, a TSL-managed render pass, native WGSL functions for the same 32-light GGX core, and a `RenderPipeline` ACES stage. The raw reference lives in `packages/demo-controlled`.

The task gate requires the same task id, resolution, mesh count, analytic-light count, and sample count. It intentionally does **not** require equal command encoders, passes, submissions, buffer writes, allocations, or bundle size; those are renderer-architecture outcomes. Raw run points, 95% confidence intervals, and elapsed-time frame traces are retained in `public/architecture-results`.
