# MagicaVoxel shader collection investigation

Investigated on 2026-08-17:
[`lachlanmcdonald/magicavoxel-shaders`](https://github.com/lachlanmcdonald/magicavoxel-shaders).
The repository describes these files as MagicaVoxel editing shaders that generate geometry, noise,
and patterns. MagicaVoxel calls each shader’s `map` function once per voxel and expects a palette
index, so these are voxel-authoring tools rather than runtime surface/lighting shaders.

## Relevant files and licensing

The repository README says the repository is MIT-licensed but explicitly warns that individual
files can carry their own terms and attributions. The following headers were checked individually
before deciding whether to adapt a technique:

| File | Function relevant to this study | Header terms and attribution |
| --- | --- | --- |
| [`shader/noise/terrain.txt`](https://github.com/lachlanmcdonald/magicavoxel-shaders/blob/master/shader/noise/terrain.txt) | Layered terrain geometry from noise, with scale, octaves, contrast, gain, lacunarity, and tiling controls | Lachlan McDonald, MIT; also credits Stefan Gustavson’s MIT `webgl-noise` and an Inigo Quilez cubic-pulse function under MIT |
| [`shader/noise/cellular3D.txt`](https://github.com/lachlanmcdonald/magicavoxel-shaders/blob/master/shader/noise/cellular3D.txt) | 3D cellular patterns with jitter, cavity, power, seed, and tiling | Lachlan McDonald, MIT; credits Stefan Gustavson’s MIT `webgl-noise` |
| [`shader/heightmap.txt`](https://github.com/lachlanmcdonald/magicavoxel-shaders/blob/master/shader/heightmap.txt) | Extrudes voxel luminance into geometry and can blur/rebalance the source height field | Lachlan McDonald, MIT; credits Michael Feldstein’s MIT `glsl-map` |
| [`shader/primitive/greebles1.txt`](https://github.com/lachlanmcdonald/magicavoxel-shaders/blob/master/shader/primitive/greebles1.txt) | Places seeded box greebles to add authored geometric detail | Lachlan McDonald, MIT; no additional attribution in the file header |
| [`shader/brush/bricks.txt`](https://github.com/lachlanmcdonald/magicavoxel-shaders/blob/master/shader/brush/bricks.txt) | Applies directional brick/grout palette patterns with offset, noise, and threshold controls | Lachlan McDonald, MIT; credits ValgoBoi’s MIT `clover-noise` |
| [`shader/moisture.txt`](https://github.com/lachlanmcdonald/magicavoxel-shaders/blob/master/shader/moisture.txt) | Grows directional, jittered palette regions that can suggest dampness or weathering | Lachlan McDonald, MIT; credits MIT work from ValgoBoi and Stefan Gustavson |
| [`shader/outline.txt`](https://github.com/lachlanmcdonald/magicavoxel-shaders/blob/master/shader/outline.txt) | Adds voxel geometry around selected palette regions | Lachlan McDonald, MIT; no additional attribution in the file header |

The project wiki is licensed CC BY-NC-SA 4.0, with its code snippets dual-licensed under MIT. That
wiki license is distinct from the file headers above.

## Applicability decision

Terrain, greeble, brick, cellular, and moisture concepts can inform future authored subject or
environment generation. They do not directly solve browser runtime lighting, material response,
transmission, depth of field, or time-of-day control. Porting them into the render path would also
turn editing-time geometry algorithms into per-fragment work without a clear visual or performance
benefit.

No file, function, constant, or asset from the collection was copied, translated, or adapted in
Round 2. The studio’s terrain, material variation, water ripples, and palette rules are original
implementations written in typed BroMetal sources. Therefore `THIRD_PARTY_NOTICES.md` does not need
an entry for this investigation. If a listed geometry generator is adopted later, its exact file
header and transitive attribution must be carried forward before implementation.
