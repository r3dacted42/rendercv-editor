# @r3dacted42/rendercv-form

A schema-driven Vue 3 form renderer for [RenderCV](https://rendercv.com) YAML documents.

Point it at a dereferenced JSON Schema and a reactive object, and it renders an editable form
with the editing UX RenderCV documents need — progressive disclosure of optional fields,
choose-one (exclusive) groups, free-form section maps, and discriminated unions — while leaving
layout, toolbars, and import/export chrome to your app.

## Status

`0.3.3` — early. The renderer, its shared form state (collapse / validation / disclosure), the
document + YAML helpers, schema loading, optional theme defaults, and TypeScript declarations are
all available. `0.2.0` added the server-side story: SSR-safe UI state, headless `validateDoc()` /
`validateYaml()`, `$schemas`-aware document-editing primitives, and parser-free schema coordinates
(`SCHEMA_VERSION`, `DEFAULT_SCHEMA_URL`, `schemaUrl()`, `fetchSchemaText()`, `splitSchemas()`).
`0.3.0` makes the form inherit the host's design system: the bundled primitives are now the stock
shadcn-vue components (the default style) instead of a compact, square-cornered preset, and
`theme.css` became a fallback that your own tokens always override. `0.3.1` fixes the container
outline, which was drawn in the inherited text colour rather than `--border`. `0.3.2` makes
`theme.css` a complete stand-in for a shadcn-vue app's CSS — it now also ships shadcn's base-layer
defaults and the animation utilities the components use, so a host that supplies only tokens gets
the same result as a shadcn-vue project. `0.3.3` is a docs-and-tests release with no API change:
the examples in this README were corrected to match the shipped signatures, and the Vitest suite
gained coverage for the renderer's DOM behaviour and the field-policy and field-hint helpers.
The [playground](https://r3dacted42.github.io/rendercv-editor) is the reference implementation.

## Requirements

- Vue `^3.5` (peer dependency).
- The parser-free surface (`validateDoc`, `validateYaml`, `splitSchemas`, `fetchSchemaText`, the
  document helpers) runs in plain Node — no DOM, no Vue — see [SSR](#server-side-rendering-ssr).
- **Tailwind CSS v4** in the host app — the library ships class names, not CSS (see
  [Styling](#styling) for what the components expect alongside the tokens).
- The library's own runtime dependencies (`reka-ui`, `@vueuse/core`, `@lucide/vue`, `yaml`,
  `clsx`, `tailwind-merge`, `class-variance-authority`) are installed automatically as regular
  dependencies — they are external, not bundled, so your app and the library share a single copy.
- Only if you use the `.../schema` entry: `@apidevtools/json-schema-ref-parser` and `buffer`
  (optional peers, see [Schema loading](#schema-loading)).

## Install

```bash
npm install @r3dacted42/rendercv-form
```

## Quick start

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  FormRenderer,
  CORE_FIELDS,
  docToYaml,
  emptyDoc,
  provideFormState,
  type RenderCvSchemas,
} from '@r3dacted42/rendercv-form';
import { loadSchemas } from '@r3dacted42/rendercv-form/schema';

// Optional. A lone <FormRenderer> creates its own UI state; call this to
// control it and to share one state across several renderers.
const form = provideFormState();

const schemas = ref<RenderCvSchemas>();
const doc = ref(emptyDoc());

onMounted(async () => {
  schemas.value = await loadSchemas();
});

const exportYaml = async () => {
  if (!(await form.validate())) return; // reveal errors; bail if invalid
  return docToYaml(doc.value);
};
</script>

<template>
  <FormRenderer
    v-if="schemas"
    :schema="schemas.cv"
    v-model="doc.cv"
    root
    :core-fields="CORE_FIELDS.root"
  />
</template>
```

## What it handles

- **Optional-field disclosure.** Fields the schema allows to be `null` are hidden behind
  "Add …" chips until they hold a value. A small `CORE_FIELDS` set stays visible at the root.
- **Exclusive groups.** RenderCV accepts either `date` or `start_date`/`end_date`, never both.
  The renderer presents a single choose-one control that never emits both.
- **Section maps.** `cv.sections` is a map of user-named keys, each matching one of several
  schemas. Entries can be added (name + type) and removed.
- **Discriminated unions.** `design` (`theme`) and `locale` (`language`) are `oneOf` unions;
  the renderer offers a selector and asks for confirmation before discarding customisations.
- **Persistent collapse state**, a required-field validation registry, and multi-line hints.

## Components

### `<FormRenderer>`

| Prop | Type | Notes |
| --- | --- | --- |
| `schema` | `JsonSchema` | **Required.** A dereferenced object schema. |
| `v-model` | `any` | **Required.** The object being edited. |
| `root` | `boolean` | Marks a top-level section root. |
| `coreFields` | `string[]` | Optional fields kept visible at the root (use `CORE_FIELDS.root`). |
| `path` | `string` | Stable location for collapse persistence. |
| `title` / `userDefKey` | `string` | Header label / free-form key. |
| `variant` | `'group' \| 'item'` | `item` renders inline (no header). |
| `onDelete` | `Function` | Renders a remove button when provided. |
| `storageKey` | `string` | Namespace for persisted UI state (only when this renderer owns the state). |
| `persist` | `boolean` | Persist collapse/disclosure to `localStorage` (default `true`; only when this renderer owns the state). |
| `hydrate` | `'immediate' \| 'mounted'` | When to restore persisted UI state (default `immediate`); use `mounted` for SSR. |
| `ui` | `FormRendererUi` | Extra classes for `root`, `header`, `content`, `chips`. |
| `class` | — | Falls through to the outermost element. |

One `FormRenderer` edits one section. Render `schemas.cv` for the main content, and
`schemas.design` / `schemas.locale` / `schemas.settings` for the optional configuration
sections (typically behind tabs or a dialog).

#### Exposed methods

A template ref exposes an imperative surface that acts on the **shared** form state (so calling it
on any renderer affects every renderer sharing that state):

| Member | Description |
| --- | --- |
| `validate()` | Reveal every error; resolves `true` when nothing is invalid. |
| `expandAll()` / `collapseAll()` | Expand / collapse every group. |
| `reset()` | Reset disclosure + validation UI state (does not touch your data). |
| `output` | The cleaned value (internal `$schemas` markers removed). |

```ts
const renderer = ref();
if (await renderer.value.validate()) { /* safe to export */ }
const cleaned = renderer.value.output;
```

### `<ConfirmDialog>`

A small confirmation dialog used for destructive actions (clearing a field, switching a union
variant). Accepts `title`, `description`, `confirmLabel`, `cancelLabel`, `v-model:open`, emits
`confirm`, and renders its trigger through the `#trigger` slot.

## Form state & persistence

Collapse, validation, and optional-field disclosure are shared through provide/inject. A lone
`<FormRenderer>` creates its own state automatically, so the minimal usage needs no setup. Call
`provideFormState()` when you want to drive the state imperatively, share one state — and one
"expand all" — across several renderers (e.g. the main `cv` form plus `design`/`locale`/`settings`),
or configure persistence:

```ts
const form = provideFormState({
  storageKey: 'my-app', // collapse → 'my-app-collapse-state', disclosure → 'my-app-field-visibility'
  persist: true,        // false keeps UI state in memory only
  hydrate: 'immediate', // 'mounted' defers the restore until after mount (SSR)
});

form.expandAll();
form.collapseAll();
if (!(await form.validate())) return; // reveal errors, bail if invalid
form.reset();                         // reset disclosure + validation UI
```

`provideFormState()` provides the controller, so any descendant can also grab it with
`useFormState()`. The individual stores remain available if you only want one of them (see below).

## Server-side rendering (SSR)

The renderer and its state composables are safe to render on a server (Nitro, Nuxt, Vite SSR): the
persistence stores never touch `window`/`localStorage` when it is absent, so they fall back to
in-memory state instead of throwing. The renderer also brings its own tooltip provider, so no
app-level wrapper is needed for it to render.

There is one thing to choose deliberately. With the default `hydrate: 'immediate'`, the persisted
value is read during `setup`, so the *first client render* can differ from the server-rendered
markup (a hydration mismatch) whenever the visitor has persisted UI state. Pick one:

```vue
<!-- 1. Let the renderer decide: render defaults on both sides, restore after mount. -->
<FormRenderer :schema="schemas.cv" v-model="doc.cv" root hydrate="mounted" :core-fields="CORE_FIELDS.root" />

<!-- 2. Or opt out of persistence entirely and own the mounting yourself. -->
<ClientOnly>
  <FormRenderer :schema="schemas.cv" v-model="doc.cv" root :persist="false" :core-fields="CORE_FIELDS.root" />
</ClientOnly>
```

`hydrate: 'mounted'` only applies when the renderer owns the state; when you call
`provideFormState()`, pass it there (or on any `provideCollapsibleState` /
`provideFieldVisibility` call).

The document itself is plain data, so it can be built on the server and hydrated as is:

```ts
// server
const schemas = await loadSchemas();            // or splitSchemas(dereferencedJson)
const doc = yamlToDoc(await readFile('cv.yaml', 'utf8'), schemas);
return { schemas, doc };                        // ship the resolved schemas + doc to the client
```

## Headless validation

`validateDoc()` / `validateYaml()` run the same rules the form itself enforces — but with no DOM,
no Vue and no UI registry, so a server can vet a document (e.g. YAML produced by an LLM) before it
ever reaches the client:

```ts
import { validateDoc, validateYaml, yamlToDoc } from '@r3dacted42/rendercv-form';

const { doc, errors } = validateYaml(llmOutput, schemas);
if (errors.length) {
  return errors.map((e) => `${e.pathString}: ${e.message}`);
  // 'cv.sections.experience[0].company: Missing required "Company".'
}

// Already have a document? Validate it directly.
const more = validateDoc(yamlToDoc(yaml, schemas), schemas);
```

Each `ValidationError` carries machine-readable `path` (segments) and `pathString` (display form,
round-trips through `parsePath()`), a `code`, the schema `title` when it declares one, and a
human-readable `message`:

| `code` | Meaning |
| --- | --- |
| `required` | A property in the schema's `required` list is blank (`undefined` / `null` / `''`). |
| `type` | The value doesn't match the declared type. |
| `enum` | The value isn't one of the schema's `enum` / `const` values. |
| `exclusive` | Mutually exclusive fields are both set (e.g. `date` and `start_date`). |
| `parse` | The YAML couldn't be parsed (only from `validateYaml()`). |

It is deliberately *not* a general JSON Schema validator: the checks above (plus discriminated-union
resolution, including the `$schemas` markers on section maps) are exactly what `<FormRenderer>`
refuses to submit, so the two can't diverge. `pattern`, `format`, ranges and friends are left to a
dedicated validator such as Ajv if you need them. Pass **dereferenced** schemas, as returned by
`loadSchemas()` or `splitSchemas()`.

## Editing a document programmatically

The renderer edits its `v-model` object in place, and so can you. Every helper that changes the
document mutates `root` in place; `setAtPath()`, `insertAtPath()`, `moveAtPath()` and
`reorderAtPath()` also return it, so calls compose, while `removeAtPath()` returns whether it
removed anything:

```ts
import { getAtPath, insertAtPath, moveAtPath, removeAtPath, reorderAtPath, setAtPath } from '@r3dacted42/rendercv-form';

const path = ['cv', 'sections', 'experience'] as const;

getAtPath(doc, [...path, 0, 'company']);      // read
setAtPath(doc, [...path, 0, 'position'], 'Staff Engineer'); // write (creates missing containers)
insertAtPath(doc, [...path, 0], { company: 'Acme' });       // insert at an index (clamped)
moveAtPath(doc, path, 0, 2);                                // drag-and-drop reorder
reorderAtPath(doc, path, [2, 0, 1]);                        // any permutation
removeAtPath(doc, [...path, 1]);                            // delete a key or splice an index
```

Paths are **segment arrays**, never strings — dotted notation is only a display form
(`formatPath()` / `parsePath()`, which quote keys containing `.` or brackets). Section maps (whose
keys map to interchangeable schemas) get `$schemas`-aware helpers so the internal marker can never
drift out of sync:

```ts
import { addSection, removeSection, renameSection, sectionMarkers } from '@r3dacted42/rendercv-form';

const sections = doc.cv.sections ?? (doc.cv.sections = {});
addSection(sections, 'projects', schemas.cv.properties.sections.anyOf[0].additionalProperties.anyOf[0]);
removeSection(sections, 'projects');           // drops the key *and* its marker
renameSection(sections, 'projects', 'side-projects'); // moves the key and its marker
```

`removeAtPath()` already drops a section's marker when it removes the key, so plain path edits are
marker-correct too. Markers are never part of the exported YAML (`buildDoc` strips them).

## Schema loading

`loadSchemas()` lives in its own entry (`@r3dacted42/rendercv-form/schema`) because it pulls in
`@apidevtools/json-schema-ref-parser` (which depends on `undici`) and a `buffer` polyfill. Those
two are declared as **optional peer dependencies** — install them only if you use this entry:

```bash
npm install @apidevtools/json-schema-ref-parser buffer
```

```ts
import { loadSchemas, DEFAULT_SCHEMA_URL } from '@r3dacted42/rendercv-form/schema';

// Fetch + dereference the pinned RenderCV schema, split into the four sections.
const schemas = await loadSchemas();

// Or supply/cache the raw text yourself:
const schemas2 = await loadSchemas({
  text: cachedSchemaText,
  onText: (text) => { cachedSchemaText = text; },
});
```

The rest of the package (renderer, composables, YAML helpers) does not depend on it.

### Keeping the parser off the client

The parser-free half lives on the **root** entry, so a server can dereference once and cache the
result while browser bundles never see `json-schema-ref-parser`/`undici`/`buffer`:

```ts
import { DEFAULT_SCHEMA_URL, SCHEMA_VERSION, fetchSchemaText, schemaUrl, splitSchemas } from '@r3dacted42/rendercv-form';

SCHEMA_VERSION;      // 'v2.8' — the RenderCV release this package targets
DEFAULT_SCHEMA_URL;  // the raw, un-dereferenced schema JSON for that version
schemaUrl('v2.9');   // the same URL pinned to another version

// server: fetch once, cache the text (or the dereferenced JSON) however you like
const text = await fetchSchemaText();          // no $ref resolution, no parser

// anywhere: turn a dereferenced schema into the four sections
const schemas = splitSchemas(dereferencedJson);
```

`DEFAULT_SCHEMA_URL` / `SCHEMA_VERSION` are also re-exported from `.../schema` for compatibility.
Dereferencing is the only step that needs the parser, and it can happen once, on the server, with
whatever tool you prefer.

## Composables

- `provideFormState(options?)` / `useFormState()` — the shared controller (see above).
- `useOrProvideFormState(options?)` — what `<FormRenderer>` uses internally: reuse an ancestor's
  state, or create and provide one. `createFormController(collapsible, validation, visibility)`
  wraps stores you already have.
- `provideCollapsibleState(options?)` / `useCollapsibleStore()` / `useCollapsible(key)` —
  collapse state, persisted to `localStorage`.
- `provideValidationState()` / `useValidationState()` — the required-field registry
  (`requested`, `invalid`, `request()`, `reset()`).
- `provideFieldVisibility(options?)` / `useFieldVisibility()` — which optional fields were
  revealed, and the chosen mode of an exclusive group.

The `provide*` functions must run inside a component `setup`. Each store module also exports an
`inject*` variant (returns `undefined` instead of throwing); the collapse and disclosure modules add
a `create*` variant (builds a store without providing it).

Both persistence stores take `{ storageKey, persist, hydrate }` (see
[SSR](#server-side-rendering-ssr)). Note that provide/inject is *ancestor* based: to read a store
with `useCollapsibleStore()` / `useFieldVisibility()` / `useValidationState()`, the component must be
a **descendant** of the one that provided it — never the same component. `<FormRenderer>` reads its
own controller directly, so a lone renderer is unaffected.

## Document helpers

- `loadSchemas(options?)` — see above.
- `yamlToDoc(yaml, schemas)` — parse a RenderCV YAML document into the form's internal shape.
- `docToYaml(doc)` — serialise a document to RenderCV-compatible YAML.
- `buildDoc(doc)` — the export-ready plain object (`docToYaml` stringifies this).
- `emptyDoc()` — a fresh, empty document.
- `cleanData(data)` / `matchSchema(section, sectionsSchema)` — the underlying primitives.
- `CORE_FIELDS`, `EXCLUSIVE_GROUPS`, `isOptional`, `findExclusiveGroups` — the field policy.
- `isBlank` / `isFilled` — the shared "empty" / "filled" predicates behind both required-field
  validation and optional-field disclosure.
- `isMultiline`, `toTitleCase`, `removeTrailingS`, `cn` — small utilities.

Validation: `validateDoc(doc, schemas)`, `validateYaml(yaml, schemas)` — see
[Headless validation](#headless-validation).

Editing: `getAtPath`, `hasAtPath`, `setAtPath`, `insertAtPath`, `removeAtPath`, `moveAtPath`,
`reorderAtPath`, `formatPath`, `parsePath`, `sectionMarkers`, `sectionMarker`, `addSection`,
`removeSection`, `renameSection` — see
[Editing a document programmatically](#editing-a-document-programmatically).

Schema coordinates: `SCHEMA_VERSION`, `DEFAULT_SCHEMA_URL`, `schemaUrl`, `fetchSchemaText`,
`splitSchemas` — see [Keeping the parser off the client](#keeping-the-parser-off-the-client).

Types: `RenderCvDoc`, `RenderCvSchemas`, `ConfigKey`, `DocKey`, `JsonSchema`, `FormRendererUi`,
`FormStateController`, `FormStateOptions`, `HydrateMode`, `DocPath`, `SectionMarker`,
`ValidationError`, `ValidationCode`, `ValidateYamlResult`, `FetchSchemaTextOptions`,
`LoadSchemaOptions` (from `.../schema`).

## Styling

The library ships **class names, not CSS**. Add its output to your Tailwind v4 build so the
utilities it uses are generated:

```css
/* your app's CSS */
@source "../node_modules/@r3dacted42/rendercv-form/dist";
```

Its primitives are the **stock shadcn-vue components** (the default style), so the form inherits
your design system instead of bringing its own: colours, radius and typography all come from the
usual shadcn tokens — `--background`, `--foreground`, `--card(-foreground)`,
`--popover(-foreground)`, `--primary(-foreground)`, `--secondary(-foreground)`,
`--muted(-foreground)`, `--accent(-foreground)`, `--destructive(-foreground)`, `--border`,
`--input`, `--ring`, and `--radius` — mapped into the Tailwind theme with
`@theme inline { --color-primary: var(--primary); … }`. Square corners, a mono palette or a
monospace face are host decisions: set `--radius` (e.g. `0`), the colour tokens and `--font-sans`
and the whole form follows. The playground's `src/style.css` is the worked example — it re-skins the
library's components into its sharp, single-colour, monospace look without the library knowing.

The library does not set fonts — it inherits the host app's typography.

#### Theme defaults

Because the components are stock shadcn-vue components, they also assume three things a
shadcn-vue setup installs next to the tokens. Each one fails quietly if it is missing, so it is
worth checking them explicitly:

| assumed | where a shadcn-vue app gets it | symptom when missing |
| --- | --- | --- |
| the state variants (`data-open:`, `data-checked:`, …) | `shadcn-vue/tailwind.css` | interactive states stop matching — see the note below |
| the base-layer defaults: `* { border-color: var(--border) }` and `* { outline-color: … }` | the `@layer base` block `shadcn-vue init` writes | bare `border` / `outline` utilities (a few components use them) paint in the inherited text colour |
| the enter/exit animation utilities (`animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*-2`) | `tw-animate-css` | popovers, selects and dialogs open with no transition |

If your app is a shadcn-vue project it already has all three — add the `@source` line above and
stop there. If it defines its own tokens but none of the rest, `theme.css` supplies all three:

```css
@import "tailwindcss";
@import "@r3dacted42/rendercv-form/theme.css";
```

Everything in it is a **fallback, never an override**: the values live in `@layer base`, so an
unlayered declaration of your own (`:root { --primary: … }`, the shadcn-vue convention) wins no
matter which stylesheet is imported first. The variants, base defaults and animation utilities
match upstream, so importing both this file and the real thing is harmless in either order; keep
`tw-animate-css` installed if you use its wider set (`blur-in-*`, `slide-out-to-*`, `spin-in-*`,
`delay-*`, …). It deliberately leaves `dark:` alone: those utilities follow Tailwind's default
(`prefers-color-scheme`) unless your app defines the usual
`@custom-variant dark (&:is(.dark *))` — which, like the base defaults in the table above, is part
of the CSS `shadcn-vue init` writes in the app, not of `shadcn-vue/tailwind.css`. Define it if your
app switches dark mode with a class, or the `.dark` token values will apply while the components'
`dark:` utilities do not.

> **Why the variants are the trap.** Most components use the bare form (`data-open:`), which
> *needs* the bridge: `reka-ui` sets `data-state="open"` and never a bare `data-open` attribute,
> while Tailwind emits a rule for `data-open:animate-in` either way. So without the bridge the rule
> is present in your CSS and simply never matches — a stylesheet that looks correct and does
> nothing. A few components (`TooltipContent`, `DialogScrollContent`) instead write
> `data-[state=open]:`, which works without any bridge. That is why a partial set of interactive
> states is the signature of a missing stylesheet rather than of per-component bugs.

> **By design:** `SelectContent` carries `data-[align-trigger=true]:animate-none`, so the
> item-aligned select skips its entrance animation while every other popover animates. The extra
> specificity (`(0,2,0)` versus `(0,1,0)`) is deliberate, not a wiring bug.

#### Density

Control sizes are the components' own defaults (`h-9` inputs and selects, `h-8` small buttons,
`text-sm` labels) — shadcn's sizes are utilities rather than tokens, so they follow the component
preset instead of a variable, and there is deliberately no `--control-height` token to sit beside
`--radius`. To make the form roomier or tighter, override the slots as you would for any shadcn
component:

```css
[data-slot="input"],
[data-slot="textarea"],
[data-slot="select-trigger"],
[data-slot="input-group"] {
  height: 2.75rem;
}
```

### Optional UI primitives

If you want matching chrome (dialogs, toolbars, buttons) without re-creating it, the same
shadcn-vue components the renderer uses internally are re-exported from a subpath:

```ts
import { Button, Dialog } from '@r3dacted42/rendercv-form/ui';
```

These are optional; bring your own if you prefer. This entry deliberately excludes
app-owned chrome such as the toast `<Toaster>` and `<Skeleton>` — those carry no
library behaviour and, for a toast singleton like `vue-sonner`, two bundled copies
would not talk to each other.

> **Type-checking caveat.** The `/ui` entry re-exports components built on `reka-ui`
> and `@vueuse/core`, so their declarations join your program. Under
> `skipLibCheck: false` that surfaces two *upstream* declaration gaps — `reka-ui`
> imports `vue-component-type-helpers` without declaring it as a dependency, and
> `@vueuse/core` references Web Bluetooth DOM types that aren't in `lib.dom` —
> neither of which this package controls. Keep `skipLibCheck: true` (the Vue
> default, set by `@vue/tsconfig`) and the entry type-checks cleanly. The root and
> `.../schema` entries don't pull these in and are unaffected either way.

## Internal markers

Importing a document attaches an internal `$schemas` array (with `$key`/`$schema` entries) to
section maps so the renderer can round-trip free-form keys. It is never part of the output —
`buildDoc` (and `cleanData`) removes it, so it cannot leak into the YAML you export — and it is
never treated as data: validation skips `$…` keys, and the editing helpers keep it in sync
(`removeAtPath` drops a section's marker, `addSection` / `renameSection` maintain it).

## Development

This package lives in the [rendercv-editor](https://github.com/r3dacted42/rendercv-editor)
monorepo. `npm run build:lib` (or `npm run dev:lib` for watch mode) builds it, and the
`playground` app is its integration test — see the root README for the full workflow.

### Tests

```bash
npm test          # from the repo root, or in this package
npm run test:watch
npm run typecheck # src + tests + configs
```

[Vitest](https://vitest.dev) runs against `src/` (no build step) in two environments: **jsdom**
for the renderer and the persistence stores, and bare **Node** for the SSR suite
(`tests/ssr.test.ts`), which asserts that nothing touches `window`/`localStorage` and that the
renderer still server-renders. The validation tests run against a committed snapshot of the real
dereferenced RenderCV schema (`tests/fixtures/`), and the heap-free helpers (`validateDoc`, the
document ops, `splitSchemas`) are covered directly.

The live-schema test is opt-in, so the suite stays offline:

```bash
RENDERC_V_LIVE_SCHEMA=1 npm test   # fetches the pinned schema and validates against it
```

## Roadmap

- Richer `ui` overrides (per-field components / slots) beyond the class hooks.
- Make the schema parser optional everywhere: resolve the schema's (local) `$ref`s in-tree so
  `.../schema` no longer needs `json-schema-ref-parser`/`undici`.
- Optional Ajv-compatible export of the validation rules (`validateDoc` as a JSON Schema dialect).
- A stable `1.0` API.
