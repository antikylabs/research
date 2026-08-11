# TypeGPU-Antiky AOT Sponza demo

This demo authors the final-composition shader and binding contract in
TypeScript. TypeGPU-Antiky resolves them into checked-in WGSL and static
metadata before Vite builds the browser application. The browser imports only
that artifact; TypeGPU and its resolver are absent from the production bundle.

The artifact replaces the shared renderer's matching composition shader, so
the geometry, assets, 474 lights, pass graph, fixed time step, and profiles are
identical to the standard TypeGPU and BroMetal-style demos.

```sh
npm run build:typegpu-antiky
npm run dev --workspace demo-typegpu-antiky -- --open /?profile=smoke
```

Omit `profile=smoke` for the mandatory 2560 × 1440 heavy workload, or use
`profile=extreme` for 3840 × 2160.
