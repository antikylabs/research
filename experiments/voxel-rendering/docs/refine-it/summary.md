# Refinement acceptance report

The first field-lab result missed the requested visual bar because it placed a low-resolution model
against an open sky and then applied presentation effects without meaningful scene depth. This
refinement rebuilds the subject and its surroundings together: **Golden Hour Valley Atelier** now
provides a detailed focal building, continuous terrain, and foreground-to-background staging for
every renderer and both requested presets.

This report maps the [refinement brief](./refine-goal.md) to implementation and visual evidence. The
[evidence index](../evidence/README.md) is the authoritative manifest for the six PNGs and their
capture receipts.

## Acceptance matrix

| Refinement requirement | Implemented response | Evidence | Assessment |
| --- | --- | --- | --- |
| Two versions of each rendering approach | Greedy mesh, face instances, and dense DDA each expose **Photorealistic** and **Stylized**. Internal compatibility IDs remain `physical` and `graphic`. | [Six-image manifest](../evidence/README.md) | Implemented and evidenced |
| A substantially higher-resolution voxel model | The scene is 160 × 96 × 256 with 376,721 occupied voxels. The facade spans about 87 output voxels and the door leaf about 20, with panels, glazing, hardware, roof tiles, skylights, and gutters. | All six captures; scene fingerprint `753a16b1` | Implemented and evidenced |
| A scene around the subject | Continuous terrain connects foreground path, steps, foliage, and lanterns to the atelier, garden, pond, and dock; hills, forest, and ruins fill the background. | All six captures | Implemented and evidenced |
| Depth of field with meaningful depth planes | Raster paths store axial camera-forward depth and apply focus-range blur. Dense DDA samples a thin lens. The camera targets the entrance across near, middle, and far geometry. | [Mesh Photorealistic](../evidence/voxel-mesh-photorealistic.png), [Instances Photorealistic](../evidence/voxel-instances-photorealistic.png), [DDA Photorealistic](../evidence/voxel-raytrace-photorealistic.png) | Implemented and evidenced |
| Golden-hour or comparable cinematic lighting | The Photorealistic treatment combines a warm directional sun, atmospheric environment, emissive accents, fog, HDR presentation, bloom, vignette, and ACES tone mapping. | Three Photorealistic captures | Implemented and evidenced |
| Shadows | Both raster pipelines use 1536² shadow maps. Dense DDA samples direct sun with stochastic soft shadowing. | Three Photorealistic captures | Implemented and evidenced |
| Better materials and shaders | The scene uses 33 authored material slots and variants. Raster shaders include material response, shadows, fog, emission, axial depth, and cinematic presentation; DDA includes direct light and two secondary traversals. | Six captures and pipeline source | Implemented and evidenced |
| Glass and water | The scene includes glazed windows/skylights and a pond with water accents. Raster and DDA shaders provide bounded glass/reflection responses. | Photorealistic captures | Implemented with an explicit approximation |
| A clearly different Stylized result | Stylized presentation changes palette grading and quantization while preserving the same detailed scene and camera. | [Mesh Stylized](../evidence/voxel-mesh-stylized.png), [Instances Stylized](../evidence/voxel-instances-stylized.png), [DDA Stylized](../evidence/voxel-raytrace-stylized.png) | Implemented and evidenced |
| Evidence-backed results | Six 1280 × 720, DPR 1 canvas captures record exact evidence IDs, artifact IDs, and SHA-256 values from one Antiky runtime. | [Capture manifest](../evidence/README.md) | Implemented; managed artifacts were `private-unreviewed` before check-in review |

## Why the revision reads as a scene

The improvement is structural, not only a shader change. The foreground intersects the viewer's
space and supplies the strongest blur cues. The entrance-targeted camera gives the detailed facade
a clear subject plane. Water, garden, dock, and terrain bridge that subject to distant hills and
ruins, so atmosphere and focus falloff describe actual distance. Continuous ground removes the old
floating-platform silhouette.

The same structure also gives the Stylized preset something to simplify deliberately. Its color and
banding choices now operate over readable architecture, vegetation, water, props, and distance
layers rather than compensating for missing detail.

## Receipts and research costs

| Pipeline | Deterministic representation receipt |
| --- | --- |
| Greedy mesh | 286,522 exposed faces; 170,124 quads; 340,248 triangles; 39,468,768 bytes; fingerprint `042b07fa` |
| Face instances | 286,522 exposed faces; 573,044 triangles; 18,337,484 bytes; fingerprint `008929e4` |
| Dense DDA | 62,914,560-byte dense volume + 8,192-byte material tables; 515-cell traversal cap |

These are deterministic CPU and representation receipts, not GPU benchmark timings. Dense DDA
uses 62,922,752 bytes before its viewport-sized accumulation targets and converges toward a
512-sample limit. That cost is part of the research result, not hidden behind the final image.

## Honest boundary of “Photorealistic”

**Photorealistic** is the preset name requested by the brief. It describes the golden-hour,
shadowed, depth-of-field, PBR-oriented cinematic treatment. It is not a claim that block-based
geometry is indistinguishable from a photograph. In particular, glass remains approximate: the
raster paths do not implement sorted transparent refraction, and the DDA response is a bounded
reflection/glass model.

The current work satisfies the refinement through a much higher-fidelity model, a complete scene,
real focus behavior, stronger lighting/material pipelines, and matched evidence. The completed
automated command suite and documentation audit are recorded in the [execution summary](../summary.md).
