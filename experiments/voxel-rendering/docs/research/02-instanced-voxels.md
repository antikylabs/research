# Instanced visible voxel surfaces

Field notes for the rasterized implementation track. This track asks how far a conventional
WebGPU raster pipeline can take a loaded MagicaVoxel scene when BroMetal owns the shaders and GPU
runtime. It does not design an editor, a general Antiky asset format, or a path tracer.

Evidence labels in this note mean:

- **Established** — verified in an authoritative external source or the current checkout.
- **Claimed** — stated by a project or maintainer but not measured here.
- **Inferred** — a design conclusion drawn from established facts.
- **Gap** — an unanswered question that needs a prototype, corpus, or owner decision.

## Headline conclusion

**Inferred:** Build two deliberately close raster proofs from the same parsed scene:

1. one instanced unit cube for every voxel that is not fully enclosed; and
2. one instanced quad for every exposed voxel face.

The quad representation is the likely keeper. It preserves the hard voxel silhouette while never
submitting inward faces. The cube representation is valuable because it is the smallest correct
BroMetal baseline and makes the cost of the extra triangles measurable. Neither needs a GPU-driven
visibility system for the first proof: `.vox` data is static, so occupancy and exposed faces can be
computed once on the CPU and uploaded once.

This route has an excellent stylized ceiling: palette ramps, orthographic or perspective cameras,
per-face light quantization, occupancy ambient occlusion, fog, outlines, emissive bloom, water, and
animated lighting all fit rasterization well. It can also produce polished, materially rich images
with shadows and post-processing. It should not be described as a hyperrealistic substitute for
MagicaVoxel's interactive path tracer. Indirect light, glossy interreflection, accurate glass, and
progressive convergence are different work.

## Constraints already present in Antiky and BroMetal

### Product and Studio boundaries

**Established:** The objective requires browser WebGPU, shaders authored through BroMetal, `.vox`
or standard-model input, accessible shader source, and notes that preserve future Antiky
CLI/Framework/Studio boundaries. Rendering is in scope; voxel creation and editing are not. See
`research/experiments/voxel-rendering/docs/goal.md` and `docs/thoughts/idea.md`.

**Established:** The current Studio does not own the live game's canvas or GPU objects.
`StudioShell` mounts `LiveGameFrame`, and the sandboxed iframe receives the `webgpu` permission.
The CLI game host owns canvas, platform time, input, frame scheduling, and cleanup; the game module
owns renderer construction; the Framework BroMetal driver owns its GPU children on the default
Framework path. These boundaries are recorded in:

- `antiky/packages/studio/app/src/components/StudioShell.tsx`
- `antiky/packages/studio/app/src/components/LiveGameFrame.tsx`
- `antiky/docs/adr/framework/0020-keep-game-code-and-game-hosts-in-different-modules_H.md`
- `antiky/docs/adr/framework/0021-brometal-render-driver-ownership_H.md`
- `antiky/docs/project-planning/objectives/studio-apps/research/04-webgpu-viewport-and-voxel-pressure.md`

**Inferred:** The experiment should first be a normal compiled Antiky game module displayed through
the existing iframe lane. Making it an in-process Studio WebGPU panel would prematurely choose a
device/canvas ownership policy that the current Studio-app research explicitly leaves open.

### Current BroMetal behavior (pinned `0.18.0`)

**Established by reading the installed package and Antiky demos:**

- `shader({ instanceAttributes: ... })` produces per-instance vertex inputs. Calling
  `program.draw()` automatically uses the common uploaded instance count.
- Every declared vertex or instance attribute is uploaded as a separate float buffer. All instance
  attribute counts must agree. The public handle accepts only `Float32Array`.
- `draw()` exposes no instance-count, first-instance, or indirect-draw argument. The full runtime
  has compute dispatch and storage buffers, but it does not expose a GPU-generated visible count to
  a render draw.
- Programs, not the renderer, own their attribute buffers. Two programs that draw the same voxel
  instances (for example a shadow program and a surface program) duplicate those attribute
  buffers through the high-level API.
- The renderer supports back-face culling, depth testing, 4x multisampling by default, alpha or
  additive blend modes, `rgba16float` render targets, texture sampling, a 3D texture, texture
  arrays, storage buffers, and an error callback.
- `createRenderer(canvas)` requests and owns one device, configures the canvas, observes resize,
  reports uncaptured errors/device loss, and destroys the device on `renderer.destroy()`. A lost
  device is reported but not rebuilt.
- The shader DSL exposes floats and float vectors, not integer vertex attributes, packed formats,
  bit operations, arbitrary arrays, or a built-in instance index.

The decisive sources in this checkout are
`antiky/node_modules/brometal/dist/runtime/program.d.ts`,
`antiky/node_modules/brometal/dist/runtime/webgpu.js`,
`antiky/node_modules/brometal/dist/dsl/types.d.ts`, and
`antiky/node_modules/brometal/dist/runtime/texture.d.ts`.

**Established:** The WebGPU specification supports per-instance vertex stepping and explicit or
indirect instance counts. The narrower behavior above is a BroMetal API limit, not a WebGPU limit.
WebGPU's default guaranteed limits include 8 vertex buffers, 16 vertex attributes, a 256 MiB
maximum buffer, and a 128 MiB maximum storage binding. An adapter may expose more, but code cannot
assume more without requesting and checking it. See the WebGPU
[vertex-state definition](https://gpuweb.github.io/gpuweb/#vertex-state),
[rendering commands](https://gpuweb.github.io/gpuweb/#rendering-operations), and
[supported limits](https://gpuweb.github.io/gpuweb/#limits).

**Inferred:** CPU-built, immutable visible instance buffers are the deep/simple module for this
track. Compute compaction plus indirect draw would require a real BroMetal capability, not a shader
trick hidden in the experiment.

## Rendering representation

### Candidate A — visible-voxel cube instances

Create one unit cube geometry and upload one instance for each occupied voxel that has at least one
empty neighbor. Instance data is position plus either a palette index or expanded color/material
values. Depth testing and `cull: 'back'` do the ordinary camera-facing work.

Strengths:

- smallest implementation and easiest correctness oracle;
- exactly one opaque draw for one material class;
- naturally works with BroMetal's current instancing API; and
- keeps sharp corners and one normal per cube face.

Costs:

- a retained surface voxel submits all six cube faces even if only one is exposed;
- a BroMetal cube has 24 vertices and 36 indices because normals/UVs are face-local; and
- fully hidden triangles are still transformed, clipped, and possibly rasterized before depth
  rejects them.

### Candidate B — exposed-face quad instances

Create one four-vertex unit quad. For each occupied voxel, inspect its six axis neighbors and emit
an instance only when that neighbor is empty (or when the material-boundary policy says the
interface remains visible). Each instance carries:

- voxel position (`vec3`, 12 bytes);
- face orientation (`float`, 4 bytes); and
- palette index (`float`, 4 bytes), or expanded color (`vec3`, 12 bytes).

The vertex shader maps the shared quad to one of six axis-aligned faces from the face code and
reconstructs the exact normal. A 256×1 nearest-filtered palette texture lets the small form remain
20 bytes per face before optional AO/material data. BroMetal can create that lookup texture from a
canvas with `{ filter: 'nearest', wrap: 'clamp', lodMaxClamp: 0 }`.

Strengths:

- only exposed triangles reach the pipeline;
- orientation and normal need one float rather than a normal vector;
- it retains per-voxel palette and face-level shading; and
- it makes the exposed-face count an honest `instances` metric.

Costs:

- a voxel with several exposed sides becomes several instances;
- branch-based face orientation is necessary in the present BroMetal DSL; and
- AO as four corner values costs another `vec4`/16 bytes per face because BroMetal cannot upload
  packed bytes.

### Candidate C — greedy surface mesh

A greedy mesher merges adjacent coplanar faces with compatible palette, material, and AO values.
It can remove far more triangles and instances from large flat areas, but it also introduces a
second topology algorithm, harder boundary tests, and rules for what may merge.

**Inferred:** Do not make greedy meshing part of the first comparison. It changes too many things at
once. Keep it as the next optimization only if measured face count or vertex cost is the bottleneck.
If it is added later, merge only faces whose palette, material class, orientation, and corner-AO
signature agree; otherwise optimization silently changes the art.

### Why face instancing is the likely keeper

For a solid `n × n × n` cube, exactly `6n²` outer faces are visible. Removing only fully enclosed
voxels leaves `n³ - (n - 2)³ = 6n² - 12n + 8` cube instances, each with 12 triangles. Face
instancing draws `12n²` triangles; visible-voxel cube instancing approaches six times that triangle
count. This is arithmetic, not a performance measurement. On thin or porous art the ratio is
smaller, which is why both paths must be profiled on representative scenes.

## Visibility strategy

Visibility is not one algorithm. Apply cheap tests at the layer that owns the required facts.

### Import-time topology visibility

1. Build an occupancy lookup for each normalized model instance or composed scene brick.
2. For each voxel, inspect the six axis neighbors.
3. Cube path: keep the voxel if any relevant neighbor is empty.
4. Quad path: emit one face for each relevant empty neighbor.
5. Optionally compute four-corner voxel AO from side/diagonal occupancy while the lookup is hot.

**Inferred:** For the first static proof, a dense `Uint8Array` indexed by local model dimensions is
the simplest neighbor lookup. Do not flatten an entire sparse world-scene bounding box: distant
scene nodes could make a tiny voxel count imply a huge allocation. Normalize each source model,
cache its topology once, and instance/model-transform the result through the scene graph.

**Gap:** Whether faces between glass, emissive, and opaque voxels should be removed is a rendering
policy, not a parser fact. The safe first policy is to remove an interface only when both voxels are
opaque. Same-material glass interiors can be considered later with a documented visual test.

### Camera and draw-time visibility

- Back-face culling: enable `cull: 'back'` and verify winding for all six quad orientations.
- Frustum clipping: WebGPU already clips primitives; do not rebuild a global instance list on every
  camera move for a small scene.
- Batch frustum culling: if a scene grows large, retain stable spatial or scene-node batches with
  AABBs and skip whole draw calls outside the view. This keeps static GPU uploads static.
- Early depth: submit opaque work before blended work. Near-to-far batch ordering may reduce
  fragment work, but needs measurement.
- Occlusion: defer it. WebGPU has occlusion queries, but BroMetal's public render pass API does not
  expose them, and readback/latency/temporal behavior would add substantial policy.

**Inferred:** Individual CPU frustum culling is a likely loss for a static model because it replaces
one upload with camera-dependent filtering and re-upload. Batch culling becomes worthwhile only
after one draw becomes too coarse or scenes contain many separated nodes.

### What GPU-driven culling would require later

A genuine GPU path needs a compute-visible occupancy or instance buffer, a compacted output, an
atomic or scan-based count, and `drawIndirect`/`drawIndexedIndirect` consuming that count. WebGPU
defines indirect drawing; BroMetal 0.18.0 does not make that operation public. Its compute DSL also
does not expose atomics. **Inferred:** If profiles justify this path, it is an upstreamable BroMetal
feature request and must follow Antiky's BroMetal patch/upstream policy rather than reach through
private runtime objects.

## `.vox` ingestion

### What the format actually contains

**Established:** The official base format is little-endian, starts with `VOX ` and version 150,
and uses RIFF-like chunks. `SIZE` pairs with `XYZI`; each voxel is four bytes `(x, y, z,
colorIndex)`. `RGBA` is optional in the base document, and its entries 0–254 map to palette indices
1–255. `PACK` permits multiple models. See the official
[base format](https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.txt).

**Established:** The official extension makes multiple models and an explicit palette normal,
deprecates `MATT` in favor of `MATL`, and defines transform (`nTRN`), group (`nGRP`), shape
(`nSHP`), layer, material, palette-name, index-map, camera, and render-data chunks. Transforms use a
compact signed-axis rotation byte plus integer translation and can have frames. See the official
[format extension](https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox-extension.txt).

**Inferred:** A parser that returns only the first `SIZE`/`XYZI` pair is not a scene importer. It is
acceptable only if the UI clearly calls it “first model” and rejects files with scene data. The
experiment should instead preserve enough normalized scene information to render repeated model
instances, transforms, hidden nodes/layers, palette, and the material class used by shading.

### Proposed CPU boundary

Keep four representations distinct:

```text
untrusted ArrayBuffer
  -> bounded VoxDocument (chunks, models, palette, materials, scene nodes)
  -> normalized VoxelScene (resolved transforms/visibility; no file offsets or dictionaries)
  -> SurfaceBatch[] (immutable typed arrays plus bounds and material class)
  -> renderer upload
```

The parser owns byte order, chunk boundaries, unknown-chunk skipping, dictionary decoding, and
format diagnostics. The normalizer owns scene-graph traversal, transform composition, hidden-state
rules, model reuse, palette/material lookup, and the coordinate-system conversion chosen by the
experiment. The surface extractor owns occupancy and exposed faces. The renderer never parses a
file and the parser never imports BroMetal.

### Required validation

Treat dragged, fetched, or project-loaded files as untrusted input:

- verify magic/version and that every fixed-width read fits the buffer;
- use declared content and child lengths to bound traversal and skip unknown chunks;
- reject negative counts, overflow, impossible `SIZE`/`XYZI` pairs, duplicate voxel coordinates,
  invalid palette indices, dangling node/model references, scene cycles, and invalid rotation bits;
- cap file bytes, chunk count, dictionary bytes/pairs, models, nodes, frames, voxels, normalized
  instances, exposed faces, and total typed-array bytes before allocating;
- make those caps named importer policy and report which cap failed; and
- cancel or generation-fence parse/normalization/upload when the app, asset, or project changes.

**Gap:** Numeric caps need a representative asset corpus and browser-memory measurements. Guessing
large constants would create a false compatibility promise. The first implementation can ship
conservative experiment-local limits and report them in the UI; Antiky-wide limits require an
asset-policy decision.

### Parser dependency decision

**Established:** The official `ephtracy/voxel-model` repository and its format/sample material are
MIT-licensed. `ogt_vox` is a mature-looking full-scene C/C++ reference with transforms, instances,
materials, layers, animation, and MIT licensing, but it is not a browser TypeScript dependency.
Small JavaScript packages discovered during research often cover only base chunks and do not prove
scene, malformed-input, or current material behavior.

**Inferred:** For the experiment, write a small bounded TypeScript reader against the official
documents, with fixtures from the MIT sample repository. Use `ogt_vox` as a semantic cross-check,
not code to port blindly. This is less dependency surface than adapting a base-only parser and
makes every supported chunk explicit. Reconsider a dependency only if it has full scene coverage,
browser-safe bounds, fixtures, and compatible license evidence at a pinned revision.

### Materials and transparency

Map the palette and `MATL` data into a small normalized material record. Diffuse color, emission,
roughness/specular, metal weight, glass weight/index/attenuation are useful source facts, but a
MagicaVoxel material is not automatically the same model as a glTF metallic-roughness material or
the first raster shader.

Opaque, emissive, and transparent faces need separate render classes because BroMetal blend mode
is a program/pipeline option. A single instanced transparent draw has no per-face back-to-front
sort, and BroMetal's alpha mode tests depth without writing it. Accurate intersecting glass is
therefore outside the first raster proof. The honest choices are:

1. render glass as opaque/tinted in the baseline and say so; or
2. create a separate transparent batch, sort it when the camera changes, and accept the re-upload
   and remaining order artifacts.

The first choice better isolates cube-versus-face performance. The second is a later visual
feature, not importer correctness.

## Shader and pipeline organization

Follow the convention already used by `antiky/packages/demos/brometal/{shader-study,solar-forge,
luminous-reef}`:

- authored shader: `src/shaders/voxel-surface.shader.ts`;
- generated artifact beside it: `voxel-surface.shader.gen.ts`;
- import only the generated module from runtime code;
- `shaders:watch` uses `brometal dev`, production build runs `brometal prod` before Vite;
- Vite emits the game entry as `dist/antiky.game.js` with relative asset URLs; and
- the game entry returns `frame()` and exhaustive `dispose()` rather than starting its own loop.

**Inferred module cut:**

- `vox/parse.ts` — bounded binary reader and diagnostics;
- `vox/normalize.ts` — scene graph and coordinate semantics;
- `surface/extract.ts` — cube/face batch generation and AO;
- `render/voxel-renderer.ts` — renderer/program/texture ownership and frame inputs;
- `shaders/voxel-surface.shader.ts` — transforms and surface shading;
- optional later `shaders/voxel-shadow.shader.ts` and `voxel-post.shader.ts`; and
- `game.ts` — host contract, async generation fence, controls, reporting, disposal.

This is enough locality to keep each difficult decision in one place. A generalized asset registry,
render graph, material framework, or reusable voxel engine would be premature.

### Minimal surface shader contract

```ts
attributes:        { aPosition: 'vec3', aUv: 'vec2' }
instanceAttributes:{ iPosition: 'vec3', iFace: 'float', iPalette: 'float' }
uniforms:          { uViewProj: 'mat4', uPalette: 'sampler2D', ...lighting }
varyings:          { vNormal: 'vec3', vWorld: 'vec3', vPaletteUv: 'vec2' }
```

Optional corner AO adds `iAo: 'vec4'` and a scalar interpolated varying. Material parameters can
come from another nearest 256×1 lookup texture instead of more instance attributes. This preserves
the default WebGPU vertex-buffer budget: two vertex attributes plus three or four instance
attributes consume five or six of the guaranteed eight buffers in BroMetal's one-buffer-per-
attribute layout.

**Inferred:** Prefer palette/material lookup textures over expanded per-face records once the
baseline works. They preserve source palette semantics, make style changes cheap, and avoid
duplicating material values per face. Keep coordinates and face codes as instance attributes;
BroMetal has no built-in instance index through which a storage record could be addressed.

### Passes, in increasing order of ambition

1. Opaque voxels directly to the canvas: directional plus hemisphere light, palette, occupancy AO,
   fog, tone curve. This proves the representation.
2. Shadow color/depth target, then lit opaque pass. This proves a second scene pass and doubles
   instance buffers if separate BroMetal programs are used.
3. HDR scene target, emissive/additive pass, bloom chain, final tone-map/outline pass. This is the
   strongest stylized presentation path already aligned with Antiky's render-driver vocabulary.
4. Approximate glass as a separate alpha pass. This should not block the first three.

Do not put all four in the first measurement. A broken shadow or bloom implementation can obscure
the representation comparison.

## Visual ceiling

### Highly stylized work: strong fit

The raster surface retains exactly the traits shown in the inspiration: hard silhouettes, authored
palette, tiny geometric details, diorama framing, and strong light/color composition. Useful style
controls include:

- orthographic/perspective camera and integer-like framing;
- two- or three-band diffuse ramps;
- face-axis hue/value bias and palette remapping;
- four-corner occupancy AO and cavity darkening;
- sun/sky/ground colors, long shadow maps, height fog, and atmospheric color;
- edge outlines from geometry or a normal/depth post pass;
- emissive palettes, bloom, vignette, grain, and controlled depth of field; and
- nearest palette/material lookup with smooth post-processing where intended.

These can be original shaders using BroMetal's MIT runtime and existing MIT shader helpers. They do
not require copying MagicaVoxel shaders or an artist's scene.

### Hyperrealistic work: qualified fit

A rasterized voxel scene can look polished and physically suggestive with high-quality direct
lighting, soft-looking shadow filtering, material response, atmospheric scattering approximations,
reflection probes, SSAO, and HDR post. Current BroMetal makes several of those possible but not
turnkey. It has no public cube-map sampler, multiple color attachments, sampleable scene-depth
contract, order-independent transparency, ray queries, or path-tracing framework. Some effects can
be encoded through extra color passes, but each workaround adds passes and duplicated geometry.

**Established:** MagicaVoxel describes itself as an interactive path tracing renderer, and the
closest browser prior art in the idea, WebGPU-.vox, is also a progressive path tracer. Those paths
simulate light transport that this raster track does not. See the official
[MagicaVoxel page](https://ephtracy.github.io/?page=mv_main) and
[WebGPU-.vox repository](https://github.com/AddisonPrairie/WebGPU-.vox).

**Inferred:** Call this track “stylized real-time raster” and judge it on clarity, responsiveness,
and art direction. Do not use “hyperrealistic” as an acceptance claim. The research comparison
needs a ray/path-traced track if physically convincing indirect illumination is an objective.

## Performance model and experiment measurements

### Costs to expect

- Parsing and surface extraction are one-time CPU work for a static file.
- Upload is one-time unless material/style data is baked into instance arrays or transparency is
  camera-sorted.
- Per frame should normally upload camera and lighting uniforms only.
- Cube and face paths can both be one opaque draw when the scene fits one batch.
- Splitting by spatial chunk, source node, material class, shadow/no-shadow, or transparency trades
  more draw calls for culling and pipeline correctness.
- Quad data at `position + face + palette` is 20 bytes per face in CPU arrays and approximately the
  same payload in GPU attribute buffers. One million faces therefore means about 20 MB on each
  side before AO, bounds, arrays, pipeline duplication, and implementation overhead. Adding
  `vec4` AO raises the payload by 16 MB per million faces.
- Cube data at `position + palette` is 16 bytes per retained voxel, but each instance submits 36
  indices instead of 6 per exposed quad.

These are payload calculations, not measured total memory.

### Required counters

Record at load/build time:

- file bytes, parse time, normalize time, surface-build time;
- models, scene nodes, normalized instances, source voxels;
- retained surface voxels, exposed faces, transparent faces;
- CPU typed-array bytes and one-time upload bytes; and
- warnings for unsupported/approximated chunks or materials.

Record during rendering:

- submitted instances, triangles, draw calls, and bytes uploaded per frame;
- canvas pixel size and render scale;
- CPU frame preparation and browser frame cadence;
- optional GPU timestamps only if the adapter feature and BroMetal integration are explicitly
  implemented; and
- rebuild/re-upload counts after resize, style change, asset change, and camera change.

Antiky's current game-host contract already transports `instances`, `drawCalls`,
`uploadBytesPerFrame`, and a bounded note into Studio inspection. Add richer experiment-local stats
without falsely treating them as a stable Framework schema.

### Comparison corpus

At minimum use:

1. a dense solid or architectural model, where face removal should dominate;
2. a thin/porous character or foliage model, where most voxels are exposed; and
3. a multi-model scene with repeated shapes, transforms, hidden layers, emission, and at least one
   glass material.

Capture the same deterministic cameras in cube and quad modes. Compare appearance first, then
counts and timing. The BroMetal “125,000 cubes in one draw” example proves API shape, not a frame
budget on Antiky's supported devices.

## Antiky integration boundaries

### Experiment lane

- Use the current `GameModuleEntry` shape: host supplies canvas/time/input; module returns
  `frame()`/`dispose()`.
- Load/parse the `.vox` asset inside the game module's asynchronous setup, with an abort/generation
  guard before publishing GPU work.
- Either use `BroMetalRenderDriver` or document direct BroMetal as the ADR 0021 exception. A simple
  first proof may use direct BroMetal, but the likely merge path is the driver because instanced
  typed arrays, keyed pipelines, targets, and textures already fit its contract.
- On direct BroMetal, dispose palette/material textures, programs, targets, and renderer in reverse
  ownership order even when one disposal fails.
- Report WebGPU unavailable, adapter/device failure, parse failure, over-limit asset, shader error,
  and device loss as visible bounded states, not a blank canvas.

### Framework merge lane

The importer and surface extractor remain ordinary CPU modules. The game extracts immutable typed
render data. `BroMetalRenderDriver` owns the programs, palette/material textures, render targets,
attribute buffers, and disposal. Frames name pipelines/textures/targets and contain no BroMetal or
WebGPU objects, preserving ADR 0021.

**Established caveat:** `RenderFrame.DrawCall.instances` currently skips a draw only when it is
zero; the BroMetal program still derives a positive instance count from buffer lengths. Subranges,
first-instance draws, and GPU-generated counts are not represented by the current implementation.
Static one-batch uploads fit; sophisticated visibility may require an explicit driver/BroMetal
capability rather than stretching the existing field.

The `.vox` importer should not become the Framework's universal model abstraction from this one
experiment. BroMetal already loads `.glb` meshes, but GLB mesh ingestion and voxel occupancy have
different semantics. If a standard mesh is used as a secondary demo input, render it as a mesh or
make voxelization an explicit later pipeline; do not imply that `loadGlb()` recovers voxels.

### Studio merge lane

The existing compatibility lane needs no Studio GPU API: Studio keeps its shell, panel chrome,
status, and iframe lifetime; the CLI game host mounts the voxel game on its canvas. The renderer's
camera and style controls can initially live in the game experience.

A future first-party voxel Studio app should contribute bounded panel content and serialized
commands/state. Studio should own panel chrome, focus/input arbitration, responsive layout,
canvas-host lifecycle, and recovery. The app should not import `StudioShell`, receive a raw shared
`GPUDevice`, or make `.vox` parsing a viewport responsibility. That follows the current Studio-app
research rather than anticipating its unresolved app and shared-device contracts.

## Risks and failure modes

| Risk | Why it matters | Containment/evidence |
| --- | --- | --- |
| Base-only `.vox` parser presented as full support | Drops scene instances, transforms, hidden layers, and materials silently | Explicit support matrix plus multi-model/scene fixtures |
| Sparse scene flattened to one dense world | Small files can allocate enormous CPU memory | Per-model topology cache and bounded scene instances/batches |
| Cube baseline mistaken for final optimization | Surface voxels still submit inward faces | Report triangles and exposed-face ratio beside frame data |
| Face winding error | Back-face culling makes one or more directions disappear | Six isolated colored-face fixture and camera orbit |
| Float-only instance records grow too large | BroMetal cannot upload packed palette/face/AO bytes | Start with 20-byte face record, track bytes, use lookup textures |
| Too many BroMetal attributes | Every attribute is a vertex buffer; default WebGPU guarantee is eight | Keep face/material records small; assert compiled layout |
| Shadow program duplicates instance buffers | High-level programs do not share attribute buffers | Measure memory; defer shadow or justify a general BroMetal buffer-sharing API |
| Transparent voxels sort incorrectly | Blend is pipeline-level and alpha draw is not order independent | Opaque approximation first; separate documented glass experiment |
| Device loss yields permanent blank output | BroMetal reports loss but does not recreate resources | Visible terminal state now; later host-driven full renderer rebuild |
| Asset change wins after unmount/project switch | Async fetch/parse/upload can publish stale work | Abort/generation fence at every boundary |
| Unbounded file dictionaries/counts | Malformed input can cause excessive allocation or traversal | Validate before allocation; named caps and stable diagnostics |
| Style work hides representation cost | Post effects can dominate both paths | Measure bare opaque pass before visual layers |
| Inspiration copied without permission | Linked artworks demonstrate a style, not reusable assets | Create original scenes/shaders or use separately verified assets |
| BroMetal private internals used for missing features | Upgrade risk and violates Antiky ownership direction | Add a public general feature upstream or keep the experiment simpler |

## License and provenance ledger

| Material | Provenance | License status and use |
| --- | --- | --- |
| BroMetal 0.18.0 runtime, DSL, helpers, and examples | Installed package metadata points to [`ericdrowell/brometal`](https://github.com/ericdrowell/brometal); [license](https://github.com/ericdrowell/brometal/blob/main/LICENSE) | MIT. Preserve the notice if code is copied or modified; normal package use follows the dependency license. |
| MagicaVoxel `.vox` format documents and repository sample models | [`ephtracy/voxel-model`](https://github.com/ephtracy/voxel-model); [license](https://github.com/ephtracy/voxel-model/blob/master/LICENSE) | MIT at the repository root. Pin the fixture revision and retain the notice when fixtures are copied. |
| `ogt_vox` full-scene reference | [`jpaver/opengametools`](https://github.com/jpaver/opengametools/tree/master/src/ogt_vox.h); [license](https://github.com/jpaver/opengametools/blob/master/LICENSE) | MIT. Semantic/reference use is low risk; copied implementation still needs notice and careful attribution. |
| WebGPU and WGSL specifications | W3C/GPU for the Web sources linked below | Standards evidence, not a shader asset. W3C document license applies to spec text; do not copy large passages into code. |
| WebGPU-.vox prior art | [`AddisonPrairie/WebGPU-.vox`](https://github.com/AddisonPrairie/WebGPU-.vox/tree/79a36fab0ba0c922d20f73e24f575d4183f987a4) | No repository license file or detected license exists at the inspected revision. Use as read-only architectural prior art; do not copy, translate, or adapt its path tracer, shaders, or parser. |
| MagicaVoxel shader collection mentioned in the idea | [`lachlanmcdonald/magicavoxel-shaders`](https://github.com/lachlanmcdonald/magicavoxel-shaders) | MIT repository license, but those shaders target MagicaVoxel's shader system, not BroMetal/WGSL. Copy only with notice and a clear technical reason. Original shaders are preferable. |
| Deep in the Woods, Tokyo suburb, and The Fox | Links in `docs/thoughts/idea.md` | Visual inspiration only. No compatible reuse license was established. Do not redistribute their images, models, palettes, or derivative scene assets. |

The objective allows CC, Apache-2.0, MIT, and royalty-free shader sources. “Royalty-free” is not by
itself permission to redistribute source or assets; record the exact grant, author, URL, version,
and required attribution for every imported file.

## Gaps and decisions for planning

1. **Target representation:** The evidence favors exposed-face quads, but both paths need a measured
   same-scene comparison before deleting the cube baseline.
2. **Format promise:** Decide whether the proof claims full static scene support or a named subset.
   Animation frames, cameras, render metadata, and exact glass can be parsed/preserved without all
   being rendered.
3. **Coordinate contract:** Establish the one mapping from `.vox` axes, model pivots, transforms,
   and units into Antiky world coordinates with golden fixtures. The official documents describe
   stored values but do not choose Antiky's convention.
4. **Material promise:** Decide whether glass is opaque approximation, separately sorted alpha, or
   explicitly unsupported in the first visual comparison.
5. **Lighting bar:** Choose whether the representation comparison stops at AO/direct light or also
   must prove a shadow target and HDR/bloom. Add them in separate measurement stages.
6. **Asset limits:** Choose conservative experiment limits after inspecting the actual corpus; do
   not imply Framework-wide limits.
7. **BroMetal path:** Prefer the existing driver for the merge-shaped proof. If direct BroMetal is
   used to get the first picture, state which missing driver capability forced it.
8. **Studio relationship:** Use the current iframe lane now. An in-process reusable viewport waits
   for the Studio-app device/hosting decision.
9. **Hyperrealism:** Raster quality can be high, but physically realistic indirect transport needs
   another approach. Planning should not make this track prove a path-tracing goal.

## Exact external sources

Primary or project-authoritative sources used on 2026-08-16:

- WebGPU specification: <https://gpuweb.github.io/gpuweb/>
- WebGPU vertex state: <https://gpuweb.github.io/gpuweb/#vertex-state>
- WebGPU rendering operations and indirect draws: <https://gpuweb.github.io/gpuweb/#rendering-operations>
- WebGPU limits: <https://gpuweb.github.io/gpuweb/#limits>
- WebGPU occlusion queries: <https://gpuweb.github.io/gpuweb/#occlusion-query>
- WGSL specification: <https://www.w3.org/TR/WGSL/>
- WGSL host-shareable layout rules: <https://www.w3.org/TR/WGSL/#address-space-layout-constraints>
- Official MagicaVoxel base format: <https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.txt>
- Official MagicaVoxel extension: <https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox-extension.txt>
- Official MagicaVoxel sample/model repository and license: <https://github.com/ephtracy/voxel-model>
- MagicaVoxel product page: <https://ephtracy.github.io/?page=mv_main>
- BroMetal source and license: <https://github.com/ericdrowell/brometal>
- BroMetal package documentation: <https://www.npmjs.com/package/brometal/v/0.18.0>
- BroMetal current instancing example: <https://github.com/ericdrowell/brometal/blob/main/packages/brometal/examples/shaders/instanced-cubes.shader.ts>
- BroMetal current voxel example: <https://github.com/ericdrowell/brometal/blob/main/packages/brometal/examples/demos/BrocraftDemo.tsx>
- `ogt_vox` scene loader reference: <https://github.com/jpaver/opengametools/tree/master/src/ogt_vox.h>
- WebGPU-.vox prior art: <https://github.com/AddisonPrairie/WebGPU-.vox>

No external code, shader, image, or model was copied during this research. No runtime benchmark was
performed; all performance statements above are API facts, payload arithmetic, or explicitly
labelled hypotheses for the implementation experiments.
