import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const directory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        architecture: path.resolve(directory, "architecture.html"),
        index: path.resolve(directory, "index.html"),
      },
    },
  },
});
