/**
 * Build guard for colourless colour utilities.
 *
 * A `border`, `outline`, `ring-<width>` or `divide-x` utility sets a width but no
 * colour, so the colour falls back to `currentColor` — the inherited text colour.
 * Against a default palette that is nearly invisible; against a themed host it is
 * a wrong-coloured box. That is exactly what 0.3.1 fixed in the renderer's root
 * container (a bare `border` painted in the form's text colour instead of
 * `--border`), and the failure is invisible until someone themes the form.
 *
 * Scope: the package's own sources — `src/` minus `src/components/ui/**`. That is
 * where the package styles its own markup (`FormRenderer.vue`, `ConfirmDialog.vue`)
 * and where the bug ships from. The vendored UI kit is deliberately exempt: it is
 * a verbatim copy of the shadcn-vue registry, and the few bare `border`s upstream
 * contains are covered by the base-layer default (`* { border-color: … }`) that
 * `theme.css` ships and that `shadcn-vue init` writes in a shadcn-vue app. Keep
 * those files matching the registry rather than patching them here.
 *
 * Escape hatch: put `colour-guard-ignore` in a comment on the line.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(packageDir, 'src');
const uiDir = join(srcDir, 'components', 'ui');

const SIDES = 't|r|b|l|x|y|s|e';
// A width: a bare number (`border-2`), an arbitrary length-ish value (`border-[3px]`), or nothing.
const WIDTH = '(\\d+|\\[[^\\]]*\\])';
const BORDER_WIDTH = new RegExp(`^border(?:-(?:${SIDES}))?(?:-${WIDTH})?$`);
const DIVIDE_WIDTH = new RegExp(`^divide-(?:x|y)(?:-${WIDTH})?$`);
const RING_WIDTH = new RegExp(`^ring(?:-${WIDTH})?$`);
const OUTLINE_WIDTH = new RegExp(`^outline(?:-${WIDTH})?$`);

// `outline-none`, `outline-hidden`, `outline-dashed`, … are styles, not colours.
const OUTLINE_NON_COLOUR = new Set(['none', 'hidden', 'solid', 'dashed', 'dotted', 'double', 'auto']);
// `ring-inset` / `ring-offset-2` are not ring colours.
const RING_NON_COLOUR = new Set(['inset']);

const isZeroWidth = (value) => /^0(?:[^\d.]|$)|^\[0(?:\D|$)|^\[0(?:px|rem|em|%)?\]$/.test(value);

/** Drop leading `variant:` prefixes, treating `[...]` groups as opaque. */
function stripVariants(token) {
  let rest = token;
  for (;;) {
    const match = /^(?:\[[^\]]*\]|[^:[\]]+):/.exec(rest);
    if (!match) return rest;
    rest = rest.slice(match[0].length);
  }
}

/** Split a comment/class string into candidate utility tokens. */
function tokenize(text) {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/^[("'`{[]+|[)"'`}\],;]+$/g, ''))
    .map(stripVariants)
    .filter(Boolean);
}

function classify(token) {
  const zero = (match) => (match && match[1] ? isZeroWidth(match[1]) : false);

  const border = BORDER_WIDTH.exec(token);
  if (border) return zero(border) ? null : 'border';

  const divide = DIVIDE_WIDTH.exec(token);
  if (divide) return zero(divide) ? null : 'divide';

  const ring = RING_WIDTH.exec(token);
  if (ring) return zero(ring) ? null : 'ring';

  const outline = OUTLINE_WIDTH.exec(token);
  if (outline) return zero(outline) ? null : 'outline';

  return null;
}

/** Is this token a colour for `family`, rather than a width/style for it? */
function isColour(token, family) {
  if (family === 'border') return token.startsWith('border-') && !BORDER_WIDTH.test(token);
  if (family === 'divide') return token.startsWith('divide-') && !DIVIDE_WIDTH.test(token);
  if (family === 'ring') {
    if (!token.startsWith('ring-') || RING_WIDTH.test(token)) return false;
    return !RING_NON_COLOUR.has(token.slice('ring-'.length)) && !token.startsWith('ring-offset-');
  }
  if (family === 'outline') {
    if (!token.startsWith('outline-') || OUTLINE_WIDTH.test(token)) return false;
    const rest = token.slice('outline-'.length);
    return !OUTLINE_NON_COLOUR.has(rest) && !rest.startsWith('offset-');
  }
  return false;
}

/** Class strings only: quoted literals that are not some `attr="…"` value. */
function classStrings(line) {
  const strings = [];
  for (const match of line.matchAll(/(['"`])([^'"`]*)\1/g)) {
    const before = line.slice(0, match.index);
    const attribute = /([\w:.-]+)=\s*$/.exec(before);
    if (attribute && attribute[1].replace(/^:/, '') !== 'class') continue;
    strings.push(match[2]);
  }
  return strings;
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path === uiDir) return [];
      return walk(path);
    }
    return /\.(vue|ts)$/.test(entry.name) ? [path] : [];
  });
}

const offenders = [];

for (const file of walk(srcDir)) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes('colour-guard-ignore')) return;

    const tokens = tokenize(line);
    const byFamily = new Map();
    for (const raw of classStrings(line)) {
      for (const token of tokenize(raw)) {
        const family = classify(token);
        if (!family) continue;
        if (!byFamily.has(family)) byFamily.set(family, []);
        byFamily.get(family).push(token);
      }
    }

    for (const [family, offenders_] of byFamily) {
      if (tokens.some((token) => isColour(token, family))) continue;
      offenders.push(
        `${relative(packageDir, file).split(sep).join('/')}:${index + 1}\n` +
          `    “${[...new Set(offenders_)].join(' ')}” has no ${family} colour — it will paint in currentColor.\n` +
          `    Pair it with \`${family}-<token>\`, or add a \`colour-guard-ignore\` comment.`,
      );
    }
  });
}

if (offenders.length > 0) {
  console.error('Colour utilities without a colour:');
  for (const offender of offenders) console.error('  ' + offender);
  process.exit(1);
}

console.log('colour utilities ok: no colourless border/outline/ring/divide in the package sources');
