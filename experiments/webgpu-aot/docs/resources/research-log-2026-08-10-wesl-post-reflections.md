# WESL Bloom, Output, and Reflection Experiment

## Question

WESL was the lowest-scoring renderer after BroMetal convergence. Its raw HDR was already close to Three.js in the broad scene and floor, but its final presentation used a quarter-resolution three-pass bloom, approximate scalar tone mapping, gamma, FXAA/spatial blur, blue channel gain, vignette, grain, and empirical output gain/offset. Its SSR also produced a long bright mirror streak across the floor.

The experiment held the accepted deterministic light rig, particles, cascaded sun, startup environment prefilter, forward materials, and ambient construction fixed.

## Static WESL correction

WESL now owns a statically linked five-level bloom graph:

* half-resolution Rec.709 extraction at threshold `1`, smooth width `.01`;
* five progressive levels with kernel radii `[6,10,14,18,22]`;
* separable Gaussian horizontal/vertical passes at every level;
* factors `[1,.8,.6,.4,.2]`, radius `.0035`, and strength `.18`;
* twelve authentic fullscreen bloom passes.

The final WESL shader now directly adds HDR, reflection, and five bloom levels, then applies the same matrix ACES fit and piecewise sRGB transfer as Three.js at exposure `1`. It removes the previous `.36` bloom multiplier, `.9` reflection multiplier, second spatial blur, channel grade, vignette, grain, gamma approximation, and empirical gain/offset.

## Red-first evidence

The regressions initially failed because WESL had no bloom plan, exposure remained `.69`, spatial blend remained `.25`, bloom used the rejected single-scale threshold/blur, and post-processing retained every empirical presentation term.

Tests now freeze the five sizes, reference constants, Gaussian contract, five post bindings, exposure, exact output functions, and absence of presentation cheats. The complete WESL suite passes 40 tests, package typecheck, static shader linking, and production build.

## Bloom/output result

The synchronized capture `/tmp/wesl-bloom-output-1` passed with all five demos ready and no issues.

| Metric | Prior WESL | Five-level bloom + exact output | Change |
| --- | ---: | ---: | ---: |
| Similarity | 0.956250 | 0.965350 | +0.009100 |
| Color | 0.972871 | 0.987737 | +0.014866 |
| Luminance | 0.975773 | 0.979137 | +0.003364 |
| Structure | 0.966223 | 0.976160 | +0.009937 |
| Tone | 0.919880 | 0.964329 | +0.044449 |

Tone is the largest breakthrough. The output no longer relies on renderer-specific grading to resemble the reference. Floor-pool coherent rows reach `0.995781`.

## Reflection-transfer correction

Side-by-side inspection then exposed a bright, elongated floor reflection absent from Three.js. WESL's accepted-hit transfer favored upward-facing, low-roughness surfaces and thresholded source peaks. That made the floor disproportionately reflective.

The replacement is WESL-local and uses metallic response, squared 100-unit plane-distance attenuation, grazing response, luminance cap `10`, and intensity `.7`. It removes the peak, upward-normal, roughness, and empirical confidence transfer terms while leaving the WESL ray marcher and reconstruction passes unchanged.

| Reflection region | Before | After |
| --- | ---: | ---: |
| Floor mean | 0.002382 | 0.000415 |
| Full mean | 0.001563 | 0.000870 |
| Left-fire mean | 0.002997 | 0.005181 |
| Right-fire mean | 0.000483 | 0.001297 |
| Upper-gallery mean | 0.000059 | 0.000402 |

This is the desired redistribution: floor energy falls roughly sixfold while fire and upper sources gain relative importance. The long floor streak disappears.

The capture `/tmp/wesl-reflection-transfer-1` scored `0.964591`, a small decline from `0.965350`. The decline is retained and documented because the former streak contributed accidental matching brightness while being structurally wrong to the human eye and causally inconsistent with the reference transfer.

## Remaining gaps

WESL still presents an unjittered single-frame HDR scene. Three.js resolves its raw scene through temporal jitter/history before SSR and bloom. Canonical raw WESL left-fire mean is about `1.07` versus Three.js `1.67`, while Three's temporal resolve is about `.986`; a WESL temporal pass should therefore reduce spikes and spread persistent energy without enlarging particles.

WESL SSR still uses its older 24-step widening-slab marcher and fixed reconstruction rather than the accepted refined ray path and roughness-selected mip pyramid. Those are separate future experiments; the transfer change intentionally did not entangle them.

## Decision

Retain the five-level bloom, exact output transform, exposure `1`, and source-correct reflection transfer. The output is visibly more polished and structurally closer despite the small SSR-transfer score tradeoff. The next highest-value WESL correction is temporal scene resolve before further reflection tuning.

## Canonical artifact checkpoint

The canonical heavy-profile artifacts were refreshed at `artifacts/visual-comparison`. All five demos were ready at synchronized frame 12 with no issues, and the report status was `PASS`. The repeat recorded WESL similarity `0.964655`, color `0.988584`, luminance `0.980549`, histogram `0.896857`, structure `0.981995`, and tone `0.959427`.
