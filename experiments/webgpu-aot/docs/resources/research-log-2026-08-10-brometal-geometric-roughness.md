# BroMetal geometric roughness experiment

Date: 2026-08-10

## Question

Would Three-style geometric specular antialiasing improve BroMetal after authored tangents brought its material basis close to the reference?

The experiment added view-space derivatives of the unperturbed geometry normal to material perceptual roughness. It used the same component-maximum derivative, `0.0525` material floor, and saturated sum already accepted in the WESL renderer. No lighting, AO, SSR, temporal, bloom, tone-map, asset, or workload settings changed.

## Producer result

The roughness producer behaved exactly as predicted. Mean G-buffer roughness moved from:

| Region | Accepted BroMetal | Candidate | Three |
| --- | ---: | ---: | ---: |
| Full | 0.771759 | 0.781031 | 0.779984 |
| Floor | 0.841777 | 0.847493 | 0.848627 |
| Upper gallery | 0.759148 | 0.781094 | 0.783303 |

This is unusually strong stage-level agreement. The candidate was not merely “nearby”; it reproduced the expected WESL/Three roughness distribution across the most important regions.

## Visual result

Despite the better producer statistics, the final visual score regressed in two synchronized heavy captures:

| Capture | Score | Color | Histogram | Luminance | Structure | Tone |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Accepted authored tangents | 0.978899 | 0.990439 | 0.949176 | 0.982724 | 0.987933 | 0.978521 |
| Geometric roughness 1 | 0.978101 | 0.990230 | 0.946775 | 0.982248 | 0.988267 | 0.977763 |
| Geometric roughness 2 | 0.978130 | 0.990229 | 0.947031 | 0.982249 | 0.988196 | 0.977621 |

The regression was deterministic and concentrated in histogram/tone behavior. Structure improved slightly in the first run, which is consistent with smoother specular edges, but the overall distribution moved farther from Three.

Captures:

- `/tmp/brometal-geometry-roughness-1`
- `/tmp/brometal-geometry-roughness-2`

## Integration failure discovered

The first attempted capture failed before rendering. The new fragment calculation read the geometry frame uniform, but the bind-group layout exposed that uniform only to the vertex stage. Chrome correctly rejected geometry pipeline creation with a `GPUPipelineError`.

The existing Dawn test compiled shader modules but did not create the geometry pipeline, so it missed stage-visibility compatibility. A pipeline-creation regression reproduced the browser failure before the layout was corrected for the experiment. This is a useful harness lesson: shader compilation alone does not validate entry-point compatibility with explicit bind-group layouts.

The temporary visibility fix and regression were removed with the rejected experiment because the accepted geometry fragment no longer reads the frame uniform.

## Interpretation

This disproves a tempting assumption: matching Three at an intermediate material buffer does not guarantee a closer final image when downstream renderer semantics differ.

BroMetal's roughness-selected reflection pyramid, temporal history, and bloom consume roughness differently from the complete Three graph. Increasing roughness can therefore match Three's G-buffer while redistributing BroMetal's already-different reflection energy in the wrong places. The stage was correct in isolation; the graph was not yet equivalent enough for the stage correction to be beneficial.

This also explains why copying a successful WESL correction was insufficient. WESL and BroMetal independently own their renderers, and their downstream errors are not interchangeable even when their starting roughness statistics look similar.

## Decision

Rejected and fully reverted. The accepted authored-tangent implementation remains canonical.

Do not reintroduce geometric roughness as a standalone BroMetal change. Revisit it only after measuring or correcting the roughness-selected SSR/temporal transfer, and gate both the G-buffer roughness distribution and the final histogram/tone response in the same experiment.

## Harness growth

For future material-stage experiments:

1. Create the affected real GPU pipeline in Dawn; module compilation is not enough.
2. Measure the producer target and every roughness-consuming stage in the same capture.
3. Treat a closer intermediate buffer as evidence, not acceptance.
4. Repeat synchronized captures whenever a small final-score movement conflicts with a strong producer-level improvement.
