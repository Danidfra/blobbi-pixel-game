/** The shelter at construction stages, two seeds, at 5×.  npx tsx scripts/shelter-sheet.ts [outDir=examples/building] */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { paletteFor } from '../src/world/generate';
import { generateShelter } from '../src/game/buildings';
import { drawTinyText } from '../src/render/live-render';
const outDir = process.argv[2] ?? 'examples/building';
mkdirSync(outDir, { recursive: true });
const palette = paletteFor('cozy');
const steps = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
const CELL = 44;
const sheet = new PixelBuffer(steps.length * (CELL + 2) + 2, 2 * (CELL + 10) + 2);
sheet.fill(hex('#1b1f2a'));
['blobbi/shelter/0', 'turtle-2/shelter/0'].forEach((seed, row) => {
  const y0 = 2 + row * (CELL + 10);
  drawTinyText(sheet, `${seed.toUpperCase()}  PROGRESS ${steps.map((s) => Math.round(s * 100)).join(' ')}`, 2, y0, hex('#f4efe4'));
  steps.forEach((p, i) => {
    const cell = new PixelBuffer(CELL, CELL);
    cell.fill(hex('#5cb85c'));
    const s = generateShelter(seed, 29, palette, p);
    cell.blit(s.buffer, Math.round(CELL / 2) - s.anchorX, CELL - 6 - s.anchorY);
    sheet.blit(cell, 2 + i * (CELL + 2), y0 + 8);
  });
});
writeFileSync(join(outDir, 'shelter-stages.png'), toPng(sheet.scaled(5)));
console.log('wrote', join(outDir, 'shelter-stages.png'));
