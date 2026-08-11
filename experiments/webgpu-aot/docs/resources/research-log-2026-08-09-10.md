# Heavy Sponza and Native Renderer Parity Research Log

## Continuation and accepted baseline

This log continues the [August 8–9 renderer-parity research](research-log-2026-08-08-09.md). Its starting point is the accepted TypeGPU indirect-AO capture, after exact analytic lights, exact particle structure, exact bloom, and Three.js's ACES/sRGB presentation had already replaced the earlier compensating approximations.

The synchronized heavy capture `/tmp/typegpu-indirect-ao` completed at `2026-08-09T20:42:58.318Z`, captured absolute frame 12, passed the harness, reported no shared-renderer pairs, and contained no browser or WebGPU issues. Moving TypeGPU's AO from a whole-scene final-composite multiplier to the forward shader's ambient and image-based-lighting term raised its same-run score from the exact-particle candidate's `0.937227` to `0.945809`. The neutral initialization of the AO target keeps the first frame valid; subsequent forward passes consume the preceding deterministic AO result while the current result is produced later in the frame.

The accepted five-way scores are:

* BroMetal AOT: `0.930398`;
* TypeGPU runtime: `0.945809`;
* TypeGPU-Antiky AOT: `0.932220`;
* WESL static: `0.929943`;
* Three.js native: `1.0` reference.

TypeGPU's score components were color `0.973084`, histogram `0.890084`, luminance `0.948694`, structure `0.966188`, and tone `0.934208`. The regional handoff below records TypeGPU first and Three.js second:

| Region | Mean luminance | Black fraction | Edge energy |
| --- | ---: | ---: | ---: |
| Full | `0.112360 / 0.136946` | `0.098266 / 0.050984` | `0.020853 / 0.022667` |
| Center | `0.151621 / 0.188217` | `0.084375 / 0.062351` | `0.030314 / 0.033381` |
| Floor | `0.162852 / 0.190123` | `0.039063 / 0.050521` | `0.026095 / 0.023472` |
| Left fire | `0.319462 / 0.341841` | `0 / 0` | `0.048784 / 0.055415` |
| Right fire | `0.138802 / 0.164403` | `0.060317 / 0.031349` | `0.036946 / 0.042078` |
| Upper gallery | `0.132548 / 0.147275` | `0.063889 / 0.010101` | `0.040770 / 0.043248` |

The left-fire mean is now close without the former oversized synthetic cores. The remaining error is distributed rather than one isolated bloom hotspot: TypeGPU is darker in every measured luminance region, and the upper gallery retains much more black coverage. A global exposure change is still a poor next lever because it would also raise the already-noisier floor edge energy. The next structural experiment is Three.js-equivalent temporal reconstruction.

## Verified Three.js TRAA contract

### Jitter sequence and sample count

Three.js constructs 32 Halton pairs but advances its jitter index modulo `length - 1`. The executed cycle is therefore exactly 31 steps: for cycle index `i` from 0 through 30, the view offset is `[Halton(i + 1, 2) - 0.5, Halton(i + 1, 3) - 0.5]` pixels. The 32nd generated pair is never selected. At `2560×1440`, equivalent clip-space offsets begin with `[0, -1 / (3 × 1440)]`, `[1 / (2 × 2560), 1 / (3 × 1440)]`, and `[-1 / (2 × 2560), -7 / (9 × 1440)]`, then repeat after 31 frames. Three applies the jitter before the render pipeline and restores the unjittered camera afterward.

TRAA explicitly requires MSAA to be disabled. Capture evidence agrees: the Three.js scene color, velocity, depth, `TRAANode.history`, and `TRAANode.resolve` resources all have `sampleCount: 1`. The renderer obtains subpixel coverage from the jitter/history sequence rather than resolving a multisampled scene first. There is no additional FXAA stage after TRAA.

### Why the measured velocity is zero

All 1,388 synchronized probe points in Three.js's `rgba16float` velocity texture had zero RGB and alpha one, including the full, floor, left-fire, right-fire, and upper-gallery regions. That result is expected for this capture rather than a broken attachment:

* the Sponza geometry and camera are static;
* animated lights change shading but do not move opaque geometry;
* the normal/velocity prepass sets `transparent = false`, so the moving additive particle billboards are excluded;
* TRAA gives the velocity node the saved unjittered projection matrix, preventing camera jitter itself from becoming apparent motion.

Three still jitters the beauty pass, so a zero velocity does not make TRAA inert: the same screen pixel accumulates different subpixel samples over the Halton cycle. It also means the moving transparent particles receive no particle-specific reprojection in the reference. A TypeGPU implementation may initially omit a physical velocity target and use a zero offset, but that is a benchmark-specific equivalence. Camera motion or moving opaque meshes would require a real velocity prepass and previous-transform state.

### Depth validity and resolve math

For each pixel, Three's resolve performs the following operations:

1. It loads the current depth over a `3×3` neighborhood and retains the closest depth, the closest sample's texel coordinate, and the farthest depth.
2. It loads velocity at that closest-depth coordinate, converts the NDC offset to UV with `[0.5, -0.5]`, and computes `historyUV = currentUV - offsetUV`.
3. It samples the previous depth at `historyUV`, reconstructs the previous view position with the previous inverse projection and camera-world matrix, transforms that position into the current view, and converts it back to current perspective depth.
4. History is in range only when both history-UV components lie in `[0, 1]`. An edge is `farthestDepth - closestDepth > 0.001`; a disocclusion is `closestDepth - previousDepth > 0.0005`. The exact validity expression is `validUV && (isEdge || !isDisocclusion)`.
5. It samples current color and history color, computes pixel motion length divided by `128`, and starts current-frame weight at `0.05`. Subpixel correction can add up to `0.25`; invalid history forces current weight to one. With the measured zero velocity, motion and subpixel correction are both zero, so valid history begins at `0.05` current and `0.95` history.
6. It computes first and second color moments over the current `3×3` neighborhood. The variance extent is standard deviation multiplied by `mix(0.5, 1, (1 - motion)^2)`, which is exactly `1` at zero motion. History RGB is clipped along the center-to-history ray into the resulting mean-plus/minus-variance AABB, with `1e-7` added to its extent to avoid division by zero.
7. Before the final blend, current and clipped-history colors are separately compressed by `1 / (max(r, g, b) + 1)`. Their luminance uses the standard `[0.2126, 0.7152, 0.0722]` coefficients, each temporal weight is divided by `luminance + 1`, and the weighted colors are renormalized with a `0.00001` denominator floor.

The resolved `rgba16float` color is copied into history after every frame. Current depth is likewise copied to the previous-depth texture when the dimensions match. On resize, Three initializes history from the current beauty texture instead of allowing a black history to fade into the image.

### Exact data-flow order

The relevant Three.js data flow is:

1. two cascaded directional-shadow passes;
2. opaque normal/velocity/depth prepass;
3. full-resolution GTAO and its denoising/temporal work;
4. main scene MRT, with AO applied through material indirect-light semantics;
5. TRAA of the raw scene color using scene depth and prepass velocity;
6. SSR from the raw scene color, scene depth, normal, and metal/roughness targets, followed by its blur;
7. addition of temporal scene color and blurred reflection;
8. five-level bloom sourced from that reflected scene;
9. addition of reflected scene plus bloom, followed by exposure-one ACES and sRGB presentation.

TRAA history therefore contains the scene result before SSR and bloom. SSR itself reads the untemporalized scene MRT; reflection is added after temporal resolve, and bloom sees the combined temporal scene plus reflection. Moving temporal resolve after reflection or bloom would be a different graph even if a screenshot happened to score well.

## Rejected TypeGPU-native temporal reconstruction

The evaluated candidate was renderer-owned and typed. It replaced the 4× MSAA scene resources and pipelines with single-sample attachments, wrote the exact 31-step Halton clip jitter through the existing frame uniform, retained `rgba16float` color history plus current/previous depth, and implemented the depth checks, `3×3` variance neighborhood, AABB clip, `0.05` minimum current weight, and luminance-weighted blend in a TypeGPU-authored full-screen shader. It specialized the measured velocity to zero, fed raw current HDR to SSR, fed temporal HDR plus reconstructed SSR to bloom and final composition, and removed FXAA.

The synchronized heavy capture `/tmp/typegpu-temporal` completed at `2026-08-09T21:05:05.820Z`. All five renderers reached ready state with zero reported errors, but TypeGPU regressed from the accepted indirect-AO score of `0.945809` to `0.941139`. Every measured regional mean moved down:

| Region | Accepted AO | Temporal candidate | Change |
| --- | ---: | ---: | ---: |
| Full | `0.112360` | `0.110833` | `-0.001527` |
| Center | `0.151621` | `0.148511` | `-0.003110` |
| Floor | `0.162852` | `0.162694` | `-0.000158` |
| Left fire | `0.319462` | `0.302157` | `-0.017305` |
| Right fire | `0.138802` | `0.136052` | `-0.002750` |
| Upper gallery | `0.132548` | `0.127638` | `-0.004910` |

This is a useful negative result. The candidate reproduced the relevant TRAA structure, but temporal resolve can only accumulate and constrain the samples it receives. TypeGPU's raw HDR, SSR, and PBR lighting distributions still differ from Three.js upstream. Replacing 4× MSAA with history reconstruction therefore smoothed or attenuated existing energy—most visibly around the zero-velocity moving fire particles—without creating the missing local illumination, reflection, or material response. A structurally correct copy of one downstream stage is not sufficient when its producer distribution is different.

The temporal candidate was rejected and removed, restoring the indirect-AO renderer as the accepted TypeGPU baseline. The exact Three.js TRAA contract and this measurement remain in the log so the same stage is not reimplemented as another unsupported polish guess. A future temporal attempt should follow an upstream PBR/SSR correction and must still address deterministic history reset, preceding-frame AO under jitter, and real velocity if the benchmark gains a moving camera or opaque geometry.

### Human visual ranking that triggered the BroMetal audit

Direct side-by-side review ranked BroMetal as the closest non-reference image, despite TypeGPU's higher aggregate similarity score. It also identified two conspicuously wrong reference cues: the upper-gallery lights did not illuminate enough of their surrounding architecture, and the square ground-light pool was missing. Both were spatial lighting/shadow/material-response gaps, not anti-aliasing defects. That observation became the measured BroMetal investigation recorded below rather than another final-composite adjustment.

## Implemented semantic particle comparator

The semantic particle comparator is now implemented and included in synchronized summaries. It identifies the latest additive, depth-no-write draw with 406 instances and six quad vertices or indices without depending on GPU object IDs or application labels. It decodes TypeGPU's direct `{position, radius, color}` storage records and Three.js's 406 transform matrices plus per-instance RGB vertex data. The two opposite-winding Three.js draws are treated as state variants, not two particle populations, and the comparison becomes unavailable rather than guessing when a probe is incomplete or the variants conflict.

The report splits the 256 fire and 150 curve records and calculates count, mean, RMS, p90, and maximum error for position, radius, and color. Behavioral coverage uses randomized GPU IDs, incomplete readback, and conflicting DoubleSide transforms so allocation order cannot silently select the evidence. In `/tmp/typegpu-temporal`, the comparator decoded all four candidate renderers and the Three.js reference without particle issues.

The current TypeGPU result confirms the precision boundary measured manually earlier. Fire-position error has mean `0.053761`, RMS `0.058251`, p90 `0.083952`, and maximum `0.113289`. Curve-position error has mean `0.000001` and maximum `0.000004`. RGB error is zero for both populations; radius mean is zero, with only a `0.000001` maximum in the fire population. Particle state is therefore no longer a plausible explanation for the remaining broad lighting differences. The comparator now provides that conclusion directly from executed frame data instead of manual matrix/storage arithmetic.

## Accepted BroMetal gallery-light and sun-cascade reconstruction

### Source truth recovered from the reference

The upper-gallery illumination is driven by eight deterministic curve-light records selected from workload sources `[256, 274, 293, 312, 331, 349, 368, 387]`. Each is a radius-four, intensity-four physical point light. Three.js applies inverse-square attenuation with a squared quartic cutoff, equivalent to `1 / distance² * clamp(1 - (distance / radius)⁴, 0, 1)²`. The earlier BroMetal image contained bright particle points in this area without feeding the surrounding stone the equivalent analytic radiance.

The floor cue was also reclassified. It is not a spotlight, projected cookie, or particle effect. It is direct, near-vertical sunlight passing through Sponza's overhead geometry. Three.js partitions that visibility through two fitted `4096×4096` cascaded shadow maps. BroMetal previously used one angled `2048×2048` directional shadow map, so both the light direction and the visibility partition were structurally wrong. This distinction prevented a plausible-looking but causally false spotlight patch from entering the benchmark.

### BroMetal-owned implementation

BroMetal now derives its upper analytic lights from renderer-local exact curve state and exact analytic fire state while retaining its own GPU buffers, generated shaders, and frame graph. A BroMetal-local shared `sun.ts` fact module keeps the sun direction, cascade matrices, and shader generation on one contract without sharing a renderer with another demo.

The directional path now owns two view-slice-fitted `4096×4096` cascades with the reference practical split `0.266061`. The shader selects and fades between cascades, samples a `3×3` PCF neighborhood, and applies fitted depth and slope bias. The prior `28%` minimum floor on direct-shadow visibility was removed, allowing geometry to fully block the sun and form the projected floor pool. The final `surfaceBalance` orientation compensation was also removed; the accepted result comes from the corrected light and shadow producers rather than a presentation-stage surface scalar.

### Capture progression and accepted result

The synchronized checkpoints `/tmp/brometal-csm-gallery-1`, `/tmp/brometal-csm-gallery-2`, and `/tmp/brometal-csm-gallery-3` scored BroMetal `0.932401`, `0.934340`, and `0.938886`, respectively. The final capture completed at `2026-08-09T22:04:07.454Z`; all five renderers reached ready state with zero reported errors. Relative to the pre-audit `/tmp/typegpu-indirect-ao` BroMetal baseline, similarity improved from `0.930398` to `0.938886`.

The canonical `artifacts/visual-comparison` refresh completed at `2026-08-09T22:17:04.289Z` after the telemetry correction. It also passed with all five renderers at synchronized frame 12 and zero reported issues. BroMetal scored `0.938776`; the `0.000110` difference from the accepted checkpoint is ordinary capture variation. Its status now reports 309 indexed geometry draws, and the semantic cue/particle conclusions below are unchanged.

Final regional mean luminance is:

| Region | BroMetal | Three.js |
| --- | ---: | ---: |
| Full | `0.125349` | `0.136949` |
| Center | `0.175474` | `0.188225` |
| Floor | `0.197995` | `0.190125` |
| Left fire | `0.282457` | `0.341861` |
| Right fire | `0.191154` | `0.164430` |
| Upper gallery | `0.131058` | `0.147292` |

The semantic cue metrics show why those broad regional means are insufficient by themselves. BroMetal upper-spill contrast is `0.241009` versus Three.js at `0.226774`, or `1.063×` reference; its local spill/control ratio is `4.7385` versus `3.7803`. Floor-pool contrast is `0.112743` versus `0.136009`, or `0.8288×`; its pool/ring ratio is `1.433689` versus `1.573393`, or `0.9112×`. The pool is spatially coherent on every measured BroMetal row (`1.0`) versus `0.995781` for Three.js. The upper cue is now slightly stronger than the reference, while the square floor cue is present and coherent but retains less local contrast.

The semantic particle report independently proves that all BroMetal curve-particle position, color, and radius deltas are exactly zero. BroMetal's fire visuals remain deliberately renderer-specific: against Three.js, fire position error has mean `0.309894`, RMS `0.408618`, p90 `0.686497`, and maximum `1.465363`; radius error has mean `0.010060` and maximum `0.140524`; color error is `2.681884`. Those comparator errors are documented design differences, not unexplained state corruption, and remain separate from the accepted gallery and sun reconstruction.

### Instrumentation growth and measured cost

The comparison report gained a dedicated `lightingCues` analysis module. It measures the upper illuminated alcove against the roof control above it and the perspective floor-pool interior against adjacent side rings, using trimmed display luminance and coherent-row coverage. This encodes the human observation as an output measurement rather than a shader-name or source-string test.

The first default capture after this addition exposed a particle-probe selection regression. Twelve label-matched buffers exhausted the default quota before the highest-value executed particle buffers were reserved, which left the Three.js particle reference unavailable even though the renderer was correct. Probe selection now reserves the highest execution-score buffers before filling remaining slots from label matches. The final capture reports the Three.js particle reference ready and all candidates comparable.

Canonical artifact verification exposed a smaller telemetry error after the cascades were accepted: BroMetal's status text still reported only the 103 main-scene primitive draws. It now derives `309 indexed geometry draws` from the primitive count and renderer-owned cascade count, covering the main pass plus both 103-draw shadow passes. A focused regression keeps that count coupled to the shadow configuration.

The accepted shadow graph has a clear cost. BroMetal tracked VRAM rose from `441.2 MiB` to `553.2 MiB`, exactly `112.0 MiB`; this matches replacing one `2048²` depth map with two `4096²` depth maps. The synchronized capture's reported BroMetal FPS moved from approximately `45.8` to `35.0`. That single capture is not a formal performance distribution, but it correctly records the expected cost of a second high-resolution shadow pass and map rather than presenting the quality gain as free.

### Remaining audited gaps

The accepted visual result does not close the BroMetal audit:

* alpha-masked primitives currently cast solid silhouettes because the shadow path does not sample material alpha;
* one-sided caster culling does not yet reproduce the reference shadow-side semantics;
* partially completed asynchronous allocation still needs explicit cleanup on failure;
* tests cover the recovered math and output cues but do not yet fully exercise real pipeline creation, bind-group construction, or cascade endpoint behavior.

These are retained as bounded follow-up work. The gallery radiance and sun-projected floor pool are accepted because they are source-causal, independently rendered by BroMetal, visible in the final image, and measured against the same-run reference; the remaining lifecycle, material-shadow, telemetry, and integration-test gaps should not be hidden by that acceptance.

## Human-eye similarity breakthroughs

The decisive methodological break was to treat human-recognizable spatial cues as the objective and the aggregate similarity score as supporting evidence. Direct review ranked the pre-audit BroMetal image as the closest non-reference result even while TypeGPU scored `0.945809` and BroMetal scored `0.930398`. The eye identified the missing upper-gallery spill and square floor pool, neither of which the aggregate score localized. Turning those observations into semantic cue measurements led to source-causal changes and raised BroMetal to `0.938886`; its accepted upper-spill contrast reached `1.063×` Three.js and its floor-pool contrast reached `0.8288×`. A renderer can win the scalar score while losing the scene's defining lighting relationships.

The enabling technical breakthrough was inspection of executed GPU state rather than inference from final pixels or feature names. Command and pipeline traces, generated WGSL, exact buffer bindings, write lineage, and intermediate-target readback made it possible to locate the producer of each visible cue. For example, all `1,388` sampled Three.js velocity texels were zero, while the pre-composite HDR mean in the exact-particle capture was already close (`0.060673` for TypeGPU versus `0.061347` for Three.js) even though final means were `0.109363` and `0.136949`. Those measurements separated the zero-valued velocity field from active subpixel accumulation and moved the remaining search downstream instead of prompting another lighting scalar.

Exact seeded state then connected what was visible to what illuminated the scene. Frame-12 buffer decoding and draw lineage tied the `406` particle instances to the analytic-light samples derived from the same deterministic fire and curve state. For accepted TypeGPU, curve-position error fell to a mean of `0.000001` and a maximum of `0.000004`, with zero RGB error. That closed particle and light state as explanations for the broad residual error and exposed the real differences in material response, effect scope, and presentation.

The particle inspection also overturned the assumption that Three.js used elaborate fire sprites. It renders `256` fire and `150` curve particles as plain, untextured square billboards, with no radial falloff, tapered core, or alpha discard. The polished appearance is created by the `31`-step TRAA cycle and the five-level bloom chain after those squares are rasterized. Reproducing invented soft cores would therefore match an impression while contradicting the reference producer; exact square structure plus exact bloom was retained even when the resulting `0.937227` score was below the earlier compensated `0.939951` candidate.

Effect placement mattered as much as effect math. Three.js applies AO only to indirect diffuse and indirect specular visibility. Moving TypeGPU's AO from a whole-scene final multiplier into its ambient and image-based-lighting term raised similarity from `0.937227` to `0.945809`, because direct sun, point lights, and emissive particles were no longer incorrectly darkened. Conversely, a structurally faithful TypeGPU TRAA experiment was rejected when it reduced the score from `0.945809` to `0.941139` and lowered every regional mean, including left fire by `0.017305`. Temporal reconstruction could only smooth the wrong upstream distribution; keeping that negative result prevents unsupported polish experiments from displacing producer work.

The square floor pool produced the same kind of causal correction. It is not a spotlight or cookie but near-vertical sunlight projected through Sponza's geometry. BroMetal needed two view-slice-fitted `4096×4096` cascades at the reference split `0.266061`, plus removal of the old `28%` visibility floor, so occluding geometry could fully block the sun. That reconstruction created the coherent square cue; a plausible spotlight patch would have hidden the actual shadow-visibility defect.

These gains preserve renderer independence. Reference facts such as deterministic seeds, light selection, and cascade fit can be recovered and reimplemented, but every demo retains its own buffers, shaders, pipelines, and frame graph. The accepted captures reported no shared-renderer pairs. This keeps a similarity gain attributable to the renderer under test rather than to shared rendering machinery.

The cross-renderer audit next selected WESL's wrong deterministic curve-state producer. Before the experiment, its curve-particle position mean error was `8.709`, its upper-gallery contrast was only `14.2%` of Three.js, and its similarity score was `0.929888`. WESL now owns a local `470`-record fixed-step simulation with the recovered seed order and curve construction; one renderer-owned rig advances once per frame and supplies both its `406` plain square particles and its `28` sampled analytic lights. Its point-light shader also uses inverse-square attenuation with the squared quartic cutoff instead of the old renderer-specific falloff. Production code does not import Three.js or share its renderer.

The synchronized heavy capture validated the causal prediction. WESL's GPU particle comparison went from a curve-position mean error of `8.709` to zero, with zero fire-position and RGB error and only the reporter's `0.000001` maximum fire-radius floor. Upper-gallery contrast rose from `0.032184` to `0.230373`, or from `14.2%` to `101.7%` of the same-run Three.js reference; its spill-to-control ratio reached `76.0%` of the reference. The aggregate similarity score moved only from `0.929888` to `0.930966`. This is a particularly useful result: a visually important spatial relationship improved by roughly sevenfold while the whole-frame scalar barely noticed.

The same capture bounds what remains. WESL's square floor-pool contrast is still only `33.6%` of Three.js and its coherent-row fraction is `28.0%`, so exact particle/light state did not repair the architectural sunlight cue. The next WESL experiment should therefore target its directional-sun and cascade visibility path, not compensate with exposure, bloom, or stronger gallery lights.

### WESL fitted-sun result

The next WESL experiment replaced the two nominal fixed shadow boxes with renderer-owned, camera-slice-fitted cascades while retaining WESL's statically linked shader graph and alpha-aware shadow material path. The sun is now near-vertical and shared by the fitted matrices and direct-light evaluation; the two `4096×4096` maps use the practical split `0.266061`, signed view-depth fading, `3×3` PCF, negative receiver biases, and a `0.015` normal offset. The old angled direction, Euclidean `10–15` cascade blend, fixed raster slope bias, `34%` direct-sun floor, and final `surfaceBalance` multiplier were removed. GPU capture observed two 103-draw cascade passes and two depth maps with zero fixed pipeline bias.

The synchronized heavy candidate completed frame `12` for all five demos with no issues. WESL floor-pool contrast rose from `0.045717` to `0.123319`, reaching `90.7%` of Three.js; its interior/ring ratio reached `98.0%`, and coherent-row coverage rose from `27.8%` to `100%`. Upper-gallery contrast was retained and improved to `109.9%` of Three.js, while all curve and fire particle position/color errors remained zero. Human inspection showed a coherent geometry-aligned floor pool with no visible cascade seam, acne, or artificial spotlight boundary.

The whole-frame score nevertheless fell from `0.930966` to `0.926187`, and full-frame display luminance fell from `0.127481` to `0.107517` against Three.js at `0.136946`. This is retained rather than hidden: the removed path had multiplied direct light by `[1.15,1.05,1]`, guaranteed at least `34%` sun visibility, and boosted near-vertical surfaces by `1.12`; the recovered sun radiance is `[0.2156,0.2627,0.3333] × 2` and can be fully occluded. The remaining darkness now exposes a separate upstream gap: Three.js uses the pinned HDR cube as both background and environment at intensity `1`, while WESL still substitutes a procedural hemisphere term. The next source-causal WESL experiment is diffuse/specular image-based lighting from those existing cube faces, not restoring the rejected multipliers or washing out the recovered floor shadow.

## Accepted WESL HDR environment reconstruction

### Breakthrough: the darker image was missing radiance, not polish

The fitted-sun experiment was an important diagnostic even though its aggregate score fell: removing the old direct-light floor and orientation gains exposed a separate source of energy that Three.js had always supplied. The reference loads the six pinned Radiance faces as both its visible background and material environment. WESL instead used a procedural hemisphere term, so its direct-light correction could never recover the missing rough diffuse response, view-dependent specular response, or background radiance. The breakthrough was to treat the remaining darkness as a missing producer and reconstruct that producer inside WESL rather than restoring the rejected sun multipliers or tuning final exposure.

Two renderer-owned approaches were considered. The smaller alternative was to upload the source cube and use ordinary hardware mip generation as a roughness approximation. The accepted approach performs the actual startup work: WESL decodes the six `256×256` RGBE faces locally, uploads an `rgba16float` source cube, and dispatches statically linked compute shaders to build a nine-mip GGX-prefiltered specular cube, a `32×32×6` cosine-convolved diffuse cube, and a `256×256` split-sum BRDF LUT. The source cube is also drawn as the HDR background. Material shading combines those products with the existing metallic/roughness inputs and applies ambient occlusion only to indirect lighting. No production code imports Three.js, TypeGPU, or another demo's renderer.

The persistent environment allocation is `7,913,456` bytes: `3,145,728` bytes for the source cube, `4,194,288` for the specular mip chain, `49,152` for diffuse irradiance, and `524,288` for the BRDF LUT. A `2,560`-byte aligned parameter buffer exists only while the eleven startup compute passes execute—nine specular mips, one diffuse convolution, and one LUT integration. Construction waits for submitted work, destroys that transient buffer, and exposes idempotent destruction for the persistent textures. The synchronized per-frame window contains the environment background draw but none of the prefilter dispatches, proving the convolution cost remains startup work rather than a hidden frame-by-frame workload.

### Browser validation failure and harness growth

The first browser candidate `/tmp/wesl-hdr-ibl-1` did not render. WebGPU correctly rejected the new background pipeline because it omitted `depth32float` state while executing inside WESL's forward pass, which already had a depth attachment. A regression was added before the correction; the background pipeline now declares the same depth format, disables depth writes, and uses `depthCompare: "always"`. The second focused capture completed with zero browser or WebGPU errors and showed populated source, specular, diffuse, and BRDF resources.

The default texture-probe matcher previously selected generic HDR and post-process targets but not names such as `prefiltered`, `convolved`, or `BRDF LUT`. It now includes environment-generation vocabulary. The observer sampled every source/diffuse cube face, the specular cube at representative mip levels `0`, `4`, and `8` across all six faces, and the spatially varying LUT. This closes a meaningful inspection gap: a final screenshot can no longer make an empty or partially generated environment look successful merely because later lighting happened to compensate.

Review caught a subtle overcorrection before commit: the initial case-insensitive `LUT` alternative also matched ordinary labels containing `lut`, including `resolution`. A failing negative regression now covers that case, and the matcher uses explicit non-alphanumeric LUT boundaries while retaining Three.js's `DFG_LUT`. The probe vocabulary became more informative without consuming the bounded probe quota on unrelated resources.

A full-suite run also exposed an intermittent Dawn null-backend readback when the two GPU test files created devices concurrently. The existing BRDF execution assertion was the failing regression; WESL's Vitest files now execute serially, retaining the nonzero GPU readback instead of weakening it to compilation-only coverage. Two subsequent full package runs passed all `39` tests.

### Accepted synchronized result

The five-way heavy capture `/tmp/wesl-hdr-ibl-all-1` completed at `2026-08-09T23:48:16.661Z`. Every renderer reached synchronized frame `12`, the report contained no issues or shared-renderer pairs, and WESL's particle comparison remained exact: all fire and curve position/color errors were zero, with only the reporter's `0.000001` maximum fire-radius floor.

After the feature commit, the canonical `artifacts/visual-comparison` refresh completed at `2026-08-10T00:04:04.584Z`. It passed with all five renderers ready at frame `12`, zero reported issues, and no shared-renderer pairs. WESL reproduced the checkpoint score and every listed canvas/cue metric exactly. Canonical probes again found nonzero samples on all six source and diffuse faces, all six specular faces at representative mips `0`, `4`, and `8`, and the BRDF LUT. This makes the result reproducible from the committed code rather than dependent on the pre-commit checkpoint.

WESL's similarity score rose from the accepted fitted-sun canonical baseline of `0.926159` to `0.956250`. Every component improved: color `0.967930→0.972871`, histogram `0.832869→0.915957`, luminance `0.940664→0.975773`, structure `0.950854→0.966223`, and tone `0.905589→0.919880`. This is a `0.030091` whole-frame gain from adding the missing upstream light transport, not from changing exposure or the final tone map.

The pre-composite evidence is stronger than the scalar score. WESL's forward HDR full-frame mean is `0.064132` versus Three.js raw scene HDR at `0.064693`; the floor means are `0.064751` and `0.064683`. WESL's upper-gallery raw mean remains lower at `0.085924` versus `0.101090`, but its final semantic spill/control ratio is `3.735430` versus `3.776364`, or `98.92%` of the reference. Upper-spill contrast is `0.244081` versus `0.226627`, or `107.70%`. The recovered square floor pool remains coherent on every sampled row; its contrast is `0.117016` versus `0.136010` (`86.03%`), and its interior/ring ratio is `1.442152` versus `1.573396` (`91.66%`).

Final display luminance also moved close without a neutral wash:

| Region | WESL HDR environment | Three.js |
| --- | ---: | ---: |
| Full | `0.138940` | `0.136946` |
| Center | `0.187328` | `0.188217` |
| Floor | `0.203600` | `0.190123` |
| Left fire | `0.248841` | `0.341841` |
| Right fire | `0.170573` | `0.164403` |
| Upper gallery | `0.155495` | `0.147275` |

Tracked WESL memory is now `631.1 MiB`, approximately `7.55 MiB` above the fitted-sun baseline and consistent with the persistent environment allocation. The synchronized capture reached frame `12` in `5.42 s` versus Three.js at `8.88 s`; its single-capture telemetry reported approximately `22.14 FPS` versus `5.69 FPS`. Those timings are recorded as workload evidence, not a performance distribution.

### What remains different

The environment reconstruction is accepted because the implementation is native, its intermediate resources are populated, raw HDR production nearly matches the same-run reference, the semantic lighting cues improve, and the full-frame score rises substantially. It does not make the two frame graphs identical. WESL still uses single-frame FXAA, one reconstructed SSR target, and quarter-resolution Gaussian bloom; Three.js uses 31-step TRAA, roughness-aware SSR blur, and a five-level bloom pyramid. Human inspection still shows sharper, stronger red floor reflections in WESL, while its final left-fire mean remains `27.2%` below Three.js. Those are now bounded downstream reflection, temporal, and bloom-distribution gaps. They should be investigated from intermediate targets rather than by changing the neutral environment gains that produced the accepted upstream match.

The cohesion review separated the Radiance decoder, exact-face validation, and half-float conversion into a CPU data module, leaving GPU allocation, pipeline construction, dispatch, and lifetime in the environment module. Remaining engineering follow-ups are renderer-wide transactional cleanup when initialization fails after multiple subsystems have allocated resources, and a small real-Dawn cube convolution readback; current Dawn coverage compiles both cube pipelines and executes the BRDF LUT, while the browser capture proves the six-face and mip outputs.

## TypeGPU-Antiky exact particle and point-light reconstruction

### Breakthrough: the elaborate flames were compensating for a weak consumer

Human comparison selected TypeGPU-Antiky's fire as the clearest remaining structural mismatch. The canonical image used large, irregular, white-hot tapered lobes, while GPU tracing showed that Three.js actually renders `256` fire and `150` curve records as plain untextured squares. Antiky's apparent flame detail came from two independent inventions: its CPU producer replaced part of the fire population with oversized multicolored cores, and its AOT particle shader tapered, stretched, perturbed, radially faded, and discarded fragments. The semantic comparator quantified the same problem: fire-color mean error was `0.482755` with maximum `6.983455`, fire-radius mean error was `0.004160` with maximum `0.082663`, and curve-position mean error was `0.158922` with maximum `0.395723`.

Three implementation directions were considered. Importing the Three.js or WESL producer would be smallest but would invalidate renderer independence. Adding a new Antiky compute simulation would preserve independence but expand the compiler and frame graph without evidence that GPU execution itself affected the image. The accepted design is an Antiky-owned `470`-record fixed-step CPU simulation hidden behind one stable rig. The renderer advances that rig once per frame, then uploads its `406` billboard records and its bounded analytic-light records from the same state. The TypeGPU-authored particle shader is still compiled through Antiky at build time, but now emits the packed RGB through one square, additive, depth-tested billboard with no procedural core or fragment discard. Production code imports no other demo.

The first synchronized candidate `/tmp/antiky-exact-producer-all-1` completed at `2026-08-10T00:19:54.741Z` with every renderer ready and no browser or WebGPU errors. It proved exact particle state: fire and curve position and color errors became zero, curve-radius error became zero, and only the comparator's `0.000001` maximum fire-radius floor remained. It also failed the visual threshold: Antiky fell from the canonical `0.932220` score to `0.894705`, and upper-spill contrast moved only from `0.076458` to `0.081760`. This negative checkpoint revealed that the old cores were supplying energy which Antiky's material-light consumer failed to produce correctly; exact inputs alone made that missing consumer visible.

Inspection of the generated forward WGSL found two causal errors. Antiky used a renderer-specific `range² / (1 + distance² × k)` point falloff and multiplied the combined sun, point-light, and ambient result by directional shadow visibility. The corrected AOT shader applies the reference inverse-square, squared quartic-cutoff attenuation to point lights and keeps them outside the directional-shadow term. It also removes `antikySurfaceBalance`, an orientation presentation gain that multiplied vertical surfaces by `1.25` while reducing upward surfaces to `0.82`. The change was driven by intermediate evidence rather than a final exposure target: after physical point attenuation, vertical regions were high while the floor was low in almost exactly that direction.

The stabilized synchronized candidate `/tmp/antiky-exact-physical-all-2` completed at `2026-08-10T00:28:15.926Z`. All five renderers reached frame `12`, the report contained no issues or shared-renderer pairs, and Antiky passed the visual threshold at `0.910008`. The aggregate score remains below the compensated canonical baseline, but the upstream result is substantially more truthful. Antiky's forward-HDR luminance now measures `0.060135 / 1.550002 / 0.089030 / 0.056303` for full, left-fire, upper-gallery, and floor regions; Three.js measures `0.064693 / 1.666285 / 0.101090 / 0.064683`. Every listed Antiky producer region is therefore within approximately `7–13%` of the reference before post-processing.

The spatial output also bounds the next work. Upper-spill contrast rose from `0.076458` to `0.307269`, or from `33.7%` to `135.6%` of Three.js, while its spill/control ratio reached `75.1%`. The square floor-pool contrast rose from `0.052726` to `0.068249`, but remains only `50.2%` of Three.js and coherent-row coverage is `42.6%` versus `99.6%`. Final Antiky display luminance is still too high in the upper gallery even though its raw upper HDR is lower than Three.js, isolating a downstream reconstruction/bloom distribution difference. The next source-causal Antiky experiment should first replace its angled static sun visibility with the fitted near-vertical cascade contract to recover the missing architectural floor cue; afterward, intermediate history and bloom targets—not particle intensity or exposure—should explain the remaining final-image excess.

Regression coverage now checks all `470` authoritative records at frames `0`, `12`, and the Float32-sensitive frame `828`, every packed billboard and sampled analytic record, stable one-update-per-frame behavior, exact quartic attenuation, separation of point and shadow terms, the plain fragment return, and source-to-checked-generated artifact identity. Dawn compiles all seven generated render pipelines through an explicit null-backend fallback when the default adapter is unavailable.

After commits `2841c25` and `3b655bc`, the canonical `artifacts/visual-comparison` refresh completed at `2026-08-10T00:38:22.081Z`. It reproduced the accepted candidate with every renderer synchronized at frame `12`, no reported GPU/browser issues, no shared-renderer pairs, and an Antiky score of `0.910021`. Particle state remained exact apart from the comparator's `0.000001` fire-radius floor. Upper-gallery contrast remained `0.307269`; floor-pool contrast remained `0.068249` with `0.426160` coherent-row coverage; and the forward-HDR full, left-fire, upper-gallery, and floor means remained `0.060135 / 1.550002 / 0.089030 / 0.056303`. The committed-code capture therefore confirms both the producer correction and the downstream sun/post-processing boundary described above.

## BroMetal washed-out output-transform audit

### Breakthrough: "washed out" described a local chroma error, not a global lift

Human review identified BroMetal as slightly washed out beside Three.js after its gallery-light and cascade reconstruction. The first useful result was that the description did not map to a single global brightness statistic. In the pre-change canonical capture, BroMetal was darker overall than Three.js: full-frame mean luminance was `0.125349` versus `0.136949`, median luminance was `0.090464` versus `0.108970`, and black coverage was `0.102578` versus `0.050828`. Raising exposure globally would therefore brighten an already uneven distribution without addressing the perceived color cast.

The local floor measurements did match the observation. BroMetal's floor mean was already `0.197995` versus Three.js at `0.190125`, but its mean saturation was only `0.372790` versus `0.514489`, a `27.5%` deficit. Its mean floor RGB was `[0.280208, 0.174327, 0.190366]` versus `[0.315756, 0.157489, 0.143482]`. Relative to red, BroMetal carried approximately `24.7%` too much green and `49.5%` too much blue. The image could therefore be globally darker and still look locally milkier and less chromatic.

Intermediate-target inspection separated producer state from presentation. BroMetal's raw reflected-HDR floor was already `14.0%` brighter than the Three.js scene target, with green and blue approximately `25–27%` high while red was only `2.7%` high. SSR added only about `1.9%` floor luminance. The dominant correctable presentation error came afterward: BroMetal used a scalar ACES approximation, black subtraction, contrast, vignette, grain, a `pow(1 / 2.2)` transfer approximation, and finally multiplied display-encoded RGB by `[1.0, 1.22, 1.5]`. That last grade amplified the existing green/blue imbalance instead of representing a renderer-specific lighting fact.

Two bounded corrections were evaluated. Merely removing or retuning the channel grade was the smallest textual patch, but it would retain the wrong transfer curve and the unrelated vignette, grain, and black-level adjustments. The accepted implementation instead keeps the work entirely inside BroMetal while reproducing Three.js `0.185.1`'s matrix ACES fit and piecewise sRGB OETF. Both renderers present to `bgra8unorm`, so an explicit OETF is required. BroMetal removes the empirical grade, vignette, grain, and black subtraction, but retains one explicit renderer-owned exposure value because matching the transfer function does not imply that the upstream HDR distributions have equal energy.

An exact exposure-one trial demonstrated that distinction. `/tmp/brometal-reference-output-1` completed at `2026-08-10T00:52:02.299Z`; it used the recovered ACES/OETF with exposure `1.0`, but BroMetal's score fell to `0.922525` and full-frame mean luminance rose to `0.159228`. That candidate was rejected rather than calling numerical identity with the reference an improvement. The accepted trial `/tmp/brometal-reference-output-08` completed at `2026-08-10T00:54:58.789Z` with exposure `0.8` and scored `0.945354`.

| Measurement | Previous canonical | Accepted `0.8` | Three.js in accepted run |
| --- | ---: | ---: | ---: |
| Similarity score | `0.938886` | `0.945354` | reference |
| Full mean luminance | `0.125349` | `0.133757` | `0.136949` |
| Full mean saturation | `0.470753` | `0.505228` | `0.478705` |
| Floor mean luminance | `0.197995` | `0.203954` | `0.190125` |
| Floor mean saturation | `0.372790` | `0.478010` | `0.514489` |
| Center mean luminance | `0.175474` | `0.186319` | `0.188225` |
| Center mean saturation | `0.589340` | `0.636497` | `0.647027` |

Every aggregate component improved in the accepted trial: color `0.969426→0.980883`, histogram `0.858178→0.858476`, luminance `0.961469→0.968133`, structure `0.960389→0.966575`, and tone `0.915450→0.916588`. The floor saturation gap contracted from `27.5%` to `7.1%`; the floor green/red and blue/red errors contracted to approximately `13.1%` and `11.8%`. Human inspection agreed with the measurements: the blue-gray veil was removed while the scene retained the recovered gallery spill and square architectural sun pool.

The invariant checks are as important as the score. Baseline and candidate raw deferred-HDR and reflected-HDR report objects are equal, proving that the correction did not alter gallery-light state, two-cascade shadows, AO, SSR, bloom inputs, particle state, or material lighting. All five renderers reached synchronized frame `12`, reported no issues, and produced no shared-renderer pair. BroMetal retained `309` indexed draws, `474` lights, exact curve-particle parity, upper-spill contrast at `97.16%` of Three.js, and floor-pool coherent-row coverage at `99.15%` of Three.js.

The accepted result does not justify treating the final transform as a universal correction. BroMetal's floor mean remains `7.3%` high, and its right-fire mean and p90 remain approximately `24.9%` and `34.7%` high. Those residuals are spatially local and should be traced through material lighting or bloom rather than hidden by restoring a channel grade. Likewise, removing grain theoretically removes display dithering, but the browser capture showed no banding regression.

This audit also exposed instrumentation gaps worth addressing before the next color-stage investigation. General display metrics still include the `45`-pixel letterbox while semantic lighting cues crop to the measured active frame; the broad metrics are computed from a `320×200` reduction and have no explicit midtone/chroma-band statistic. The current texture probes observe sparse samples and final resource state, BroMetal's threshold target label is later reused by a vertical blur pass, and there are no isolated AO, pre-tone-map, post-tone-map, post-OETF, or post-FXAA targets. A shared stage ontology and explicit output-transform probes would make the next diagnosis less dependent on reconstructing lifetime from command traces.

Regression coverage checks deterministic source-to-generated shader identity, the recovered ACES matrices, exact sRGB branch, absence of the rejected presentation effects, and the renderer's exact Float32 settings payload `[0, 0.8, 2560, 1440]`. Dawn's available null backend validates compilation but does not produce meaningful raster output, so the synchronized browser capture remains the behavioral gate. Commit `6119274` records the renderer-owned correction.

After commits `6119274` and `983b6d6`, the canonical `artifacts/visual-comparison` refresh completed at `2026-08-10T01:09:07.305Z`. Every renderer reached synchronized frame `12`, all issue lists were empty, no shared-renderer pair was detected, and the report passed. BroMetal reproduced the candidate's regional values exactly and scored `0.945200`; the `0.000154` difference from the temporary checkpoint is capture variation. Full-frame mean luminance remained `0.133757` versus Three.js at `0.136944`, floor saturation remained `0.478010` versus `0.514512`, and center luminance remained `0.186319` versus `0.188214`. Upper-spill contrast remained `97.18%` of the same-run reference; floor-pool contrast remained `82.39%`, with `99.15%` of the reference's coherent-row coverage. The capture retained `309` indexed draws, `474` lights, zero curve-particle position/color/radius error, and the documented renderer-specific fire differences. The canonical artifacts therefore confirm that the committed presentation correction removed the chroma wash without changing BroMetal's accepted independent lighting workload.

## TypeGPU-Antiky fitted sunlight and multiscale-post boundary

### Breakthrough: the square floor light is transmitted sunlight, not another emitter

The next TypeGPU-Antiky experiment targeted the strongest remaining spatial mismatch after its exact particle and point-light reconstruction. Three.js contains no spotlight, projected cookie, or rectangular lamp capable of drawing the bright square on the floor. The feature is direct near-vertical directional light transmitted and occluded by Sponza's architecture. Antiky instead used two static angled shadow boxes, selected cascades by Euclidean camera distance, sampled one comparison texel, and guaranteed at least `32%` direct-sun visibility. Its shadow camera, BRDF sun direction, and visibility floor therefore could not produce the same architectural relationship even when all particles and analytic lights were exact.

Commit `e198b0b` replaces that path with an Antiky-owned fitted two-cascade contract. The renderer still compiles and consumes its own AOT artifacts; it does not import another demo's renderer or shadow implementation. Both `4096×4096` cascades fit camera-frustum slices around the practical split `0.266061`, share the recovered near-vertical sun with the material shader, use signed view-depth fade overlap, negative receiver biases, a `0.015` normal offset, and `3×3` comparison filtering. The old fixed raster bias and `32%` direct-light floor are gone. Back-cull and no-cull pipeline variants preserve the package's material-sidedness distinction.

The first synchronized candidate `/tmp/antiky-fitted-sun-1` completed at frame `12` with no browser or WebGPU errors and preserved exact particle state. The semantic floor detector changed from a weak, broken patch into a coherent architectural pool on every sampled row. Its floor contrast rose from `0.068249` to `0.175506` against Three.js at approximately `0.136`, and coherent-row coverage rose from `0.426160` to `1.0`. The overshoot was useful: it proved the light's geometric cause and bounded the remaining problem downstream. Antiky still produced less raw forward radiance than Three.js in the full frame, floor, and upper gallery, yet its final floor was too contrasty. Stronger sun or another fake lamp would have made the causal model worse.

### Breakthrough: Three.js particle polish is temporal and multiscale, not a fancy flame fragment

GPU tracing established that Three.js's visible fire records are solid, untextured additive squares. Their smooth, persistent glow is created later: single-sample jittered TRAA resolves the scene, SSR is added, and a five-level bloom pyramid distributes highlights across progressively larger kernels. Three.js extracts luminance with Rec.709 coefficients and `smoothstep(1, 1.01, luminance)`, blurs full-, half-, quarter-, eighth-, and sixteenth-resolution levels with radii `[6,10,14,18,22]`, then combines them with weights `[0.179496,0.143748,0.108,0.072252,0.036504]`. The final presentation uses matrix ACES at exposure `1` and the piecewise sRGB OETF. It does not apply Antiky's vignette, grain, scalar ACES approximation, power-law gamma, black subtraction, or empirical RGB grade.

The Antiky checkpoint now owns eleven bloom targets and eleven ordered passes: one bright extraction and five horizontal/vertical pairs. The same AOT bloom artifact retains a bounded unit-direction branch for SSR reconstruction, while its multiscale branch uses the recovered extraction and kernel contract. The composite samples all five vertical levels and applies the exact matrix ACES and piecewise sRGB transfer at exposure `1`. Bloom is excluded from temporal history. Static resource bindings remain complete for every AOT bind group, including the otherwise-unused reflection binding in SSR blur groups, and the vertical SSR pass never samples its own render attachment.

The synchronized heavy capture `/tmp/antiky-five-bloom-1` completed at `2026-08-10T01:48:34.085Z`. All five demos reached frame `12`; issue lists and shared-renderer pairs were empty. The recovered floor structure survived and moved close to the same-run reference: contrast was `0.127706` versus approximately `0.1360`, or `93.9%`, and coherent-row coverage was `0.995781`. This is a meaningful human-eye gain even though the aggregate Antiky score fell from the fitted-sun checkpoint to `0.885363`. The score components were color `0.947802`, histogram `0.732314`, luminance `0.893786`, structure `0.938649`, and tone `0.898581`.

### Negative result: exact presentation exposed a missing upstream producer

The post checkpoint is deliberately recorded rather than tuned away. Antiky's final full-frame mean luminance became approximately `0.084` against Three.js at `0.137`, and inspection showed unnaturally black side pillars and masonry. Its raw forward HDR was already low before the exact output transform: approximately `0.052390 / 0.047338 / 0.083991` for full, floor, and upper-gallery means, against Three.js near `0.064690 / 0.064662 / 0.100904`. Raising exposure or restoring the rejected blue channel grade would brighten the symptom while leaving the missing light transport unimplemented.

Source inspection found the missing producer. Three.js shades materials with the pinned HDR cube through diffuse irradiance, roughness-prefiltered specular radiance, and a split-sum BRDF response. Antiky still substitutes a small procedural hemisphere term and has no environment cube, diffuse convolution, specular mip chain, or DFG approximation. It also multiplies the entire composed HDR scene by screen-space AO, incorrectly attenuating direct sun, point lights, and additive particles along with indirect lighting. The exact post transform did not make Antiky worse in an unexplained way; it removed compensation and made these upstream gaps observable.

The next controlled experiment is therefore an independently authored Antiky environment module plus indirect-only AO placement. Two implementation scales were compared. Extending the Antiky compiler with compute artifacts would enable runtime GGX convolution and a generated BRDF LUT, but it is a broad compiler feature. The smaller first checkpoint decodes the six pinned RGBE faces locally, uploads a nine-mip `rgba16float` cube with a deterministic CPU-built mip chain, and evaluates an analytical split-sum environment response in the existing AOT forward artifact. This preserves the package boundary, adds the missing producer with a deep local interface, and gives the comparison harness intermediate cube/mip evidence. If that checkpoint leaves a roughness-distribution gap, native compute prefilter support remains a measured follow-up rather than an assumed prerequisite.

The current multiscale graph also remains intentionally bounded rather than falsely labeled exact. Three.js blooms `TRAA(scene) + SSR`, whereas the Antiky checkpoint blooms raw HDR plus SSR; Antiky's temporal history still includes AO and SSR; Gaussian coefficients are evaluated in the fragment shader instead of uploaded as CPU-generated Float32 weights; and the weighted five-level sum is folded into final presentation instead of written by a separate bloom-composite pass. These workload differences are now explicit inspection targets. They should be corrected only when intermediate probes show that they dominate after environment lighting and AO ownership are fixed.

### Box-filtered environment checkpoint: enormous visual gain, one missed upstream gate

The first Antiky environment checkpoint deliberately avoided changing the AOT compiler. Antiky locally decodes the six pinned `256×256` RGBE faces in `px,nx,py,ny,pz,nz` order, constructs a deterministic box-filtered mip chain through `1×1`, encodes every level as `rgba16float`, and uploads one renderer-owned cube with nine mips. Its AOT forward artifact samples the same cube at a broad diffuse LOD and at `roughness×8` for specular radiance. Reflection bends toward the normal by `roughness⁴`, and an analytical split-sum response includes single and multiple scattering with dielectric `F0=.04`. Gains remain exactly neutral. The old view-independent hemisphere constants are absent.

This is intentionally not described as a physical GGX prefilter. The alternative design extends the Antiky compiler with compute artifacts and builds separate cosine diffuse, GGX specular, and DFG resources at startup. The smaller mip experiment was run first to measure whether compiler expansion was causally necessary rather than assumed.

The synchronized heavy capture `/tmp/antiky-box-ibl-1` completed at `2026-08-10T02:08:27.826Z`. Every renderer reached frame `12`, all issue lists were empty, no shared-renderer pair was detected, and the report passed. The observer found all six environment faces at representative mips `0`, `4`, and `8`: all `18` probed subresources had an active fraction of `1`. The synchronized frame contained no compute dispatch. The persistent cube uses exactly `4,194,288` bytes, moving Antiky's tracked allocation from approximately `758.6` to `762.6 MiB`.

The whole-frame result is the largest Antiky gain in this study so far. Similarity rose from the five-level-post checkpoint's `0.885363` to `0.975176`. Every component became strong: color `0.989798`, histogram `0.945696`, luminance `0.981880`, structure `0.972718`, and tone `0.968662`. Human inspection agreed: the formerly black side pillars and upper masonry gained the neutral, textured indirect response visible in Three.js, while the recovered square floor pool and exact particles remained in place.

| Region | Antiky raw forward HDR | Three.js raw scene HDR | Relative error |
| --- | ---: | ---: | ---: |
| Full | `0.069207` | `0.064693` | `+6.98%` |
| Floor | `0.067083` | `0.064683` | `+3.71%` |
| Upper gallery | `0.095529` | `0.101090` | `-5.50%` |
| Left fire | `1.560989` | `1.666285` | `-6.32%` |
| Right fire | `0.157274` | `0.138249` | `+13.76%` |

The final display is correspondingly close without exposure or channel tuning. Full-frame luminance is `0.140592` versus Three.js at `0.136946`; center is `0.196705` versus `0.188217`; floor is `0.204046` versus `0.190123`; upper gallery is `0.153056` versus `0.147275`; left fire is `0.367003` versus `0.341841`; and right fire is `0.173347` versus `0.164403`. Full-frame black coverage is `0.038797` versus `0.050984`, closing the previously obvious missing-radiance symptom.

The sunlight cue also remained causal. Floor-pool coherent-row coverage is `0.995781`, exactly equal to the same-run Three.js value. Antiky floor contrast is `0.112825` versus `0.136010`, and its interior/ring ratio is `1.408379` versus `1.573396`. Upper-gallery contrast is `106.49%` of Three.js and the spill/control ratio is `103.88%`. The environment lifted the control architecture as well as the emitters instead of simply making already-correct lights stronger.

This checkpoint narrowly misses the predeclared raw full-frame gate of ±`5%`: it is `6.98%` high. It is therefore retained as an excellent visual and architectural checkpoint, not proof that ordinary cube mips are equivalent to PMREM. The next controlled candidate should replace only the environment producer with independently compiled startup convolution while holding the fitted sun, particle buffers, bloom plan, composite shader, exposure, and all neutral gains byte-for-byte. Acceptance should compare that candidate against the `0.975176` result rather than assuming a more physically elaborate workload will necessarily look closer. The strongest remaining visible difference is Antiky's brighter, sharper red floor reflection and highlight persistence, which may ultimately belong to its single-frame SSR/temporal ordering rather than environment filtering.
