import { describe, expect, it } from 'vitest';
import { isMultiline } from '../src/index';

describe('isMultiline', () => {
  it('matches known keys case-insensitively', () => {
    expect(isMultiline('summary')).toBe(true);
    expect(isMultiline('Summary')).toBe(true);
    expect(isMultiline('highlights')).toBe(true);
  });

  it('matches custom titles that look like prose', () => {
    expect(isMultiline('Project description')).toBe(true);
    expect(isMultiline('A note about you')).toBe(true);
  });

  it('ignores short scalar keys and blanks', () => {
    expect(isMultiline('name')).toBe(false);
    expect(isMultiline('company')).toBe(false);
    expect(isMultiline(undefined, null, '')).toBe(false);
  });
});
