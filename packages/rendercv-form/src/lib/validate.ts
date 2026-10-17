import { findExclusiveGroups, isBlank, isFilled } from './fieldPolicy';
import { formatPath } from './docOps';
import { emptyDoc, DOC_KEYS, type JsonSchema, type RenderCvDoc, type RenderCvSchemas } from './types';
import { yamlToDoc } from './yaml';

/**
 * Headless document validation.
 *
 * `validateDoc()` walks a document against the dereferenced schemas and reports
 * the errors the form itself would show — but with no DOM, no Vue and no UI
 * registry, so it runs on a server (or in a worker) to vet a document before it
 * ever reaches the client.
 *
 * It deliberately mirrors the renderer's rules rather than re-implementing JSON
 * Schema: the checks are
 *  - `required` properties that are blank,
 *  - values whose declared type they don't match,
 *  - values outside a declared `enum` / `const`,
 *  - the schema-less rules RenderCV enforces anyway (see `EXCLUSIVE_GROUPS`),
 *
 * which is exactly what `<FormRenderer>` refuses to submit. It is not a general
 * JSON Schema validator: `pattern`, `format`, ranges and friends are left to a
 * dedicated validator such as Ajv if you need them.
 */

export type ValidationCode =
  /** A property listed in the schema's `required` is blank. */
  | 'required'
  /** The value's type doesn't match the schema. */
  | 'type'
  /** The value isn't one of the schema's `enum` / `const` values. */
  | 'enum'
  /** Mutually exclusive fields (e.g. `date` and `start_date`) are both set. */
  | 'exclusive'
  /** The YAML could not be parsed (only from `validateYaml()`). */
  | 'parse';

export interface ValidationError {
  /** Path segments to the offending value, e.g. `['cv','sections','experience',0,'name']`. */
  path: Array<string | number>;
  /** Display form of `path` (round-trips through `parsePath()`). */
  pathString: string;
  /** The schema's `title` for the field, when it declares one. */
  title?: string;
  /** Machine-readable category. */
  code: ValidationCode;
  /** Human-readable message (safe to show, but don't parse it). */
  message: string;
}

const isPlainObject = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const humanise = (key: string) =>
  key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const label = (prop: any, key: string) =>
  (typeof prop?.title === 'string' && prop.title) || humanise(key);

const describe = (value: unknown): string =>
  Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;

function makeError(
  path: Array<string | number>,
  code: ValidationCode,
  message: string,
  schema?: any,
): ValidationError {
  return {
    path: [...path],
    pathString: formatPath(path),
    ...(typeof schema?.title === 'string' ? { title: schema.title } : {}),
    code,
    message,
  };
}

/** The concrete type a schema declares, inferring it for terse schemas. */
function declaredType(schema: any): string | undefined {
  const type = schema?.type;
  if (typeof type === 'string') return type;
  if (Array.isArray(type)) return (type as string[]).find((t) => t !== 'null') ?? 'null';
  if (schema?.properties || schema?.additionalProperties) return 'object';
  if (schema?.items) return 'array';
  return undefined;
}

function typeMatches(value: any, type: string): boolean {
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'number': return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'array': return Array.isArray(value);
    case 'object': return isPlainObject(value);
    case 'null': return value === null;
    default: return true;
  }
}

function variantTag(variant: any, property: string): any {
  const prop = variant?.properties?.[property];
  return prop?.const ?? prop?.enum?.[0];
}

/**
 * Scores how well a union variant fits a value, the same way `matchSchema()`
 * pairs a section key with its schema: a variant whose every `required` property
 * is present wins, otherwise the variant with the most matches. This is the
 * best-effort path used when a section key has no `$schemas` marker to consult.
 */
function scoreVariant(value: any, variant: any): number {
  const shape = declaredType(variant) === 'array' ? (Array.isArray(value) ? value[0] : undefined) : value;
  if (!isPlainObject(shape)) return 0;

  const required: string[] = Array.isArray(variant?.items?.required)
    ? variant.items.required
    : Array.isArray(variant?.required)
      ? variant.required
      : [];
  if (required.length === 0) return 0;

  const keys = Object.keys(shape).filter((key) => !key.startsWith('$'));
  const matched = required.filter((key) => keys.includes(key)).length;
  return (matched === required.length ? 100 : 0) + matched;
}

/**
 * The schema a section-map key was matched to, recorded in the map's `$schemas`
 * marker by `yamlToDoc()`. Authoritative when present: the marker is the only
 * record of which of the interchangeable section schemas applies.
 */
function markerSchema(container: any, key: string): any | undefined {
  const markers = container?.$schemas;
  if (!Array.isArray(markers)) return undefined;
  return markers.find((marker: any) => marker?.$key === key)?.$schema;
}

/**
 * Picks the sub-schema that applies to `value` out of an `anyOf`/`oneOf` union:
 * by the schema's `discriminator` when it has one (design themes, locales),
 * then by the value's type — scoring interchangeable variants by how many of
 * their `required` properties the value has — then the first non-`null` variant.
 */
function resolveFor(value: any, schema: any): any | undefined {
  if (!isPlainObject(schema)) return undefined;

  const variants: any[] | undefined = Array.isArray(schema.anyOf)
    ? schema.anyOf
    : Array.isArray(schema.oneOf)
      ? schema.oneOf
      : undefined;
  if (!variants || variants.length === 0) return schema;

  const discriminator = schema.discriminator?.propertyName;
  if (discriminator && isPlainObject(value)) {
    const match = variants.find((variant) => variantTag(variant, discriminator) === value[discriminator]);
    if (match) return match;
  }

  const byType = variants.filter((variant) => {
    const type = declaredType(variant);
    return !!type && typeMatches(value, type);
  });
  if (byType.length === 1) return byType[0];
  if (byType.length > 1) {
    return byType.reduce((best, variant) =>
      scoreVariant(value, variant) > scoreVariant(value, best) ? variant : best,
    );
  }

  return variants.find((variant) => declaredType(variant) !== 'null') ?? schema;
}

function itemsOf(schema: any): any | undefined {
  const items = schema?.items;
  if (Array.isArray(items)) return items.length ? items[0] : undefined;
  return isPlainObject(items) ? items : undefined;
}

function checkValue(value: any, schema: any, path: Array<string | number>, errors: ValidationError[]): void {
  const type = declaredType(schema);
  if (type && !typeMatches(value, type)) {
    errors.push(makeError(path, 'type', `Expected ${type}, got ${describe(value)}.`, schema));
    return;
  }

  if (schema.const !== undefined && typeof schema.const !== 'object' && value !== schema.const) {
    errors.push(makeError(path, 'enum', `Expected ${JSON.stringify(schema.const)}.`, schema));
  } else if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(
      makeError(path, 'enum', `Expected one of: ${schema.enum.map(String).join(', ')}.`, schema),
    );
  }
}

function walk(
  value: any,
  schema: any,
  path: Array<string | number>,
  errors: ValidationError[],
): void {
  // A blank value is the parent's `required` check to report; there is nothing
  // to introspect here.
  if (isBlank(value)) return;

  const resolved = resolveFor(value, schema);
  if (!resolved) return;

  checkValue(value, resolved, path, errors);

  if (isPlainObject(value)) {
    const properties = isPlainObject(resolved.properties)
      ? (resolved.properties as Record<string, any>)
      : undefined;

    for (const key of Array.isArray(resolved.required) ? (resolved.required as string[]) : []) {
      if (isBlank(value[key])) {
        errors.push(
          makeError(
            [...path, key],
            'required',
            `Missing required "${label(properties?.[key], key)}".`,
            properties?.[key],
          ),
        );
      }
    }

    for (const group of findExclusiveGroups(resolved)) {
      const single = group.single.filter((key) => isFilled(value[key]));
      const range = group.range.filter((key) => isFilled(value[key]));
      if (single.length && range.length) {
        errors.push(
          makeError(
            [...path, single[0]!],
            'exclusive',
            `"${group.label}" takes either ${group.single.join(' / ')} or ${group.range.join(' / ')}, not both.`,
            properties?.[single[0]!],
          ),
        );
      }
    }

    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith('$')) continue; // internal `$schemas` markers
      const childSchema = properties?.[key]
        ?? markerSchema(value, key)
        ?? (isPlainObject(resolved.additionalProperties) ? resolved.additionalProperties : undefined);
      if (childSchema) walk(child, childSchema, [...path, key], errors);
    }
    return;
  }

  if (Array.isArray(value)) {
    const items = itemsOf(resolved);
    if (items) value.forEach((item, index) => walk(item, items, [...path, index], errors));
  }
}

/**
 * Validates a document against its schemas and returns every error found.
 * The schemas must be dereferenced (see `loadSchemas()` / `splitSchemas()`).
 *
 * ```ts
 * const doc = yamlToDoc(yaml, schemas);
 * const errors = validateDoc(doc, schemas);
 * if (errors.length) console.error(errors[0].pathString, errors[0].message);
 * ```
 */
export function validateDoc(doc: RenderCvDoc, schemas: RenderCvSchemas): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const key of DOC_KEYS) {
    const schema = schemas?.[key] as JsonSchema | undefined;
    const value = (doc as any)?.[key];
    if (!schema || isBlank(value)) continue;
    walk(value, schema, [key], errors);
  }
  return errors;
}

export interface ValidateYamlResult {
  /** The parsed document (empty when the YAML was unparseable). */
  doc: RenderCvDoc;
  errors: ValidationError[];
}

/**
 * Parses RenderCV YAML and validates it in one step — the usual entry point for
 * checking generated (e.g. LLM-written) YAML before it reaches the client.
 * A YAML syntax error is reported as a single `parse` error.
 */
export function validateYaml(yaml: string, schemas: RenderCvSchemas): ValidateYamlResult {
  let doc: RenderCvDoc;
  try {
    doc = yamlToDoc(yaml, schemas);
  } catch (error) {
    return {
      doc: emptyDoc(),
      errors: [
        makeError([], 'parse', error instanceof Error ? error.message : 'Could not parse the YAML.'),
      ],
    };
  }
  return { doc, errors: validateDoc(doc, schemas) };
}
