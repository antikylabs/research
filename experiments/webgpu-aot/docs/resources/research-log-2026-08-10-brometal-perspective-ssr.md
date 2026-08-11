# BroMetal Perspective-Correct SSR Experiment

## Question

BroMetal was already one of the closest renderers by eye, but its synchronized GPU evidence showed a contradictory reflection field. The left fire produced more raw reflection than Three.js while the floor, right fire, upper gallery, and broad scene produced almost none. This experiment asked whether the mismatch came from BroMetal's accepted-hit transfer or from the geometry used to locate the hit.

## Instrumentation finding

The heavy frame-12 control `/tmp/wesl-gtao-2` isolated the mismatch before bloom and presentation. BroMetal's raw reflection means were full `0.000291`, floor `0.000067`, left fire `0.016269`, right fire `0.000581`, and upper gallery `0.000539`. Three's corresponding SSR means were `0.004499`, `0.000628`, `0.012058`, `0.012349`, and `0.001203`.

BroMetal already projected the ray endpoints, chose a screen-space step count, rejected back-facing hits, applied a local thickness test, and performed eight binary refinements. The actual samples, however, advanced linearly in world space and compared radial camera distances. Perspective projection does not preserve either parameterization. A pixel step therefore tested a different point on the ray than the depth value associated with that screen coordinate. The false bracket favored the large nearby left emitter and missed valid geometry elsewhere.

## Native BroMetal correction

Commit `c344f60` keeps the BroMetal AOT compiler, reflection transfer, roughness pyramid, temporal resolve, bloom, and output transform unchanged. The reflection shader now:

* clamps the projected endpoint against the near plane;
* marches linearly between projected pixel endpoints;
* reconstructs ray depth with reciprocal interpolation;
* projects the sampled world-position buffer into the same depth space;
* refines the same perspective-correct screen-space bracket eight times; and
* removes the old normal offset, which no longer belongs in the corrected bracket.

This is a geometry correction rather than an energy tune. No intensity, threshold, exposure, bloom, or material constant changed.

## Result

Two synchronized heavy captures, `/tmp/brometal-perspective-1` and `/tmp/brometal-perspective-2`, produced identical raw-reflection regional means. All five demos reached frame 12 with no issues.

| Raw reflection region | Control | Perspective-correct | Three.js |
| --- | ---: | ---: | ---: |
| Full | 0.000291 | 0.004259 | 0.004499 |
| Floor | 0.000067 | 0.000579 | 0.000628 |
| Left fire | 0.016269 | 0.007648 | 0.012058 |
| Right fire | 0.000581 | 0.012675 | 0.012349 |
| Upper gallery | 0.000539 | 0.001561 | 0.001203 |

The correction recovers the missing broad, floor, right-fire, and upper-gallery reflection structure. Full, floor, and right-fire means are now especially close to Three. The left fire changes from an isolated excess to a moderate deficit, while the upper gallery changes from a deficit to a smaller excess.

The screenshot score moved from `0.977280` to `0.976161` on the first capture and `0.976121` on the repeat. Color, luminance, structure, and tone remain strong; histogram similarity accounts for most of the decline. Side-by-side inspection shows the candidate restoring subtle red response across the central floor and right side that is present in Three but absent from the control.

## Decision

Accept the perspective-correct bracket as a structural SSR checkpoint. The previous score benefited from omitting real reflected structure, so its small numerical advantage is not evidence that the old ray geometry was better. The deterministic stage metrics and visual relationship support the corrected implementation.

Do not tune the reflection transfer to recover the lost histogram score. The next BroMetal investigation should trace how the now-correct raw reflection is roughness-selected and combined with temporal color and bloom. The current comparison harness also lacks BroMetal semantic selected-reflection sampling, so extending that diagnostic is a useful instrumentation follow-up before changing downstream reflection energy.
