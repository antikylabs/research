## 4. Build and Run the Benchmark

Reference: @../resources/**
Existing Tooling: @../../scripts/**

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
* Other bits we already capture for comparison while building
* Other bits as you see fit

Run each demo multiple times and save the raw results.

Produce a simple summary that makes it easy to compare:

```text
BroMetal
TypeGPU
TypeGPU-Antiky
WESL
Three.js
```
Produce graphs and charts on important verticals game engineers, players, etc would care about. And a benchmark summary page. Launched with `npm run dev --workspace benchmark`
