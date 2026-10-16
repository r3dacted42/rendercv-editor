/**
 * Build guard for the emitted declarations.
 *
 * `tsc` does not rewrite `paths` mappings, so an internal `@/…` import in the
 * source would leak into `dist/**\/*.d.ts` as an unresolvable specifier and
 * silently degrade the library's public types for consumers. Fail the build if
 * that happens.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = fileURLToPath(new URL('../dist', import.meta.url));

/** Recursively collect every `.d.ts` file under `dir`. */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

const offenders = [];

for (const file of walk(distDir)) {
  const source = readFileSync(file, 'utf8');
  // Static `from "…"` imports/exports, plus dynamic `import("…")` type references.
  const specifiers = [
    ...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
  ];
  for (const [, specifier] of specifiers) {
    if (specifier.startsWith('@/')) offenders.push(`${file}\n    → ${specifier}`);
  }
}

if (offenders.length > 0) {
  console.error('Declaration files must not reference the internal "@/..." alias:');
  for (const offender of offenders) console.error('  ' + offender);
  process.exit(1);
}

console.log('declarations ok: no internal "@/" alias leaked into dist');
