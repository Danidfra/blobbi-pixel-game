/**
 * DOCS CHECK: every relative markdown link in the documentation resolves, and every source path named in backticks
 * (`src/...`, `tests/...`, `scripts/...`, or a short `game/items.ts`-style path under src/) exists. Run after moving
 * or renaming files:
 *   npx tsx scripts/check-docs.ts
 * Exits non-zero (and lists the problems) when something is missing.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const files: string[] = ['README.md', 'ROADMAP.md'];
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.md')) files.push(p);
  }
};
walk('docs');
// The archived reports are historical records, kept verbatim: their own links and paths are not checked.
const checked = files.filter((f) => !f.startsWith('docs/milestones/reports/'));
const problems: string[] = [];
const roots = ['', 'src/'];
for (const f of checked) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
    const target = m[1];
    if (/^[a-z]+:/i.test(target)) continue; // http:, mailto:
    const p = normalize(join(dirname(f), target));
    if (!existsSync(p)) problems.push(`${f}: link to ${target} (${p}) does not exist`);
  }
  for (const m of text.matchAll(/`([\w./-]+\.(?:ts|md|json|html|css))`/g)) {
    const path = m[1];
    if (path.includes('*') || path.startsWith('out/') || path.startsWith('dist/')) continue;
    if (!/[/]/.test(path)) continue; // bare file names are prose, not paths
    if (!roots.some((r) => existsSync(r + path)) && !existsSync(join(dirname(f), path))) problems.push(`${f}: path \`${path}\` does not exist`);
  }
}
if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\n${problems.length} problem(s) in ${checked.length} files`);
  process.exit(1);
}
console.log(`docs ok: ${checked.length} files, every link and path resolves`);
