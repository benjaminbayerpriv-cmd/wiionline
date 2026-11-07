import { defineConfig } from 'vite';
export default defineConfig({ build: {
  outDir: 'dist/core', emptyOutDir: false,
  lib: { entry: 'src/dolphin-adapter.ts', formats: ['es'], fileName: () => 'adapter.js' },
} });
