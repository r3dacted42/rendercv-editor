/**
 * Decides which string fields should render as a multi-line textarea instead of
 * a single-line input.
 *
 * Two layers so both known RenderCV keys and user-defined custom keys are covered:
 *  1. an explicit allow-list of keys/titles used across the schema, and
 *  2. a regex fallback (e.g. a custom "Project description" field).
 */

const MULTILINE_KEYS = new Set([
  'summary',
  'description',
  'details',
  'highlight',
  'highlights',
  'bullet',
  'note',
  'notes',
  'comment',
  'comments',
  'abstract',
  'about',
  'bio',
  'author',
  'authors',
]);

const MULTILINE_PATTERN = /summary|description|detail|highlight|bullet|note|comment|abstract|bio|about|author/i;

/** True when any of the given candidate strings (key, title, …) looks multi-line. */
export function isMultiline(...candidates: Array<string | undefined | null>): boolean {
  return candidates.some((value) => {
    if (!value) return false;
    const normalized = value.toLowerCase();
    return MULTILINE_KEYS.has(normalized) || MULTILINE_PATTERN.test(normalized);
  });
}
