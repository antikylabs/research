# Heavy Sponza WebGPU AOT comparison

This experiment compares five independently runnable renderers against the same
pinned 262,267-triangle Sponza scene and 69-image material set. The shared
boundary is deliberately limited to immutable input data in `benchmark-assets/`.
Each demo owns its loader, shader compiler or linker path, GPU resources,
pipelines, frame graph, frame submission, loading UI, and telemetry.

| Package | Shader boundary | Browser runtime |
| --- | --- | --- |
| `demo-brometal` | Typed TypeScript data compiled to WGSL before Vite | Static WGSL; compiler excluded |
| `demo-typegpu` | Normal `tgpu.resolve` workflow | TypeGPU resolver retained and timed |
| `demo-typegpu-antiky` | TypeGPU shader definition compiled ahead of time | Static WGSL and binding metadata |
| `demo-wesl` | Modular WESL linked through the official static build path | Plain linked WGSL; linker excluded |
| `demo-threejs` | Native Three.js WebGPU/TSL pipeline | Framework-managed runtime compilation |

The renderers intentionally do not share pass graphs or runtime implementation
code. BroMetal uses its generated deferred graph, TypeGPU resolves a typed
runtime graph, Antiky consumes static AOT artifacts, WESL consumes statically
linked modules, and Three.js builds a framework-native TSL graph. Every demo
publishes comparable startup/frame state through `window.__WEBGPU_AOT__`; the
Playwright harness also records commands, pipelines, resources, shaders, and
canvas statistics so accidental convergence is reported as an architecture
violation.

## Run all benchmarks and view the report

Install the workspace dependencies, then run the complete benchmark suite from
this directory:

```sh
npm install
npm run benchmark:all
```

`benchmark:all` runs the representative five-renderer campaign, the
byte-identical null-control campaign, and the raw WebGPU versus real Three.js
architecture campaign sequentially so their GPU measurements do not overlap.
Each capture uses a fresh Chrome process, a warmup period, and a fixed 10-second
measurement window. When the campaigns finish, the command assembles one
multipage site in `packages/benchmark-all/dist` and exits. It does not leave a
report server running.

To watch the captures in Chrome, use:

```sh
npm run benchmark:all -- --headed
```

After `benchmark:all` completes, launch the existing report without rerunning
or rebuilding any benchmarks:

```sh
npm run report:all
```

Open `http://127.0.0.1:4173/`. The report overview links to:

- `/representative/` — the measured five-renderer ranking and supporting GPU,
  memory, traffic, workload, and frame-pacing evidence;
- `/controlled/` — the byte-identical null control; and
- `/controlled/architecture.html` — raw WebGPU versus real Three.js on the
  controlled static task.

The representative report includes two publication controls at the top:

- **Print / save PDF** opens the browser print dialog with an A4 landscape
  research layout. Charts are paginated in groups of four, so the complete
  steady-state section stays together on one page. Enable background graphics
  if the browser exposes that option.
- **Export social figures** jumps to six 1600 × 900 figures built from the
  loaded result: the renderer ranking, all four steady-state measurements, GPU
  footprint/API traffic, focused CPU-source queue writes, the complete
  resource/system diagnostic matrix, and all cold-start/shipped-artifact
  measurements. Each figure has a **Download PNG** button and is ready for
  Discord, X, slide decks, or articles.

Publication cards also have stable report URLs for automated capture:

```text
http://127.0.0.1:4173/representative/?card=renderer-ranking
http://127.0.0.1:4173/representative/?card=steady-state-performance
http://127.0.0.1:4173/representative/?card=gpu-footprint-and-traffic
http://127.0.0.1:4173/representative/?card=cpu-source-queue-writes
http://127.0.0.1:4173/representative/?card=resource-system-diagnostics
http://127.0.0.1:4173/representative/?card=cold-start-and-artifacts
```

The current checked-in exports are in `output/social/`; the print-verified PDF
is [`report/renderer-benchmark-report.pdf`](../../report/renderer-benchmark-report.pdf).

Near the top of the representative report, the library-size reference keeps
three different costs separate:

- **Browser gzip** bundles each public runtime entry as minified production ESM
  and gzip-9 compresses it. Build-time-only AOT/link tools report no shipped
  runtime library.
- **Own package** sums the logical bytes of the pinned installed package itself,
  excluding nested `node_modules`.
- **Installed build stack** adds the package and its resolved production
  dependency closure once per package. Dev dependencies and filesystem block
  overhead are excluded; installed optional dependencies reflect the current
  platform and lockfile.

The report build refreshes these values automatically. To measure them without
building the report, run:

```sh
npm run measure:libraries --workspace benchmark
```

Press Ctrl+C to stop the report server. To choose another port:

```sh
npm run report:all -- --port=5000
```

## Run a demo

From this directory:

```sh
npm run dev --workspace demo-brometal
npm run dev --workspace demo-typegpu
npm run dev --workspace demo-typegpu-antiky
npm run dev --workspace demo-wesl
npm run dev --workspace demo-threejs
```

Open the printed URL with no query for the fixed 2560 × 1440 `heavy` workload.
Use `?profile=extreme` for 3840 × 2160. `?profile=smoke` is a non-reportable
1280 × 720 development mode; it preserves the complete scene while reducing
implementation-specific workload settings.

## Verify everything

```sh
npm run build
npm test
npm audit
```

The workspace suite type-checks every package, rebuilds all AOT artifacts,
compiles generated WGSL with Dawn, verifies production bundle composition, and
enforces that no shared renderer package or runtime import exists.
