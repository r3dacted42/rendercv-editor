/** Minimal JSON Schema shape the renderer consumes (already dereferenced). */
export type JsonSchema = Record<string, any>;

/**
 * Extra classes merged onto the renderer's named regions. Anything you can't
 * reach this way can be targeted with the root `class` (which falls through to
 * the outermost element) or by overriding the CSS tokens (see the README).
 */
export interface FormRendererUi {
  /** The outermost wrapper. */
  root?: string;
  /** The group header row (title + remove button). */
  header?: string;
  /** The wrapper around a group's fields. */
  content?: string;
  /** The "add optional field" chip rows. */
  chips?: string;
}

/** The four top-level keys of a RenderCV document. `cv` is the main content. */
export const DOC_KEYS = ['cv', 'design', 'locale', 'settings'] as const;

export type DocKey = (typeof DOC_KEYS)[number];

/** The optional configuration sections (everything except `cv`). */
export type ConfigKey = Exclude<DocKey, 'cv'>;

/** The dereferenced schemas the renderer edits, one per document section. */
export interface RenderCvSchemas {
  cv: JsonSchema;
  design: JsonSchema;
  locale: JsonSchema;
  settings: JsonSchema;
}

/**
 * A RenderCV document as held by the form. Values are intentionally loose: the
 * shape is driven by the schema, and section maps additionally carry an internal
 * `$schemas` marker (see `yamlToDoc`) that is stripped on export.
 */
export interface RenderCvDoc {
  cv: any;
  design: any;
  locale: any;
  settings: any;
}

/** A fresh, empty document. */
export const emptyDoc = (): RenderCvDoc => ({
  cv: {},
  design: {},
  locale: {},
  settings: {},
});
