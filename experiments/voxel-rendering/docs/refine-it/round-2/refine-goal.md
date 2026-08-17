# Round 2 refinement goal: Turn the voxel field lab into a render studio

This goal converts the owner feedback in [feedback.txt](./feedback.txt) into a bounded contract. It
refines the existing three-renderer WebGPU experiment; it does not replace the experiment or reduce
it to one renderer.

## Prerequisites

- Round 1 is complete and its current app, evidence, and limitations are the starting point.
- Use the images in [`../references`](../references) as the visual bar. The goal is not to copy one
  image, but to reproduce their convincing lighting, material separation, depth, scene completeness,
  and deliberate composition.
- A separate research phase is skipped because the feedback, current implementation, prior report,
  and local reference set are enough to define this refinement. The focused external-shader
  investigation remains part of the required outcome below.
- This goal owns the voxel-rendering experiment. Do not execute it concurrently with another goal
  that changes the same app, shader, scene, evidence, or documentation files.

### Needed from the owner before starting

Nothing. This goal can start as written. The owner performs the final visual review after the
objective evidence is complete.

## Goal

Deliver a served, Antiky-Studio-shaped voxel render mini-app in which a user can choose or drop a
complete voxel model, place it in an authored environment, navigate freely, and tune the camera,
sun, moon, materials, and presentation. Photorealistic and Stylized must be materially different
rendering treatments, not post-processing labels, and every existing rendering approach must honor
the studio controls.

## Acceptance criteria

1. **The output reaches a documented reference-led visual bar.**
   - A short reference analysis identifies at least three local reference images and the specific
     qualities being pursued: composition, light direction and contrast, material response,
     surface detail, depth cues, and atmosphere.
   - The final evidence shows a complete focal model, intentional foreground/middle/background
     composition, readable shadows, distinct material classes, and controlled highlights without
     obvious missing geometry or a flat untextured look.
   - Photorealistic evidence is reviewed against that analysis rather than accepted only because a
     preset is named “Photorealistic.” The owner gives the final visual sign-off.

2. **The app behaves as a render-studio mini-app.**
   - The served app presents the render stage and grouped controls for model, environment, camera,
     lighting, materials/presentation, renderer, and renderer reload.
   - Changing a control updates the live render without reloading the page. A **Reload renderer**
     action disposes and remounts the selected pipeline while preserving the selected model,
     environment, and control values.
   - The app works both through `npm run dev` and the existing Antiky game-module path, and its stage
     plus inspector remain usable at 1280 × 720 and 1024 × 768.

3. **The camera supports Minecraft-like fly navigation.**
   - With the stage focused, `W`, `A`, `S`, and `D` move forward, left, backward, and right relative
     to the current view; mouse movement changes yaw and pitch instead of orbiting a fixed target.
   - The user can deliberately enter and exit mouse-look, the active state is visible, and keyboard
     shortcuts do not capture input while a form control is being edited.
   - Movement is frame-rate independent, cannot create invalid camera vectors, and works unchanged
     when the model, environment, presentation, or rendering approach changes.
   - **Reset view** restores the documented initial position and orientation. Camera motion resets
     path-trace accumulation with a visible reset reason and does not remount raster pipelines.

4. **Depth of field is controllable, not baked into a preset.**
   - The studio exposes, at minimum, focus distance and aperture/blur-strength controls plus an
     enable switch and a reset-to-default action.
   - Focus distance visibly moves the sharp plane between foreground, subject, and background;
     aperture/strength visibly changes blur magnitude while the focus plane stays fixed.
   - Raster approaches and the path tracer use equivalent control semantics. Changing a
     sample-defining camera value resets path-trace accumulation with a visible reset reason.

5. **Time of day moves the sun and changes the scene lighting.**
   - A time-of-day control moves the sun through a documented daily arc rather than only applying a
     color grade.
   - Morning/day/evening/night values produce visibly different sun direction, shadow direction,
     sky contribution, exposure, and color temperature in all three renderers.
   - The chosen time survives renderer, model, and environment changes.

6. **The moon is an independent lighting control.**
   - The studio exposes a moon on/off control.
   - At night, moon-on adds a visible moon contribution and directional moon shadows or an honestly
     documented equivalent; moon-off removes that contribution without changing the selected time.
   - Turning the moon on during daylight must not masquerade as a second sun.

7. **Water is recognizably water and is not rendered as opaque blue blocks.**
   - From an oblique close view, background or submerged geometry remains visible through water with
     depth-dependent tint/attenuation.
   - Water has view- and light-dependent response such as reflection/specular highlight and surface
     variation or refraction. The exact technique may differ by renderer, but all three approaches
     must honor the same water material intent.
   - Water depth edges remain readable, and the implementation avoids obvious whole-scene ordering,
     depth-write, or halo artifacts in the acceptance views.

8. **Photorealistic materials contain real surface information.**
   - At least wood/organic, stone/soil, metal, glass, emissive, foliage, and water blocks have
     visibly distinct shader responses.
   - Surfaces include authored texture maps, procedural breakup, or deliberate voxel-scale material
     variation where that helps the reference target; selecting “Photorealistic” cannot merely add
     bloom, depth of field, fog, and a color grade to otherwise uniform blocks.
   - Glass and water remain separate materials with separate optical behavior.

9. **Stylized is a rendering treatment, not a final-image filter.**
   - Stylized changes material- or block-type shader behavior before final composition—for example
     light bands, edge treatment, palette rules, normals, highlights, emission, or water response.
   - At least four material classes respond differently to the Stylized treatment, and evidence
     names those differences.
   - Disabling final color grading must leave a clear difference between Photorealistic and
     Stylized output.

10. **Models are complete and can be rendered in multiple environments.**
   - The bundled catalog contains at least three complete, license-compatible voxel subjects. A
     360-degree inspection of each shows no unintended absent sides, open backs, or renderer-created
     holes.
   - Users can drag and drop one or more valid `.vox` files, see them in a session model catalog,
     switch among them without uploading again, and receive a visible diagnostic for rejected data.
   - An environment selector provides a neutral pedestal and at least three authored natural
     environments chosen from forest, snow forest, mountains, beach, and swamp. Environment choice
     is independent of model and renderer choice.
   - The same selected model/environment pair can be rendered by Greedy mesh, Face instances, and
     Path trace without changing its scale, orientation, or placement.

11. **The referenced MagicaVoxel shader collection is investigated honestly.**
    - Research
      [`lachlanmcdonald/magicavoxel-shaders`](https://github.com/lachlanmcdonald/magicavoxel-shaders)
      and record which relevant items generate geometry, noise, or patterns and which, if any, can
      inform browser render shading.
    - Record per-file licensing and attribution before adapting anything; the repository-level
      license is not treated as proof that every shader has identical terms.
    - If a technique is adopted, reimplement it in authored BroMetal shader source, cite its origin,
      and update `THIRD_PARTY_NOTICES.md`. If none is applicable to runtime rendering, record that
      finding instead of forcing a misleading port.

12. **Controls and shader lifecycle are testable.**
    - Camera, focus, time, moon, material/style, model, environment, and reload state have focused
      tests that prove value changes, reset behavior, persistence across pipeline remounts, and
      path-trace invalidation classifications.
    - Renderer reload does not leave duplicate timers, listeners, GPU resources, or stale async
      pipelines.
    - Shader edits continue to flow through typed BroMetal source and generated `*.shader.gen.ts`
      output; generated files are never hand-edited.

13. **The result is evidenced from the running WebGPU app.**
    - Capture the same model, environment, camera, time, and depth-of-field settings in both
      Photorealistic and Stylized modes for all three approaches.
    - Add focused comparison evidence for water translucency, near/far focus, day/night, moon
      on/off, full-model inspection, the environment selector, and renderer reload.
    - The evidence manifest records viewport, DPR, browser, renderer, model, environment, control
      values, and known visual limitations. Documentation does not describe an approximation as a
      physically correct effect.
    - `npm test`, `npm run typecheck`, `npm run build`, `npm run antiky:build`, and `npm run measure`
      all pass, and a live Chromium/WebGPU inspection completes without blank frames or uncaught
      renderer errors.

## Explicit non-goals

- Do not add voxel modeling, sculpting, painting, or `.vox` export.
- Do not integrate this experiment into the production Antiky Studio in this goal; keep it shaped
  for later embedding and verified through the existing Antiky game-module boundary.
- Do not abandon or alias any of the three rendering approaches to make the visual evidence easier.
- Do not satisfy Photorealistic or Stylized only with post-processing.
- Do not copy shaders or voxel assets without file-level compatible licensing and attribution.
- Do not guarantee that an arbitrary user-supplied model is complete; guarantee that the renderer
  does not remove valid exterior faces and that bundled acceptance models are complete.

## Engineering constraints

- Preserve the current validated `.vox` input limits, renderer lifecycle, generation fencing,
  visible diagnostics, and deterministic receipts unless a changed limit is explicitly documented
  and tested.
- Keep maintained shaders in typed BroMetal sources and regenerate accessible WGSL through the
  repository scripts.
- Keep controls and renderer state host-owned so the mini-app can later fit an Antiky Studio panel;
  do not introduce a second render loop or pipeline-owned DOM state.
- Add or update meaningful tests for every code change. Preserve unrelated worktree changes.

## Completion definition

The goal is complete only when all thirteen acceptance criteria are implemented, evidenced, and
documented; the full verification suite passes; and the owner accepts the final Photorealistic and
Stylized evidence against the local references.

If compatible sources cannot be found for three complete models, if BroMetal cannot express a
required effect without a public-API change, or if WebGPU evidence cannot be captured, stop and
report the exact constraint. Do not substitute unlicensed assets, hide unsupported controls, fake
translucency with opaque color, or weaken the visual bar to close the goal.
