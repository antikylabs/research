import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { compileShader } from "typegpu-antiky";

const packageDirectory = fileURLToPath(new URL("..", import.meta.url));
const generatedDirectory = join(packageDirectory, "src/generated");

await Promise.all(
  ["shadow", "forward", "particles", "bloom", "ambient", "reflection", "reflection-reconstruct", "reflection-select", "temporal", "composite"].map((name) =>
    compileShader({
      input: join(packageDirectory, `src/shaders/${name}.shader.ts`),
      outDir: generatedDirectory,
    }),
  ),
);
