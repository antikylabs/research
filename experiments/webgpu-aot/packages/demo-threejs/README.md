# Three.js native Sponza baseline

This package expresses the shared heavy workload through Three.js's normal
runtime WebGPU architecture. `GLTFLoader` owns the 103-primitive Sponza scene
and its materials, `HDRCubeTextureLoader` supplies the sky and image-based
lighting, and the complete 474-light deterministic simulation drives all 406
visible particles. Three's forward material graph specializes once per native
analytic light, so 32 representative light slots are used per frame; expanding
all 474 into every material shader caused Chrome to stall during compilation.

The native TSL render pipeline uses two 4096 × 4096 `CSMShadowNode` cascades, a
normal/velocity prepass, full-resolution GTAO with its denoiser, a three-target
scene MRT, TRAA, 30-step SSR with roughness blur, bloom, and final composition.
Three.js performs its normal runtime node compilation and resource management;
this package deliberately does not call the shared low-level renderer.

Run `npm run dev --workspace demo-threejs`, then choose `?profile=smoke` for
development, `?profile=heavy` for the fixed 2560 × 1440 benchmark, or
`?profile=extreme` for the fixed 3840 × 2160 tier.
