# Blue Winter Grove visual-reference lineage

The active references were produced with the built-in OpenAI image-generation tool in three stages.
The built-in path does not expose a model selector, so this record does not claim a pinned model.

## Input isolation

- The `v2` generation calls received only the five supplied source images at
  `voxel-rendering/docs/refine-it/references/2.png` through `6.png`.
- No first-attempt image was supplied to a `v2` call.
- Each `v3` edit call received only its corresponding `v2` image as the edit target.
- No source image, first-attempt image, or other generated scene was supplied to a `v3` edit.
- The party anchor was generated without image inputs and contains wholly original characters.
- Each `v4` edit received its corresponding `v3` scene as Image 1 and the party anchor as Image 2.
- In every `v4` prompt, Image 1 is the sole environment authority and Image 2 controls only party
  identity and pixel craftsmanship. No other scene or source image was supplied.
- Each image was generated or edited in a separate built-in call.

## Outputs

### Active `v4` references

| Reference | Contract use | SHA-256 |
|---|---|---|
| [Clearing](../../../packages/examples/src/blue-winter-grove/references/blue-winter-grove-reference-01-clearing-v4.png) | Mood, party scale, and travel pose | `2e7b8db169ac7af42ac9fb3343046523ef7106f6b8a954033289267da4e65bb3` |
| [Frozen creek](../../../packages/examples/src/blue-winter-grove/references/blue-winter-grove-reference-02-frozen-creek-v4.png) | Party movement and traversal | `e15fa1b3a2399e0f55e5b72259a242c70d0171227f9a570a0681105601036019` |
| [Frost-tree detail](../../../packages/examples/src/blue-winter-grove/references/blue-winter-grove-reference-03-frost-tree-detail-v4.png) | Sprite craft and landmark | `d69d7ffeb4ec5d61f37b810fc9dd01d97dfd2a84eba2ba6403282ac8fb46f6c1` |

### Party identity anchor

| Reference | Use | SHA-256 |
|---|---|---|
| [Vanguard, scholar, and scout](../../../packages/examples/src/blue-winter-grove/references/blue-winter-grove-party-sprite-anchor-v1.png) | Original character identity, gear, palette, silhouettes, and pixel craft | `af9be366dbcd82b50f2f4d429a20204f84ca88262f41ffb9de5d96d69b9cf3e6` |

### Removed intermediate outputs

The accepted `v4` set superseded the intermediate `v2` and `v3` PNGs, so those six files were
deleted. Their filenames and hashes remain here as lineage records, not links to available assets.

| Version | Removed filename | Recorded SHA-256 |
|---|---|---|
| `v2` | `blue-winter-grove-reference-01-clearing-v2.png` | `319c3f7a593f70878ace384c5d714f1b4ad1285dfacfb68c08d4dc0ab240eda9` |
| `v2` | `blue-winter-grove-reference-02-frozen-creek-v2.png` | `6d60449fd4c4c6ca681199df1b13624ed9f73b089b2bfe12673f5ceba8508827` |
| `v2` | `blue-winter-grove-reference-03-frost-tree-detail-v2.png` | `fc0449f80275e92a1137fe0d090d0b9bcffca942c42688cd6406db57a90c8a61` |
| `v3` | `blue-winter-grove-reference-01-clearing-v3.png` | `1db3105b2070fcbbdf4669173d4190c52bd1906da6d2359c14901b26350a17c7` |
| `v3` | `blue-winter-grove-reference-02-frozen-creek-v3.png` | `d4e548875734a4436c694ac993fc3a7bce89c86af9a3e81d3d5dadaff954f3d5` |
| `v3` | `blue-winter-grove-reference-03-frost-tree-detail-v3.png` | `c27d494c016b01d901a28b84fcf3cf064c19caf930858eedc960b9d94a682c5a` |

The retained `v4` scene outputs are 1536×1024 RGB PNGs. The 1536×1024 party anchor is an RGBA PNG.
The initial generated set and its prompts remain in [`first-try/`](first-try/).

## `v2` source-matched generation prompts

### Clearing

```text
Use case: stylized-concept
Asset type: strict visual reference for a declarative game-environment contract
Primary request: Create a new wide shot of a blue winter grove that looks as though it belongs to the exact same visual series as the five supplied references.

Input images and authority:
- Images 1–5 are the ONLY visual references. Do not use or infer style from any prior generated image.
- Images 4 and 5 are the dominant references for the snowy forest, degree of voxel abstraction, high-key pastel exposure, sparse staging, tiny focal subject, and miniature cinematic camera.
- Image 3 controls pale fog, quiet negative space, soft atmospheric separation, and selective focus.
- Images 1 and 2 support the physical miniature-diorama photography, chunky voxel construction, cool/warm separation, and shallow optical depth of field.
Match these qualities closely rather than treating them as loose inspiration.

Scene/backdrop: a broad, quiet snow clearing bordered by a compact grove of rounded snow-heavy voxel trees, with a few taller narrow trees breaking the canopy. Keep a large simple field of untouched snow and soft pale sky. Place one very small orange voxel fox alone in the clearing as the restrained warm focal accent and scale cue. No architecture.

Style/medium: the same stylized miniature realism as the references—clearly voxel-built and deliberately simplified, photographed like a real handcrafted tabletop diorama through a macro or tilt-shift lens. Use medium-to-chunky voxels and soft clustered tree masses. Preserve physical light, shadow, lens blur, and atmospheric depth, but do not turn the scene into realistic forest concept art or a highly detailed 3D environment.

Composition/framing: wide horizontal 3:2 establishing view closely following Images 4 and 5: a distant tiny fox near the open center, the grove forming one readable background mass, softly blurred foreground snow or foliage at an edge, generous quiet negative space, and a narrow sharp focal band through the fox and clearing. Calm observational viewpoint, not an epic vista.

Lighting/mood: pale periwinkle-blue and lilac winter light, diffuse and slightly overexposed like Images 4 and 5, low contrast, cool soft shadows, faint blush in the snow, gentle haze, stillness, solitude, tenderness, and quiet mystery. The orange fox is the only strong warm color.

Materials/textures: simplified voxel snow clumps and rounded crown clusters; restrained brown trunk glimpses; soft powder surfaces. Keep texture frequency and geometric complexity no higher than the supplied references.

Constraints: source-reference fidelity is more important than novelty; preserve their exact abstraction level, softness, palette family, lens behavior, visual quiet, and miniature scale. Original scene, no copied building or human figures. No text, logo, signature, border, or watermark.

Avoid: micro-voxel detail; individually modeled realistic twigs; fissured bark closeups; exposed giant roots; dramatic golden rim light; HDR contrast; dark fantasy forest; sharp full-frame focus; photorealistic vegetation; glossy PBR; cinematic concept-art polish; dense clutter; giant hero tree; Minecraft terrain; smooth non-voxel blobs.
```

### Frozen creek

```text
Use case: stylized-concept
Asset type: strict visual reference for a declarative game-environment contract
Primary request: Create a new wide traversal shot of a frozen creek entering a blue winter grove, and make it look as though it belongs to the exact same visual series as the five supplied references.

Input images and authority:
- Images 1–5 are the ONLY visual references. Do not use or infer style from any prior generated image.
- Images 4 and 5 are the dominant references for snowy forest geometry, degree of voxel abstraction, high-key pastel exposure, sparse staging, tiny focal subject, and miniature cinematic camera.
- Image 3 controls pale fog, quiet negative space, foreground occlusion, atmospheric separation, and selective focus.
- Images 1 and 2 support physical handcrafted-diorama scale, cool/warm separation, chunky voxel construction, and shallow optical depth of field.
Match these qualities closely rather than treating them as loose inspiration.

Scene/backdrop: a narrow gently winding frozen creek crosses a simple open snowfield and leads into a compact grove of rounded snow-heavy voxel trees. The creek is a restrained pale blue ribbon with soft stepped voxel banks, a few sparse grass clusters, and only a handful of small half-buried shapes. Place one very small orange voxel fox walking beside the creek near the focal plane as the warm scale cue. No architecture and no bridge.

Style/medium: the same stylized miniature realism as the references—clearly voxel-built and deliberately simplified, photographed like a real handcrafted tabletop diorama through a macro or tilt-shift lens. Use medium-to-chunky voxels, soft clustered tree masses, and low texture frequency. Preserve believable light, shadow, lens blur, and atmosphere without becoming realistic forest concept art or a highly detailed 3D environment.

Composition/framing: wide horizontal 3:2 view. Use the creek as one quiet leading line from the lower foreground toward a small opening in the distant grove. Keep large areas of uncluttered snow, a readable background tree mass, a softly blurred foreground edge, and a narrow sharp focal band around the tiny fox and middle creek. Calm intimate viewpoint with generous breathing room, not an epic corridor or dramatic low-angle vista.

Lighting/mood: pale periwinkle-blue and lilac winter light, diffuse and slightly overexposed like Images 4 and 5, low contrast, cool soft shadows, faint blush in the snow, gentle haze, stillness, solitude, tenderness, and quiet mystery. The orange fox is the only strong warm color.

Materials/textures: simplified voxel snow clumps, rounded crown clusters, restrained brown trunk glimpses, powder-soft ground, and a subtly translucent-looking but simple frozen creek. Keep geometric complexity no higher than the supplied references.

Constraints: source-reference fidelity is more important than novelty; preserve their abstraction level, softness, palette family, lens behavior, visual quiet, and miniature scale. Original scene, no copied building or human figures. No text, logo, signature, border, or watermark.

Avoid: micro-voxel detail; realistic water simulation; intricate ice cracks; individually modeled twigs; detailed bark; exposed giant roots; dramatic golden rim light; HDR contrast; dark fantasy forest; sharp full-frame focus; photorealistic vegetation; glossy PBR; cinematic concept-art polish; dense clutter; cathedral-like tree corridor; Minecraft terrain; smooth non-voxel blobs.
```

### Frost-tree detail

```text
Use case: stylized-concept
Asset type: strict visual reference for a declarative game-environment contract
Primary request: Create a new medium-close winter-grove shot that reveals the readable construction of one frost-bent voxel tree, and make it look as though it belongs to the exact same visual series as the five supplied references.

Input images and authority:
- Images 1–5 are the ONLY visual references. Do not use or infer style from any prior generated image.
- Images 4 and 5 are the dominant references for snowy tree geometry, degree of voxel abstraction, high-key pastel exposure, small focal subject, and miniature cinematic camera.
- Image 2 controls the closer diorama viewpoint, readable chunky voxel scale, warm fox accent, and very shallow optical focus.
- Image 3 controls pale fog, foreground occlusion, quiet negative space, and atmospheric softness.
- Image 1 supports physical handcrafted-diorama scale and cool/warm light separation.
Match these qualities closely rather than treating them as loose inspiration.

Scene/backdrop: at the edge of a quiet snow clearing, one mature rounded snow-heavy voxel tree has a gentle bent lower fork that forms a small natural arch. Show the simple trunk fork, a few branch-supported snow clumps, and restrained brown wood glimpses without turning them into a realistic bark study. A very small orange voxel fox pauses near the tree in the focal plane as a warm scale cue. Other softly clustered snowy trees recede into pale haze. No architecture.

Style/medium: the same stylized miniature realism as the references—clearly voxel-built, deliberately simplified, and photographed like a real handcrafted tabletop diorama through a macro or tilt-shift lens. Use medium-to-chunky voxels, rounded clustered foliage, soft snow masses, low texture frequency, and physical lens blur. Preserve believable light and scale without becoming realistic forest concept art or detailed fantasy environment art.

Composition/framing: horizontal 3:2 medium-wide miniature view, closer in spirit to Image 2 but with the pale open mood of Images 3–5. Place the bent tree off center, show its complete lower silhouette and a little surrounding snowfield, keep the fox small, use one softly blurred foreground snow mass, and limit sharpness to a narrow band through the fox and trunk fork. The tree is readable but does not fill the frame like a monumental hero object.

Lighting/mood: pale periwinkle-blue and lilac winter light, diffuse and slightly overexposed, low contrast, cool soft shadows, faint blush snow bounce, gentle haze, stillness, tenderness, curiosity, and quiet mystery. Allow only a restrained warm brown in the trunk and orange in the fox.

Materials/textures: simplified blocky trunk planes, chunky branch joints, rounded voxel snow clusters, and powder-soft ground. Keep geometric complexity and texture frequency no higher than the supplied references.

Constraints: source-reference fidelity is more important than novelty; preserve their abstraction level, softness, palette family, lens behavior, visual quiet, and miniature scale. Original scene, no copied building or human figures. No text, logo, signature, border, or watermark.

Avoid: giant exposed roots; monumental ancient tree; micro-voxel detail; fissured realistic bark; individually modeled twigs; icicle closeups; dramatic golden rim light; HDR contrast; dark fantasy forest; sharp full-frame focus; photorealistic vegetation; glossy PBR; cinematic concept-art polish; dense clutter; magical particles; Minecraft terrain; smooth non-voxel blobs.
```

## Historical `v3` clearing-edit prompt

### Clearing edit

```text
Use case: precise-object-edit
Asset type: game-environment contract visual reference
Input images: Image 1 is the sole edit target and the authoritative source for every unchanged pixel and visual quality.

Primary request: Remove only the small orange voxel fox near the center of the snow clearing. Replace it at the same location with exactly three tiny flat 2D pixel-art RPG adventurer sprites traveling together.

Replacement subject: a compact party of three readable but very small field sprites—one cloaked sword-bearing traveler, one staff-bearing traveler, and one lightly equipped traveler. Use simple original silhouettes and a restrained warm rust, muted ochre, deep blue, and dark neutral palette. They should read as classic flat 2D sprite billboards placed upright in the 3D voxel diorama: crisp square pixel clusters, front/three-quarter field poses, no modeled voxel thickness, no 3D bodies, no realistic anatomy. Their combined visual footprint should be only slightly wider than the removed fox, and they must remain a tiny scale cue rather than a new hero subject.

Placement/action: anchor their feet naturally on the same snow plane where the fox stood; arrange them as a loose traveling cluster facing toward the distant grove. Give them only tiny restrained contact shadows consistent with the scene.

Critical invariants: CHANGE ONLY THE FOX-SIZED AREA. Remove the fox completely with no orange tail, legs, or silhouette remaining. Preserve the entire winter environment exactly: identical trees, snowfield, small plants, rocks, horizon, sky, framing, camera viewpoint, crop, resolution, periwinkle/lilac palette, exposure, lighting, shadows, haze, narrow depth-of-field band, foreground blur, and background blur. Do not restyle, sharpen, relight, recolor, crop, rearrange, add, or remove anything else.

Constraints: exactly three adventurer sprites; flat 2D pixel art inside the existing 3D voxel scene; original character designs; no UI, speech bubbles, text, logo, signature, border, or watermark.
Avoid: foxes or other animals; 3D voxel characters; miniature figurines; smooth painted characters; anime portraits; oversized heroes; detailed faces; weapons larger than the sprites; extra props; extra characters; changes to the environment.
```

## `v4` HD-2D party anchor and edit prompts

### Party identity anchor

```text
Use case: stylized-concept
Asset type: character-identity and pixel-craft anchor for later game-environment edits
Primary request: Create one original party of three premium HD-2D fantasy RPG field sprites. This is a production-quality character anchor, not a scene and not a concept sketch.

Characters, left to right:
1. Vanguard — a young adult traveler in a deep indigo hooded half-cape, charcoal layered tunic, weathered boots, silver-edged short sword held low, small leather pack; calm protective silhouette.
2. Scholar — a young adult traveler in a long rust-red winter coat, cream scarf, dark trousers, brass-ringed wooden staff, small book satchel; thoughtful silhouette.
3. Scout — a young adult traveler in a cropped moss-green cloak, ochre scarf, fitted leather travel gear, short bow and compact quiver; alert nimble silhouette.

Style/medium: exceptionally polished flat 2D pixel art for a premium HD-2D console RPG field view, using wholly original character designs. Comparable production craftsmanship to the best modern pixel-sprite RPGs: intentional pixel clusters, elegant proportions, strong readable silhouettes, controlled one-pixel accents, coherent fabric folds, layered clothing, equipment that reads at field scale, selective dark outlines, and four-to-six purposeful value steps per material. Each character should look designed on roughly a 48×64-pixel native sprite canvas and enlarged with perfect nearest-neighbor scaling so every square pixel remains crisp.

Pose/view: full-body three-quarter field pose, facing slightly toward screen right, feet visible, subtle ready-to-travel stance. Keep all three at identical pixel density, body scale, and perspective. Their faces use only a few disciplined pixels; expression comes from posture and silhouette.

Composition: three separated sprites in one horizontal row with generous equal spacing and no overlap. Center them on a perfectly flat solid muted lavender-gray background. No floor plane and no environment.

Lighting/color: neutral base shading with a subtle cool blue upper rim and soft warm lower bounce so the sprites can integrate into a snowy blue-lilac diorama later. Rich but restrained indigo, rust, cream, moss, ochre, leather brown, charcoal, and small steel highlights.

Constraints: original designs only; strictly flat 2D sprites; hard square pixel edges; consistent pixel grid; complete silhouettes; no text, names, labels, UI, logo, signature, border, or watermark.
Avoid: copying any existing RPG character or costume; low-detail placeholder sprites; 8-bit or 16×16 simplicity; chibi bobbleheads; oversized heads; vague blobs; muddy outlines; random single-pixel noise; smooth painterly shading; anti-aliased edges; 3D models; voxel people; figurines; sprite-sheet grids; multiple poses per character; weapons larger than the characters.
```

### Clearing edit

```text
Use case: precise-object-edit
Asset type: active game-environment contract visual reference

Input images:
- Image 1 is the EDIT TARGET and the sole authority for the environment, framing, lighting, color, camera, depth of field, and placement.
- Image 2 is a CHARACTER-IDENTITY AND PIXEL-CRAFT REFERENCE ONLY. Use its exact original party concept: indigo-hooded vanguard, rust-coated scholar with cream scarf and staff, and moss-cloaked scout with ochre scarf and bow. Ignore Image 2's dark background, large scale, framing, glow, and composition.

Primary request: Replace only the three low-detail pixel characters near the center of Image 1 with a production-quality HD-2D RPG field-sprite version of the same three-character party from Image 2.

Sprite quality: redraw the characters specifically for their final on-screen field scale rather than merely shrinking the large reference. Use polished modern HD-2D pixel craftsmanship comparable in quality to a premium console RPG: deliberate coherent pixel clusters, strong class silhouettes, layered winter clothing, readable small equipment, controlled selective outlines, clean four-to-six-step material shading, a few precise highlight pixels, and consistent pixel density across all three. They must remain strictly flat 2D billboard sprites with crisp square pixels and no anti-aliasing or smooth 3D volume.

Scale and arrangement: each sprite should be approximately 52–60 image pixels tall in this 1536×1024 scene—large enough for the clothing and gear to read, but still a small party inside the broad clearing. Place them over the exact current party location in a loose staggered traveling formation, not a front-facing lineup. Show three-quarter rear/side field poses as they head toward the distant grove. Keep all three full bodies and feet visible, with natural separation and no overlap.

Scene integration: keep the pixels crisp in the existing focal band. Apply restrained cool periwinkle rim pixels and faint warm snow-bounce pixels consistent with Image 1, plus tiny soft contact shadows under their feet. Do not add a glow, aura, portrait lighting, or background patch around them.

Critical invariants: CHANGE ONLY THE CURRENT PARTY-SIZED AREA. Fully remove the existing three low-quality sprites. Preserve every other aspect of Image 1: exact tree silhouettes and positions, snowfield, plants, rocks, sky, horizon, negative space, camera, crop, resolution, palette, exposure, shadows, haze, foreground blur, background blur, and miniature-diorama mood. Do not sharpen, relight, recolor, crop, rearrange, or regenerate the environment.

Constraints: exactly three characters; same character identities and outfit palette as Image 2; wholly original designs; no copied RPG characters; no text, UI, speech bubbles, logo, signature, border, or watermark.
Avoid: low-detail placeholder sprites; tiny 16×16 simplicity; chibi bobbleheads; oversized heads; stiff front-facing lineup; muddy outlines; random pixel noise; blurry resampling; smooth painted characters; 3D models; voxel people; figurines; extra characters; extra props; environment changes.
```

## `v4` HD-2D scene edit prompts (continued)

### Frozen-creek edit

```text
Use case: precise-object-edit
Asset type: active game-environment contract visual reference

Input images:
- Image 1 is the EDIT TARGET and the sole authority for the environment, frozen creek, framing, lighting, color, camera, depth of field, and placement.
- Image 2 is a CHARACTER-IDENTITY AND PIXEL-CRAFT REFERENCE ONLY. Use its exact original party concept: indigo-hooded vanguard, rust-coated scholar with cream scarf and staff, and moss-cloaked scout with ochre scarf and bow. Ignore Image 2's dark background, large scale, framing, glow, and composition.

Primary request: Replace only the three low-detail pixel characters beside the creek in Image 1 with a production-quality HD-2D RPG field-sprite version of the same three-character party from Image 2.

Sprite quality: redraw the characters specifically for their final on-screen field scale rather than merely shrinking the large reference. Use polished modern HD-2D pixel craftsmanship comparable in quality to a premium console RPG: deliberate coherent pixel clusters, strong class silhouettes, layered winter clothing, readable small equipment, controlled selective outlines, clean four-to-six-step material shading, precise highlight pixels, and consistent pixel density. They must remain strictly flat 2D billboard sprites with crisp square pixels and no anti-aliasing or smooth 3D volume.

Scale and arrangement: each sprite should be approximately 58–66 image pixels tall in this 1536×1024 scene—large enough for clothing and gear to read, yet clearly subordinate to the forest. Replace the exact current party location beside the near creek bank. Arrange them as a staggered traveling group moving along the creek toward the grove opening: indigo vanguard leading, rust scholar following, moss scout watching the rear. Use three-quarter rear/side field poses rather than a front-facing lineup. Keep full bodies and feet visible with no overlap.

Scene integration: keep the pixels crisp in the existing focal band. Apply restrained cool periwinkle rim pixels and faint warm snow-bounce pixels consistent with Image 1, plus tiny soft contact shadows under their feet. Do not add glow, aura, portrait lighting, or a background patch.

Critical invariants: CHANGE ONLY THE CURRENT PARTY-SIZED AREA. Fully remove the existing three low-quality sprites. Preserve every other aspect of Image 1: exact tree silhouettes and positions, frozen creek, stepped banks, snowfield, plants, rocks, distant opening, sky, camera, crop, resolution, palette, exposure, shadows, haze, foreground blur, background blur, and miniature-diorama mood. Do not sharpen, relight, recolor, crop, rearrange, or regenerate the environment.

Constraints: exactly three characters; same character identities and outfit palette as Image 2; wholly original designs; no copied RPG characters; no text, UI, speech bubbles, logo, signature, border, or watermark.
Avoid: low-detail placeholder sprites; tiny 16×16 simplicity; chibi bobbleheads; oversized heads; stiff front-facing lineup; muddy outlines; random pixel noise; blurry resampling; smooth painted characters; 3D models; voxel people; figurines; extra characters; extra props; environment changes.
```

### Frost-tree edit

```text
Use case: precise-object-edit
Asset type: active game-environment contract visual reference

Input images:
- Image 1 is the EDIT TARGET and the sole authority for the frost-bent tree, environment, framing, lighting, color, camera, depth of field, and placement.
- Image 2 is a CHARACTER-IDENTITY AND PIXEL-CRAFT REFERENCE ONLY. Use its exact original party concept: indigo-hooded vanguard, rust-coated scholar with cream scarf and staff, and moss-cloaked scout with ochre scarf and bow. Ignore Image 2's dark background, large scale, framing, glow, and composition.

Primary request: Replace only the three low-detail pixel characters beside the frost-bent tree in Image 1 with a production-quality HD-2D RPG field-sprite version of the same three-character party from Image 2.

Sprite quality: redraw the characters specifically for their final on-screen field scale rather than merely shrinking the large reference. Use polished modern HD-2D pixel craftsmanship comparable in quality to a premium console RPG: deliberate coherent pixel clusters, strong class silhouettes, layered winter clothing, readable equipment, controlled selective outlines, clean four-to-six-step material shading, precise highlight pixels, and consistent pixel density. They must remain strictly flat 2D billboard sprites with crisp square pixels and no anti-aliasing or smooth 3D volume.

Scale and arrangement: each sprite should be approximately 60–70 image pixels tall in this 1536×1024 closer view—large enough for clothing and gear to read, but clearly subordinate to the landmark tree. Replace the exact current party location left of the trunk. Arrange them in a loose observational group facing the tree: indigo vanguard slightly forward and watchful, rust scholar studying the arch with staff upright, moss scout turned partly toward the route behind them. Use varied three-quarter side/rear field poses, not a front-facing lineup. Keep full bodies and feet visible with natural spacing and no overlap.

Scene integration: keep the pixels crisp in the existing focal band. Apply restrained cool periwinkle rim pixels and faint warm snow-bounce pixels consistent with Image 1, plus tiny soft contact shadows under their feet. Do not add glow, aura, portrait lighting, or a background patch.

Critical invariants: CHANGE ONLY THE CURRENT PARTY-SIZED AREA. Fully remove the existing three low-quality sprites. Preserve every other aspect of Image 1: exact frost-bent tree silhouette, branch arch, trunk, canopy, background trees, snowfield, grasses, rocks, sky, camera, crop, resolution, palette, exposure, shadows, haze, foreground blur, background blur, and miniature-diorama mood. Do not sharpen, relight, recolor, crop, rearrange, or regenerate the environment.

Constraints: exactly three characters; same character identities and outfit palette as Image 2; wholly original designs; no copied RPG characters; no text, UI, speech bubbles, logo, signature, border, or watermark.
Avoid: low-detail placeholder sprites; tiny 16×16 simplicity; chibi bobbleheads; oversized heads; stiff front-facing lineup; muddy outlines; random pixel noise; blurry resampling; smooth painted characters; 3D models; voxel people; figurines; extra characters; extra props; environment changes.
```

## Historical `v3` remaining edit prompts

### Frozen-creek edit

```text
Use case: precise-object-edit
Asset type: game-environment contract visual reference
Input images: Image 1 is the sole edit target and the authoritative source for every unchanged pixel and visual quality.

Primary request: Remove only the small orange voxel fox beside the frozen creek. Replace it at the same location with exactly three tiny flat 2D pixel-art RPG adventurer sprites traveling together toward the grove.

Replacement subject: a compact party of three readable but very small field sprites—one cloaked sword-bearing traveler, one staff-bearing traveler, and one lightly equipped traveler. Use simple original silhouettes and a restrained warm rust, muted ochre, deep blue, and dark neutral palette. They should read as classic flat 2D sprite billboards placed upright in the 3D voxel diorama: crisp square pixel clusters, front/three-quarter field poses, no modeled voxel thickness, no 3D bodies, no realistic anatomy. Their combined visual footprint should be only slightly wider than the removed fox, and they must remain a tiny scale cue rather than a new hero subject.

Placement/action: anchor their feet naturally on the same snow plane where the fox stood, beside the near bank of the frozen creek; arrange them as a loose traveling cluster oriented along the creek toward the grove opening. Give them only tiny restrained contact shadows consistent with the scene.

Critical invariants: CHANGE ONLY THE FOX-SIZED AREA. Remove the fox completely with no orange tail, legs, or silhouette remaining. Preserve the entire winter environment exactly: identical trees, frozen creek and stepped banks, snowfield, small plants, rocks, distant opening, sky, framing, camera viewpoint, crop, resolution, periwinkle/lilac palette, exposure, lighting, shadows, haze, narrow depth-of-field band, foreground blur, and background blur. Do not restyle, sharpen, relight, recolor, crop, rearrange, add, or remove anything else.

Constraints: exactly three adventurer sprites; flat 2D pixel art inside the existing 3D voxel scene; original character designs; no UI, speech bubbles, text, logo, signature, border, or watermark.
Avoid: foxes or other animals; 3D voxel characters; miniature figurines; smooth painted characters; anime portraits; oversized heroes; detailed faces; weapons larger than the sprites; extra props; extra characters; changes to the environment.
```

### Frost-tree edit

```text
Use case: precise-object-edit
Asset type: game-environment contract visual reference
Input images: Image 1 is the sole edit target and the authoritative source for every unchanged pixel and visual quality.

Primary request: Remove only the small orange voxel fox beside the frost-bent tree. Replace it at the same location with exactly three tiny flat 2D pixel-art RPG adventurer sprites traveling together.

Replacement subject: a compact party of three readable but very small field sprites—one cloaked sword-bearing traveler, one staff-bearing traveler, and one lightly equipped traveler. Use simple original silhouettes and a restrained warm rust, muted ochre, deep blue, and dark neutral palette. They should read as classic flat 2D sprite billboards placed upright in the 3D voxel diorama: crisp square pixel clusters, front/three-quarter field poses, no modeled voxel thickness, no 3D bodies, no realistic anatomy. Their combined visual footprint should be only slightly wider than the removed fox, and they must remain a small scale cue rather than competing with the tree.

Placement/action: anchor their feet naturally on the same snow plane where the fox stood; arrange them as a loose adventuring cluster paused beside and looking toward the bent tree and its natural arch. Give them only tiny restrained contact shadows consistent with the scene.

Critical invariants: CHANGE ONLY THE FOX-SIZED AREA. Remove the fox completely with no orange tail, legs, or silhouette remaining. Preserve the entire winter environment exactly: identical frost-bent tree, trunk fork, canopy, background trees, snowfield, grass clusters, rocks, sky, framing, camera viewpoint, crop, resolution, periwinkle/lilac palette, exposure, lighting, shadows, haze, narrow depth-of-field band, foreground blur, and background blur. Do not restyle, sharpen, relight, recolor, crop, rearrange, add, or remove anything else.

Constraints: exactly three adventurer sprites; flat 2D pixel art inside the existing 3D voxel scene; original character designs; no UI, speech bubbles, text, logo, signature, border, or watermark.
Avoid: foxes or other animals; 3D voxel characters; miniature figurines; smooth painted characters; anime portraits; oversized heroes; detailed faces; weapons larger than the sprites; extra props; extra characters; changes to the environment.
```
