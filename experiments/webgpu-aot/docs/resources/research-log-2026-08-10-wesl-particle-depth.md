# WESL Particle-Depth Audit

## Question

WESL's particle seed, position, color, and radius buffers matched Three exactly, but the dense left-fire HDR peak remained far lower. The right-fire maximum was already essentially identical. This audit moved beyond buffer parity and compared the actual billboard raster inputs.

## Projected-geometry proof

The synchronized frame-12 capture contains Three's projection/view uniforms and all 406 instance matrices, plus WESL's view-projection and particle storage buffers. Reconstructing all projected lower-left billboard corners showed:

- maximum view-projection matrix difference: `1.43e-7`;
- mean clip-corner difference: `1.42e-7`;
- maximum clip-corner difference across 406 instances: `3.24e-7`.

For particle zero, Three and WESL produced the same NDC corner to roughly eight decimal places. This rules out camera position, projection, Halton jitter, billboard radius, camera-facing orientation, and quad construction as causes of the energy loss.

Pipeline inspection also confirmed both systems use sample count one, additive color, no depth writes, and `less-equal` particle depth comparison. WESL renders one no-cull pass; Three renders its native two winding-specific DoubleSide passes, of which only the matching winding rasterizes for these positive-determinant planes.

## Breakthrough

The remaining relevant raster contract was the main scene depth format:

- Three scene and particle depth: `depth24plus`;
- WESL scene and particle depth: `depth32float`;
- both shadow systems: independent 4096² shadow maps.

The fire particles lie almost coplanar with the lamp geometry. Small depth quantization differences therefore changed how many overlapping red squares passed `less-equal`, while the open-corridor curve particles were largely unaffected. This explains the left-only discrepancy despite exact projected geometry.

## Correction

WESL now uses `depth24plus` consistently for its main alpha-aware depth prepass, background, forward pass, and particle pass. Its independently owned two-cascade shadow maps remain `depth32float`; the correction does not weaken their precision or change the accepted sun contract.

## Result

The heavy capture `/tmp/wesl-depth24-1` passed. The final aggregate score remained `0.973246` because ACES compresses the already-hot fire region, but the causal HDR stages moved substantially toward Three:

| Left-fire stage | WESL before | WESL depth24 | Three.js |
| --- | ---: | ---: | ---: |
| Raw HDR mean | 0.772679 | 1.277606 | 1.666313 |
| Raw HDR maximum | 33.212505 | 137.823399 | 204.258755 |
| Temporal mean | 0.738782 | 0.860635 | 0.985708 |
| Temporal maximum | — | 50.834196 | 60.146333 |
| Bloom-bright mean | 0.625782 | 0.726230 | 0.930663 |
| Bloom-bright maximum | — | 49.853986 | 60.147871 |

The right-fire maximum remains aligned: WESL `8.836486`, Three `8.839142`. That regional guard confirms the change repairs coplanar particle acceptance rather than globally scaling particle color.

## Decision

Accept `depth24plus` for WESL's main scene graph and refresh canonical artifacts. Final-canvas similarity alone would have missed this large correction because tone mapping hides HDR peak differences. Future particle audits must retain raw HDR, temporal, and bloom-stage evidence alongside screenshots and aggregate scores.

## Follow-up exclusions

A second pass audit checked whether the remaining left-fire gap came from how the two renderers organize depth work. Three creates a separate `depth24plus` target for its scene MRT, clears it, then renders opaque Sponza geometry and both native transparent billboard windings in the same render pass. WESL first fills its `depth24plus` target in the alpha-aware prepass, redraws opaque geometry against that target with `less-equal`, and finally loads the same target for its particle pass. Because the formats, opaque depth values, comparison function, and particle depth-write state agree, the extra WESL prepass is not a credible explanation for the remaining HDR delta.

The packed particle size was also rechecked at the producer and vertex-shader boundary. WESL stores `billboardRadii[index]` and expands clip-space corners by that radius. Three stores `diameter = radius * 2` in the instance scale but applies it to PlaneGeometry vertices at `±0.5`, producing the same half-extent. The WESL projection factor is the camera projection scale, with `height / width` applied on X. There is no hidden radius-versus-diameter error and no justification for scaling particle size or energy.

Three's two transparent DoubleSide draw calls remain workload-state overhead rather than a 2× energy source: the two pipelines use opposite front-face definitions with back-face culling, so only one winding survives for each positive-determinant billboard plane. WESL's single no-cull draw is raster-energy equivalent.

These exclusions narrow the residual left-fire difference to depth-boundary sensitivity from extremely small synchronized float differences or to downstream scene-lighting/color interactions. It must not be "fixed" with an unexplained particle multiplier. Any further correction needs a new intermediate measurement that isolates opaque HDR from particle contribution, or direct per-fragment depth/coverage evidence.
