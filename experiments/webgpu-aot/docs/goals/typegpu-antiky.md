## 1. Build `typegpu-antiky`

Reference: @../resources/*

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
