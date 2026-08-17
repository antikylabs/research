import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    assetsInlineLimit: 0,
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/antiky-game.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'antiky.game.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'chunks/[name]-[hash].js',
        entryFileNames: 'antiky.game.js',
      },
    },
  },
});
