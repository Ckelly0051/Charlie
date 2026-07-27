import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

const ROOT = import.meta.dirname;

function preserveRuntimeAssets() {
  return {
    name: 'gridiron-runtime-assets',
    closeBundle() {
      for (const [sourceDir, outputDir] of [['assets', 'assets'], ['src-tauri/resources', 'resources']]) {
        const source = resolve(ROOT, sourceDir);
        if (existsSync(source)) {
          cpSync(source, resolve(ROOT, 'dist', outputDir), { recursive: true });
        }
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), preserveRuntimeAssets()],
  build: {
    emptyOutDir: true,
    target: 'es2022',
  },
});
