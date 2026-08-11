# BroMetal Screen-Space Reflection-Ray Experiment

## Question

The accepted BroMetal reflection reconstruction and physically defined hit transfer removed the false red floor streak and sharp speckles, but the raw trace became visibly under-populated. The remaining hypothesis was geometric: BroMetal still marched exactly 24 expanding world-space steps, accepted a widening radial depth slab, ignored the hit surface normal, and stopped at the first coarse crossing. Three.js instead allocates work from the projected ray length, tests local geometric thickness, rejects reflection rays that strike the back side of a surface, and refines the crossing.

This experiment changed only ray construction and hit geometry. The accepted hit transfer, five-mip reconstruction, roughness selector, particles, analytic lights, cascaded sun, AO, bloom, exposure, and output transform remained fixed.

## Native BroMetal marcher

BroMetal now owns the following heavy-profile ray path:

* maximum mirror distance `100` world units;
* receiver-normal origin offset `0.045`;
* projected dominant-axis step count at quality `30/64`;
* a defensive maximum of 2048 steps for rays that cross the camera plane;
* a local thickness derived from three neighboring world-position texels, with minimum `0.05`;
* point-to-ray distance intersection testing rather than the former expanding radial slab;
* rejection when `dot(reflectedDirection, hitNormal) >= 0`;
* rejection beyond the same 100-unit point-to-plane distance used by transfer;
* eight binary refinement iterations around the first valid crossing.

The implementation remains a statically generated BroMetal shader. It does not import Three.js, another demo's runtime, a shared renderer, or precomputed trace data.

## Red-first evidence

The regression initially failed because BroMetal exposed no march contract and generated WGSL still contained `step < 24` and `0.11 + travel * 0.028`. The test now freezes the quality, distance, normal offset, minimum thickness, and refinement count and verifies dominant-axis stepping, line-distance testing, normal rejection, refinement, and removal of the rejected 24-step slab.

After implementation, the complete BroMetal suite passed 33 tests, package typecheck, deterministic shader regeneration, and the production build.

## Result: accepted

The heavy-profile capture `/tmp/brometal-refined-rays-1` completed with all five demos ready at synchronized frame 12, no issues, no shared-renderer pairs, and report status `PASS`.

| Metric | Accepted transfer/reconstruction | Refined rays | Change |
| --- | ---: | ---: | ---: |
| Final similarity | 0.945238 | 0.949173 | +0.003935 |
| Floor-pool contrast | 0.107614 | 0.108636 | +0.001022 |
| Floor-pool ratio | 1.408183 | 1.413330 | +0.005147 |
| Coherent-row fraction | 0.940928 | 0.945148 | +0.004220 |
| Upper-spill contrast | 0.215701 | 0.215259 | -0.000442 |

The human-eye result agrees with the score. The rejected long floor streak remains absent. Valid reflected structure returns around the curtains and fire fixtures without recreating the former single-pixel wall and floor noise. BroMetal remains somewhat darker and less temporally smooth than Three.js, but its reflection shapes are materially closer.

Raw-trace samples show that this is a spatial-coverage correction rather than a global gain:

| Region | Active fraction before | Active fraction after | Mean before | Mean after |
| --- | ---: | ---: | ---: | ---: |
| Floor | 0.166667 | 0.316667 | 0.001055 | 0.000041 |
| Full | 0.200000 | 0.250000 | 0.000062 | 0.002696 |
| Left fire | 0.166667 | 0.291667 | 0.001083 | 0.004654 |
| Right fire | 0.164583 | 0.214583 | 0.000451 | 0.000246 |
| Upper gallery | 0.218750 | 0.351563 | 0.000398 | 0.000532 |

Floor coverage nearly doubles while its wrong concentrated energy falls by roughly 96%. Left-fire energy and coverage rise in the region where the prior corrected trace was missing information. This is the intended redistribution.

Particle invariants remain exact: all fire and curve position/color errors are zero, curve-radius errors are zero, and maximum fire-radius error is `0.000001`.

## Workload cost

This is intentionally a heavy renderer correction. At 2560×1440, the synchronized capture's displayed frame rate fell from roughly 35 fps to roughly 20 fps. The extra work comes from screen-length-scaled ray marching rather than an arbitrary synthetic loop, so it is both visually causal and representative of the higher-quality algorithm BroMetal is benchmarking.

## Remaining gap

BroMetal still lacks Three.js temporal scene resolve, environment-derived indirect lighting, and identical view-space depth interpolation. The current image remains darker through the midtones, while some reconstructed fire detail on the right curtain is broader and brighter than the reference. Those should not be corrected with a global SSR multiplier: coverage and energy vary by region.

The next highest-value BroMetal investigation should compare its fake hemisphere ambient against Three.js environment/IBL and AO application, or add the missing temporal resolve before retuning any reflection parameter. Either experiment must hold the accepted exact particles, ray geometry, hit transfer, and roughness reconstruction fixed.

## Decision

Retain the screen-space marcher and binary refinement. It produces a clear score gain, visibly improves reflection structure, preserves the source-correct transfer and reconstruction, and makes the demo heavier through authentic package-owned GPU work.

## Canonical artifact checkpoint

The canonical heavy-profile artifacts were refreshed at `artifacts/visual-comparison` after the implementation and lab-note commits. All five demos were ready at synchronized frame 12 with no issues or shared-renderer pairs, and the report status was `PASS`. The repeat produced BroMetal similarity `0.949244`, upper-spill contrast `0.215259`, floor contrast `0.108636`, floor ratio `1.413330`, and coherent-row fraction `0.945148`.
