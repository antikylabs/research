# BroMetal Horizon Ambient-Occlusion Experiment

## Question

After correcting BroMetal's perspective reflection bracket, its raw SSR distribution closely followed Three.js but its final histogram and square floor-light pool still lagged. The accepted reflection graph already used temporal color, five raw-derived roughness mips, `roughness²×4` selection, bloom, and final composition in the correct order. This experiment therefore tested the older inline ambient-occlusion approximation instead of retuning reflection energy.

## Source finding

BroMetal estimated AO from four world-position samples exactly three pixels away, subtracted a fixed angular threshold, multiplied the result by `.36`, and clamped visibility to at least `.28`. It had no horizon search, depth reconstruction, temporal rotation, denoised field, or directly observable AO texture. Three uses a screen-space GTAO field, and the independently accepted WESL horizon implementation had already shown that broad AO—not output grading—was a major histogram lever.

## Red-first implementation

Commit `8a454c3` adds a BroMetal-owned horizon plan and a second full-resolution `rgba16float` output from the deferred lighting pass. The AOT-generated fragment shader evaluates three rotated screen-space slices, four samples in each direction, distance falloff, projected-normal horizon angles, and the cosine-weighted closed-form visibility integral. Only environment diffuse/specular receives AO; sun and local lights remain unoccluded by this field.

The new output costs `29,491,200` bytes at the heavy `2560×1440` profile and makes the ambient stage directly probeable. The feature remains part of BroMetal's own deferred pipeline and does not import Three, WESL, or another renderer's runtime.

## Failed checkpoints and what they taught us

The first candidate used material normals and a two-world-unit radius. It improved the floor-pool contrast from `0.084741` to `0.120363`, but its actual red-channel visibility averaged only about `0.76` full-frame and the visual score fell to `0.968486`. The report initially displayed `0.161617` “luminance”; because the AO field stores visibility in red only, that number was the real visibility multiplied by Rec.709 red weight `.2126`. Reading the channel summary rather than the color-luminance summary was essential.

Switching to a screen-derived geometric normal did not solve the low tail. Comparing the local contract with the accepted WESL implementation exposed a fourfold radius error: WESL uses `.5`, not `2`. The `.5` candidate aligned the two fire regions closely but retained a `7.5%` zero tail and scored `0.966751`.

The remaining difference was position precision. BroMetal reconstructed neighbor geometry from its `rgba16float` world-position G-buffer, while Three and WESL reconstruct it from depth. An 80-byte per-frame ambient uniform now carries the inverse jittered view-projection matrix, dimensions, synchronized frame index, and `.5` radius. The shader reconstructs every horizon position from `depth24plus`, eliminating the zero tail without a visibility floor or gain.

## Accepted result

Two synchronized captures, `/tmp/brometal-horizon-depth-1` and `/tmp/brometal-horizon-depth-2`, were identical across every score component and all five AO region means. All demos reached frame 12 without issues.

| AO red-channel mean | BroMetal | WESL | Three.js |
| --- | ---: | ---: | ---: |
| Full | 0.859356 | 0.860784 | 0.870131 |
| Floor | 0.850569 | 0.856327 | 0.833137 |
| Left fire | 0.659680 | 0.666864 | 0.729052 |
| Right fire | 0.654759 | 0.655969 | 0.718456 |
| Upper gallery | 0.768113 | 0.775030 | 0.820343 |

BroMetal and WESL now independently produce nearly identical horizon fields. Three retains roughly five to nine points more visibility around fires and the gallery, plausibly because its GTAO consumes its own normal/depth preparation and denoising path.

| Metric | Perspective-SSR checkpoint | Horizon AO |
| --- | ---: | ---: |
| Similarity | 0.976161 | 0.978290 |
| Color | 0.990256 | 0.990104 |
| Histogram | 0.941263 | 0.948232 |
| Luminance | 0.982774 | 0.982570 |
| Structure | 0.985362 | 0.987896 |
| Tone | 0.970893 | 0.976755 |

The display-space square floor-pool contrast improves from `0.084741` to `0.110573`, its ratio from `1.306642` to `1.459450`, and coherent-row fraction from `0.953586` to `0.987342`. Three's same-run floor contrast is about `0.136`, so a bounded gap remains, but the architectural pool is substantially more coherent and visible.

## Decision

Accept the depth-reconstructed horizon AO producer. It is heavier, independently owned, directly measurable, deterministic, and improves both the final score and the human-visible floor relationship without disturbing accepted lights, cascades, particles, temporal resolve, SSR, bloom, or output transform.

Do not raise AO with a scalar to match the fire regions; full and floor are already close to Three and such a gain would trade one region against another. A future BroMetal AO experiment should examine a small edge-aware denoise or Three's normal preparation while keeping radius `.5`, scale `2`, and the new observable target fixed.
