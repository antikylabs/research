---
status: current
type: how-to
audience: contract authors adding visual evidence
applies-to: "@antiky/contracts@0.1.0"
---

# Use reference images

Create each image value once, then attach it to every relevant declaration with a specific statement of how that
declaration uses the image.

## Declare and attach an image

```ts
import { referenceImage, thing } from '@antiky/contracts/dsl';

const groveImage = referenceImage('./references/grove.png');

const pine = thing({
  name: 'Snow pine',
  references: [
    {
      image: groveImage,
      use: 'branch silhouette and the amount of snow held by each tier',
    },
  ],
});
```

The `use` value must be a non-empty string. Reuse the same `ReferenceImage` value when several declarations cite the
same file, but give each use edge its own description.

## Resolve paths from the entry

Reference paths must be non-empty, relative paths. The compiler resolves them from the directory containing the
`.contract.ts` entry, even when `referenceImage(...)` appears in an imported module.

The resolved file must remain inside `projectRoot`, including after resolving symbolic links. Absolute paths, missing
files, and paths that leave the root are blocking errors. Compiler output retains an entry-relative portable path and a
SHA-256 hash; it does not emit an absolute path.

The CLI sets `projectRoot` to the entry directory. Use the library API when the contract intentionally cites a shared
directory higher in the project:

```ts
import { compileContract } from '@antiky/contracts/compiler';

const result = await compileContract('scenes/winter/winter.contract.ts', {
  outputDirectory: 'generated/winter',
  projectRoot: '.',
});
```

## Compile an in-memory declaration

An in-memory scene that contains reference images must supply `entryPath`. The path establishes the same relative base
that a file entry would provide:

```ts
import { resolve } from 'node:path';
import { compileContract } from '@antiky/contracts/compiler';
import { referenceImage, scene } from '@antiky/contracts/dsl';

const look = referenceImage('./references/look.png');
const contract = scene({
  key: 'image-study',
  name: 'Image Study',
  references: [{ image: look, use: 'overall composition and palette' }],
});

const result = await compileContract(contract, {
  entryPath: resolve('scenes/image-study.contract.ts'),
  projectRoot: resolve('.'),
});
```

Without `entryPath`, this case returns `DSL_REFERENCE_ENTRY_REQUIRED`.

## Check the evidence

After compilation:

- `build-manifest.json` lists each distinct path, content hash, and use edge.
- `contract-index.json` groups every use by image hash in `referenceUsesByImageHash`.
- `resolved-contract.json` preserves the paths, hashes, owners, semantic paths, and use text in authoring provenance.

The shipped
[Blue Winter Grove reference module](../../../packages/examples/src/blue-winter-grove/blue-winter-grove.references.ts)
demonstrates four images reused across a larger scene.
