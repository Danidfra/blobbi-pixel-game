/**
 * TRAIT FIDELITY SHEETS (M3.4): the kit's canonical SVG against the game's pixels, for Blobbis with freckles,
 * the gradient pattern, both, and for several distinct V3 identities (derived from pubkey + d with the kit's
 * own `deriveBlobbiV3Seed`).
 *
 * Every row: [kit SVG, resvg, anti-aliased, 96 px tall] [game 12 px ×8] [game 24 px ×4] [game 48 px ×2]
 * [game 12, 24, 48 px at 1:1]. The enlarged columns are nearest-neighbour, so every game pixel is visible.
 *   npx tsx scripts/trait-fidelity.ts [outDir]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import { getCanonicalBlobbiD } from '@blobbi-kit/core';
import { generateGenome, renderBlobbiSvg, type BlobbiGenome } from '@blobbi-kit/renderer/procedural';
import { PixelBuffer } from '../src/core/pixel';
import { hex, rgba } from '../src/core/color';
import { toPng } from '../src/node/png';
import { buildCanonicalSprite, stateForPose, CANONICAL_STANDING_HEIGHT, VIEWBOX_H } from '../src/blobbi/canonical';
import { resolveBlobbi } from '../src/blobbi/source';
import { REST_POSE, type BlobbiPose } from '../src/blobbi/pose';

const outDir = process.argv[2] ?? 'examples/fidelity';
const REF = 96;
const bg = hex('#78d04c');
const line = hex('#2b5e22');

function resvgAt(svg: string, standingPx: number): PixelBuffer {
  const png = PNG.sync.read(Buffer.from(new Resvg(svg, { fitTo: { mode: 'height', value: Math.round((VIEWBOX_H / CANONICAL_STANDING_HEIGHT) * standingPx) } }).render().asPng()));
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

const CELL_W = 128;
const CELL_H = 140;
const STRIP_W = 112;

/** One row: the kit reference and the game's three native sizes, enlarged and 1:1, standing on one ground line. */
function row(sheet: PixelBuffer, y0: number, genome: BlobbiGenome, pose: BlobbiPose): void {
  const ground = y0 + CELL_H - 8;
  const ref = buildCanonicalSprite(genome, pose, REF);
  const kit = resvgAt(renderBlobbiSvg(genome, stateForPose(pose), { idPrefix: 'k' }), REF);
  const ratio = kit.height / ref.buffer.height;
  blitOver(sheet, kit, Math.floor(CELL_W / 2) - Math.round(ref.anchorX * ratio), ground - Math.round(ref.anchorY * ratio));
  [12, 24, 48].forEach((size, i) => {
    const s = buildCanonicalSprite(genome, pose, size);
    const k = REF / size;
    sheet.blit(s.buffer.scaled(k), (i + 1) * CELL_W + Math.floor(CELL_W / 2) - s.anchorX * k, ground - s.anchorY * k);
    sheet.blit(s.buffer, 4 * CELL_W + [14, 40, 80][i] - s.anchorX, ground - s.anchorY);
  });
}

function sheetFor(rows: { genome: BlobbiGenome; pose: BlobbiPose }[]): PixelBuffer {
  const sheet = new PixelBuffer(4 * CELL_W + STRIP_W, rows.length * CELL_H);
  sheet.fill(bg);
  rows.forEach((r, i) => row(sheet, i * CELL_H, r.genome, r.pose));
  for (let i = 1; i < rows.length; i++) sheet.hline(0, sheet.width - 1, i * CELL_H, line);
  for (let c = 1; c <= 4; c++) sheet.vline(c * CELL_W, 0, sheet.height - 1, line);
  return sheet;
}

// Canonical V3 identities: synthetic owners (kit test-vector pubkeys), canonical d tags, the kit's derivation.
const OWNERS = ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'];
function address(owner: string, n: number) {
  const d = getCanonicalBlobbiD(owner, n.toString(16).padStart(10, '0'));
  const r = resolveBlobbi({ pubkey: owner, d });
  if (!r.ok) throw new Error(r.error);
  return { d, seed: r.source.seed, genome: generateGenome(r.source.seed) };
}
function findAddress(test: (g: BlobbiGenome) => boolean, from = 0) {
  for (let n = from; n < 5000; n++) {
    const a = address(OWNERS[n % 2], n);
    if (test(a.genome)) return a;
  }
  throw new Error('no address found');
}

const freckled = findAddress((g) => g.traits.freckles.enabled && g.traits.pattern.kind !== 'gradient');
const gradient = findAddress((g) => g.traits.pattern.kind === 'gradient' && !g.traits.freckles.enabled);
const both = findAddress((g) => g.traits.pattern.kind === 'gradient' && g.traits.freckles.enabled);
const belly = findAddress((g) => g.traits.belly.enabled && !g.traits.freckles.enabled && g.traits.pattern.kind !== 'gradient');
const traitRows = [
  { label: 'freckles, front', a: freckled, pose: REST_POSE },
  { label: 'freckles, side', a: freckled, pose: { ...REST_POSE, view: 'side' as const } },
  { label: 'gradient pattern, front', a: gradient, pose: REST_POSE },
  { label: 'gradient pattern, side', a: gradient, pose: { ...REST_POSE, view: 'side' as const } },
  { label: 'gradient + freckles, front', a: both, pose: REST_POSE },
  { label: 'gradient + freckles, happy', a: both, pose: { ...REST_POSE, expression: 'happy' as const } },
  { label: 'belly patch (soft edge), front', a: belly, pose: REST_POSE },
];
const v3Rows = Array.from({ length: 8 }, (_, n) => ({ a: address(OWNERS[n % 2], 0x3196847fb5 + n * 7919), pose: REST_POSE }));

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'traits-kit-vs-pixels.png'), toPng(sheetFor(traitRows.map((r) => ({ genome: r.a.genome, pose: r.pose })))));
writeFileSync(join(outDir, 'v3-identities-kit-vs-pixels.png'), toPng(sheetFor(v3Rows.map((r) => ({ genome: r.a.genome, pose: r.pose })))));

const describe = (g: BlobbiGenome) => {
  const t = g.traits;
  return [t.pattern.kind, t.freckles.enabled && 'freckles', t.belly.enabled && 'belly', t.antenna.count && `antenna ${t.antenna.count}`, t.horns.kind !== 'none' && `horns ${t.horns.kind}`, t.ears.kind !== 'none' && `ears ${t.ears.kind}`, t.tail.kind !== 'none' && `tail ${t.tail.kind}`, t.mark.kind !== 'none' && `mark ${t.mark.kind}`]
    .filter(Boolean)
    .join(', ');
};
console.log(`columns: kit SVG (resvg, ${REF} px) | game 12 px ×8 | game 24 px ×4 | game 48 px ×2 | game 12/24/48 at 1:1\n`);
console.log(`${outDir}/traits-kit-vs-pixels.png`);
traitRows.forEach((r, i) => console.log(`  row ${i + 1}: ${r.label}: d=${r.a.d} seed=${r.a.seed.slice(0, 12)}… (${describe(r.a.genome)})`));
console.log(`${outDir}/v3-identities-kit-vs-pixels.png`);
v3Rows.forEach((r, i) => console.log(`  row ${i + 1}: d=${r.a.d} seed=${r.a.seed.slice(0, 12)}… (${describe(r.a.genome)})`));
