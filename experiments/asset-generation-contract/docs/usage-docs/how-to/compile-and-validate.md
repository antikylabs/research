---
status: current
type: how-to
audience: contract authors and CI maintainers
applies-to: "@antiky/contracts@0.1.0"
---

# Compile and validate a contract

Use the CLI to turn a trusted local `.contract.ts` entry into canonical files, then validate the resolved JSON at the
consumer boundary.

## Use the CLI

Build the package before invoking its workspace binary:

```sh
npm run build --workspace @antiky/contracts
npm exec -- antiky-contract compile \
  path/to/scene.contract.ts \
  --out generated/scene
```

The entry must be inside its project root, end in `.contract.ts`, and export only one default `scene(...)` value. The
CLI uses the entry's directory as the project root. A successful compile exits `0` and writes the five files listed in
the [output reference](../reference/outputs.md).

The compiler bundles TypeScript with esbuild; it does not run the TypeScript type checker. Run the consuming project's
normal `tsc --noEmit` or equivalent typecheck as a separate CI step.

Validate the emitted technical contract independently:

```sh
npm exec -- antiky-contract validate \
  generated/scene/resolved-contract.json
```

Validation exits `0` when the schema, catalog payloads, ownership graph, references, relationships, and system graph are
valid. A compile or validation failure exits `1`; a missing required argument or unknown command exits `2`. Version
0.1.0 ignores trailing arguments after a recognized command, so do not rely on its exit code to detect an extra option.

## Use the library API

Use `compileContract` when a build tool needs the files in memory or needs to set a wider project root:

```ts
import { compileContract } from '@antiky/contracts/compiler';

const result = await compileContract('scenes/scene.contract.ts', {
  outputDirectory: 'generated/scene',
  projectRoot: '.',
});

if (!result.ok) {
  for (const diagnostic of result.diagnostics) {
    console.error(diagnostic.code, diagnostic.semanticPath, diagnostic.message);
  }
  process.exitCode = 1;
}
```

To validate JSON received from disk or another process, keep it typed as `unknown` until validation succeeds:

```ts
import { readFile } from 'node:fs/promises';
import { validateResolvedContract } from '@antiky/contracts/compiler';

const input: unknown = JSON.parse(
  await readFile('generated/scene/resolved-contract.json', 'utf8'),
);
const result = await validateResolvedContract(input);

if (!result.valid) {
  for (const diagnostic of result.diagnostics) {
    console.error(diagnostic.code, diagnostic.technicalPath, diagnostic.message);
  }
  process.exitCode = 1;
}
```

A successful semantic compile already passes this resolved-contract validation. Validate again at an ingestion or trust
boundary, or when checking a hand-authored technical fixture.

For exact signatures and defaults, see the [compiler reference](../reference/compiler.md). For failures, follow
[Repair compiler diagnostics](repair-diagnostics.md).
