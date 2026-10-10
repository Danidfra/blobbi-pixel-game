/**
 * 32 PX RENDERING-SCALE COMPARISON (isolated: gameplay unchanged). For several seeds and poses: the kit's own
 * anti-aliased render at 32 px (resvg, the reference), then each strategy of `src/blobbi/scale-lab.ts` on the
 * same canvas, with fidelity scores against the reference.
 *   npx tsx scripts/scale-comparison.ts [outDir=examples/fidelity32] [size=32] [zoom=6]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import { generateGenome, renderBlobbiSvg } from '@blobbi-kit/renderer/procedural';
import { PixelBuffer } from '../src/core/pixel';
import { hex, rgba } from '../src/core/color';
import { toPng } from '../src/node/png';
import { REST_POSE, type BlobbiPose } from '../src/blobbi/pose';
import { stateForPose } from '../src/blobbi/canonical';
import { canvasFor, labSprite, scoreAgainst, SCALE_STRATEGIES, type FidelityScore, type ScaleStrategy } from '../src/blobbi/scale-lab';
import { drawTinyText } from '../src/render/live-render';

const outDir = process.argv[2] ?? 'examples/fidelity32';
const size = Number(process.argv[3] ?? 32);
const zoom = Number(process.argv[4] ?? 6);
mkdirSync(outDir, { recursive: true });
const seeds = ['blobbi-0', 'blobbi-1', 'blobbi-9', 'blobbi-19', 'horns-1', 'pattern-0'];
const poses: { label: string; pose: BlobbiPose }[] = [
  { label: 'FRONT', pose: { ...REST_POSE } },
  { label: 'HAPPY', pose: { ...REST_POSE, expression: 'happy' } },
  { label: 'SIDE', pose: { ...REST_POSE, view: 'side', facing: 1 } },
];

/** The kit's anti-aliased render on the gameplay canvas: the viewBox scaled like the raster, offset by the margin. */
export function referenceFor(seed: string, pose: BlobbiPose, px: number): PixelBuffer {
  const c = canvasFor(px);
  const svg = renderBlobbiSvg(generateGenome(seed), stateForPose(pose), { idPrefix: 'r' });
  const img = PNG.sync.read(Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(211.66666 * c.scale) } }).render().asPng()));
  const buf = new PixelBuffer(c.width, c.height);
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      buf.set(x + c.margin, y + c.margin, rgba(img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]));
    }
  return buf;
}

const bg = hex('#78d04c');
function over(dst: PixelBuffer, src: PixelBuffer, ox: number, oy: number): void {
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const c = src.get(x, y);
      const a = (c >>> 24) / 255;
      if (!a) continue;
      const u = dst.get(ox + x, oy + y);
      const m = (s: number, d: number) => Math.round(s * a + d * (1 - a));
      dst.set(ox + x, oy + y, rgba(m(c & 0xff, u & 0xff), m((c >>> 8) & 0xff, (u >>> 8) & 0xff), m((c >>> 16) & 0xff, (u >>> 16) & 0xff), 255));
    }
}

const c = canvasFor(size);
const cols = 1 + SCALE_STRATEGIES.length;
const LABEL = 8;
const cellW = c.width + 4;
const cellH = c.height + 4;
const rows = seeds.length * poses.length;
const sheet = new PixelBuffer(cols * cellW + 60, LABEL + rows * cellH);
sheet.fill(hex('#1b1f2a'));
drawTinyText(sheet, 'REFERENCE', 62, 1, hex('#f4efe4'));
SCALE_STRATEGIES.forEach((s, i) => drawTinyText(sheet, s.label, 62 + (i + 1) * cellW, 1, hex('#f4efe4')));
const scores: Record<ScaleStrategy, FidelityScore[]> = { direct: [], bands6: [], 'no-outline': [], supersample: [], nearest16x2: [] };
const perCase: { seed: string; pose: string; strategy: ScaleStrategy; score: FidelityScore }[] = [];
let row = 0;
for (const seed of seeds) {
  const genome = generateGenome(seed);
  for (const p of poses) {
    const y = LABEL + row * cellH;
    drawTinyText(sheet, seed.toUpperCase(), 1, y + 4, hex('#f4efe4'));
    drawTinyText(sheet, p.label, 1, y + 11, hex('#a7b0c0'));
    const ref = referenceFor(seed, p.pose, size);
    const cell = new PixelBuffer(c.width, c.height);
    cell.fill(bg);
    over(cell, ref, 0, 0);
    sheet.blit(cell, 60 + 2, y + 2);
    SCALE_STRATEGIES.forEach((s, i) => {
      const sprite = labSprite(s.id, genome, p.pose, size);
      const score = scoreAgainst(ref, sprite.buffer);
      scores[s.id].push(score);
      perCase.push({ seed, pose: p.label, strategy: s.id, score });
      const cl = new PixelBuffer(c.width, c.height);
      cl.fill(bg);
      cl.blit(sprite.buffer, 0, 0);
      sheet.blit(cl, 60 + (i + 1) * cellW + 2, y + 2);
    });
    row++;
  }
}
writeFileSync(join(outDir, `scale-comparison-${size}px.png`), toPng(sheet.scaled(zoom)));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const summary = SCALE_STRATEGIES.map((s) => ({
  strategy: s.id,
  silhouetteIoU: +mean(scores[s.id].map((x) => x.silhouetteIoU)).toFixed(3),
  colourError: +mean(scores[s.id].map((x) => x.colourError)).toFixed(1),
  inkIoU: +mean(scores[s.id].map((x) => x.inkIoU)).toFixed(3),
  colours: +mean(scores[s.id].map((x) => x.colours)).toFixed(1),
  note: s.note,
}));
writeFileSync(join(outDir, `scale-comparison-${size}px.json`), `${JSON.stringify({ size, seeds, poses: poses.map((p) => p.label), summary, perCase }, null, 2)}\n`);
console.table(summary.map(({ note, ...rest }) => rest));
console.log(`wrote ${join(outDir, `scale-comparison-${size}px.png`)} and .json`);
