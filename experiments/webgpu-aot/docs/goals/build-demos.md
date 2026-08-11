## 3. Build Equivalent Demos

Reference: @../resources/*
Selected demo in @find-demo.md

Create working versions of the same scene/workload in:

```text
packages/demo-brometal
packages/demo-typegpu
packages/demo-typegpu-antiky (Replace existing demo in there)
packages/demo-wesl
packages/demo-threejs
```
You must use the AOT benefits of wesl, brometal, typegpu-antiky where possible. You must push down to WebGPU where possible.

Each demo should render approximately the same workload and use the same assets wherever practical.

The goal is not pixel-perfect output.

The goal is equivalent enough rendering work to compare architecture and performance fairly.

Keep each demo independently runnable and buildable.
