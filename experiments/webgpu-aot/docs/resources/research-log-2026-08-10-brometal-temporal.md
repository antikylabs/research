# BroMetal Temporal Resolve Experiment

## Question

BroMetal's deterministic particles, cascaded sun, and reconstructed reflections were substantially closer to Three.js, but the image still looked harsher and less polished. The next hypothesis was temporal: Three.js resolves its raw HDR scene through jittered temporal antialiasing before adding SSR and bloom, while BroMetal presented a single-frame scene through FXAA.

This experiment changed only the scene resolve and composition order. Particle simulation, analytic lights, shadow cascades, raw SSR tracing, five-mip reflection reconstruction, roughness selection, AO generation, bloom kernels, exposure, and output transform remained fixed.

## Breakthrough

The important discovery was that Three.js's apparent particle smoothness is mostly downstream behavior, not a more elaborate particle fragment shader. Its visible particles are plain additive squares. Projection jitter, history accumulation, variance clipping, and bloom turn those squares into the smoother light distribution seen by the eye.

BroMetal now owns an independent temporal implementation with:

* a deterministic 31-sample Halton `(2, 3)` jitter cycle;
* projection jitter rebuilt from an immutable base matrix each frame;
* two full-resolution `rgba16float` history targets;
* non-aliasing history ping-pong;
* a 3x3 current-color mean and variance neighborhood;
* gamma-one history AABB clipping;
* a 5% current / 95% history blend after frame zero;
* Three-style luminance compression and normalized HDR weighting;
* temporal history containing neither SSR nor bloom;
* raw HDR continuing to feed SSR, while temporal HDR plus reconstructed SSR feeds bloom and final presentation.

The implementation remains BroMetal-owned. It does not import Three.js, another demo runtime, a shared renderer, or prerecorded history.

## Red-first evidence

The initial regression failed because BroMetal had no temporal plan or generated temporal shader. Tests then froze the Halton sequence, wrap behavior, immutable projection jitter, ping-pong indices, first-frame validity, artifact bindings, and graph contract.

A second regression failed because the final composite still called the old `fxaaHdr` path after temporal resolution. The final presentation now samples the resolved HDR directly. The complete BroMetal suite, package typecheck, deterministic generation, and production build pass.

## Stage result

The synchronized heavy capture `/tmp/brometal-temporal-2` completed with all five demos ready at frame 12, no reported issues, and report status `PASS`.

The temporal stage is much closer to Three.js in the moving fire regions:

| Region | BroMetal temporal mean | Three.js TRAA mean | Absolute gap |
| --- | ---: | ---: | ---: |
| Full | 0.067291 | 0.061348 | 0.005943 |
| Floor | 0.073850 | 0.064147 | 0.009703 |
| Left fire | 0.971911 | 0.985979 | 0.014068 |
| Right fire | 0.128825 | 0.127315 | 0.001510 |
| Upper gallery | 0.075779 | 0.091542 | 0.015763 |

The left and right fire results are the clearest confirmation of the hypothesis. Their temporal energy is now extremely close to the Three.js resolve without enlarging particles, reshaping fragments, or tuning a global bloom gain. The human-eye result is smoother and less brittle around the emitters.

## Final-image result: partial acceptance

| Metric | Refined-ray checkpoint | Temporal + direct presentation | Change |
| --- | ---: | ---: | ---: |
| Final similarity | 0.949244 | 0.948121 | -0.001123 |
| Floor-pool contrast | 0.108636 | 0.109209 | +0.000573 |
| Floor-pool ratio | 1.413330 | 1.415005 | +0.001675 |
| Coherent-row fraction | 0.945148 | 0.949367 | +0.004219 |
| Upper-spill contrast | 0.215259 | 0.212563 | -0.002696 |

The temporal resolve is retained because it fixes the correct causal stage and materially improves the moving-light distribution, even though the aggregate display score falls slightly. Removing the obsolete FXAA changed the first temporal candidate from `0.948192` to `0.948121`, demonstrating that another spatial AA filter is not the missing polish.

## What the experiment exposed

Temporal accumulation cannot repair biased raw lighting. The floor remains too bright before temporal resolution, while the upper gallery remains too dark. History correctly preserves those regional errors:

* floor temporal mean is about 15% above the Three.js resolve;
* upper-gallery temporal mean is about 17% below it;
* fire regions, where the raw producer and temporal behavior are now aligned, are close.

This separates two previously entangled problems. The harsh particle appearance was temporal. The remaining broad midtone and gallery mismatch is indirect/environment lighting and AO placement, not particle geometry, SSR gain, FXAA, or temporal weight.

## Limitations

This is a benchmark-specialized zero-velocity temporal path. The camera and opaque Sponza geometry are static, and transparent particles are excluded from Three.js's velocity prepass. A general moving-camera or moving-opaque implementation would also need velocity, previous depth, and disocclusion validation. Those resources would add authentic workload, but they are not active in this synchronized benchmark and were not invented merely to increase cost.

## Next experiment

Hold the accepted temporal graph, exact particles, cascaded sun, and reflection graph fixed. Audit BroMetal's environment/IBL consumer and AO placement against Three.js. The target is regional: reduce excess floor/control energy while raising upper-gallery indirect light. Do not compensate with a global exposure, bloom, SSR, or history-weight adjustment.

## Decision

Retain the temporal resolve and direct presentation path as a structural and human-eye improvement. Record the small score regression honestly. Treat environment-derived indirect lighting as the next source-causal correction.

## Canonical artifact checkpoint

The canonical heavy-profile artifacts were refreshed at `artifacts/visual-comparison` after the implementation and lab-note commits. All five demos were ready at synchronized frame 12 with no issues, and the report status was `PASS`. The checkpoint records BroMetal similarity `0.948121`, upper-spill contrast `0.212563`, floor contrast `0.109209`, floor ratio `1.415005`, and coherent-row fraction `0.949367`.
