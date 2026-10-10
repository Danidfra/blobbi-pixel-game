/**
 * Render a sheet of one object kind across many seeds/sizes to a PNG, so the
 * generators can be inspected at a glance. `npx tsx scripts/sheet.ts tree out/trees.png`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { COZY } from '../src/core/palette';
import { toPng } from '../src/node/png';
import { OBJECT_GENERATORS, type ObjectKind } from '../src/objects';

const kind = (process.argv[2] ?? 'tree') as ObjectKind;
const out = process.argv[3] ?? `out/sheet-${kind}.png`;
const scale = Number(process.argv[4] ?? 3);
const sizes = (process.argv[5] ?? '16,24,32,40').split(',').map(Number);
const cols = Number(process.argv[6] ?? 10);
const gen = OBJECT_GENERATORS[kind];
if (!gen) throw new Error(`unknown object kind ${kind}`);
const cell = Math.max(...sizes) + 12;
const sheet = new PixelBuffer(cols * cell, sizes.length * cell);
sheet.fill(hex('#78d04c'));
sizes.forEach((size, row) => {
  for (let col = 0; col < cols; col++) {
    const sprite = gen({ seed: `sheet-${kind}-${row}-${col}`, size, palette: COZY });
    const x = col * cell + Math.floor(cell / 2) - sprite.anchorX;
    const y = row * cell + cell - 6 - sprite.anchorY;
    sheet.fillEllipse(col * cell + cell / 2, row * cell + cell - 6 + 0.5, sprite.footRx, sprite.footRy, COZY.shadowOnGrass);
    sheet.blit(sprite.buffer, x, y);
  }
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, toPng(sheet.scaled(scale)));
console.log(`wrote ${out} (${sheet.width}x${sheet.height} @${scale}x)`);
