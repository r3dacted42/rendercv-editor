import { $RefParser } from '@apidevtools/json-schema-ref-parser';
import { Buffer } from 'buffer';
import type { JsonSchema, RenderCvSchemas } from './lib/types';
import { DEFAULT_SCHEMA_URL, fetchSchemaText, splitSchemas } from './lib/schemaMeta';

/**
 * Schema loading lives in its own entry point (`@r3dacted42/rendercv-form/schema`)
 * so `json-schema-ref-parser` and the `buffer` polyfill are only pulled in when
 * they are actually used.
 *
 * If you would rather not ship the parser at all, import the parser-free pieces
 * (`DEFAULT_SCHEMA_URL`, `schemaUrl()`, `fetchSchemaText()`, `splitSchemas()`)
 * from the package root and dereference once on your server.
 */

export * from './lib/schemaMeta';

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
  const { url = DEFAULT_SCHEMA_URL, text, onText, fetch: fetchImpl } = options;

  let raw = text;
  if (raw === undefined) {
    raw = await fetchSchemaText({ url, fetch: fetchImpl });
    onText?.(raw);
  }

  const schema = JSON.parse(raw) as JsonSchema;

  // `json-schema-ref-parser` reaches for a global Buffer in the browser.
  const globalScope = globalThis as any;
  if (!globalScope.Buffer) globalScope.Buffer = Buffer;

  const resolved = (await $RefParser.dereference(schema)) as any;

  return splitSchemas(resolved);
}
