# Voxel rendering refinement summary

Status: **complete**

The field lab now renders the detailed **Golden Hour Valley Atelier** through greedy mesh,
exposed-face instances, and dense DDA. Each pipeline exposes the requested **Photorealistic** and
**Stylized** preset, and the [matched evidence set](./evidence/README.md) records all six outputs
from one Antiky runtime, camera, viewport, and DPR.

## Delivered refinement

- An original 160 × 96 × 256 scene with fingerprint `753a16b1`, 376,721 occupied voxels, 33
  authored material slots and variants, an approximately 87-voxel facade, and an approximately
  20-voxel-wide door leaf.
- Continuous terrain and explicit foreground, middle, and background staging so the model is part
  of a scene rather than floating against the sky.
- Golden-hour material and lighting treatment with water, emissive, metal, foliage, and approximate
  glass responses.
- Shared raster HDR presentation with axial camera-forward depth, focus-range blur, bloom,
  vignette, ACES tone mapping, and 1536² shadow maps.
- Thin-lens path sampling with direct sun and soft shadowing, two secondary traversals,
  reflection/glass approximation, and a 512-sample running mean.
- Semantic Antiky capture controls that select exactly one pipeline and either user-facing preset.
- Six 1280 × 720, DPR 1 canvas captures with evidence and artifact receipts.

The detailed requirement mapping is in the [refinement acceptance report](./refine-it/summary.md).

## Deterministic representation results

| Pipeline | Representation result | Immutable bytes | Receipt or cap |
| --- | --- | ---: | --- |
| Greedy mesh | 286,522 exposed faces → 170,124 quads / 340,248 triangles | 39,468,768 B | `042b07fa` |
| Face instances | 286,522 exposed faces / 573,044 triangles | 18,337,484 B | `008929e4` |
| Dense DDA | 160 × 96 × 256 dense cells + material tables | 62,922,752 B | 515-cell traversal cap |

These are deterministic CPU compilation and representation receipts. They are not GPU frame-time,
GPU residency, or throughput benchmarks.

## Live capture receipt

Antiky development session `14a62a73-ba7a-4373-ae96-9d8d58743018` accepted build revision `1` and
served runtime `ef08a0c9-35a5-4e2d-82c2-739f219dc863`. The six final images were captured from the
canvas at 1280 × 720 and DPR 1. The managed evidence was canvas-only, contained no desktop pixels or
audio, and was marked `private-unreviewed` before check-in review.

The [evidence index](./evidence/README.md) records every filename, evidence ID, artifact ID, and
SHA-256.

## Final automated verification

The final command suite ran against the refined scene and generated fixture on 2026-08-17.

| Check | Final result |
| --- | --- |
| `npm test` | Passed: 17 files and 77 tests; all five authored shaders compiled for production |
| `npm run typecheck` | Passed |
| `npm run build` | Passed: standalone Vite production bundle emitted |
| `npm run antiky:build` | Passed: `dist/antiky.game.js` emitted |
| `npm run measure` | Passed: reproduced fingerprint `753a16b1` and all three receipts above |
| Anti-slop prose check | 0 findings across the current landing, evidence, comparison, and completion pages |
| Anti-slop structure check | 0 findings across 96 files; test collection was independently proved by Vitest |

## Result and limits

Greedy mesh remains the recommended first production direction because it produces conventional
raster geometry and reduces the scene to 170,124 quads. Face instances preserve the voxel surface
more directly with a smaller proof payload, at the cost of 286,522 submitted quads. Dense DDA now
produces a credible cinematic comparison, but its 62,922,752-byte dense scene/material allocation,
515-cell traversal cap, and 512-sample convergence remain research costs.

“Photorealistic” is the requested preset name and a statement of cinematic/PBR intent, not a claim
that the output is indistinguishable from a photograph. Glass is still approximate. The study also
does not establish GPU frame time, broad browser support, Tauri WebView behavior, denoising,
sparse-world scaling, or a production Antiky voxel resource contract.
