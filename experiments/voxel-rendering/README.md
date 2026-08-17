# Voxel rendering field lab

This browser study renders one detailed voxel scene through three BroMetal/WebGPU pipelines. Use it
to compare AO-aware greedy meshing, exposed-face instancing, and progressive dense-grid ray
traversal with the same camera, source voxels, materials, and two visible presets:
**Photorealistic** and **Stylized**.

The built-in **Golden Hour Valley Atelier** is a 160 × 96 × 256 scene with 376,721 occupied voxels
and 33 authored material slots and variants. It surrounds the camera with continuous terrain: a
foreground path, steps, foliage, and lanterns lead to the atelier, garden, pond, and dock; hills,
forest, and ruins close the background. This depth is intentional because both presets use it for
composition, atmosphere, and depth of field.

See the [six-image evidence set](./docs/evidence/README.md) for the current output and the
[refinement report](./docs/refine-it/summary.md) for the acceptance criteria and remaining limits.

## Run the study

Use a Chromium browser with WebGPU enabled and a Node.js version supported by Vite 8.

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:4178/>.

- Select **Greedy mesh**, **Face instances**, or **Path trace** below the stage.
- Select **Photorealistic** or **Stylized** in the inspector.
- Drag the stage to orbit and use the wheel to move the camera.
- Select **Load .vox** to load local MagicaVoxel data.
- Reopen the bundled scene through the `.vox` parser to exercise the generated fixture.

The inspector reports submitted geometry or ray budgets, draw calls, payload bytes, sample count,
and deterministic build receipts. Import, device, and shader errors appear over the stage.

## Run through Antiky CLI

From the sibling `antiky` repository, launch the game-module build through the supported host:

```sh
npm run antiky -- dev --project ../research/experiments/voxel-rendering/voxel-rendering.antiky
```

The project uses game port 4178 and inspection port 4179. Query parameters can select a pipeline
and preset directly:

```text
http://127.0.0.1:4178/?approach=raytrace&style=graphic
```

Valid `approach` values are `mesh`, `instances`, and `raytrace`. The internal style IDs remain
`physical` and `graphic`; the interface presents them as **Photorealistic** and **Stylized**.
`npm run antiky:build` verifies the game module without starting a development session.

## Supported `.vox` data

The loader accepts validated MagicaVoxel 150-or-newer base-model chunks:

- `SIZE` and `XYZI` model data;
- `PACK` multi-model counts;
- `RGBA` palettes, with the official default palette as fallback; and
- preserved `MATL` dictionaries with the experiment's diffuse, metal, roughness, emission, and
  opaque/tinted glass mapping.

The file stays in the browser. Scene graph, layer, transform, shape, animation, and unknown chunks
are reported as unsupported diagnostics rather than interpreted. Input is capped at 32 MiB, 64
models, one million voxels per model, and two million voxels in total. The dense ray path has its own
256-cell per-axis and 64 MiB volume limits. Glass is an approximation, not sorted transparency or
physical refraction.

## Verify the implementation

```sh
npm test
npm run typecheck
npm run build
npm run antiky:build
npm run measure
```

`npm test` regenerates the built-in `.vox` fixture, compiles the typed BroMetal shaders for
production, and runs the parser, geometry, DDA, accumulation, camera, capture-fixture, and lifecycle
tests. `npm run measure` prints deterministic CPU-side representation receipts; it does not measure
GPU frame time. The [execution summary](./docs/summary.md) records the final check-in verification.

The maintained shader sources and generated WGSL are grouped by pipeline:

- [`src/approaches/mesh`](./src/approaches/mesh) — greedy surface rasterization;
- [`src/approaches/instances`](./src/approaches/instances) — exposed-face instancing; and
- [`src/approaches/raytrace`](./src/approaches/raytrace) — progressive volume traversal and
  presentation.

Shared cinematic presentation code is in [`src/render`](./src/render). Do not edit
`*.shader.gen.ts` files directly. Run `npm run shaders` after changing an authored `*.shader.ts`
file.

## Read the study

- [Refinement goal](./docs/refine-it/refine-goal.md)
- [Refinement acceptance report](./docs/refine-it/summary.md)
- [Visual evidence and capture receipts](./docs/evidence/README.md)
- [Pipeline comparison](./docs/field-notes.md)
- [Execution and verification summary](./docs/summary.md)
- [Original implementation plan](./docs/plan.md)
- [Surface-meshing research](./docs/research/01-surface-meshing.md)
- [Instanced-voxel research](./docs/research/02-instanced-voxels.md)
- [Ray-traversal research](./docs/research/03-ray-traversal.md)
- [Third-party notices](./THIRD_PARTY_NOTICES.md)

The built-in scene and generated `.vox` fixture are original experiment assets. WebGPU-.vox was
read only as unlicensed prior art; no code, shader, parser, or asset from it is included.
