# SSR Reconstruction Equivalence

Date: 2026-08-10

## Question

Do the three non-BroMetal experimental renderers reconstruct and consume screen-space reflections with the same workload structure as BroMetal before benchmark work begins?

## Reference contract

BroMetal established the comparison contract used in this checkpoint:

1. render one full-resolution `rgba16float` raw SSR trace;
2. allocate one five-mip `rgba16float` reconstruction pyramid;
3. write mip 0 as an exact copy of the raw trace;
4. write mips 1–4 with a direct-from-raw, non-separable 7×7 filter whose spread equals the mip level;
5. select `clamp(roughness² × 4, 0, 4)` through a trilinear sampler;
6. write that result to a separate full-resolution selected-reflection target;
7. use the selected reflection in both bloom extraction and final presentation.

Each renderer continues to own and compile its implementation locally. No renderer or shader code is shared between demos.

## Findings

WESL already satisfied the complete contract. Its package tests and the synchronized trace proved a raw pass, five reconstruction passes, one roughness-selection pass, and the expected three textures.

TypeGPU still used two full-resolution ping-pong textures and four horizontal/vertical blur passes. The final composite sampled the last blur at LOD 0, and bloom extraction did not include the selected reflected scene. It was replaced with a renderer-owned five-mip plan, typed reconstruction and selector shaders, a trilinear sampler, and a separate selected target. Bloom and final presentation now consume the selected result.

TypeGPU-Antiky had the same older ping-pong structure. It now owns two additional AOT shader artifacts for reconstruction and selection, five mip-specific settings buffers, canonical raw/pyramid/selected views, and explicit one-mip descriptors for the raw and selected targets. The explicit descriptors and canonical raw view are visually neutral but important for unambiguous GPU lineage.

The Antiky semantic harness initially rejected the new graph three times. Those failures exposed useful instrumentation requirements rather than visual defects:

- implicit one-mip texture defaults were not sufficient evidence;
- five equivalent raw texture views obscured the single-source relationship;
- the harness still pinned the pre-transfer raw SSR shader hash even though the later accepted transfer experiment changed it.

The production descriptors/view ownership and the stale harness pin were corrected instead of weakening the verifier.

## Verification

Final heavy capture: `/tmp/ssr-equivalence-final-2`

- profile: heavy, 2560×1440;
- synchronized capture frame: 12;
- measured workload frames: 5;
- all five demos: ready;
- browser/WebGPU issues: zero;
- report status: pass.

TypeGPU, TypeGPU-Antiky, and WESL each executed exactly these reflection stages once per captured frame:

- one raw trace;
- reconstruction mips 0, 1, 2, 3, and 4;
- one roughness-selected reflection pass.

Their captured pyramids were `rgba16float`, 2560×1440 at mip 0, with five mip levels. Antiky and WESL additionally passed the fail-closed semantic selected-reflection comparison against Three.js with five proven mip writes and formula channel `w`, multiplier 4, mip range 0–4.

Validation completed with 108 tooling tests, all TypeGPU (43), Antiky (56), and WESL (48) package tests, all workspace typechecks/builds, and the Three.js Dawn integration on the hardware-backed adapter. Four TypeGPU semantic readbacks are intentionally skipped only on Dawn's non-executing null backend and pass on hardware.

## Performance note

The capture FPS values are instrumentation-time observations, not benchmark results. The observer records resource state, commands, buffer writes, texture probes, and semantic reflection samples; it materially changes timing and should not be used as the benchmark baseline.

Separately, BroMetal's large interactive regression was traced to its raw SSR march changing from a fixed 24 steps to a screen-dependent maximum of 2,048 steps plus eight refinement iterations. That algorithmic cost is independent of the five-mip reconstruction topology and should be handled as a dedicated performance experiment rather than by deleting reconstruction parity.

## Conclusion

The three requested non-Three.js implementations now have equivalent SSR reconstruction topology and consumption semantics. This closes the rendering-structure prerequisite for beginning benchmark design, while leaving raw trace algorithms independently authored and intentionally measurable.
