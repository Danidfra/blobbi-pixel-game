/**
 * Render many seeds to PNG and a contact sheet, for inspecting consistency:
 *   npx tsx scripts/render-seeds.ts [count=12] [scale=2] [outDir=out/seeds] [prefix=seed]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { generateWorld } from '../src/world/generate';
import { renderWorld } from '../src/render/compose';

const count = Number(process.argv[2] ?? 12);
const scale = Number(process.argv[3] ?? 2);
const outDir = process.argv[4] ?? 'out/seeds';
const prefix = process.argv[5] ?? 'seed';
mkdirSync(outDir, { recursive: true });
const cols = Math.ceil(Math.sqrt(count));
let sheet: PixelBuffer | null = null;
let w = 0;
let h = 0;
const t0 = performance.now();
for (let i = 0; i < count; i++) {
  const seed = `${prefix}-${i}`;
  const world = generateWorld(seed);
  const img = renderWorld(world);
  if (!sheet) {
    w = img.width;
    h = img.height;
    sheet = new PixelBuffer(cols * (w + 4), Math.ceil(count / cols) * (h + 4));
    sheet.fill(hex('#1b1f2a'));
  }
  sheet.blit(img, (i % cols) * (w + 4) + 2, Math.floor(i / cols) * (h + 4) + 2);
  writeFileSync(join(outDir, `${seed}.png`), toPng(img.scaled(scale)));
  console.log(`${seed}: ${world.stats.islands} islands, ${world.stats.bridges} bridges, ${world.objects.length} objects, ${world.stats.generationMs.toFixed(1)} ms`);
}
writeFileSync(join(outDir, `sheet.png`), toPng(sheet!));
console.log(`sheet: ${join(outDir, 'sheet.png')} in ${(performance.now() - t0).toFixed(0)} ms total`);
