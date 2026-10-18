import { describe, expect, it } from 'vitest';
import {
  CORE_FIELDS,
  EXCLUSIVE_GROUPS,
  findExclusiveGroups,
  isBlank,
  isFilled,
  isOptional,
  type JsonSchema,
} from '../src/index';

describe('isBlank', () => {
  it.each([undefined, null, ''])('treats %j as blank', (value) => {
    expect(isBlank(value)).toBe(true);
  });

  it.each([0, false, 'x', [], {}])('treats %j as a value', (value) => {
    expect(isBlank(value)).toBe(false);
  });
});

describe('isFilled', () => {
  it('counts empty containers as not filled', () => {
    expect(isFilled([])).toBe(false);
    expect(isFilled({})).toBe(false);
    expect(isFilled(null)).toBe(false);
  });

  it('counts non-empty containers and scalars as filled', () => {
    expect(isFilled([0])).toBe(true);
    expect(isFilled({ a: 1 })).toBe(true);
    expect(isFilled(0)).toBe(true);
    expect(isFilled('x')).toBe(true);
  });
});

describe('isOptional', () => {
  it('detects the null-union form', () => {
    expect(isOptional({ anyOf: [{ type: 'string' }, { type: 'null' }] })).toBe(true);
    expect(isOptional({ oneOf: [{ type: 'string' }, { type: 'null' }] })).toBe(true);
    expect(isOptional({ anyOf: [{ type: 'string' }] })).toBe(false);
  });

  it('detects Pydantic custom types emitted as `{ default: null }`', () => {
    expect(isOptional({ default: null })).toBe(true);
    expect(isOptional({ default: 'x' })).toBe(false);
  });

  it('rejects non-schema values', () => {
    expect(isOptional(undefined)).toBe(false);
    expect(isOptional('nope')).toBe(false);
    expect(isOptional({ type: 'string' })).toBe(false);
  });
});

describe('findExclusiveGroups', () => {
  const withDates = (keys: string[]): JsonSchema => ({
    type: 'object',
    properties: Object.fromEntries(keys.map((key) => [key, { type: 'string' }])),
  });

  it('returns the date group only when every member exists', () => {
    const groups = findExclusiveGroups(withDates(['date', 'start_date', 'end_date']));
    expect(groups).toEqual(EXCLUSIVE_GROUPS);
    expect(groups[0]!.label).toBe('Date');
  });

  it('ignores schemas with a missing member', () => {
    expect(findExclusiveGroups(withDates(['start_date', 'end_date']))).toEqual([]);
    expect(findExclusiveGroups({} as JsonSchema)).toEqual([]);
  });
});

describe('CORE_FIELDS', () => {
  it('keeps the CV header fields visible at the root', () => {
    expect(CORE_FIELDS.root).toContain('name');
    expect(CORE_FIELDS.root).toContain('sections');
    expect(CORE_FIELDS.entry).toEqual([]);
  });
});
