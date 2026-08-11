# WESL Temporal Resolve Experiment

## Question

After the environment, light, particle, bloom, output, and reflection-transfer corrections, WESL still rendered an unjittered single-frame HDR scene. Three.js instead jitters the camera projection, resolves the scene through temporal history, then sends that resolved scene to bloom and final presentation while SSR continues to trace the raw scene MRT.

The experiment asked whether reproducing that graph locally in WESL would create the softer, persistent fire energy visible in Three.js without enlarging particles, retuning bloom, or sharing renderer code.

## Breakthroughs

The largest breakthrough was treating polish as a frame-graph problem rather than a shader-constant problem. Three's particles are plain additive squares. Their smooth appearance comes primarily from projection jitter, history clipping, and temporal accumulation before bloom. Matching particle geometry alone could never reproduce that distribution.

The second breakthrough was preserving two different scene meanings:

* raw jittered HDR remains the input to the WESL-owned SSR trace;
* AO-applied HDR is variance-clipped into temporal history;
* temporal history plus reconstructed SSR is the bloom source;
* temporal history, reconstructed SSR, and five bloom levels meet only in presentation.

This prevented the common but incorrect shortcut of placing SSR or bloom inside history, and it kept the independently authored WESL renderer measurable as its own system.

## Implementation

WESL now owns:

* the exact 31-sample Halton `(2,3)` projection-jitter cycle;
* immutable-base projection updates, so jitter never accumulates numerically;
* two full-resolution `rgba16float` history textures with deterministic ping-pong ownership;
* a statically linked fullscreen temporal shader;
* a 3×3 current-frame mean and variance estimate;
* gamma-1 AABB history clipping;
* frame-zero history invalidation and subsequent 5% current / 95% history weighting;
* Three-style HDR luminance compression and normalized blending.

This is deliberately benchmark-specialized. The scene and camera are static, and the moving transparent billboards are excluded from Three's velocity prepass, whose captured values are zero. WESL therefore omits velocity and depth-history reprojection for this experiment. That shortcut is not a general temporal-AA implementation for moving cameras or opaque objects.

## Red-first evidence

The first regressions failed because WESL had no temporal state module or statically linked temporal shader. Tests freeze the Halton cycle and wrap, non-accumulating projection write, ping-pong history indices, history-valid settings, full-screen UV mapping, AABB clipping, 5% current weight, AO input, and native Dawn pipeline compilation.

The final package verification passed 42 tests, TypeScript typecheck, production build, and whitespace validation.

## Capture result

The synchronized heavy capture `/tmp/wesl-temporal-1` passed with all five renderers ready at frame 12, no issues, and no shared-renderer pairs.

| Metric | Prior canonical WESL | Temporal WESL | Change |
| --- | ---: | ---: | ---: |
| Similarity | 0.964655 | 0.970163 | +0.005508 |
| Color | 0.988584 | 0.990737 | +0.002153 |
| Histogram | 0.896857 | 0.915926 | +0.019069 |
| Luminance | 0.980549 | 0.984936 | +0.004387 |
| Structure | 0.981995 | 0.981793 | -0.000202 |
| Tone | 0.959427 | 0.958064 | -0.001363 |

The histogram gain is the clearest quantitative signature of the visual improvement: temporal history suppresses isolated hot spikes and redistributes their energy into the surrounding mid-high range that bloom consumes.

At frame 12, the latest WESL temporal history measured:

| Region | WESL temporal | Three TRAA | Absolute gap |
| --- | ---: | ---: | ---: |
| Full | 0.062637 | 0.061348 | 0.001289 |
| Floor | 0.064657 | 0.064147 | 0.000510 |
| Left fire | 0.904658 | 0.985979 | 0.081321 |
| Right fire | 0.119298 | 0.127315 | 0.008017 |
| Upper gallery | 0.075905 | 0.091542 | 0.015637 |

The full scene and floor are now extremely close at the resolved-stage boundary. Both fire regions move into the correct temporal energy range without changing particle state: captured WESL particle position and color errors remain exactly zero, and the maximum fire-radius error remains `0.000001`.

## What remains

The upper gallery is still under-energized before presentation. Because the temporal graph is now explicit and measured, that deficit should not be compensated with exposure or bloom. It belongs to the upstream light/indirect distribution or to the benchmark-specialized omission of Three's depth-history validity behavior.

WESL SSR also remains an independently authored 24-step trace with fixed reconstruction rather than Three's roughness-selected five-mip result. That is a separate experiment; temporal history did not absorb or conceal it.

## Decision

Accept the WESL temporal resolve. It produces a large human-eye polish improvement, raises similarity from `0.964655` to `0.970163`, and validates the central research lesson: matching Three.js required reproducing the causal ordering of scene, temporal, SSR, bloom, and presentation—not merely reverse-engineering individual fragment colors.
