import { describe, expect, it } from 'vitest';
import { cleanData, cn, matchSchema, removeTrailingS, toTitleCase, type JsonSchema } from '../src/index';

describe('cn', () => {
  it('merges conditional classes and lets later utilities win', () => {
    expect(cn('p-2', false && 'hidden', ['text-sm'], { block: true })).toBe('p-2 text-sm block');
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});

describe('toTitleCase / removeTrailingS', () => {
  it('title-cases space-separated words', () => {
    expect(toTitleCase('hello world')).toBe('Hello World');
    expect(toTitleCase('a')).toBe('A');
  });

  it('removes a single trailing "s"', () => {
    expect(removeTrailingS('projects')).toBe('project');
    expect(removeTrailingS('project')).toBe('project');
  });
});

describe('cleanData', () => {
  it('drops blanks, empty containers and internal markers', () => {
    const cleaned = cleanData({
      name: 'Jane',
      $schemas: [{ $key: 'a', $schema: {} }],
      email: '',
      tags: [],
      meta: {},
      skills: ['ts', ''],
    });

    expect(cleaned).toEqual({ name: 'Jane', skills: ['ts'] });
  });

  it('collapses an all-empty value to undefined', () => {
    expect(cleanData({ a: '', b: [], c: {} })).toBeUndefined();
    expect(cleanData([])).toBeUndefined();
    expect(cleanData({})).toBeUndefined();
  });

  it('leaves scalars alone', () => {
    expect(cleanData('x')).toBe('x');
    expect(cleanData(0)).toBe(0);
    expect(cleanData(false)).toBe(false);
  });
});

describe('matchSchema', () => {
  const sectionsSchema = {
    anyOf: [
      {
        type: 'object',
        additionalProperties: {
          anyOf: [
            { type: 'array', items: { required: ['company', 'position'] } },
            { type: 'array', items: { required: [] } },
          ],
        },
      },
      { type: 'null' },
    ],
  } as JsonSchema;

  const experience = sectionsSchema.anyOf![0].additionalProperties.anyOf[0];
  const general = sectionsSchema.anyOf![0].additionalProperties.anyOf[1];

  it('picks the option whose required fields are all present', () => {
    expect(matchSchema({ company: 'Acme', position: 'Engineer' }, sectionsSchema)).toBe(experience);
  });

  it('falls back to the option that requires nothing', () => {
    expect(matchSchema({ whatever: true }, sectionsSchema)).toBe(general);
  });

  it('matches the first entry of a section that is an array', () => {
    expect(matchSchema([{ company: 'Acme', position: 'Engineer' }], sectionsSchema)).toBe(experience);
  });
});
