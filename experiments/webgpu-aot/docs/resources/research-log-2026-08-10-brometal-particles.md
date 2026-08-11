# BroMetal Particle-Producer Experiment

## Question

The current BroMetal image was visually close in its architectural lighting, but its fires were not the same workload as Three.js. BroMetal rendered twenty large orange procedural flame cores, approximated the other fire particles with stateless sine motion, and shaped every particle with taper, wobble, radial falloff, and fragment discard. Three.js renders 406 solid, untextured additive squares whose apparent softness comes from downstream temporal and bloom processing.

This experiment asked whether replacing only BroMetal's particle producer and particle rasterization with a native, deterministic BroMetal implementation of the authoritative workload would remove the obvious orange blobs without disturbing its accepted cascaded sunlight, analytic gallery lights, AO, SSR, bloom, or output transform.

## Breakthrough

The key was to stop treating the visible particles and analytic lights as two related approximations. They are two views of one simulation state. BroMetal previously had an exact fixed-step state only for sixteen analytic fire samples, a separate exact curve cache, synthetic visible fire particles, and an independently approximated corridor producer. This made the visible emitter and the light affecting nearby masonry disagree even when their seeds looked similar.

BroMetal now owns one package-local 470-record fixed-step simulation. One renderer-owned rig advances it exactly once per synchronized frame and packs both stable GPU buffers from that same state:

* 256 fire records use the deterministic Mulberry32 seed order, Float32 life/state, reference curl motion, reset behavior, red color, and shrinking billboard radius;
* 150 overhead curve records use the locally sampled 240-point closed centripetal Catmull-Rom path;
* 64 corridor records use the same seeded color, motion, radius, and fade rules;
* 406 visible particle records and the 28 animated analytic-light samples are derived from that single state;
* the four main point lights remain the existing BroMetal-owned constants.

The particle shader is now deliberately simple: a camera-facing square with packed radius and packed RGB, alpha one, additive blending, no core classification, no aspect-ratio distortion beyond the existing projection correction, no depth nudge, no procedural edge shaping, and no discard. This is independently compiled BroMetal WGSL; no renderer or runtime implementation is shared with Three.js or another demo.

## Red-first evidence

The first focused run failed at both intended boundaries:

* `src/light-state.js` did not exist, proving there was no unified simulation contract;
* the first custom fire core had radius `0.1584`, failing the authoritative maximum radius `0.025`.

The new regressions compare all 470 seed/state records against the test-only Three.js oracle at frames 0, 12, and 828. They also compare every one of the 406 packed particle records and every sampled analytic-light record, verify stable buffer identity, idempotent same-frame updates, deterministic rewind, and sequential/direct-frame equivalence. Shader regressions reject the old `fireCore`, discard, smoothstep, and clip-depth shaping.

After implementation, the complete BroMetal package passed 29 tests, package typecheck, deterministic shader regeneration, and the production build. The source split also reduced the old 500-plus-line mixed producer: simulation complexity is trapped in `light-state.ts`, while `lights.ts` exposes the small rig and packing boundary used by the renderer.

## Result: accepted producer correction

The heavy-profile capture `/tmp/brometal-exact-particles-1` completed with all five demos ready at synchronized frame 12, no capture issues, no shared-renderer pairs, and report status `PASS`.

GPU-buffer particle parity changed as follows:

| Fire metric | Control | Candidate |
| --- | ---: | ---: |
| Color mean/max error | 2.681884 / 2.681884 | 0 / 0 |
| Position mean/max error | 0.309894 / 1.465363 | 0 / 0 |
| Radius mean/max error | 0.010060 / 0.140524 | 0 / 0.000001 |

Curve position, color, and radius errors remained exactly zero. Final image similarity improved from `0.945272` to `0.945820`. The display-space floor-pool cue also improved from contrast `0.112088`, ratio `1.408517`, and coherent-row fraction `0.987342` to `0.116158`, `1.430995`, and `0.991561` respectively. Upper-gallery contrast stayed effectively stable (`0.220198` to `0.219102`); its ratio changed because the control region became brighter, not because the accepted gallery light producer was removed.

Human inspection shows the important qualitative result: the oversized orange flame bodies disappeared and the emitters now have the same dense small red-square structure as Three.js. The architecture, square sunlight pool, and upper moving lights remain intact.

## What this exposed next

Exact particles did not make BroMetal exact. The candidate still scatters many sharp red speckles across walls and the foreground floor, while Three.js turns the same particle state into smoother, more coherent reflected and bloomed energy. Because the producer buffer is now exact, those pixels can no longer be blamed on particle seeding, motion, color, radius, or fragment shaping.

The next BroMetal investigation should therefore inspect the downstream particle-to-image path: raw SSR hit distribution, reflection reconstruction/roughness filtering, bloom source and temporal behavior. It should keep this exact producer, analytic lights, cascaded sun, and output transform fixed. Increasing particle size, restoring procedural cores, or tuning their color would hide the actual reflection/post-processing gap and break the now-proven workload parity.

## Decision

Retain the unified BroMetal light rig and plain-square particle shader. This is a source-causal correction with exact GPU-buffer evidence, a measurable score gain, a clear human-eye improvement, and no renderer sharing. Treat the remaining red speckle distribution as a separate downstream research question.

## Canonical artifact checkpoint

After the implementation and lab note commits, the canonical heavy-profile artifact set was refreshed at `artifacts/visual-comparison`. The report completed with all five demos ready at frame 12, no issues, no shared-renderer pairs, and overall status `PASS`. The repeat reproduced exact fire position/color parity and maximum radius error `0.000001`; BroMetal similarity was `0.945897`. Lighting cues reproduced exactly at upper-spill contrast `0.219102`, floor contrast `0.116158`, floor ratio `1.430995`, and coherent-row fraction `0.991561`.
