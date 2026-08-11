import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import typegpu from "unplugin-typegpu/vite";

export default defineConfig({
  plugins: [typegpu()],
  publicDir: fileURLToPath(
    new URL("../../benchmark-assets", import.meta.url),
  ),
  build: {
    target: "es2022",
  },
});
