# Native Antiky Environment and Visual-Parity Research Log

## Continuation and accepted baseline

This log continues the [August 9–10 renderer-parity research](research-log-2026-08-09-10.md). The handoff baseline is the TypeGPU-Antiky box-filtered HDR environment checkpoint in `/tmp/antiky-box-ibl-1`, captured at `2026-08-10T02:08:27.826Z`. All five renderers reached synchronized frame 12, every issue list was empty, no shared-renderer pair was detected, and the report passed.

The checkpoint raised Antiky from the exact-post result of `0.885363` to `0.975176`. Its component scores were color `0.989798`, histogram `0.945696`, luminance `0.981880`, structure `0.972718`, and tone `0.968662`. Exact fire and curve position/color state, the fitted near-vertical two-cascade sun, the coherent floor pool, the five-level bloom plan, and the neutral Three.js ACES/sRGB presentation all remained in place.

That result was visually strong but not declared equivalent to Three.js PMREM. The ordinary cube mip chain missed the raw full-frame HDR acceptance gate: Antiky produced `0.069207` against Three.js at `0.064693`, or `6.98%` high. The right-fire HDR region was `13.76%` high, and human inspection still showed a brighter, sharper red reflection across the floor. The controlled follow-up was therefore a native Antiky startup prefilter, measured against `0.975176` rather than presumed superior.

## What actually produced the human-eye convergence

The progress did not come from one global exposure or a single copied Three.js shader. It came from a sequence of causal corrections, each implemented independently inside the renderer being tested.

First, executed GPU state replaced visual guesswork. The harness now records pipeline descriptors, draw and dispatch dimensions, exact bind-group resources, buffer-write lineage, decoded generated layouts, intermediate texture statistics, semantic particle parity, and lighting-cue measurements at one synchronized absolute frame. That evidence overturned several plausible but wrong assumptions: Three.js fire particles are plain square billboards rather than procedural flame sprites; its square floor pool is occluded near-vertical sunlight rather than a spotlight; and its polished particle appearance is produced downstream by temporal accumulation and multiscale bloom.

Second, visible emitters and analytic lights were made to share one deterministic source of truth inside each demo. The fixed-step fire and curve state now drives both the `406` particle records and the sampled analytic lights rather than allowing an approximate visible path and an unrelated lighting path to drift apart. This was especially important in the upper gallery: exact points without matching physical light positions, ranges, colors, and attenuation looked decorative but did not illuminate the masonry around them.

Third, human-recognizable spatial relationships became explicit measurements. The upper-gallery spill/control ratio and the floor-pool interior/ring contrast localized errors that the aggregate image score could not explain. BroMetal originally looked closest to the eye while scoring below TypeGPU; measuring the missing gallery spill and floor pool led to its deterministic curve lights and fitted cascades. WESL's exact light producer raised its upper-spill contrast by roughly sevenfold while barely changing the whole-frame scalar. These results established that the scalar score is an acceptance signal, not the research question by itself.

Fourth, effect placement was treated as part of the rendering contract. Applying AO to an entire composed scene is not equivalent to applying it only to indirect diffuse and indirect specular. Blooming raw HDR is not equivalent to blooming temporal scene plus SSR. A correct transfer curve cannot repair missing HDR radiance, and a temporal resolve cannot manufacture illumination that its input never contained. Several visually plausible candidates were rejected because their stage ordering or producer distribution was wrong even when one local cue improved.

Fifth, missing environment radiance was separated from final grading. Antiky's exact ACES/sRGB checkpoint made the side pillars unnaturally black and scored `0.885363`; raising exposure would only have hidden the missing indirect producer. Adding the six pinned HDR faces with neutral gains restored material-dependent diffuse and specular response and produced the largest Antiky gain in the study, to `0.975176`. The breakthrough was identifying what energy was absent, not finding a stronger final multiplier.

The cumulative implementation remains a valid renderer comparison. BroMetal, TypeGPU, TypeGPU-Antiky, WESL, and Three.js still own separate buffers, shaders, pipelines, frame graphs, and resource lifetimes. Reference facts were reverse engineered and reimplemented locally; production renderers were not shared.

## Build-time compute artifacts removed the experiment blocker

The box-mip checkpoint left one honest technical question: would a more faithful diffuse convolution, GGX prefilter, and split-sum lookup improve the already-close image? TypeGPU-Antiky could previously compile only paired vertex/fragment artifacts, so answering that question required a general but bounded compiler capability before changing the renderer.

Commit `7e29034` added discriminated render and compute artifacts to the TypeGPU-Antiky package. Existing `defineShader` callers remain render artifacts; `defineComputeShader` accepts one compute entry point and compute-visible resources. Validation now understands compute-only entry points, storage textures, workgroup attributes between `@compute` and `fn`, and stage-appropriate binding visibility. Runtime helpers construct compute pipelines while preserving the existing render pipeline API. All seven render artifacts were regenerated through the new discriminator so the change exercised both sides of the contract rather than leaving render compatibility implicit.

This infrastructure is retained even though the first visual consumer described below was rejected. It is renderer/package infrastructure, not a hidden shared runtime, and it enables future independently compiled startup or simulation workloads without shipping TypeGPU's authoring runtime in the production demo.

## Controlled native environment candidate

### Design and invariants

The candidate changed only Antiky's environment producer and forward environment bindings. It held the fitted sun, particle and analytic-light buffers, AO/reflection/bloom/composite artifacts, exposure, neutral gains, camera, synchronized frame, and presentation path constant.

Antiky locally decoded the same six pinned `256×256` RGBE faces. Three independent AOT compute artifacts then produced:

* a nine-mip `rgba16float` specular cube using 64 GGX samples per output;
* a `32×32×6` `rgba16float` cosine-convolved diffuse cube using 64 samples per output;
* a `256×256` `rgba16float` split-sum BRDF LUT using 128 samples per output.

The startup graph submitted 11 compute passes: nine specular mip dispatches, one diffuse dispatch, and one LUT dispatch. Nine 256-byte roughness parameter records occupied a transient 2,304-byte buffer. Construction awaited `queue.onSubmittedWorkDone()` before destroying the source cube and parameter buffer. Persistent environment storage was `4,767,728` bytes: `4,194,288` for specular, `49,152` for diffuse, and `524,288` for the LUT. No environment compute dispatch appeared inside the synchronized rendered-frame window.

The forward artifact sampled diffuse at LOD zero, specular at `roughness×8`, and the LUT in its generated coordinate convention. It retained the reference roughness-fourth-power bend from reflected direction toward the surface normal and the existing split single/multiple-scattering response. No production module imported Three.js, WESL, TypeGPU runtime, or another demo renderer.

The regression suite covered the pinned face size and order, malformed/truncated RGBE input, resource descriptors and exact byte accounting, all 11 dispatches, queue-completion ordering, transient and partial-failure cleanup, idempotent destruction, deterministic generated artifacts, every render and compute pipeline in Dawn, and a nonzero BRDF readback when an executing adapter was available. Before capture, the Antiky package passed 39 tests, type checking, root type checking, and its production build.

### First capture exposed an observer lifetime bug

The first synchronized attempt, `/tmp/antiky-native-ibl-1`, reached ready state inside Antiky but failed the comparison report. The observer had selected the labeled decoded source cube as a probe target when it was created, then attempted to copy from it after the renderer correctly destroyed it at the end of startup. WebGPU reported:

> Destroyed texture [Texture "Antiky decoded HDR source cube"] used in a submit

This was not an Antiky rendering failure; it was an evidence-lifetime failure in the inspection harness. A texture can be interesting at creation time and intentionally unavailable by the synchronized frame. Treating every selected record as live caused the observer itself to introduce a validation error.

A failing tooling regression was added before the correction. Commit `031a2ef` makes texture probing skip records whose captured lifetime has ended while retaining their descriptor, allocation, write, and destruction telemetry. The complete tooling suite now exercises live, explicitly live, and destroyed targets. This grows the harness in the direction required for startup-generated workloads: persistent products are probed at frame 12, while transient inputs remain auditable without being illegally resubmitted.

### Successful capture and populated-resource evidence

The corrected synchronized capture `/tmp/antiky-native-ibl-2` completed at `2026-08-10T02:53:59.252Z`. All five demos reached frame 12, all issue lists were empty, no shared-renderer pair was detected, and the report passed.

The observer found the persistent products populated rather than trusting the final screenshot:

* every diffuse cube face was nonzero;
* every specular cube face was nonzero at representative mip levels 0, 4, and 8;
* the BRDF LUT was nonzero and spatially varying;
* the source cube was recorded as destroyed and was not probed after its lifetime;
* the synchronized frame contained no compute pass.

Exact workload state also survived. All fire and curve position and RGB errors remained zero; curve-radius error remained zero; and the particle reporter's maximum fire-radius floor remained `0.000001`. The renderer still reported 474 simulated lights and the same independent draw graph.

## Negative result: physically heavier was visually worse

The native candidate did not beat the simpler control.

| Similarity component | Box-mip control | Native prefilter | Change |
| --- | ---: | ---: | ---: |
| Overall | `0.975176` | `0.970277` | `-0.004899` |
| Color | `0.989798` | `0.989158` | `-0.000640` |
| Histogram | `0.945696` | `0.923976` | `-0.021720` |
| Luminance | `0.981880` | `0.980165` | `-0.001715` |
| Structure | `0.972718` | `0.976023` | `+0.003305` |
| Tone | `0.968662` | `0.966334` | `-0.002328` |

Structure improved slightly, which is consistent with a more directionally organized environment response. Every other component declined, especially the histogram term. The raw HDR evidence shows why:

| Region | Box-mip control | Native prefilter | Three.js | Native error vs Three.js |
| --- | ---: | ---: | ---: | ---: |
| Full | `0.069207` | `0.070530` | `0.064690` | `+9.03%` |
| Floor | `0.067083` | `0.069301` | `0.064662` | `+7.17%` |
| Upper gallery | `0.095529` | `0.096422` | `0.100904` | `-4.44%` |
| Left fire | `1.560989` | `1.561777` | `1.666316` | `-6.27%` |
| Right fire | `0.157274` | `0.158750` | `0.138169` | `+14.89%` |

The native candidate modestly improved upper-gallery raw energy, but it pushed the already-high full, floor, and right-fire regions farther from the reference and left the low left-fire region effectively unchanged. Its final floor-pool contrast was `0.113276` with ratio `1.400110` and coherent-row coverage `0.995781`; the box control was `0.112825 / 1.408379 / 0.995781`. The spatial sunlight cue was preserved, not improved enough to offset the broader distribution regression.

Human inspection agreed with the measurements. The native and box-filtered images were difficult to distinguish at normal viewing size. Both remained brighter and sharper than Three.js around the red floor reflection and left fire. The native convolution did not create Three.js's temporal highlight persistence or roughness-aware reflection reconstruction; it only redistributed environment energy before those still-different downstream stages.

The native candidate was therefore rejected and removed from production. The accepted implementation remains the renderer-owned box-filtered cube from commit `6e76a41`, with score `0.975176`. Compute-artifact support and the observer lifetime correction remain because they are independently useful and fully tested.

## Research conclusion and next bounded hypothesis

This experiment is a useful warning against equating physical elaboration, GPU work, or resemblance to Three.js internals with screen-space parity. The native path was heavier, closer in architecture to a PMREM workflow, and valid at every inspected resource boundary. It still produced a worse image against the actual synchronized reference. The comparison must continue to accept and reject complete causal chains, not individual features in isolation.

The remaining Antiky difference is now unlikely to be solved by adding more neutral environment energy. The box control already places raw forward HDR within `3.71%` on the floor and within `5.50%` in the upper gallery, while the visible residual is a sharper, stronger red floor reflection and a differently distributed fire glow. Three.js temporally resolves the scene before adding roughness-mipped SSR and feeding the combined result to bloom. Antiky's history, reflection reconstruction, and bloom-source order are still different. Those downstream relationships are the next bounded inspection target.

The next experiment should first extend stage evidence rather than alter rendering: isolate temporal scene history, final roughness-selected reflection, bloom source, and final bloom energy at the red floor and both fires. A rendering change should be made only after those probes identify which stage creates the excess. Global exposure, environment gains, particle intensity, sun intensity, and channel grading are explicitly rejected as next levers because they would disturb producers and spatial cues that are now measured and close.

## Verification handoff

After restoring the accepted production path, the local verification set was green:

* TypeGPU-Antiky: 7 test files and 40 tests passed;
* TypeGPU-Antiky type checking passed;
* root TypeScript checking passed;
* tooling: 66 tests passed;
* TypeGPU-Antiky production build passed;
* `git diff --check` passed.

The next canonical `artifacts/visual-comparison` refresh must reproduce the box-mip result from committed code, retain zero issues and zero shared-renderer pairs, and confirm that the observer skips the destroyed-resource trap without losing the persistent environment mip evidence.

### Canonical committed-code confirmation

The canonical refresh completed at `2026-08-10T03:07:49.297Z` after the accepted renderer, compute-artifact infrastructure, observer correction, and this research handoff were committed. Every renderer reached synchronized frame 12, all issue lists were empty, no shared-renderer pair was detected, and the report passed.

TypeGPU-Antiky scored `0.975181`, only `0.000005` above the `/tmp/antiky-box-ibl-1` checkpoint. Its component scores reproduced as color `0.989798`, histogram `0.945657`, luminance `0.981877`, structure `0.972679`, and tone `0.968829`. The square floor cue also reproduced exactly at contrast `0.112825`, ratio `1.408379`, and coherent-row coverage `0.995781`. Upper-gallery contrast was `106.46%` of the same-run Three.js reference and its spill/control ratio was `103.82%`.

All six persistent environment faces were active at representative mip levels 0, 4, and 8, for 18 nonempty subresource probes. Semantic particle parity again reported zero fire and curve position/color error, zero curve-radius error, and only the `0.000001` maximum fire-radius reporting floor. The canonical artifacts therefore confirm that production is back on the stronger box-mip result and that the rejected native convolution left no renderer residue.

## Pre-composite lighting cues became a first-class measurement

The next TypeGPU investigation needed to distinguish a recovered lighting shape from a merely similar final grade. Commit `582df57` extended the existing texture-probe samples with semantic HDR lighting cues. It does not schedule another GPU copy or add another sample point: the calculation reuses the same 1,388 deterministic texture samples already retained by the observer.

For each renderer, the report now identifies its forward or resolved HDR target and evaluates two sparse normalized-texture cues before tone mapping:

* upper-gallery spill uses 15 source samples and five control samples;
* the floor pool uses 24 interior samples, nine surrounding-ring samples, and five row comparisons.

The implementation selects TypeGPU's `TypeGPU resolved HDR color`, BroMetal's `BroMetal Deferred HDR`, Antiky's `Antiky AOT forward HDR`, WESL's `WESL forward HDR target`, and Three.js's scene `output` identified by its neighboring normal and metal/roughness attachments. Missing or ambiguous evidence is reported as unavailable and never changes the aggregate pass decision. The tooling suite reached 70 tests after this addition.

This layer proved important immediately. Display-space measurements could show that a square floor feature existed after bloom and tone mapping; the pre-composite cue could show whether the forward lighting itself created a brighter coherent interior than its ring. That separated sunlight and shadow work from downstream contrast compensation.

## TypeGPU breakthrough: spatial sunlight first, indirect energy second

### The CSM correction was structurally right and visually incomplete

TypeGPU's old directional-light path combined several compensations: an angled warm light, one fixed `2048×2048` shadow map, one comparison sample, and a hard `0.28 + visibility×0.72` floor that preserved 28% of direct sun even under complete occlusion. It could not reproduce the square architectural pool visible in Three.js.

Commit `a367bd0` replaced that path with a TypeGPU-owned fitted sun and two cascades:

* the near-vertical surface-to-light direction is `[0.0010204, 0.9999990, 0.0010204]`;
* two independent `4096×4096 depth32float` maps cover the practical split at `26.606139`;
* the fade range is `25.721281–27.490997`;
* receiver biases are `-0.00015` and `-0.0003`, with a `0.015` normal offset;
* each visibility lookup uses a guarded `3×3` comparison kernel;
* one-sided and double-sided materials use separate back-cull and no-cull typed pipelines;
* the frame executes two 103-draw shadow passes plus 103 forward geometry draws, for 309 indexed geometry draws.

Construction is transactional. Tests force failures during the second texture, bind group, unwrap, pipeline, and sampler stages and require every allocated buffer and texture to be destroyed exactly once. Renderer startup and normal stop share one idempotent lifetime owner, and Dawn submits a real forward draw that consumes both maps and the comparison sampler. The two maps add approximately 112 MiB over the former shadow estimate; synchronized telemetry moved from `942.1 MiB` to `1054.1 MiB tracked` while frame-12 FPS remained in the same approximately 24 FPS neighborhood.

The controlled `/tmp/typegpu-csm-1` capture proved the spatial correction. Display floor-pool contrast moved from `0.030510` to `0.108103`, its ratio moved from `1.140446` to `1.535077`, and coherent-row coverage moved from `0.236287` to `0.966245`. Those are respectively `79.46%`, `97.55%`, and `97.03%` of the same-run Three.js measurements. Upper-spill contrast reached `102.38%` of Three.js. Captured matrices, bindings, map descriptors, and 103-draw cascade passes matched the accepted independent implementations.

The aggregate score nevertheless fell from the canonical `0.945793` to `0.895952`. Raw TypeGPU HDR fell from `0.060020` to `0.054216` full-frame and from `0.051787` to `0.046151` on the floor. Final full-frame luminance fell from `0.112360` to `0.090224`, and black coverage rose from `0.098266` to `0.144016`. Fire regions and bright extraction barely moved. This was not a reason to restore the false direct-light floor: the square pool and upper spill proved that the new shadow partition was doing the intended job. It exposed a second producer that the old sun had been masking.

### Identical environment data isolated the consumer defect

The capture showed that TypeGPU and Antiky uploaded statistically identical values for all 18 sampled cubemap subresources: six faces at mip levels 0, 4, and 8. Antiky, using the same six HDR sources and ordinary box mip chain, produced raw full/floor/upper means of `0.069207 / 0.067083 / 0.095529`. TypeGPU produced `0.054216 / 0.046151 / 0.077747`. The environment producer was therefore healthy enough for a controlled first correction.

Source and generated-shader inspection located the suppression in TypeGPU's consumer. It multiplied diffuse IBL by `0.18` and specular IBL by `0.28`, discarding 82% and 72% of their energy. It sampled the source cube without the WebGPU X-axis correction, omitted the roughness-fourth-power reflected-direction bend and dielectric/metal multiple scattering, added a separate two-color hemisphere approximation, and multiplied the combined approximation wholesale by AO. The former always-lit sun floor and this underpowered indirect path had been compensating for each other.

The first correction deliberately did not add a PMREM producer, another texture, a new pipeline, or an exposure scalar. It changed only how TypeGPU consumed its own existing cube:

* cube lookups use `(-x, y, z)` consistently in forward and background paths;
* reflected direction bends toward the normal by `roughness⁴` for the box-mip approximation;
* the analytic DFG term feeds dielectric and metal single plus multiple scattering;
* diffuse and specular gains are unit energy;
* dielectric diffuse energy subtracts both single and multiple scattering;
* diffuse IBL receives AO directly, while specular receives the roughness/N·V-dependent occlusion used by the reference material graph;
* the duplicate hemisphere ambient term is removed;
* direct sun and point lights remain outside AO.

### Executing GPU tests caught both the shader defect and a test-backend trap

The regression is numerical rather than a frozen WGSL string. A full typed forward pipeline renders a controlled dielectric surface with zero analytic lights and shadow maps that fully suppress the sun, resolves its four-sample `rgba16float` attachment, and reads back the pixel.

Before the shader correction, a unit-white cube produced approximately `[0.10834, 0.10870, 0.11151]`, far below the expected unit-energy response, while a black cube still produced approximately `0.01395` from the fake hemisphere term. After correction, Metal Dawn produced:

* unit cube: `[0.5078125, 0.5078125, 0.5078125]`;
* black cube: `[0, 0, 0]`;
* a positive-X surface sampling the asymmetric negative-X face: `[0.50390625, 0.50390625, 0.50390625]`.

A fourth case exercises partial AO at glossy roughness so diffuse and specular occlusion cannot silently collapse into one multiplier.

Independent review found that the first version of this test was unreliable in the normal sandbox. `create([])` had no executing adapter and fell back to Dawn's null backend. That backend validates commands but does not execute meaningful raster and copy readbacks; three cases returned zero or garbage, while the black case falsely passed because its expected result matched the clear value. The fixture now explicitly marks the four semantic cases skipped when only the null backend exists, while keeping compile and validation coverage. On an executing adapter it uses mip zero for the synthetic one-mip cube, an oversized coverage triangle, an initialized alpha-zero sentinel, explicit byte-offset math, finite-value checks, and an alpha-near-one assertion before checking RGB. Three consecutive focused Metal runs passed all four cases; the full Metal suite passed 39 tests, while the sandbox suite reported 35 passed and four explicitly hardware-skipped. This is another example of why validation success is not execution evidence.

### Accepted combined capture

Commit `cf7f07a` records the unit-energy environment consumer. The synchronized heavy capture `/tmp/typegpu-csm-unit-ibl-1` completed at `2026-08-10T04:31:15.106Z`. All five demos reached frame 12, all issue lists were empty, no shared-renderer pair was detected, and the report passed.

TypeGPU moved from the CSM-only `0.895952` to `0.979751`, becoming the highest-scoring non-reference renderer in that run. Every component improved together:

| Component | CSM only | CSM + unit IBL |
| --- | ---: | ---: |
| Overall | `0.895952` | `0.979751` |
| Color | `0.953609` | `0.989388` |
| Histogram | `0.741570` | `0.963421` |
| Luminance | `0.906561` | `0.981253` |
| Structure | `0.949683` | `0.979118` |
| Tone | `0.922663` | `0.975562` |

The final display landed close without changing exposure, particles, point lights, SSR, AO generation, bloom, or composite:

| Region | TypeGPU | Three.js |
| --- | ---: | ---: |
| Full | `0.134120` | `0.136946` |
| Floor | `0.194053` | `0.190123` |
| Upper gallery | `0.143799` | `0.147275` |
| Left fire | `0.341702` | `0.341841` |
| Right fire | `0.160220` | `0.164403` |
| Full black fraction | `0.055234` | `0.050984` |

The recovered floor pool remained coherent across `232/237` measured rows (`0.978903`) and retained a `1.389614` interior/ring ratio. Its display contrast is still only `74.81%` of Three.js, so this is not exact shadow/indirect parity. Upper-spill display contrast is `97.49%` of Three.js and its spill/control ratio is `100.94%`. The pre-composite floor cue remains positive in every row, with contrast `0.020409` and ratio `1.180610`.

The capture also proves the isolation of the correction. Pipeline, texture, buffer, and traced-pass counts are identical to the CSM-only candidate: 12 pipelines, 95 textures, 434 buffers, and 120 measured passes. Shadow, light-compute, particle-compute, particle-render, SSR, bloom, AO, and composite shader hashes are unchanged. The first 88 frame-uniform floats are identical; only the final environment vector changed from `[8, 0.18, 0.28, 0.22]` to `[8, 1, 1, 0.22]`. TypeGPU particle colors remain exact, curve positions differ by at most `0.000004`, and the known native f32 fire-position boundary remains unchanged.

### Honest remaining gap and prefilter decision

The final image is close, but the intermediate graph is not identical. TypeGPU raw HDR is `0.066890 / 0.062090 / 0.085564 / 1.180347 / 0.136867` for full, floor, upper, left fire, and right fire. Three.js scene HDR is `0.064693 / 0.064683 / 0.101090 / 1.666285 / 0.138249`. TypeGPU is therefore still about 15% low in the upper raw target and 29% low around the left fire even though its independent particles and downstream bloom make the final regional means very close.

The earlier TypeGPU cross-face GGX and PMREM-shaped-LOD experiment is recoverable from archived session history, but its combined trial scored `0.916966` against a then-baseline `0.918318`; cross-face filtering alone scored `0.917843`, and LOD remapping alone `0.917583`. It raised upper mean while narrowing the histogram. The later Antiky native-prefilter trial produced the same general lesson. Reapplying that combined patch immediately would optimize an intermediate mean after the final image has already converged and would confound convolution with the now-correct consumer.

The accepted stopping rule is therefore bounded: retain `cf7f07a` as the causal correction. A future prefilter trial, if run, must hold analytic DFG, unit gains, CSM, AO, SSR, bloom, and presentation fixed and change only cube convolution. It must beat `0.979751`, improve the raw upper/left distribution rather than only its mean, and preserve the visible square pool. Until then, the box-mip producer and its limitations remain explicit rather than mislabeled as exact Three.js PMREM parity.

## Canonical TypeGPU confirmation

The committed implementation was captured again into `artifacts/visual-comparison` at `2026-08-10T04:50:44.570Z`. All five demos reached synchronized frame 12 with empty issue lists, the report passed, and `sharedRendererPairs` remained empty. TypeGPU reproduced the temporary candidate's overall score exactly at `0.979751`; color, histogram, luminance, structure, and tone also reproduced exactly at `0.989388 / 0.963421 / 0.981253 / 0.979118 / 0.975562`.

The semantic cues reproduced as well. TypeGPU's display-space floor pool measured contrast `0.101749`, interior/ring ratio `1.389614`, and coherent-row fraction `0.978903`; upper-gallery contrast was `97.49%` of Three.js and its spill/control ratio was `100.94%`. Before presentation, the floor remained brighter in all five sampled rows with contrast `0.020409` and ratio `1.180610`. Particle evidence remained isolated from the lighting change: curve colors and radii were exact, curve position error was at most `0.000004`, fire colors were exact, and the known native f32 fire-position error distribution was unchanged.

This canonical rerun closes the checkpoint: the large improvement is reproducible from the committed TypeGPU-owned cascaded sun and environment consumer, not a transient frame, stale development server, or artifact-selection accident.
