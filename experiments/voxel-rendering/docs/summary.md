# Voxel rendering experiment execution summary

Status: **complete**

The field lab now runs as both a standalone comparison UI and an Antiky game module. All three
BroMetal/WebGPU pipelines render the same original scene, accept the same parsed `.vox` scene, and
offer physical and graphic presentations. Live Chromium inspection found and fixed one wheel-input
defect. The final standalone pass completed with no browser-console errors.

## Delivered

- AO-aware greedy surface meshing with a typed physical/graphic raster shader.
- Exposed-face instancing with six stable face orientations and a typed physical/graphic shader.
- Dense DDA traversal with direct shadow rays, two bounded secondary traversals, RGBA16F running
  mean accumulation, and a separate physical/graphic presentation pass.
- A bounded MagicaVoxel parser, immutable normalized scene contract, original 4,546-voxel Lumen
  Observatory, and generated `.vox` round-trip fixture.
- A Studio-aligned React comparison shell with a shared orbit camera, renderer tabs, presentation
  control, local file loading, model selection, visible failures, and live receipts.
- An Antiky project manifest and game-module build for CLI development, inspection MCP diagnostics,
  managed WebGPU capture, and query-selected renderer/presentation variants.
- Checked-in visual evidence, research, comparison notes, deterministic measurement tooling, and
  provenance notices.

## Automated verification on 2026-08-16

| Check | Result |
| --- | --- |
| `npm test` | Passed: 15 files, 60 tests; all four authored shaders compiled for production |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| `npm run antiky:build` | Passed; emitted the Antiky `dist/antiky.game.js` module |
| `npm run measure` | Passed; printed deterministic receipts for all three representations |
| Anti-slop prose check | 0 findings across the experiment documentation |
| Anti-slop structure check | 0 findings; Vitest independently confirmed test collection |

The final counts above include the regression test added after the live browser pass. The exact
final command output is reproducible from the commands in the README.

## Live WebGPU verification

Antiky CLI launched `voxel-rendering.antiky` with the game on port 4178 and inspection MCP on port
4179. Its capture capability report identified Playwright 1.62.1, Chromium 151.0.7922.34, browser
revision 1234, WebGPU `available`, and a configured 1280 × 720 final canvas. Inspection reported a
connected, running runtime with no development or framework diagnostics.

Antiky's managed runtime retained one private canvas master:

- evidence: `evidence-ad33e319-19ff-437e-82e1-9edd14f77aa4`;
- artifact: `artifact-c765c1b4af484b783f7f605fa6ac6ca2924b1b55792efa41f644886024d0a651`;
- PNG: 1280 × 720, 157,952 bytes;
- SHA-256: `c765c1b4af484b783f7f605fa6ac6ca2924b1b55792efa41f644886024d0a651`;
- accepted build revision: 1; and
- privacy: canvas-only, no desktop pixels or audio, `private-unreviewed`.

Playwright MCP then inspected all six renderer/presentation combinations at the same 1280 × 720
viewport and DPR 1. The browser exposed `navigator.gpu`, vendor `apple`, and architecture
`metal-3`. The path tracer reached its fixed 256-sample limit and reported its dense volume, two
RGBA16F accumulation targets, four-ray-per-pixel ceiling, and 91-step traversal cap. Switching only
the presentation preserved all 256 samples. Orbit and wheel input produced a `camera` accumulation
reset.

The standalone UI pass uploaded `public/models/lumen-observatory.vox`, then selected mesh,
instances, and ray traversal without changing the source scene. All three reached `running`; mesh
reported 1,737 greedy quads, instances reported 3,900 exposed faces, and ray traversal returned to
256 samples. The final browser pass reported zero console errors. See the [visual evidence
index](./evidence/README.md) for the checked-in images, hashes, environment, and limitations.

## Defects found by live inspection

The first wheel interaction produced `Unable to preventDefault inside passive event listener`.
React had installed the canvas wheel handler as passive. The app now owns a native wheel listener
with `{ passive: false }`; a regression test proves the option, cancellation, zoom callback, and
cleanup. An inline favicon also removes the unrelated missing-icon console error.

Antiky's browser log recorded aborted and conflicting inspection-transport requests while its
managed browser and the separate Playwright MCP page were connected to the same development
session. The active runtime's Antiky diagnostics remained empty, and a fresh standalone browser
context had no errors. These transport messages are not treated as renderer diagnostics or GPU
performance evidence.

## Result and limits

The greedy mesh is the keeper for a first Antiky renderer. It has the most conventional engine
integration path and the cleanest controlled image. Face instances are a useful stylized and
rapid-rebuild alternative. Dense DDA proves real progressive secondary-ray accumulation, but its
256-sample image still has visible noise and overly dark enclosed faces.

The study demonstrates physically based shading and indirect-light transport; it does not yet
produce a defensible hyperrealistic result. It also does not establish GPU frame-time, broad browser
support, Tauri WebView behavior, transparent glass, denoising, sparse-world scaling, or a production
Antiky voxel asset contract. Those are explicit merge or follow-on experiments, not hidden claims
of this completed comparison.
