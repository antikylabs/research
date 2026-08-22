# Pipeline library

This is a flat catalog of concise, source-faithful AI-assisted game-development workflows. Each
page preserves one source's order and gates. Admission records only that the workflow is auditable;
it makes no effectiveness, recommendation, portability, or production-readiness claim.

For a compact title-and-description catalog, see [the pipeline index](PIPELINE_INDEX.md).

## Page contract

Every `pipeline-<group-name>-<name>.md` page must:

- name its scope, trigger, source, author, evidence date, evidence signals, and limits;
- show one top-level Mermaid path with at most nine main nodes;
- preserve the source's order, feedback gate, outputs, failure conditions, and stop condition;
- label editorial inference in both prose and the diagram;
- separate observed supporting skills from potential supporting skills; and
- use direct, auditable citations.

Follow [the researcher guide](RESEARCHER.md) to harvest a target, then copy
[the pipeline template](PIPELINE_TEMPLATE.md) for each admitted page.

## Evidence vocabulary

Evidence signals are cumulative and remain separate:

| Signal | Meaning |
| --- | --- |
| Source-documented | A primary source states the flow |
| Author-practiced | Public artifacts show the author applying it |
| Study-observed | A study records participants, trials, artifacts, or outcomes |
| Production-used | A named team reports using it in a named production context |
| Independently validated | Evidence outside the source evaluates or reproduces it |

## Pipelines

| Pipeline | Scope | Evidence signals |
| --- | --- | --- |
| [Three.js visual-system validation](pipeline-threejs-visual-system-validation.md) | Verification of an authored Three.js visual system | Source-documented; Author-practiced |
| [Three.js final-image pipeline](pipeline-threejs-final-image.md) | Technical graphics: coordinating multiple image-space systems in a Three.js scene | Source-documented; Author-practiced |
| [Thrixel Goal to Game pipeline](pipeline-thrixel-goal-to-game.md) | End-to-end | Source-documented |
| [Fast gameplay prototyping](pipeline-gamedev-skills-fast-gameplay-prototyping.md) | Prototyping | Source-documented |
| [Game-jam delivery](pipeline-gamedev-skills-game-jam-delivery.md) | Delivery | Source-documented |
| [Game-asset production](pipeline-gamedev-skills-game-asset-production.md) | Asset | Source-documented |
| [Level blockout, teach, and test](pipeline-gamedev-skills-level-blockout-teach-test.md) | Discipline | Source-documented |
| [Pearl Sea Park staged agent build](pipeline-pearl-sea-park-staged-agent-build.md) | End-to-end, stage-gated construction of a Three.js/WebGPU game | Source-documented; Author-practiced |
| [Pearl Sea Park simulation-first ride geometry correction](pipeline-pearl-sea-park-simulation-first-ride-geometry-correction.md) | Technical gameplay geometry and ride verification | Source-documented; Author-practiced |
| [Pearl Sea Park measured performance recovery](pipeline-pearl-sea-park-measured-performance-recovery.md) | Performance diagnosis and recovery | Source-documented; Author-practiced |
| [Unreal package and runtime validation](pipeline-unreal-package-runtime-validation.md) | Engine-specific build and runtime verification | Source-documented |
| [Unity build and runtime validation](pipeline-gamedev-skills-unity-build-runtime-validation.md) | Engine-specific build and runtime verification | Source-documented |
| [Godot export and runtime validation](pipeline-gamedev-skills-godot-export-runtime-validation.md) | Engine-specific export and runtime verification | Source-documented |
| [itch.io Butler publish and update](pipeline-itchio-butler-publish-update.md) | Storefront delivery and update | Source-documented |
| [Steamworks SteamPipe build and release](pipeline-steamworks-steampipe-build-release.md) | Storefront build, test, review, release, and update | Source-documented |
| [Three.js gameplay-relationship bench](pipeline-thrixel-threejs-gameplay-relationship-bench.md) | Non-visual gameplay verification | Source-documented; Author-practiced |
| [Unity imported-asset inspection and play-mode validation](pipeline-thrixel-unity-imported-asset-validation.md) | Engine-specific asset verification | Source-documented |
| [ThreeUI source-exact component porting](pipeline-threeui-source-exact-component-porting.md) | Technical graphics: porting one catalog visual into an existing application | Source-documented |
| [3AGameFactory requirement-to-playable-slice pipeline](pipeline-gamefactory-game-slice.md) | End-to-end: coordinated assets, gameplay, UI, engine integration, and playability evidence | Source-documented; Author-practiced |
| [3AGameFactory gameplay-video validation](pipeline-gamefactory-gameplay-video-validation.md) | Verification: representative play, recorded review, defect ownership, and re-verification | Source-documented |
| [3AGameFactory image and T-pose preparation](pipeline-gamefactory-image-preparation.md) | Asset: single-subject reconstruction concepts and transparent character T-poses | Source-documented |
| [3AGameFactory generated-mesh review and disposition](pipeline-gamefactory-generated-mesh-review.md) | Verification: deciding whether an image-to-3D mesh is fit for a browser game | Source-documented |
| [3AGameFactory imported-asset orientation review](pipeline-gamefactory-orientation-review.md) | Verification: vision-based facing, up-axis, and scale metadata for a staged mesh | Source-documented; Author-practiced |
| [3AGameFactory 3D-scene strategy and assembly](pipeline-gamefactory-scene-strategy.md) | Asset: selecting and executing a licensed, composed, or reconstructed 3D-scene route | Source-documented |
| [3AGameFactory motion acquisition, retargeting, and import](pipeline-gamefactory-motion-retarget.md) | Asset: obtaining, rigging, retargeting, importing, and visually checking humanoid motion | Source-documented; Author-practiced |
| [3AGameFactory audio acquisition, generation, and in-game QA](pipeline-gamefactory-audio-generation.md) | Asset: dialogue, one-shots, foley, ambience, and offline WAV validation | Source-documented |
| [3AGameFactory CG directing-envelope authoring](pipeline-gamefactory-cg-director.md) | Asset planning: turning one game-CG intent into a validated model-specific task envelope | Source-documented |
| [3AGameFactory CG-video generation and QA](pipeline-gamefactory-cg-video.md) | Asset: directed text-, frame-, or reference-conditioned game-CG video | Source-documented; Author-practiced |
| [3AGameFactory mechanic generation and immutable publication](pipeline-gamefactory-mechanic-generation.md) | Discipline: game-owned mechanics, public runtime contract, native tests, and immutable artifact publication | Source-documented |
| [3AGameFactory native UI and Browser Play generation](pipeline-gamefactory-ui-browser-play.md) | Discipline: engine-native UI followed by a task-owned Browser Play delivery surface | Source-documented |
| [3AGameFactory VFX creation and visual approval](pipeline-gamefactory-vfx-approval.md) | Discipline: reusable UE5 or Unity effects, runtime lifecycle checks, and owner approval | Source-documented |
| [3AGameFactory asset-task pipeline development](pipeline-gamefactory-asset-task-development.md) | Discipline: adding a model-to-operator-to-runner asset task without GPU-first development | Source-documented |
| [3AGameFactory Blender generated-asset conditioning](pipeline-gamefactory-blender-generated-asset-conditioning.md) | Asset: neutral-DCC import, explicit conditioning, measurement, and re-export for a generated mesh | Source-documented; Author-practiced |
| [3AGameFactory Three.js generated-GLB release validation](pipeline-gamefactory-threejs-generated-glb-validation.md) | Verification: structural and real-loader validation of a generated glTF asset for a Three.js game | Source-documented |
| [3AGameFactory UE5 generated-asset import and reporting](pipeline-gamefactory-ue5-generated-asset-import.md) | Engine-specific asset: importing, saving, and measuring a generated mesh in UE5 | Source-documented; Author-practiced |
| [3AGameFactory Unity generated-asset import and visual inspection](pipeline-gamefactory-unity-generated-asset-import.md) | Engine-specific asset: turning a generated mesh into a measured Unity prefab and inspecting it in context | Source-documented; Author-practiced |
| [3AGameFactory Blender live spatial review](pipeline-gamefactory-blender-live-spatial-review.md) | Verification: walking a generated world in a long-lived Blender session before engine import | Source-documented; Author-practiced |
| [3AGameFactory Blender deterministic play and replay evidence](pipeline-gamefactory-blender-deterministic-play-replay.md) | Engine-specific verification: fixed-step simulation, live input capture, deterministic replay, and rendered evidence for a generated Blender mechanic | Source-documented; Author-practiced |
| [3AGameFactory Unity one-session game assembly](pipeline-gamefactory-unity-one-session-assembly.md) | Engine-specific assembly: installing generated game artifacts, importing dependencies, composing a scene, and building in one Unity Editor lifecycle | Source-documented |
| [Nova3D web-client paid or BYOK generation](pipeline-nova3d-web-client-generation.md) | Asset: preflighting, starting, monitoring, and retaining a hosted code-native 3D generation from the Flutter client | Source-documented |
| [Nova3D code-native generation, repair, and validation](pipeline-nova3d-code-native-generation.md) | Asset: text- or image-conditioned Blender program synthesis and structured GLB export | Source-documented; Author-practiced; Study-observed |
| [Nova3D MCP part-aware generation and refinement](pipeline-nova3d-mcp-refinement.md) | Asset: agent-driven structured generation, browser inspection, local part edits, and articulation | Source-documented |
| [Nova3D Blender add-on generation and local import](pipeline-nova3d-blender-import.md) | Asset: asynchronous code-native generation delivered into an active Blender scene | Source-documented |
| [Nova3D PBR texture generation and application](pipeline-nova3d-texture-generation.md) | Asset: AI-planned and painted PBR textures applied to an existing generated model | Source-documented |
| [Nova3D-Bench dual-pass specification freeze](pipeline-nova3d-benchmark-freeze.md) | Verification: creating auditable, frozen functional-part and constraint ground truth | Source-documented; Study-observed |
| [Nova3D bidirectional VLM shape evaluation](pipeline-nova3d-pairwise-shape-evaluation.md) | Verification: prompt-grounded pairwise shape comparison across generated 3D systems | Source-documented; Study-observed |
| [Nova3D local-edit evaluation](pipeline-nova3d-local-edit-evaluation.md) | Verification: testing whether a source-level AI edit changes its target while preserving the rest of a structured asset | Source-documented; Study-observed |
| [img2threejs staged procedural reconstruction](pipeline-img2threejs-procedural-reconstruction.md) | Asset: image-to-code procedural Three.js reconstruction with staged visual gates | Source-documented; Author-practiced |
| [img2threejs detail-first reference inventory](pipeline-img2threejs-detail-inventory.md) | Asset intake: evidence-linked micro-detail inventory before procedural specification | Source-documented; Author-practiced |
| [img2threejs image-grounded material pipeline](pipeline-img2threejs-material-reference.md) | Asset: per-region material identification, PBR authoring, controlled rendering, and acceptance | Source-documented |
| [img2threejs standard character reconstruction contract](pipeline-img2threejs-character-reconstruction.md) | Asset: anatomy-aware procedural or explicitly adapted character reconstruction for Three.js | Source-documented |
| [img2threejs projection-first character likeness design](pipeline-img2threejs-projection-first-likeness.md) | Asset design: single-image parametric character fitting and projected-texture likeness | Source-documented |
| [img2threejs GLB-mediated procedural reference route](pipeline-img2threejs-glb-mediated-reference.md) | Asset: rebuild a GLB reference as an independent procedural Three.js factory | Source-documented |
| [img2threejs CS2 knife image-matched reconstruction](pipeline-img2threejs-cs2-image-matched-reconstruction.md) | Asset: evidence-backed procedural reconstruction of a supported CS2 knife reference | Source-documented; Author-practiced |
| [img2threejs local CS2 texture acquisition](pipeline-img2threejs-cs2-texture-acquisition.md) | Asset intake: optional local exact-texture evidence acquisition for a CS2 finish | Source-documented |
| [img2threejs deterministic-first Divine Eye review](pipeline-img2threejs-divine-eye-review.md) | Verification: deterministic render/reference evaluation with a subordinate VLM gate | Source-documented |
| [img2threejs browser screenshot and agent-vision review](pipeline-img2threejs-browser-screenshot-review.md) | Verification: deterministic browser capture, comparison packaging, and semantic visual decision | Source-documented; Author-practiced |
| [img2threejs bounded visual self-correction](pipeline-img2threejs-bounded-self-correction.md) | Tuning: terminate or reroute an agent-driven visual correction loop from review history | Source-documented |
| [img2threejs analysis-by-synthesis parameter fitting](pipeline-img2threejs-analysis-by-synthesis-fitting.md) | Tuning: bounded deterministic coordinate descent against render-review fidelity | Source-documented |
| [img2threejs character rig validation and browser evidence](pipeline-img2threejs-character-rig-evidence.md) | Verification: procedural character rig payload, deformation, and screenshot evidence | Source-documented |
| [img2threejs layered procedural character assembly design](pipeline-img2threejs-character-layered-assembly.md) | Asset design: classify, construct, skin, and validate layered procedural character geometry | Source-documented |
| [img2threejs stylized procedural hair design](pipeline-img2threejs-stylized-hair.md) | Asset design: code-only stylized character hair for Three.js WebGL | Source-documented |
| [img2threejs measured creature-head construction](pipeline-img2threejs-creature-head-construction.md) | Asset design: reference-measured procedural head construction for the mini-dragon worked case | Source-documented |
| [img2threejs feature-scale fidelity microscope design](pipeline-img2threejs-feature-microscope.md) | Verification design: macro-to-micro visible-footprint review of critical asset features | Source-documented; Author-practiced |

## Five-minute cold-reader check

A reader should be able to identify, without opening the research outcome:

1. the trigger;
2. the ordered loop;
3. the feedback gate;
4. the outputs; and
5. the evidence level.

## Maintenance and verification

Refresh the primary source before editing a page. Preserve source-specific vocabulary and
contradictions, keep inference labeled, update the research mapping, and do not synthesize a house
pipeline from recurring shapes.

Run these checks from the repository root:

```sh
for file in experiments/game-dev-ai-pipelines/pipelines/*.md; do npx --yes markdown-link-check@3.15.0 "$file"; done
for file in experiments/game-dev-ai-pipelines/pipelines/pipeline-*.md; do npx --yes @mermaid-js/mermaid-cli@11.16.0 -i "$file" -o "/tmp/$(basename "$file")"; done
git diff --check
```

The Mermaid check uses Mermaid CLI 11.16.0 and its bundled Mermaid parser.
