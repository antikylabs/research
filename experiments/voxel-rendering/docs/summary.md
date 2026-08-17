# Voxel rendering experiment execution summary

Status: **implementation complete; live visual verification blocked**

Action needed from the owner: make an in-app Browser session available with WebGPU support, then ask
Codex to continue this goal. The browser integration returned `No browser is available`, and its
browser list was empty on 2026-08-16. The experiment's stop conditions require live rendering
evidence, so the goal cannot be closed honestly yet.

## Delivered

- Three independent BroMetal pipelines: AO-aware greedy mesh, exposed-face instances, and dense DDA
  progressive path tracing.
- One immutable scene contract shared by the built-in original scene and uploaded `.vox` base
  models.
- A bounded MagicaVoxel parser with palette fallback, multi-model support, preserved material
  dictionaries, diagnostics, and hostile-input limits.
- An original 4,546-voxel Lumen Observatory scene plus a generated `.vox` fixture that round-trips
  geometry and mapped material values through the real parser.
- A Studio-aligned React evidence shell with one orbit camera, approach and presentation controls,
  local file loading, model selection, visible failures, and live receipts.
- Typed authored BroMetal shaders and checked-in generated WGSL for every maintained pass.
- Research notes, comparison field notes, deterministic measurement tooling, and license/provenance
  notices.

## Verified on 2026-08-16

| Check | Result |
| --- | --- |
| `npm test` | Passed: 13 files, 55 tests; all four authored shaders compiled for production |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; Vite transformed 69 modules and emitted a 285.84 kB client entry |
| `npm run measure` | Passed; printed deterministic receipts for all three representations |
| Anti-slop prose check | 0 findings across the experiment documentation |
| Anti-slop structure check | 0 findings over 64 files; test collection was confirmed by Vitest because no explicit include pattern exists |
| Live Chromium/WebGPU inspection | Blocked: no browser session was available |

No frame-time, visual-quality, browser-compatibility, adapter, or screenshot claim is made without
the missing live run.

## Remaining completion work

1. Start the study with `npm run dev` and open <http://127.0.0.1:4178/> in the connected browser.
2. At one recorded viewport and device-pixel ratio, inspect the built-in scene in all three
   pipelines and both presentations.
3. Confirm orbit, zoom, pipeline switching, the generated `.vox` round trip, path accumulation, and
   accumulation resets.
4. Record the browser version and WebGPU adapter when exposed, then capture the same camera for all
   three pipelines.
5. Fix any visible or runtime defect, rerun every automated check, update this summary with the live
   evidence, and close the goal.

If the connected browser exposes no WebGPU adapter, keep the goal open and record that environment
failure rather than weakening the completion definition.
