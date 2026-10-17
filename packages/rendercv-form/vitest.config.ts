import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

/**
 * The suite runs against `src/`, not `dist/`, so it needs no build step and
 * covers exactly the files that get published.
 *
 * The default environment is jsdom — the renderer, the persistence stores and
 * everything that touches `localStorage` need a DOM. The SSR suite opts into a
 * bare Node environment per file with `// @vitest-environment node`.
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
