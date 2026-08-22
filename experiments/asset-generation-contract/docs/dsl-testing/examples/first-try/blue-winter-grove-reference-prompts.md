# Blue Winter Grove visual-reference generation

These project references were generated with the built-in OpenAI image-generation tool. The five source images at `voxel-rendering/docs/refine-it/references/2.png` through `6.png` were supplied as mood, material, lighting, and rendering references. Every prompt explicitly required a new composition and excluded the source-specific architecture, people, animals, logos, signatures, and arrangements.

## Outputs

| Reference | Design use | SHA-256 |
|---|---|---|
| [Clearing](blue-winter-grove-reference-01-clearing.png) | Clearing composition and canopy massing | `951dab12114c1b77912232e3b202dc75f3a2a960415364babdc0528ec0eaab71` |
| [Frozen creek](blue-winter-grove-reference-02-frozen-creek.png) | Traversal and depth | `5df1104123b199cc10ff1f36046809b25b61ddf445fee0df205390f3caa8cf0d` |
| [Frost-tree detail](blue-winter-grove-reference-03-frost-tree-detail.png) | Close inspection detail | `4bf1526f064a0e26691bd0a072b4bb275c716ebe1001e3a286779fbca8665174` |

All outputs are 1536×1024 RGB PNGs.

## Prompt 1 — clearing

```text
Use case: stylized-concept
Asset type: original game environment concept reference, landscape establishing view
Input images: Images 1–5 are mood, material, lighting, and rendering references only; do not reproduce their compositions, architecture, characters, animals, logos, signatures, or distinctive arrangements.
Primary request: Create a fresh, original snowy voxel-biome environment called Blue Winter Grove.
Scene/backdrop: a broad irregular clearing protected by a dense ring of mixed old-growth winter trees; rounded broadleaf crowns carrying thick clumped snow, a few tall asymmetrical conifers, uneven stepped snowbanks, sparse ice-blue grass, scattered half-buried stones, and one ancient frost-bent tree at the clearing edge as the visual anchor. No building.
Style/medium: richly detailed handcrafted voxel diorama rendered like premium miniature macro photography; believable voxel construction at macro, meso, and micro scales; soft filmic bloom and subtle texture.
Composition/framing: wide landscape establishing view from a slightly elevated three-quarter angle; the open clearing occupies roughly one third of the frame; tree masses frame it without forming a closed wall; a narrow opening leads toward deeper forest; strong foreground/midground/background separation.
Lighting/mood: pale blue winter dawn, lavender and cobalt shadows, restrained blush-pink bounce on snow, faint warm ochre bark accents; still, sheltered, quietly mysterious.
Materials/textures: visibly layered snow shelves, irregular branch forks, textured bark, soft powder drifts, patches of frozen crust; snow conforms to surfaces instead of a uniform coating.
Constraints: make the composition and all assets original; environment only; no people, no animals, no buildings, no text, no logo, no signature, no watermark.
Avoid: Minecraft-like cubes, single-cone trees, identical tree silhouettes, grid planting, flat painted-on snow, smooth generic 3D blobs, excessive white clipping, or a continuous tree wall.
```

## Prompt 2 — frozen creek

```text
Use case: stylized-concept
Asset type: original game environment concept reference, landscape traversal view
Input images: Images 1–5 are mood, material, lighting, and rendering references only; create a new scene and do not reproduce their architecture, people, animals, logos, signatures, camera compositions, or distinctive arrangements.
Primary request: Create a second fresh reference for Blue Winter Grove showing how a player moves from the open snowfield into the sheltered woodland.
Scene/backdrop: a narrow frozen creek and a gently winding packed-snow route enter a dense mixed winter grove; heavy rounded snow crowns overlap overhead, tall irregular conifers break the canopy, exposed root flares and dark ochre bark punctuate the blue snow, low frost shrubs and half-buried stones form readable edges. No structures.
Style/medium: richly detailed handcrafted voxel diorama rendered as premium miniature macro photography; every tree, snow shelf, root, shrub, stone, and ice edge visibly constructed from small voxels; tactile and filmic rather than smooth generic 3D.
Composition/framing: wide landscape view at low human eye level, looking along the creek/path into a clearly readable opening; foreground ice and snow shelves lead the eye; asymmetric tree trunks create a gateway; layered silhouettes continue into misty depth; shallow depth of field only at extreme foreground/background while the traversal route stays readable.
Lighting/mood: cold blue-hour shade with lavender snow, deep cobalt under-canopy shadows, pale pink sky bounce, restrained warm amber grazing light on a few trunks; quiet, intimate, inviting, slightly mysterious.
Materials/textures: translucent voxel ice beneath wind-brushed powder, uneven snow caps, tiny icicles, branch forks, bark fissures, frost grass, granular drift edges.
Constraints: original composition and assets; environment only; no people, no animals, no buildings, no bridge, no text, no logo, no signature, no watermark.
Avoid: copying any source layout, single-cone tree rows, identical crowns, grid spacing, a blocked path, flat snow sheets, featureless white surfaces, smooth blobs, excessive bloom, or unreadable full-frame blur.
```

## Prompt 3 — frost-tree detail

```text
Use case: stylized-concept
Asset type: original game environment concept reference, close inspection view
Input images: Images 1–5 are mood, material, lighting, and rendering references only; create a wholly new environment detail and do not reproduce their compositions, architecture, characters, animals, logos, signatures, or distinctive arrangements.
Primary request: Create a third fresh Blue Winter Grove reference focused on the close-range details that reward player inspection.
Scene/backdrop: the base of an ancient frost-bent winter tree at the edge of a small sheltered snow pocket; a forked dark-ochre trunk, readable root flare, low arching branch, layered snow shelves, a few broken limbs, tiny ice-blue grasses, sparse clusters of muted red winter berries, half-buried stones, and a thin ribbon of frozen meltwater. Dense snowy trees recede behind it. No structures.
Style/medium: richly detailed handcrafted voxel diorama rendered as premium miniature macro photography; explicit small-voxel construction, tactile bark, granular snow, delicate twig tips, and believable object scale; atmospheric but not painterly-smudged.
Composition/framing: intimate landscape medium-wide view near ground level; the forked trunk and root flare are the focal structure, with a traversable gap visible beneath the arching branch; foreground snow and berries lead toward it; detailed focal plane with softly receding background.
Lighting/mood: quiet blue-lavender winter shade, cobalt occlusion in roots and branch gaps, pale blush reflected light, restrained amber rim light on bark and a few berry accents; sheltered, still, curious, no magical glow.
Materials/textures: fissured voxel bark, small twig silhouettes, varied snow thickness governed by branch orientation, icicles only where supported, crusted and powder snow transitions, translucent frozen water.
Constraints: original composition and original assets; environment only; no people, no animals, no buildings, no shrine, no text, no logo, no signature, no watermark.
Avoid: copying source arrangements, giant smooth snow blobs, uniform snow coating, single-cone foliage, perfect symmetry, decorative fantasy particles, excessive bloom, unreadable blur, or flat undifferentiated white.
```
