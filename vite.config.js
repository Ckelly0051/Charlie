import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

const ROOT = import.meta.dirname;

function preserveRuntimeAssets() {
  return {
    name: 'gridiron-runtime-assets',
    closeBundle() {
      // Runtime-generated <use href="assets/icons.svg#..."> references cannot
      // use Vite's hashed import, so the raw sprite remains load-bearing.
      const source = resolve(ROOT, 'assets');
      if (existsSync(source)) {
        cpSync(source, resolve(ROOT, 'dist', 'assets'), { recursive: true });
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
