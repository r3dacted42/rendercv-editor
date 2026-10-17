# RenderCV Editor

A schema-driven editor for [RenderCV](https://rendercv.com) YAML documents, split into a
reusable library and a demo app.

- **`packages/rendercv-form`** — the reusable Vue 3 form renderer, published to npm as
  [`@r3dacted42/rendercv-form`](https://www.npmjs.com/package/@r3dacted42/rendercv-form).
- **`playground`** — the reference app and the library's integration test. It is deployed to
  GitHub Pages.

## Layout

```
.
├── packages/
│   └── rendercv-form/             # the published library
│       ├── src/
│       │   ├── components/        # FormRenderer, ConfirmDialog, shadcn-vue UI kit
│       │   ├── composables/       # collapse / validation / visibility / form state, persistence
│       │   ├── lib/               # YAML + document ops, headless validation, schema metadata, policy
│       │   ├── index.ts           # public API               → "."
│       │   ├── ui.ts              # UI-primitive re-exports  → "./ui"
│       │   ├── schema.ts          # schema loading           → "./schema"
│       │   └── theme.css          # optional token defaults  → "./theme.css"
│       ├── scripts/               # build guards (declaration checks)
│       ├── tests/                 # Vitest suites (jsdom + Node/SSR) and the schema fixture
│       ├── components.json        # shadcn-vue CLI config (development only)
│       ├── tsconfig.build.json    # declaration emission
│       ├── vitest.config.ts       # test config
│       └── vite.config.ts         # library build
├── playground/                    # the demo app (consumes the library)
└── .github/workflows/             # test, build + deploy to gh-pages
```

## Requirements

- Node 24+ and npm 12+.
- The consuming app must use **Tailwind CSS v4** (see the package README for the one line
  that wires the library's classes into your Tailwind build).
- The library's runtime dependencies (`reka-ui`, `@vueuse/core`, `@lucide/vue`, `yaml`, `clsx`,
  `tailwind-merge`, `class-variance-authority`) are **external and declared**, so the library and
  its consumers share a single copy of each.

## Getting started

```bash
npm install
npm run dev
```

This builds the library and starts the playground at
<http://localhost:5173/rendercv-editor/>.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Build the library, then run the playground dev server. |
| `npm run build` | Build the library, then build the playground (`playground/dist`). |
| `npm test` | Run the library's Vitest suite (jsdom + Node/SSR environments). |
| `npm run typecheck` | Type-check the library, its tests and its configs. |
| `npm run preview` | Preview the built playground. |
| `npm run build:lib` | Build only the library. |
| `npm run dev:lib` | Rebuild the library on change (`vite build --watch`). |

## How the packages relate

The playground depends on the library through a **workspace link**
(`"@r3dacted42/rendercv-form": "*"`) and imports its built output from
`packages/rendercv-form/dist`. The library therefore has to be built before the playground
runs, which the root `dev`/`build` scripts handle automatically.

For iterative work on the library, run it in watch mode in one terminal and the playground in
another:

```bash
npm run dev:lib            # terminal 1
npm run dev -w playground  # terminal 2
```

## Publishing

The library is published from this monorepo; its version lives in
`packages/rendercv-form/package.json`. Public access is preset via `publishConfig.access`.

```bash
npm run build                                          # rebuild the library + its declarations
npm pack --dry-run -w @r3dacted42/rendercv-form        # inspect the tarball first
npm publish -w @r3dacted42/rendercv-form               # requires `npm login`
```

The published tarball contains `dist/` plus `README.md` and `LICENSE`. `src/`, `scripts/`,
`components.json` and the build config are development-only and excluded via `files`.
The build fails if an internal `@/…` import leaks into the emitted declarations
(`packages/rendercv-form/scripts/check-declarations.mjs`), since consumers could not resolve it.

### Testing the playground against the published package

The playground normally consumes the library through the workspace link. To verify the published
artifact instead, install it explicitly in the playground:

```bash
npm install @r3dacted42/rendercv-form@<version> -w playground
npm run build
```

Afterwards, reset `playground/package.json` back to the workspace range (`"*"`) and re-run
`npm install`.

## Deployment

`.github/workflows/deploy.yml` runs the library's tests, builds the library and the playground, and
publishes `playground/dist` to the `gh-pages` branch. The playground's `base` is
`/rendercv-editor/` (see `playground/vite.config.ts`).
