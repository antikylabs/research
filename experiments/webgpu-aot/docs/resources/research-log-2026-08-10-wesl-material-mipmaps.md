# WESL Material-Mipmap Audit

## Question

After authored tangents and geometric roughness aligned the surface inputs, WESL still showed a forward-HDR color imbalance and slightly less stable distant material detail. This audit inspected the environment diffuse path and the material-texture sampling path separately.

## Rejected PMREM-irradiance transplant

Three derives diffuse irradiance from its packed cubeUV PMREM at logical roughness one. WESL instead owns a separate cosine-convolved diffuse cube and an ordinary nine-level cubemap prefilter. Sampling WESL's highest specular mip as irradiance looked superficially equivalent, but the parameterizations are not interchangeable.

The isolated capture `/tmp/wesl-pmrem-irradiance-1` fell from `0.973979` to `0.970255`. It increased the existing green/blue excess in forward HDR and raised final full-frame luminance to `0.143185` versus Three's `0.136949`. The experiment was reverted by `29b1ccf`.

The finding is important: Three's logical PMREM roughness levels include cubeUV-specific extra levels and filtering. WESL's ordinary cubemap mip 8 is not the same distribution merely because both are described as roughness one. Keep the independently generated cosine irradiance until the producer itself is changed coherently.

## Material-texture gap

The pinned Sponza materials use 69 base-color, normal, and metallic-roughness textures. Three generates complete mip chains and samples them with trilinear filtering and anisotropy up to eight.

WESL previously allocated every material texture with one mip, while still configuring a mipmap sampler. The sampler therefore had no lower-resolution data to select. This caused distant base color, normals, metallic, and roughness to alias at the source.

## WESL-native correction

WESL now statically links a package-owned fullscreen mip shader and two format-specific pipelines:

- `rgba8unorm` for linear normal and metallic-roughness textures;
- `rgba8unorm-srgb` for base-color textures, preserving decode/filter/encode behavior;
- one render pass per generated mip, sourcing the immediately preceding level;
- all levels down to `1×1`;
- exact mip-chain memory included in WESL telemetry;
- startup waits for generation before declaring the workload ready.

The capture proves all 69 textures own complete chains: 68 textures have 11 mip levels and the small texture has 3. Texture usage includes copy destination, sampled texture, and render attachment. No mip-generation work occurs inside the synchronized frame window.

## Result and tradeoff

The synchronized capture `/tmp/wesl-material-mips-1` passed. The aggregate score changed from `0.973979` to `0.973170`:

| Component | Single mip | Full chains |
| --- | ---: | ---: |
| Color | 0.991401 | 0.991132 |
| Histogram | 0.927345 | 0.923978 |
| Luminance | 0.985322 | 0.984702 |
| Structure | 0.984658 | 0.985373 |
| Tone | 0.967229 | 0.967656 |

Structure and tone improve while the histogram shifts slightly away from the current Three capture. Full-frame dynamic range moves from `0.256353` to `0.257445`, toward Three's same-run `0.258336`. Mean saturation moves from `0.469204` to `0.470386`, toward `0.478729`.

The aggregate score does not justify returning to a known single-mip defect. The side-by-side image is more stable in distant fabrics, masonry, and normal detail, and full material mip chains are required for the intended polished renderer workload.

## Decision

Accept the WESL-native material mip generator and refresh canonical artifacts. Do not tune mip bias or sharpen the generated levels merely to recover the old histogram score. A future exact comparison should inspect Three's material mip-generation filter and coordinate-aligned mip selection before changing this source-correct implementation.
