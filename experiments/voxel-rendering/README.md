# Voxel rendering field lab

This browser study is a compact render studio for comparing three BroMetal/WebGPU pipelines. Use it
to render the same model and environment through AO-aware greedy meshing, exposed-face instancing,
and progressive dense-grid ray traversal with shared controls and two visible treatments:
**Photorealistic** and **Stylized**.

The bundled catalog contains three original complete subjects: **Lantern Pavilion**, **Copper Survey
Rover**, and **Moon Gate Shrine**. Each composes at a stable scale with a pedestal or one of five
`384 × 128 × 384` natural worlds. Forest, snow forest, mountains, beach, and swamp use continuous
terrain, layered near/middle/far scenery, modeled branch and foliage systems, authored sanctuary
forecourts, and biome-specific structures, paths, water, rocks, ground cover, wildlife, boats,
flags, birds, rooted trunks, bark scars, hanging growth, palm fruit, and restrained emissive detail.
Snow accumulates on exposed model surfaces, and each
natural world has a landmark-focused evidence vista in addition to the shared inspection cameras.
Imported `.vox` files remain in a session catalog so one or more local models can be compared
without uploading them again.

The checked-in [Round 1 evidence](./docs/evidence/README.md) predates the studio controls. The
[Round 2 evidence manifest](./docs/refine-it/round-2/evidence.md) contains the promoted matched and
focused WebGPU captures, runtime receipts, and known limits. It also identifies newer shader work
that still requires a live WebGPU recapture before promotion.

## Run the study

Use a Chromium browser with WebGPU enabled and a Node.js version supported by Vite 8.

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:4178/>.

- Select a bundled or imported model and an environment independently.
- Select **Greedy mesh**, **Face instances**, or **Path trace** below the stage.
- Select **Photorealistic** or **Stylized**, with optional final grading.
- Click the stage to enter mouse-look. Use `W`, `A`, `S`, and `D` to fly, Space/Shift to rise/fall,
  and Escape to release the pointer. **Reset view** restores the initial camera.
- Tune depth-of-field enable, focus distance, aperture, time, moon, exposure, and surface variation.
- Use **Reload renderer** to dispose/remount the selected GPU pipeline without losing controls.
- Add or drop one or more `.vox` files. Rejected files receive a persistent visible diagnostic.

The inspector reports submitted geometry or ray budgets, draw calls, payload bytes, sample count,
and deterministic build receipts. Import, device, and shader errors appear over the stage.

## Run through Antiky CLI

From the sibling `antiky` repository, launch the game-module build through the supported host:

```sh
npm run antiky -- dev --project ../research/experiments/voxel-rendering/voxel-rendering.antiky
```

The project uses game port 4178 and inspection port 4179. Query parameters can select a
reproducible studio state directly:

```text
http://127.0.0.1:4178/?approach=raytrace&style=graphic&model=2&environment=beach&time=1.5&moon=off&focus=42&aperture=1.6
```

Valid `approach` values are `mesh`, `instances`, and `raytrace`. The internal style IDs remain
`physical` and `graphic`; the interface presents them as **Photorealistic** and **Stylized**.
`model` is `0`, `1`, or `2`; `environment` accepts `pedestal`, `forest`, `snow-forest`, `mountains`,
`beach`, or `swamp`. Optional controls are `time`, `moon=off`, `dof=off`, `focus`, `aperture`,
`exposure`, `grade=off`, and `variation`.
`npm run antiky:build` verifies the game module without starting a development session.

## Supported `.vox` data

The loader accepts validated MagicaVoxel 150-or-newer base-model chunks:

- `SIZE` and `XYZI` model data;
- `PACK` multi-model counts;
- `RGBA` palettes, with the official default palette as fallback; and
- preserved `MATL` dictionaries with the experiment's diffuse, metal, roughness, emission, glass,
  and explicit water mapping.

The file stays in the browser. Scene graph, layer, transform, shape, animation, and unknown chunks
are reported as unsupported diagnostics rather than interpreted. Input is capped at 32 MiB, 64
models, one million voxels per model, and two million voxels in total. The dense ray path has its own
384-cell per-axis and 128 MiB volume limits. It packs four palette indices into each storage `vec4`;
the full natural world occupies 75,497,472 volume bytes. Raster water/glass use an unsorted alpha
pass. Dense DDA uses bounded straight-through transmission with distance tint/attenuation. Neither
is physical refractive ray bending.

## Verify the implementation

```sh
npm test
npm run typecheck
npm run build
npm run antiky:build
npm run measure
```

`npm test` regenerates the legacy `.vox` fixture, compiles the typed BroMetal shaders for production,
and runs parser, geometry, water, DDA, accumulation, camera, lighting, studio-state, scene-catalog,
capture-fixture, and lifecycle tests. `npm run measure` prints deterministic CPU-side representation
receipts for the original measurement scene; it does not measure GPU frame time.

The maintained shader sources and generated WGSL are grouped by pipeline:

- [`src/approaches/mesh`](./src/approaches/mesh) — greedy surface rasterization;
- [`src/approaches/instances`](./src/approaches/instances) — exposed-face instancing; and
- [`src/approaches/raytrace`](./src/approaches/raytrace) — progressive volume traversal and
  presentation.

Shared cinematic presentation code is in [`src/render`](./src/render). Do not edit
`*.shader.gen.ts` files directly. Run `npm run shaders` after changing an authored `*.shader.ts`
file.

## Read the study

- [Round 2 goal](./docs/refine-it/round-2/refine-goal.md)
- [Round 2 execution summary](./docs/refine-it/round-2/summary.md)
- [Round 2 reference analysis](./docs/refine-it/round-2/reference-analysis.md)
- [Round 2 evidence manifest](./docs/refine-it/round-2/evidence.md)
- [Round 1 visual evidence](./docs/evidence/README.md)
- [Pipeline comparison](./docs/field-notes.md)
- [Execution and verification summary](./docs/summary.md)
- [Original implementation plan](./docs/plan.md)
- [Surface-meshing research](./docs/research/01-surface-meshing.md)
- [Instanced-voxel research](./docs/research/02-instanced-voxels.md)
- [Ray-traversal research](./docs/research/03-ray-traversal.md)
- [Third-party notices](./THIRD_PARTY_NOTICES.md)

The built-in scene and generated `.vox` fixture are original experiment assets. WebGPU-.vox was
read only as unlicensed prior art; no code, shader, parser, or asset from it is included.
