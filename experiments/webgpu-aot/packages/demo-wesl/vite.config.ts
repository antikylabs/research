import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import viteWesl from "wesl-plugin/vite";

export default defineConfig({
  plugins: [viteWesl()],
  publicDir: fileURLToPath(
    new URL("../../benchmark-assets", import.meta.url),
  ),
  build: {
    target: "es2022",
  },
  test: {
    // Dawn's native null backend can return an empty readback when multiple
    // test files create devices concurrently in separate Vitest workers.
    fileParallelism: false,
  },
});
