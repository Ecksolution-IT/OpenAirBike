import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works from any static host path (e.g. GitHub Pages).
  base: './',
  // SQLite WASM loads its .wasm itself; pre-bundling breaks that (package README).
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  worker: {
    format: 'es',
  },
  build: {
    rolldownOptions: {
      // The app, plus the Milestone 0 hardware-proof developer tool as a separate page.
      input: {
        main: 'index.html',
        hardwareProof: 'tools/hardware-proof/index.html',
      },
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
