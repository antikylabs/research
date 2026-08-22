# Refined voxel pipeline comparison

The refined study changes the comparison from “can three pipelines draw the same voxels?” to “how
do three representations carry the same cinematic scene?” Greedy mesh remains the strongest first
production candidate, exposed-face instancing remains the clearest voxel-native alternative, and
dense DDA remains a useful lighting reference whose memory and convergence costs keep it in
research.

These conclusions combine the [six matched images](./evidence/README.md), deterministic scene and
representation receipts, and source-level behavior. The byte and geometry counts below are not GPU
benchmark timings. No frame-time claim follows from them.

## Depth of field now has a scene to describe

The old isolated model gave blur almost no visible distance structure. **Golden Hour Valley
Atelier** instead fills a 160 × 96 × 256 grid with 376,721 occupied voxels and continuous terrain.
The camera looks toward the entrance across foreground path, steps, foliage, and lanterns. The
atelier, garden, pond, and dock occupy the middle plane; hills, forest, and ruins occupy the far
plane. This gives both focus implementations visible near, subject, and far distances.

The larger grid also changes the model's visual vocabulary. The facade spans about 87 output voxels
and the door leaf about 20, leaving room for panels, glazing, hardware, roof tiles, skylights,
gutters, plants, water accents, and 33 authored material slots and variants. The scene fingerprint
is `753a16b1`.

Raster depth of field stores axial camera-forward depth rather than radial distance. That keeps a
flat focal plane around the entrance instead of bending focus into a sphere around the camera. A
focus-range blur, HDR scene target, bloom, vignette, ACES tone mapping, and 1536² shadow map make up
the shared cinematic presentation. The ray path uses a thin lens, so its depth of field is part of
sample generation rather than a screen-space blur.

## Representation receipts

Run `npm run measure` to reproduce these deterministic CPU-side receipts.

| Measurement | Greedy mesh | Face instances | Dense DDA |
| --- | ---: | ---: | ---: |
| Occupied source voxels | 376,721 | 376,721 | 376,721 |
| Exposed unit faces | 286,522 | 286,522 | n/a |
| Submitted quads | 170,124 | 286,522 | 1 fullscreen quad per pass |
| Submitted triangles | 340,248 | 573,044 | 2 per fullscreen pass |
| Immutable representation bytes | 39,468,768 B | 18,337,484 B | 62,922,752 B |
| Deterministic representation receipt | `042b07fa` | `008929e4` | dimensions and byte limits |
| Traversal cap | n/a | n/a | 515 cells per traversal |

The dense figure is 62,914,560 bytes of cell volume plus 8,192 bytes of material tables. It does
not include the viewport-sized accumulation targets. At this scene size, a dense representation is
simple to index but expensive to scale: it pays for every cell in the 160 × 96 × 256 bounds whether
or not that cell is occupied.

Greedy merging cuts the raster submission from 286,522 exposed faces to 170,124 material- and
AO-compatible quads. Its current payload is still larger than the instance payload because every
mesh vertex repeats its full attribute set. Face instances share one quad and carry a smaller record
per exposed face. The receipts expose both facts; triangle count alone does not identify the cheaper
representation.

## Greedy mesh: conventional integration, reduced topology

The mesh compiler performs six-direction exposure checks and merges only faces with compatible
material and four-corner AO signatures. It selects quad diagonals from AO values. The raster shader
then applies the scene's material response, golden-hour sun, 1536² shadow map, environment and fog
terms, emission, and the shared HDR presentation.

This is the easiest pipeline to place inside a conventional engine. Its result can use familiar
mesh culling, shadow, picking, and asset-cache systems, and it submits 40% fewer quads than the
exposed-face representation for this scene. The cost is compilation and a verbose proof-oriented
vertex format. Packed normals, palette/material indices, and smaller indices remain production
work.

## Face instances: voxel identity, larger draw workload

The instance compiler emits one stable record for every exposed face and reconstructs six outward
orientations from a shared quad. It keeps the voxel stepping explicit while using the same
golden-hour shadows, material inputs, axial-depth focus, HDR presentation, and visible presets as
the mesh path.

This path has the smallest current immutable payload and is attractive when grids change often or
when unit-scale voxel faces are part of the art direction. It submits 286,522 quads—116,398 more
than the greedy result—and therefore trades simpler rebuilding and voxel identity for more raster
work. That trade should be measured on target GPUs before an engine threshold is chosen.

## Dense DDA: richer sampling, dense-memory ceiling

The path sample shader traverses the dense volume for primary visibility, direct sun and soft
shadowing, and two secondary interactions. A reflection and glass approximation contributes to the
accumulated result. Running-mean accumulation stops at 512 samples, and a separate presentation
pass applies the visible preset without redefining the scene.

This proves thin-lens depth of field, stochastic soft shadowing, and secondary traversal through
BroMetal's public shader path. It does not prove real-time performance. Each traversal can inspect
up to 515 cells, the dense scene and materials consume 62,922,752 bytes before accumulation
targets, and convergence requires many fullscreen samples. A production continuation would need
GPU timing evidence and likely a sparse hierarchy or another bounded acceleration structure.

## What the presets do—and do not claim

**Photorealistic** is the requested user-facing name for the cinematic, PBR-oriented treatment.
Golden-hour lighting, shadows, depth of field, bloom, tone mapping, water, glass accents, and a
layered environment now support that intent. The name is not a claim that the voxel image is
photo-indistinguishable. Glass remains an approximation; the raster paths do not provide sorted
transparent refraction, and the ray path's glass/reflection model is bounded for this experiment.

**Stylized** keeps the same geometry and camera but deliberately changes grading and quantization.
Because style is no longer standing in for missing geometry, the comparison exposes a presentation
choice rather than two palette swaps on a low-resolution floating model. Internal IDs remain
`physical` and `graphic` for compatibility.

## Recommendation

Use greedy mesh as the next Framework integration experiment and measure it against packed face
instances on multiple authored scenes. Keep both visible presets above the representation so art
direction does not dictate storage. Keep dense DDA as a lighting and material reference until a GPU
profile justifies a specific sparse structure, denoiser, or BroMetal addition.
