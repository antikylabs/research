# 03 — GPU voxel traversal and progressive path tracing

**Research date:** 2026-08-16  
**Scope:** A browser WebGPU renderer that imports MagicaVoxel `.vox`, traverses voxels on the GPU,
and progressively converges toward a lit image. This is field research, not an implementation or a
decision to change Antiky's renderer boundary.

## Evidence labels

- **Established** — verified in current repository code, an accepted Antiky ADR, a specification,
  or the named upstream source.
- **Claimed** — reported by a project or author but not reproduced here.
- **Inferred** — an engineering conclusion from established evidence.
- **Gap** — requires a prototype, corpus, benchmark, owner decision, or upstream change.

External source inspection used the current WebGPU and WGSL drafts on 2026-08-16 and
WebGPU-.vox commit
[`79a36fab0ba0c922d20f73e24f575d4183f987a4`](https://github.com/AddisonPrairie/WebGPU-.vox/tree/79a36fab0ba0c922d20f73e24f575d4183f987a4).
Fast-moving platform and dependency facts must be rechecked when implementation starts.

## Headline finding

**Inferred:** The right first ray-traversal proof is a tight, dense palette-index volume traversed
with 3D DDA in a fullscreen BroMetal fragment program, followed by a separate presentation program.
Progressive path tracing should ping-pong two accumulation targets, render one stochastic sample per
pixel per active frame, and reset only when a change invalidates radiance samples. Start with dense
data because it is the smallest end-to-end proof of `.vox` semantics, traversal correctness,
materials, accumulation, Studio hosting, and resource lifetime. Add empty-space hierarchy only after
GPU timings and representative `.vox` scenes show that traversal, rather than shading or resolution,
is the limiting cost.

This is not a recommendation to settle for a ray marcher. The proof should include secondary rays
and visible convergence. It is a recommendation to keep the acceleration structure simple until the
path tracer is correct and measurable.

There is one material constraint: **current BroMetal 0.18.0 can express the dense proof, but not a
clean port of WebGPU-.vox's integer, hierarchical renderer.** BroMetal has WebGPU-only rendering,
3D RGBA8 textures, RGBA16F render targets, build-time WGSL generation, compute stages, and float
storage buffers. Its TypeScript shader DSL does not expose integer types, integer texture loads,
bit operations, arrays/structs, `while`, `break`, storage textures, arbitrary target formats, or an
explicit raw-WGSL program API. A successful dense proof therefore establishes whether a small,
general BroMetal contribution is needed; it must not smuggle raw WebGPU objects around the library.

## Proposed end-to-end design

```text
.vox bytes
  -> bounded parser
  -> scene graph + models + palette/material records
  -> frame-0 transform/layer normalization
  -> tight palette-index volume + material table
  -> BroMetal 3D texture(s)
  -> fullscreen ray/path pass
       reads previous accumulation + volume/materials
       traces primary and secondary rays
       writes next accumulation
  -> fullscreen presentation pass
       exposure + tone map + selected style treatment
       writes canvas
```

### Ownership and module cuts

| Module | Owns | Does not own |
| --- | --- | --- |
| `vox/parse` | Binary bounds checks, chunks, dictionaries, model and scene records | GPU objects or rendering policy |
| `vox/normalize` | Scene traversal, transforms, hidden state, frame selection, tight bounds, overlap policy | File I/O or shader behavior |
| `render/voxel-volume` | BroMetal texture upload and replacement | Parser semantics |
| `render/path-tracer` | Camera rays, DDA, material sampling, bounces, RNG, accumulation and reset generation | Studio layout or world authority |
| `render/present` | Exposure, tone mapping, output transform, optional style-only postprocess | Accumulation validity |
| `game` | Host contract, resource construction/rollback, frame scheduling, input-to-camera mapping, exhaustive disposal | Generic Framework or Studio renderer ownership |

**Inferred:** Keep parser and normalization pure and CPU-testable. Keep shader source in focused
`*.shader.ts` modules and import only generated `*.shader.gen.ts` at runtime, matching the current
BroMetal demos. Generated files remain build artifacts, not editing surfaces.

**Inferred:** The first implementation should be a pure BroMetal game module, like Shader Study,
Solar Forge, and Luminous Reef. The host supplies the canvas and frame; the module creates the
renderer, programs, targets, textures, and camera state, then disposes children before
`renderer.destroy()`. That route is expressly permitted as the exception path in accepted
[ADR 0021](../../../../../antiky/docs/adr/framework/0021-brometal-render-driver-ownership_H.md), although
a production Antiky render feature should later move into `BroMetalRenderDriver` rather than make
direct use multiply.

### Pipeline organization

The minimum pipeline set is deliberately small:

1. **Path sample / accumulation pass.** A fullscreen quad runs one invocation per pixel. It jitters
   the camera sample, traces into the voxel AABB, evaluates direct and indirect light, reads the
   previous running mean, and writes the next mean.
2. **Presentation pass.** It reads the current mean and applies exposure, tone mapping, gamma/output
   conversion, and a selected stylized treatment. Presentation-only changes do not destroy samples.

Optional later passes must earn their cost:

- a first-hit normal/albedo/depth pass for denoising or debug visualization;
- an occupancy-pyramid build/upload step when sparse scenes prove DDA-bound;
- a denoiser after there is measured value and trustworthy auxiliary buffers; and
- a dedicated export pass if final-canvas PNG capture is insufficient.

**Inferred:** A fragment path pass is a better initial fit than compute. The output is already a 2D
image, BroMetal render targets provide persistent sampled state, and compute would still need a
present pass. Compute becomes valuable for building an acceleration hierarchy, wavefront queues,
or a denoiser—not simply because path tracing sounds compute-heavy.

## Dense grid versus sparse structures

### Dense, tight volume

**Established:** Amanatides and Woo's grid traversal advances from one voxel to its neighbor with
two floating-point comparisons and one addition after setup. See the original paper,
[A Fast Voxel Traversal Algorithm for Ray Tracing](https://physique.cmaisonneuve.qc.ca/svezina/projet/ray_tracer/download/A_Fast_Voxel_Traversal_Algorythm_For_Ray_Tracing.pdf).

**Inferred benefits:**

- one direct mapping from normalized scene coordinate to memory;
- predictable DDA and face-normal behavior;
- coherent reads for nearby primary rays;
- no tree builder, pointer encoding, stack, or traversal restart;
- easy CPU reference traversal for shader-result tests; and
- easy replacement when a new `.vox` file loads.

**Inferred costs:** memory is proportional to the volume's bounding box, and an empty room costs as
much as a solid block. Worst-case primary traversal crosses at most roughly `width + height + depth`
cells; every path bounce repeats traversal. Divergent rays and empty distances increase fragment
work even when few voxels are occupied.

Current BroMetal's `createTexture3D()` requires tightly packed RGBA8. If R stores the palette index
and the other channels are initially unused, source and GPU allocation estimates are:

| Bounds | RGBA8 volume | Comment |
| --- | ---: | --- |
| `64³` | 1 MiB | Tiny models and correctness fixtures |
| `128³` | 8 MiB | Comfortable first quality target |
| `256³` | 64 MiB | Plausible desktop proof, costly on integrated/mobile GPUs |
| `512³` | 512 MiB | Not a safe default in the current BroMetal representation |

These figures exclude the parser's model records, material tables, accumulation targets, depth/MSAA
attachments, pipelines, and browser/driver overhead. The WebGPU default
[`maxTextureDimension3D` is 2048](https://gpuweb.github.io/gpuweb/#dom-supported-limits-maxtexturedimension3d),
but a dimension limit is not a memory budget. The importer needs its own voxel-count, byte-size, and
render-pixel limits.

**Gap:** BroMetal has no one-byte, nearest, unsigned 3D texture API. An `r8uint` or `r8unorm` raw
volume would use one quarter of the RGBA8 memory. This is a narrow, renderer-general candidate for
an upstream BroMetal contribution if the prototype shows volume memory matters.

### Sparse voxel octree or hierarchy

**Established:** Laine and Karras describe a compact GPU sparse voxel octree and efficient ray-cast
algorithm, including the memory/locality and traversal machinery that make it substantially more
than “skip empty cells.” See NVIDIA Research's
[paper page](https://research.nvidia.com/publication/2010-02_efficient-sparse-voxel-octrees) and
[extended technical report](https://research.nvidia.com/sites/default/files/pubs/2010-02_Efficient-Sparse-Voxel/laine2010tr1_paper.pdf).

**Inferred benefits:** empty regions can be skipped at coarse levels; storage follows occupied
structure more closely; large, sparse scenes and multiple levels of detail become feasible.

**Inferred costs:** construction and replacement are more complex; traversal introduces dependent
reads and divergent control; stack/restart strategy and node encoding become shader-wide design
choices; debugging a missed surface is harder; transforms and animation can force rebuilding; and a
GPU builder needs significant temporary storage and careful synchronization.

### What WebGPU-.vox actually demonstrates

**Established from source:** WebGPU-.vox is a useful hybrid precedent, not a ready-made sparse data
model. It retains a fixed dense `Uint8Array` CPU scene, packs voxel indices into an `rg32uint` 3D
texture, builds an occupancy hierarchy with compute, and stores that hierarchy in an `r8uint` 3D
texture. See its
[`voxels.js` scene resources](https://github.com/AddisonPrairie/WebGPU-.vox/blob/79a36fab0ba0c922d20f73e24f575d4183f987a4/js/voxels.js#L581-L605),
[`uploadScene()` builder](https://github.com/AddisonPrairie/WebGPU-.vox/blob/79a36fab0ba0c922d20f73e24f575d4183f987a4/js/voxels.js#L710-L789),
and
[`traceVoxels()`](https://github.com/AddisonPrairie/WebGPU-.vox/blob/79a36fab0ba0c922d20f73e24f575d4183f987a4/js/voxels.js#L113-L248).

At its fixed `512³` size, source-derived allocations include about 128 MiB for the CPU scene,
128 MiB for the `rg32uint` scene texture, 32 MiB for the octree texture, and about 192 MiB of
temporary acceleration buffers. Two 1920×1080 `rgba32float` accumulation textures add about
63.3 MiB. These are arithmetic estimates, not a measured memory profile.

**Inferred recommendation:** Dense DDA is phase one. A dense mip/occupancy hierarchy or sparse brick
map is the middle option if measurements demand empty-space skipping. A pointer-like SVO is phase
three, after a representative corpus proves that its complexity buys a scene size or frame-time
result the middle option cannot.

## `.vox` ingestion contract

**Established:** The official format is a little-endian, chunked `VOX ` file. The base document
defines `MAIN`, optional `PACK`, paired `SIZE`/`XYZI` model chunks, and optional `RGBA`. The
extension defines multiple models, string/dictionary encoding, orthogonal rotations, transform,
group and shape nodes, material records, layers, render settings, and camera records:

- [Official base format](https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.txt)
- [Official extension](https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox-extension.txt)

**Inferred minimum accepted semantics for this experiment:**

- verify all four magic bytes, version, `MAIN`, and chunk bounds before reading content;
- parse multiple `SIZE`/`XYZI` models and the default palette fallback;
- parse `RGBA`, `MATL`, `nTRN`, `nGRP`, `nSHP`, and `LAYR`;
- apply frame 0 transforms, including the encoded 24-way orthogonal rotation and translation;
- honor hidden nodes/layers and select the shape's frame-0 model;
- flatten the scene into a tight grid with an explicit coordinate convention and overlap rule;
- preserve palette index and supported material fields separately;
- skip unknown chunks by their declared bounded sizes and report their identifiers; and
- return diagnostics listing ignored animation frames, unsupported material keys, render metadata,
  or chunks rather than silently claiming full conformance.

The parser is a hostile-input boundary. Before allocation it must bound file bytes, chunk counts,
chunk content and child sizes, string/dictionary lengths, model count, voxel count, node count,
graph depth, output dimensions, output voxel count, and multiplication overflow. Scene traversal
needs missing-node, duplicate-node, cycle, and bad-model-reference checks. Parsing should be
iterative where possible and must not recursively trust chunk sizes.

**Established:** WebGPU-.vox's parser explicitly says it needs a rewrite, checks only the first
three magic bytes, recursively consumes declared chunk sizes, begins scene traversal at hard-coded
node 1, applies the first transform frame's translation, and does not apply rotation or full layer
semantics in its flattening path. Its import path reads `MATL`, but uploads palette colors with
default material values. See
[`web.vox.js`](https://github.com/AddisonPrairie/WebGPU-.vox/blob/79a36fab0ba0c922d20f73e24f575d4183f987a4/js/web.vox.js#L1-L190)
and
[`main.js` import](https://github.com/AddisonPrairie/WebGPU-.vox/blob/79a36fab0ba0c922d20f73e24f575d4183f987a4/js/main.js#L135-L182).
It is architectural evidence and a source of test ideas, not the parser to adopt.

**Inferred:** A standard triangle model is not an interchangeable input to this renderer. glTF or
OBJ would require a voxelization policy for resolution, watertightness, interior fill, materials,
thin surfaces, and scale. That is asset compilation, not rendering. Begin with `.vox`; keep a
future mesh-to-volume adapter outside the parser and renderer.

**Gap:** The format documents do not constitute a conformance corpus. Collect small licensed files
covering one model, multiple models, nested transforms, every rotation, hidden layers, overlapping
models, materials, absent/present palette, animation frames, unknown chunks, truncated chunks,
oversized counts, and graph cycles. Expected normalized output must be asserted independently of
the GPU.

## DDA and path-tracing shader shape

### Traversal invariants

- Intersect the ray with the tight volume AABB before DDA.
- Move the start point just inside the box using a scale-aware epsilon.
- Derive integer cell, step signs, next-boundary distances, and per-axis distance increments once.
- Advance all axes tied for the minimum distance, not an arbitrary single axis, so edge/corner hits
  do not double-visit or leave cracks.
- Define rays with zero direction components without producing a NaN comparison.
- Return distance, material index, outward face normal, and whether the ray escaped.
- Offset secondary-ray origins along the geometric normal with a scene-scale epsilon.
- Cap traversal and bounce count; a cap produces a visible diagnostic mode rather than silently
  treating exhaustion as a miss.

**Inferred BroMetal constraint:** The DSL has no `break` or early return, and `texture()` directly
inside divergent control can trigger WGSL derivative-uniformity problems. BroMetal documents that
texture sampling in a helper emits an explicit level-zero sample. The dense proof should therefore
put nearest volume sampling in a small helper and use a statically bounded loop with a hit/alive
mask. If the wasted post-hit iterations dominate, `break`/safe explicit-level sampling is a narrow
upstream requirement—not a reason to create a second private shader system.

### Path sample

A credible first integrator should have:

- subpixel camera jitter and a deterministic per-pixel/per-sample RNG seed;
- direct sun/area-light visibility with a shadow DDA;
- diffuse and emissive materials;
- one GGX-like metallic/rough surface path or a clearly named approximation;
- at least two secondary bounces, with a bounded maximum;
- cosine-weighted diffuse sampling and throughput/PDF accounting;
- Russian roulette only after the fixed low-depth proof is correct; and
- NaN/Inf containment and debug views for normal, material index, steps, bounce count, and sample
  count.

PBRT's [simple path tracer](https://www.pbr-book.org/4ed/Light_Transport_I_Surface_Reflection/A_Simple_Path_Tracer)
and [better path tracer](https://pbr-book.org/4ed/Light_Transport_I_Surface_Reflection/A_Better_Path_Tracer)
are authoritative references for throughput, PDFs, light sampling, MIS, and Russian roulette. PBRT
v4 code is [Apache-2.0](https://github.com/mmp/pbrt-v4/blob/master/LICENSE.txt), but the WebGPU/WGSL
implementation should still be written for this renderer and attributed if code is adapted.

## Accumulation and reset contract

Use two same-size floating-point targets and swap roles each sample. Store the running mean rather
than an unbounded radiance sum:

```text
nextMean = previousMean + (sampleRadiance - previousMean) / sampleCount
```

This avoids radiance sum growth, but it does not remove precision loss at high sample counts.
Current BroMetal targets are RGBA16F. At 1920×1080, two targets are about 31.6 MiB; WebGPU-.vox uses
RGBA32F, about 63.3 MiB for the pair, and recreates them on resize. See its
[`onResize()`](https://github.com/AddisonPrairie/WebGPU-.vox/blob/79a36fab0ba0c922d20f73e24f575d4183f987a4/js/voxels.js#L909-L980)
and
[`frame()`](https://github.com/AddisonPrairie/WebGPU-.vox/blob/79a36fab0ba0c922d20f73e24f575d4183f987a4/js/voxels.js#L1006-L1104).

**Reset to sample 0 and clear/replace both targets when any sample-defining value changes:**

- canvas backing width/height, render scale, DPR projection, or camera projection;
- camera position/orientation, aperture, focus distance, shutter/time sample;
- voxel occupancy, scene transform, visible layer/frame, or volume bounds;
- palette or physical material parameters;
- light position/direction/shape/intensity, sky/environment, or emission;
- bounce limit, sampling distribution, RNG sequence definition, or integrator mode; or
- shader version/hot reload or device/resource reconstruction.

**Do not reset for presentation-only changes:** exposure, tone-map operator, gamma/output mapping,
stylized color grading, UI chrome, debug overlay visibility, or saving the current image. A change
from “stop at 128” to “stop at 512” continues existing samples; lowering the cap only stops future
work.

Reset must be generation-based. A file load or upload that completes after a newer scene/camera
generation must dispose its resources and must not publish or increment the current sample. During
interactive camera movement, render one low-cost sample (or reduced resolution) per frame; after
input settles, replace/reset full-size targets and converge. Never blend samples from two cameras.

**Gap:** RGBA16F running-mean convergence must be measured. If it visibly stalls or biases bright
emissive/specular pixels, BroMetal needs an optional RGBA32F target format or a compensated
accumulation design. Do not guess from format names.

## Hyperrealistic and stylized ceiling

The two looks should share traversal, camera, material records, accumulation, and output resources.
Style belongs in named integrator/presentation choices, not in a second renderer.

### Stylized ceiling

The voxel representation naturally supports exact block silhouettes and per-cell palette identity.
A strong stylized mode can combine orthographic/isometric projection, hard or deliberately stepped
sun shadows, palette-preserving diffuse bands, ambient occlusion, emissive accents, distance fog,
outline/edge treatment, controlled bloom, dithering, and optional film grain. These are compatible
with low bounce counts and converge quickly. Presentation controls can change without reset when
they operate only on accumulated linear radiance.

### Hyperrealistic ceiling

Voxel faces do not prevent physically based light transport. A stronger mode can support diffuse,
rough conductor/dielectric response, emissive voxels, soft shadows, multiple indirect bounces,
depth of field, HDR environment lighting, next-event estimation, MIS, temporal/sample denoising,
and a color-managed display transform. PBRT documents why direct-light sampling and MIS materially
reduce variance in difficult lighting; brute-force extra bounces alone do not guarantee a good
image.

**Inferred current ceiling:** BroMetal 0.18.0 is sufficient for a beautiful small-scene progressive
renderer, but its RGBA16F-only targets, RGBA8-only raw 3D volume, restricted shader control flow,
float-only storage abstraction, and lack of HDR texture ingestion/raw integer texture operations
make a WebGPU-.vox-class hierarchical path tracer awkward. “Hyperrealistic” for the proof should
mean visibly converged indirect light, soft shadows, emissive response, rough/specular materials,
depth of field, and competent tone mapping—not a claim of production/offline-renderer parity.

## Performance observations and required measurements

Path-tracing work is approximately:

```text
render pixels × samples this frame × rays per path × cells/hierarchy nodes visited × shading cost
```

This makes physical output resolution and empty traversal at least as important as file byte size.
Studio's game panel is resizable and the current host/BroMetal path uses CSS size × DPR; a large
high-DPR panel can multiply cost and accumulation memory without changing the model.

Measure, do not merely display, at least:

- CPU parse and normalization time;
- normalized dimensions, occupied cells, occupancy ratio, source bytes, and upload bytes;
- acceleration-build time and temporary bytes if a hierarchy is added;
- canvas physical pixels, render scale, and accumulation bytes;
- GPU milliseconds for sample pass and presentation pass;
- DDA steps for primary, shadow, and secondary rays (average and high percentile);
- samples per second and time to fixed sample counts;
- resets by reason, cancelled imports/uploads, and frames skipped after convergence; and
- device-loss, validation, out-of-memory, and shader-compilation diagnostics.

Benchmark at minimum a dense small model, a sparse large-bounds scene, a layered/nested scene, an
emissive interior, a glossy exterior, 720p and 1080p, render scale 0.5 and 1, and at least integrated
and discrete GPU classes where available. WebGPU-.vox's README
[claims](https://github.com/AddisonPrairie/WebGPU-.vox/blob/79a36fab0ba0c922d20f73e24f575d4183f987a4/README.md)
512 samples in about five seconds on one laptop RTX 2060. That is a discovery signal, not an Antiky
budget or an independently reproduced benchmark.

## Antiky and Studio integration seams

**Established:** Current Studio owns panel placement and the iframe lifetime. The CLI game host owns
the canvas, raw input, backing-size updates, visibility, RAF, final-canvas capture, and game-instance
disposal. The game module owns renderer creation/destruction. Studio does not receive a renderer,
device, camera, texture, or BroMetal program. The current Studio-app research records the same
boundary in
[`04-webgpu-viewport-and-voxel-pressure.md`](../../../../../antiky/docs/project-planning/objectives/studio-apps/research/04-webgpu-viewport-and-voxel-pressure.md).

**Established:** Accepted
[`ADR 0021`](../../../../../antiky/docs/adr/framework/0021-brometal-render-driver-ownership_H.md)
makes `BroMetalRenderDriver` the default Framework path and permits a game module to use BroMetal
directly only when the driver cannot do the work. That direct module owns all its BroMetal resources
and receives none of the driver features.

**Inferred experiment seam:**

- package the proof as an `.antiky` project with the same Vite library output and `StudioGameEntry`
  shape as `packages/demos/brometal/*`;
- let the existing Studio shell supply the dark panel, titlebar, statusbar, resize, fullscreen, and
  iframe lifecycle instead of building a competing shell;
- report bounded renderer facts through the existing measurement callback; do not expose GPU
  handles;
- keep `.vox` parsing and CPU normalized scene state in the game module today;
- use host frame calls, but no-op after the sample cap until input or an invalidation resumes work;
- tear down programs, textures, targets, observers/listeners owned by the game, then the renderer;
  and
- make asynchronous parse/upload replacement transactional and generation-fenced.

**Inferred future merge seam:** A reusable Studio viewport should expose canvas mount/size,
scheduling, input, capture, structured diagnostics, and lifecycle—not voxel parsing, path tracer
controls, or raw WebGPU/BroMetal objects. If the renderer becomes an Antiky product feature, add
general capabilities to `BroMetalRenderDriver` (3D typed volume, target format, explicit-level
sampling/control flow, perhaps compute/storage improvements) rather than importing BroMetal into
Studio or Framework core. Renderer ownership or a durable VOX asset contract requires ADR/owner
review.

## Risks and failure evidence

| Risk | Required evidence or containment |
| --- | --- |
| Malformed or adversarial `.vox` | Bounds-first parser tests; fail before proportional allocation |
| Scene graph semantics silently lost | Corpus fixtures for transforms, rotations, layers, models, materials, frames |
| Dense volume explodes on sparse bounds | Explicit dimensions/bytes limit and diagnostic; measure occupancy before upload |
| DDA cracks, loops, or self-hits | CPU reference rays; axis/edge/corner/inside/parallel/negative-direction cases |
| DSL fixed loop wastes most work | GPU timing and step counters; narrow upstream `break`/sample-level proposal if proven |
| Half-float accumulation stalls | Pixel-level convergence comparison with an RGBA32F reference |
| Camera changes smear history | Central reset generation; test every invalidator and presentation non-invalidator |
| Resize/DPR churn reallocates repeatedly | Bounded size policy, deduplication/debounce, old-target disposal, reset reason |
| Late import/upload replaces a newer scene | Generation fence and construction rollback |
| Device loss or async GPU validation fails silently | BroMetal `onError`, visible failed state, resource reconstruction or terminal stop |
| One resource disposal throws | Continue reverse-order cleanup and aggregate/report failures |
| Beautiful sample is mistaken for scalable architecture | Publish scene/pixel/sample/GPU facts with every capture |
| Unlicensed upstream code enters the experiment | Provenance ledger and clean implementation from specifications/papers |

## License and provenance ledger

| Source | Status verified 2026-08-16 | Permitted use here |
| --- | --- | --- |
| [BroMetal](https://github.com/ericdrowell/brometal) | [MIT](https://github.com/ericdrowell/brometal/blob/main/LICENSE); Antiky pins 0.18.0 | Dependency, examples, and attributed adaptation under MIT notice |
| [ephtracy/voxel-model](https://github.com/ephtracy/voxel-model) | [MIT](https://github.com/ephtracy/voxel-model/blob/master/LICENSE) | Format documents and licensed fixture models, retaining notices where copied |
| [PBRT v4](https://github.com/mmp/pbrt-v4) | [Apache-2.0](https://github.com/mmp/pbrt-v4/blob/master/LICENSE.txt) | Reference or attributed adaptation with Apache notice requirements |
| [GPUWeb specifications](https://github.com/gpuweb/gpuweb) | [W3C licensing terms](https://github.com/gpuweb/gpuweb/blob/main/LICENSE.md) | Normative reference; do not treat specification text as drop-in shader code |
| [Amanatides and Woo paper](https://physique.cmaisonneuve.qc.ca/svezina/projet/ray_tracer/download/A_Fast_Voxel_Traversal_Algorythm_For_Ray_Tracing.pdf) | Paper citation, not a software license | Implement the published algorithm independently and cite it |
| [Laine and Karras SVO work](https://research.nvidia.com/publication/2010-02_efficient-sparse-voxel-octrees) | Paper/source have their own notices; no adoption proposed | Architectural research only unless a specific code artifact's license is separately audited |
| [WebGPU-.vox](https://github.com/AddisonPrairie/WebGPU-.vox/tree/79a36fab0ba0c922d20f73e24f575d4183f987a4) | **No repository license file or detected license**; GitHub license API returned 404 | Read-only architectural prior art. Do not copy, translate, adapt, or distribute its JS/WGSL/parser |

**Established legal constraint:** A public GitHub repository without a license does not grant the
permissions required by this goal. WebGPU-.vox's algorithms may point to papers/specification areas
to research, and its behavior may inspire independent tests, but its code must not be the source of
the implementation. Preserve a short `THIRD_PARTY_NOTICES`/provenance entry for any actual shader,
asset, or code adapted later; record source URL, revision, author, license, files used, and local
modifications.

## Decisions and gaps before implementation

1. **Recommended default:** dense tight volume, 128³ comfortable target, bounded up to 256³ only
   when memory policy permits; 2–4 path bounces; progressive running mean; one direct light plus sky
   and emissive voxels; stylized and physical presentation modes.
2. **Owner decision:** Is a small upstream BroMetal patch acceptable during the proof if measured
   blockers require R8 volume upload, RGBA32F accumulation, explicit-level sampling, or loop exit?
3. **Owner decision:** Which licensed `.vox` scene is the visual hero and redistribution fixture?
   The artwork links in the idea are inspiration, not permission to ship their models.
4. **Gap:** No representative import/conformance corpus exists yet.
5. **Gap:** No GPU measurements establish the practical dense-volume, output-pixel, bounce, or
   sample budgets in the target Tauri WebView and capture browser.
6. **Gap:** BroMetal RGBA16F accumulation quality and fixed-loop DDA cost are unmeasured.
7. **Gap:** The current host's synchronous `frame()` is adequate for one submitted sample per RAF,
   but a reusable invalidate/progressive scheduler is only a future Studio-app design question.

## Planning implication

Implement the dense path first as an isolated pure BroMetal demo with a bounded original `.vox`
parser and CPU traversal oracle. Prove a nontrivial imported scene, visible progressive convergence,
stylized and physical looks, reset correctness, error visibility, capture, and exhaustive teardown.
Capture the memory and GPU facts. Only then choose between keeping dense DDA, adding an occupancy
pyramid/brick map, or investing in a sparse octree and the BroMetal capabilities it would require.
