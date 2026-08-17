# Voxel rendering field lab

This browser study renders one voxel scene through three different BroMetal/WebGPU pipelines. Use
it to compare AO-aware greedy meshing, exposed-face instancing, and progressive dense-grid ray
traversal against the same camera, materials, and source data.

The implementation is ready for local evaluation. Automated checks pass, but live GPU appearance
has not been certified because the execution environment had no available browser session. See the
[execution summary](./docs/summary.md) for the one remaining action.

## Run the study

Use a Chromium browser with WebGPU enabled and a Node.js version supported by Vite 8.

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:4178/>. The first view uses the original **Lumen Observatory** scene and the
greedy mesh pipeline.

- Select **Greedy mesh**, **Face instances**, or **Path trace** at the bottom of the stage.
- Select **Physical** or **Graphic** in the inspector.
- Drag the stage to orbit and use the wheel to move the camera.
- Select **Load .vox** to load local MagicaVoxel data.
- Select **Reopen this scene through the .vox parser** to test the bundled binary fixture.

The inspector reports submitted geometry or ray budgets, draw calls, payload bytes, sample count,
and the deterministic build receipt. Import, device, and shader errors appear over the stage.

## Supported `.vox` data

The loader accepts validated MagicaVoxel 150-or-newer base-model chunks:

- `SIZE` and `XYZI` model data;
- `PACK` multi-model counts;
- `RGBA` palettes, with the official default palette as fallback; and
- preserved `MATL` dictionaries with the experiment's diffuse, metal, roughness, emission, and
  opaque/tinted glass mapping.

The file stays in the browser. Scene graph, layer, transform, shape, animation, and unknown chunks
are reported as unsupported diagnostics. They are not interpreted. Input is capped at 32 MiB, 64
models, one million voxels per model, and two million voxels in total. The ray traversal proof has a
separate maximum dimension of 64 on every axis.

## Verify the implementation

```sh
npm test
npm run typecheck
npm run build
npm run measure
```

`npm test` regenerates the original `.vox` fixture, compiles every typed BroMetal shader for
production, and runs the parser, geometry, DDA, invalidation, camera, and lifecycle tests.
`npm run measure` prints deterministic CPU-side receipts for all three representations.

The maintained shader sources and their generated WGSL are grouped by pipeline:

- [`src/approaches/mesh`](./src/approaches/mesh) — physical surface raster control;
- [`src/approaches/instances`](./src/approaches/instances) — graphic exposed-face raster control;
  and
- [`src/approaches/raytrace`](./src/approaches/raytrace) — progressive volume traversal and
  presentation passes.

Do not edit `*.shader.gen.ts` files directly. Run `npm run shaders` after changing an authored
`*.shader.ts` file.

## Read the evidence

- [Experiment goal](./docs/goal.md)
- [Implementation plan and completion definition](./docs/plan.md)
- [Comparison field notes](./docs/field-notes.md)
- [Execution summary](./docs/summary.md)
- [Surface-meshing research](./docs/research/01-surface-meshing.md)
- [Instanced-voxel research](./docs/research/02-instanced-voxels.md)
- [Ray-traversal research](./docs/research/03-ray-traversal.md)
- [Third-party notices](./THIRD_PARTY_NOTICES.md)

The built-in scene and its generated `.vox` fixture are original experiment assets. WebGPU-.vox
was read only as unlicensed prior art; no code, shader, parser, or asset from it is included.
