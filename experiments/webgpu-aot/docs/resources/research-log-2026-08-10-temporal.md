# Antiky Temporal Resolve and Post-Process Ordering Research Log

## Starting point

This log continues the [August 10–11 environment and lighting work](research-log-2026-08-10-11.md). The committed comparison baseline was captured at synchronized absolute frame 12 on `2026-08-10T04:50:44.570Z`. TypeGPU-Antiky scored `0.975176` in that run. Its deterministic fire and curve state, fitted two-cascade sunlight, box-mip HDR environment, five-level bloom, and neutral ACES/sRGB output were already accepted checkpoints.

The remaining human-eye difference was no longer well described as missing light. Antiky's raw forward HDR was already near the Three.js scene in most broad regions, but its final fire glow and red floor reflection were sharper and stronger. Inspection showed that the two renderers did not agree about where temporal accumulation, reflection, and bloom belonged in the frame graph.

## Breakthrough: polished particles were mostly a downstream result

Earlier versions treated Three.js's fire appearance as evidence for a more elaborate particle fragment shader. GPU inspection disproved that model. Three.js renders 406 solid, untextured square billboards with additive blending. Fire lifetime shrinks a square; it does not drive a procedural flame mask or alpha falloff. The apparent softness and persistence are produced after rasterization by temporal accumulation and multiscale bloom.

That distinction changed the optimization direction. Antiky already had exact particle positions and colors. Increasing particle size, adding radial falloff, or retuning fire intensity would have damaged an accepted producer to compensate for a downstream graph mismatch. The next experiment therefore preserved every particle record and changed only the temporal/composition boundary.

The relevant Three.js relationship is:

```text
raw scene MRT ──> TRAA ───────────────┐
      │                               ├─> reflected scene ─> bloom ─> final
      └────────> SSR + roughness blur ┘

TRAA history contains scene color only.
SSR and bloom are never accumulated into that history.
```

The former Antiky composite instead mixed `HDR × AO + SSR` into history and extracted bloom from raw `HDR + SSR`. That made history a post-process accumulator rather than a scene resolve. It also allowed a hot reflection or particle sample to influence later bloom through a different path than the reference.

## Controlled temporal implementation

Commit `b9b9166` adds one Antiky-owned AOT render artifact and one full-screen pass. No Three.js runtime, shader, renderer, or cross-demo production module is imported.

The implemented fixed-benchmark graph is:

```text
two fitted shadow cascades
  -> jittered forward MRT
  -> exact additive particles
  -> ambient-occlusion target
  -> temporal resolve of current HDR × ambient
  -> SSR from raw current MRT
  -> existing horizontal/vertical reflection reconstruction
  -> bloom extraction from temporal scene + reflection
  -> unchanged five-level bloom
  -> temporal scene + reflection + bloom
  -> exposure 1, Three-style ACES, sRGB
```

Two existing full-resolution `rgba16float` history textures were repurposed as ping-pong temporal outputs, so texture count and texture memory did not increase. Frame 0 reads zero-initialized target 0 but forces current weight to one and writes target 1. Even frame 12 reads target 0 and writes target 1. Bloom and final presentation select that just-written target.

The renderer rebuilds its view-projection from one immutable base every frame. It applies the 31-entry Halton `(2,3)` cycle executed by Three.js, including the WebGPU clip-space signs, and never accumulates projection offsets. The temporal shader implements the active zero-velocity branch observed in this fixed scene:

* a `3×3` current-color mean and second moment;
* one-standard-deviation RGB bounds;
* Playdead-style AABB clipping of history;
* current/history nominal weights `0.05/0.95` after frame 0;
* the same compressed-luminance weight normalization used by the captured Three.js resolve;
* scene history that has no reflection or bloom binding.

This is deliberately a benchmark specialization. The camera and opaque Sponza geometry are static, and all sampled Three.js velocity values are zero. It is not a general temporal renderer for resize, camera motion, or moving opaque geometry because it omits velocity and previous-depth validity/reprojection.

## Red-first and verification evidence

Before production files existed, focused tests failed on the missing temporal module and artifact, the old bloom source, and the seven-artifact build contract. The completed feature adds pure tests for the exact first Halton samples and 31-frame wrap, non-accumulating matrix jitter across all four matrix columns, frame-zero history invalidity, and non-aliasing ping-pong selection. Artifact tests verify temporal bindings and output format, absence of reflection from the history shader, the presentation-only composite, deterministic generation, and Dawn compilation of all eight render artifacts.

The verified implementation passed:

* 8 TypeGPU-Antiky test files and 45 tests;
* TypeGPU-Antiky TypeScript checking;
* deterministic shader regeneration;
* the Vite production build;
* `git diff --check`;
* an independent source, generated-WGSL, renderer, and capture review.

## Inspection harness growth

The first candidate capture rendered correctly but did not retain either temporal target as a pixel probe. The textures were labeled `Antiky temporal resolve target 0/1`; the default observer matched `history` and labels ending in `resolve`, but not a label containing `temporal` followed by more text. Later bloom textures were probed, proving this was selection vocabulary rather than a resource-lifetime or quota failure.

A failing tooling regression reproduced the omission. Commit `d37906c` adds `temporal` to both default probe patterns and asserts that an Antiky temporal target is selected. The tooling suite passed all 70 tests afterward. The corrected five-demo capture retained 20 Antiky intermediate targets, including both history textures.

One instrumentation gap remains: reports do not persist the effective observer configuration. A future report should record its probe patterns, quotas, and executing-frame association so an omitted target can be explained from the artifact alone.

## Synchronized candidate result

The corrected candidate `/tmp/antiky-temporal-2b` completed at `2026-08-10T05:17:10.410Z`. All five renderers reached frame 12, all issue lists were empty, no shared-renderer pair was detected, and the report passed.

Every final-image comparison component improved:

| Component | Canonical baseline | Temporal candidate |
| --- | ---: | ---: |
| Overall | `0.975176` | `0.978765` |
| Color | `0.989798` | `0.990142` |
| Histogram | `0.945696` | `0.957179` |
| Luminance | `0.981880` | `0.982454` |
| Structure | `0.972718` | `0.976523` |
| Tone | `0.968662` | `0.975136` |

Full-resolution display inspection moved four of the five named regional means toward the same-run Three.js image:

| Region mean | Baseline | Temporal candidate | Three.js |
| --- | ---: | ---: | ---: |
| Full | `0.142160` | `0.140464` | `0.138586` |
| Floor | `0.206163` | `0.206477` | `0.192048` |
| Upper gallery | `0.155106` | `0.149537` | `0.149662` |
| Left fire | `0.371785` | `0.355685` | `0.345792` |
| Right fire | `0.176223` | `0.167599` | `0.167025` |

The broad floor mean moved slightly farther from Three.js, but the more specific architectural floor cue was preserved and strengthened: contrast moved from `0.112825` to `0.115675`, the interior/ring ratio from `1.408379` to `1.421424`, and coherent-row coverage remained `0.995781`. Exact particle evidence was unchanged: fire and curve positions and colors remained zero-error, curve radii remained exact, and the maximum fire-radius reporting floor remained `0.000001`.

The captured command graph proves the intended causal boundary. The temporal pass reads raw HDR texture 603, ambient texture 607, previous temporal target 610, and settings `[2560,1440,1,12]`, then writes target 611. SSR separately reads raw HDR, normal/roughness, world/metallic, depth, and the jittered frame. Bloom extraction reads temporal target 611 plus reconstructed reflection. Final presentation reads target 611, reconstructed reflection, and the five final bloom levels. No temporal binding contains reflection or bloom.

The cost is narrow and explicit:

* shader modules `7 -> 8`;
* render pipelines `9 -> 10`;
* live buffers `401 -> 402`, exactly 16 additional bytes;
* textures remain `96`, with unchanged estimated texture storage `790,107,192` bytes;
* render passes `20 -> 21` per frame;
* non-indexed full-screen draws `17 -> 18` per frame;
* indexed geometry remains 309 draws per frame.

## Important negative result: exact temporal parity is not closed

The experiment deliberately tracked a stricter intermediate criterion in addition to final-image similarity. The latest temporal target had to move closer to the Three.js TRAA resolve in all five named regions. It passed only three:

| Region | Baseline absolute gap | Temporal absolute gap | Result |
| --- | ---: | ---: | --- |
| Full | `0.008758` | `0.006339` | improved |
| Floor | `0.006446` | `0.002513` | improved |
| Upper gallery | `0.002478` | `0.007074` | worse |
| Left fire | `0.547531` | `0.301754` | improved |
| Right fire | `0.004658` | `0.010085` | worse |

Bloom around the dominant left fire improved substantially: its bright-extraction mean gap fell from `0.559566` to `0.286532`, and its maximum gap fell from `114.658359` to `11.505405`. However, that success does not erase the two failed temporal-region checks.

The temporal core should not be retuned to force those numbers. Its `0.05` current weight, variance clip, frame parity, and Halton jitter match the intended reference behavior, and every final-image component improved. The misses are evidence about omitted inputs and existing renderer semantics:

1. Three.js retains previous depth and applies history-validity/reprojection logic. The specialized Antiky pass does not, so jittered opaque edges can retain history where Three.js would select the current sample.
2. Antiky multiplies the complete HDR scene by its post AO target before temporal accumulation. Three.js integrates AO into indirect material lighting instead of darkening direct light, particles, and every other HDR contribution uniformly. The temporal correction exposed this inherited difference rather than creating it.
3. Antiky's reflection remains a fixed two-pass reconstruction. Its texture labeled `reflection trace` is overwritten by the final vertical pass, so the raw trace is not currently observable. Three.js retains a five-mip reflection pyramid and selects `roughness² × 4` later.

This checkpoint is therefore accepted as aggregate human-eye progress and a correct frame-graph correction, not as an all-five temporal-parity pass. The failed criterion remains versioned rather than being silently weakened after the result.

## Next bounded work

Do not change particle intensity, particle size, bloom weights, exposure, sun intensity, or the accepted environment producer to hide the remaining error.

Before changing SSR, add a semantic probe for the final roughness-selected reflection and preserve raw trace evidence. The current Antiky reflection labels describe allocation intent, not the last writer. The isolated SSR experiment should retain the post-temporal trace shader, build five `rgba16float` mips with mip zero as an exact copy and mips one through four as the reference 7×7 reconstruction, then select `roughness² × 4` without changing trace intensity, temporal history, bloom, or presentation.

Separately, exact temporal work should add a semantic pre-temporal `HDR × AO` measurement and test depth-based history invalidation before implementing full reprojection. AO placement is a renderer-architecture issue and should remain its own causal experiment rather than becoming an empirical temporal gain.

## Canonical committed-code confirmation

The committed renderer and probe vocabulary were captured into `artifacts/visual-comparison` at `2026-08-10T05:33:29.992Z`. All five demos again reached synchronized frame 12 with empty issue lists, no shared-renderer pairs, and a passing report.

TypeGPU-Antiky scored `0.978799`; the `0.000034` difference from the temporary candidate is ordinary capture variation. Color, histogram, luminance, structure, and tone measured `0.990142 / 0.957396 / 0.982454 / 0.976552 / 0.975015`. Both temporal targets are now present in the canonical texture evidence. Target 1 is the latest frame-12 output at write sequence 298 and exactly reproduces the candidate's full/floor/upper/left/right means: `0.067686 / 0.066690 / 0.084935 / 1.287462 / 0.117288`.

The canonical floor cue also reproduces at contrast `0.115675`, ratio `1.421424`, and `236/237` coherent rows. Fire and curve positions and colors remain exact; curve radii remain exact; maximum fire-radius error remains `0.000001`. The frame retains 309 indexed geometry draws, 21 render passes, 96 textures, `790,107,192` estimated texture bytes, one additional 16-byte temporal settings buffer, and `762.6 MiB tracked` telemetry. This closes reproducibility of the aggregate visual checkpoint while leaving the documented 3/5 intermediate temporal gate open.
