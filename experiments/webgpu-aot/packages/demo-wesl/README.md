# WESL static-link Sponza demo

This renderer owns its complete raw-WebGPU runtime and uses the WESL Vite
plugin only at build time. Renderer-local modules statically link scene, PBR,
environment, shadow, reflection, bloom, noise, and tone-map functions into
plain WGSL before the browser starts.

Startup decodes the six pinned Radiance faces and runs WESL compute pipelines
that build a nine-level GGX specular cube, cosine-convolved diffuse cube, and
split-sum BRDF lookup texture. Its per-frame graph uses two fitted directional
shadow cascades, an alpha-aware depth prepass, screen-space ambient compute and
blur, HDR environment background and forward PBR shading, additive particles,
screen-space reflection reconstruction, Gaussian bloom, FXAA, and tone mapping.
It shares only the pinned input data in `benchmark-assets/` with the other
demos.

```sh
npm run build --workspace demo-wesl
npm run dev --workspace demo-wesl -- --open /?profile=smoke
```

Omit `profile=smoke` for the 2560 × 1440 heavy workload, or use
`profile=extreme` for 3840 × 2160.
