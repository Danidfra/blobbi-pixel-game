/**
 * FIDELITY COMPARISON SHEET. For each seed (rows) and pose (columns):
 * the canonical Adult V3 render (resvg, anti-aliased, the ground truth),
 * the canonical pixel raster (approach B) and the native pixel sprite
 * (approach A), all at the same standing height, enlarged with nearest
 * neighbour so pixels can be judged.
 *   npx tsx scripts/compare.ts out/compare.png 24 6 "abc123,pattern-0" 
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import { generateGenome, renderBlobbiSvg } from '@blobbi-kit/renderer/procedural';
import { PixelBuffer } from '../src/core/pixel';
import { hex, rgba } from '../src/core/color';
import { toPng } from '../src/node/png';
import { blobbiIdentity } from '../src/blobbi/identity';
import { buildNativeSprite, REST_POSE, type BlobbiPose } from '../src/blobbi/sprite';
import { buildCanonicalSprite, stateForPose, CANONICAL_STANDING_HEIGHT } from '../src/blobbi/canonical';

const out = process.argv[2] ?? 'out/compare.png';
const size = Number(process.argv[3] ?? 24);
const zoom = Number(process.argv[4] ?? 6);
const seeds = (process.argv[5] ?? 'abc123,pattern-0,horns-1,tail-3,blobbi,ears-2').split(',');
const only = (process.argv[6] ?? '').split(',').filter(Boolean);
const allPoses: { label: string; pose: BlobbiPose }[] = [
  { label: 'front', pose: { ...REST_POSE } },
  { label: 'happy', pose: { ...REST_POSE, expression: 'happy' } },
  { label: 'sad', pose: { ...REST_POSE, expression: 'sad' } },
  { label: 'surprised', pose: { ...REST_POSE, expression: 'surprised' } },
  { label: 'excited', pose: { ...REST_POSE, expression: 'excited' } },
  { label: 'sleepy', pose: { ...REST_POSE, expression: 'sleepy' } },
  { label: 'blink', pose: { ...REST_POSE, lid: 2 } },
  { label: 'gaze L', pose: { ...REST_POSE, gazeX: -1 } },
  { label: 'gaze R', pose: { ...REST_POSE, gazeX: 1 } },
  { label: 'gaze down', pose: { ...REST_POSE, gazeY: 1 } },
  { label: 'half', pose: { ...REST_POSE, lid: 1 } },
  { label: 'side R', pose: { ...REST_POSE, view: 'side', facing: 1 } },
  { label: 'side L', pose: { ...REST_POSE, view: 'side', facing: -1 } },
  { label: 'back', pose: { ...REST_POSE, view: 'back' } },
  { label: 'walk 1', pose: { ...REST_POSE, view: 'side', facing: 1, walk: 1 } },
  { label: 'walk 4', pose: { ...REST_POSE, view: 'side', facing: 1, walk: 4 } },
];
const poses = only.length ? allPoses.filter((p) => only.includes(p.label)) : allPoses;
const bg = hex('#78d04c');

/** The canonical render at `height` px standing height, as a PixelBuffer with transparency preserved. */
function canonicalPng(svg: string, standingPx: number): PixelBuffer {
  const vbHeightPx = (238.125 / CANONICAL_STANDING_HEIGHT) * standingPx;
  const png = PNG.sync.read(Buffer.from(new Resvg(svg, { fitTo: { mode: 'height', value: Math.round(vbHeightPx) } }).render().asPng()));
  const buf = new PixelBuffer(png.width, png.height);
  for (let i = 0; i < png.width * png.height; i++) buf.data[i] = rgba(png.data[i * 4], png.data[i * 4 + 1], png.data[i * 4 + 2], png.data[i * 4 + 3]);
  return buf;
}

/** Composite a (possibly anti-aliased) buffer over a background colour. */
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

const cellW = Math.ceil(size * 1.0) + 8; // one column per implementation
const cellH = Math.ceil(size * 1.42) + 8;
const colsPerPose = 3; // canonical, B, A
const sheet = new PixelBuffer(poses.length * colsPerPose * cellW + (poses.length - 1) * 2, seeds.length * cellH);
sheet.fill(bg);
const t0 = performance.now();
seeds.forEach((seed, row) => {
  const genome = generateGenome(seed);
  const id = blobbiIdentity(seed);
  poses.forEach((p, col) => {
    const baseX = col * (colsPerPose * cellW + 2);
    const gy = row * cellH + cellH - 5;
    // Canonical (resvg), anti-aliased, at the same standing height.
    const svg = renderBlobbiSvg(genome, stateForPose(p.pose), { idPrefix: 'c' });
    const canon = canonicalPng(svg, size);
    const b = buildCanonicalSprite(genome, p.pose, size);
    // Align the canonical render by the same ground point: the raster's anchor scaled by the resvg/raster size ratio.
    const ratio = canon.height / b.buffer.height;
    blitOver(sheet, canon, baseX + Math.floor(cellW / 2) - Math.round(b.anchorX * ratio), gy - Math.round(b.anchorY * ratio));
    sheet.blit(b.buffer, baseX + cellW + Math.floor(cellW / 2) - b.anchorX, gy - b.anchorY);
    const a = buildNativeSprite(id, p.pose, size);
    sheet.blit(a.buffer, baseX + 2 * cellW + Math.floor(cellW / 2) - a.anchorX, gy - a.anchorY);
  });
  // Separator between rows
  sheet.hline(0, sheet.width - 1, row * cellH, hex('#5bb43c'));
});
for (let c = 0; c < poses.length; c++) sheet.vline(c * (colsPerPose * cellW + 2) - 1, 0, sheet.height - 1, hex('#2b5e22'));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, toPng(sheet.scaled(zoom)));
console.log(`wrote ${out} (${sheet.width}x${sheet.height} @${zoom}x) in ${(performance.now() - t0).toFixed(0)} ms; columns per pose: canonical | B raster | A native`);
