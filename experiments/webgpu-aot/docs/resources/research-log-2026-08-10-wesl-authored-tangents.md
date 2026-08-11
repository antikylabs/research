# WESL Authored-Tangent Audit

## Question

The complete direct-multiscatter experiment made every measured region too bright, which shifted the investigation from BRDF equations to the material and geometry inputs entering them. This audit compared WESL's normal-map basis with the pinned Three.js workload.

## Breakthrough

The pinned Sponza scene contains authored glTF `TANGENT` attributes on 102 of its 103 primitives. Three consumes the tangent vector and its `w` handedness, builds the bitangent with `cross(normal, tangent) * tangent.w`, and applies the normal texture through that authored TBN basis.

WESL was discarding every authored tangent. It reconstructed tangent and bitangent per fragment from position and UV derivatives. That is a materially different normal-map interpretation, especially at mirrored UV seams and across authored tangent discontinuities.

The sole tangent-less primitive uses material 2, which has no normal texture. WESL therefore supplies that primitive a neutral `[1,0,0,1]` fallback tangent; it does not synthesize missing authored detail.

## Correction

WESL now:

- streams each primitive's glTF `TANGENT` accessor into its own forward vertex slot;
- carries world tangent and bitangent to the fragment shader;
- honors `tangent.w` handedness;
- preserves the existing double-sided face-direction convention;
- removes the derivative-reconstructed TBN path.

This remains a WESL-owned static shader and renderer path. No renderer or geometry code is shared with Three.

## Result

The synchronized heavy capture `/tmp/wesl-authored-tangents-1` passed with no demo errors. WESL similarity improved from `0.971666` to `0.972290`.

| Component | Before | Authored tangents |
| --- | ---: | ---: |
| Color | 0.990712 | 0.991174 |
| Histogram | 0.918742 | 0.920044 |
| Luminance | 0.984050 | 0.984714 |
| Structure | 0.984473 | 0.985151 |
| Tone | 0.967088 | 0.966765 |

Four of five similarity components improved. The small tone tradeoff is outweighed by the total gain and by correcting a source-level geometry contract rather than tuning output energy.

The WESL upper-gallery forward-HDR mean moved from `0.089719` to `0.093633`, toward Three's same-run `0.101090`. The final synchronized canvas remains visually close while preserving the independently authored WESL pipeline.

## Remaining surface-input gap

Three applies geometric specular anti-aliasing to perceptual roughness: it clamps material roughness to `0.0525`, adds the maximum screen derivative of the unperturbed view-space geometry normal, then clamps to one. WESL currently clamps to `0.045` and omits that geometry-roughness term.

The capture confirms a small systematic roughness deficit: WESL's full-region mean is `0.771759` versus Three's `0.779984`, and floor mean is `0.841777` versus `0.848627`. This is the next bounded surface-input experiment; it should be evaluated independently from the accepted tangent correction.

## Decision

Accept the authored tangent path and refresh the canonical artifacts. Continue with a separately captured geometric-roughness experiment. Do not revisit exposure or transplant more BRDF terms until the surface inputs agree.
