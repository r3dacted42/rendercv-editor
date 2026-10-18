import { describe, expect, it } from 'vitest';
import cvSchemaRaw from './fixtures/rendercv-cv-schema.json?raw';
import {
  emptyDoc,
  validateDoc,
  validateYaml,
  docToYaml,
  yamlToDoc,
  type JsonSchema,
  type RenderCvSchemas,
  type ValidationError,
} from '../src/index';

/* Fixtures ---------------------------------------------------------------- */

/** The real, dereferenced `$defs.Cv` of RenderCV v2.8 (see `fixtures/README.md`). */
const cv = JSON.parse(cvSchemaRaw) as JsonSchema;

/**
 * `design` is a discriminated union (`oneOf` + `theme`); `locale` carries the
 * exclusive date group. The real sections are far too large to inline and only
 * these shapes matter to the validator.
 */
const design: JsonSchema = {
  type: 'object',
  discriminator: { propertyName: 'theme' },
  oneOf: [
    {
      type: 'object',
      properties: {
        theme: { const: 'classic' },
        page_size: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
    },
    {
      type: 'object',
      required: ['accent'],
      properties: { theme: { const: 'sb2nov' }, accent: { enum: ['a', 'b'] } },
    },
  ],
};

const locale: JsonSchema = {
  type: 'object',
  properties: {
    date: { type: 'string' },
    start_date: { type: 'string' },
    end_date: { type: 'string' },
  },
};

const schemas: RenderCvSchemas = { cv, design, locale, settings: {} };

const doc = (over: Partial<Record<'cv' | 'design' | 'locale' | 'settings', unknown>> = {}) =>
  ({ ...emptyDoc(), ...over }) as any;

/** The interchangeable section schemas of `cv.sections` (the ones `matchSchema` picks between). */
const sectionOptions: any[] = (cv.properties as any).sections.anyOf.find((o: any) => o.type === 'object')
  .additionalProperties.anyOf;
const entryOption = sectionOptions.find(
  (option) => Array.isArray(option.items?.required) && option.items.required.length > 0,
);
if (!entryOption) throw new Error('fixture: expected a section option with required fields');
const entryRequired: string[] = entryOption.items.required;

const codes = (errors: ValidationError[]) => errors.map((error) => `${error.code} ${error.pathString}`);
const byPath = (errors: ValidationError[], pathString: string) =>
  errors.find((error) => error.pathString === pathString);

/* Tests ------------------------------------------------------------------- */

describe('validateDoc', () => {
  it('accepts an empty document', () => {
    expect(validateDoc(emptyDoc(), schemas)).toEqual([]);
  });

  it('accepts a document whose optional fields are blank', () => {
    expect(validateDoc(doc({ cv: { name: null, email: '', headline: undefined } }), schemas)).toEqual([]);
  });

  describe('required fields', () => {
    const sections = { $schemas: [{ $key: 'test', $schema: entryOption }], test: [{}] };
    const errors = validateDoc(doc({ cv: { name: 'Jane', sections } }), schemas);

    it('reports every missing required field', () => {
      expect(errors).toHaveLength(entryRequired.length);
      expect(codes(errors)).toEqual(entryRequired.map((key) => `required cv.sections.test[0].${key}`));
    });

    it('carries the schema title and a readable message', () => {
      for (const error of errors) {
        expect(typeof error.title).toBe('string');
        expect(error.message).toBe(`Missing required "${error.title}".`);
      }
    });

    it('keeps the path as segments as well as a display string', () => {
      expect(errors[0]!.path).toEqual(['cv', 'sections', 'test', 0, entryRequired[0]]);
    });

    it('accepts the entry once every required field is filled', () => {
      const filled = Object.fromEntries(entryRequired.map((key) => [key, 'x']));
      expect(validateDoc(doc({ cv: { name: 'Jane', sections: { ...sections, test: [filled] } } }), schemas)).toEqual([]);
    });
  });

  it('reports a value of the wrong type', () => {
    const errors = validateDoc(doc({ cv: { name: 42 } }), schemas);
    expect(codes(errors)).toEqual(['type cv.name']);
    expect(byPath(errors, 'cv.name')!.message).toBe('Expected string, got number.');
  });

  it('never treats internal markers as data', () => {
    const sections = { $schemas: [{ $key: 'test', $schema: entryOption }], test: [{}] };
    const errors = validateDoc(doc({ cv: { name: 'Jane', sections } }), schemas);
    expect(errors.some((error) => error.pathString.includes('$'))).toBe(false);
  });

  describe('discriminated unions', () => {
    it('follows the discriminator to the matching variant', () => {
      expect(validateDoc(doc({ design: { theme: 'classic', page_size: 'a4' } }), schemas)).toEqual([]);
      expect(validateDoc(doc({ design: { theme: 'sb2nov', accent: 'a' } }), schemas)).toEqual([]);
    });

    it('rejects a theme outside the union', () => {
      expect(codes(validateDoc(doc({ design: { theme: 'nope' } }), schemas))).toEqual(['enum design.theme']);
    });

    it('enforces the selected variant’s enum and type', () => {
      expect(codes(validateDoc(doc({ design: { theme: 'sb2nov', accent: 'z' } }), schemas))).toEqual([
        'enum design.accent',
      ]);
      expect(codes(validateDoc(doc({ design: { theme: 'classic', page_size: 7 } }), schemas))).toEqual([
        'type design.page_size',
      ]);
    });

    it('enforces the selected variant’s required fields', () => {
      expect(codes(validateDoc(doc({ design: { theme: 'sb2nov' } }), schemas))).toEqual(['required design.accent']);
    });

    it('treats an empty union value as the first variant, like the renderer', () => {
      expect(validateDoc(doc({ design: {} }), schemas)).toEqual([]);
    });
  });

  describe('exclusive groups', () => {
    it.each([
      ['date alone', { date: '2020-01' }, []],
      ['start/end alone', { start_date: '2020-01', end_date: '2020-02' }, []],
      ['date and start_date', { date: '2020-01', start_date: '2020-02' }, ['exclusive locale.date']],
    ])('%s', (_name, value, expected) => {
      expect(codes(validateDoc(doc({ locale: value }), schemas))).toEqual(expected);
    });
  });
});

describe('validateYaml', () => {
  const yaml = `cv:
  name: Jane Doe
  sections:
    experience:
      - company: Acme
        position: Engineer
`;

  it('parses and validates a valid document', () => {
    const { doc: parsed, errors } = validateYaml(yaml, schemas);
    expect(parsed.cv.name).toBe('Jane Doe');
    expect(errors).toEqual([]);
  });

  it('attaches the same `$schemas` marker as yamlToDoc', () => {
    const { doc: parsed } = validateYaml(yaml, schemas);
    expect(parsed.cv.sections.$schemas).toHaveLength(1);
    expect(parsed.cv.sections.$schemas[0].$key).toBe('experience');
    expect(parsed.cv.sections.$schemas[0].$schema.items.required).toContain('company');
  });

  it('validates the parsed document', () => {
    const { doc: parsed } = validateYaml(yaml, schemas);
    const errors = validateDoc({ ...parsed, cv: { ...parsed.cv, name: 42 } }, schemas);
    expect(codes(errors)).toEqual(['type cv.name']);
  });

  it('excludes markers from the exported YAML', () => {
    expect(docToYaml(yamlToDoc(yaml, schemas))).not.toContain('$schemas');
  });

  it('reports unparseable YAML as a single parse error', () => {
    const { doc: parsed, errors } = validateYaml('cv:\n  name: [unclosed', schemas);
    expect(parsed).toEqual(emptyDoc());
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe('parse');
    expect(errors[0]!.path).toEqual([]);
  });
});

describe('README schema examples', () => {
  // The section-map snippet in the README indexes into the real schema; keep it honest.
  it('resolves the indexed section schema', () => {
    const sectionSchema = (cv.properties as any).sections.anyOf[0].additionalProperties.anyOf[0];
    expect(sectionSchema).toMatchObject({ type: 'array' });
    expect(sectionSchema.items).toBeDefined();
  });
});
