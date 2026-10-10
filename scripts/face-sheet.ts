/**
 * FACIAL FIDELITY SHEET. One row per seed:
 *   canonical V3 (resvg, 120 px) | pixel 24 px ×5 | face crop ×12 | crown crop ×12 | pixel 16 px ×7 | canonical 16 px ×7
 * The crops are taken around the canonical eye line and crown, read from the
 * kit's own geometry, so they frame the same anatomy on every seed.
 *   npx tsx scripts/face-sheet.ts out/faces.png "blobbi-0,blobbi-1" front 24 16
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import { DOCUMENT_TRANSFORM, buildBlobbiGeometry, deriveMorphology, generateGenome, normalizeState, renderBlobbiSvg } from '@blobbi-kit/renderer/procedural';
import { PixelBuffer } from '../src/core/pixel';
import { hex, rgba } from '../src/core/color';
import { toPng } from '../src/node/png';
import { buildCanonicalSprite, stateForPose, CANONICAL_STANDING_HEIGHT } from '../src/blobbi/canonical';
import { REST_POSE, type BlobbiPose, type Expression } from '../src/blobbi/pose';

const out = process.argv[2] ?? 'out/faces.png';
const seeds = (process.argv[3] ?? 'blobbi-0,blobbi-1,blobbi-9,blobbi-19').split(',');
const expression = (process.argv[4] ?? 'neutral') as Expression;
const big = Number(process.argv[5] ?? 24);
const small = Number(process.argv[6] ?? 16);
const pose: BlobbiPose = { ...REST_POSE, expression };
const bg = hex('#78d04c');

function canonicalPng(svg: string, standingPx: number): PixelBuffer {
  const vbHeightPx = (238.125 / CANONICAL_STANDING_HEIGHT) * standingPx;
  const png = PNG.sync.read(Buffer.from(new Resvg(svg, { fitTo: { mode: 'height', value: Math.round(vbHeightPx) } }).render().asPng()));
  const buf = new PixelBuffer(png.width, png.height);
  for (let i = 0; i < png.width * png.height; i++) buf.data[i] = rgba(png.data[i * 4], png.data[i * 4 + 1], png.data[i * 4 + 2], png.data[i * 4 + 3]);
  return buf;
}
function blitOver(dst: PixelBuffer, src: PixelBuffer, x: number, y: number): void {
  for (let j = 0; j < src.height; j++)
    for (let i = 0; i < src.width; i++) {
      const c = src.data[j * src.width + i];
      const a = (c >>> 24) / 255;
      if (a === 0) continue;
      const u = dst.get(x + i, y + j);
      const m = (s: number, d: number) => Math.round(s * a + d * (1 - a));
      dst.set(x + i, y + j, rgba(m(c & 0xff, u & 0xff), m((c >>> 8) & 0xff, (u >>> 8) & 0xff), m((c >>> 16) & 0xff, (u >>> 16) & 0xff), 255));
    }
}
/** Crop a region of a sprite buffer and scale it. */
function crop(src: PixelBuffer, x0: number, y0: number, w: number, h: number, scale: number): PixelBuffer {
  const c = new PixelBuffer(w, h);
  c.fill(bg);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = src.get(x0 + x, y0 + y);
    if (v >>> 24) c.data[y * w + x] = v;
  }
  return c.scaled(scale);
}

const canonH = 120;
const cols = [Math.round((canonH * 211.67) / 238.125) + 6, Math.ceil(big * 1.5) * 5 + 6, 14 * 12 + 6, 14 * 12 + 6, Math.ceil(small * 1.5) * 7 + 6, Math.ceil(small * 1.5) * 7 + 6];
const rowH = Math.max(canonH, Math.ceil(big * 1.5) * 5, 14 * 12) + 10;
const sheet = new PixelBuffer(cols.reduce((a, b) => a + b, 0), seeds.length * rowH);
sheet.fill(bg);
seeds.forEach((seed, row) => {
  const genome = generateGenome(seed);
  const state = stateForPose(pose);
  const svg = renderBlobbiSvg(genome, state, { idPrefix: 'f' });
  const y0 = row * rowH + 5;
  let x = 3;
  // 1. canonical
  const canon = canonicalPng(svg, (canonH * CANONICAL_STANDING_HEIGHT) / 238.125);
  blitOver(sheet, canon, x, y0);
  x += cols[0];
  // 2. pixel big
  const b = buildCanonicalSprite(genome, pose, big);
  sheet.blit(b.buffer.scaled(5), x, y0);
  x += cols[1];
  // 3./4. crops around the canonical eye line and crown, from the kit's geometry at this sprite's scale.
  const geo = buildBlobbiGeometry(deriveMorphology(genome, 'adult'), normalizeState(state));
  const k = big / CANONICAL_STANDING_HEIGHT;
  const toPx = (rx: number, ry: number) => [Math.round((rx * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.tx) * k + 2), Math.round((ry * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.ty) * k + 2)];
  const face = geo.face;
  if (face) {
    const [fx, fy] = toPx(geo.body.apex.x, face.eyeLineY);
    sheet.blit(crop(b.buffer, fx - 7, fy - 5, 14, 14, 12), x, y0);
  }
  x += cols[2];
  const [ax, ay] = toPx(geo.body.apex.x, geo.body.top);
  sheet.blit(crop(b.buffer, ax - 7, ay - 9, 14, 14, 12), x, y0);
  x += cols[3];
  // 5. pixel small
  const s = buildCanonicalSprite(genome, pose, small);
  sheet.blit(s.buffer.scaled(7), x, y0);
  x += cols[4];
  // 6. canonical at the small size, anti-aliased, enlarged the same way
  const cs = canonicalPng(svg, small);
  const tmp = new PixelBuffer(cs.width, cs.height);
  tmp.fill(bg);
  blitOver(tmp, cs, 0, 0);
  sheet.blit(tmp.scaled(7), x, y0);
  sheet.hline(0, sheet.width - 1, row * rowH, hex('#3c8a2e'));
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, toPng(sheet));
console.log(`wrote ${out}: canonical | pixel ${big}px | face ×12 | crown ×12 | pixel ${small}px | canonical ${small}px`);
