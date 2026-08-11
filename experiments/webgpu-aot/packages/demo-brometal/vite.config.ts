import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

export default defineConfig({
  publicDir: fileURLToPath(
    new URL("../../benchmark-assets", import.meta.url),
  ),
  build: {
    assetsInlineLimit: 0,
  },
});
