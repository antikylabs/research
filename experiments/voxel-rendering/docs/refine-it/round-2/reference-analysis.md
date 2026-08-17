# Round 2 reference analysis

This analysis defines the visual review bar for the render studio. The references are targets for
composition and material legibility, not sources for assets or shaders.

## Reference qualities

### Snow pavilion — [`2.png`](../references/2.png)

The pavilion is a complete focal object surrounded by a deliberate island of foreground snow,
bridge, trees, fence, and warm practical lights. A cool dominant palette and warm windows create
clear light direction and material separation. The dark background isolates the silhouette while
shallow focus and foreground overlap create depth. Round 2 should preserve that complete-subject
read and the warm/cool contrast without copying the building.

### Neon transit stop — [`sample0.png`](../references/sample0.png)

The nearly frontal composition uses a bright architectural center, darker side masses, overhead
structure, and floor reflections to create foreground, middle, and background layers. Rough wall,
painted metal, glass, emissive strips, and wet-looking floor highlights remain distinct despite a
limited palette. Round 2 should pursue controlled highlights, emissive restraint, visible surface
breakup, and reflections that describe material instead of washing out the voxel form.

### Morton Peak lookout study —
[`i-tried-recreating-morton-peak-lookout-v0-hxno0uwvkgxf1.webp`](../references/i-tried-recreating-morton-peak-lookout-v0-hxno0uwvkgxf1.webp)

The paired render and photograph make structural completeness easy to judge: supports, landings,
stairs, railings, cabin, and roof remain readable from an oblique view. Low warm light makes long
directional shadows and exposes the difference between metal structure, glazed cabin, and ground.
Atmospheric simplification does not remove important sides or connections. Round 2 should use the
same standard for 360-degree subject inspection and for time-of-day comparisons.

## Review checklist

Photorealistic evidence is acceptable only when it shows all of the following:

- a complete subject with an intentional silhouette and no renderer-created holes;
- foreground overlap, a readable subject plane, and a distinct background;
- a directional key light, legible contact/cast shadows, and controlled emissive highlights;
- visibly different organic/wood, stone/soil, metal, glass, emissive, foliage, and water response;
- surface breakup at voxel scale rather than uniformly colored blocks;
- atmosphere and focus falloff that reinforce actual scene depth; and
- water that reveals geometry behind it while preserving reflective edges and spatial variation.

Stylized evidence uses the same composition. It must still differ when final grading is disabled:
light bands, material-family palette rules, glass/water edge response, emissive weighting, and
block-normal shaping are the primary review points.

## Owner correction: environment fidelity

The first Round 2 environment set failed the reference bar. Its `160 × 96 × 160` composition exposed
a rectangular world edge, used a two-voxel terrain skin, placed only 22 trees, and built each crown
as one filled cuboid. Passing renderer tests did not make that work visually acceptable.

Replacement environment evidence must therefore show all of the following:

- terrain and water continue to every horizontal boundary, while ridges, shorelines, forest bands,
  and composition keep the finite storage edge out of the authored review cameras;
- the subject sits in a terrain-blended clearing instead of on a rectangular biome plate;
- trees contain modeled trunks, branches, irregular crowns or tiered boughs, and varied silhouettes;
- the foreground, subject plane, and far field each contain distinct authored forms;
- forest, snow forest, mountains, beach, and swamp remain identifiable from geometry rather than
  only from palette swaps; and
- the larger world remains renderable by Greedy mesh, Face instances, and Path trace.

The owner’s visual review remains the final decision. Passing a renderer contract or naming a mode
“Photorealistic” is not a substitute for that review.

## Current response to the correction

The current review set uses a finite `384 × 128 × 384` shared world and a dedicated landmark vista
for each biome. It replaces the central empty clearing with a biome-specific sanctuary terrace and
rebuilds Lantern Pavilion as a multi-level focal structure. Forest, snow forest, mountain, beach,
and swamp captures now include distinct foreground structures, midground vegetation or water, and
a continuous far field. The authored detail layer adds wildlife, boats, flags, birds, fireflies,
lanterns, and routes through the environment. Snow forest also deposits 13,269 deterministic
weathering cells on exposed pavilion surfaces, so the focal model belongs to the weather rather than
appearing pasted onto it. A matched six-image set holds the current expanded snow scene and front
camera fixed across all three renderers and both treatments.

These changes address the measurable failures in the rejected passes. They do not convert the
reference checklist into an automatic aesthetic verdict. In particular, renderer-specific contrast
and color remain visible in the matched set, and the owner must decide whether the authored density,
composition, and finish meet the intended production bar.

A later art follow-up replaces the raster pass's screen-space gradient and oversized sun blob with
camera-derived view rays, world-locked sun and moon directions, layered cloud structure, horizon
scattering, and restrained night stars. Path trace consumes the same sky and fog state. The same
follow-up adds rooted trunk flare, surface scars, moss accents, dead branch stubs, hanging growth,
and palm fruit to the modeled vegetation. That work is compiled and tested but is not part of the
promoted images until it is inspected and recaptured from a live WebGPU runtime.
