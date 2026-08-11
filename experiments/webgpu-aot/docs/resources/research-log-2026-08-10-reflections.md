# Selected-Reflection Instrumentation and SSR Control Log

## Starting point

This log continues the [Antiky temporal resolve experiment](research-log-2026-08-10-temporal.md). The committed temporal checkpoint improved TypeGPU-Antiky's final presentation, but inspection still showed a sharper red floor reflection and a different fire-glow distribution from Three.js. The next renderer hypothesis was roughness-mipped screen-space reflection.

The existing artifact evidence could not test that hypothesis correctly. Three.js retains a five-mip `rgba16float` reflection texture, but ordinary texture probes inspect individual stored subresources. The final shader does not consume one of those subresources directly. It reads the surface roughness at each pixel and samples the reflection with fractional LOD `clamp(roughness.g² × 4, 0, 4)`. Aggregate mip-zero, mip-two, and mip-four statistics cannot reconstruct that trilinear, coordinate-aligned result. Antiky's texture labeled `reflection trace` is also overwritten by the vertical reconstruction pass, so selecting a texture by its allocation label describes neither its latest writer nor the value consumed by bloom and final presentation.

The research requirement was therefore to measure the exact reflection selected by each final consumer before changing Antiky's SSR graph.

## Breakthrough: measure the consumer, not the texture label

Commit `180a716` adds a semantic selected-reflection diagnostic to the Playwright/WebGPU observer. It resolves the actual final-presentation and bloom-extraction draw commands from the captured execution trace, validates their shader formula and resource agreement, and then samples the exact bound GPU texture view and sampler after animation and tracing are paused.

For Three.js, the resolver requires:

* one final presentation signature and one `UnrealBloomPass.bright` signature that bind the same `SSRNode.Blur`, `metalrough`, and trilinear clamp sampler;
* a fragment formula that samples reflection at `clamp(roughness.g² × 4, 0, 4)` rather than merely containing similar constants;
* exactly one stored write to each mip level zero through four before the consumer;
* an `rgba16float`, five-mip reflection resource and aligned roughness source.

For the current Antiky renderer, it requires:

* bloom and final presentation to bind the same reflection texture and sampler;
* explicit `textureSampleLevel(..., 0)` in both consumer shaders;
* the most recent writer to that texture to be the vertical reflection-reconstruction pass, regardless of the stale allocation label.

Any ambiguous command signature, dropped trace command, formula drift, missing mip write, sampler mismatch, stale resource, or consumer disagreement returns structured unavailable evidence. The report never invents a measurement from a likely label.

## Exact GPU diagnostic

The observer runs one post-trace compute pass over the existing 1,388 normalized probe coordinates:

* floor: 60 samples;
* full frame: 240 samples;
* left fire: 480 samples;
* right fire: 480 samples;
* upper gallery: 128 samples.

Each invocation converts the normalized coordinate to the same floored source pixel, samples at that pixel center, and writes two `vec4f` records. Three.js loads roughness channel `g`, calculates fractional LOD, and samples the exact final-bound reflection view with the exact final-bound sampler. Current Antiky records `roughness = null`, LOD zero, and samples the exact texture that its consumers use.

The diagnostic runs only after the execution trace, counters, resource records, and workload window have been deep-cloned. Its shader, pipeline, bind group, three transient buffers, dispatch, and copy therefore cannot enter benchmark resource or workload accounting. The buffers are destroyed after readback, and a WebGPU validation error scope converts shader, pipeline, binding, or command failures into unavailable evidence instead of an uncaptured browser error.

The full report retains the 1,388 aligned samples for research. The condensed JSON and HTML project only bounded provenance, summaries, comparison metrics, and issue codes. Their public projection is scalar-allowlisted so malformed or aliased sample payloads cannot leak through an aggregate, provenance, or diagnostic-issue field.

## Problems found while growing the harness

The implementation exposed several inspection-harness failures before it measured a renderer:

1. The first injected WGSL string declared a one-member struct without its required trailing comma. Pure trace-resolution tests passed, but a real shader module would fail. A ready-path fake-device regression now exercises shader creation, exact traced object binding, 22 workgroups, all 1,388 records, summaries, and cleanup.
2. `textureLoad` initially received `vec2u`; the sampled 2D texture overload requires signed integer coordinates. The runtime now converts the stored pixel to `vec2i`.
3. Diagnostic validation originally occurred outside an error scope. A bad observer shader could pollute the page or produce misleading readback. Validation is now captured and reported as `gpu-validation-error`.
4. Early report validation accepted renderer-incompatible formulas: an Antiky probe could claim Three.js roughness selection while still being compared. Validation now enforces the exact formula metadata and recomputes every sample's LOD relationship.
5. Early condensed-report projection removed known raw keys but could be bypassed with an alias or malformed value under an allowlisted key. Public evidence now accepts scalar leaves and bounded scalar arrays only.
6. The candidate-versus-control quality helper originally accepted impossible negative RMSE values and did not prove that both comparisons used the same Three.js samples. It now requires nonnegative metrics, exact sample counts and contracts, synchronized frame identity, and a SHA-256 reference-sample fingerprint.

These were instrumentation defects, not renderer defects. Recording them matters because a sophisticated metric is worse than no metric if its resource lineage or report boundary can silently drift.

## Canonical control capture

The committed instrumentation was captured into `artifacts/visual-comparison` at `2026-08-10T06:48:37.711Z` with the heavy profile, five measured frames, and synchronized absolute frame 12. All five demos reached ready state at frame 12, every issue list was empty, `sharedRendererPairs` was empty, and the report passed.

The final-image scores were:

| Renderer | Score |
| --- | ---: |
| BroMetal | `0.945272` |
| TypeGPU | `0.979764` |
| TypeGPU-Antiky | `0.978765` |
| WESL | `0.956342` |
| Three.js | `1.000000` |

TypeGPU-Antiky retained 309 indexed and 18 non-indexed draws per measured frame. The observer diagnostic added no recorded resource label, pass, draw, or dispatch to the artifact. The condensed summary contains no raw `samples` field.

### Three.js proves why mip-zero statistics were misleading

All 1,388 Three.js samples were ready at captured frame 12 from trace frame 11. The roughness-selected LOD covered the complete zero-to-four range:

| LOD statistic | Value |
| --- | ---: |
| Mean | `2.515264` |
| P10 | `1.088135` |
| Median | `2.610442` |
| P90 | `3.572841` |
| Maximum | `4.000000` |

Only `1.0086%` of samples selected LOD zero. The selected reflection materially differs from ordinary mip zero:

| Three.js reflection statistic | Raw mip zero | Roughness-selected |
| --- | ---: | ---: |
| Mean luminance | `0.009356` | `0.008833` |
| Active fraction | `0.393372` | `0.829971` |
| P99 | `0.047274` | `0.117889` |
| Maximum | `4.608352` | `3.253653` |
| RMS | `0.151263` | `0.100382` |

The mip chain reduces isolated spikes while spreading meaningful reflection energy across many more sampled pixels. That distribution is one source of the polished, persistent appearance which a mip-zero mean could not explain.

### Antiky control is exact LOD zero

All 1,388 Antiky samples were ready at the same synchronized frame. Every LOD value was exactly zero and roughness was absent, matching both current consumer shaders. Its semantic luminance summary exactly matched the existing ordinary texture probe for texture 608, proving that the diagnostic reproduces the value actually consumed at pixel centers rather than creating a second interpretation.

Against Three.js, the priority union of floor and both fire regions produced:

* RGB log RMSE `0.077742` across 1,020 aligned samples;
* log-luminance MAE `0.009318`;
* mean-luminance ratio `0.285182`;
* active-fraction delta `-0.298039`.

The spatial result is more informative than a single energy ratio:

| Region | RGB log RMSE | Mean ratio | Active-fraction delta |
| --- | ---: | ---: | ---: |
| Floor | `0.027650` | `2.560360` | `-0.450000` |
| Left fire | `0.106711` | `0.302725` | `-0.302083` |
| Right fire | `0.036883` | `0.126556` | `-0.275000` |
| Full | `0.060454` | `0.262620` | `-0.379167` |
| Upper gallery | `0.004439` | `0.053811` | `-0.523438` |

This resolves an apparent visual contradiction. Antiky's floor reflection is too strong where it is active, yet it covers far fewer samples; around both fires its selected reflection is substantially weaker than Three.js. A global reflection gain would intensify the already-high floor without creating the missing roughness-dependent spatial spread.

The canonical reference sample fingerprint is `55d3cf3b89360f0d45af991f27b07c815ad2a1c2f8d2791bd2baa54c8abbc77b`. Antiky's control fingerprint is `9bfbb942a8106839d7129cb77627dd1b077a948a8e9e4beae853efaeae1b3c69`.

## Next bounded SSR experiment

The next renderer change can now be evaluated causally. Preserve Antiky's trace shader, temporal resolve, particles, deterministic analytic lights, fitted sunlight, environment producer, AO, bloom, exposure, and presentation. Change only reflection reconstruction and selection:

1. retain a separate full-resolution raw SSR trace;
2. build a five-mip `rgba16float` reflection texture;
3. make mip zero an exact raw copy;
4. reconstruct mips one through four with the reference non-recursive `7×7` filter at mip-dependent spread;
5. select the final reflection with surface roughness squared times four before bloom and final presentation.

The candidate must use a newly captured Three.js reference with the same sample fingerprint as the explicit control or the quality decision is unavailable. It must reduce priority RGB log RMSE by more than `0.00001` from `0.077742`, and none of floor, left-fire, or right-fire RGB log RMSE may worsen by more than that tolerance. It must also beat the committed final-image checkpoint rather than trading a better reflection metric for a worse presentation, while preserving frame-12 particle, lighting, temporal, floor-pool, issue, and independent-renderer invariants.

This control turns the SSR work from a plausible visual tweak into a falsifiable renderer experiment.
