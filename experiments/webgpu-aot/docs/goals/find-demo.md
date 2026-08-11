## 2. Find an Appropriate Demo

Reference: @../resources/*

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

## Decision

Use Georgi Nikolov's raw-WebGPU [Sponza demo](https://gnikoloff.github.io/webgpu-sponza-demo/), pinned to commit [`1c90e984b224089bdc51e492df6f799a1660694c`](https://github.com/gnikoloff/webgpu-sponza-demo/tree/1c90e984b224089bdc51e492df6f799a1660694c), as the shared visual and rendering workload.

The mandatory workload is the fixed **heavy** preset below, not the live demo's adaptive configuration. A second **extreme** 4K tier is required to keep the comparison useful on fast discrete GPUs.

### Why this demo

| Goal | Evidence and decision |
| --- | --- |
| Meaningful shader complexity | The pinned renderer contains 35 WGSL-bearing shader modules, 2,711 lines, and 88,225 bytes of shader source. It covers textured PBR, cascaded variance shadows, deferred lighting, compute-driven lights, SSAO, Hi-Z SSR, TAA, bloom, and image-based lighting. |
| Textures and materials | The glTF has 25 materials and 69 images. All 25 materials use base-color textures, 24 use metallic-roughness textures, and 24 use normal textures; three materials are alpha-masked and double-sided. |
| Lighting and animation | One directional light and 474 point lights illuminate the scene. Of the point lights, 470 move in a compute pass and 406 also render as animated billboard particles. |
| Multiple objects | The scene has 103 material primitives containing 192,496 vertices and 262,267 triangles. Relevant geometry is submitted again for the two shadow cascades and G-buffer instead of appearing in one trivial draw. |
| Post-processing | The measured path includes SSAO and blur, Hi-Z depth construction and SSR, TAA resolve, bloom downscale/upscale, and final composition. These are part of the workload, not optional showcase controls. |
| Measurable GPU work | At 2560 x 1440 the renderer fills three G-buffer targets plus depth, performs multiple full-screen render and compute passes, shades hundreds of lights, and builds post-process pyramids. The 3840 x 2160 tier raises pixel work by 2.25 times without changing scene content. |
| Measurable startup work | The Sponza scene contributes 40,317,757 bytes of runtime source assets when its precompressed duplicate buffer is excluded. Startup must parse glTF, decode and upload the texture set, allocate the render graph, build shader pipelines, and generate diffuse/specular IBL plus a BRDF LUT. |
| Portability | The reference is TypeScript over the WebGPU API, glTF, and WGSL rather than a Three.js object-model showcase. Every renderer still has to implement a serious render graph, which is intentional for this experiment. |
| Licensing | The demo code is MIT-licensed. Its Sponza derivative traces to the Khronos sample's public-use donation and attribution history. Preserve both sets of notices and do not vendor the unused lens-dirt image, whose filename identifies a third-party work but whose grant is not documented in the demo. |

### Shared workload contract

Every implementation must preserve these inputs and behaviors:

* the complete pinned Sponza geometry, material, texture, and environment set, excluding only the unused lens-dirt image and the duplicate `Sponza.bin.gz`
* a fixed perspective camera with 70 degree vertical field of view, near/far planes of `0.1` and `100`, position `(9.3, 3.4, -0.35)`, and target `(0, 2, 0)`; the source intro animation and free camera are disabled
* the source directional-light defaults: intensity `2` and position `(0.1, 100, 0.1)`
* all 474 point lights, including both floors, with the source motion paths and the applicable 406 billboard particles enabled
* the source's light-placement formulas driven by the Mulberry32 PRNG with seed `0x53504f4e`; the first implementation must vendor the resulting initial light data, after which that data is authoritative for every renderer
* two 4096 x 4096 shadow cascades, the three-target deferred G-buffer and `depth24plus-stencil8` target, SSAO with blur, deferred directional/ambient lighting, stencil-volume point lighting, alpha-masked forward rendering, skybox/IBL, Hi-Z SSR, TAA, bloom, and final composition
* source quality values unless this document overrides them: Hi-Z SSR with 30 iterations, SSAO kernel size `8`, radius `0.5`, strength `2`, and bloom filter radius `0.0035`
* a fixed-step simulation at `1/60` second per rendered frame; after pipeline warm-up, reset simulation and temporal history before capturing reference frames at simulation times `0`, `5`, and `10` seconds
* identical texture formats, render-target formats, mip counts, sampling, tone mapping, and output color encoding wherever WebGPU exposes equivalent behavior

The **heavy** tier renders to a fixed 2560 x 1440 backing buffer. The **extreme** tier renders to 3840 x 2160. CSS size and `devicePixelRatio` must not alter either internal resolution. A 1280 x 720 smoke mode may exist for development, but its results must never be reported as benchmark results.

The source's performance governor is disabled. It must never turn off bloom, SSAO, or SSR based on frame rate. Benchmark controls are locked, and the workload is invalid if an implementation changes the resolution, light count, scene contents, effect graph, or quality values during a run.

Frameworks may structure CPU-side code naturally, but they must not simplify the shaders, fuse away measured stages for only one implementation, or substitute a cheaper rendering technique. Record total GPU frame time with timestamp queries when supported; per-pass timestamps are strongly preferred so a fast total can still be explained.

### Pinned assets

The commit pins the complete reference source. These independently measured values are acceptance checks when the shared assets are vendored:

| Check | Expected value |
| --- | ---: |
| Sponza glTF manifest | 159,852 bytes; SHA-256 `c7dd2dc0ab0a08bc7f6fbcbd96b98c221cd412c3ab2f2b12e2af62e0b39e54cf` |
| Sponza scene asset tree | 72 files; 45,632,518 bytes including the unused precompressed buffer |
| Sponza runtime source files | 40,317,757 bytes after excluding `Sponza.bin.gz` |
| Scene structure | 1 mesh, 103 primitives, 192,496 vertices, 262,267 triangles |
| Material structure | 25 materials, 69 images, 3 alpha-masked/double-sided materials |
| Shader source | 35 modules, 2,711 lines, 88,225 bytes |

Do not replace the source assets with a different Sponza conversion: primitive grouping, texture formats, alpha masks, and upload behavior are part of the benchmark. Store content hashes for every vendored file in the shared asset manifest when implementation begins.

When code, shaders, or assets are copied into the repository, include the demo's full MIT notice and retain the [Khronos Sponza credits and usage notice](https://github.com/KhronosGroup/glTF-Sample-Models/blob/main/2.0/Sponza/README.md), including Marko Dabrovic, Frank Meinl, Morgan McGuire, Alexandre Pestana, and Crytek. Record every modification. The unused `dust_particles_on_lens_by_kerast_d7mj0cr.jpg` is explicitly outside the shared workload and must not be copied.

### Alternatives considered

| Demo | Reason not selected |
| --- | --- |
| Three.js WebGPU TSL Earth | Rejected after browser testing. It submits only 16,128 triangles in two draws and has no post-processing graph, so it is visually interesting but not a stress workload. |
| [Three.js dynamic lights](https://threejs.org/examples/webgpu_lights_dynamic.html) | Its 100 meshes and 50 PBR materials exercise many lights, but the procedural scene lacks the texture volume, geometry, and post-processing breadth of Sponza. |
| Three.js SSGI ball pool | Heavy physics and post-processing, but physics becomes a major independent dependency and the scene does not provide the same textured-asset startup workload. |
| Intel's new Sponza | Its license is explicit, but the 3.71 GB package is impractical for normal browser iteration and would make network transfer dominate startup measurements. |
| WebGL Aquarium | Scales object count well, but its legacy render path has much less shader and post-process breadth and more complicated asset provenance. |

This Sponza preset is deliberately larger than a normal tutorial demo. It makes shader resolution, pipeline creation, resource binding, texture upload, render-graph construction, and sustained GPU behavior measurable while keeping the authoritative workload independent of any one renderer's scene API.
