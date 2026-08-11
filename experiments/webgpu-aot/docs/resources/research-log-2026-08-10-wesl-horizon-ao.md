# WESL Horizon Ambient-Occlusion Experiment

## Question

After the projected reflection marcher corrected the curtain, floor, and stone reflection structure, WESL still looked broadly lifted beside Three.js. The mismatch appeared in pillars, crevices, and fire-adjacent masonry rather than in the now-verified selected-reflection graph. This experiment asked whether WESL's ambient-occlusion producer—not exposure, bloom, or tone mapping—was responsible.

## Instrumentation finding

The frame-12 heavy control `/tmp/wesl-projected-2` made the cause explicit. WESL's blurred AO channel averaged `0.985708` full-frame, `0.994141` on the floor, `0.980977` around the left fire, `0.976888` around the right fire, and `0.983067` in the upper gallery. Three's GTAO measured `0.869788`, `0.846928`, `0.728194`, `0.718905`, and `0.823652` in the same regions.

WESL's old producer sampled six nearby depth texels, multiplied one center-depth difference by `180`, and clamped visibility to at least `0.34`. In this camera and geometry, nearly every pixel stayed close to one. The forward shader correctly applied AO only to environment lighting, but the AO field contained almost no meaningful geometry.

## Native WESL correction

Commit `5419efa` replaces that approximation with a statically linked, WESL-owned horizon integrator. The CPU uploads the inverse jittered view-projection matrix each frame. The full-resolution compute shader reconstructs world position from the depth prepass, derives a geometric normal from neighboring positions, chooses three temporally rotated screen-space slices, and samples four distances in both directions. It integrates the two horizons with the cosine-weighted closed form used by GTAO and applies Three's configured scale of two. The existing WESL separable blur remains package-owned and the forward shader continues to occlude indirect environment lighting only.

This is authentic additional GPU work rather than a grade or delay. Each pixel now performs depth reconstruction plus 24 bidirectional horizon samples. The ambient uniform grows from 16 to 80 bytes so the shader receives the exact inverse projection for the jittered frame.

## Result

Two synchronized heavy captures, `/tmp/wesl-gtao-1` and `/tmp/wesl-gtao-2`, were numerically identical in the score, AO region means, selected-reflection evidence, and reported hotspots. All five renderers reached frame 12 with zero issues and no shared-renderer pair.

| Metric | Projected-SSR control | Horizon AO |
| --- | ---: | ---: |
| Similarity | 0.972297 | 0.985316 |
| Color | 0.991456 | 0.993215 |
| Histogram | 0.917268 | 0.969059 |
| Luminance | 0.984711 | 0.990137 |
| Structure | 0.987799 | 0.988452 |
| Tone | 0.968762 | 0.974992 |

The new AO means are full `0.860784`, floor `0.856327`, left `0.666864`, right `0.655969`, and upper `0.775030`. Full and floor are now within about one percentage point of Three. The two fire regions and upper gallery are six to seven points more occluded, which is consistent with WESL reconstructing geometric normals from depth while Three's prepass supplies material-aware normals.

The projected SSR checkpoint remained isolated: priority selected-reflection RGB log RMSE changed only from `0.046211` to `0.046200`. The score gain therefore comes from correcting indirect occlusion, not suppressing the accepted reflections.

## Decision

Accept the horizon AO producer. It removes the largest remaining broad WESL histogram mismatch, raises the complete visual score by `0.013019`, remains deterministic across repeat captures, and makes the workload heavier through native WESL computation. Do not tune AO strength globally: full and floor already match Three, and a scalar would trade those regions against the fire areas. The next refinement should investigate material-aware normal input or the localized fire/upper AO difference while holding radius, scale, SSR, bloom, and presentation fixed.
