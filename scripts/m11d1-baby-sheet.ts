/**
 * M11D.1: the Baby comparison sheets (`src/dev/baby-sheet.ts`) as PNG files, each at 1×, 2× and 3× (whole-pixel
 * magnification only: every sprite is drawn natively at its size, the file is then scaled by nearest neighbour).
 *   npx tsx scripts/m11d1-baby-sheet.ts [outDir=examples/m11d1]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toPng } from '../src/node/png';
import { babySheets } from '../src/dev/baby-sheet';

const outDir = process.argv[2] ?? 'examples/m11d1';
mkdirSync(outDir, { recursive: true });
for (const { name, buffer } of babySheets()) {
  for (const k of name === 'scales' ? [1, 2, 3] : [2]) {
    const file = join(outDir, `${name}${k === 1 ? '' : `@${k}x`}.png`);
    writeFileSync(file, toPng(k === 1 ? buffer : buffer.scaled(k)));
    console.log(file, `${buffer.width * k}x${buffer.height * k}`);
  }
}
