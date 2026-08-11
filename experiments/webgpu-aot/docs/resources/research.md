# Antiky Rendering and WebGPU AOT Research Guide

## Purpose

This document captures the research context, architectural questions, hypotheses, and evaluation criteria behind Antiky's rendering and shader-compilation work.

Detailed implementation notes are kept in dated logs:

* [2026-08-08/09 heavy Sponza and visual-parity session](./research-log-2026-08-08-09.md)
* [2026-08-09/10 renderer-parity continuation](./research-log-2026-08-09-10.md)
* [2026-08-10/11 environment and lighting continuation](./research-log-2026-08-10-11.md)
* [2026-08-10 Antiky temporal resolve and post-process ordering](./research-log-2026-08-10-temporal.md)

The objective is to establish the right rendering foundation for Antiky while the engine is still early enough for fundamental architectural choices to remain inexpensive.

This research is specifically concerned with the relationship between:

* TypeScript
* WebGPU
* shader authoring
* shader compilation
* pipeline construction
* build-time tooling
* runtime rendering
* agent-assisted development

The goal is not to select a technology because it is interesting in isolation.

The goal is to determine which rendering architecture best supports the long-term design of Antiky.

---

# Core Hypothesis

Antiky should investigate whether **TypeScript can serve as the primary representation layer for rendering systems**, with shaders and as much associated rendering configuration as practical compiled or resolved ahead of time.

The central hypothesis is:

> A TypeScript-first rendering architecture where shaders, pipeline descriptions, resource contracts, and related rendering logic can be analyzed and compiled ahead of time may provide a better foundation for Antiky than architectures that construct substantial portions of the rendering system dynamically at runtime.

This hypothesis is particularly relevant to Antiky because TypeScript is already expected to be a major language throughout the engine and surrounding tooling.

It also creates an unusually consistent environment for coding agents, which generally have extensive experience generating, understanding, debugging, and modifying TypeScript.

---

# Primary Research Question

The primary research question is:

> Should Antiky adopt a TypeScript-first rendering architecture where shaders, pipelines, and rendering logic are authored in TypeScript and compiled ahead of time, or should it rely more heavily on runtime-driven rendering systems where shader graphs, pipelines, materials, or other rendering structures are assembled during application execution?

This is not simply an AOT versus JIT comparison.

The deeper question is:

> How much of Antiky's rendering system can and should become known, validated, optimized, and materialized during the build?

---

# Why Investigate This Now

Rendering architecture affects much more than how shaders are written.

The decision influences:

* material systems
* asset compilation
* pipeline caching
* rendering APIs
* engine startup
* error handling
* build tooling
* scene representation
* shader variants
* renderer abstraction boundaries
* development workflow
* agent interaction with graphics code

Changing these assumptions later can require significant restructuring.

Antiky is still early enough that this research can influence the foundation rather than retrofit an established rendering system.

The current objective is therefore to gather evidence before committing deeply to any one shader/compiler architecture.

---

# WebGPU and the Meaning of AOT

WebGPU applications ultimately provide shader programs to the WebGPU implementation, typically as WGSL.

The WebGPU implementation and underlying graphics driver still perform platform-specific compilation work before those shaders execute on the GPU.

Therefore, Antiky cannot eliminate all runtime GPU compilation.

The AOT research concerns the work that happens **before WGSL reaches WebGPU**.

A runtime-oriented pipeline may look conceptually like:

```text
Application starts
        ↓
shader representation loaded
        ↓
shader graph / AST / DSL processed
        ↓
dependencies resolved
        ↓
variants selected
        ↓
WGSL generated
        ↓
WebGPU shader module created
        ↓
GPU/driver compilation
```

An AOT-oriented pipeline may instead look like:

```text
BUILD

TypeScript shader source
        ↓
compiler / linker
        ↓
dependency resolution
        ↓
variant generation
        ↓
resource layout generation
        ↓
validation
        ↓
WGSL + metadata


RUNTIME

WGSL + metadata
        ↓
WebGPU shader module
        ↓
GPU/driver compilation
```

The research asks whether moving the first group of operations into the build produces meaningful architectural or practical advantages for Antiky.

---

# Historical Starting Point

BroMetal originally demonstrated an interesting architectural idea for Antiky:

```text
TypeScript
    ↓
Ahead-of-Time shader compiler
    ↓
WGSL
    ↓
small WebGPU runtime
```

The important idea is not BroMetal itself.

The important idea is:

> TypeScript can be used as the shader-authoring language while shader generation occurs before application runtime.

BroMetal should therefore be treated in this research as a **control sample for a TypeScript-first AOT design point**.

It demonstrates that the basic model is viable and gives the research a concrete implementation against which other approaches can be compared.

---

# Why TypeScript Matters

TypeScript is not being considered merely because it is convenient.

Antiky already has strong reasons to prefer TypeScript as a common representation layer across the engine.

A TypeScript-first rendering system could potentially allow game developers and agents to work within a more unified environment:

```text
game systems
scene logic
renderer configuration
materials
shader logic
tools
editor
asset processing
tests
```

rather than introducing specialized languages or representations for each layer.

That does not mean every implementation detail must literally be TypeScript.

Generated artifacts can and should use specialized formats where appropriate.

The important question is whether **TypeScript can remain the primary authoring and reasoning layer**.

---

# LLM and Agent Considerations

Antiky is intended to support agent-assisted development as a first-class workflow.

This makes language choice relevant in ways that differ from conventional game-engine design.

Modern coding models have broad exposure to:

* JavaScript
* TypeScript
* React
* Node.js
* browser APIs
* npm
* Vite
* testing frameworks
* TypeScript compiler diagnostics
* common frontend architectures

They can generally reason about these environments with relatively little specialized context.

A rendering system that exposes shaders and rendering contracts as understandable TypeScript may therefore offer benefits when agents are asked to:

* create a material
* modify lighting
* debug a rendering issue
* add an effect
* understand resource flow
* refactor shader helpers
* inspect pipeline configuration
* generate rendering tests
* reason across engine and shader boundaries

This is a research hypothesis rather than an assumption.

The project should eventually test whether TypeScript-first GPU authoring actually improves agent performance in practice.

---

# TypeScript as a Rendering Representation

One of the deeper questions behind this research is whether TypeScript can become something close to a **compile-time representation for rendering systems**.

For example:

```ts
const fragment = (input: FragmentInput) => {
  'use gpu';

  const color = sampleTexture(input.uv);

  if (color.a < alphaCutoff) {
    discard();
  }

  return color;
};
```

could represent shader behavior to the developer and agent.

Build tooling could transform it into:

```text
TypeScript AST
       ↓
GPU-specific representation
       ↓
WGSL
```

The resulting WGSL becomes the runtime artifact.

This potentially allows TypeScript to remain the source of truth without requiring the TypeScript representation itself to exist at runtime.

---

# TypeGPU

TypeGPU is an important research target because it closely matches the TypeScript-first hypothesis.

TypeGPU allows shader functions to be authored using JavaScript/TypeScript syntax and generates WGSL from those functions.

Its normal architecture performs two broad stages.

First, build tooling identifies GPU functions and converts their JavaScript/TypeScript structure into a compact representation.

Later, TypeGPU resolves that representation and its dependencies into WGSL.

Conceptually:

```text
TypeScript
    ↓
build-time parsing
    ↓
TypeGPU representation
    ↓
runtime resolution
    ↓
WGSL
```

This provides an excellent developer experience, but the default architecture leaves shader resolution and WGSL generation in the runtime.

That leads directly to one of the primary experiments in this repository.

---

# TypeGPU-Antiky

`typegpu-antiky` explores whether TypeGPU can be used differently:

> TypeGPU provides the TypeScript shader language and compiler infrastructure, while Antiky moves final shader resolution and artifact generation into the build.

Conceptually:

```text
TypeScript
    ↓
TypeGPU tooling
    ↓
TypeGPU compiler/linker
    ↓
Antiky AOT build stage
    ↓
WGSL
    +
pipeline metadata
    +
resource metadata
    ↓
Antiky runtime
```

The production application should not need to execute TypeGPU shader-resolution logic.

This would make TypeGPU primarily a **compiler frontend** for Antiky rather than the renderer itself.

---

# TypeGPU-Antiky Research Question

The major technical question is:

> Can TypeGPU's shader representation be completely resolved during the build into deterministic runtime artifacts without losing the aspects of TypeGPU that make TypeScript shader authoring attractive?

The experiment should determine whether the answer is:

1. straightforward,
2. possible with a thin adapter,
3. possible but requires substantial coupling to TypeGPU internals,
4. or impractical.

That distinction will strongly influence whether TypeGPU is suitable as a foundation.

---

# Desired TypeGPU-Antiky Build Model

An ideal Antiky shader source might look conceptually like:

```ts
export default defineShader({
  vertex,
  fragment,

  layouts: {
    scene,
    material,
  },

  pipeline: {
    primitive: {
      topology: 'triangle-list',
    },

    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  },
});
```

During the build:

```text
my-material.shader.ts
        ↓
TypeGPU / Antiky compiler
        ↓
my-material.shader.generated.ts
```

The generated artifact might contain:

```ts
export const shader = {
  wgsl: `...`,

  entryPoints: {
    vertex: 'vertexMain',
    fragment: 'fragmentMain',
  },

  bindGroups: [...],

  vertexBuffers: [...],

  targets: [...],

  pipeline: {...},
};
```

Runtime code then only needs to translate the static artifact into WebGPU resources.

---

# Runtime Boundary

A major part of the research is identifying the correct boundary between:

```text
compiler
```

and:

```text
renderer
```

An ideal Antiky architecture would separate them clearly.

The compiler owns things such as:

* shader parsing
* shader dependency resolution
* specialization
* shader variants
* WGSL generation
* resource contract generation
* static validation
* artifact generation

The renderer owns:

* GPU device lifecycle
* buffers
* textures
* samplers
* bind groups
* shader modules
* render pipelines
* compute pipelines
* command encoding
* render passes
* resource lifetime
* pipeline caching

This separation allows Antiky to potentially replace either side independently.

---

# Static Resource Contracts

AOT compilation becomes much more useful if shader resource contracts are also known during the build.

Instead of discovering bindings dynamically, Antiky should investigate generating stable descriptions such as:

```text
group 0
  binding 0
  scene camera uniform

group 1
  binding 0
  material texture

  binding 1
  material sampler

  binding 2
  material parameters
```

The generated artifact could provide both:

```text
WGSL declarations
```

and:

```text
TypeScript/runtime metadata
```

from the same source.

This reduces the possibility that CPU-side binding logic and shader-side declarations drift apart.

---

# Shader Variants

Shader variants are an important test of the AOT model.

Games often require combinations such as:

```text
opaque
alpha cutout
transparent

static
skinned

lit
unlit

shadow caster
normal render

fog
no fog
```

A runtime shader system may dynamically construct these combinations.

An AOT system instead needs to determine which combinations should exist before runtime.

The research should investigate whether Antiky can treat shader variants similarly to compiled game assets:

```text
material definition
        ↓
variant discovery
        ↓
build
        ↓
shader catalog
```

The goal is not necessarily to compile every theoretical permutation.

The goal is to determine which variants a game or asset set actually requires and compile those variants ahead of time.

---

# Asset Compilation

This research may eventually connect shader compilation with a broader Antiky asset pipeline.

For example:

```text
source model
source material
textures
shader definition
        ↓
Antiky asset compiler
        ↓
mesh
optimized textures
material
shader variants
pipeline metadata
```

This would make rendering configuration part of the compiled game artifact rather than something reconstructed repeatedly during runtime.

The current research does not need to build the full asset compiler.

However, architectural choices should avoid preventing this direction.

---

# WESL

WESL represents another important AOT design point.

Its philosophy differs substantially from TypeGPU.

Instead of using TypeScript as the shader language, WESL extends WGSL with software-engineering features such as modularity and build-time linking.

Conceptually:

```text
WESL
   ↓
build-time linker
   ↓
WGSL
   ↓
WebGPU
```

WESL is interesting because it remains close to the WebGPU standard shader language while still enabling static build pipelines.

It provides a useful comparison against TypeScript-first systems.

The research question is:

> Does the simplicity and standards proximity of WESL outweigh the benefits of using TypeScript as the primary shader-authoring representation?

---

# Three.js and TSL

Three.js provides an important reference point because it represents a mature, higher-level renderer architecture.

Modern Three.js WebGPU rendering uses a node-based shader representation through TSL.

This enables developers to construct shader behavior through JavaScript/TypeScript APIs.

However, the overall rendering architecture is significantly more runtime-oriented.

Three.js may determine:

* materials
* shader graph composition
* renderer capabilities
* pipeline configurations
* rendering paths

while the application is running.

This makes Three.js useful as a baseline for a different philosophy:

> Rich runtime renderer intelligence versus greater build-time materialization.

The research is not attempting to reproduce all of Three.js.

It is comparing the consequences of these architectural choices.

---

# BroMetal

BroMetal represents the most direct existing example of the original TypeScript-first AOT concept.

Its relevant model is:

```text
TypeScript shader source
        ↓
build-time compiler
        ↓
WGSL
        ↓
small WebGPU runtime
```

For this research, BroMetal primarily serves as:

* an AOT reference implementation
* a TypeScript-first control
* a comparison point for TypeGPU-Antiky
* evidence about how small an AOT runtime can be

The research should evaluate architectural properties rather than attempting to preserve implementation compatibility.

---

# Raw WebGPU

All of these technologies eventually sit above WebGPU.

Therefore, part of the research should continually ask:

> Which responsibilities belong in Antiky versus which responsibilities are simply abstractions around WebGPU?

Raw WebGPU exposes primitives such as:

* GPUDevice
* GPUBuffer
* GPUTexture
* GPUSampler
* GPUShaderModule
* GPUBindGroup
* GPUBindGroupLayout
* GPURenderPipeline
* GPUComputePipeline
* GPUCommandEncoder
* GPURenderPassEncoder

An Antiky renderer does not necessarily need a large abstraction over these APIs.

One possible outcome of the research is:

```text
Antiky compiler
       ↓
static artifacts
       ↓
thin Antiky WebGPU renderer
       ↓
WebGPU
```

That possibility should remain open.

---

# Renderer Versus Engine

Antiky should avoid making the graphics technology synonymous with the engine architecture.

Conceptually:

```text
Antiky Engine
    │
    ├── world
    ├── simulation
    ├── commands
    ├── events
    ├── assets
    ├── inspection
    └── rendering interface
             │
             ▼
        Antiky Renderer
             │
             ▼
           WebGPU
```

This separation matters for:

* testing
* headless execution
* editor previews
* sandbox worlds
* server-side simulation
* future renderer changes

The renderer should consume engine state rather than define the engine's core data model.

---

# Render Representation

Long term, Antiky may benefit from having an intermediate render representation between the world and WebGPU.

For example:

```text
World
  ↓
Render extraction
  ↓
Render scene / snapshot
  ↓
Renderer
  ↓
WebGPU
```

This could describe:

* visible objects
* transforms
* meshes
* materials
* cameras
* lights
* effects

The WebGPU renderer then operates on that representation.

This architecture would allow the world simulation and rendering implementation to evolve independently.

The current shader research should avoid creating assumptions that prevent such a boundary.

---

# TypeScript Centrality

This is one of the most important evaluation dimensions.

For each architecture, ask:

* How much rendering behavior is expressed directly in TypeScript?
* Is TypeScript the primary source of truth?
* Can the rendering system be understood by inspecting TypeScript source?
* Can TypeScript tooling inspect the relevant contracts?
* Can TypeScript compiler diagnostics help identify mistakes?
* Can agents modify the renderer without learning a second major representation system?
* How much important logic exists only inside runtime shader graphs or framework internals?

A TypeScript-first architecture does not require avoiding WGSL internally.

It means developers and agents primarily interact with TypeScript while WGSL becomes a generated artifact where practical.

---

# Build-Time Knowledge

A central principle worth testing is:

> If something is already known during the build, Antiky should evaluate whether there is any benefit to rediscovering or regenerating it at runtime.

Examples include:

* shader source
* shader dependencies
* vertex layouts
* bind group layouts
* material resource requirements
* known shader variants
* render target formats
* pipeline state
* asset relationships

Some runtime variability will always exist.

The research should determine which parts are genuinely dynamic and which parts are merely traditionally performed at runtime.

---

# Determinism

AOT architectures may improve reproducibility.

Given identical inputs:

```text
source
assets
compiler version
configuration
```

the build should ideally generate identical rendering artifacts.

This enables:

* reproducible builds
* artifact hashing
* caching
* debugging
* regression testing
* easier inspection
* easier agent reasoning

The research should examine how deterministic each approach is.

---

# Build Errors Versus Runtime Errors

AOT potentially changes when rendering errors appear.

Runtime approach:

```text
developer runs game
       ↓
specific rendering path executes
       ↓
shader generated
       ↓
shader fails
```

AOT approach:

```text
developer builds
       ↓
shader generated
       ↓
shader validation fails
       ↓
build fails
```

Moving failures earlier can improve development workflows.

The research should measure both:

* which errors can actually move to build time
* how useful the resulting diagnostics are

A technically earlier error is not necessarily better if the error message becomes impossible to understand.

---

# Developer Experience

Performance is only one part of this decision.

Each approach should be evaluated for:

* shader readability
* discoverability
* IDE support
* autocomplete
* type safety
* error messages
* refactoring
* reusable helpers
* module composition
* debugging
* shader inspection
* hot reload
* build speed
* learning curve

A rendering architecture that saves a few milliseconds but makes graphics development dramatically harder may not be desirable.

---

# Agent Experience

Agent effectiveness should eventually be treated as a separate evaluation dimension.

Possible tasks include:

```text
Add alpha cutout.

Add distance fog.

Add a dissolve effect.

Create a toon-lighting material.

Add another point light.

Add a shader variant.

Diagnose an invalid shader.

Refactor duplicated shader logic.
```

Observe:

* whether the agent understands the representation
* number of failed attempts
* compiler feedback quality
* ability to inspect generated output
* amount of specialized documentation required
* amount of human intervention

This can help determine whether the TypeScript-first hypothesis produces practical benefits.

---

# Runtime Performance

Once the same WGSL reaches the GPU and pipelines have been created, the method used to author or generate that WGSL may have little effect on steady-state rendering performance.

Therefore, the research should not assume AOT will significantly improve FPS.

It is entirely plausible that:

```text
AOT
runtime-generated
```

approaches produce effectively identical steady-state GPU performance.

Runtime benchmarking is still important to verify this.

If FPS is similar, that itself is useful evidence because the decision can then focus on other architectural properties.

---

# Startup Performance

Startup is more likely to reveal differences between compilation models.

Potential runtime work includes:

```text
JavaScript evaluation
shader representation initialization
shader graph traversal
dependency resolution
shader specialization
WGSL generation
shader module creation
pipeline creation
driver compilation
```

AOT can potentially remove some of those steps.

The research should isolate them where possible rather than reporting only one large "startup time" number.

---

# Unavoidable Runtime Work

AOT should not be presented as eliminating all runtime graphics initialization.

Antiky will still need to perform operations such as:

* obtaining a GPU adapter
* creating a GPU device
* configuring the canvas
* creating GPU buffers
* uploading textures
* creating shader modules
* creating pipelines
* allocating render targets

Some driver-level shader and pipeline compilation remains unavoidable.

The research should clearly distinguish:

```text
application-level shader generation
```

from:

```text
GPU implementation / driver compilation
```

---

# Build Performance

AOT moves work from runtime into the build.

That creates a tradeoff.

The research should measure:

* clean build time
* incremental build time
* shader-only rebuild time
* development watch latency

An AOT architecture that dramatically increases edit/build/run latency could hurt development even if production startup improves.

The ideal architecture should support:

```text
fast development rebuild
+
fully materialized production artifacts
```

---

# Bundle Composition

A major research question is not merely bundle size but **what ships**.

For each implementation inspect whether production bundles include:

* shader parsers
* AST representations
* shader linkers
* shader generators
* framework-specific compiler machinery
* generated WGSL
* shader manifests

AOT's architectural benefit may be visible more clearly through bundle composition than raw byte count.

For example:

```text
runtime shader compiler removed
```

may be desirable even if compression makes the total size difference relatively small.

---

# Benchmark Philosophy

The benchmark should compare equivalent workloads rather than identical implementations.

Different renderers expose different abstractions.

Trying to force source-level equivalence would distort the comparison.

Instead ensure that each demo performs approximately equivalent rendering work:

* same assets
* same scene
* same camera
* same resolution
* similar lighting
* similar material complexity
* equivalent effects
* equivalent animation

Exact pixels do not need to match.

The workloads need to be comparable enough that performance numbers remain meaningful.

---

# Reference Demo Selection

A shared demo should provide enough rendering complexity to expose architectural differences.

Useful characteristics include:

* several shader programs
* multiple materials
* textures
* lighting
* animation
* significant fragment work
* transparency or alpha testing
* post-processing
* shadows
* instancing
* multiple render passes

The project should avoid a trivial triangle benchmark.

It should also avoid a reference application whose architecture is so deeply coupled to one renderer that recreating it becomes the primary research task.

The demo is a workload, not the subject of the research.

---

# Framework Implementations

The research monorepo should eventually contain:

```text
packages/
  typegpu-antiky
  demo-brometal
  demo-typegpu
  demo-typegpu-antiky
  demo-wesl
  demo-threejs
  benchmark
```

Each demo represents a different architectural point.

---

# Three.js Baseline

`demo-threejs` should represent a mature runtime-oriented rendering system.

Use the framework naturally.

Do not artificially disable its normal capabilities simply to resemble the lower-level renderers.

Record which rendering responsibilities Three.js handles automatically.

---

# BroMetal Baseline

`demo-brometal` should represent TypeScript-first AOT shader generation with a relatively thin runtime.

Use it primarily as an architectural comparison for TypeGPU-Antiky.

---

# Standard TypeGPU

`demo-typegpu` should use the normal TypeGPU workflow.

This is critical.

Do not convert the standard TypeGPU demo to AOT.

It should demonstrate the default TypeGPU model so that the research can compare:

```text
TypeGPU normal
```

against:

```text
TypeGPU-Antiky AOT
```

---

# TypeGPU-Antiky

`demo-typegpu-antiky` should use exactly the architecture being tested:

```text
TypeScript authoring
        ↓
TypeGPU compiler capabilities
        ↓
Antiky AOT generation
        ↓
static WGSL
        ↓
thin renderer runtime
```

The runtime should not execute shader generation.

---

# WESL

`demo-wesl` should represent an AOT system close to WGSL itself.

This provides a valuable comparison between:

```text
TypeScript-first AOT
```

and:

```text
WGSL-first AOT
```

---

# Benchmark Dimensions

The first benchmark should capture at least:

## Build

* clean build time
* incremental build time
* shader rebuild time
* output size

## Startup

* script evaluation
* WebGPU initialization
* shader preparation
* shader module creation
* pipeline creation
* first frame
* time to interactive scene

## Runtime

* average FPS
* frame-time median
* frame-time p95
* frame-time p99
* CPU frame time where practical
* GPU frame time where practical

## Structure

* shader module count
* pipeline count
* generated WGSL size
* production JavaScript size
* compiler/runtime packages shipped

---

# Benchmark Repetition

Performance measurements should use repeated runs.

Single measurements are too sensitive to:

* browser startup
* operating-system scheduling
* driver caching
* JIT compilation
* thermal state
* background processes

Results should generally emphasize medians rather than a single best run.

Raw measurements should be retained.

---

# Cold and Warm Startup

Cold and warm startup should be measured separately.

Cold startup attempts to represent first execution.

Warm startup represents repeated execution with caches and process state already established.

These answer different questions and should not be combined into a single result.

---

# Browser Compilation Caching

WebGPU implementations and graphics drivers may cache shader or pipeline compilation internally.

This can significantly influence repeated startup tests.

Benchmark methodology should document:

* browser lifecycle
* page lifecycle
* cache clearing
* browser profile usage
* warmup runs

Perfectly controlling driver caches may not be possible.

The important requirement is consistency and transparency.

---

# Visual Validation

Equivalent rendering should be verified using deterministic screenshots.

Useful frames might include:

```text
initial frame
mid-animation frame
later animation frame
```

The purpose is not pixel-perfect matching.

The screenshots should demonstrate that each implementation is performing a comparable workload.

---

# Research Artifacts

The project should retain intermediate findings instead of waiting until the final article.

Useful files include:

```text
docs/
  research-plan.md
  research-log/
  findings/
```

Individual experiments should capture:

```text
Question
Hypothesis
Experiment
Result
Unexpected findings
Impact on Antiky
```

This prevents conclusions from depending on memory after weeks of experimentation.

---

# Questions to Answer About TypeGPU-Antiky

The most important implementation questions include:

* Can shader resolution run entirely during the build?
* Can all required shader dependencies be discovered statically?
* Can final WGSL be emitted deterministically?
* Can TypeGPU's runtime resolver be absent from production?
* Can Tinyest shader metadata be absent from production?
* Can pipeline metadata also be generated?
* Can bind group layouts be static?
* Can vertex layouts be generated?
* Can shader variants be generated ahead of time?
* Can the build reject runtime-only shader patterns?
* Can TypeGPU remain on the development side of the compiler/runtime boundary?
* How much TypeGPU internal API knowledge does the adapter require?
* Can TypeGPU upgrades be adopted without repeatedly rewriting the adapter?
* Can the generated artifacts remain understandable without TypeGPU?

---

# Questions About Antiky's Renderer

Beyond shader compilation, the research should help answer:

* How thin should Antiky's WebGPU renderer be?
* Should Antiky expose WebGPU concepts directly where they are already good abstractions?
* What should Antiky wrap?
* Which resource lifetimes should the renderer own?
* How should pipelines be cached?
* How should shader artifacts be identified?
* Should material definitions point directly to compiled shader artifacts?
* How should rendering integrate with the asset pipeline?
* How should a headless engine operate without a renderer?
* How should editor and preview rendering reuse the same runtime?

Not every question must be solved during this experiment.

The goal is to avoid selecting a shader/compiler architecture that makes later answers unnecessarily difficult.

---

# Potential Antiky Architecture

One possible destination being investigated is:

```text
                 ANTIKY PROJECT

TypeScript game code
TypeScript shader definitions
materials
assets
        │
        ▼

                 BUILD

Antiky compiler
TypeGPU frontend
asset processing
shader specialization
WGSL generation
pipeline generation
validation
        │
        ▼

            GAME ARTIFACTS

compiled assets
static WGSL
shader manifests
material manifests
pipeline metadata
        │
        ▼

                RUNTIME

Antiky Engine
      │
      ▼
render extraction
      │
      ▼
Antiky WebGPU Renderer
      │
      ▼
WebGPU
```

This is a hypothesis, not the predetermined outcome.

The research should validate or reject it.

---

# Possible Outcome: TypeGPU-Antiky

A successful TypeGPU-Antiky experiment would suggest:

```text
TypeGPU
=
shader language frontend
+
type system
+
compiler/linker infrastructure
```

while:

```text
Antiky
=
AOT orchestration
+
artifact format
+
asset integration
+
WebGPU runtime
```

This would avoid Antiky having to maintain its own complete TypeScript-to-WGSL compiler.

---

# Possible Outcome: BroMetal-Style Compiler

The research may instead show that a dedicated, purpose-built compiler provides a cleaner architecture.

That could mean Antiky benefits from owning a relatively small TypeScript shader language whose semantics are intentionally constrained around the engine.

This would increase compiler ownership but reduce dependency on another system's runtime model.

---

# Possible Outcome: WESL

The research may show that using a shader-specific language provides enough advantages that TypeScript shader authoring is not worth the additional compiler complexity.

In that case Antiky could remain TypeScript-first at the engine level while using WESL/WGSL as the intentional graphics-language boundary.

---

# Possible Outcome: Runtime Renderer

The research may also show that runtime shader generation has negligible practical cost while providing significant flexibility.

If so, a richer runtime renderer architecture may be more appropriate.

AOT should not be adopted merely because it feels architecturally cleaner.

The benchmark and implementation experience should influence the decision.

---

# Evaluation Principles

The final decision should consider several dimensions simultaneously.

## Architecture

* compiler/runtime separation
* determinism
* inspectability
* modularity
* asset-pipeline compatibility

## TypeScript Centrality

* how much rendering logic lives in TypeScript
* static analyzability
* source-of-truth clarity
* cross-system reasoning

## Developer Experience

* authoring
* diagnostics
* debugging
* iteration
* tooling

## Agent Experience

* code generation
* modification
* error recovery
* reasoning across systems

## Runtime

* startup
* CPU overhead
* steady-state rendering
* memory
* bundle composition

## Build

* clean compilation
* incremental compilation
* caching
* artifact generation

## Maintainability

* amount of custom compiler infrastructure
* dependency surface
* standards alignment
* ease of understanding generated artifacts

No single dimension should determine the answer automatically.

---

# Expected Performance Hypothesis

A reasonable starting hypothesis is:

> AOT shader generation will produce its largest measurable differences during application initialization rather than during steady-state GPU rendering.

Once equivalent WGSL has been compiled into equivalent GPU pipelines, FPS may be effectively identical.

If that occurs, AOT should instead be judged primarily by:

* startup
* deterministic behavior
* runtime simplicity
* build-time error detection
* artifact caching
* developer experience
* agent experience
* maintainability

This is an important outcome even if no dramatic FPS improvement appears.

---

# Expected TypeGPU Hypothesis

Another working hypothesis is:

> TypeGPU may offer Antiky a stronger long-term foundation than maintaining an entirely custom TypeScript shader compiler if its TypeScript authoring experience and compiler infrastructure can be separated cleanly from its normal runtime shader-resolution architecture.

The critical word is **cleanly**.

If creating TypeGPU-Antiky requires continuously depending on unstable internal implementation details, the apparent reduction in compiler ownership may not be real.

This needs to be learned through implementation.

---

# Expected TypeScript Hypothesis

The strongest architectural hypothesis remains:

> Using TypeScript as the primary authoring representation for rendering logic may create unusually strong alignment between Antiky's engine code, tooling, build system, and coding-agent workflow.

This advantage may be more strategically important to Antiky than a small raw rendering-performance difference.

However, the research should validate whether TypeScript remains pleasant once shader programs become substantially more sophisticated.

Simple examples are insufficient evidence.

---

# What This Research Is Not

This project is not intended to determine:

* the universally best WebGPU framework
* the universally fastest JavaScript renderer
* whether Three.js is a good general-purpose graphics library
* whether WGSL is a good shader language
* whether every shader should be compiled AOT
* whether Antiky needs to invent a new graphics API

It is specifically about selecting a strong rendering/compiler foundation for Antiky.

---

# Immediate Execution Path

The practical research sequence is:

```text
1. Implement TypeGPU-Antiky AOT proof of concept

2. Select a sufficiently complex shared demo

3. Implement equivalent workloads using:
   - Three.js
   - BroMetal
   - TypeGPU
   - TypeGPU-Antiky
   - WESL

4. Build automated benchmark instrumentation

5. Run repeated benchmarks

6. Inspect production bundles and generated artifacts

7. Document development experience

8. Evaluate agent interaction

9. Write Antiky rendering architecture findings

10. Use the evidence to set the renderer/compiler foundation
```

The project should resist prematurely turning the prototype into production Antiky infrastructure.

The first objective is learning.

---

# Final Research Deliverable

At the conclusion of the project, the evidence should support a clear answer to:

> What should be the foundational relationship between TypeScript, shader authoring, shader compilation, WebGPU, and the Antiky renderer?

The answer should describe more than a library choice.

It should establish principles for Antiky such as:

```text
what belongs at build time
what belongs at runtime
what developers author
what agents manipulate
what artifacts ship
what the renderer owns
what the compiler owns
```

The output should be strong enough to guide future work on:

* materials
* rendering
* asset compilation
* Antiky Studio
* game builds
* agent tooling
* shader libraries
* pipeline management

---

# Long-Term Research Narrative

If the results support the hypothesis, this work can provide the technical foundation for explaining why Antiky favors AOT rendering architecture.

The eventual argument should not be:

> Runtime compilation is bad.

It should instead be:

> Game builds already know a significant amount about their rendering architecture. Antiky is investigating how much of that knowledge can be converted into validated, deterministic artifacts before the player launches the game.

And for TypeScript specifically:

> If developers and coding agents can author those systems in TypeScript while Antiky turns them into efficient WebGPU artifacts during the build, TypeScript can serve as the development representation without requiring the same representation to survive into runtime.

That is the architectural proposition this research exists to test.
