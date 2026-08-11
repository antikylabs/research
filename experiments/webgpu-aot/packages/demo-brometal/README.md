# BroMetal-style AOT Sponza demo

This demo is the TypeScript-first AOT control. Its final-composition shader is
declared as typed TypeScript data and compiled into checked-in WGSL before Vite
builds the browser application. The compiler and source definition are absent
from the production runtime.

The demo owns its scene loader, deterministic light simulation, deferred
G-buffer, shadowing, screen-space reflection, particle, bloom, and composite
passes. Only the immutable benchmark assets are common inputs; no renderer or
runtime implementation is shared with another demo.

```sh
npm run build --workspace demo-brometal
npm run dev --workspace demo-brometal -- --open /?profile=smoke
```

Omit `profile=smoke` for the mandatory 2560 × 1440 heavy workload, or use
`profile=extreme` for 3840 × 2160.
