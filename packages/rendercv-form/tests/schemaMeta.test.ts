import { afterEach, describe, expect, it, vi } from 'vitest';
import process from 'node:process';
import cvSchemaRaw from './fixtures/rendercv-cv-schema.json?raw';
import {
  DEFAULT_SCHEMA_URL,
  SCHEMA_VERSION,
  fetchSchemaText,
  schemaUrl,
  splitSchemas,
  validateDoc,
  yamlToDoc,
  type JsonSchema,
  type RenderCvSchemas,
} from '../src/index';
import { loadSchemas } from '../src/schema';

const cv = JSON.parse(cvSchemaRaw) as JsonSchema;

/** A raw (un-dereferenced, but `$ref`-free) schema shaped like RenderCV's. */
const rawSchema = (definitions: Record<string, unknown> = {}) =>
  JSON.stringify({
    $defs: {
      Cv: cv,
      BuiltInDesign: { type: 'object', properties: { theme: { const: 'classic' } } },
      Locale: { type: 'object', properties: { language: { type: 'string' } } },
      Settings: { type: 'object', properties: { bold_keywords: { type: 'boolean' } } },
      ...definitions,
    },
  });

describe('schema coordinates', () => {
  it('pins a RenderCV version and its raw schema URL', () => {
    expect(SCHEMA_VERSION).toMatch(/^v\d+\.\d+$/);
    expect(DEFAULT_SCHEMA_URL).toBe(schemaUrl(SCHEMA_VERSION));
    expect(DEFAULT_SCHEMA_URL).toBe(
      `https://raw.githubusercontent.com/rendercv/rendercv/refs/tags/${SCHEMA_VERSION}/schema.json`,
    );
  });

  it('builds a URL for another version', () => {
    expect(schemaUrl('v2.9')).toContain('/refs/tags/v2.9/schema.json');
  });
});

describe('fetchSchemaText', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns the raw text without any dereferencing', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => 'RAW' })) as any;

    await expect(fetchSchemaText({ fetch: fetchImpl })).resolves.toBe('RAW');
    expect(fetchImpl).toHaveBeenCalledWith(DEFAULT_SCHEMA_URL);
  });

  it('honours an explicit URL and a custom fetch', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => 'RAW' })) as any;

    await fetchSchemaText({ url: 'https://example.test/s.json', fetch: fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/s.json');
  });

  it('reports a failed response with the status', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 404, statusText: 'Not Found' })) as any;

    await expect(fetchSchemaText({ fetch: fetchImpl })).rejects.toThrow(/404 Not Found/);
  });

  it('explains a missing global fetch', async () => {
    delete (globalThis as any).fetch;
    await expect(fetchSchemaText()).rejects.toThrow(/needs a global `fetch`/);
  });
});

describe('splitSchemas', () => {
  it('returns the four dereferenced sections', () => {
    const sections = splitSchemas(JSON.parse(rawSchema()));

    expect(sections.cv).toEqual(cv);
    expect(sections.design.properties.theme).toEqual({ const: 'classic' });
    expect(sections.locale.properties.language).toEqual({ type: 'string' });
    expect(Object.keys(sections)).toEqual(['cv', 'design', 'locale', 'settings']);
  });

  it('rejects something that is not the RenderCV schema', () => {
    expect(() => splitSchemas({} as JsonSchema)).toThrow(/dereferenced RenderCV schema/);
    expect(() => splitSchemas({ type: 'object' } as JsonSchema)).toThrow(/dereferenced RenderCV schema/);
  });

  it('names the sections that are missing', () => {
    expect(() => splitSchemas({ $defs: { Cv: {} } } as JsonSchema)).toThrow(
      /missing design, locale, settings/,
    );
  });
});

describe('loadSchemas (parser entry)', () => {
  it('dereferences supplied text without fetching', async () => {
    const fetchImpl = vi.fn();
    const onText = vi.fn();

    const sections = await loadSchemas({ text: rawSchema(), fetch: fetchImpl as any, onText });

    expect(sections.cv).toEqual(cv);
    expect(fetchImpl).not.toHaveBeenCalled();
    // `onText` exists so the caller can cache what was *fetched*; supplied text
    // is already the caller's.
    expect(onText).not.toHaveBeenCalled();
  });

  it('fetches and reports the raw text when no text is supplied', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => rawSchema() })) as any;
    const onText = vi.fn();

    const sections = await loadSchemas({ fetch: fetchImpl, onText });

    expect(onText).toHaveBeenCalledWith(rawSchema());
    expect(sections.cv).toEqual(cv);
  });

  it('re-exports the parser-free pieces', () => {
    expect(SCHEMA_VERSION).toBeDefined();
    expect(typeof fetchSchemaText).toBe('function');
    expect(typeof splitSchemas).toBe('function');
  });
});

/**
 * Opt-in end-to-end check against the live RenderCV schema, so the committed
 * fixture can be refreshed and the pin verified:
 *
 * ```bash
 * RENDERC_V_LIVE_SCHEMA=1 npm test -w @r3dacted42/rendercv-form
 * ```
 */
describe.runIf(process.env.RENDERC_V_LIVE_SCHEMA)('live RenderCV schema', () => {
  it('loads, splits and validates a document', async () => {
    const sections: RenderCvSchemas = await loadSchemas();
    const doc = yamlToDoc(
      'cv:\n  name: Jane Doe\n  sections:\n    experience:\n      - company: Acme\n        position: Engineer\n',
      sections,
    );

    expect(validateDoc(doc, sections)).toEqual([]);
    expect(sections.cv).toEqual(cv);
  }, 30_000);
});
