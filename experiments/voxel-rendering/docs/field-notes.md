# Voxel pipeline comparison field notes

The greedy surface mesh is the best candidate for Antiky's first production voxel renderer. It
gives the engine an ordinary raster surface, the Studio an immediate preview, and artists a clear
physical-to-graphic presentation control. Exposed-face instancing is the useful comparison and a
credible stylized fallback. Dense DDA path tracing proves a different lighting direction, but its
current cost and BroMetal integration make it research work rather than the default renderer.

These conclusions are based on source review, deterministic CPU receipts, compiled shaders, tests,
type checking, production builds, an Antiky managed capture, and a live Chromium/WebGPU inspection.
They are not based on GPU frame-time benchmarks. The [execution summary](./summary.md) and [visual
evidence index](./evidence/README.md) record the exact environment and artifacts.

## What the live pass changed

All six renderer/presentation combinations produced distinct images at the same 1280 × 720 camera.
The greedy physical image was the cleanest controlled result: large merged surfaces, corner AO,
palette identity, and emissive fixtures remained readable. Its graphic presentation shifted toward
cooler light bands without changing the geometry. Face instances made the original voxel stepping
more explicit; its graphic presentation produced the strongest palette-led, poster-like result.

The dense tracer reached 256 running-mean samples. Bright sky, emissive fixtures, and warm secondary
contribution around the open interior proved that the traversal was doing more than a primary-ray
palette lookup. It also showed the ceiling clearly: enclosed faces are too dark, emissive-adjacent
regions retain noise, and the graphic environment bands dominate the silhouette. This is a useful
indirect-light reference, not a hyperrealistic renderer or a real-time performance claim.

Live interaction found one issue that automated tests had missed. React's passive wheel listener
reported an error when the camera tried to cancel page scrolling. A native `{ passive: false }`
listener and cleanup regression test fixed it. The final standalone pass exercised orbit, zoom,
renderer and presentation switching, and a real local `.vox` upload with no console errors.

## The same scene produces three different workloads

Run `npm run measure` to reproduce this table. The measurements use the original Lumen Observatory
scene with fingerprint `915929bf` and dimensions 32 × 24 × 32.

| Measurement | Greedy mesh | Face instances | Dense DDA |
| --- | ---: | ---: | ---: |
| Occupied voxels | 4,546 | 4,546 | 4,546 |
| Exposed unit faces | 3,900 | 3,900 | n/a |
| Submitted quads | 1,737 | 3,900 | 1 fullscreen quad per pass |
| Submitted triangles | 3,474 | 7,800 | 2 per pass |
| Immutable scene payload | 402,984 B | 249,676 B | 401,408 B |
| Deterministic receipt | `b3dcddf9` | `73677848` | dimensions + byte cap |
| Traversal limit | n/a | n/a | 91 cells per ray |

The two raster paths remove the same 23,376 internal candidate faces. The greedy compiler then
reduces 3,900 exposed unit faces to 1,737 AO- and material-compatible quads. That is a 2.25:1 face
reduction for this scene.

The greedy payload is larger than the instance payload despite submitting fewer triangles. Each
greedy vertex repeats position, normal, color, material, emission, and AO values. Each face instance
instead shares one 76-byte quad and supplies 64 bytes of instance data. A production mesh format
could close this gap with packed normals, palette/material indices, smaller indices where possible,
and interleaved vertex layouts. The current receipt intentionally measures the straightforward
proof, not an estimated optimized format.

The dense volume contains 24,576 `vec4` elements: 393,216 bytes for cells and 8,192 bytes for two
256-entry material tables. Its two RGBA16F accumulation targets add 16 bytes per viewport pixel. At
1280 × 720, those targets would add 14,745,600 bytes and the four-traversal ceiling would be
3,686,400 rays per new sample. Those are arithmetic budgets, not measured GPU residency or work.

## What each pipeline proved

### Greedy mesh

The compiler performs six-direction exposure checks, removes internal faces, and merges only faces
whose palette and four-corner AO signatures agree. It selects each quad diagonal from the AO values
instead of forcing one diagonal across the model. Tests cover empty, single, solid, detailed,
material-split, AO-split, winding, integrity, and input-order cases.

The shader is an authored typed BroMetal program. Its physical path uses linear palette colors,
Cook–Torrance/GGX direct light, a stated hemispherical environment approximation, emission, fog,
ACES tone mapping, and an sRGB output transform. Its graphic presentation keeps the same geometry
and adds bands and rim light.

This is the strongest production direction because it converts voxel data into conventional static
raster geometry. It can enter existing culling, shadow, material, picking, and asset-cache systems
without keeping voxel traversal in every fragment.

### Face instances

The compiler reconstructs six stable outward-facing orientations from one shared quad, supplies one
instance per exposed face, and computes AO on the outside face plane. Tests prove winding, normals,
internal-face removal, AO truth cases, solid and porous counts, attribute agreement, deterministic
ordering, and the generated shader contract.

The approach has the smallest current scene payload and one opaque draw. Its graphic shader makes
face direction and palette structure explicit, while its physical alternative retains metal,
roughness, emission, fog, and an opaque/tinted glass approximation.

This path remains useful when the voxel grid itself is part of the intended look or when rapid scene
recompilation matters more than the lowest triangle count. It does not preserve one instance per
voxel; it is specifically an exposed-face representation.

### Dense DDA path trace

The CPU oracle and tests cover outside and inside starts, parallel rays, negative directions, face,
edge and corner ties, clean misses, and traversal-cap exhaustion. The GPU sample shader contains
separate bounded primary, direct-shadow, first-secondary, and second-secondary DDA loops. It reads a
dense palette-index volume and material tables, applies jittered sampling, and writes a running mean
into two ping-pong RGBA16F targets. A separate pass performs tone mapping and graphic grading so a
presentation-only change does not reset accumulated radiance.

Scene, camera, viewport, material/light, and integrator changes do reset the sample generation. The
first sample has unit weight, so it replaces old target content without requiring a separate clear
pass. Sampling stops at 256 accumulated samples until a sample-defining input changes.

This proves that BroMetal 0.18 can express bounded storage-buffer voxel traversal and progressive
accumulation through its public API. It does not prove real-time path-tracing performance,
photorealism, temporal stability, denoising quality, sparse-world scaling, or browser compatibility.

## What changed after implementation

The original request named a future Next.js Studio integration. The current Antiky Studio is a
Vite/React/Tauri application, so the experiment follows its visual language and resource-lifecycle
boundaries instead of designing a stale framework adapter.

BroMetal 0.18 has no public one-frame presentation method. Each approach therefore owns one
official `renderer.loop()` and the React host publishes its latest camera, style, and time state.
Antiky's installed BroMetal copy already adds `renderer.present()` through a local patch. A future
merge can use that host-owned frame boundary without copying the patch into this independent study.

The implementation also made the `.vox` promise narrower and more testable. It accepts bounded base
models and material dictionaries, but it reports scene graph and animation chunks instead of
claiming complete MagicaVoxel world import. Glass is consistently labeled as opaque/tinted because
none of the three proofs implements sorted transparency or refraction.

Finally, AO-aware merging is deliberately stricter than a palette-only greedy mesh. It keeps the
lighting data valid, but it also leaves more quads. The receipt makes that tradeoff visible rather
than describing greedy meshing as universally compact.

## Work required before an Antiky merge

| Owner | Required work |
| --- | --- |
| BroMetal | Decide whether to upstream a supported host-owned one-frame API; add reusable cube/volume sampling helpers only after another consumer proves their shape; keep generated WGSL reviewable. |
| Framework | Define a versioned immutable voxel scene/material resource; choose packed derived formats; connect lifetime, culling, shadows, picking, and device-loss recovery; benchmark representative assets before selecting thresholds. |
| CLI | Validate and normalize `.vox` inputs ahead of runtime; emit provenance and conversion receipts; derive and cache mesh, instance, or volume payloads; reject unsupported scene semantics explicitly. |
| Studio | Reuse the Framework resource instead of owning a renderer; add import diagnostics, model selection, presentation controls, and deterministic preview cameras; test the Tauri WebView separately from Chromium. |

The recommended next experiment is to integrate the greedy mesh as a derived Framework resource and
measure it against packed face instances on several real Antiky scenes. Keep the dense path tracer as
a lighting reference until live GPU evidence identifies a specific sparse structure, denoiser, or
BroMetal capability worth adding.
