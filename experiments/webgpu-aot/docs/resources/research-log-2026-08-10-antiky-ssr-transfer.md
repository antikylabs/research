# Antiky Raw SSR Hit-Transfer Experiment

## Question

The rejected [roughness-mipped SSR experiment](research-log-2026-08-10-antiky-ssr.md) showed that Antiky's remaining reflection error was upstream of reconstruction. Faithfully blurring and roughness-selecting the existing trace only spread the wrong source distribution: the floor remained too hot, while reflection energy around both fires remained sparse and weak.

This experiment isolated the next causal boundary: the value assigned to an already accepted screen-space hit. Ray construction, march schedule, hit acceptance, temporal resolve, reflection reconstruction, bloom, presentation, particles, analytic lights, cascaded sunlight, environment lighting, and AO were held constant.

The hypothesis was that Antiky's custom hit weighting was routing energy to the wrong surfaces. The old transfer multiplied accepted color by a source-brightness threshold, upward-normal bias, roughness attenuation, weak metallic mix, confidence and edge fades, and a Schlick-style grazing term. At the synchronized probe points, that favored floor reflections relative to fire reflections by roughly seventeen to one. Three.js's transfer instead favors metallic fire hits over the floor by roughly five to seven to one.

## Independent Antiky implementation

The candidate remains entirely TypeGPU-Antiky owned. It does not import Three.js, another demo's runtime, a shared renderer, or precomputed reflection data.

For an accepted hit, Antiky now evaluates:

```text
planeDistance = dot(hitPosition - surfacePosition, surfaceNormal)
weighted = hitColor * metallic
weighted *= (1 - planeDistance / 100)^2
weighted *= (dot(-viewDirection, reflectedDirection) + 1) / 2
weighted *= min(10 / max(rec709Luminance(weighted), 0.0001), 1)
reflection = weighted * 0.7
```

The constants are the reference maximum distance `100`, maximum luminance `10`, and reflection intensity `0.7`. The existing marcher can travel only about `9.184` world units, so the reference's explicit `planeDistance > 100` rejection is unreachable in this workload. The production shader and the CPU contract share the numeric constants, while the shader remains the independently compiled AOT artifact.

The only runtime shader hash that changed was the Antiky screen-space-reflection module:

| Module | Control | Candidate |
| --- | --- | --- |
| Screen-space reflection | `c2373413` | `62241419` |

The other seven Antiky runtime shader hashes were byte-for-observer identical.

## Red-first implementation evidence

The initial regressions failed because the production contract and transfer helper did not exist and the generated reflection shader still contained the rejected heuristics. After implementation:

* the focused numeric transfer tests passed `4/4`;
* the artifact and Dawn shader tests passed `13/13`;
* the complete TypeGPU-Antiky suite passed `51/51`;
* package typecheck and the production build passed;
* a fresh temporary shader build matched both checked-in generated reflection artifacts exactly;
* package-scoped diff checking was clean.

Code review verified the view/reflection signs, signed point-to-plane distance, metallic multiplication, squared distance attenuation, grazing term, luminance cap, and final intensity. It also confirmed that marching, hit acceptance, bindings, render order, and downstream passes did not change.

## Result: hypothesis accepted

Two independent heavy-profile captures reached synchronized frame 12 with all five renderers ready, empty issue lists, no shared-renderer pairs, and an unchanged Antiky workload. The first capture is `/tmp/antiky-ssr-transfer-1`; the repeat is `/tmp/antiky-ssr-transfer-2`.

The first capture used the same exact Three.js selected-reflection sample fingerprint as the committed control, so the explicit control gate could compare them without a cross-run reference ambiguity:

| Metric | Committed control | Candidate | Change |
| --- | ---: | ---: | ---: |
| Final image similarity | 0.978765 | 0.981437 | +0.002672 |
| Priority reflection RGB log RMSE | 0.077742 | 0.067755 | -0.009987 |
| Floor RGB log RMSE | 0.027650 | 0.006224 | -0.021426 |
| Left-fire RGB log RMSE | 0.106711 | 0.092416 | -0.014295 |
| Right-fire RGB log RMSE | 0.036883 | 0.034780 | -0.002103 |

The predeclared semantic gate passed: priority error improved by more than `0.00001`, no priority region regressed, and final image similarity beat the accepted checkpoint. The repeat reproduced the result at score `0.981434`, priority error `0.067756`, floor `0.006227`, left fire `0.092417`, and right fire `0.034780`.

The most visually important change is visible without a metric: the long, bright, vertically smeared red reflection on the left foreground floor disappeared. That feature was not present in Three.js. Removing it made the floor material and architectural lighting read much more like the reference.

The semantic probe also showed that this was a coverage correction, not merely a dimmer image. Counts where Three.js had positive selected reflection but Antiky had exactly zero changed as follows:

| Region | Control | Candidate |
| --- | ---: | ---: |
| Floor | 29 | 6 |
| Left fire | 93 | 12 |
| Right fire | 106 | 18 |

Antiky's selected-reflection active-fraction deficit improved from `-0.298039` to `-0.063725` across the priority regions. This explains why the fires and floor now contain reflection information in many more of the places where Three.js does, even though their remaining mean energy is still low.

## Workload and accepted-system invariants

The control and both candidate captures had exactly the same heavy-profile resource and command contract:

| Resource or command | Control | Candidate |
| --- | ---: | ---: |
| Shader modules | 8 | 8 |
| Pipelines | 10 | 10 |
| Bind-group layouts | 9 | 9 |
| Bind groups | 49 | 49 |
| Textures | 96 | 96 |
| Texture bytes | 790,107,192 | 790,107,192 |
| Buffers | 402 | 402 |
| Buffer bytes | 9,544,860 | 9,544,860 |
| Per-frame passes | 21 | 21 |
| Per-frame non-indexed draws | 18 | 18 |
| Per-frame indexed draws | 309 | 309 |

Particle state remained exact: all fire and curve position and color errors were zero, curve-radius errors were zero, and maximum fire-radius error remained `0.000001`. The pre-composite sunlight measurements were exactly unchanged: floor contrast `0.017712`, floor ratio `1.140013`, all sampled rows brighter, and upper-spill contrast `0.147655`.

## The floor-pool tradeoff

The display-space square floor-pool cue weakened even though the direct-light producer did not change:

| Display-space floor cue | Control | Candidate | Three.js |
| --- | ---: | ---: | ---: |
| Contrast | 0.115675 | 0.100052 | 0.136029 |
| Interior/ring ratio | 1.421424 | 1.367832 | 1.573487 |
| Coherent-row fraction | 0.995781 | 0.962025 | 0.995781 |

This is a real regression against the earlier floor-cue guard and must not be hidden. However, the pre-composite sun-pool evidence is exactly unchanged, while the removed foreground SSR smear was visibly false and the full-image and semantic reflection gates improved decisively. The old reflection was artificially propping up the display-space floor cue with energy from the wrong system.

The accepted research direction is therefore to retain the source-causal reflection fix and restore any missing final floor-pool contrast through the system that actually creates the architectural pool—direct sunlight, indirect-light composition, or their post-process interaction. Reintroducing the rejected reflection smear or tuning reflection gain to satisfy the floor cue would confuse causes and make the human-eye result worse.

## Inspection-harness breakthroughs

This experiment exposed proof gaps that screenshot comparison and shader-text matching could not catch. The selected-reflection harness was extended red-first so a future reconstruction graph cannot be reported as valid unless the executed GPU work proves it:

* pass order is reconstructed from actual queue submissions, not render-pass creation order;
* every proof pass must carry coherent submission metadata, so unsubmitted and reordered work fails closed;
* small reflection-setting uniforms are frozen at submission time, preventing a later `lastWrite` from retroactively proving an earlier draw;
* the raw reflection must remain immutable through reconstruction;
* raw, reconstruction, and selector stages must use the exact expected attachment load/store, target format, write mask, blend, multisample, primitive, and fullscreen-draw state;
* selector and reconstruction texture views must prove their exact mip and layer ranges;
* provenance links every mip write, raw and pyramid texture, roughness source, selected writer, bloom consumer, and final consumer;
* the public summary retains bounded causal evidence while the 1,388 aligned raw samples remain only in the full report.

The new regressions first failed on unsubmitted work, submitted-order changes, incoherent submission metadata, raw overwrites, draw-effective setting bytes, invalid blend/write masks/load operations, incomplete view ranges, post-final mutations, untraceable texture usages, and incomplete graph provenance. The harness used for the two experiment captures passed its then-complete `98/98` tooling suite. The final adversarial hardening added view-range, post-trace immutability, and summary-leak cases and passed `106/106`, plus root and all-workspace typecheck.

## Remaining reflection gap

The transfer fixed the largest wrong spatial relationship, but it did not make Antiky's raw trace exact. After the correction, selected-reflection mean ratios versus Three.js are approximately `0.313` on the floor, `0.316` around the left fire, and `0.264` around the right fire. The remaining problem is therefore no longer an over-bright floor transfer; it is incomplete or misplaced hit information and insufficient energy across the screen-space marcher.

The next bounded reflection experiment should compare ray construction and hit geometry: the fixed 24-step schedule, maximum travel, radial hit slab, missing normal rejection, and lack of hit refinement. It should keep this accepted transfer and every downstream pass fixed. A global reflection gain, another blur, or a floor-specific compensation would not address the remaining spatial error.

## Decision

Retain the raw SSR hit-transfer correction. It removes the dominant false floor reflection, improves final visual similarity to `0.981437`, passes the explicit semantic reflection gate in every priority region, preserves the renderer's independent workload and accepted lighting/particle systems, and reproduces across two captures.

Record the display-space floor-pool reduction as an open compositional gap. Do not repair it by restoring reflection energy from the wrong source.

## Canonical artifact checkpoint

After committing the hardened probe and accepted renderer change, the canonical heavy-profile artifact set was refreshed at `artifacts/visual-comparison`. It completed at `2026-08-10T08:43:12.644Z` with all five renderers ready at frame 12, empty issue lists, no shared-renderer pairs, and overall report status `PASS`.

The committed harness reproduced the first experiment exactly: Antiky score `0.981437`, priority reflection RGB log RMSE `0.067755`, floor `0.006224`, left fire `0.092416`, right fire `0.034780`, upper-spill contrast `0.241667`, and unchanged pre-composite floor contrast `0.017712`. This confirms that the final fail-closed instrumentation changes did not alter the renderer workload or the accepted measurement.
