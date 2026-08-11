# WESL Geometry-Roughness Audit

## Question

After switching WESL to Sponza's authored tangent basis, its captured roughness remained systematically below Three's. Three's generated material shader applies geometric specular anti-aliasing before all direct, environment, MRT, and SSR consumers; WESL previously used only sampled material roughness.

## Three.js contract

Pinned Three r185 prepares perceptual roughness as follows:

1. transform the unperturbed geometry normal into view space;
2. compute the component-wise maximum of `abs(dpdx(normal))` and `abs(-dpdy(normal))`;
3. reduce that vector to its largest component;
4. clamp sampled material roughness to a minimum of `0.0525`;
5. add geometric roughness and clamp the result to one.

This term suppresses undersampled specular highlights at geometric normal discontinuities. It is independent of the subsequently sampled tangent-space normal map.

## WESL correction

WESL now reproduces that preparation in its own static forward shader. Because the benchmark camera is fixed and the existing frame contract already contains camera position, the shader reconstructs the exact view basis from the package-owned camera target and up vector. No new buffer, binding, pass, or shared renderer dependency was introduced.

The correction is consumed consistently by direct PBR, environment lighting, the roughness MRT, and roughness-selected SSR.

## Result

The synchronized heavy capture `/tmp/wesl-geometry-roughness-1` passed and raised WESL similarity from the accepted authored-tangent checkpoint `0.972392` to `0.973979`.

| Component | Tangent checkpoint | Geometry roughness |
| --- | ---: | ---: |
| Color | 0.991171 | 0.991401 |
| Histogram | 0.920392 | 0.927345 |
| Luminance | 0.984712 | 0.985322 |
| Structure | 0.985197 | 0.984658 |
| Tone | 0.967063 | 0.967229 |

The histogram gain is the largest, consistent with damping undersampled specular outliers rather than applying a global brightness adjustment.

## Direct buffer evidence

The corrected roughness MRT now nearly matches Three at frame 12:

| Region | WESL | Three.js |
| --- | ---: | ---: |
| Full | 0.781031 | 0.779984 |
| Floor | 0.847493 | 0.848627 |
| Upper gallery | 0.781094 | 0.783303 |

Before this correction, WESL measured `0.771759` full and `0.841777` floor. The improvement therefore follows the intended surface input through the graph and is not inferred only from the final canvas.

Final-region luminance also moved toward Three: full `0.141613` vs `0.136949`, floor `0.199609` vs `0.190125`, left fire `0.349907` vs `0.341861`, right fire `0.174290` vs `0.164430`, and upper gallery `0.150324` vs `0.147292`.

## Decision

Accept the geometric-roughness correction and refresh the canonical artifacts. The remaining WESL gap is no longer primarily tangent interpretation or roughness preparation. Future work should localize the residual energy after these corrected surface inputs, particularly the right-fire and floor post-lighting distributions, without retuning exposure or undoing the exact material contract.
