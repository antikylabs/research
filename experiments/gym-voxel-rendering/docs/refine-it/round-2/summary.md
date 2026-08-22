# Round 2 execution summary

Status: **replacement geometry verified; atmospheric and vegetation follow-up awaits live review; final visual sign-off remains open**

The field lab is now a host-owned render-studio mini-app with three original bundled subjects, six
independent environments, multi-file `.vox` session imports, fly navigation, renderer reload,
controllable depth of field, a daily sun arc, independent night moon, material variation, and
Photorealistic/ Stylized treatments in all three renderer implementations.

## Environment-quality correction

The first sign-off request was wrong. Its natural environments were confined to a visibly exposed
`160 × 96 × 160` slab, terrain was only a thin skin, the generator placed 22 trees, and every crown
was a filled `13 × 12 × 13` cuboid. The owner's rejection invalidated the claim that implementation
and evidence were complete.

The replacement environment system now provides:

- one `384 × 128 × 384` composition shared unchanged by Greedy mesh, Face instances, and Path trace;
- continuous terrain or water across every horizontal boundary, with ridges, coast, and forest
  bands composing the finite edge out of the authored review views;
- terrain-blended sanctuary terraces instead of rectangular world plates or empty lawns;
- modeled deciduous branches and irregular crowns, tiered conifer boughs, snow loading, cypress
  branches and hanging growth, and palms with segmented trunks, fronds, and leaflets;
- close vegetation detail including rooted trunk flare, bark scars and knots, moss accents, dead
  branch stubs, hanging deciduous strands, palm roots, and clustered palm fruit;
- biome-specific creek, bridge, waterfall, jetty, boardwalk, ruins, fences, lanterns, crags, reeds,
  lilies, logs, flowers, dune grass, shore rocks, garden courts, wildlife, canoe, birds, prayer flags,
  fireflies, and layered terrain;
- 13,269 deterministic snow-weathering cells deposited on exposed pavilion roofs, rails, and
  terraces instead of leaving the subject visually untouched by its biome;
- a dedicated landmark vista for every natural environment, with per-biome canopy clearance and
  camera framing that exposes ruins, water routes, foreground props, and the far field;
- a rebuilt 124,549-voxel Lantern Pavilion with a stepped plinth, colonnade, rails, framed glazing,
  entrance, layered roofs, lifted eaves, lantern tower, and practical lights; and
- 831,504 to 1,489,047 occupied voxels across the current natural environments for the pavilion subject,
  compared with the rejected sparse composition.

The [replacement environment evidence](./evidence.md#owner-directed-environment-replacement) shows
all five natural worlds plus the same expanded snow forest through the two non-mesh pipelines. The
[current matched set](./evidence.md#current-matched-six-image-set) recaptures both treatments in all
three renderers on that replacement geometry.

## Implemented acceptance work

- Free yaw/pitch camera with pointer-lock entry, visible active state, `WASD` plus vertical movement,
  delta-time integration, safe vectors, and reset.
- Persistent studio state for model, environment, renderer, focus, time, moon, exposure, material
  variation, final grade, and reload generation.
- Greedy and instanced raster pipelines split opaque and transmissive geometry, render water/glass
  after opaque surfaces, preserve background visibility, and add animated surface normals,
  view-dependent opacity, tint, and specular response.
- The path tracer distinguishes water from glass and adds a bounded transmission DDA with
  depth-dependent attenuation/tint plus reflected sky/light response.
- All renderers use the same sun/moon state and DoF semantics. Raster presentation now derives a
  world-space view ray from the active camera, keeping the sun, moon, cloud structure, horizon, and
  night stars coherent while flying; Path trace uses the same atmospheric sky and fog palette.
- Physical materials consume roughness, metallic, glass, emission, water, palette identity, AO,
  and procedural breakup. Stylized material shading adds light bands, palette-family rules,
  normal shaping, class-specific glass/water/metal response, and stronger emission before grading.
- Three original subjects—Lantern Pavilion, Copper Survey Rover, and Moon Gate Shrine—compose at a
  stable scale/orientation with pedestal, forest, snow forest, mountains, beach, or swamp.
- The standalone studio and Antiky game-module path expose reproducible settings. Antiky capture
  fixtures provide bounded renderer, scene, lighting, lens, grading, and inspection-angle presets.
- Typed BroMetal sources remain authoritative and generate every `*.shader.gen.ts` file.

The [reference analysis](./reference-analysis.md),
[external shader investigation](./magicavoxel-shaders.md), and
[evidence manifest](./evidence.md) contain the detailed review contracts and receipts.

## Acceptance audit

| Criterion | Status | Authoritative proof |
| --- | --- | --- |
| 1. Reference-led visual bar | Pending owner | [`reference-analysis.md`](./reference-analysis.md) records the owner's environment correction. The [replacement captures](./evidence.md#owner-directed-environment-replacement) and [current matched set](./evidence.md#current-matched-six-image-set) supersede the rejected biome images; owner aesthetic acceptance remains open. |
| 2. Render-studio mini-app | Proved | [`App.tsx`](../../../src/App.tsx), both [required viewports](./evidence.md#environment-and-studio-evidence), and the live reload receipt cover the grouped stage/inspector and pipeline remount. |
| 3. Minecraft-like fly camera | Proved | [`fly-camera.test.ts`](../../../src/camera/fly-camera.test.ts), [`fly-input.test.ts`](../../../src/camera/fly-input.test.ts), [`runtime.test.ts`](../../../src/studio/runtime.test.ts), and the [Pointer Lock/WASD receipt](./evidence.md#live-navigation-and-import-receipt) cover movement, input gating, active state, reset, and cleanup. |
| 4. Controllable DoF | Proved | [`settings.test.ts`](../../../src/studio/settings.test.ts), renderer lifecycle tests, the fixed-aperture focus pair, and the fixed-focus off/strong-aperture pair in [lens and lighting comparisons](./evidence.md#lens-and-lighting-comparisons) cover controls, visible semantics, and path-trace invalidation. |
| 5. Moving daily sun | Proved | [`lighting.test.ts`](../../../src/render/lighting.test.ts) covers morning, noon, evening, and night direction/intensity. The fixed-scene [all-renderer daily arc](./evidence.md#all-renderer-daily-arc) directly proves visibly distinct output for all four times in all three renderers. |
| 6. Independent moon | Proved | The shared lighting tests prove daylight suppression and independent night intensity. The moon-on/off pair holds time fixed and shows the visible contribution and shadow change. |
| 7. Recognizable water | Proved | Mesh/instance boundary tests, ray shader contracts, and the matched beach/pool images show separate transmissive water with visible geometry below it. Limits are stated in the manifest. |
| 8. Physical material information | Proved | [`built-in.test.ts`](../../../src/scene/built-in.test.ts), raster/ray shader contract tests, the matched shrine, the pavilion/rover inspections, and forest images cover wood, stone/soil, metal, glass, emissive, foliage, and water. |
| 9. Shader-level Stylized treatment | Proved | Shader contract tests place class-specific behavior before composition. The [grade-disabled pair](./evidence.md#stylized-without-final-grading) remains visibly different. |
| 10. Complete models and environments | Corrected; visual review pending | [`studio-scenes.test.ts`](../../../src/scene/studio-scenes.test.ts) proves full 384-cell edge coverage, more than 700,000 voxels, more than 15,000 elevated-detail columns, palette breadth, placement, bounds, and verified pavilion snow accretion. Current WebGPU captures show all five landmark vistas and all three pipelines. |
| 11. MagicaVoxel shader investigation | Proved | [`magicavoxel-shaders.md`](./magicavoxel-shaders.md) records relevant files, file-level terms, attribution findings, and why no runtime shader was adopted. |
| 12. Testable controls and lifecycle | Proved | Session/settings/runtime tests plus all three renderer lifecycle suites cover persistence, reset classification, generation fencing, listener/timer cleanup, and exact GPU-resource disposal. Generated shader contract tests cover the BroMetal path. |
| 13. Running WebGPU evidence | Geometry pass proved; art follow-up recapture pending | The [evidence manifest](./evidence.md) contains five promoted environment captures and a fully matched six-image matrix on the expanded snow forest. The newer camera-aware atmosphere and close vegetation detail compile and pass their contracts but are not claimed as visual evidence without a live WebGPU frame. |

## Verification state

The automated suite was rerun after the environment replacement on 2026-08-17:

| Check | Result |
| --- | --- |
| `npm test` | Passed: 26 files, 111 tests, and all five authored shaders generated |
| `npm run typecheck` | Passed |
| `npm run build` | Passed: standalone Vite bundle emitted |
| `npm run antiky:build` | Passed: `dist/antiky.game.js` emitted |
| `npm run measure` | Passed: measurement scene `753a16b1`; mesh `5c501af2`; instances `2023ce9f`; 515-step measurement-scene DDA |
| Expanded Path trace | Passed in managed Chromium with a 75,497,472-byte packed `384 × 128 × 384` volume under the 128 MiB cap and an 899-step conservative bound |
| Promoted managed WebGPU pass | Chromium 151.0.7922.34; all three expanded-world pipelines captured at 1280 × 720 in one runtime; running lifecycle; no diagnostics |
| Promoted standalone WebGPU pass | Both required viewports rendered; reload state preserved; no console/page errors |
| Atmospheric and vegetation follow-up | All five BroMetal shaders generated; focused environment/renderer contracts, full test suite, typecheck, and both builds passed; live WebGPU inspection unavailable in this session |
| Anti-slop prose checker | 0 findings in the Round 2 documents and README |
| Anti-slop structure checker | 0 findings across 170 files; test collection not checked because no runner roots oracle is declared |

The code-specific anti-slop Oxlint plugin is not installed in this experiment. A manual scan found
no disabled tests, placeholder bodies, empty catches, unexplained suppressions, or tautological
self-comparisons. This manual scan does not assess mutation strength, dead exports, complexity, or
duplication.

The environment correction is implemented, structurally tested, and captured from the running
WebGPU app. The newer atmospheric and vegetation work is compiled but remains unpromoted until a
real frame can be inspected. The Round 2 goal remains open because that recapture and the owner's visual
acceptance are still outstanding. Technical capture success is not treated as aesthetic sign-off.
