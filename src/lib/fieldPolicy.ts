import type { JSONSchema } from '@apidevtools/json-schema-ref-parser';

/**
 * Policy for progressively disclosing optional fields in the form.
 *
 * The RenderCV schema lets most fields be `null`, but always rendering every
 * nullable field clutters the form with inputs the user rarely needs. Instead
 * we hide optional fields until the user adds them (or they already carry a
 * value), while keeping a small "core" set visible.
 *
 * Three pieces:
 *  1. `isOptional()` — whether the user may omit a field entirely.
 *  2. `CORE_FIELDS` — optional fields still shown by default, per form scope.
 *     The root `Cv` object has no `required` array at all, so without this list
 *     the whole form would collapse behind "Add field".
 *  3. `EXCLUSIVE_GROUPS` — RenderCV accepts either `date` or
 *     `start_date`/`end_date`, never both. The schema does not encode that rule,
 *     so we declare it here and render a single choose-one control.
 */

export type FieldScope = 'root' | 'entry';

export const CORE_FIELDS: Record<FieldScope, string[]> = {
  root: ['name', 'headline', 'location', 'email', 'phone', 'sections'],
  entry: [],
};

export interface ExclusiveGroup {
  /** Label shown above the choose-one control. */
  label: string;
  /** Fields rendered for the "single" representation. */
  single: string[];
  /** Fields rendered for the "range" representation. */
  range: string[];
  /** Mode used before the user picks one. */
  defaultMode: 'single' | 'range';
}

export const EXCLUSIVE_GROUPS: ExclusiveGroup[] = [
  { label: 'Date', single: ['date'], range: ['start_date', 'end_date'], defaultMode: 'range' },
];

const variantsOf = (prop: any): any[] => {
  const variants = prop?.anyOf ?? prop?.oneOf;
  return Array.isArray(variants) ? variants : [];
};

/** True when the schema lets the user leave this property out entirely. */
export function isOptional(prop: any): boolean {
  if (!prop || typeof prop !== 'object') return false;
  // `anyOf: [..., { type: 'null' }]` — the usual optional marker.
  if (variantsOf(prop).some((variant) => variant?.type === 'null')) return true;
  // Custom Pydantic types are emitted as a bare `{ default: null }` with no
  // `type`/`anyOf` at all (e.g. email, phone, website).
  return 'default' in prop && prop.default === null;
}

/** Exclusive groups whose every member exists on this object schema. */
export function findExclusiveGroups(schema: JSONSchema): ExclusiveGroup[] {
  const properties = (schema as any)?.properties as Record<string, unknown> | undefined;
  if (!properties) return [];
  return EXCLUSIVE_GROUPS.filter((group) =>
    [...group.single, ...group.range].every((key) => key in properties),
  );
}
