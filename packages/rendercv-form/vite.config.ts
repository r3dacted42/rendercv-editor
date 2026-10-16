import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { copyFileSync } from 'node:fs';

// Library build. Every runtime dependency is external and declared in
// `package.json` — `vue` as a peer, the schema loader's heavy deps as optional
// peers, the rest as regular dependencies. Externalising gives consumers a
// single copy of reka-ui (important for its provide/inject providers) and is
// required because the emitted `.d.ts` reference these packages' types.
const external = [
  /^vue(\/.*)?$/,
  /^reka-ui(\/.*)?$/,
  /^@vueuse\/core(\/.*)?$/,
  /^@lucide\/vue(\/.*)?$/,
  /^class-variance-authority(\/.*)?$/,
  /^clsx(\/.*)?$/,
  /^tailwind-merge(\/.*)?$/,
  /^yaml(\/.*)?$/,
  /^@apidevtools\/json-schema-ref-parser(\/.*)?$/,
  /^buffer(\/.*)?$/,
];

export default defineConfig({
  plugins: [
    vue(),
    {
      // Vite doesn't emit CSS that isn't imported by an entry, so copy the
      // optional theme defaults into `dist` (published as `.../theme.css`).
      name: 'rendercv-form:copy-theme',
      closeBundle() {
        copyFileSync(
          path.resolve(import.meta.dirname, 'src/theme.css'),
          path.resolve(import.meta.dirname, 'dist/theme.css'),
        );
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    lib: {
      entry: {
        index: path.resolve(import.meta.dirname, 'src/index.ts'),
        ui: path.resolve(import.meta.dirname, 'src/ui.ts'),
        schema: path.resolve(import.meta.dirname, 'src/schema.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external,
    },
    sourcemap: true,
    // Declarations are emitted by `vue-tsc` before `vite build`; don't wipe them.
    emptyOutDir: false,
  },
});
