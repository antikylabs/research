# Antiky Roughness-Mipped SSR Experiment

## Question

This experiment follows the [selected-reflection control](research-log-2026-08-10-reflections.md). The control proved that Three.js does not consume its raw screen-space reflection texture at mip zero. It samples a five-mip `rgba16float` reconstruction with fractional LOD `clamp(roughness² × 4, 0, 4)`, while TypeGPU-Antiky consumed one full-resolution reconstructed texture at LOD zero.

The bounded hypothesis was that this downstream reconstruction and selection difference caused Antiky's sharp red floor reflection and weak, sparse fire reflections. The experiment deliberately held the raw SSR trace, temporal resolve, particles, analytic lights, cascaded sunlight, environment producer, AO, bloom, exposure, and presentation constant.

## Independent Antiky implementation

The candidate remained an Antiky-owned renderer rather than importing Three.js code or another demo's runtime. Its reflection graph was:

1. render the existing full-resolution raw SSR trace unchanged;
2. copy raw mip zero exactly with `textureLoad`;
3. render mips one through four directly from the immutable raw trace;
4. apply the reference non-recursive `7×7` box filter with spreads one through four and equal weight `1/49`;
5. select `clamp(surface.w² × 4, 0, 4)` through a clamp-to-edge, linearly filtered, trilinear sampler;
6. write that selected value to a separate full-resolution `rgba16float` texture used by both bloom extraction and final presentation.

The selector pass is an intentional bounded difference from Three.js. Three.js samples the mip pyramid inline in its consumers; Antiky materialized the selection into another half-float texture so the exact consumed object remained simple and probeable. This adds one half-float write/read and one full-screen pass, but it does not change the selection formula.

The observed runtime shader hashes were:

* unchanged raw trace: `c2373413`;
* mip reconstruction: `449eaaed`;
* roughness selector: `4c0ad554`.

These are observer hashes of the runtime WGSL strings, which omit the checked-in files' final newline.

## Exact workload cost

At the heavy profile, the candidate changed reflection texture storage from `58,982,400` to `98,265,600` bytes, an increase of `39,283,200` bytes. Five 16-byte reconstruction-setting buffers replaced two, adding another 48 bytes. The exact GPU-resource increase was therefore `39,283,248` bytes, or about `37.46 MiB`.

The synchronized workload changed as expected:

| Resource or command | Control | Candidate |
| --- | ---: | ---: |
| Textures | 96 | 97 |
| Texture bytes | 790,107,192 | 829,390,392 |
| Buffers | 402 | 405 |
| Buffer bytes | 9,544,860 | 9,544,908 |
| Shader modules | 8 | 10 |
| Pipelines | 10 | 12 |
| Bind groups | 49 | 53 |
| Per-frame passes | 21 | 25 |
| Per-frame non-indexed draws | 18 | 22 |
| Per-frame indexed draws | 309 | 309 |

The implementation passed its focused artifact and WebGPU tests, the complete 56-test TypeGPU-Antiky suite, package typecheck, deterministic ten-artifact rebuild, and production build before capture.

## Result: hypothesis rejected

Two independent heavy-profile captures reached synchronized frame 12 with all five renderers ready, empty issue lists, no shared-renderer pairs, and the expected candidate graph and resource counts.

The first capture, `/tmp/antiky-roughness-ssr-1`, produced:

| Metric | Committed control | Candidate |
| --- | ---: | ---: |
| Final image similarity | 0.978765 | 0.978355 |
| Priority reflection RGB log RMSE | 0.077742 | 0.081352 |
| Floor RGB log RMSE | 0.027650 | 0.036837 |
| Left-fire RGB log RMSE | 0.106711 | 0.111700 |
| Right-fire RGB log RMSE | 0.036883 | 0.037647 |

The repeat capture, `/tmp/antiky-roughness-ssr-2`, reproduced the rejection:

| Metric | Committed control | Repeat candidate |
| --- | ---: | ---: |
| Final image similarity | 0.978765 | 0.978414 |
| Priority reflection RGB log RMSE | 0.077742 | 0.081353 |
| Floor RGB log RMSE | 0.027650 | 0.036838 |
| Left-fire RGB log RMSE | 0.106711 | 0.111701 |
| Right-fire RGB log RMSE | 0.036883 | 0.037645 |

The predeclared gate required the priority error to improve by more than `0.00001`, with no floor, left-fire, or right-fire regression larger than that tolerance, and required the final image score to beat the accepted checkpoint. The candidate failed every one of those requirements. It was rejected and the accepted renderer restored; no constant was retuned around the result.

The failure was not caused by disturbing previously accepted scene systems. Particle position and color errors remained exactly zero, maximum fire-radius error remained `0.000001`, indexed geometry stayed at 309 draws, and the sunlight cues remained coherent. In the repeat capture, floor-pool contrast was `0.116461`, interior-to-ring ratio `1.423856`, coherent-row fraction `0.991561`, and upper-gallery contrast `0.241489`.

## What the negative result teaches us

The missing polish was not primarily a downstream mip-selection problem. Antiky's control reflection already had the wrong spatial energy distribution before reconstruction: it was too strong where active on the floor, covered too little of the floor overall, and was much weaker than Three.js around both fires. Applying Three.js's downstream reconstruction faithfully blurred and redistributed Antiky's own trace, but it could not create reflection information that the trace never produced. It instead spread the wrong source distribution and moved every priority-region error in the wrong direction.

The next reflection experiment should therefore inspect the upstream trace itself: ray construction, hit acceptance, depth and normal conventions, metallic/roughness participation, jittered inputs, step schedule, falloff, and intensity. Another blur kernel, global gain, or post-process adjustment would not be source-causal.

## Inspection-harness breakthroughs

This experiment also forced the selected-reflection diagnostic to grow beyond the original LOD-zero control:

* The probe continues to sample the exact texture bound by final presentation. It does not bypass Antiky's selector and sample the upstream pyramid directly, which would hide the selector's half-float write/read.
* Provenance now distinguishes `probeSampleLod = 0` from `lodMeaning = upstream-selection`. Each Antiky sample reports the roughness-derived pyramid LOD while the diagnostic samples the exact final selected texture at LOD zero.
* The resolver validates `surface.w`, the squared-roughness multiplier, mip range, selected/pyramid/surface dimensions, raw and pyramid formats, one-mip attachment views, exact per-mip setting bytes, strict pass order, and bloom/final consumer agreement.
* It pins the raw trace, reconstruction, and selector shader hashes. Each reconstruction and selector stage must contain one fullscreen triangle draw with no explicit viewport or scissor override.
* Public evidence retains the formula channel, minimum and maximum mip, multiplier, upstream selection source, and LOD meaning without exposing the 1,388 raw sample records.

The repeat capture uncovered a separate measurement-contract gap. The newly captured Three.js raw selected-reflection fingerprint changed from `55d3cf3b89360f0d45af991f27b07c815ad2a1c2f8d2791bd2baa54c8abbc77b` to `6558838ff36848915f967c2d875405c0f36e56dccf4a3ec28d3ae124f8796c30`, although the aggregate reference metrics were effectively unchanged. Across 5,552 reference channels, 2,651 were not bit-identical; maximum absolute drift was `0.00390625` and mean absolute drift was approximately `0.000005552`.

The exact SHA-256 sample fingerprint was intentionally fail-closed, but it is too strict to compare otherwise compatible GPU runs. That check was not weakened to rescue this candidate—the candidate failed decisively even against its same-run Three.js reference. A future harness change should define a measured reference-compatibility tolerance or quantized fingerprint with an explicit error bound, rather than silently accepting any reference or relying on exact floating-point identity.

## Decision

The roughness-mipped SSR renderer candidate is not retained. The strengthened semantic reflection instrumentation is retained because it proved both the renderer graph and the negative outcome. The next bounded hypothesis belongs upstream in Antiky's raw reflection trace.
