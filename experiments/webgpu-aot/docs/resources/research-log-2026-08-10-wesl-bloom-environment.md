# WESL Bloom and Environment Consumer Audit

## Question

After the temporal and roughness-selected SSR corrections, WESL's right-fire temporal history and bloom extraction matched Three.js closely, but the final image still carried too much midtone energy and too few highlights. This audit traced the remaining difference through bloom, environment sampling, and direct BRDF evaluation.

## Bloom findings

WESL's five Gaussian radii `[6,10,14,18,22]`, `sigma = radius / 3`, progressive half-resolution topology, threshold `1`, smooth width `.01`, and strength `.18` already match pinned Three r185.

The composite factors did not. Three computes `mix(factor, 1.2 - factor, radius)` at radius `.0035`. The exact factors are:

| Level | Factor |
| --- | ---: |
| 0 | 0.9972 |
| 1 | 0.7986 |
| 2 | 0.6000 |
| 3 | 0.4014 |
| 4 | 0.2028 |

WESL previously used `[1.0007,.7986,.5965,.3944,.1923]`. It also manually clamped blur UVs to `[.001,.999]` despite owning a clamp-to-edge sampler. Both differences are removed.

The isolated capture `/tmp/wesl-bloom-factors-1` scored `0.971324` versus the prior `0.971545`. The small numerical tradeoff is retained because the factors and sampling boundary are now exact rather than empirically favorable.

## Stage-localization breakthrough

At frame 12, WESL and Three are already close before blur in the right-fire region:

| Stage | WESL | Three |
| --- | ---: | ---: |
| Temporal resolve mean | 0.128272 | 0.127373 |
| Temporal resolve p90 | 0.192702 | 0.198568 |
| Bloom bright mean | 0.067956 | 0.065894 |

This rules out particle state, temporal weighting, bloom threshold, and broad source energy as the main right-fire cause. Captured WESL particle positions and colors remain exact against the reference producer.

## Environment-direction correction

WESL sampled its GGX-prefiltered environment along the raw reflection vector. Three bends that vector toward the surface normal by `roughness⁴` before sampling. WESL now computes:

`normalize(mix(reflected, normal, roughness² × roughness²))`

No resources, producer passes, gains, or output settings changed. The capture `/tmp/wesl-env-bend-1` raised similarity to `0.971584`, histogram similarity to `0.918384`, and tone similarity to `0.967067`. Upper-gallery highlight fraction became exactly `0.009343` in both WESL and Three.

## Rejected correlated-GGX experiment

Three uses correlated Smith GGX visibility inside its complete physical direct-light model. WESL uses an older Schlick-GGX approximation. Replacing only the visibility term was tested as a bounded experiment while holding the rest of WESL's direct-light contract fixed.

The capture `/tmp/wesl-correlated-ggx-1` fell to `0.968694`. It broadly raised energy: full mean `0.145205` versus Three `0.136946`, floor `0.202336` versus `0.190123`, and left fire `0.372700` versus `0.341841`. The experiment was reverted.

This is not evidence that correlated GGX is wrong. It demonstrates that transplanting one term from Three's complete multiscatter/material model into WESL's simpler direct model is not a faithful correction. A future direct-BRDF experiment must move the whole contract together, including multiscatter energy accounting, rather than cherry-picking visibility.

## Decision

Accept the exact bloom factors, sampler-boundary behavior, and roughness-bent environment direction. Reject the isolated correlated-visibility transplant. The best captured checkpoint in this sequence is `/tmp/wesl-env-bend-1` at `0.971584`.

The remaining right-fire mismatch is now known to occur after a nearly matching temporal and high-pass source. Further work should compare the complete bloom composite at aligned pixels or replace WESL's direct material model as one coherent unit; it should not retune exposure, particles, temporal weight, or bloom threshold.
