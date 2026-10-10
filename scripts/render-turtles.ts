/**
 * Render turtle worlds for several seeds to PNG and a contact sheet.
 *   npx tsx scripts/render-turtles.ts [count=6] [scale=1] [outDir=out/turtles] [prefix=turtle]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { renderWorld } from '../src/render/compose';
import { auditWorld } from '../src/render/audit';

const count = Number(process.argv[2] ?? 6);
const scale = Number(process.argv[3] ?? 1);
const outDir = process.argv[4] ?? 'out/turtles';
const prefix = process.argv[5] ?? 'turtle';
mkdirSync(outDir, { recursive: true });
const cols = Math.ceil(Math.sqrt(count));
let sheet: PixelBuffer | null = null;
let w = 0;
let h = 0;
const t0 = performance.now();
for (let i = 0; i < count; i++) {
  const seed = `${prefix}-${i}`;
  const world = generateTurtleWorld(seed);
  const img = renderWorld(world);
  if (!sheet) {
    w = img.width;
    h = img.height;
    sheet = new PixelBuffer(cols * (w + 4), Math.ceil(count / cols) * (h + 4));
    sheet.fill(hex('#1b1f2a'));
  }
  sheet.blit(img, (i % cols) * (w + 4) + 2, Math.floor(i / cols) * (h + 4) + 2);
  writeFileSync(join(outDir, `${seed}.png`), toPng(img.scaled(scale)));
  const audit = auditWorld(world);
  console.log(`${seed}: ${world.objects.length} objects, ${world.stats.generationMs.toFixed(0)} ms, audit ${audit.ok ? 'ok' : audit.issues.join('; ')}`);
}
writeFileSync(join(outDir, 'sheet.png'), toPng(sheet!));
console.log(`sheet: ${join(outDir, 'sheet.png')} in ${(performance.now() - t0).toFixed(0)} ms`);
