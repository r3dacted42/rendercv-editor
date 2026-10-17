import { describe, expect, it } from 'vitest';
import {
  addSection,
  formatPath,
  getAtPath,
  hasAtPath,
  insertAtPath,
  moveAtPath,
  parsePath,
  removeAtPath,
  removeSection,
  renameSection,
  reorderAtPath,
  sectionMarker,
  sectionMarkers,
  setAtPath,
  type JsonSchema,
} from '../src/index';

const entry = (name: string) => ({ institution: name });

describe('path primitives', () => {
  it('creates the containers a path needs', () => {
    const root: any = {};
    setAtPath(root, ['cv', 'sections', 'education', 0, 'institution'], 'MIT');

    expect(getAtPath(root, ['cv', 'sections', 'education', 0, 'institution'])).toBe('MIT');
    expect(Array.isArray(getAtPath(root, ['cv', 'sections', 'education']))).toBe(true);
  });

  it('overwrites in place and returns the root', () => {
    const root: any = { cv: { name: 'Jane' } };
    expect(setAtPath(root, ['cv', 'name'], 'Janet')).toBe(root);
    expect(root.cv.name).toBe('Janet');
  });

  it('requires a non-empty path when writing', () => {
    expect(() => setAtPath({}, [], 1)).toThrow(/non-empty path/);
    expect(() => insertAtPath({}, [], 1)).toThrow(/non-empty path/);
  });

  it('reads through missing and nullish steps', () => {
    expect(getAtPath({}, ['cv', 'nope', 'deeper'])).toBeUndefined();
    expect(getAtPath({ cv: null }, ['cv', 'name'])).toBeUndefined();
    expect(getAtPath({}, [])).toEqual({});
  });

  it('reports existence for keys and indices', () => {
    const root: any = { cv: { name: 'Jane', list: [1, 2] } };
    expect(hasAtPath(root, ['cv', 'name'])).toBe(true);
    expect(hasAtPath(root, ['cv', 'list', 1])).toBe(true);
    expect(hasAtPath(root, ['cv', 'list', 2])).toBe(false);
    expect(hasAtPath(root, ['cv', 'nope'])).toBe(false);
    expect(hasAtPath(root, [])).toBe(true);
  });

  it('inserts at an index and clamps it into range', () => {
    const root: any = { cv: { sections: { education: [entry('MIT')] } } };
    insertAtPath(root, ['cv', 'sections', 'education', 0], entry('Stanford'));
    insertAtPath(root, ['cv', 'sections', 'education', 99], entry('Last'));

    expect(getAtPath(root, ['cv', 'sections', 'education']).map((item: any) => item.institution)).toEqual([
      'Stanford',
      'MIT',
      'Last',
    ]);
  });

  it('explains an insert into a non-array', () => {
    expect(() => insertAtPath({ cv: {} }, ['cv', 0], {})).toThrow(/expects an array at cv/);
  });

  it('moves an entry with drag-and-drop semantics', () => {
    const root: any = { list: [entry('a'), entry('b'), entry('c')] };
    moveAtPath(root, ['list'], 2, 0);
    expect(root.list.map((item: any) => item.institution)).toEqual(['c', 'a', 'b']);

    moveAtPath(root, ['list'], 9, 0); // out of range: no-op
    expect(root.list.map((item: any) => item.institution)).toEqual(['c', 'a', 'b']);
  });

  it('reorders by permutation and rejects anything else', () => {
    const root: any = { list: [entry('a'), entry('b'), entry('c')] };
    reorderAtPath(root, ['list'], [2, 1, 0]);
    expect(root.list.map((item: any) => item.institution)).toEqual(['c', 'b', 'a']);

    expect(() => reorderAtPath(root, ['list'], [0, 0, 0])).toThrow(/permutation/);
    expect(() => reorderAtPath(root, ['list'], [0, 1])).toThrow(/permutation/);
  });

  it('removes array entries and object keys', () => {
    const root: any = { cv: { name: 'Jane', list: [1, 2, 3] } };
    expect(removeAtPath(root, ['cv', 'list', 1])).toBe(true);
    expect(root.cv.list).toEqual([1, 3]);

    expect(removeAtPath(root, ['cv', 'name'])).toBe(true);
    expect('name' in root.cv).toBe(false);

    expect(removeAtPath(root, ['cv', 'list', 9])).toBe(false);
    expect(removeAtPath(root, ['cv', 'nope'])).toBe(false);
    expect(removeAtPath(root, [])).toBe(false);
  });

  it('splices out of a nested array', () => {
    const root: any = { cv: { sections: { education: [entry('MIT'), entry('Stanford')] } } };
    expect(removeAtPath(root, ['cv', 'sections', 'education', 0])).toBe(true);
    expect(root.cv.sections.education.map((item: any) => item.institution)).toEqual(['Stanford']);
  });
});

describe('formatPath / parsePath', () => {
  it.each([
    [['cv', 'name'], 'cv.name'],
    [['cv', 'sections', 'experience', 0, 'company'], 'cv.sections.experience[0].company'],
    [['cv', 'sections', 'my.section', 0], 'cv.sections["my.section"][0]'],
    [['cv', 'sections', 'a"b'], 'cv.sections["a\\"b"]'],
  ])('round-trips %j', (path, display) => {
    expect(formatPath(path as Array<string | number>)).toBe(display);
    expect(parsePath(display)).toEqual(path);
  });

  it('keeps index segments numeric and quoted keys textual', () => {
    expect(parsePath('cv.sections["2020"]')).toEqual(['cv', 'sections', '2020']);
    expect(parsePath('cv.sections[2020]')).toEqual(['cv', 'sections', 2020]);
  });

  it('is tolerant of single quotes and spacing', () => {
    expect(parsePath("cv.sections[ 'a.b' ]")).toEqual(['cv', 'sections', 'a.b']);
  });
});

describe('section maps', () => {
  const schemaA = { type: 'array', items: { required: ['company', 'position'] } } as JsonSchema;
  const build = () => ({
    $schemas: [{ $key: 'experience', $schema: schemaA }],
    experience: [{ company: 'Acme', position: 'Engineer' }],
  });

  it('reads markers', () => {
    const sections = build();
    expect(sectionMarkers(sections)).toHaveLength(1);
    expect(sectionMarker(sections, 'experience')?.$schema).toBe(schemaA);
    expect(sectionMarker(sections, 'nope')).toBeUndefined();
    expect(sectionMarkers(undefined)).toEqual([]);
  });

  it('adds a section and its marker', () => {
    const sections: any = build();
    const value = addSection(sections, 'education', { type: 'array' } as JsonSchema);

    expect(value).toEqual([]);
    expect(sections.education).toEqual([]);
    expect(sectionMarkers(sections).map((marker) => marker.$key)).toEqual(['experience', 'education']);
  });

  it('replaces a section without duplicating its marker', () => {
    const sections: any = build();
    const replacement = [{ x: 1 }];
    addSection(sections, 'education', { type: 'array' } as JsonSchema);
    addSection(sections, 'education', { type: 'array', items: {} } as JsonSchema, replacement);

    expect(sections.education).toBe(replacement);
    expect(sectionMarkers(sections)).toHaveLength(2);
  });

  it('renames a section in place, keeping its position, value and marker', () => {
    const sections: any = build();
    addSection(sections, 'education', { type: 'array', items: {} } as JsonSchema, [{ x: 1 }]);

    expect(renameSection(sections, 'education', 'studies')).toBe(true);
    // Position is preserved among the user-named keys (`$schemas` is internal).
    expect(Object.keys(sections).filter((key) => !key.startsWith('$'))).toEqual([
      'experience',
      'studies',
    ]);
    expect(sections.studies).toEqual([{ x: 1 }]);
    expect(sectionMarker(sections, 'studies')?.$key).toBe('studies');
    expect(sectionMarker(sections, 'education')).toBeUndefined();
    expect(sectionMarker(sections, 'studies')?.$schema.items).toEqual({});
  });

  it('creates the marker list when the map has none yet', () => {
    const sections: any = {};
    addSection(sections, 'projects', { type: 'array' } as JsonSchema);
    expect(sections.projects).toEqual([]);
    expect(sections.$schemas).toEqual([{ $key: 'projects', $schema: { type: 'array' } }]);
  });

  it('refuses a rename that would collide or miss', () => {
    const sections: any = build();
    expect(renameSection(sections, 'education', 'studies')).toBe(false);
    expect(renameSection(sections, 'experience', 'experience')).toBe(false);
    expect(renameSection(undefined, 'a', 'b')).toBe(false);
  });

  it('removes a section and its marker', () => {
    const sections: any = build();
    expect(removeSection(sections, 'experience')).toBe(true);
    expect('experience' in sections).toBe(false);
    expect(sectionMarkers(sections)).toEqual([]);
    expect(removeSection(sections, 'experience')).toBe(false);
    expect(removeSection(undefined, 'experience')).toBe(false);
  });

  it('drops a marker when `removeAtPath` removes the key', () => {
    const sections: any = {
      $schemas: [
        { $key: 'a', $schema: {} },
        { $key: 'b', $schema: {} },
      ],
      a: [],
      b: [],
    };
    removeAtPath(sections, ['a']);
    expect(sections.$schemas).toEqual([{ $key: 'b', $schema: {} }]);
  });
});
