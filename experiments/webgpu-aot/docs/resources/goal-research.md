# Goal: WebGPU AOT Research Monorepo

## Objective

Build a research monorepo to evaluate Ahead-of-Time shader compilation approaches for WebGPU, with a focus on whether TypeGPU can be adapted into an AOT workflow suitable for Antiky.

The first implementation pass should produce a working comparison environment, not a polished research paper.

## 1. Build `typegpu-antiky`

Create:

```text
packages/typegpu-antiky
```

The goal is to use TypeGPU for TypeScript shader authoring while moving WGSL generation to build time.

Target flow:

```text
TypeScript shader
→ TypeGPU tooling
→ typegpu-antiky build step
→ generated WGSL
→ lightweight WebGPU runtime
```

The production runtime should not perform TypeGPU shader resolution or WGSL generation.

Start simple:

* vertex + fragment shaders
* static bind groups
* static pipeline configuration
* generated WGSL artifact
* generated TypeScript metadata if needed
* one working example proving AOT compilation

Do not over-engineer the package initially.

## 2. Find an Appropriate Demo

Find an open-source Three.js/WebGPU demo or game that can act as the shared workload.

Prefer something with:

* meaningful shader complexity
* textures and materials
* lighting
* animation
* multiple objects
* post-processing if practical
* enough GPU work to make startup and shader behavior measurable
* permissive licensing

Avoid demos that depend so heavily on Three.js-specific systems that reproducing them elsewhere becomes the majority of the project.

Use the selected demo as the visual and workload reference for every implementation.

## 3. Build Equivalent Demos

Create working versions of the same scene/workload in:

```text
packages/demo-brometal
packages/demo-typegpu
packages/demo-typegpu-antiky
packages/demo-wesl
packages/demo-threejs
```

Each demo should render approximately the same workload and use the same assets wherever practical.

The goal is not pixel-perfect output.

The goal is equivalent enough rendering work to compare architecture and performance fairly.

Keep each demo independently runnable and buildable.

## 4. Build and Run the Benchmark

Create:

```text
packages/benchmark
```

Automate running the production builds and collecting comparable measurements.

At minimum measure:

* production build time
* production bundle size
* startup time
* time until first rendered frame
* shader preparation/generation time where measurable
* pipeline creation time where measurable
* average FPS
* frame-time consistency

Run each demo multiple times and save the raw results.

Produce a simple summary that makes it easy to compare:

```text
BroMetal
TypeGPU
TypeGPU-Antiky
WESL
Three.js
```

## Definition of Done

The first research pass is complete when:

* `typegpu-antiky` can produce static WGSL from TypeGPU-authored shaders
* an appropriate reference demo has been selected
* all five demo packages render equivalent workloads
* the benchmark can run automatically
* benchmark results are saved in a machine-readable format
* there is enough evidence to decide what should be investigated next

Do not optimize prematurely.

The purpose of this first pass is to establish a working research environment and reveal the important technical differences between the approaches.
