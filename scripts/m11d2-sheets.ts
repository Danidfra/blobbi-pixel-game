/**
 * M11D.2: the world-form sheet and the Baby tool sheets (tools now flush with the body) as PNG files at 2x.
 *   npx tsx scripts/m11d2-sheets.ts [outDir=examples/m11d2]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toPng } from '../src/node/png';
import { toolsSheet, worldFormsSheet } from '../src/dev/baby-sheet';

const outDir = process.argv[2] ?? 'examples/m11d2';
mkdirSync(outDir, { recursive: true });
for (const [name, buffer] of [['world-forms-32', worldFormsSheet(32)], ['world-forms-48', worldFormsSheet(48)], ['tools-24', toolsSheet(24)], ['tools-48', toolsSheet(48)]] as const) {
  writeFileSync(join(outDir, `${name}@2x.png`), toPng(buffer.scaled(2)));
  console.log(name, buffer.width * 2, buffer.height * 2);
}
