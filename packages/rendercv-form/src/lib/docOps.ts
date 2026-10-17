import type { JsonSchema } from './types';

/**
 * Atom-level document editing.
 *
 * The renderer edits its `v-model` object in place, and these helpers do the
 * same for code that owns a document outside the form (an LLM patch pipeline, a
 * "move this entry up" button, …). Every helper mutates `root` and returns it,
 * so calls compose.
 *
 * The one subtlety is the internal `$schemas` marker that `yamlToDoc()` attaches
 * to section maps (`cv.sections.$schemas`). It pairs each user-named section key
 * with the schema it matches, and must survive — or be updated alongside — every
 * edit. The generic helpers below never touch a `$…` key, and `removeAtPath()`
 * additionally drops the marker entry of any section key it removes. Use the
 * `addSection()` / `removeSection()` / `renameSection()` helpers for section
 * maps so the marker stays in sync in both directions.
 */

/** A path to a value inside a document, given as segments (never as a string). */
export type DocPath = ReadonlyArray<string | number>;

/** Keys starting with `$` are internal markers and are never walked or edited. */
const isMarker = (key: string | number): boolean =>
  typeof key === 'string' && key.startsWith('$');

/* Path formatting --------------------------------------------------------- */

/** Segments needing bracket-quoting in the display form (dots, brackets, quotes). */
const SPECIAL = /[.[\]"\\]/;

/**
 * Renders a path as a display string, e.g. `cv.sections.experience[0].company`.
 * Section keys may contain dots, so such segments are quoted:
 * `cv.sections["my.section"][0]`. `parsePath()` round-trips the result.
 */
export function formatPath(path: DocPath): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      out += `[${segment}]`;
    } else if (out === '' && !SPECIAL.test(segment)) {
      out = segment;
    } else if (SPECIAL.test(segment)) {
      out += `[${JSON.stringify(segment)}]`;
    } else {
      out += `.${segment}`;
    }
  }
  return out;
}

const PATH_TOKEN = /\[\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(-?\d+))\s*\]|([^.[\]]+)/g;

/**
 * Parses the display form produced by `formatPath()` back into segments.
 * Bare segments cannot contain `.`, `[` or `]`; quote them (as `formatPath()`
 * does) when they do.
 */
export function parsePath(display: string): Array<string | number> {
  const path: Array<string | number> = [];
  PATH_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PATH_TOKEN.exec(display)) !== null) {
    const [, doubleQuoted, singleQuoted, index, bare] = match;
    if (doubleQuoted !== undefined) path.push(doubleQuoted.replace(/\\(.)/g, '$1'));
    else if (singleQuoted !== undefined) path.push(singleQuoted.replace(/\\(.)/g, '$1'));
    else if (index !== undefined) path.push(Number(index));
    else path.push(bare);
  }
  return path;
}

/* Path primitives --------------------------------------------------------- */

/** Reads the value at `path`, or `undefined` when any step is missing. */
export function getAtPath(root: any, path: DocPath): any {
  let cursor = root;
  for (const segment of path) {
    if (cursor === undefined || cursor === null) return undefined;
    cursor = cursor[segment as any];
  }
  return cursor;
}

/** Whether `path` resolves to an existing key/index. */
export function hasAtPath(root: any, path: DocPath): boolean {
  if (path.length === 0) return root !== undefined;
  const parent = getAtPath(root, path.slice(0, -1));
  const last = path[path.length - 1]!;
  if (Array.isArray(parent)) return typeof last === 'number' && last >= 0 && last < parent.length;
  return !!parent && typeof parent === 'object' && last in parent;
}

/**
 * Assigns `value` at `path`, creating the intermediate arrays/objects the path
 * needs (a numeric segment creates an array, otherwise an object).
 */
export function setAtPath(root: any, path: DocPath, value: any): any {
  if (path.length === 0) throw new Error('setAtPath() requires a non-empty path');

  let cursor = root;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]!;
    const next = cursor[segment as any];
    if (next === undefined || next === null || typeof next !== 'object') {
      cursor[segment as any] = typeof path[i + 1] === 'number' ? [] : {};
    }
    cursor = cursor[segment as any];
  }
  cursor[path[path.length - 1] as any] = value;
  return root;
}

/**
 * Removes the value at `path` (deletes an object key / splices an array index).
 * Removing a section key also removes its `$schemas` marker.
 *
 * @returns `true` when something was removed.
 */
export function removeAtPath(root: any, path: DocPath): boolean {
  if (path.length === 0) return false;

  const parent = getAtPath(root, path.slice(0, -1));
  const last = path[path.length - 1]!;

  if (Array.isArray(parent)) {
    if (typeof last !== 'number' || last < 0 || last >= parent.length) return false;
    parent.splice(last, 1);
    return true;
  }

  if (!parent || typeof parent !== 'object') return false;
  if (!(last in parent)) return false;

  delete parent[last];

  // Keep a section map's marker list in sync with its keys.
  if (Array.isArray(parent.$schemas)) {
    parent.$schemas = parent.$schemas.filter((marker: any) => marker?.$key !== last);
  }
  return true;
}

/**
 * Inserts `value` into the array at `path`. The last segment is the target
 * index and is clamped to the array bounds, so `length` appends.
 */
export function insertAtPath(root: any, path: DocPath, value: any): any {
  if (path.length === 0) throw new Error('insertAtPath() requires a non-empty path');

  const array = getAtPath(root, path.slice(0, -1));
  const index = path[path.length - 1];
  if (!Array.isArray(array)) throw new Error(`insertAtPath() expects an array at ${formatPath(path.slice(0, -1))}`);
  if (typeof index !== 'number') throw new Error('insertAtPath() requires a numeric index as the last segment');

  array.splice(Math.max(0, Math.min(index, array.length)), 0, value);
  return root;
}

/**
 * Moves an element inside the array at `path`. `to` is the destination index
 * counted after the element has been lifted out (drag-and-drop semantics).
 */
export function moveAtPath(root: any, path: DocPath, from: number, to: number): any {
  const array = getAtPath(root, path);
  if (!Array.isArray(array)) return root;
  if (from < 0 || from >= array.length) return root;

  const [element] = array.splice(from, 1);
  array.splice(Math.max(0, Math.min(to, array.length)), 0, element);
  return root;
}

/**
 * Rearranges the array at `path`. `order` is the new sequence of old indices
 * (`[2, 0, 1]` moves the third element first) and must be a full permutation.
 */
export function reorderAtPath(root: any, path: DocPath, order: ReadonlyArray<number>): any {
  const array = getAtPath(root, path);
  if (!Array.isArray(array)) return root;

  const seen = new Set<number>();
  const next = order.map((index) => {
    if (!Number.isInteger(index) || index < 0 || index >= array.length || seen.has(index)) {
      throw new Error(`reorderAtPath() needs a permutation of 0…${array.length - 1}`);
    }
    seen.add(index);
    return array[index];
  });
  if (next.length !== array.length) {
    throw new Error(`reorderAtPath() needs a permutation of 0…${array.length - 1}`);
  }

  array.splice(0, array.length, ...next);
  return root;
}

/* Section maps (`cv.sections` and the `$schemas` marker) ------------------ */

/** One entry of a section map's `$schemas` marker list. */
export interface SectionMarker {
  /** The user-named section key (e.g. `experience`). */
  $key: string;
  /** The schema that key's entries match. */
  $schema: JsonSchema;
}

/** The marker list of a section map (empty when it has none). */
export function sectionMarkers(sections: any): SectionMarker[] {
  return Array.isArray(sections?.$schemas) ? sections.$schemas : [];
}

/** The marker of one section key, if the section exists. */
export function sectionMarker(sections: any, key: string): SectionMarker | undefined {
  return sectionMarkers(sections).find((marker) => marker?.$key === key);
}

/**
 * Adds (or replaces) a section and its marker, keeping the two in sync — the
 * marker-correct way to insert a key into a section map.
 *
 * @param initial the section's value; defaults to an empty entry list.
 * @returns the section's value.
 */
export function addSection(
  sections: Record<string, any>,
  key: string,
  schema: JsonSchema,
  initial: any = [],
): any {
  if (!sections || typeof sections !== 'object') {
    throw new Error('addSection() expects the section map object (e.g. doc.cv.sections)');
  }

  sections[key] = initial;

  const markers: SectionMarker[] = Array.isArray(sections.$schemas)
    ? sections.$schemas
    : (sections.$schemas = []);
  const marker: SectionMarker = { $key: key, $schema: schema };
  const existing = markers.findIndex((entry) => entry?.$key === key);
  if (existing >= 0) markers[existing] = marker;
  else markers.push(marker);

  return initial;
}

/**
 * Removes a section and its marker (insertion order of the rest is preserved).
 *
 * @returns `true` when the section existed.
 */
export function removeSection(sections: any, key: string): boolean {
  return removeAtPath(sections, [key]);
}

/**
 * Renames a section key, keeping its position, its value and its marker.
 *
 * @returns `true` when the key was renamed.
 */
export function renameSection(sections: any, from: string, to: string): boolean {
  if (!sections || typeof sections !== 'object' || from === to) return false;
  if (!(from in sections) || to in sections) return false;

  const markers = Array.isArray(sections.$schemas) ? (sections.$schemas as SectionMarker[]) : undefined;
  const entries = Object.entries(sections).filter(([key]) => !isMarker(key));
  for (const [key] of entries) delete sections[key];
  for (const [key, value] of entries) sections[key === from ? to : key] = value;

  if (markers) {
    sections.$schemas = markers.map((marker) =>
      marker?.$key === from ? { ...marker, $key: to } : marker,
    );
  }
  return true;
}
