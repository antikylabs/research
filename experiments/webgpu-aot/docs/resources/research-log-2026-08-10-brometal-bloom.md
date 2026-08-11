# BroMetal Five-Level Bloom Experiment

## Question

After environment lighting, BroMetal's raw HDR scene was close to Three.js but its final image still lacked the same polished glow distribution. Instrumentation exposed the mismatch: BroMetal used one quarter-resolution threshold target and two broad Gaussian passes, while Three.js used a half-resolution bright extraction followed by five progressively smaller separable Gaussian levels and a weighted composite.

The old BroMetal final bloom was regionally excessive despite looking spatially narrow. Its sampled full mean was `0.038686` versus Three.js `0.013107`; left fire was `0.828858` versus `0.472993`; right fire was `0.095925` versus `0.033343`.

## Independent implementation

BroMetal now owns:

* half-resolution Rec.709 luminance extraction with threshold `1` and smooth width `0.01`;
* five levels at half, quarter, eighth, sixteenth, and thirty-second resolution;
* horizontal and vertical Gaussian passes at every level;
* kernel radii `[6, 10, 14, 18, 22]` with sigma `radius / 3`;
* progressive level input, matching the reference graph;
* factors `[1, .8, .6, .4, .2]` adjusted by radius `.0035`;
* final bloom strength `.18`;
* direct composition of the five vertical levels before ACES.

The graph expands BroMetal bloom from three fullscreen draws to twelve. This is authentic heavy GPU work rather than synthetic loops or an oversized single blur.

## Red-first evidence

The first regression failed because `src/bloom.ts` did not exist, generated bloom still used the rejected `0.16–0.8` peak threshold and fixed 13-tap blur, and the composite still multiplied one texture by `.85`.

Tests now freeze the five resolutions, radii, strength, threshold, radius-adjusted factors, generated high-pass and Gaussian contracts, five composite bindings, and removal of the `.85` single-level path. The full BroMetal suite passes 40 tests, package typecheck, deterministic generation, and the production build.

## First result

The synchronized heavy capture `/tmp/brometal-bloom-1` passed with all five demos ready and no issues.

| Metric | Environment checkpoint | Five-level bloom | Change |
| --- | ---: | ---: | ---: |
| Similarity | 0.953298 | 0.966912 | +0.013614 |
| Histogram | 0.870929 | 0.922135 | +0.051206 |
| Tone | 0.936295 | 0.958973 | +0.022678 |
| Structure | 0.975847 | 0.975847 | preserved |

The strongest gain was histogram distribution, exactly where the single-scale bloom differed. Human-eye inspection confirmed that glow now falls off over multiple scales rather than forming a hard quarter-resolution halo.

The captured level statistics also track the Three.js pyramid shape: fine levels preserve fire energy and high maxima, while coarse levels lower maxima and spread energy into the upper gallery and floor.

## Exposure isolation

With excessive bloom energy removed, BroMetal no longer needed its compensating exposure `0.9`. Restoring the same exposure `1` used by Three.js was tested separately in `/tmp/brometal-bloom-exp1`.

| Metric | Bloom at exposure .9 | Bloom at exposure 1 | Change |
| --- | ---: | ---: | ---: |
| Similarity | 0.966912 | 0.977301 | +0.010389 |
| Color | 0.986611 | 0.990780 | +0.004169 |
| Luminance | 0.974757 | 0.984624 | +0.009867 |
| Histogram | 0.922135 | 0.944781 | +0.022646 |
| Structure | 0.975847 | 0.983417 | +0.007570 |
| Tone | 0.958973 | 0.970740 | +0.011767 |

Every comparison component improved. Visually, the central floor and masonry return to the reference brightness without recreating the earlier washed-out blue/green grade.

## Remaining gap

The floor-pool display contrast is `0.085617` versus roughly `0.136` in Three.js, although coherent rows remain `0.932489`. Because raw HDR floor energy was already within about 1.3% after the IBL change, this residual is likely spatial: Three.js's exact shadow/AO/bloom interaction preserves a harder square boundary. It should not be corrected by global exposure or bloom strength.

BroMetal still uses box-filtered environment mips rather than GGX PMREM and a simpler AO estimator. Those remain plausible sources of local material and floor-boundary differences.

## Decision

Retain the five-level bloom and exposure `1`. This is the largest recent BroMetal polish gain, moves every score component toward Three.js, and adds a renderer-native heavy workload matching the causal reference graph.

## Canonical artifact checkpoint

The canonical heavy-profile artifacts were refreshed at `artifacts/visual-comparison`. All five demos were ready at synchronized frame 12 with no issues, and the report status was `PASS`. The repeat recorded BroMetal similarity `0.977240`, color `0.990780`, luminance `0.984630`, histogram `0.944471`, structure `0.983419`, and tone `0.970737`.
