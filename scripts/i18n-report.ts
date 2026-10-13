/**
 * I18N REPORT (M11B): how complete each language is — interface messages (`src/i18n/messages`) and content text
 * (`src/content/text.ts`) — and which content keys a language lacks. `--dump <file>` writes every content key with
 * its English (a starting point for a new language's catalogue).
 *   npx tsx scripts/i18n-report.ts [--dump out.json]
 */
import { writeFileSync } from 'node:fs';
import { CATALOGS, loadLocale, localeBundle, LOCALES } from '../src/i18n';
import { en } from '../src/i18n/messages/en';
import { contentTexts } from '../src/content/text';

for (const { id } of LOCALES) await loadLocale(id);

const texts = contentTexts();
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
console.log(`interface messages: ${Object.keys(en).length} keys; content texts: ${texts.size} keys, ${[...texts.values()].reduce((n, s) => n + words(s), 0)} English words`);
for (const { id } of LOCALES) {
  if (id === 'en') continue;
  const ui = Object.keys(CATALOGS[id] ?? {}).length;
  const table = localeBundle(id)!.content;
  const missing = [...texts.keys()].filter((k) => !(k in table));
  const extra = Object.keys(table).filter((k) => !texts.has(k));
  console.log(`${id}: interface ${ui}/${Object.keys(en).length}; content ${texts.size - missing.length}/${texts.size}${missing.length ? `, missing ${missing.length} (e.g. ${missing.slice(0, 5).join(', ')})` : ''}${extra.length ? `, unknown keys ${extra.join(', ')}` : ''}`);
}
const i = process.argv.indexOf('--dump');
if (i > 0) {
  writeFileSync(process.argv[i + 1], JSON.stringify(Object.fromEntries(texts), null, 1));
  console.log('wrote', process.argv[i + 1]);
}
