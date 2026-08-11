# BroMetal Authored-Tangent Experiment

## Question

After horizon AO, BroMetal remained slightly more saturated and darker than Three around the side walls and upper gallery. Its reflection, temporal, bloom, and output ordering already matched the intended graph. This experiment tested whether BroMetal's normal-map basis—not another energy constant—was the remaining surface-input mismatch.

## Source audit

The pinned Sponza asset contains authored glTF `TANGENT` accessors on 102 of 103 primitives. Every authored accessor is `VEC4/FLOAT`, byte offset zero, and byte stride 16. Three consumes the tangent vector and its `w` handedness.

BroMetal discarded all 102 streams. Its fragment shader reconstructed tangent and bitangent from position and UV derivatives, which changes normal-map orientation at mirrored UVs, authored seams, and discontinuities. The only tangent-less primitive uses the scene's non-normal-mapped fallback material.

## BroMetal-native correction

Commit `a9e53e0` carries each authored tangent through a fourth vertex-buffer slot and the AOT geometry vertex output. The fragment shader:

* transforms the authored tangent into world space;
* preserves `tangent.w` handedness;
* forms the bitangent from `cross(normal, tangent) * tangent.w`;
* applies the existing double-sided face direction to normal and tangent; and
* removes the derivative-reconstructed TBN path.

The one tangent-less primitive receives a neutral per-vertex `[1,0,0,1]` fallback buffer. This avoids changing the pipeline layout per primitive and does not synthesize nonexistent normal detail.

## Result

Both synchronized captures `/tmp/brometal-authored-tangents-1` and `/tmp/brometal-authored-tangents-2` reached frame 12 without issues. The complete score moved from the horizon-AO checkpoint `0.978290` to `0.978815` and `0.978899` in the two captures.

| Component | Horizon AO | Authored tangents |
| --- | ---: | ---: |
| Color | 0.990104 | 0.990439 |
| Histogram | 0.948232 | 0.949176 |
| Luminance | 0.982570 | 0.982724 |
| Structure | 0.987896 | 0.987933 |
| Tone | 0.976755 | 0.978521 |

Every component improves in the first synchronized comparison. The second capture preserves the exact same BroMetal temporal-region values; its `0.000084` total-score difference comes from the independently recaptured reference image.

The change also exposes a real upstream energy gap rather than masking it. BroMetal's left-fire temporal mean moves from `0.969294` to `0.762407`, while Three measures about `0.9857`. Upper-gallery temporal color improves from `0.072947` to `0.080372` toward Three's `0.0920`. The left wall loses a visibly over-broad red wash, while the upper normal-mapped masonry gains more reference-like structure.

## Decision

Accept authored tangents. The asset and Three both define this surface basis, the captured stream layout is correct, and the final image improves across the complete comparison. Do not restore the previous left-fire energy with light intensity, exposure, or bloom gain; that energy was partly produced by an incorrect derivative TBN.

The next bounded BroMetal experiment should compare roughness preparation and normal-map inputs at aligned pixels. Three adds geometric specular anti-aliasing to a minimum perceptual roughness of `.0525`; BroMetal currently clamps sampled roughness to `.045` and omits the derivative geometry term. That is a better causal candidate for the newly exposed highlight-energy difference than changing the direct BRDF or output transform.
