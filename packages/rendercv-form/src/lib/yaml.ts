import { parse, stringify } from 'yaml';
import { cleanData, matchSchema } from './utils';
import { DOC_KEYS, emptyDoc, type RenderCvDoc, type RenderCvSchemas } from './types';

/**
 * Parses a RenderCV YAML document into the form's internal document shape.
 *
 * Section maps (`cv.sections`) are annotated with an internal `$schemas` array
 * so the renderer can round-trip user-named keys back to the right schema when
 * they are edited. The marker never reaches the output — `docToYaml` drops it.
 */
export function yamlToDoc(yaml: string, schemas: RenderCvSchemas): RenderCvDoc {
  const parsed = (parse(yaml) ?? {}) as any;
  const doc = emptyDoc();

  if (parsed.cv && typeof parsed.cv === 'object') {
    doc.cv = parsed.cv;
    const sections = parsed.cv.sections;
    const sectionsSchema = (schemas.cv?.properties as any)?.sections;
    if (sections && typeof sections === 'object' && sectionsSchema) {
      sections.$schemas = Object.entries(sections).map(([key, obj]) => ({
        $key: key,
        $schema: matchSchema(obj, sectionsSchema),
      }));
    }
  }

  for (const key of ['design', 'locale', 'settings'] as const) {
    if (parsed[key] && typeof parsed[key] === 'object') doc[key] = parsed[key];
  }

  return doc;
}

/**
 * Builds the export-ready document, dropping empty values (and the internal
 * `$schemas` marker). `cv` is always present and emitted first for readability.
 */
export function buildDoc(doc: RenderCvDoc): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of DOC_KEYS) {
    const cleaned = cleanData((doc as any)[key]);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  if (!('cv' in out)) out.cv = {};
  return { cv: out.cv, ...out };
}

/** Serialises a document to RenderCV-compatible YAML. */
export function docToYaml(doc: RenderCvDoc): string {
  return stringify(buildDoc(doc));
}
