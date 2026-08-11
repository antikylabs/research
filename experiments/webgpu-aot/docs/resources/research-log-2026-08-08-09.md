Log Commit: 517069efbd08edab912b8d1323533f3a0c1990d9

# Heavy Sponza and Native Renderer Parity Research Log

## Session scope

This log records the long implementation and visual-comparison session spanning August 8–9, 2026. The requested summary window was approximately nine hours, but the recoverable Codex session and Git history cover the broader sequence from initial workload selection through the current visual-polish work. That wider context is retained because several early decisions directly caused the later architecture correction.

The log was reconstructed from four primary sources:

* the local Codex JSONL session, including progress messages and rejected experiments that were lost from the active context after compaction;
* 64 commits made during the session;
* the synchronized Playwright comparison reports and GPU telemetry;
* the current working tree, including the not-yet-committed WESL bloom experiment.

The Git history for the full session contains roughly 48,000 insertions and 18,000 deletions across 857 file-change entries. Those counts include generated shader artifacts and the removal of the former shared workload package, so they describe churn rather than implementation quality.

## Executive summary

The session started with a lightweight Earth demo, replaced it with a heavy Sponza workload, built five runnable demos, discovered that four of those demos were invalid wrappers around one shared renderer, removed that shared renderer, and rebuilt each demo as an independent implementation native to its own system.

A reusable Playwright/Chrome comparison harness became the central research instrument. It now captures synchronized screenshots, canvas-region statistics, WebGPU resources and commands, shader source manifests, sampled buffer values, loading/readiness state, and browser/GPU errors. It also detects suspiciously identical renderer fingerprints.

After renderer isolation, the work became a measured visual-convergence loop. Each non-Three renderer independently gained the effects it was missing: native particles, bloom, tone mapping, shadows, ambient occlusion, screen-space reflections, reconstruction, and exposure/light calibration. Many candidates were rejected when screenshots contradicted an improved aggregate score.

The latest committed [heavy comparison report](../../artifacts/visual-comparison/index.html) passes operationally with no reported browser or WebGPU errors and no shared-renderer pairs. Similarity against Three.js is:

| Renderer | Heavy visual score | Native per-frame graph | Estimated texture allocation |
| --- | ---: | --- | ---: |
| BroMetal AOT | 0.945178 | 9 render passes, 7 draws, 206 indexed draws | 453,132,360 bytes |
| TypeGPU runtime | 0.942155 | 12 render passes, 10 draws, 206 indexed draws, 2 compute passes | 866,009,160 bytes |
| TypeGPU-Antiky AOT | 0.941736 | 12 render passes, 9 draws, 309 indexed draws | 681,541,704 bytes |
| WESL static | 0.939942 | 12 render passes, 10 draws, 206 indexed draws, 3 compute passes | 510,083,144 bytes |
| Three.js native | reference | 25 render passes, 21 draws, 384 indexed draws | 1,080,896,796 bytes |

These numbers do **not** mean the images are equally polished. Three.js still has visibly better local contrast, softer light falloff, cleaner highlight rolloff, stronger depth separation, and more nuanced material response. The most important finding of the session is that aggregate image similarity can hide exactly the quality difference a person notices first.

## Phase 1: selecting a workload that is actually heavy

The first selected reference was the Three.js WebGPU TSL Earth example. It was portable, licensed, deterministic, and used custom surface and atmosphere shaders, but the user's browser loaded it quickly and correctly exposed the core flaw: two draw objects and roughly 16,000 submitted triangles do not meaningfully stress a modern GPU.

The replacement was Georgi Nikolov's raw-WebGPU Sponza demo, pinned as the research workload. The adopted contract includes:

* 262,267 triangles across 103 primitives;
* 69 images;
* 474 point lights, with hundreds animated;
* 406 emissive billboards;
* two 4096×4096 shadow cascades in the full reference design;
* deferred or forward PBR as appropriate to each renderer;
* ambient occlusion, screen-space reflections, temporal reconstruction, bloom, and image-based lighting where supported;
* fixed heavy and extreme profiles at 2560×1440 and 3840×2160;
* no automatic quality degradation.

This correction established an important benchmark rule: “heavy” must be a measurable workload contract, not an impression based on page load time or visual complexity.

The asset/vendor pass also uncovered two reproducibility and security issues. The upstream source snapshot omitted a referenced TypeScript module, so vendor-integrity coverage was added. A general-purpose glTF dependency pulled in a high-severity denial-of-service advisory through an unused texture-compression path. Because the selected asset uses a narrow static subset of glTF, that loader was replaced with a smaller local parser, removing the vulnerable dependency tree and making startup work easier to inspect.

## Phase 2: first implementation and runtime failures

The initial five-demo implementation produced builds and passed static/Dawn checks, but real browser use exposed severe failures:

* BroMetal, TypeGPU, and TypeGPU-Antiky presented black screens.
* Three.js stalled or froze Chrome during compilation.
* The demos did not expose consistent staged loading feedback.

The black screen was not a shader-compilation failure. A shared final-blit reveal uniform initialized to zero, and the stripped demo never started the original intro animation that would have raised it. A GPU readback regression was added, and the presentation now starts visible.

The Three.js freeze was caused by expanding all 474 native forward lights into every material shader. The scene retained all 474 deterministic light records and the full workload telemetry, but shader specialization was bounded to 32 representative analytic lighting slots. That preserved the workload's simulation and presentation intent while avoiding catastrophic pipeline compilation.

These failures demonstrated a recurring limitation of build-only verification: TypeScript, bundle generation, WGSL module creation, and even offscreen Dawn submission can all pass while browser presentation, compilation cost, or lifecycle state is still broken. Browser-backed evidence is required for this research.

Loading UI was subsequently implemented for every demo. Each app now exposes real asset/GPU stages, loading bits, status text, and progress bars rather than showing a blank canvas during expensive startup.

## Phase 3: building the reusable comparison instrument

Repeated manual browser checks were wasting time and producing inconsistent evidence. A single-command Playwright comparison runner was added as `npm run compare:demos`.

The first version standardized the five demo URLs, viewport, readiness contract, frame window, screenshots, console diagnostics, and HTML/JSON output. It later gained:

* WebGPU API instrumentation injected before application startup;
* frame-window counts for encoders, submissions, render/compute passes, draws, dispatches, instances, vertices, and indices;
* buffer and texture resource counts and estimated byte sizes;
* bounded samples of uploaded model/uniform/storage values;
* shader hashing, deduplication, source dumps, and manifests;
* downsampled canvas statistics for full, center, and floor regions;
* color, luminance, histogram, structure, tone, edge-energy, highlight, black-fraction, and spatial-cell measurements;
* `--only=<demo>` for focused iterations;
* smoke, heavy, and extreme profiles;
* renderer-identity detection.

The renderer-identity detector intentionally does not flag two demos merely because they have similar draw counts. It combines command-work signatures, allocation/pipeline shape, and strong shader-hash overlap. This gives the benchmark an automated architectural guardrail while allowing visually equivalent implementations to remain structurally different.

The full capture is deliberately detailed, while `summary.json` keeps routine comparisons compact. This separation matters: GPU traces can grow rapidly, and a measurement tool that produces hundreds of megabytes per iteration becomes a new bottleneck.

## Phase 4: discovering that the benchmark architecture was invalid

The new instrumentation immediately exposed the session's largest design error. BroMetal, TypeGPU, TypeGPU-Antiky, and WESL reported identical command counts, resource shapes, and shader sets because all four called the same `startSponzaWorkload()` renderer and changed only a final presentation shader.

That meant the repository had one renderer wearing four labels. Benchmarking startup, shader work, or runtime behavior in that state would have produced precise but meaningless results.

The corrected invariant is:

> Shared immutable benchmark assets and scene facts are allowed. Renderer ownership, shader authoring and compilation, pipeline construction, bind layouts, GPU resources, frame-graph logic, and command submission must remain inside each demo.

The former `packages/sponza-workload` package was deleted. The pinned model, textures, and attribution moved to neutral `benchmark-assets/` data. Negative regression tests now fail if the shared renderer package, dependency, or imports return.

This was more than code organization. Copying the same renderer into four directories would still have invalidated the experiment. Each replacement therefore uses a meaningfully different native graph:

* BroMetal: build-generated AOT WGSL and a deferred renderer.
* TypeGPU: runtime-resolved typed shaders, compute-authored mutable state, MSAA forward rendering, and runtime-owned post effects.
* TypeGPU-Antiky: TypeGPU used only at build time, emitting static WGSL plus metadata for a raw-WebGPU runtime.
* WESL: statically linked WESL modules with its own render and compute graph.
* Three.js: framework-native scene graph, materials, shadows, lights, and TSL post-processing.

The deletion was initially present only in the working tree, which explained why repository views still showed the package until commit `37fca28`. Later reports of the path were stale editor/Git-history views; the current checkout contains only negative test references that prevent its return.

## Phase 5: rebuilding independent native renderers

### BroMetal

BroMetal became an AOT-generated deferred implementation with local glTF upload, material bindings, G-buffer geometry, screen-space lighting, particles, bloom, tone mapping, shadows, FXAA, and SSR. Its measured graph is structurally distinct and it ships generated WGSL rather than a browser compiler.

Browser validation found that some valid Sponza primitives omit tangents. BroMetal now derives the tangent basis from position/UV derivatives instead of assuming all primitives contain tangent attributes. Chrome also required `RENDER_ATTACHMENT` usage on destinations populated by `copyExternalImageToTexture`, a browser-only resource-usage constraint caught by the harness.

### TypeGPU runtime

TypeGPU became a runtime-resolved typed forward renderer with a compute light simulation, a separate particle simulation, 4× MSAA, directional shadows, HDR bloom/composite, 406 visible particles, and runtime-native SSR/reconstruction.

Chrome rejected a comparison sample generated inside non-uniform fragment control flow. The fix evaluates the comparison sample outside the branch and selects the result afterward. This is an important TypeGPU finding: typed authoring improves resource and value contracts, but the emitted WGSL still needs GPU-uniformity validation.

### TypeGPU-Antiky AOT

Antiky's compiler metadata initially could not describe samplers, making a complete sampled PBR AOT renderer impossible without extending the compiler. Sampler support was added as a compiler feature rather than hidden in demo-specific runtime glue.

Antiky now emits static shadow, forward, particle, bloom, ambient-occlusion, SSR/reconstruction, and temporal-composite artifacts. The browser runtime owns raw WebGPU resources and contains no TypeGPU resolver.

An early black frame came from inconsistent pass ownership: one helper left a render pass open while another ended a pass before the caller's particle draw. The lifecycle rule is now that callers own `end()` for caller-created passes. This avoids helpers silently changing encoder state.

### WESL

WESL became a statically linked graph with alpha-aware depth, a compute ambient field, two compute blur passes, forward PBR, particles, bloom, spatial reconstruction, FXAA/tone mapping, and later SSR/reconstruction.

Its first valid command graph still had scattered missing fragments. The depth prepass and forward shader used algebraically equivalent but not bit-identical clip transforms, so `less-equal` depth testing rejected fragments. Both linked modules now import one canonical clip-position function.

### Three.js reference

Three.js remains framework-native. It owns the glTF scene graph and materials, 474 logical lights, bounded analytic shader slots, two cascaded directional shadows with 4096×4096 maps, PCF soft shadows, GTAO, SSR with blur, multi-resolution bloom, temporal reconstruction, and its native TSL graph.

It is currently much heavier in render-graph and memory terms than the other demos. That extra graph complexity is not incidental: much of the remaining perceived polish is produced by those interacting depth, shadow, temporal, reflection, and bloom stages.

## Phase 6: visual convergence and why scores were not enough

The first scored isolated baseline was far from Three.js:

* TypeGPU: approximately 0.755;
* TypeGPU-Antiky: approximately 0.652;
* BroMetal: approximately 0.570;
* WESL: approximately 0.553.

The early native images shared the correct geometry and camera but looked like bright neutral showroom renders. Three.js was darker, red-emissive, shadowed, bloomed, and filled with small moving highlights.

The iterative work added or calibrated, independently in each renderer:

* the red fire/upper-path light rig;
* 406 visible emissive particles rather than a few oversized substitutes;
* shaped hero flame cores and warm persistent sparks;
* HDR bloom and tone mapping;
* floor-versus-wall response;
* shadows and indirect fill;
* anti-aliasing/spatial reconstruction;
* ambient occlusion;
* screen-space reflections and rough reconstruction;
* renderer-specific exposure and light attenuation.

Crossing the 0.90 score threshold was not accepted as completion. One Antiky bloom kernel scored 0.909 but produced obvious cross/grid ghosts around emitters, so it was replaced by a continuous 13-tap Gaussian even though the replacement's score was slightly lower. Similar visual vetoes occurred throughout the session.

The score also varies slightly because animated particles and the Three.js temporal graph do not produce perfectly identical frames between captures. Small changes near the threshold can therefore be measurement noise. Heavy and smoke captures, regional metrics, shader/resource telemetry, and direct screenshot inspection were all used together.

## Important rejected experiments

Negative results are retained here because repeating them would waste future research time.

### General

* The Earth workload was rejected as too light despite being visually attractive and portable.
* A shared renderer with thin framework labels was rejected as an invalid benchmark architecture.
* “Copy the renderer into each package” was also rejected; filesystem separation is not architectural independence.
* A visual score above 0.90 was rejected as a sufficient quality gate.

### BroMetal

* Four oversized fire quads produced a smooth capsule rather than an irregular flame.
* An aggressive black-toe/highlight curve created dramatic screenshots but doubled the reference black fraction and underexposed the scene.
* The first shadow calibration crushed the center architecture. Direct visibility and indirect hemispherical fill had to be separated.
* Adding FXAA exposed an older full-screen UV bug: UV.x ranged from −0.5 to 1.5. The old integer-load composite hid it, while bloom had silently sampled the wrong part of the frame. Correcting UVs made the previous 2.6× bloom compensation far too strong.

### TypeGPU

* A singleton oversized hero billboard and later five disconnected bloom disks both looked geometric.
* A depth-contact occlusion prototype compiled but improved floor contrast by only about 0.0001, lowered overall parity, and emitted conversion warnings. The entire branch was removed.
* A taller/narrower flame experiment improved articulation but reduced the reference-matching highlight footprint and was reverted.
* Exposure 1.12 was worse than 1.10. A sweep through 1.08, 1.07, 1.06, and 1.05 selected 1.06 because 1.05's negligible aggregate gain degraded color, luminance, and tone simultaneously.
* Sparse reflection reconstruction produced horizontal bands. More contiguous native reconstruction passes were retained despite a tiny aggregate-score cost because the visible artifact disappeared.

### TypeGPU-Antiky

* A global exposure increase made the image brighter but collapsed midtones and reduced similarity.
* A sparse widened bloom kernel crossed the score gate but produced grid ghosts.
* Reducing foreground cores from 16 layers to five and eight made the silhouette tidier but materially worsened the image; both variants were fully reverted.
* A global display-grade experiment increased contrast but hurt histogram, structure, and aggregate parity.
* Replacing shaped particles with additive planes corrected geometry but became either too dim or circular/foggy when compensated; the whole branch was reverted.
* A luminance-adaptive resolve compiled after working around an AOT restriction on nested arrow functions, but it did not improve edge energy and was removed.
* AO exposure compensation at 1.02 was worse than retaining native exposure 1.0 with AO strength 6.
* An untuned SSR path reflected particles as glitter. Reflection-only output plus separable reconstruction and emissive/upward-surface constraints were required.

### WESL

* Increasing bloom alone initially had little effect because the source fire field lacked sufficient warm/high-energy particles.
* The first reflection experiment used geometry-depth intersection, but the dominant fire particles do not write depth. It therefore produced no hits.
* Sampling HDR particles along reflection rays produced floor glitter. A rough neighborhood filter still looked worse.
* Replacing those samples with analytic GGX-style light lobes raised floor mean without creating the missing contrast and reduced parity. The entire first reflection branch was deleted.
* A later independent WESL SSR implementation succeeded only after using a three-target forward path, a bounded trace, and reconstruction designed around the observed failure modes.
* Spatial reconstruction strength 0.40 improved structure but hurt color/histogram fidelity; 0.25 was the measured visually clean optimum.
* Reflection composite strength 1.2 did not improve over 0.9 and was reverted.

## Tooling and environment challenges

### Browser-control availability

The in-app browser-control service was repeatedly unavailable or pointed to a stale skill-cache path even while the user had Chrome open. The repository Playwright runner became the reliable fallback because it launches and instruments its own Chrome process. This was one reason to make the comparison workflow a durable project command rather than depend on an ephemeral interactive session.

### Sandboxed GPU adapters

Dawn sometimes returned no adapter inside the sandbox. Native shader/pipeline tests had to be rerun with Metal/GPU access. The important distinction was kept visible: an unavailable adapter is an environment failure, not evidence that a renderer is correct or broken.

### WebGPU validation differs from type validation

Several issues passed TypeScript and build checks but failed in Dawn or Chrome:

* implicit-derivative comparison sampling under non-uniform control flow;
* depth/stencil view incompatibility in Three.js post-processing;
* missing texture usage flags for browser image copies;
* multisample/bind-layout concerns;
* render-pass lifecycle errors;
* bit-level depth-transform mismatch.

The testing hierarchy that emerged is: source/metadata regression, typecheck, generated WGSL/Dawn pipeline validation, production build, focused Chrome capture, synchronized smoke capture, and synchronized heavy capture.

### Large captures and measurement overhead

Full WebGPU observation can become enormous because model buffers, textures, bind groups, shaders, and frame commands all multiply quickly. The harness therefore stores bounded samples, deduplicates shaders, and emits a compact summary alongside the detailed report.

### Context compaction and research memory

The live Codex context compacted multiple times, while the local session retained the full history. Reconstructing this log required reading the approximately 545 MB session record and extracting the relevant user/assistant messages by time window. This is itself a research-process finding: important negative results should be written to the repository as they happen rather than trusted to chat context, commit messages, or memory.

## Current system-by-system findings and gaps

### BroMetal AOT

Strengths:

* highest current non-reference score;
* compact and distinct deferred/AOT graph;
* correct full-screen UV path, centered bloom, FXAA, native shadow map, and SSR;
* good center exposure and structural similarity at comparatively low texture memory.

Remaining gaps:

* simpler shadowing than Three.js's two-cascade PCF-soft system;
* no equivalent of Three.js's full temporal reconstruction/GTAO stack;
* simpler material and indirect-light response;
* fewer render stages, which is efficient but also explains some missing interaction between effects.

### TypeGPU runtime

Strengths:

* strongest demonstration of runtime typed shader/resource construction;
* genuinely dynamic compute simulation for lights and particles;
* 4× MSAA forward renderer plus native SSR/reconstruction;
* full 406-particle workload and a graph measurably distinct from every other demo.

Remaining gaps:

* lower local dynamic range and softer material differentiation than Three.js;
* no full temporal AO/reconstruction equivalent;
* high texture allocation—about 866 MB in the current heavy capture—despite fewer passes than Three.js;
* some polish depends on multi-pass reconstruction that is more explicit and cumbersome than Three.js's node graph.

### TypeGPU-Antiky AOT

Strengths:

* proves TypeGPU-authored shaders can become immutable build artifacts with no runtime TypeGPU compiler;
* currently owns cascaded shadows, full-resolution AO, SSR/reconstruction, bloom, particles, and temporal composite artifacts;
* deepest native indexed workload among the non-Three demos at 309 indexed draws per observed frame.

Remaining gaps:

* dense authored fire cores remain visually less nuanced than Three.js particles even though lower-density alternatives tested worse;
* post reconstruction and temporal behavior remain simpler than Three.js;
* local contrast/highlight rolloff still reads flatter despite close aggregate exposure;
* artifact metadata had to grow to cover real renderer resources such as samplers, showing that an AOT compiler must describe more than shader text.

### WESL static

Strengths:

* cleanest demonstration of statically linked WGSL modules;
* independent compute ambient/blur work plus forward MRT, particles, SSR, reconstruction, bloom, and FXAA;
* relatively moderate memory use for its 12-render/3-compute-pass graph;
* latest working SSR avoids the glitter and banding seen in rejected approaches.

Remaining gaps:

* no directional shadow-map stage. It has camera depth and ambient reconstruction, but not the soft directional depth separation used by Three.js;
* therefore red light spreads too uniformly and the scene still looks flatter and more synthetic;
* highlight density remains below Three.js even when mean luminance is close;
* its spatial resolve reduces crispness but cannot replace temporal accumulation and shadowed material response.

The current uncommitted WESL experiment raises linked bloom contribution from 0.30 to 0.36. It improves heavy parity from 0.939942 to 0.940397 and passes the focused shader/build checks, but the visual change is small. It does not address the structural shadow/depth gap and should not be mistaken for the solution.

### Three.js reference

Strengths:

* most polished and coherent result;
* native material semantics and scene graph;
* two 4096×4096 cascaded directional shadows with PCF soft filtering;
* GTAO, blurred SSR, multi-level bloom, and temporal reconstruction;
* richest local contrast, highlight rolloff, and depth separation.

Costs and caveats:

* slowest readiness and lowest observed FPS in the heavy capture;
* approximately 1.08 GB of estimated texture allocation;
* 25 render passes and 27 command encoders/submissions per observed frame;
* naïvely expanding all 474 lights into material shaders froze Chrome, requiring a bounded analytic-light compilation strategy;
* its polish comes from a substantially larger integrated graph, so visual comparison without graph telemetry would understate the work being performed.

## Research conclusions so far

1. **A fair renderer benchmark requires architectural independence, not separate package names.** GPU fingerprints were essential for proving this.
2. **Shared immutable assets are useful; shared rendering code invalidates the experiment.** The neutral asset boundary is the correct common layer.
3. **AOT and static linking can support sophisticated render graphs.** BroMetal, Antiky, and WESL now all implement multi-pass effects without shipping their authoring compiler/linker to the browser.
4. **AOT metadata is part of the renderer product.** Samplers, bindings, layouts, pipeline variants, and pass contracts must be expressible, not just WGSL strings.
5. **Runtime TypeGPU provides strong typed composition but does not eliminate WGSL/WebGPU semantics.** Uniformity, layout, multisampling, and browser validation still matter.
6. **Three.js's quality is primarily systemic.** Its result is not explained by one exposure value or bloom coefficient; shadows, GTAO, SSR, temporal reconstruction, material handling, and multi-scale bloom reinforce each other.
7. **Screenshot metrics are useful diagnostics, not an aesthetic oracle.** Regional distributions and edge/highlight measures locate defects, but direct side-by-side inspection must veto metric-gaming artifacts.
8. **Heavy workload claims need telemetry.** Resolution alone is insufficient; passes, draws, dispatches, resources, shader modules, and submitted work must be captured.
9. **Negative experiments are first-class research output.** Several rejected branches clarified which missing stages mattered and which seemingly sophisticated fixes were dead weight.
10. **Durable session notes are necessary.** Git preserves accepted changes, but only a research log preserves rejected hypotheses, environment failures, and why a visually plausible approach was abandoned.

## Next work

The next highest-value experiment is a WESL-owned directional shadow stage, likely two cascades with soft comparison sampling and renderer-local light matrices. The existing alpha-aware depth module can potentially be reused with shadow-specific frame buffers and targets while keeping WESL fully self-contained.

Acceptance should require:

* a failing regression before the new shadow contract is implemented;
* successful static linking and Dawn compilation;
* no shared renderer/runtime code;
* visible improvement in depth separation and material response, not just aggregate score;
* synchronized smoke and heavy captures with zero browser/WebGPU issues;
* updated canonical artifacts for human side-by-side review.

After WESL shadows, the broader research should investigate a deterministic or frozen animation-capture mode. That would reduce score variance and make small visual deltas easier to attribute without replacing direct visual judgment.

## 2026-08-09 instrumentation and TypeGPU follow-up

The earlier WESL gap above is now historical: WESL gained renderer-owned soft shadow cascades in `ee6cbcb`. The next comparison cycle concentrated on whether the harness exposed enough of the executed WebGPU graph to make TypeGPU decisions from evidence rather than final screenshots alone.

### Inspection additions

The observer now records generated WGSL structure, effective pipeline state, bind-group/resource topology, model-buffer head and tail samples, and pipeline/pass work only inside the synchronized frame window. It also injects `COPY_SRC` only into selected labeled, single-sample color targets and reads a bounded set of pixels after measurement. The original usage remains in the resource record, with `probeCopySourceInjected` marking the instrumentation-only mutation.

Intermediate probes cover both a coarse full-frame grid and denser presentation regions matching the screenshot analysis: floor, left fire, right fire, and upper gallery. Each target reports per-channel and luminance minimum, maximum, mean, p10, p50, p90, and zero fraction. This is substantially more useful than a single uniform grid because sparse emissive and bloom pixels can be completely missed by coarse samples.

All five smoke renderers completed the localized readback with zero browser or WebGPU diagnostics. The probe itself runs after the synchronized workload snapshot, so its copy encoder, submission, and readback buffer do not pollute the per-frame workload numbers.

### Findings that changed the TypeGPU direction

The first coarse readback suggested TypeGPU bloom and reflection were nearly empty. Localized sampling corrected that conclusion: both were active, but bloom energy was concentrated around the emitters and did not spread through the room like Three.js's five-scale chain.

Representative smoke values before the final tuning:

* TypeGPU resolved HDR mean was about `0.0194` full-frame versus Three.js temporal resolve at about `0.0379`.
* TypeGPU left-fire HDR contained a maximum above `3.25` but only about `0.080` at p90; Three.js was less concentrated and retained roughly `0.417` at p90.
* TypeGPU AO averaged about `0.959` full-frame versus Three.js GTAO near `0.905`, proving the initial AO field was real but too mild.
* A uniform full-frame bloom probe understated TypeGPU's fire-local bloom by several orders of magnitude. Region probes found approximately `0.084` mean in the left-fire narrow target even though the coarse full grid was nearly zero.

These numbers explain the visible difference more accurately than “Three.js has more bloom.” TypeGPU had an extremely hot, narrow source feeding too few spatial scales; Three.js distributed energy while retaining the sharp source.

### Accepted TypeGPU changes

TypeGPU gained a native full-resolution world-space ambient-occlusion pass built from its already resolved normal/roughness and world-position/metalness attachments. This avoided a duplicate geometry prepass and remained entirely TypeGPU-authored. It added one shader module, one `r8unorm` target, one pipeline, and one steady-state render pass.

The first multiscale bloom experiment ping-ponged one image through progressively wider kernels. It raised scene brightness but destroyed the narrow layer: left-fire dynamic range fell from roughly `0.54` to `0.29` while Three.js remained around `0.70–0.74`. That version was rejected.

The accepted graph preserves a narrow quarter-resolution bloom target and independently reconstructs a wide target through six blur passes at one-, two-, and four-texel radii. The composite mixes narrow bloom more heavily than wide bloom. TypeGPU now performs 17 render passes per frame rather than 13, while remaining one self-contained runtime TypeGPU renderer.

The final smoke tuning also raised AO strength, bounded exposure, and left-spark size/intensity. In the synchronized comparison:

* the former worst local mismatch fell from approximately `0.298` to `0.253`;
* left-fire mean reached `0.341` versus Three.js `0.329` in that capture;
* left-fire p90 reached `0.764` versus Three.js `0.798`;
* full-frame mean reached `0.136` versus Three.js `0.139`;
* upper-gallery mean reached `0.146` versus Three.js `0.152`;
* the aggregate parity score remained nearly flat around `0.9235`, demonstrating why one overall score must not replace localized evidence and visual review.

The refreshed canonical heavy capture scored TypeGPU at `0.928131`, up from the prior `0.925535`, with 17 render passes, 10 generated WGSL modules, 10 pipelines, zero probe errors, and zero browser/WebGPU issues. The other independent heavy scores were BroMetal `0.935799`, Antiky `0.935759`, and WESL `0.936380`.

The right-fire field remains the clearest TypeGPU mismatch: mean and clipped coverage are too high even though p90 is lower than Three.js. A trial that reduced right intensity while widening its particles did not improve those metrics and was reverted. The likely remaining source is the surrounding analytic-light field rather than the particle shader alone.

### New harness gaps

The observer can now measure intermediate values, but it does not yet identify which targets are actually consumed by a final composite when a renderer retains stale ping-pong textures. Labels and bind-group topology make that inference possible, but an automated producer/consumer graph would make it reliable. It also needs a deterministic animation/fixed-frame mode: fire particles and temporal targets still introduce small capture-to-capture variance that can hide changes below a few ten-thousandths of aggregate score.

### Analytic-light audit and presentation rebalance

The next audit found that the renderers were not feeding equivalent analytic fire distributions into their otherwise independent lighting systems. Three.js owns four static fixture lights and selects sixteen animated fire lights from the 256-light simulation. Its fixed sampling stride is sixteen, while the deterministic seed list is ordered four emitters at a time. Every sampled animated fire index is therefore congruent to zero modulo four and belongs to the left foreground emitter. Three.js shades four fixtures plus sixteen left-emitter fire lights, not four evenly populated animated fires.

TypeGPU was shading twenty layered red cores followed by eighteen additional red analytic sparks spread across the fixtures. That explained the broad red floor/right-wall wash that persisted even after particle tuning. A red regression first captured the mismatch, then the TypeGPU-owned light array was reorganized into:

* four static red fixture lights matching the reference positions, radius, and intensity;
* sixteen moving red analytic lights localized to the left foreground emitter;
* eight upper-path and four corridor analytic lights;
* low-energy neutral workload slots above the 32-slot smoke presentation budget.

The direct correction was directionally right but underexposed. In its first heavy synchronized capture, TypeGPU right-fire clipping fell from about `10.4%` to `3.7%` against Three.js at about `5.5%`, while the floor lost the broad saturated wash. Full luminance fell to about `0.118` versus Three.js at `0.136`, and parity fell to `0.910535`.

Generated-shader inspection then located the missing indirect term. Three.js consumes PMREM environment radiance and irradiance; TypeGPU only had a small hemispherical approximation. A `3.5×` indirect gain, borrowed as a hypothesis from the BroMetal renderer, was rejected because TypeGPU's different presentation transform pushed full luminance to about `0.226`. A bounded `1.35×` indirect gain matched floor/full exposure, and a separate `1.6×` vertical-surface balance raised the upper geometry without reintroducing the floor wash. Finally, explicit red/green/blue presentation scales corrected a measurable global white-balance error.

In the refreshed canonical heavy capture, TypeGPU reports:

* full RGB `0.2255 / 0.1134 / 0.1059` and luminance `0.1367`, very close to Three.js's roughly `0.2289 / 0.1112 / 0.1043` and `0.1357` from the preceding reference capture;
* floor luminance `0.1822` with only `0.07%` clipped highlights;
* right-fire luminance `0.1547` and `5.83%` clipped highlights, now close to Three.js;
* upper-gallery luminance `0.1284`, but `8.81%` black coverage remains much higher than Three.js;
* left-fire edge energy `0.0445`, still well below Three.js's approximately `0.0630`.

The aggregate score is `0.917577`, lower than the previous oversaturated `0.928131` state even though the broad color cast and right-side wash are visibly improved. Histogram and local-structure terms penalize the remaining sparse/chunky TypeGPU flame and dark upper geometry. This is another concrete example of the score being a diagnostic rather than the aesthetic decision maker. A follow-up `1.15×` left-hero analytic-light gain changed the bound buffer values but did not materially change left-fire luminance or edge energy, so it was rejected and reverted. The remaining hotspot is particle/post structure, not point-light energy.

### Bound-input provenance and an observer defect

Intermediate-target probes answer what each pass produced, but they did not make it easy to prove which concrete frame, light, material, texture, and settings values a pipeline consumed. The compact summary now resolves every pipeline's observed bind groups into bounded input records:

* buffer label, size, usage, binding range, and last sampled write;
* texture label, format, dimensions, usage, and view identity;
* sampler label and descriptor;
* total input count plus explicit truncation when a material-heavy pipeline exceeds the bounded summary.

The first real use immediately found an observer bug. Bind groups were attributed only when `setBindGroup` happened after `setPipeline`. WebGPU bind groups are pass state and may be set before a pipeline or retained across pipeline switches. The initial TypeGPU forward summary therefore listed material inputs but omitted the scene group containing the camera frame, light array, shadow texture, and comparison sampler.

A failing behavioral regression now covers pass-scoped retained groups. The observer tracks bind groups by slot, attaches the complete active set when a pipeline is selected, and rechecks it at draw/dispatch time. Browser verification now resolves the TypeGPU forward pipeline to the actual 224-byte camera/model/shadow frame, the 4096-byte mutable light array (including the sampled `[position, radius, color, intensity]` floats), the 2048-square shadow texture, and its sampler. This is a material accuracy improvement: shader text alone could not prove that the intended values reached the executed pipeline.

The refreshed canonical artifact at `2026-08-09T14:50:21.276Z` contains the corrected provenance for all five self-contained renderers. All five completed the heavy profile with zero browser/WebGPU errors, zero probe errors, and no shared-renderer pairs. Current scores are BroMetal `0.935779`, TypeGPU `0.917577`, TypeGPU-Antiky `0.935336`, and WESL `0.935902` against Three.js.

### Exact-frame capture and native stage lineage

The temporal follow-up exposed a more fundamental observer error before it produced an accepted renderer change. Texture probes were asynchronous readbacks performed after the workload snapshot while request-animation-frame callbacks continued. The screenshot was taken later still. Telemetry, intermediate targets, and final pixels could therefore describe different animation frames. This produced an apparent large difference between TypeGPU history A and B that disappeared once both were sampled at one frozen frame.

The observer now owns a renderer-agnostic animation gate installed before application startup. It first freezes every renderer at absolute frame 7 for the before-counters, resumes it, then freezes again at absolute frame 12. Timer polling avoids depending on the animation callbacks being gated. GPU probes are submitted after the frame-12 work on the same queue, and both the page and clean-canvas screenshots are taken while the application callback remains held. Every condensed result records the requested and captured frame as well as the exact five-frame workload window.

This correction also revealed that a relative five-frame wait was not cross-renderer synchronization. Readiness varied by one frame, so the first revised all-demo run stopped TypeGPU, Antiky, and WESL at frame 6 while BroMetal and Three.js stopped at frame 7. The absolute `--capture-frame` control and two-gate measurement remove that phase error. A capture now fails with an actionable error if the requested window cannot fit before the absolute frame.

Ping-pong render passes previously appeared as separate workload stages because their physical attachment IDs alternate. The raw pass records still preserve those physical variants, while the measured workload merges variants with the same non-empty logical label and reports their IDs and variant count. Each probed texture now reports its last render-pass producer, attachment role, monotonically increasing write sequence, total render-write count, and captured frame. This makes the newest temporal history target explicit rather than inferred from A/B naming.

The condensed artifact also gained a native stage dependency graph. For every pass that actually executed inside frames 7 through 12, it links:

* the pass and concrete pipelines selected in that pass;
* pass-scoped bind groups, including retained groups set before a pipeline;
* sampled buffer writes, textures, samplers, and binding numbers;
* color, resolve, and depth outputs with formats, sizes, and load/store operations;
* the measured per-frame and total workload attribution.

An initial version bounded the first 64 pass records by creation order. Three.js performs substantial one-time PMREM and mip preparation, so initialization stages filled that budget and hid the active GTAO, SSR, bloom, and TRAA graph. The summary now filters against the measured workload window before applying its bound. The full raw report continues to retain initialization records.

### Rejected TypeGPU temporal accumulation

A TypeGPU-owned neighborhood-clamped history resolve was implemented as a controlled hypothesis. It used a 3×3 current-frame neighborhood, ping-pong `rgba16float` histories, reactive history rejection, and a separate full-resolution resolve before AO, SSR, bloom, and composition. Focused TypeGPU shader resolution, typecheck, Vite build, and Dawn/Metal tests passed.

The first unsynchronized probe appeared to show a large left-fire energy difference between history A and B. Exact-frame producer lineage proved that result was capture drift. At frame 7 in the synchronized heavy trial:

* raw HDR left-fire mean was `0.176453`;
* temporal-resolve left-fire mean was `0.176222`;
* full, floor, right-fire, and upper-gallery means were unchanged to the displayed precision;
* history A was the newest target by write sequence, while history B was two frames older.

Without projection jitter or motion vectors, the stage did not materially improve static structure or the parity regions. It added three full-resolution half-float textures, approximately 88.5 MiB at the heavy resolution, plus one full-resolution pass and one pipeline. The entire experiment was rejected and removed. A real temporal reconstruction remains possible, but it must justify velocity/reprojection complexity with visible motion and edge evidence rather than merely adding a history buffer.

### First exact frame-12 heavy baseline

The canonical artifact at `2026-08-09T15:16:31.955Z` is the first comparison in which every renderer, workload window, texture probe, and screenshot is phase-aligned. All five results capture frame 12 after measuring exactly frames 7 through 12. The run passed with zero browser/WebGPU issues, zero probe errors, and no shared-renderer pairs.

The exact scores are:

* BroMetal AOT: `0.930909`;
* TypeGPU runtime: `0.911342`;
* TypeGPU-Antiky AOT: `0.933675`;
* WESL static: `0.930854`;
* Three.js native: `1.0` reference.

These scores supersede earlier values that mixed animation phases. TypeGPU's full luminance is already close to Three.js (`0.1361` versus `0.1369`). Its remaining gap is localized: left-fire mean is about `0.2905` versus `0.3419`, left-fire edge energy is `0.0426` versus `0.0555`, and upper-gallery black coverage is `9.33%` versus `1.00%`. The right-fire mean and clipped coverage are comparatively close.

The measured native graph provides a stronger next hypothesis than another presentation scalar. Three.js's active standard-material pass consumes `PMREM.cubeUv` and `DFG_LUT` alongside the material textures and shadow depth. TypeGPU's forward graph has no environment texture or split-sum BRDF input; its indirect term is a tuned two-color hemispherical approximation. This directly matches the dark upper and vertically oriented surfaces that remain after global exposure and color balance were corrected.

The next TypeGPU experiment should therefore be renderer-owned image-based lighting: native HDR environment ingestion or an offline renderer-specific environment artifact, diffuse irradiance, roughness-aware specular sampling, and a bounded BRDF integration term. It must remain TypeGPU-authored and must not import Three.js's PMREM runtime. Acceptance should require improved upper-gallery fill and material depth without washing out the floor or undoing the now-correct right-fire distribution.

### TypeGPU-native HDR lighting and inspection-harness growth

TypeGPU now owns a complete runtime HDR environment path. It decodes the six pinned Radiance faces without Three.js, constructs all nine `256×256` through `1×1` mip levels on the CPU, converts them to half float, uploads one `rgba16float` cubemap, and samples it through native TypeGPU bind groups. Its forward shader adds diffuse and roughness-aware specular image lighting with an analytic split-sum approximation. A separate TypeGPU pipeline draws the environment background into the existing four-sample forward pass.

The initial browser-valid capture looked plausible but contained a severe hidden regression. The resolved HDR maximum fell from approximately `9.96` to `0.12`, bloom energy fell by about an order of magnitude, and both SSR targets became exactly zero. The environment upload was not the cause. The frame uniform had grown from 224 to 304 bytes, while the independently generated particle and reflection shaders still described the old member layout. Both bound the larger buffer successfully, so WebGPU validation remained silent, but they interpreted inverse-view-projection matrix rows as camera and settings values. Particles disappeared and SSR rejected every sample.

A failing shader regression now requires the forward, particle, and reflection WGSL to expose the same inverse-projection and environment members. The shared item is only the TypeGPU frame-schema contract, not a renderer or pipeline implementation. After extracting that schema into its own TypeGPU module, the exact frame-12 capture restored the HDR maximum to `9.961`, narrow bloom maximum to `2.067`, and SSR maximum to approximately `0.0194`.

This failure caused four durable inspection changes:

* generated WGSL analysis now retains binding declarations, struct members, constants, and overrides rather than only aggregate counts;
* every `writeTexture` and external-image upload records its destination mip/layer, origin, copy extent, padded source layout, source bytes, texel bytes, and a bounded source sample;
* texture probes cover up to six array layers and representative first/middle/last mips while keeping the top-level metric anchored to layer 0, mip 0 for compatibility;
* pipeline bind groups retain their actual group slots, allowing the report to detect one static GPU buffer consumed through incompatible generated struct signatures.

The contract checker initially reported many Three.js buffers. Inspection showed that these were intentional streaming uniform arenas rewritten between pipeline uses, not static shared contracts. The audit now excludes buffers with multiple writes. This preserves detection of the one-write TypeGPU frame bug without misclassifying Three.js's dynamic allocator. The final heavy run reports zero static contract mismatches for all five renderers.

The environment evidence is now explicit rather than inferred. TypeGPU records 54 tightly sized cubemap uploads totaling one complete nine-mip chain for each of six faces. GPU readback found nonzero radiance in every sampled face and representative mip. The face-zero mean remains about `0.1331`; the six `1×1` face means range from about `0.0536` to `0.2043`, which is consistent with the asymmetric source environment rather than a missing or zeroed face.

The harness also uncovered contamination in its final-pixel metric. The so-called canvas capture hid only `#status`; the absolutely positioned `.loading-card` remained painted over the canvas bounding box. Clean presentation captures now temporarily hide and restore the entire card. Full-page screenshots still preserve the loading/progress interface for product review.

The refreshed canonical heavy artifact at `2026-08-09T15:52:54.263Z` captures every renderer at absolute frame 12 after the exact frame 7–12 workload window. It passed with zero browser issues, zero probe errors, zero static buffer-contract mismatches, and no shared-renderer pairs. Clean presentation scores are:

* BroMetal AOT: `0.930398`;
* TypeGPU runtime: `0.916269`;
* TypeGPU-Antiky AOT: `0.932220`;
* WESL static: `0.929943`;
* Three.js native: `1.0` reference.

TypeGPU improved from the first exact-frame `0.911342` baseline to `0.916269`. Its full mean luminance is `0.14064` versus Three.js at `0.13695`, so another global exposure increase is not justified. The remaining gap is spatial and structural: TypeGPU upper-gallery black coverage is `6.64%` versus Three.js near `1.01%`, left-fire highlights remain narrower, and the reference still has stronger localized upper-path illumination and material-depth separation.

The current TypeGPU mip chain is a box-filtered environment approximation, not a GGX-prefiltered PMREM, and its analytic environment BRDF is not a sampled DFG LUT. Those are now the clearest image-lighting gaps. Any follow-up should expose its candidate gains or prefilter controls through sampled uniforms, retain the six-face/mip evidence, and improve localized upper-surface response without raising the already-slightly-high full-frame mean.

### Compute-buffer evidence and rejected particle parity experiment

Shader text and upload records still could not prove what compute-generated particle and light data existed at the synchronized capture frame. The observer now injects `COPY_SRC` only into a bounded set of labeled storage buffers, freezes the application at the requested frame, and reads representative aligned ranges after the frame's queue work. The first version sampled only the head and tail. That was sufficient to expose the first particle but could miss a path discontinuity or corrupt middle record. The bounded 512-byte plan now samples aligned head, midpoint, and tail ranges. This keeps total readback below the same bound while covering the three materially different portions of a generated workload.

The first frame-12 readback found a real presentation mismatch hidden by the screenshot. TypeGPU's first particle was approximately `(3.8137, 3.0, 1.0371)` with half-size `0.1012`; Three.js's first billboard translated to approximately `(3.9277, 3.1076, 1.1373)` with inferred half-size near `0.0179`. TypeGPU was not merely rendering the same workload differently. It synthesized a handful of large flame cores, while Three.js updated 406 small deterministic billboards.

A TypeGPU-owned parity experiment reproduced the reference seed semantics without importing Three.js:

* Mulberry32 seed `0x53504f4e` and 256 fire plus 150 curve particles;
* four fire emitters, per-particle life speed, curl-noise motion, and shrinking `0.025` billboard radii;
* a native CPU implementation of the closed centripetal Catmull-Rom path sampled into 240 points;
* readonly TypeGPU seed and curve storage buffers feeding the mutable compute-generated particle buffer.

The expanded probes then captured four TypeGPU buffers with zero errors: mutable lights, mutable particles, deterministic particle seeds, and the 240-point curve. At frame 12, the first TypeGPU particle radius became `0.01728`, close to Three.js's approximately `0.0179`; positions were within roughly one to two centimeters per axis. Midpoint probing also made the curve and middle particle population inspectable instead of trusting only endpoints.

That semantic correction exposed why the prior image appeared closer. The oversized TypeGPU cores had been compensating for insufficient localized light and bloom energy. With correct particles and the accepted linear light model, parity fell from `0.916269` to `0.902856`. A `2.5×` and then `12×` left-hero light sweep raised medium highlights but did not reproduce Three.js's bright localized peaks. Replacing the falloff with inverse-square punctual attenuation improved the left-fire mean to about `0.2763`, but raised full luminance to about `0.1461` and scored only `0.902474`.

Intermediate-target evidence identified the next structural difference. At the accepted baseline, TypeGPU's quarter-resolution bloom targets had left-fire means around `0.0097` and `0.0589`, while Three.js's five-level Unreal bloom chain reached left-fire means between roughly `0.23` and `0.85`. TypeGPU repeatedly blurs three quarter-resolution targets; Three.js extracts bright values and reconstructs five progressively smaller levels. A controlled HDR-base/bloom-weight sweep improved the corrected-particle score to `0.909416` and brought left-fire mean to `0.3260` versus Three.js at `0.3419`, but structure similarity fell to `0.9124` and right/upper highlights spread too broadly. The whole renderer experiment was rejected and removed because it never beat the accepted `0.916269` baseline.

The negative result narrows the next hypothesis. Another particle-size, point-light, exposure, or two-texture bloom scalar is unlikely to close the gap. A TypeGPU-native multiresolution bloom reconstruction—or a complete jittered temporal reconstruction that can preserve small emissive particles before downsampling—must be evaluated as a structural stage change. The buffer evidence and exact-frame target lineage are now sufficient to distinguish that hypothesis from another compensating visual hack.

### Accepted TypeGPU multiresolution bloom reconstruction

The structural bloom hypothesis passed. TypeGPU now builds its own 11-stage bloom frame graph: one half-resolution bright extraction followed by horizontal and vertical reconstruction at five successively halved levels. The heavy `2560×1440` profile allocates levels at `1280×720`, `640×360`, `320×180`, `160×90`, and `80×45`. Every texture and pass has a renderer-owned label, so the capture report proves the complete producer chain instead of inferring it from ping-pong texture names.

The first exact capture with the new graph raised TypeGPU's full mean from `0.1406` to `0.1450`. It substantially improved localized means—left fire `0.3358`, right fire `0.1675`, and upper gallery `0.1491`, respectively close to Three.js at `0.3419`, `0.1644`, and `0.1473`—but scored only `0.913550` because the presentation was globally too bright. The five-level energy distribution was retained while composite exposure was reduced from `1.14` to `1.08`. This moved full mean to `0.1378` against Three.js at `0.1369`, retained left fire at `0.3256`, and produced a five-way acceptance score of `0.918349` versus the previous canonical `0.916269`.

The refreshed canonical artifact at `2026-08-09T16:32:48.869Z` records TypeGPU at `0.918318`; small last-digit variation comes from the independently rerun reference capture. All five renderers captured absolute frame 12 with zero browser issues, zero buffer or texture probe errors, zero static contract mismatches, and no shared-renderer pairs. Current scores are BroMetal `0.930314`, TypeGPU `0.918318`, TypeGPU-Antiky `0.932136`, WESL `0.929876`, and Three.js `1.0`.

The heavier graph adds approximately `20.5 MiB` of tracked storage at the heavy profile, moving TypeGPU from about `844.3 MiB` to `864.8 MiB`. This is aligned with the research workload: it replaces repeated same-resolution blur with independently measurable spatial frequency levels and remains below Three.js's approximately `1024.8 MiB` tracked allocation. Probe readbacks show nonzero energy progressing from a sparse bright extraction through all ten reconstruction targets. The remaining TypeGPU gap is no longer broad exposure or missing bloom scale. Its largest hotspot remains the left foreground structure, where mean energy is close but edge energy and peak distribution still trail the reference.

A follow-up redistributed the same approximate bloom budget toward the finest level. It raised left-fire edge energy from about `0.0397` to `0.0428`, but lowered left-fire mean from about `0.3256` to `0.2993`, reduced upper-gallery fill, and lowered structure similarity. Its aggregate `0.918354` differed from the refreshed accepted score by only `0.000036`, so the change was rejected as measurement-scale noise rather than a meaningful improvement.

### Exact execution topology and energy-aware probes

The next instrumentation audit found two places where the harness still encouraged incorrect conclusions. Pipeline records retained bind groups but not vertex/index buffers or draw dimensions. That was especially limiting for Three.js, whose generated resource labels are often generic and whose pipeline cache reuses one material pipeline across many geometries. A pipeline-wide buffer list could not identify the resources used by one specific particle draw.

The observer now records bounded command signatures for every generated pipeline. Each signature includes exact draw, indexed-draw, or dispatch dimensions plus the bind-group, vertex-buffer, and index-buffer snapshot active at that call. The condensed stage graph preserves these command records and treats vertex/index inputs as first-class resources. Browser validation identified the reference particle workload without relying on an application label: two Three.js pipelines execute `drawIndexed(6, 406)`, each consuming the same quad geometry and per-instance color data plus its own vertex-stage transform uniform.

That result exposed a second label bias. Buffer probes selected only storage buffers whose labels matched `particle` or `light`, so they could not read Three.js's high-value generated uniforms. Probe candidates now include bounded uniform, storage, vertex, and index buffers. Selection still prioritizes explicitly labeled model buffers, then ranks unlabeled buffers by the highest-cardinality command that actually consumed them. Small selected buffers are read completely; larger ranges remain bounded and aligned to 16-byte WebGPU data boundaries. At frame 12 the harness read both complete `25,984`-byte Three.js transform buffers (`406 × 64` bytes), the complete `4,872`-byte per-instance color buffer (`406 × 12` bytes), and the associated quad/index inputs with zero probe errors.

The complete data made a semantic comparison possible rather than visual guesswork. Across all 406 particles, TypeGPU and Three.js colors were identical. Mean position error was about `0.0412` world units overall and `0.0573` for the fire population; curve-position error averaged about `0.0136`. Inferred billboard half-size differed by only about `0.00029` on average. Per-emitter centers and spreads were likewise close. The corrected particle simulation was therefore not grossly wrong at frame 12.

Intermediate-texture sampling still had a serious sparse-signal flaw. The old plan sampled only 36 points per fire region. In the exact-particle trial it reported a TypeGPU bright-extraction maximum of roughly `0.011`, even though strong HDR particles were visibly present. The plan now uses 1,388 deterministic samples, including 480 in each fire region. Every channel and luminance summary separates active coverage from active-pixel intensity and adds RMS, p99, and fraction above HDR value one. With the corrected probe, the same target measured a maximum of `7.84`, `7.06%` active coverage, and RMS `0.315`. The earlier result was sampling error, not weak shader output.

The expanded evidence also made the remaining presentation gap explicit. In the synchronized five-way retry, Three.js's bright target measured left-fire mean `0.930`, active-pixel mean `7.44`, and RMS `4.94`; TypeGPU measured `0.029`, `0.183`, and `0.181`. Three.js's pre-bloom HDR target reached left-fire mean `1.666` and maximum `204.3`, while TypeGPU's resolved HDR measured about `0.058` and `2.23` in that region. The particle transforms, radii, and colors were already close, so this difference belongs to localized scene/presentation accumulation rather than seed generation.

Re-evaluating the exact TypeGPU particle workload through the accepted five-level bloom graph scored `0.904916`, well below the accepted `0.918318` canonical state. It also reduced final left-fire mean from the accepted roughly `0.326` to `0.198` while Three.js remained at `0.342`. The experiment was rejected and removed again. The accepted TypeGPU-authored flame deliberately compensates for localized HDR energy that the renderer does not otherwise reproduce; replacing it with semantically exact particles before closing that upstream presentation gap is a regression, not progress.

The canonical artifact refreshed at `2026-08-09T17:04:20.688Z` preserves the accepted renderer state under the expanded observer. All five demos captured absolute frame 12 with zero browser/WebGPU issues, zero buffer or texture probe errors, and no shared-renderer pairs. Scores are BroMetal `0.930283`, TypeGPU `0.918227`, TypeGPU-Antiky `0.932076`, WESL `0.929886`, and Three.js `1.0`. The small TypeGPU delta from `0.918318` is capture-scale variation, not a retained visual change.

### Exact synchronized execution traces

A second audit found that the new command signatures were exact individually but incomplete as a frame description. They accumulated from application startup, retained only 16 distinct signatures per pipeline, and had already dropped 5,716 variants across the TypeGPU and Three.js captures alone: 2,080 and 3,636 respectively. Initialization order therefore decided which commands survived. Pass summaries also merged occurrences and omitted dynamic offsets, viewport, scissor, blend constant, stencil reference, attachment clear values, and the exact texture views used for color, resolve, and depth attachments.

The observer now arms a separate bounded trace only after the animation gate has stopped at frame 7, records the exact ordered work through frame 12, and closes the trace before GPU buffer and texture readback. Every draw, indexed draw, indirect draw, and dispatch carries its pipeline, exact bind groups and dynamic offsets, vertex/index bindings, dimensions, and active dynamic render state. Every pass occurrence retains order, its telemetry frame, attachment view and texture IDs, clear values, load/store behavior, and complete depth/stencil semantics. Buffer-probe selection now ranks the commands from this synchronized trace rather than the overflowed lifetime sample.

The comparison CLI gained explicit investigation controls: `--trace-commands`, `--buffer-probe-pattern`, `--buffer-probe-bytes`, `--max-buffer-probes`, `--texture-probe-pattern`, and `--max-texture-probes`. Normal captures remain bounded, while a material, camera, particle, light, or intermediate-target investigation can widen only the relevant evidence.

Live Chrome/WebGPU validation proved the trace is complete for the accepted workload:

* BroMetal recorded 1,065 commands and 45 passes;
* TypeGPU recorded 1,140 commands and 115 passes;
* TypeGPU-Antiky recorded 1,590 commands and 60 passes;
* WESL recorded 2,125 commands and 85 passes;
* Three.js recorded 2,025 commands and 125 passes.

For every renderer, traced command totals exactly equal the independent workload counters, traced pass totals exactly equal render-plus-compute pass counters, and trace overflow is zero. The old lifetime samples still report thousands of dropped variants, which confirms that this was a real blind spot rather than unused capacity.

The first new state difference is concrete. Three.js applies an explicit viewport to 1,090 synchronized commands; the other four renderers rely on attachment-sized defaults. Three.js also uses three distinct color clears across its measured graph: transparent black, opaque black, and opaque white. TypeGPU's particle draw is now traceable as one `draw(6, 406)` in each measured frame, targeting the multisampled HDR attachment with a resolve view, additive pipeline 631, no explicit viewport/scissor, default blend constant, and one concrete particle bind group. These facts do not by themselves prescribe a viewport change—the default viewport already covers the attachment—but they remove raster-state ambiguity from the next localized HDR comparison.

The refreshed canonical artifact at `2026-08-09T17:21:07.010Z` contains the full traces and condensed trace health in the HTML and JSON reports. It passed with zero browser/WebGPU errors and zero trace drops. Presentation scores in this retry are BroMetal `0.923623`, TypeGPU `0.916060`, TypeGPU-Antiky `0.926635`, WESL `0.926256`, and Three.js `1.0`. The broader movement relative to the immediately preceding capture, despite unchanged renderer sources, is a reminder that score deltas must be accepted only with a same-run reference and visible regional evidence; one last decimal-place aggregate is not a research result.

Known remaining observer boundaries are now explicit rather than silently assumed. The trace does not yet expand render bundles, preserve every per-frame CPU queue-write value, fingerprint decoded external-image pixels, or assign a normal texture ID to the browser-owned current swapchain texture. None is implicated by the current particle trace, but they are the next harness growth points if a hypothesis depends on bundled draws, changing uniforms, asset decode/color transforms, or final swapchain producer lineage.

The exact trace also explains why Three.js submits two consecutive `drawIndexed(6, 406)` particle commands. Its transparent `DoubleSide` material is compiled into back- and front-side variants. The commands consume the same quad geometry, the same 4,872-byte instance-color buffer, and separate 25,984-byte transform uniforms whose complete captured contents are byte-identical. Both pipelines cull back faces, but one defines clockwise triangles as front-facing and the other defines counterclockwise triangles as front-facing. Their generated fragment shaders differ only in whether the G-buffer normal is negated.

This pair must not be interpreted as double visible energy. A non-degenerate triangle has one winding, so exactly one of the opposite-front-face variants survives back-face culling. The two submissions partition front- and back-facing primitives; they do not blend the same planar billboard twice. TypeGPU's one `cullMode: none` draw is the equivalent single-pass treatment. The complete raster state therefore disproves, rather than supports, a two-draw TypeGPU experiment. The remaining exact-particle energy gap still belongs upstream in localized lighting/material accumulation or in the deliberately different accepted flame presentation—not in missing raster multiplicity.

### Rejected surface-response experiments

The clean canonical pixels also disproved a global-exposure explanation for TypeGPU's remaining mismatch. Its full-frame mean luminance was already essentially identical to Three.js (`0.139923` versus `0.139830`), while the error was spatially redistributed: the floor measured `0.175590` versus `0.193139`, the center `0.169321` versus `0.194223`, and the upper gallery retained `4.47%` black coverage versus `0.39%`. At the same time TypeGPU's foreground pillars were visibly brighter than the near-black reference pillars.

The accepted TypeGPU shader deliberately applies a `1.6×` gain to vertical surfaces and a `0.75×` gain to upward surfaces. A neutral `1.0×/1.0×` experiment made the foreground pillars more reference-like and brightened the floor, but destroyed the upper gallery: its mean fell to approximately `0.1037` and black coverage rose to about `12.0%`. The aggregate score fell below the accepted `0.916060` state.

Two camera-depth variants then tried to preserve the far vertical fill while reducing the near-pillar gain and raising horizontal response. The narrower variant used a `1.25×` near-vertical gain, the accepted `1.6×` far-vertical gain, a `0.9×` horizontal gain, and a two-to-five-unit transition. It moved floor mean to `0.197398`, close to the reference `0.193139`, but increased full-frame black coverage from `4.25%` to `6.10%`, barely changed the upper gallery (`0.145178` versus the prior `0.144839`), and reduced the same-reference score from `0.916060` to `0.908670`. The shader and its experimental tests were removed.

These failures isolate the next visual hypothesis. The reference does not look like a monotonic function of normal direction or camera depth. It has localized upper-path energy and wider regional tone distributions. A future renderer change should therefore target an attributable light, environment-prefilter, material, or post-process producer visible in the exact trace rather than add another screen-space positional gain.

### Submission-accurate CPU-to-GPU buffer lineage

The synchronized command trace still had one consequential pre-WebGPU blind spot. It recorded exact bind groups and dynamic offsets, while buffer probes read final GPU contents only after the measured window. A streaming uniform buffer can be rewritten between submissions, so its final readback need not contain the camera, material, or transform values consumed by an earlier draw. Pipeline and shader attribution alone could not repair that temporal ambiguity.

The observer now snapshots bounded `queue.writeBuffer` and mapped-buffer source bytes during the exact frame window. Command-encoder passes are associated with their finished command buffers and then with the queue submission that establishes execution order. Bind-group layout metadata resolves dynamic offsets into concrete buffer offset/size ranges. Each draw or dispatch records only the minimal effective set of preceding writes that defines those ranges: a later full overwrite replaces older history, while disjoint partial writes are retained only where they still contribute bytes.

Three new CLI controls bound focused investigations: `--trace-buffer-writes`, `--trace-buffer-write-bytes`, and `--trace-buffer-write-pattern`. The HTML summary reports total writes, dropped writes, and queue submissions. Static data uploaded before the exact window remains available through the existing GPU readback probes; the new lineage specifically supplies the missing changing CPU-authored state.

Headed Chrome validation produced zero browser or WebGPU errors. TypeGPU recorded 10 writes totaling 160 bytes across five submissions, preserving per-frame compute-clock and composite settings such as time, `1.08` exposure, and the `2560×1440` render size. Three.js recorded all 1,635 writes totaling 295,860 source bytes across 135 submissions with zero overflow. It linked 2,010 of 2,025 commands to at least one effective traced write; the remaining commands consume static or GPU-generated data.

The particle path is a useful exactness check. For each measured Three.js frame, both `drawIndexed(6, 406)` commands now reference exactly one current 128-byte camera write and one current 25,984-byte transform write. The two side variants reference distinct transform buffers, and their effective writes remain independently identifiable at every submission. Older frame uploads no longer appear as candidate state. This turns the earlier particle interpretation from an end-of-window inference into submission-accurate evidence.

The remaining observer boundaries are narrower. Writes larger than the configured sample budget retain bounded head/tail bytes unless the investigator raises the byte lever; buffers never CPU-written during the trace still require GPU probes; render bundles are not expanded; and raw write bytes are not yet decoded into named WGSL struct fields. Those limitations are now explicit and separately actionable rather than conflated with draw-state or queue-order uncertainty.

The canonical heavy artifact refreshed at `2026-08-09T17:45:50.901Z`. Every renderer again matched its independent workload counters, with zero command or buffer-write overflow and zero browser/WebGPU errors. Buffer-write counts were BroMetal 20, TypeGPU 10, TypeGPU-Antiky 15, WESL 20, and Three.js 1,635. Presentation scores returned to the previously accepted same-run neighborhood: BroMetal `0.930314`, TypeGPU `0.918318`, TypeGPU-Antiky `0.932136`, WESL `0.929876`, and Three.js `1.0`. No renderer source changed during this instrumentation increment.

### Rejected TypeGPU PMREM approximations

The next TypeGPU hypothesis isolated two differences from Three.js's native environment path: the face-local box-filtered cube mip chain and the linear roughness-to-mip mapping. A renderer-owned CPU GGX prefilter sampled across all six faces, while a separate shader helper reproduced the shape of Three.js's generated roughness-to-mip curve. The two changes were measured independently and together.

All three variants improved upper-gallery fill, color similarity, and local structure, but each reduced histogram similarity. The combined variant moved upper-gallery mean from `0.141920` to `0.144604` against Three.js at `0.147267`, and reduced upper black coverage from `4.71%` to `3.99%` against `1.01%`. Its total score nevertheless fell from `0.918318` to `0.916966` because the smoother environment narrowed the light/dark distribution. Cross-face filtering with the original linear LOD scored `0.917843`; the original box mips with the PMREM-shaped LOD scored `0.917583`. The experiment and its tests were removed.

This negative result is important: the remaining polish gap is not simply missing environment blur. Three.js combines its PMREM with stronger localized direct/emissive energy, two cascaded shadows, material-integrated GTAO, and a wider post-lighting distribution. Replacing one approximation with a smoother one can make regional means look more correct while moving the actual tone distribution farther from the reference.

### Shader-resource lineage and decoded generated uniforms

The exact trace still required manual joins across command bind-group IDs, bind-group entries, texture views, texture records, samplers, pipelines, and shader manifests. That was error-prone for generated Three.js shaders: a declaration such as `nodeUniform172` did not prove whether the concrete draw received the PMREM, a material map, or another same-shaped texture.

Every traced command now records binding-aware resource lineage. Each entry connects the exact group/binding and generated shader name/type to the concrete buffer, texture view, texture, or sampler used by that command. Texture records retain labels, formats, dimensions, mip counts, and view subresources; sampler records retain filtering, addressing, comparison, and LOD settings. A live standard-material draw now proves, in one command record, that Three.js reads `GTAONode.AO`, both `4096×4096` `ShadowDepthTexture` cascades, the `16×16` `DFG_LUT`, and the `768×1024` `PMREM.cubeUv`, alongside that primitive's material textures.

The first live run exposed another selection bias. Three.js's `1,968`-byte light-bearing `renderStruct` was bound to every lit draw but lost the default buffer-probe ranking to the 406-instance billboard buffers. The default probe pattern now includes render, frame, and cascade uniforms as well as particle/light buffers. The corrected heavy capture reads the complete `1,968`- and `2,032`-byte Three.js render buffers rather than retaining only bounded queue-write fragments.

Generated WGSL analysis also computes conservative uniform-layout offsets for supported scalar, vector, matrix, fixed-array, and nested-struct members. Unsupported types are marked rather than guessed. The generated Three.js `renderStruct` computed to exactly `1,968` bytes, matching the allocated WebGPU buffer, and `cascadesStruct` computed to exactly `32` bytes. Decoding the captured offsets reproduced the authored first point-light color `[12, 0.12, 0.12]`, range `6`, and decay `2`. TypeGPU's generated `TypeGpuLight` independently computes to a `64`-byte stride, and its captured first record contains the corresponding `[10, 0.1, 0.1, 1.2]` color/intensity values. The harness can now compare generated GPU inputs rather than infer them from screenshots or application source.

This lineage confirmed two structural facts. Three.js's heavy standard-material shader contains one directional light and 32 analytic point-light slots; TypeGPU's heavy shader loops 52 of its 64 available slots. More importantly, Three.js samples GTAO inside the material and multiplies only indirect diffuse plus a roughness-aware indirect-specular visibility term. TypeGPU samples AO only in its final composite and multiplies the complete HDR color.

### Rejected indirect-only TypeGPU AO

A controlled TypeGPU experiment added a fourth forward MRT carrying only ambient and image-based lighting. The composite reconstructed direct plus AO-weighted indirect, leaving sun, point-light, and particle energy unoccluded. This matched the structure of Three.js's generated material graph while remaining entirely TypeGPU-owned.

The regional movement was directionally useful. Upper-gallery mean moved from `0.141920` to `0.148965` against Three.js at `0.147267`; right-fire mean moved from `0.160005` to `0.168600` against `0.164416`; color, structure, and tone sub-scores all improved. The aggregate score still fell from `0.918318` to `0.915289`, driven by histogram similarity dropping from `0.798656` to `0.780084`. Full-frame mean rose to `0.140858`, and black coverage moved away from the reference in the full, center, and floor regions.

The newly probeable indirect MRT explained the result. Its full-region mean was only about `0.0137` HDR luminance, with a p90 near `0.0216`. AO placement is a real architectural difference, but TypeGPU's indirect term is too small for it to be the dominant missing energy or contrast producer. The experiment and its tests were removed.

The next evidence-backed renderer hypothesis is direct shadow distribution. Three.js renders two native `4096×4096` CSM shadow passes and samples both depth textures in every standard-material draw. TypeGPU renders one `2048×2048` directional shadow map. The reference simultaneously preserves brighter direct highlights and deeper regional blacks, which is consistent with better direct-light visibility partitioning and not with another global exposure, environment blur, or AO scalar.

### Authored-to-generated-to-GPU causality

The shadow hypothesis did not survive exact value inspection. Three.js's two practical cascade splits are approximately `0.266061` and `1.0`, with near and far light-matrix scales around `0.01298` and `0.00317`. TypeGPU's single light matrix is much tighter, around `0.06`, and therefore already has higher local shadow texel density than the reference near cascade. Cascade coverage remains structurally different, but missing shadow resolution is not the leading explanation for the upper-path lighting gap.

The analytic-light records supplied stronger evidence. Slots 0–19 are broadly comparable across renderers, but TypeGPU's upper-curve slots 20–27 carry effective color energy of roughly `0.67–1.59`, while Three.js's corresponding slots are roughly `5–16`. A controlled TypeGPU curve-intensity increase from `1.1` to `10` proved that these slots affect the correct visual region, but the uniform increase spread energy too broadly: upper-gallery mean rose to `0.186974` against the reference `0.147267`, histogram similarity fell, and the aggregate score dropped from `0.918318` to `0.913471`. The experiment was rejected. The producer is correct; its approximate positions, motion, and per-light values are not.

That experiment also showed the remaining instrumentation gap. Final GPU readback proved what bytes existed after compute, and synchronized queue-write lineage proved which CPU writes preceded a submission, but neither represented a complete buffer's CPU-authored state when initialization occurred before the trace or when a renderer updated one uniform through many partial writes. Three.js's `1,968`-byte render uniform, for example, often ends a frame with a final write of only 12 bytes.

The observer now retains a bounded persistent CPU shadow for critical particle, light, render, frame, and cascade buffers up to `32,768` bytes. It merges partial writes, records exact covered ranges rather than treating unwritten padding as authored zeroes, and keeps the complete sampled state in the detailed report. The same buffers are read back from the GPU at the synchronized frame. An automatic comparison reports changed bytes, changed float offsets, maximum and mean absolute difference, and changed struct-record indices using the generated WGSL binding stride.

TypeGPU's live frame-12 light comparison now proves that its generated compute shader mutates exactly records 4–51. It changes 425 of 4,096 bytes and 144 of 1,024 float fields, with maximum absolute movement `0.118472`; records 0–3 remain static. The subsequent forward draws explicitly identify the compute command that most recently wrote the buffer. This distinguishes authored seed differences from compute-motion differences without manually joining submission, binding, upload, and probe data.

Generated-code inspection gained two complementary levers. Shader modules now record normalized JavaScript creation callsites, preferring authored `/src/` frames over compiler internals, and generated WGSL analysis records actual function-call and decimal-literal fingerprints while excluding declarations and attributes. Resource lineage adds a compact buffer contract—structure name, element count, stride, and total byte size—to every exact shader binding. In the TypeGPU light path this resolves to `array<TypeGpuLight, 64>`, 64-byte stride, and 4,096 total bytes at compute, vertex, and fragment stages. The TypeGPU compiler call is attributable back to `renderer.ts`, while Three.js falls back to its library callsite where the authored application does not appear in that internal stack.

An all-renderer heavy validation captured BroMetal, TypeGPU, TypeGPU-Antiky, WESL, and Three.js with zero browser/WebGPU errors and zero command or buffer-write overflow. Binding contracts were produced for every renderer. CPU-versus-GPU comparison reported no unexpected mutations in the four CPU-driven systems; TypeGPU's light compute buffer was the one intentional mutation visible among the selected critical buffers.

The richer evidence initially made the compact summary copy raw buffer-probe and last-write arrays. A five-way detailed report is intentionally heavy, but `summary.json` should not duplicate those bytes. The summarizer now retains contracts, mutation statistics, coverage, record indices, and bounded numeric previews while omitting raw byte arrays and full changed-offset lists. Detailed evidence remains in `report.json`; quick inspection no longer requires loading the same raw data twice.

The next TypeGPU renderer experiment should reproduce the deterministic upper-curve light placement and per-slot energy rather than apply another scalar or add cascades first. It should remain TypeGPU-owned and preserve typed GPU compute: deterministic curve samples and seed values can be authored into renderer-local storage, while the generated compute shader advances life and interpolates the curve. Acceptance should compare the CPU-authored records, post-compute records, generated shader literals and operations, exact compute-to-draw lineage, upper-gallery distribution, and the same-run Three.js image metrics.

### Typed generated-buffer decoding and rejected exact curve lights

The exact-curve experiment exposed a practical inspection problem before it exposed a renderer result. Buffer probes retained complete float arrays and generated WGSL retained member offsets, but comparing a `4,096`-byte array-of-structs TypeGPU light buffer to Three.js's `1,968`-byte structure-of-arrays render uniform still required manual offset arithmetic. The probe path now decodes supported generated WGSL scalars, vectors, and matrices directly into named records. Fixed arrays up to 64 records are decoded completely; larger arrays retain bounded head and tail records. Identical layouts are decoded once while preserving every generated binding name and every compute, vertex, or fragment stage that consumed them. The detailed report keeps the values and one member schema; the compact summary keeps only record coverage and provenance.

Live browser validation caught and corrected two instrumentation defects. The first decoder revision retained only the first stage seen for a shared layout, incorrectly describing the TypeGPU light array as vertex-only even though compute mutates it and fragment consumes it. Grouped provenance now reports all three stages. A full tooling test then caught duplicated member tables in every per-stage binding contract. Member metadata is now carried internally to the decoder and emitted once with the decoded layout, while normal contracts remain compact. The final heavy TypeGPU validation decoded all 64 light records with zero browser or probe errors and reported the `lights` binding at compute, fragment, and vertex stages.

The decoded values resolved the curve hypothesis exactly. For slots 20–27, multiplying TypeGPU's captured RGB by its captured intensity reproduced Three.js's uploaded effective RGB values at displayed precision. Transforming TypeGPU's world-space positions by Three.js's captured view matrix reproduced Three.js's view-space positions; slot 20, for example, became `[-3.150346, 5.031621, -3.539079]` in both systems. Radius/distance was `4` in both. The renderer-local seed generation, 240-point curve, interpolation, selection, and compute motion were therefore correct.

Correct inputs still produced a worse image. The exact-curve candidate scored `0.917707` against the accepted TypeGPU `0.918318`. Its upper-gallery mean rose to `0.172860` against Three.js at `0.147292`, while black coverage remained much worse. The decoder also proved that TypeGPU heavy mode kept nonzero lights 32–51 while Three.js's generated standard material contains only 32 point-light records and TypeGPU-Antiky explicitly zeros every later slot. Zeroing those surplus records raised the candidate only to `0.917827`; upper mean remained `0.171149`. Both variants were rejected and the renderer code and experimental tests were removed.

This negative result changes the next question. The upper-curve records are not merely approximate anymore; when made exact, TypeGPU's material, direct-light attenuation, environment, and presentation chain distribute their energy differently. Another curve position, seed, or global intensity adjustment is unlikely to be explanatory. The next comparison should decode and contrast the per-material uniforms and generated BRDF/falloff literals feeding the same upper-gallery primitives, then probe the pre-bloom HDR regions produced by those exact draws. A future semantic layer may also annotate coordinate spaces and authored node names, because generated Three.js identifiers such as `nodeUniform104` remain structurally decodable but semantically opaque. That is now an explicit harness boundary rather than a reason to guess at another renderer scalar.

The canonical artifact refreshed at `2026-08-09T19:13:33.061Z` with the accepted renderers and typed decoder enabled. It passed with zero browser issues, zero buffer-probe errors, and zero command or buffer-write overflow. Decoded layout counts were BroMetal 4, TypeGPU 5, TypeGPU-Antiky 9, WESL 7, and Three.js 12; TypeGPU decoded 131 selected records and both generated TypeGPU systems decoded every selected 64-light array. Same-run presentation scores were BroMetal `0.930402`, TypeGPU `0.918349`, TypeGPU-Antiky `0.932219`, WESL `0.929986`, and Three.js `1.0`.

### Generated buffer-member use sites and rejected shadow compensation

Generated-buffer decoding answered what values reached the GPU, but anonymous Three.js uniforms such as `nodeUniform40` still required manual searches to discover what those values controlled. Generated WGSL analysis now links every used member of a bound struct to its access count and up to three exact source lines. The analysis handles direct struct access, indexed arrays of structs, and the pointer aliases emitted by TypeGPU, such as `let light = (&lights[index])` followed by `(*light).colorIntensity`. This keeps the detailed evidence bounded while connecting decoded values to the expressions that consume them. Compact and HTML reports expose aggregate used-member and access counts.

Live heavy captures validated both compiler shapes with zero browser or WebGPU errors. TypeGPU's forward shader now identifies three `positionRadius` accesses and two `colorIntensity` accesses through the generated `light` pointer. Three.js's standard-material variants expose between 159 and 168 used render-uniform members each. The previously opaque `nodeUniform15` in the selected forward variant is now directly attributable to the directional-light color multiplied by `shadowValue`; `nodeUniform40` feeds inverse-power point-light decay; and `nodeUniform41` supplies a view-space point-light position. Captured numeric values and their generated semantics no longer need to be joined by hand.

The same inspection found a real TypeGPU graph difference: the accepted shader accumulated sun and all point lights, then multiplied the combined result by directional-shadow visibility. Three.js multiplies the directional light by its shadow value before accumulating point lights. Separating TypeGPU's sun and local-light accumulators raised pre-bloom HDR energy in the expected regions: upper gallery `0.024937` to `0.040115`, left fire `0.175708` to `0.237543`, and floor `0.028808` to `0.038774`. The final image nevertheless became broadly over-bright because the accepted shader's `1.6×` vertical-surface gain had compensated for the incorrectly shadowed point lights. Its score fell to `0.876701`.

Reducing the paired vertical gain to `1.25×` restored regional means close to Three.js but did not restore the reference distribution. The candidate scored `0.900934` versus the accepted `0.918349`; upper-gallery luminance was `0.153760` versus `0.147267`, but contrast remained `0.122797` versus `0.161908`, and right-fire luminance remained `0.200218` versus `0.164416`. This is a structurally informative but visually rejected experiment. It proves that directional-shadow scope should ultimately be corrected, while also proving that one legacy surface scalar cannot recalibrate the resulting direct, indirect, material, and post-process distributions.

### Accepted TypeGPU direct-light and presentation reconstruction

The generated Three.js standard-material shader supplied the missing coupled explanation. Its point lights use inverse-square decay multiplied by a squared quartic cutoff: `1 / distance² * clamp(1 - (distance / radius)⁴, 0, 1)²`. TypeGPU instead used `(1 - distance / radius)² / (1 + distance² * k)` with two index-dependent constants. The mismatch was especially large for the radius-one animated fire lights. Replacing only the attenuation moved pre-bloom left-fire HDR mean from `0.175708` to `0.475523` against Three.js at `1.666313`, but retained the old compensations and reduced final similarity to `0.903099`.

Combining Three.js's attenuation with sun-only directional shadowing moved the actual HDR producer close to the reference: full-frame mean `0.058957` versus `0.064528`, left fire `1.308476` versus `1.666313`, right fire `0.100248` versus `0.138090`, and floor `0.041570` versus `0.064725`. This proved the direct-light reconstruction while also making the accepted orientation gain indefensible. Three.js has no equivalent of TypeGPU's `1.6×` vertical and `0.75×` upward surface multiplier. Removing the multiplier lowered vertical HDR and raised floor HDR in the required directions.

The remaining final-image error came from another accumulated compensation layer. Three.js composes scene, reflection, and bloom, then applies its ACES input/output matrices at exposure `1` followed by the piecewise sRGB OETF. TypeGPU used a different rational curve at exposure `1.08`, a simple `1/2.2` gamma, vignette, grain, per-channel gains up to `1.64`, and channel-specific black offsets. Replacing that tail with the exact generated Three.js ACES and sRGB functions raised focused similarity from the accepted `0.918349` to `0.937323`.

The synchronized five-renderer acceptance capture at `2026-08-09T19:46:17.465Z` confirmed `0.937329` in a same-run comparison. TypeGPU is now the highest-scoring non-reference renderer. Its right-fire luminance is `0.167847` versus `0.164440`, contrast `0.168003` versus `0.161482`, and floor luminance `0.176042` versus `0.190127`. Remaining differences are localized: left-fire luminance is high (`0.437343` versus `0.341899`), while upper-gallery and center energy remain low. All five renderers completed with zero browser, WebGPU, buffer-probe, or texture-probe errors and zero command or buffer-write overflow.

### Accepted TypeGPU analytic-light reconstruction

The generated Three.js material uniforms exposed another producer mismatch that screenshots had obscured. Three.js forwards exactly 32 analytic point lights: four fixed fires, 16 evenly sampled fire particles, eight evenly sampled curve particles, and four evenly sampled corridor lights. TypeGPU executed 52 heavy-profile slots, populated its first 32 with synthetic paths and weak curve colors, then filled slots 32–51 with additional invented curve lights. In the captured Three.js buffer, the eight curve radiances ranged roughly from `4` to `16` per channel after intensity; TypeGPU's synthetic curve records were near `1`.

TypeGPU now retains its native typed compute simulation and heavy 52/64-slot workload while reproducing the reference producer. Its CPU-authored seed buffer uses the deterministic workload RNG, its compute bind group owns the 240-point closed centripetal Catmull-Rom table sampled by Three.js, the compute shader advances fire curl noise and derives curve and corridor positions at the fixed timestep, and surplus slots remain allocated but contribute zero radiance. The capture harness decoded all 32 live TypeGPU records at frame 12. Their world-space positions transform to the Three.js view-space positions, and their radius plus `color × intensity` values agree slot-for-slot; for example, the first curve record resolves to `[10.073, 12.626, 7.564]` in both systems.

The synchronized acceptance capture at `2026-08-09T20:01:16.946Z` raised TypeGPU similarity from `0.937304` to `0.939951`, with zero browser, WebGPU, buffer-probe, or texture-probe errors. Upper-gallery final luminance moved to `0.157223` against Three.js at `0.147267`, and upper contrast to `0.166326` against `0.161908`. The remaining dominant discrepancy is downstream and localized: TypeGPU left-fire final luminance is `0.454855` versus `0.341865`, while its edge energy remains lower (`0.043311` versus `0.055389`). With analytic inputs now verified, the next comparison should isolate emissive particle shape, reflection reconstruction, bloom source order, and bloom kernels rather than retune forward-light values.

### Exact Three.js particle execution and the native f32 boundary

Source, generated-shader, command-trace, and complete-buffer inspection resolved the particle path without relying on its final bloom footprint. Three.js renders 406 plain, untextured square billboards: 256 fire particles and 150 curve particles. The source plane spans `-0.5` to `0.5`; each instance transform turns that unit plane into a camera-facing square whose half-size is the particle radius. Fire particles use RGB `[10, 0.1, 0.1]`, full alpha, and radius `0.025 * (1 - life)`. Curve particles use a fixed `0.02` radius and deterministic RGB components in the `[1, 4]` range. Both populations use source-alpha/one additive color blending, `less-equal` depth comparison, and no depth write. There is no radial texture, procedural fragment falloff, tapered core, or alpha discard to reproduce.

The two consecutive Three.js `drawIndexed(6, 406)` calls are the framework's `DoubleSide` implementation, not a twofold energy contribution. They carry byte-identical transform data and select opposite front-face windings while both cull back faces. For the positive-determinant billboard transform, only the matching winding rasterizes; the other pass is culled. A single TypeGPU draw with culling disabled is therefore the appropriate native equivalent. Doubling the emission to imitate both command records would be incorrect.

The TypeGPU-owned reconstruction keeps the same deterministic workload while retaining its own resource and execution model. It uploads three seed vectors per particle—origin/life, velocity/speed, and color/radius—plus two mutable state vectors—position/size and color/life—and shares the renderer's 240-point closed centripetal Catmull-Rom table. Its compute pass skips the initial zero-time update, persists state on the GPU, applies the fire reset/curl/motion rules, and derives curve positions from the sampled path. The CPU seed oracle, colors, life values, and radii match the reference, while computed curve positions agree within native f32 tolerance at frame 12.

Fire position arithmetic cannot be bit-identical while Three.js evaluates the chaotic `fract(sin(x) * 43758...)` curl path in JavaScript doubles and native WGSL evaluates it in `f32`. At frame 12, TypeGPU particle zero held position `[3.980939, 3.117554, 1.141205]`, radius `0.017876`, and life `0.284954`; Three.js held position `[3.927742, 3.107635, 1.137261]` and diameter `0.0357523`, which implies the same radius. Across the fire population, direct Dawn readback measured mean position error `0.0537607514`, RMS error `0.0582512838`, and maximum error `0.1132892569` at particle 30. Curve positions, which do not amplify the same transcendental rounding, differed by at most `0.0000035763`. Colors were exact, and life plus radii agreed to five decimal places. This is a precision-model boundary, not evidence for more screenshot tuning. CPU-uploaded trajectories or software-emulated doubles would make the TypeGPU benchmark less representative. If bitwise cross-renderer motion becomes a benchmark requirement, all renderers should instead adopt one explicitly specified f32- or integer-based noise function.

### Exact bloom reconstruction and synchronized particle capture

Reverse engineering the generated Three.js bloom shaders corrected another generic-post-processing assumption. The reference chain uses a full-resolution first level followed by levels at one-half, one-quarter, one-eighth, and one-sixteenth resolution. Bright extraction takes one sample, computes luminance with `[0.2126, 0.7152, 0.0722]`, and applies `smoothstep(1, 1.01, luminance)`. The five separable Gaussian kernels have radii `[6, 10, 14, 18, 22]`, sigma equal to radius divided by three, and retain the generated Three.js weights rather than normalizing them independently. Reconstruction uses level weights `[0.179496, 0.143748, 0.108, 0.072252, 0.036504]`.

Once TypeGPU used that exact structure, the lower four vertical-blur levels nearly coincided with the reference. Three.js versus TypeGPU mean luminance was `0.016123` versus `0.018979` at level 1, `0.039520` versus `0.037200` at level 2, `0.038122` versus `0.038802` at level 3, and `0.037522` versus `0.038392` at level 4. The remaining source-side excess was visible at level 0 (`0.014457` versus `0.020691`) and in bright extraction (`0.019979` versus `0.027445` full-frame; `0.930663` versus `1.111657` in the left-fire region). The blur and reconstruction math is therefore no longer the leading unknown; the input energy distribution is.

The exact-bloom-only snapshot `/tmp/typegpu-three-bloom` scored TypeGPU `0.936532`. The later synchronized heavy capture `/tmp/typegpu-exact-particles`, taken at absolute frame 12 at `2026-08-09T20:32:15.885Z`, combined the independent exact particle structure and exact bloom. It completed all five demos with zero reported browser/WebGPU errors and passed the harness checks. Same-run presentation scores were:

* BroMetal AOT: `0.930402`;
* TypeGPU runtime: `0.937227`;
* TypeGPU-Antiky AOT: `0.932219`;
* WESL static: `0.929986`;
* Three.js native: `1.0` reference.

The structurally correct result scored below the earlier `0.939951` permissive-bloom/analytic-light candidate. That higher score was compensating for upstream energy and particle-shape differences with the wrong bloom transfer, so it is not a sound target. In the exact-particle capture, TypeGPU's pre-composite HDR full-frame mean was already close to Three.js (`0.060673` versus `0.061347`), while its final full-frame mean remained low (`0.109363` versus `0.136949`). This localizes the next work to effect semantics and spatial distribution rather than another global exposure adjustment.

### AO scope mismatch after producer parity

The generated Three.js material graph consumes GTAO through its built-in AO context. It attenuates indirect diffuse and applies a roughness-aware visibility term to indirect specular; it does not multiply direct sun, point-light, or emissive particle energy by AO after the scene has been rendered. TypeGPU currently samples its AO texture in the final composite and multiplies the complete resolved HDR scene base before adding reflection and bloom. That incorrectly darkens direct and emissive contributions even though the TypeGPU AO field is numerically less occluding than Three.js: full-frame means are `0.920899` and `0.864559`, respectively.

Regional probes reinforce that this is a semantic placement problem rather than a request for a stronger global AO scalar. TypeGPU versus Three.js AO means were `0.944183` versus `0.854314` on the floor, `0.826708` versus `0.728039` at the left fire, `0.814085` versus `0.716315` at the right fire, and `0.862898` versus `0.810018` in the upper gallery. The controlled change moved AO upstream and applied it only to TypeGPU's ambient and image-based-lighting term, then removed the whole-scene composite multiply. Because the synchronized scene and camera are static, the forward pass samples the renderer's deterministic prior-frame AO; a neutral white initialization makes the first frame defined without adding a duplicate geometry prepass.

The synchronized `/tmp/typegpu-indirect-ao` capture at `2026-08-09T20:42:58.318Z` accepted this version. All five demos reached frame 12 with zero reported browser or WebGPU errors, and TypeGPU's same-run score rose from the exact-particle baseline `0.937227` to `0.945809`. Final full-frame luminance moved from `0.109363` to `0.112360` against Three.js at `0.136946`; center moved from `0.146666` to `0.151621` against `0.188217`; floor from `0.160913` to `0.162852` against `0.190123`; left fire from `0.311846` to `0.319462` against `0.341841`; right fire from `0.130190` to `0.138802` against `0.164403`; and upper gallery from `0.122666` to `0.132548` against `0.147275`. This does not contradict the earlier rejected four-MRT AO experiment: that test ran against the older approximate light/particle/bloom state and paid for an additional indirect target. Re-testing the semantic change after producer parity, with no extra geometry attachment, materially improved color, histogram, structure, and tone together.

### Dawn readback teardown instability

The native Dawn particle readback successfully produced the frame-12 precision measurements above, but rapid repeated Vitest runs intermittently terminated the worker after the readback had completed. The failure occurred during adapter/device/worker teardown rather than at shader compilation, submission, or the measured assertions. Keeping that readback as a routine regression would therefore turn an environment-lifecycle failure into a flaky renderer test. The experimental test was removed while the existing stable Dawn compile and background tests remain. Browser captures continued to complete without WebGPU errors, so the teardown instability should be investigated separately from particle correctness before a persistent native readback regression is restored.
