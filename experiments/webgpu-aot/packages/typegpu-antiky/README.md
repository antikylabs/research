# typegpu-antiky

`typegpu-antiky` is a small build-time adapter that turns TypeGPU-authored
render or compute functions into static runtime artifacts.

The shader source uses TypeGPU and `unplugin-typegpu` during the build:

```text
*.shader.ts -> TypeGPU transform -> TypeGPU resolve -> WGSL + TypeScript metadata
```

Application code imports only the generated module. TypeGPU, its resolver, and
its shader AST are not part of the production runtime.

## Authoring

Import `defineShader` from the compiler-free authoring entry point for a
render artifact:

```ts
import { defineShader } from "typegpu-antiky/shader";

export default defineShader({
  vertex,
  fragment,
  entryPoints: { vertex: "vertexMain", fragment: "fragmentMain" },
  bindGroups,
  pipeline,
});
```

Use `defineComputeShader` for a single compute entry point:

```ts
import { defineComputeShader } from "typegpu-antiky/shader";

export default defineComputeShader({
  compute,
  entryPoints: { compute: "computeMain" },
  bindGroups,
});
```

Render artifacts carry static render-pipeline metadata. Both artifact kinds
carry static buffer, sampler, sampled-texture, and storage-texture bindings.
The compiler checks that declared entry points and bindings exist in TypeGPU's
resolved WGSL and that every binding is visible to the artifact's shader
stages.

## Building

Build the package, then compile a shader:

```sh
npm run build --workspace typegpu-antiky
node packages/typegpu-antiky/dist/cli.js build path/to/material.shader.ts --out-dir path/to/generated
```

The command emits `material.wgsl` and `material.generated.ts`.
