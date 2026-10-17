import type { JsonSchema, RenderCvSchemas } from './types';

/**
 * Schema coordinates and the parser-free half of schema loading.
 *
 * `loadSchemas()` (in `@r3dacted42/rendercv-form/schema`) pulls in
 * `json-schema-ref-parser` to resolve every `$ref`. Apps that would rather
 * dereference once on the server — and never ship that dependency to the
 * browser — can use the pieces here instead:
 *
 * ```ts
 * // server: fetch once, cache the raw text (or the dereferenced JSON)
 * const text = await fetchSchemaText();
 * cache.set('rendercv-schema', text);
 *
 * // anywhere, parser-free: turn a dereferenced schema into the four sections
 * const schemas = splitSchemas(JSON.parse(dereferenced));
 * ```
 */

/** The RenderCV release this package targets (the git tag in `DEFAULT_SCHEMA_URL`). */
export const SCHEMA_VERSION = 'v2.8';

/**
 * The raw, un-dereferenced RenderCV JSON schema for `SCHEMA_VERSION`.
 * Use `schemaUrl()` for a different version, and pin/cache the text yourself if
 * you don't want to depend on this repository at runtime.
 */
export const DEFAULT_SCHEMA_URL = schemaUrl(SCHEMA_VERSION);

/** The raw schema URL for a specific RenderCV version, e.g. `schemaUrl('v2.9')`. */
export function schemaUrl(version: string = SCHEMA_VERSION): string {
  return `https://raw.githubusercontent.com/rendercv/rendercv/refs/tags/${version}/schema.json`;
}

export interface FetchSchemaTextOptions {
  /** Schema URL. Defaults to `DEFAULT_SCHEMA_URL`. */
  url?: string;
  /** Fetch implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Fetches the raw schema text, without resolving any `$ref` — so it stays free
 * of `json-schema-ref-parser`/`buffer` and is safe to import anywhere (including
 * a browser bundle that only needs the text to hand to a server).
 */
export async function fetchSchemaText(options: FetchSchemaTextOptions = {}): Promise<string> {
  const { url = DEFAULT_SCHEMA_URL, fetch: fetchImpl } = options;
  const request = fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!request) {
    throw new Error('fetchSchemaText() needs a global `fetch` (or pass one via the `fetch` option).');
  }

  const response = await request(url);
  if (response && !response.ok) {
    throw new Error(`Could not fetch the RenderCV schema from ${url} (${response.status} ${response.statusText}).`);
  }
  return response.text();
}

/**
 * Splits a *dereferenced* RenderCV schema into the four section schemas the
 * renderer and `validateDoc()` consume. Free of the `$ref` parser, so a server
 * can dereference once (with whatever tool it likes) and hand the result here.
 */
export function splitSchemas(schema: JsonSchema): RenderCvSchemas {
  const definitions = (schema as any)?.$defs;
  if (!definitions || typeof definitions !== 'object') {
    throw new Error('splitSchemas() expects the dereferenced RenderCV schema (the object with `$defs`).');
  }

  const sections = {
    cv: definitions.Cv,
    design: definitions.BuiltInDesign,
    locale: definitions.Locale,
    settings: definitions.Settings,
  } satisfies RenderCvSchemas;

  const missing = Object.entries(sections)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`The schema is missing ${missing.join(', ')} in \`$defs\` — is this the RenderCV schema?`);
  }

  return sections;
}
