# Voxel rendering experiment plan

Plan date: 2026-08-16

Completion date: 2026-08-16. All five packets and the completion definition were verified; see the
[execution summary](./summary.md) and [live visual evidence](./evidence/README.md).

## Outcome

Build one browser WebGPU study that loads a bounded MagicaVoxel `.vox` model and renders the same
scene through three independently implemented BroMetal pipelines:

1. an AO-aware greedy surface mesh with physically based raster lighting;
2. exposed-face instancing with graphic, palette-led raster lighting; and
3. dense-grid DDA with progressive multi-bounce path tracing.

The app must also contain an original built-in scene so every renderer has a deterministic visual
and performance comparison without downloading a third-party model. Rendering is the scope. Model
creation, editing, `.vox` export, mesh voxelization, and a production Antiky asset API are not.

## Decisions made for this experiment

The research exposed choices that the informal goal did not settle. The experiment uses these
bounded answers:

- **Current product, not stale stack:** match the present Antiky Studio Vite/React/Tauri visual
  system and lifecycle boundaries. Do not create a Next.js-specific integration because Studio is no
  longer a Next.js app.
- **Input promise:** support validated `VOX ` version 150 base-model data (`SIZE`, `XYZI`, `RGBA`,
  `PACK`) plus preserved `MATL` dictionaries. Load any model in a multi-model file, with the first
  selected initially. Report scene-graph and unknown extension chunks that are preserved only as
  diagnostics. Do not claim complete world/animation import.
- **Coordinate mapping:** convert MagicaVoxel x/y/z into right/up/forward x/z/y, center the selected
  model at the origin, and treat one voxel as one world unit.
- **Materials:** interpret diffuse, metal, roughness, specular, and emission through a documented
  experiment mapping. Render glass as a visibly reported opaque/tinted approximation.
- **Visual bar:** the greedy renderer is the physical raster control; face instancing is the
  stylized real-time control; DDA is the progressive physical-light-transport proof. Both a
  `Physical` and `Graphic` presentation remain reachable in the UI, but the pipelines are not
  renamed as presets.
- **Path tracing:** start with a tight dense volume, a maximum dimension of 64 for this proof,
  statically bounded DDA, two secondary bounces, a direct sun/sky/emissive contribution, ping-pong
  running-mean accumulation, and reset generations. No hierarchy or BroMetal patch is assumed.
- **Assets and provenance:** ship only the original procedural scene. User-selected `.vox` bytes
  stay local to the browser. WebGPU-.vox is unlicensed prior art and no code, shader, parser, or
  asset may be copied or translated from it.
- **Target:** verify the current Chromium WebGPU path at a named viewport and DPR. Other browsers,
  mobile GPUs, the Tauri WebView, glass fidelity, and full `.vox` scene graphs remain follow-on
  compatibility work.

## Shared contract

The three renderers consume the same immutable `VoxelScene`:

```text
ArrayBuffer or built-in scene
  -> bounded parser / procedural builder
  -> normalized occupied cells + palette/material table + bounds + receipt
  -> renderer-specific compilation
  -> BroMetal programs and immutable GPU resources
```

Every renderer implements the same lifecycle:

- construct from a canvas, scene, camera snapshot, style, and error callback;
- upload geometry or volume once;
- render from the host animation frame;
- report draw calls, submitted primitives/rays, one-time bytes, per-frame bytes, and approach facts;
- invalidate only the state its algorithm needs; and
- dispose all programs, buffers, textures, targets, listeners, and the renderer.

The official BroMetal 0.18 package owns the one render animation loop; the app publishes the latest
camera/style state to it. Antiky's installed copy adds `renderer.present()` through a local patch,
which is the future host-owned frame API but is intentionally not duplicated in this independent
research package. The app owns one orbit camera. Switching renderer or scene disposes the old
pipeline before publishing the replacement. Async construction is generation-fenced so stale work
cannot replace a newer selection.

## Implementation packets

### 01 — Shared importer, scene, camera, and evidence shell

Owned files: package/build configuration, `src/vox/**`, `src/scene/**`, `src/camera/**`, shared
renderer types, React shell, styles, and shared tests.

Deliver:

- bounded binary reads and stable diagnostics for truncated or over-limit files;
- official default-palette fallback and user-palette handling;
- multiple base models and `MATL` dictionary preservation;
- deterministic original scene with opaque, metal-like, rough, and emissive cells;
- one orbit camera shared by all approaches;
- Studio-aligned near-black evidence stage, status text, renderer tabs, style control, file picker,
  model selector, reset action, help, and compact live measurements;
- visible WebGPU/import/shader/device errors rather than a blank canvas; and
- honest support and provenance copy in the UI and README.

Tests must cover valid base input, absent/present palette, multiple models, material dictionaries,
unknown chunks, malformed bounds/counts, limits, coordinate normalization, deterministic scene
output, and camera invalidation.

### 02 — Greedy surface mesh / physical raster

Owned files: `src/approaches/mesh/**` and its focused tests.

Deliver:

- six-direction exposed-face extraction;
- AO-aware greedy merge signatures and AO-selected quad diagonals;
- positions, normals, linear colors, material properties, emissive values, AO, indices, bounds, and
  an honest build receipt;
- an authored BroMetal surface shader with energy-conscious diffuse/specular response, sun/sky
  light, emissive response, fog, and tone mapping; and
- one-time immutable upload with no steady-state geometry upload.

Tests must prove internal-face removal, legal merges, refused AO/material merges, diagonal choice,
attribute/index integrity, deterministic output, and empty/single/solid/detailed fixtures.

### 03 — Exposed-face instances / graphic raster

Owned files: `src/approaches/instances/**` and its focused tests.

Deliver:

- one shared quad and one instance per exposed face;
- stable face codes, winding, reconstructed normals, palette/material data, corner AO, and build
  receipt;
- an authored BroMetal instance shader with banded light, face-value shaping, rim light, emissive
  accents, distance atmosphere, and a physical-style alternative without changing representation;
  and
- one opaque draw for the comparison scene, with immutable instance uploads.

Tests must prove six face orientations, internal-face removal, AO values, counts for solid and
porous fixtures, attribute agreement, and deterministic output.

### 04 — Dense DDA / progressive path tracing

Owned files: `src/approaches/raytrace/**` and its focused tests.

Deliver:

- tight dense `vec4` storage data with explicit byte/dimension caps;
- a CPU DDA oracle covering outside/inside, parallel, negative, face, edge, corner, miss, and
  traversal-cap cases;
- an authored BroMetal fullscreen sample shader with bounded primary, shadow, and two secondary
  traversals, stochastic jitter, diffuse/specular/emissive material response, and visible
  convergence;
- two accumulation targets using a running mean plus a separate presentation shader;
- reset generations for scene, camera, viewport, sample-defining material/light, and integrator
  changes, while presentation-only changes preserve samples; and
- sample count, reset reason, volume bytes, rays/sample, and cap diagnostics.

Tests must prove dense indexing, bounds, CPU DDA results, reset classification, running-mean math,
and generated shader/storage contracts.

### 05 — Comparison, visual verification, and closeout

Deliver:

- compile every authored shader to checked-in accessible `*.shader.gen.ts` WGSL;
- verify production build, types, tests, and deterministic receipts;
- open the built study in a WebGPU-capable Chromium session and inspect all three pipelines;
- capture the same scene/camera for each renderer and record viewport, DPR, browser, adapter when
  exposed, scene counts, renderer counts, and any visual limitation;
- write field notes that compare what each pipeline proved, got wrong, and would require before an
  Antiky CLI/Framework/Studio merge; and
- update the experiment README and completion summary with exact commands and evidence.

## Completion definition

The goal is complete only when all of these are true:

- Research exists for all three approaches, cites exact sources, distinguishes evidence from
  inference, and contains a consistent license ledger.
- The same built-in scene and an uploaded valid `.vox` base model can reach all three renderers.
- The tabs select genuinely different geometry/traversal pipelines, not style variants.
- Every maintained shader is authored in typed BroMetal source, compiled ahead of time, organized
  by pass, and paired with accessible generated WGSL.
- At least one raster path demonstrates strong stylization and the progressive path demonstrates
  indirect-light convergence; the UI labels approximations and limits honestly.
- Parser, compiler, traversal, invalidation, and lifecycle-sensitive behavior have meaningful tests
  that can fail.
- Typecheck, shader compilation, tests, production build, and live Chromium visual inspection all
  pass.
- README, comparison field notes, provenance, and completion summary record the evidence, surprises,
  remaining integration work, and action needed from the owner.

## Stop conditions

Stop and report rather than weakening the goal if:

- BroMetal cannot express one of the three shader paths without modifying its public API;
- no available browser session exposes WebGPU, preventing live rendering evidence;
- a required implementation would copy code or assets whose compatible license cannot be proven;
  or
- the current product architecture contradicts a required integration boundary that cannot be
  resolved inside this research experiment.
