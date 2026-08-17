# Live visual evidence

These images record the original Lumen Observatory through every renderer and presentation. The six
renderer stills use the same camera, 1280 × 720 viewport, and DPR 1. Playwright MCP captured them
from the Antiky-hosted game module in Chromium 151 on the Apple `metal-3` WebGPU adapter.

| Renderer | Presentation | Evidence | SHA-256 |
| --- | --- | --- | --- |
| Greedy mesh | Physical | [PNG](./voxel-mesh-physical.png) | `6c7930842a04e282642be511019342c8e15a1c89238ed9e9c1942de3680fff62` |
| Greedy mesh | Graphic | [PNG](./voxel-mesh-graphic.png) | `3def9887d7c41a1abcca528d5200ad340cd519a843eabc60a2e6d3f440ae5b93` |
| Face instances | Physical | [PNG](./voxel-instances-physical.png) | `85c231e54a1cba2849a45e896ee1324bb50a3a4018072c25712d71f7cfda310b` |
| Face instances | Graphic | [PNG](./voxel-instances-graphic.png) | `4fbe9d41e5c2ffa1af7bb277f4e99e0e1c17d0724ae6dba2250bbedb7497f221` |
| Dense DDA | Physical | [PNG](./voxel-raytrace-physical.png) | `70703aca45fc8686b8f99ce55a486375bede977a809e4ae65a048003a52a8220` |
| Dense DDA | Graphic | [PNG](./voxel-raytrace-graphic.png) | `3bc7b68b3a8eae02d67c15bab6f2402d8fb0e811e9a82d00d68c03aafefaa493` |

The [field-lab UI capture](./voxel-field-lab-ui.png) is a separate 1200 × 714 standalone-browser
capture after the generated `.vox` file was uploaded and Face instances / Physical was selected.
Its SHA-256 is `5d65abe2df751974833291bcf95da6dc50d058514537beb4bc3246e37de65dae`.

## What the images show

- The raster physical views keep palette identity, readable corner shading, and emissive fixtures.
- The graphic views visibly change grading and face bands without changing scene geometry.
- Face instances preserve each exposed voxel face, while greedy meshing removes compatible seams.
- The path tracer produces a sky-lit image with emissive and secondary-ray contribution, then stops
  at 256 running-mean samples.

The path-traced result remains noisy in dark and emissive-adjacent regions. Its graphic presentation
also deliberately quantizes the environment into broad bands. The physical raster image is clean
but is not hyperrealistic: it has no shadow map, reflections, transparency, or image-based lighting.
These images are evidence for the bounded experiment, not publication approval or a performance
benchmark.

Antiky also retained a separate managed canvas master during the development session. Its SHA-256
was `c765c1b4af484b783f7f605fa6ac6ca2924b1b55792efa41f644886024d0a651`; the session-scoped artifact
was marked `private-unreviewed`, canvas-only, and audio-free.
