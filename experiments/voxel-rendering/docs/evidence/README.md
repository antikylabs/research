# Refined visual evidence

This index is the review manifest for the six final **Golden Hour Valley Atelier** captures. Every
image uses the same 160 × 96 × 256 scene, entrance-targeted camera, 1280 × 720 canvas, and DPR 1.
Only the renderer and visible preset change.

| Renderer | Preset | Checked-in PNG | Evidence ID | Artifact ID / SHA-256 |
| --- | --- | --- | --- | --- |
| Greedy mesh | Photorealistic | [PNG](./voxel-mesh-photorealistic.png) | `evidence-5560184c-7a4c-4d36-b650-baeef543ca11` | `artifact-62c7c12bcff3d333e7cb822bd53c070cd3b224db8a2f021c0b9b0950dd835003` |
| Greedy mesh | Stylized | [PNG](./voxel-mesh-stylized.png) | `evidence-100addfe-b501-4fec-82d0-162e57fbf067` | `artifact-4c5fd25238a1d725a4e7e83cfcdd999223b7992ba33c56bfe77584b318a65030` |
| Face instances | Photorealistic | [PNG](./voxel-instances-photorealistic.png) | `evidence-282482d9-953c-4149-8d87-227e67a23765` | `artifact-2c7ec0cfc0a1c274f8f60031bfbd9dcb502d50b69f4a44b25af2bc27b22948df` |
| Face instances | Stylized | [PNG](./voxel-instances-stylized.png) | `evidence-60599378-8233-43d6-8471-ff36983f02c3` | `artifact-a5b0c118a84dc7d6fd6e1be40462b984a2ee413ff78246cbf1ac6433b026069b` |
| Dense DDA | Photorealistic | [PNG](./voxel-raytrace-photorealistic.png) | `evidence-9e1cd742-4331-4b7b-9014-5336004a26a0` | `artifact-285475457af147982fc302241968aaf5ffad979dae06f8d5db44e42d598fdd12` |
| Dense DDA | Stylized | [PNG](./voxel-raytrace-stylized.png) | `evidence-3af7a4b5-aeb8-428a-b56a-b5a52d403709` | `artifact-0fdec6fd91319789a1dc9a45b1a4a6a4364aa2664cc85b6a1607af930d14c343` |

The SHA-256 for each PNG is the hexadecimal portion of its artifact ID.

## Capture identity

| Field | Value |
| --- | --- |
| Antiky development session | `14a62a73-ba7a-4373-ae96-9d8d58743018` |
| Accepted build revision | `1` |
| Runtime | `ef08a0c9-35a5-4e2d-82c2-739f219dc863` |
| Scene fingerprint | `753a16b1` |
| Canvas | 1280 × 720, DPR 1 |
| Capture boundary | Canvas only; no desktop pixels or audio |
| Managed-artifact review state | `private-unreviewed` before check-in review |

The managed Antiky artifacts are session-scoped capture receipts. `private-unreviewed` describes
their state before check-in review; it is not publication approval. The PNGs linked above are the
portable evidence set.

## What a reviewer should check

- All three rows have both Photorealistic and Stylized output from the same camera and scene.
- The foreground path, steps, vegetation, and lanterns establish near depth instead of leaving the
  model floating against a sky.
- The atelier and entrance remain the focal subject; the pond, dock, hills, forest, and ruins carry
  the middle and far depth planes.
- Photorealistic raster output shows golden-hour direct light, shadows, bloom, vignette, tone
  mapping, and focus falloff. Stylized output changes color and quantization without changing the
  underlying scene.
- Dense DDA output shows the thin-lens treatment, soft direct shadowing, and accumulated reflection
  and glass approximations.

“Photorealistic” is the requested preset name and describes its cinematic, PBR-oriented intent. It
does not mean that the image is indistinguishable from photography. Glass remains approximate, and
the dense path uses about 63 MiB before its accumulation targets. See the [refinement report](../refine-it/summary.md)
and [field notes](../field-notes.md) for the acceptance audit and tradeoffs.
