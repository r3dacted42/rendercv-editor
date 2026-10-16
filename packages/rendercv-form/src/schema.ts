import { $RefParser } from '@apidevtools/json-schema-ref-parser';
import { Buffer } from 'buffer';
import type { JsonSchema, RenderCvSchemas } from './lib/types';

/**
 * Schema loading lives in its own entry point (`@r3dacted42/rendercv-form/schema`)
 * so `json-schema-ref-parser` and the `buffer` polyfill are only pulled in when
 * they are actually used.
 */

/** The RenderCV schema version this package targets. */
export const DEFAULT_SCHEMA_URL =
  'https://raw.githubusercontent.com/rendercv/rendercv/refs/tags/v2.8/schema.json';

export interface LoadSchemaOptions {
  /** Schema URL. Defaults to `DEFAULT_SCHEMA_URL`. */
  url?: string;
  /** Raw schema JSON. When provided, the schema is not fetched. */
  text?: string;
  /** Called with the raw schema text, e.g. so the caller can cache it. */
  onText?: (text: string) => void;
  /** Fetch implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Loads the RenderCV JSON schema, resolves every `$ref`, and returns the four
 * section schemas the renderer edits.
 */
export async function loadSchemas(options: LoadSchemaOptions = {}): Promise<RenderCvSchemas> {
  const { url = DEFAULT_SCHEMA_URL, text, onText, fetch: fetchImpl = fetch } = options;

  let raw = text;
  if (raw === undefined) {
    const res = await fetchImpl(url);
    raw = await res.text();
    onText?.(raw);
  }

  const schema = JSON.parse(raw) as JsonSchema;

  // `json-schema-ref-parser` reaches for a global Buffer in the browser.
  const globalScope = globalThis as any;
  if (!globalScope.Buffer) globalScope.Buffer = Buffer;

  const resolved = (await $RefParser.dereference(schema)) as any;

  return {
    cv: resolved.$defs.Cv,
    design: resolved.$defs.BuiltInDesign,
    locale: resolved.$defs.Locale,
    settings: resolved.$defs.Settings,
  };
}
