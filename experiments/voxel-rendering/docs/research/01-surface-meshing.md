# 01 — Greedy surface meshing and raster PBR

Research snapshot: 2026-08-16

## Scope and evidence labels

This note evaluates one rendering track: parse a MagicaVoxel `.vox` scene, extract its exposed
surface into a greedy triangle mesh on the CPU, and render it with a real-time raster pipeline in
WebGPU through BroMetal. It covers rendering only, not voxel editing or `.vox` round-tripping.

- **Established** means verified in a primary specification, current source, or an accepted Antiky
  decision.
- **Claimed** means stated by a project author but not independently measured here.
- **Inferred** means a design conclusion drawn from established facts.
- **Gap** means the current evidence is insufficient or the supporting Antiky/BroMetal contract does
  not exist yet.

## Result

**Inferred:** This is the best control implementation of the three rendering experiments. It has
ordinary raster behavior, good startup latency after a one-time mesh build, predictable memory, real
depth and shadow-map occlusion, and a direct route into Antiky's existing BroMetal render driver. It
should be the real-time baseline against which ray traversal or path tracing earns its complexity.

It can reach polished stylized rendering and convincing physically based *surface* rendering. It
cannot reproduce MagicaVoxel's path-traced multi-bounce lighting, transmission, caustics, or interior
volume effects without adding approximations or a separate ray-based technique. Calling the first
shader “PBR” is only justified if it implements a complete, energy-conscious material response; the
small `specGGX()` helper currently shipped by BroMetal is one specular term, not a complete
metallic-roughness BRDF.

The implementation should reuse Antiky Town as prior art, but not copy it unchanged. Town already has
a deterministic greedy mesher and a sophisticated voxel raster stack. Its mesher does not include
per-corner ambient occlusion (AO) in the merge key and always uses the same quad diagonal. Both differ
from the published voxel-AO rules and can erase or skew local shading on large merged faces.

## Established baseline

### `.vox` is a scene source, not one voxel array

The official base format is a little-endian RIFF-style `VOX ` file, normally version 150, with a
`MAIN` root, optional `PACK`, paired `SIZE`/`XYZI` model chunks, and an optional 256-entry `RGBA`
palette. Each `XYZI` entry stores byte-sized x, y, z, and palette index values. Stored palette entries
map to indices 1–255; index 0 is therefore not a normal authored swatch. See the official
[base `.vox` format](https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.txt).

The extension adds multiple models, string dictionaries, packed rotations, `nTRN` transform nodes,
`nGRP` group nodes, `nSHP` shape nodes, layers, frames, and `MATL` properties. `MATL` types include
diffuse, metal, glass, and emissive, with roughness, specular, index-of-refraction, attenuation, flux,
and other string-valued properties. See the official
[`.vox` extension](https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox-extension.txt).

**Inferred ingestion boundary:** parse into a bounded, renderer-neutral `VoxScene` first. Preserve
model IDs, palette indices, raw material dictionaries, node IDs, hierarchy, local transforms, layer
visibility, names, and frame records. Resolve those into render instances only after the file has
passed structural validation. Mesh each unique model once in model-local space and instance it for
each visible shape placement; flattening the whole scene destroys useful reuse and stable source
identity.

The first renderer may deliberately show frame 0 only, but it must report that policy and the
presence of later frames. Silently taking the first transform, ignoring rotation, or starting
traversal from a guessed node reproduces known defects in surrounding WebGPU `.vox` prior art.

**Gap:** The official base document is dated 2016 and the extension is not a complete versioned schema
for every chunk emitted by current MagicaVoxel. Coordinate/pivot behavior, palette color space, newer
metadata, unknown chunks, and animation fixtures need a representative corpus. Unsupported chunks
should be skipped by their declared bounded lengths and recorded, not treated as permission to trust
the rest of the file.

### Antiky already has most of the raster ingredients

**Established:** Antiky Town's
[voxel surface compiler](https://github.com/antikylabs/site/blob/main/packages/demos/antiky/antiky-town/src/town/art/voxel-surface-mesh.ts)
uses a sparse integer grid, removes faces adjacent to occupied cells, groups remaining faces by axis,
direction, plane, and material signature, and greedily merges same-signature rectangles. It emits
typed position, normal, color, material, emissive, AO, and index buffers plus bounds, counts, byte
size, and a deterministic fingerprint.

**Established:** Town's
[voxel shader](https://github.com/antikylabs/site/blob/main/packages/demos/antiky/antiky-town/src/town/shaders/town-voxel.shader.ts)
already demonstrates the relevant BroMetal vocabulary: authored TypeScript compiled ahead of time to
WGSL, directional and practical lights, SH-9 ambient irradiance, local AO, material-array and detail-
normal sampling, manual shadow filtering, emissive response, fog, and a linear HDR scene path. Its
other passes add shadow maps, bloom, exposure, tone mapping, and output encoding. This is strong
implementation evidence, not a claim that its hand-authored lighting is a reference PBR model.

**Established:** The repository pins BroMetal 0.18.0. Its current public types expose ordinary and
instanced vertex attributes, `Uint16`/`Uint32` indices, 2D/3D/2D-array textures, storage buffers,
compute dispatch, depth-enabled RGBA16F render targets, additive/alpha blending, renderer-level back-
face culling, and typed asynchronous GPU errors. The package is MIT licensed. See the installed
[`package.json`](https://unpkg.com/brometal@0.18.0/package.json),
[`context.d.ts`](https://unpkg.com/brometal@0.18.0/dist/runtime/context.d.ts),
[`program.d.ts`](https://unpkg.com/brometal@0.18.0/dist/runtime/program.d.ts), and
[`texture.d.ts`](https://unpkg.com/brometal@0.18.0/dist/runtime/texture.d.ts).

**Established limitation:** BroMetal's shader type list has no cube sampler, and its render targets
have a fixed RGBA16F color shape. Its `ProgramOptions` only varies blend mode; culling is chosen at
renderer creation. The shipped `specGGX()` calculates a normal-distribution-shaped highlight but does
not supply the complete Fresnel, geometry, diffuse, metal/dielectric mixing, or multiple-scattering
terms described by the glTF reference BRDF. These are manageable experiment constraints, but they set
the ceiling until BroMetal gains general renderer capabilities.

## Surface extraction design

### Correct greedy merge

For each of the six face directions:

1. Sweep slices perpendicular to the face normal.
2. Build a 2D mask containing only boundaries between an occupied cell and renderable empty space.
3. Give each mask entry a full face signature.
4. Grow a same-signature rectangle, emit one consistently wound quad, and clear the rectangle.

This is the standard reduction of 3D meshing to repeated 2D quadrangulation described by Mikola
Lysenko. His examples show very large reductions on uniform shapes, while also showing that gains
shrink as curvature, disconnected components, and surface variation increase. The algorithm is
linear in the dense volume size but performs more work than face culling. Those examples are not a
performance promise for MagicaVoxel art. See
[Meshing in a Minecraft Game](https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/).

The signature must include every discontinuity the fragment shader cannot recover:

- face direction and opacity class;
- palette/material identity and any per-face PBR override;
- emissive or cutout class;
- the four baked AO values, if AO is a vertex attribute; and
- any authored light value or diagnostic ID that must remain constant across the quad.

Merging only by color is incorrect when two faces look alike but differ in glass/metal/emission or
AO. Conversely, putting procedural micro-detail in the signature ruins merging; keep repeatable
surface detail in the shader or a material table.

Voxel corner AO reads the two side neighbors and the diagonal neighbor. If both sides are occupied,
the corner is maximally occluded; otherwise the three occupancies select one of four levels. Faces
may merge only when their corner AO agrees along the merged region. The triangle diagonal should be
flipped when opposite-corner sums demand it, otherwise interpolation creates a visible directional
artifact. See
[Ambient occlusion for Minecraft-like worlds](https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/).

**Risk found in current code:** Town's `cellSignature()` includes material values and color but not
AO; AO is evaluated only for the four final rectangle corners, and `emitQuad()` always emits the
same diagonal. The experiment should fix both and add an image designed to expose the diagonal, not
inherit them as compatibility behavior.

### Opaque, glass, and repeated models

Internal faces between two opaque voxels can be removed. Boundaries between opaque and glass, two
different transmissive media, or a voxel and empty space need separate policy. A safe first mapping
keeps opaque/glass interfaces, emits glass into a separate alpha pipeline, and states that alpha
blending is an approximation rather than physical transmission. Large merged transparent quads make
sorting errors more obvious, so glass should not determine the success of this baseline.

Mesh each `SIZE`/`XYZI` model once. Scene-node transforms belong in instance attributes or per-draw
uniforms. For a static viewer, do all parsing and meshing at load/import time and never remesh per
frame. Chunking is useful only when a model is large enough that frustum culling and bounded buffer
sizes outweigh extra draw calls; 16³/32³/64³ are hypotheses to measure, not defaults to canonize.

## Material and raster pipeline

### Do not pretend `MATL` is glTF PBR

MagicaVoxel's material dictionary and glTF's metallic-roughness model have similar words but are not
the same contract. Preserve the source dictionary and use a versioned import mapping. A defensible
starting interpretation is:

| `.vox` source | Raster surface interpretation | Fidelity note |
| --- | --- | --- |
| palette RGB/A | base color and coverage | Palette transfer function is unspecified; explicitly test and record an sRGB assumption before lighting in linear space. |
| `_diffuse` | dielectric, metallic 0 | Roughness/specular remain authored inputs where present. |
| `_metal` | metal/dielectric mix | Map `_weight` only after current exporter fixtures establish its meaning. |
| `_emit`, `_flux` | linear emissive radiance feeding HDR/bloom | A visible glow is not scene illumination unless explicit lights or GI are added. |
| `_glass`, `_ior`, `_att` | separate approximate transparent pass | Alpha/Fresnel can look good; it is not absorption, refraction, or caustics. |
| `_rough`, `_spec` | perceptual roughness and dielectric response | Clamp invalid strings and retain the raw values in diagnostics. |

For the shader's reference behavior, use the Khronos glTF metallic-roughness structure and BRDF
appendix: base color, metalness, roughness, dielectric F0, Fresnel, microfacet distribution,
visibility/geometry, and energy-aware diffuse/specular coupling. The specification explicitly allows
BRDF implementations to vary with device constraints; it does not reduce the model to one GGX
highlight. See the official
[glTF 2.0 material and BRDF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#materials).

### Pass organization

A credible high-quality raster stack is:

```text
depth-from-light shadow target(s)
  -> opaque voxel PBR into linear RGBA16F scene target
  -> optional glass/emissive effects
  -> bloom extract and blur
  -> post: exposure, tone map, output transfer, optional stylization
  -> canvas
```

This fits Antiky's current ordered `RenderFrame` and target model. It also keeps the useful split
between one geometry/import path and two presentation styles:

- **Physical preset:** metallic-roughness BRDF, directional key, a small bounded practical-light
  set, shadow map, local AO, HDR, exposure/tone map, fog, and an environment approximation. SH-9 or
  a lat-long 2D texture is possible now; proper prefiltered cubemap IBL needs broader BroMetal texture
  support or an explicit, measured substitute.
- **Stylized preset:** the same geometry and material table with quantized diffuse bands, controlled
  rim light, palette grading, hard or deliberately stepped shadows, optional outline, bloom, fog,
  and pixel-scale/post controls. Do not encode a style switch as dozens of divergent branches in one
  fragment shader; two small shader variants can share CPU data and common authored helpers.

### Shader/source organization

Follow current BroMetal demo conventions:

- write readable `*.shader.ts` files with typed attributes, uniforms, varyings, and small named GPU
  helpers;
- run `brometal dev`/`brometal prod` and import sibling `*.shader.gen.ts` artifacts at runtime;
- keep depth, surface, emissive/glass, bloom, and post shaders separate by pass responsibility;
- treat generated WGSL as build output and evidence, not the maintained source;
- compile material meanings into one documented CPU table/buffer rather than duplicating a 256-way
  palette decision tree across shaders; and
- call `renderer.present()` from the host-provided `frame()` callback. Do not start a second
  `renderer.loop()` inside a Studio-hosted game.

BroMetal's pure demos establish the small lifecycle contract: acquire the renderer and programs,
upload immutable geometry once, report honest measurements, render in the host frame callback,
dispose programs before destroying the renderer, and surface `onError` instead of leaving device
loss or validation failure in the console. See the
[pure BroMetal demos](https://github.com/antikylabs/site/blob/main/packages/demos/brometal/README.md) and
[Solar Forge entry](https://github.com/antikylabs/site/blob/main/packages/demos/brometal/solar-forge/src/game.ts).

## Visual ceiling

**Stylized — high confidence.** Greedy surfaces preserve the exact voxel silhouette and flat face
normals. Palette control, baked corner AO, shadow maps, rim light, toon bands, outlines, fog, bloom,
and authored camera/post treatment are all natural raster effects. This approach can cover small
graphic dioramas and dense atmospheric scenes while remaining interactive.

**Hyperreal surface response — plausible, art-dependent.** Correct color management, a complete
metallic-roughness BRDF, stable area-like shadow approximations, good environment lighting, normal or
roughness micro-detail, HDR exposure, and restrained post can make stone, metal, wet surfaces, and
painted blocks convincing. Voxel geometry alone does not supply texture scale, weathering, lighting
design, or composition; shader complexity cannot substitute for those inputs.

**Path-traced look — bounded.** Raster shadows and local AO do not provide arbitrary multi-bounce
diffuse GI. Screen-space effects miss off-screen information. Alpha glass does not provide correct
refraction, absorption, or caustics. A surface mesh also discards the occupied volume after import,
so later cone tracing or volume traversal would need the normalized voxel data as another compiled
artifact. These are reasons to compare the other tracks, not to inflate this baseline.

## Performance and evidence to keep

Expected wins and costs should be reported per imported fixture, not as one FPS claim:

- input bytes, model/node/instance counts, declared dimensions, occupied voxels, and parse time;
- exposed unit faces, culled internal faces, greedy quads, triangles, vertices, index width, and mesh
  bytes;
- mesh build time, upload time, shader/pipeline creation time, and time to first visible frame;
- per-pass draw calls, instances, render-target sizes, and uploads per steady-state frame; and
- frame-time distributions at named canvas size, DPR/render scale, browser, OS, and adapter.

Planar same-material regions yield the largest mesh reduction. Highly variegated palette work,
glass interfaces, and AO discontinuities reduce it. Greedy meshing trades CPU work for fewer vertices,
indices, and rasterized triangle edges; it does not reduce fragment cost on the surviving screen area.
A single whole-scene mesh minimizes draws but weakens culling and replacement. Too many chunks reverse
the gain through draws and duplicated borders. Measure at least a solid block, a detailed character,
a repeated-model scene, and a dense architectural scene.

Use 32-bit indices when the final vertex count requires them; BroMetal accepts both index widths.
Keep static mesh buffers immutable after upload. The current Antiky frame contract's `vertexData` and
`indices` fields are for rebuilt geometry and would re-upload them on submission, which is the wrong
steady-state path for an imported static scene.

## Antiky and Studio integration boundaries

**Established architecture:** BroMetal stays inside `BroMetalRenderDriver`; framework/Studio data
uses Antiky IDs, pipeline keys, asset descriptions, and typed updates rather than renderer or GPU
objects. Direct BroMetal use by a game module is allowed only as an exception when the driver lacks a
needed feature. See accepted
[ADR 0021](https://github.com/antikylabs/site/blob/main/docs/adr/framework/0021-brometal-render-driver-ownership_H.md).

**Experiment boundary:** use a pure BroMetal game module first, matching the existing demo contract. That
keeps this comparison focused and avoids declaring a permanent `.vox` asset API before results exist.
The experiment owns parsing, normalized CPU scene data, mesh compilation, renderer children, and
disposal. The CLI host owns canvas sizing, RAF, input, visibility, and capture.

**Future framework boundary:** preserve `.vox` as source/interchange, then compile deterministic runtime
artifacts: normalized scene records, unique model meshes/chunks, palette/material table, instances,
source hash, importer/compiler version, settings, warnings, and output hashes. This matches the current
architecture direction but remains an open decision, not an accepted voxel contract. See
[rendering and assets](https://github.com/antikylabs/site/blob/main/docs/architecture/framework/rendering-and-assets_A.md)
and the open
[voxel boundary record](https://github.com/antikylabs/site/blob/main/docs/adr/UNDER_REVIEW_A.md).

**Driver gap:** `BroMetalRenderDriver` can upload one program's geometry in `setup()`, or upload
`vertexData`/indices again in a draw. It has no renderer-neutral immutable mesh/geometry asset slot,
draw range, or way to bind several unique static meshes to one material pipeline. Production
integration should add the smallest generic geometry capability proven by this experiment; it should
not expose BroMetal programs/buffers or create a voxel-specific renderer abstraction.

**Studio boundary:** Studio currently hosts the running game in a sandboxed iframe and does not own its
canvas, renderer, device, or render loop. The experiment should therefore look like the existing
Antiky evidence stage: one dominant media surface, restrained near-black chrome, visible loading/
ready/running/error state, compact mono measurements, explicit file attribution, and controls that
do not cover the render. It should not imply voxel editing, object selection, or an asset browser.
See the current [Studio design](https://github.com/antikylabs/site/blob/main/packages/studio/DESIGN.md),
[`LiveGameFrame`](https://github.com/antikylabs/site/blob/main/packages/studio/app/src/components/LiveGameFrame.tsx), and
[Studio ownership research](https://github.com/antikylabs/site/blob/main/docs/project-planning/objectives/studio-apps/research/subagent_outputs/05-webgpu-viewport.md).

## Risks and failure behavior

| Risk | Consequence | Required evidence/behavior |
| --- | --- | --- |
| Malformed or adversarial chunk sizes/counts | runaway reads, recursion, or allocation | Validate magic/version, arithmetic, nesting, model/node/voxel counts, dimensions, and total bytes before GPU work; fail with a bounded diagnostic. |
| Scene graph partly ignored | valid files look plausibly but materially wrong | Fixture rotations, nested transforms, repeated shapes, hidden layers, multiple roots, and frame records; name every deliberate unsupported semantic. |
| Material semantic overclaim | “PBR” output does not reflect the source | Preserve raw `MATL`, version the mapping, show source and interpreted values, and label glass/GI approximations. |
| Over-greedy merge | AO/color/material discontinuities disappear | Full face signature, AO-aware fixtures, deterministic mesh fingerprint, and a reference culled mesh image. |
| Fixed quad diagonal | diagonal AO artifact | Choose diagonal from opposite-corner AO sums and test an intentionally non-coplanar AO quad. |
| Huge monolithic buffers | slow import, weak culling, allocation failure | Bound sizes, report bytes, and compare whole-model with measured chunk candidates. |
| Per-frame static mesh upload | CPU/queue bandwidth and frame spikes | One-time immutable upload; zero steady-state geometry bytes. |
| Transparent voxels | sorting artifacts and false refraction claims | Separate pass, explicit approximation, and fixtures viewed from several angles. |
| WebGPU validation/device loss | blank canvas with no explanation | Wire BroMetal `onError` into visible state/diagnostics, keep CPU rebuild data, and dispose every owned resource. |
| Renderer and host both own RAF/resize | double frames, unstable size, leaks | Use the host frame callback and BroMetal's CSS-owned canvas convention; one owner per lifecycle operation. |
| Beautiful but unverifiable result | no basis for selecting this track | Deterministic fixture/camera, captured image, mesh/import receipt, measured frame data, and declared target profile. |

## License and provenance

- Antiky demos and Framework are MIT within this repository. Reusing or extracting the Town mesher
  and shader ideas is the lowest-provenance-risk route; preserve file history and attribution.
- BroMetal 0.18.0 is MIT, as recorded in its installed package and
  [upstream repository](https://github.com/ericdrowell/brometal).
- Ephtracy's format documents and model repository are
  [MIT licensed](https://github.com/ephtracy/voxel-model/blob/master/LICENSE). The experiment may
  implement the documented binary format and should cite the two format documents.
- The Khronos glTF specification source is CC-BY-4.0 and its build/tool files use Apache-2.0; its
  [license map](https://github.com/KhronosGroup/glTF/blob/main/LICENSE.adoc) applies. Cite the BRDF
  appendix. Write an original BroMetal implementation rather than copying an unrelated viewer shader.
- Lysenko's articles are the conceptual sources for greedy meshing and voxel AO. No repository-level
  license was found for the linked JavaScript demo. Do not copy that demo code; implement the
  documented algorithm independently and keep the citations.
- No third-party shader is required for this track. Any later environment texture, LUT, model, or
  `.vox` fixture needs its own source URL, author, license, permitted use, and local content hash.
  A public screenshot or social-media post is visual reference, not reusable asset permission.

## Open decisions before implementation planning

1. Is “PBR” judged against the glTF metallic-roughness BRDF, or is Antiky's current stylized Town
   lighting an acceptable physical preset? The former is recommended because it makes the comparison
   and the word PBR falsifiable.
2. Must the first `.vox` fixture support the complete frame animation graph, or may it render frame 0
   with a visible unsupported-animation receipt? Rendering frame 0 is sufficient for this rendering
   comparison if the importer still preserves the rest.
3. Is glass part of the baseline acceptance bar? It materially widens sorting and material work and
   should otherwise be shown as an explicit approximation.
4. Which target profile determines performance: Studio's embedded WebView, managed Chromium capture,
   or both, and at what CSS size/DPR/render scale?

## Source index

- [Official MagicaVoxel base `.vox` format](https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.txt)
- [Official MagicaVoxel scene/material extension](https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox-extension.txt)
- [Greedy meshing derivation and examples](https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/)
- [Voxel corner AO, merge rule, and diagonal rule](https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/)
- [glTF metallic-roughness material and reference BRDF](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#materials)
- [WGSL render/compute pipeline stages](https://www.w3.org/TR/WGSL/#shader-stages)
- [Antiky Town greedy mesher](https://github.com/antikylabs/site/blob/main/packages/demos/antiky/antiky-town/src/town/art/voxel-surface-mesh.ts)
- [Antiky Town voxel surface shader](https://github.com/antikylabs/site/blob/main/packages/demos/antiky/antiky-town/src/town/shaders/town-voxel.shader.ts)
- [Antiky BroMetal render contract](https://github.com/antikylabs/site/blob/main/packages/framework/src/render/render-contract.ts)
- [Antiky BroMetal driver](https://github.com/antikylabs/site/blob/main/packages/framework/src/render/brometal-driver.ts)
- [Accepted BroMetal ownership ADR](https://github.com/antikylabs/site/blob/main/docs/adr/framework/0021-brometal-render-driver-ownership_H.md)
