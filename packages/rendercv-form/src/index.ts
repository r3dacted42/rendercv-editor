/**
 * @r3dacted42/rendercv-form
 *
 * Schema-driven Vue form renderer for RenderCV YAML documents.
 *
 * The high-level flow:
 *  - load the RenderCV JSON schema and split it into its four sections
 *    (`@r3dacted42/rendercv-form/schema`),
 *  - pass a section schema to `<FormRenderer>` with a `v-model` object,
 *  - read the object back and serialise it with the YAML helpers.
 *
 * Layout (tabs, dialogs, toolbars, import/export chrome) is intentionally left
 * to the consuming app.
 */

/* Components -------------------------------------------------------------- */
export { default as FormRenderer } from './components/FormRenderer.vue';
export { default as ConfirmDialog } from './components/ConfirmDialog.vue';

/* State composables ------------------------------------------------------- */
export * from './composables/useCollapsibleState';
export * from './composables/useValidationState';
export * from './composables/useFieldVisibility';
export * from './composables/useFormState';

/* Document types ---------------------------------------------------------- */
export * from './lib/types';

/* Document helpers -------------------------------------------------------- */
export * from './lib/yaml';
export { cleanData, matchSchema, cn, toTitleCase, removeTrailingS } from './lib/utils';

/* Field policy (progressive disclosure, exclusive groups) ----------------- */
export * from './lib/fieldPolicy';

/* Rendering hints --------------------------------------------------------- */
export * from './lib/fieldHints';
