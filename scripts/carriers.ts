/**
 * WORLD CARRIER SPECIES previews (M6; the whale redrawn east-west in M8 phase 0): several seeds of each creature
 * species, their animation through a cycle, and their islands at each preview growth stage (playable worlds grow
 * by world/growth.ts; see scripts/whale-world.ts and scripts/manta-world.ts).
 *   npx tsx scripts/carriers.ts [outDir=examples/living-archipelago]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { paletteFor } from '../src/world/generate';
import { drawTinyText } from '../src/render/live-render';
import { renderSpeciesPreview, SPECIES } from '../src/carriers/species';

const outDir = process.argv[2] ?? 'examples/living-archipelago';
mkdirSync(outDir, { recursive: true });
const palette = paletteFor('cozy');
// Each species in its own frame: the whale lies east-west (landscape), the manta is wide but faces the viewer.
let W = 240;
let H = 320;
const label = (buf: PixelBuffer, text: string, x: number, y: number) => {
  buf.fillRect(x, y, text.length * 4 + 3, 9, hex('#1b1f2a'));
  drawTinyText(buf, text, x + 2, y + 2, hex('#f4efe4'));
};
const sheet = (cells: { buf: PixelBuffer; text: string }[], cols: number, scale = 2) => {
  const out = new PixelBuffer(cols * W, Math.ceil(cells.length / cols) * H);
  cells.forEach((c, i) => {
    out.blit(c.buf, (i % cols) * W, Math.floor(i / cols) * H);
    label(out, c.text, (i % cols) * W + 3, Math.floor(i / cols) * H + 3);
  });
  return scale > 1 ? out.scaled(scale) : out;
};

for (const species of ['whale', 'manta'] as const) {
  [W, H] = species === 'whale' ? [320, 240] : [240, 320];
  // Individuals: the same species, four seeds.
  const seeds = [0, 1, 2, 3].map((i) => `${species}-${i}`);
  writeFileSync(join(outDir, `carrier-${species}-individuals.png`), toPng(sheet(seeds.map((s, i) => ({ buf: renderSpeciesPreview(species, s, W, H, i * 1.3, palette), text: s.toUpperCase() })), 4)));
  // Animation: eight moments of one cycle (the whale's flukes and spout, the manta's wings).
  const cycle = species === 'whale' ? 6.5 : 3.6;
  const times = Array.from({ length: 8 }, (_, i) => (i / 8) * cycle + (species === 'whale' ? 9.6 : 0));
  writeFileSync(join(outDir, `carrier-${species}-motion.png`), toPng(sheet(times.map((t) => ({ buf: renderSpeciesPreview(species, seeds[0], W, H, t, palette), text: `T ${t.toFixed(1)}` })), 4, 1)));
  // Growth: the island at each stage (designed; previews only).
  const stages = ['YOUNG', 'GROWN', 'GREAT', 'ANCIENT'];
  writeFileSync(join(outDir, `carrier-${species}-growth.png`), toPng(sheet(stages.map((s, i) => ({ buf: renderSpeciesPreview(species, seeds[0], W, H, 0.5, palette, i), text: `${s} (PREVIEW)` })), 4)));
  console.log(`${species}: ${SPECIES[species].name}, ${SPECIES[species].status}`);
}
console.log(`wrote ${outDir}: carrier-{whale,manta}-{individuals,motion,growth}.png`);
