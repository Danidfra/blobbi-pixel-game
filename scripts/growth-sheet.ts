/** One tree seed at eight ages, side by side: `npx tsx scripts/growth-sheet.ts out/growth.png oak-1 30 4` */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { COZY } from '../src/core/palette';
import { toPng } from '../src/node/png';
import { generateTree } from '../src/objects/tree';

const out = process.argv[2] ?? 'out/growth.png';
const seeds = (process.argv[3] ?? 'oak-1,fir-2,elm-3,yew-4').split(',');
const size = Number(process.argv[4] ?? 30);
const scale = Number(process.argv[5] ?? 4);
const stages = [0, 0.08, 0.2, 0.3, 0.45, 0.6, 0.8, 1];
const cell = size + 14;
const sheet = new PixelBuffer(stages.length * cell, seeds.length * cell);
sheet.fill(hex('#78d04c'));
seeds.forEach((seed, row) =>
  stages.forEach((g, col) => {
    const s = generateTree({ seed, size, palette: COZY, growth: g });
    const gx = col * cell + Math.floor(cell / 2);
    const gy = row * cell + cell - 6;
    sheet.fillEllipse(gx + 0.5, gy + 0.5, s.footRx + 1, s.footRy, COZY.shadowOnGrass);
    sheet.blit(s.buffer, gx - s.anchorX, gy - s.anchorY);
  }),
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, toPng(sheet.scaled(scale)));
console.log(`wrote ${out}`);
