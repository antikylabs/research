# Standard TypeGPU Sponza demo

This is the runtime-compilation control. Its final-composition shader uses a
typed TypeGPU bind-group layout and calls `tgpu.resolve` in the browser before
the shared renderer initializes. That resolution time is included in the
published startup metric, and the TypeGPU resolver remains in the production
bundle.

The remaining renderer stages come from the shared raw-WebGPU Sponza workload,
so the geometry, assets, lights, pass graph, fixed time step, and profiles are
identical to the low-level AOT demos.

```sh
npm run build --workspace demo-typegpu
npm run dev --workspace demo-typegpu -- --open /?profile=smoke
```

Omit `profile=smoke` for the mandatory 2560 × 1440 heavy workload, or use
`profile=extreme` for 3840 × 2160.
