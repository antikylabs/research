# WESL Direct Multiscatter Experiment

## Question

The preceding bloom and environment audit showed that WESL already matched Three.js closely at the temporal-resolve and bloom-extraction stages, while the final right-fire region remained too bright and insufficiently concentrated. An isolated correlated-GGX visibility transplant had already failed because it moved only one term of Three's direct-light model.

This experiment tested the stronger hypothesis: would replacing WESL's complete direct-light BRDF with Three's coherent correlated-GGX and multiscatter contract close the remaining gap?

## Candidate

The candidate changed the direct-light material model as one unit while leaving particles, temporal resolve, shadows, light state, IBL resources, bloom, and presentation unchanged. It used WESL's existing integration LUT and added:

- Three's exponential Fresnel approximation;
- correlated Smith-GGX single scattering;
- view- and light-direction DFG samples;
- missing-energy multiple-scatter compensation;
- Lambert diffuse energy scaled by `1 - metallic`.

The implementation and its shader regressions were committed as `938f630` so the experiment remained reproducible.

## Result

The canonical heavy capture `/tmp/wesl-direct-multiscatter-1` passed operational validation but reduced WESL similarity from `0.971666` to `0.965998`.

| Region | Candidate mean | Three.js mean |
| --- | ---: | ---: |
| Full frame | 0.146829 | 0.136946 |
| Floor | 0.205075 | 0.190123 |
| Left fire | 0.378654 | 0.341841 |
| Right fire | 0.183031 | 0.164403 |
| Upper gallery | 0.160097 | 0.147275 |

Every measured region became too bright. The similarity components also regressed broadly: color `0.988072`, histogram `0.903200`, luma `0.978649`, structure `0.984203`, and tone `0.964503`.

The candidate was rejected and reverted by `e810e01`.

## Breakthrough

The useful result is causal, not visual: the remaining mismatch is not explained by WESL merely lacking Three's direct multiscatter equations. Moving the whole BRDF contract together still produced a coherent, broad energy excess.

Three's generated shader confirms that its diffuse contribution is also multiplied by `1 - metallic`, and WESL loads the pinned base-color textures as sRGB. Those two obvious convention errors are therefore ruled out.

This narrows the next investigation to the inputs entering the BRDF or to geometry conventions, especially:

1. normal-map tangent basis, handedness, and face-direction handling;
2. material roughness preparation and minimum roughness;
3. exact normal-scale and sampled-normal transforms;
4. spatially aligned direct-light inputs before changing any more BRDF math.

## Decision

Keep the accepted simpler WESL direct-light model for now. Do not compensate with exposure, light intensity, bloom threshold, or temporal weight: the capture shows a broad upstream direct-light difference, and those controls would disturb stages that already match closely.

The next bounded experiment should compare WESL and Three normal/tangent/material inputs at aligned pixels before attempting another direct-BRDF replacement.
