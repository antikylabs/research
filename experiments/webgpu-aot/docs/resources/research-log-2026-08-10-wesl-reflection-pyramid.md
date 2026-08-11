# WESL Roughness-Selected Reflection Experiment

## Question

After temporal convergence, WESL still reconstructed every screen-space reflection through four alternating full-resolution Gaussian passes. Three.js instead keeps an immutable raw trace, writes a five-level reflection pyramid, and selects a fractional mip from material roughness.

This experiment changed only the WESL-owned reconstruction and the source-correct lighting terms exposed while validating it. The accepted ray marcher, hit transfer, particles, lights, sun, environment producer, bloom constants, tone mapping, and exposure remained fixed.

## Reflection graph

WESL now owns three distinct reflection resources:

* one full-resolution `rgba16float` raw trace;
* one five-mip `rgba16float` reconstruction pyramid;
* one full-resolution `rgba16float` roughness-selected result consumed by bloom and presentation.

Mip 0 is an exact copy of raw SSR. Mips 1–4 each apply a non-separable 7×7 box reconstruction directly from the immutable raw trace with spreads `1`, `2`, `3`, and `4`. They never recursively blur an already blurred level. The selector reads roughness from the WESL forward surface alpha and samples `roughness² × 4` with trilinear filtering.

This adds two renderer-owned fullscreen passes over the former four-pass reconstruction and about `37.46 MiB` of heavy-profile reflection texture storage. That cost is intentional: the heavy demo now performs the algorithm its result claims to benchmark.

## Red-first evidence

The first regression failed because WESL had no reflection-plan module. The tests freeze all five dimensions, direct-from-raw spreads, exact storage bytes, full-resolution texel settings, 7×7 normalization, selector entry point, roughness-squared LOD, static build output, and Dawn pipeline compilation.

The final WESL suite passes 44 tests serially, package typecheck, production build, and whitespace validation. Serial execution is used because the environment suite contains a known Dawn null-backend semantic readback that is not reliable across parallel native workers.

## What the first capture revealed

The isolated pyramid capture `/tmp/wesl-reflection-pyramid-1` scored `0.969854`, slightly below the temporal checkpoint `0.970207`. The result was not rejected immediately because the new resource lineage exposed a measurement fact hidden by the old ping-pong labels: the prior texture labeled “raw trace” was overwritten three times by reconstruction. Its reported mean was therefore not raw SSR at all.

With separate resources, actual raw WESL SSR measured only `0.000055` full-frame, while the roughness-selected result measured `0.001038`. The graph was working; the small score loss came from removing an accidentally favorable fixed blur distribution.

## AO and ambient breakthrough

Tracing the now-explicit scene inputs exposed two independent lighting errors:

1. WESL forward lighting already applied ambient occlusion only to environment lighting, but the new temporal pass multiplied the entire completed HDR scene by AO again. That incorrectly occluded sun, point lights, and transparent particles.
2. WESL forward shading still added invented edge glow and depth haze from auxiliary ambient channels after its physically based environment term. Three.js has neither compensator.

The temporal pass now resolves raw completed HDR without a second AO multiply. Forward shading keeps AO inside environment lighting and removes the edge/haze additions. Exposure remains exactly `1`; the correction is not hidden by an output-grade retune.

## Result

The synchronized heavy capture `/tmp/wesl-source-clean-1` passed with all five demos ready, no issues, and no shared-renderer pairs.

| Metric | Prior temporal checkpoint | Source-clean reflection graph | Change |
| --- | ---: | ---: | ---: |
| Similarity | 0.970207 | 0.971551 | +0.001344 |
| Color | 0.990736 | 0.990902 | +0.000166 |
| Histogram | 0.916069 | 0.917540 | +0.001471 |
| Luminance | 0.984937 | 0.984469 | -0.000468 |
| Structure | 0.981790 | 0.984476 | +0.002686 |
| Tone | 0.958223 | 0.966620 | +0.008397 |

Removing the compensators produced the largest gains in structure and tone. Display-region means are now close to Three.js: full `0.142432` versus `0.136952`, floor `0.199688` versus `0.190127`, left fire `0.355889` versus `0.341899`, right fire `0.176794` versus `0.164440`, and upper gallery `0.151544` versus `0.147310`.

The remaining error is distribution rather than broad illumination. WESL's right-fire highlight fraction is `0.051587` versus Three's `0.063095`, even though its regional mean is higher. That indicates energy is still too spread through midtones and not concentrated enough in highlights. The next correction should investigate temporal depth validity or the WESL ray-hit distribution, not exposure or bloom strength.

## Decision

Accept the five-level reflection pyramid, roughness selector, single AO application, and removal of edge/haze compensators. The sequence demonstrates another research lesson: separating resources by semantic role improves both rendering and instrumentation. Once raw trace, reconstructed pyramid, and selected result stopped overwriting one another, the harness could distinguish a real SSR mismatch from downstream blur and reveal unrelated lighting compensation.

## Adaptive-march follow-up

Side-by-side inspection after the later material, roughness, and depth corrections still showed weaker reflective red detail on the right curtain medallion, floor, and nearby stone. A bounded experiment replaced only WESL's fixed 24-step widening-slab trace with the independently authored BroMetal adaptive trace: projected screen-length step count, local geometric thickness, hit-normal rejection, and eight binary refinements. Hit transfer, five-mip reconstruction, roughness selection, temporal resolve, bloom, and presentation were unchanged.

The heavy capture `/tmp/wesl-ssr-dda-1` passed, but rejected the hypothesis. Raw reflection mean increased from `0.001119` to `0.002450`; the selected result increased from `0.002324` to `0.006175`. Coverage improved, but not with the reference spatial distribution. Selected right-fire energy rose from `0.001222` to `0.007144`, overshooting the intended relationship, while the aggregate similarity fell from about `0.973246` to `0.972638` and histogram similarity fell to `0.917088`.

The experiment was reverted. The result is important because it separates “too few WESL reflections” from “the wrong WESL hits.” More hits alone do not reproduce Three's SSR. The next reflection correction must derive Three's screen-space intersection semantics more faithfully or use an exact semantic selected-reflection comparison for WESL; importing another demo's accepted marcher only transfers that renderer's spatial bias.

## Exact selected-reflection probe and binary-refinement follow-up

Commit `619c791` extends the post-trace selected-reflection GPU diagnostic to WESL. The observer now proves the complete WESL-owned graph before sampling it: the immutable raw trace, five direct-from-raw reconstruction writes, the `surface.w² × 4` selector, and the exact selected texture consumed by bloom and presentation. It freezes each reconstruction settings buffer at the submission that used it, rejects later or untraced writes, and samples the same 1,388 normalized pixel coordinates used for Three.js. This converts the former texture-summary comparison into aligned, per-pixel evidence after the actual roughness selection.

The synchronized control `/tmp/wesl-semantic-five-2` exposed the useful breakthrough. Across the floor and both fire regions, WESL selected-reflection mean energy was only `0.276965` of Three.js, while active coverage differed by only `-0.059804`. Region ratios were similarly consistent: floor `0.296944`, left fire `0.272077`, and right fire `0.298634`. WESL was not mainly failing to produce reflection pixels; its accepted rays sampled much dimmer or spatially wrong source pixels. Priority RGB log RMSE was `0.066846`.

Source and generated-shader inspection then ruled out the tempting transfer-function explanation. WESL already matches the pinned Three.js mirror path: hit color multiplied by metallic, squared `1 - planeDistance / 100` attenuation, the same grazing term, luminance capped at `10`, then intensity `0.7`. Three's `reflectNonMetals: true` removes the dielectric early discard but does not remove metallic weighting; its mirror `finalSampleWeight` remains metalness.

A narrower candidate retained WESL's existing 24-step schedule and added only Three-style eight-step binary refinement after the first accepted crossing. The heavy capture `/tmp/wesl-refine-2` raised priority mean energy from `0.276965` to `0.308065` and improved right-fire RGB log RMSE from `0.034907` to `0.030714`. It also increased the screenshot score from `0.973170` to `0.973298`. However, left-fire RGB log RMSE worsened from `0.090948` to `0.092935`, causing combined priority error to worsen from `0.066846` to `0.067163`. The floor and upper regions were effectively unchanged.

The candidate was rejected and fully reverted. Binary refinement cannot repair a biased initial bracket: it makes WESL more precise about the crossing selected by its radial-depth widening slab, but that crossing is not necessarily the one Three's projected view-space marcher selects. The next experiment must address bracket/intersection semantics while preserving the new exact semantic gate. It must strictly lower priority RGB log RMSE without worsening floor, left-fire, or right-fire error; another reflection-energy scalar or a refinement-only patch is not sufficient.

## Projected view-space marcher breakthrough

Commit `9b76c92` replaces the rejected widening-slab bracket with a WESL-owned projected marcher derived from the pinned Three.js algorithm. It projects a 100-unit reflected endpoint, clamps rays that cross the camera near plane, chooses work from dominant-axis screen length at quality `30/64`, interpolates perspective-correct ray depth, rejects hits beyond geometric thickness or facing the reflected ray, and performs eight refinements only after a valid coarse bracket. The accepted hit transfer and every downstream reflection, temporal, bloom, and presentation stage remain unchanged.

Two synchronized heavy captures, `/tmp/wesl-projected-1` and `/tmp/wesl-projected-2`, reproduced the semantic result to six decimal places. Priority selected-reflection RGB log RMSE fell from `0.066846` to `0.046211`. Every measured region improved:

| Region | Fixed widening slab | Projected marcher |
| --- | ---: | ---: |
| Floor | 0.006601 | 0.000811 |
| Full | 0.057488 | 0.008998 |
| Left fire | 0.090948 | 0.063725 |
| Right fire | 0.034907 | 0.021839 |
| Upper gallery | 0.003233 | 0.001143 |

The former energy deficit also disappeared. Relative selected-reflection means moved from floor/left/right `0.297/0.272/0.299` of Three.js to `0.984/1.162/1.154`. Coverage moved from `-5.98%` across the priority sample set to `+1.57%`. The remaining fire overshoot is consistent with WESL's slightly hotter source HDR around those emitters; scaling SSR would damage the now-near-exact floor and full-frame relationships.

The aggregate display score moved from `0.973170` to `0.972255` and repeated at `0.972297`. This is not being treated as a hidden success: histogram similarity fell as authentic reflections replaced the underpowered control. However, color, structure, and tone improved, the largest screenshot hotspot distance fell from `0.118826` to `0.056951`, and direct side-by-side inspection shows the curtain medallions, reflective stone, and floor response now follow Three's spatial structure much more closely. The renderer also became materially heavier: synchronized WESL readiness increased from about `5.98 s` to `8.60 s`, reflecting the screen-length-scaled ray work rather than an artificial delay.

The projected marcher is accepted. The next WESL correction should address the broader midtone/histogram lift independently—most visibly the brighter pillars and floor—while holding the new selected-reflection graph and its semantic evidence fixed. Reverting to dim SSR merely to improve a coarse histogram would restore the largest known causal rendering error.
