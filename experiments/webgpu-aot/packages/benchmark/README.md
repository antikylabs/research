# WebGPU AOT benchmark

This package builds and measures the five production demos under the same browser viewport and workload profile. It keeps every run in JSON and serves an interactive comparison of the aggregate distributions.

## Run it

From the repository root:

```sh
npm run dev --workspace benchmark
```

`dev` runs fresh production benchmarks and starts the dashboard after they finish. The benchmark defaults to five heavy-profile runs per demo. Each run separates cold startup from a five-second warmup and an exact ten-second steady-state capture. Results are written to `public/results/<timestamp>/`; `public/results/latest/` feeds the dashboard. Timestamped local runs are ignored by Git while the latest audited result can be checked in.

Useful controls:

```sh
npm run dev --workspace benchmark -- --runs=3
npm run dev --workspace benchmark -- --sample-seconds=20
npm run dev --workspace benchmark -- --warmup-seconds=10
npm run dev --workspace benchmark -- --profile=smoke --only=brometal
npm run dev --workspace benchmark -- --headed
```

Use `npm run benchmark --workspace benchmark` to measure without starting the dashboard, or `npm run report --workspace benchmark` to open existing results without measuring. Run `npm run benchmark --workspace benchmark -- --help` for every benchmark option.

## Methodology

Each repetition runs the demo's real `npm run build` command, measures the complete `dist` tree, starts a no-cache static server, opens the selected production build in Chrome at 1440×900, and waits for the demo's shared telemetry to report its first rendered frame. Cold-start metrics end at that boundary. The runner then warms the renderer for five seconds and resets sampling before the fixed-duration steady-state capture.

Every repetition launches a new Chrome process with a temporary browser profile. HTTP caching is disabled through the DevTools protocol, the server sends `Cache-Control: no-store`, the URL contains a unique capture identity, and Chrome's persistent GPU shader disk cache is disabled. Implementation order rotates across repetitions so one renderer does not always receive the same thermal or temporal position. This isolates browser and WebGPU compiler state as far as Chrome exposes control; operating-system and driver caches remain part of the measured system.

The runner records:

- build duration; complete and gzip production bundle bytes; file count
- navigation startup, asset-ready, and first-rendered-frame time
- WebGPU shader-module and render/compute pipeline creation counts and durations
- average FPS; mean, P95, worst, and standard-deviation frame time
- every frame interval for the time-series report
- browser-exposed WebGPU adapter identity, features, and selected limits
- the demo's CPU frame time and FPS telemetry where exposed
- scene dimensions, mesh counts, simulated and analytic lights, and particles
- render/compute passes, draw/index/vertex/instance volume, command encoders/buffers, workgroups, and submits per frame
- directional WebGPU data-movement APIs per frame: CPU-source queue buffer/texture writes, GPU-to-CPU map-read requests, mapped-write capacity, external-image copies, and GPU-internal copy commands
- descriptor-based live buffer and texture allocation estimates
- end-of-capture queue-drain time
- Chrome GPU-process driver time and its directional timeline, plus system-wide macOS utilization and GPU memory counters when available
- navigation transfer and encoded body bytes

The report also provides a package-size reference independent of the demo
artifacts. `Browser gzip` is a minified production-ESM bundle of the public
runtime entry compressed with gzip-9. `Own package` is the logical byte sum of
the pinned installed package, excluding nested `node_modules`. `Installed build
stack` adds the uniquely resolved production dependency closure, including only
optional dependencies installed for the current platform. Dev dependencies and
filesystem block overhead are excluded. Build-time-only authoring tools can
therefore show `None shipped` while still reporting the size of the machinery
used to generate their static artifacts.

The package reference is regenerated before every report build, or directly
with:

```sh
npm run measure:libraries --workspace benchmark
```

`raw.json` retains each individual repetition and time series. `summary.json` reports count, mean, median, minimum, maximum, P95, sample standard deviation, and a two-sided 95% Student t confidence interval for every available metric. It also runs separate scene/task, native command-topology, and declared shader-contract gates. Three.js is shown as a framework reference but excluded from native authoring-system attribution. A failed gate means the results compare whole demo architectures and cannot be attributed to the shader authoring/compiler system alone.

The preserved 2026-08-10 directional-traffic campaign lives under `public/results-traffic/latest`. Start the report and open `/?dataset=results-traffic` to inspect it without replacing `public/results/latest`.

The data-movement counters are WebGPU API observations, not hardware bus telemetry. Queue-write buffer bytes are exact API payloads and known-format texture bytes are logical texel/block payloads; neither reveals browser/driver staging or cache traffic. `mapAsync(READ)` is counted once as a readback request, while `getMappedRange` is not added again. Mapped-write ranges are capacity rather than confirmed modified bytes. External-image copies remain separate because their decode source may already be GPU-resident, and command-encoder copies remain GPU-internal. This separation prevents one-way uploads from being mislabeled as CPU↔GPU round trips.

The WebGPU allocation number is not physical VRAM residency. It is the sum of known application-created buffer and texture descriptor sizes; it excludes browser/driver overhead and swapchain images. The Chrome GPU-process percentage is derived from cumulative driver-accounted GPU time. macOS device/renderer/tiler utilization and memory counters are system-wide and can include other processes; stale zero-valued utilization fields are marked unavailable. See [SCIENTIFIC-AUDIT.md](./SCIENTIFIC-AUDIT.md) for the current causal assessment and remaining threats to validity.

## Verification

```sh
npm run test --workspace benchmark
npm run typecheck --workspace benchmark
npm run build --workspace benchmark
```
