/**
 * Render a sheet of pixel Blobbis: rows are seeds, columns are views and
 * poses, at one size. `npx tsx scripts/blobbi-sheet.ts out/blobbi.png 24 4`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';
import { blobbiIdentity } from '../src/blobbi/identity';
import { buildBlobbiSprite, REST_POSE, type BlobbiPose } from '../src/blobbi/sprite';

const out = process.argv[2] ?? 'out/blobbi.png';
const size = Number(process.argv[3] ?? 24);
const scale = Number(process.argv[4] ?? 4);
const seeds = (process.argv[5] ?? 'abc123,pattern-0,horns-1,ears-2,tail-3,blobbi,horn-top,horn-side,pointy,cove-0042').split(',');
const maxColumns = Number(process.argv[6] ?? 99);
const allColumns: Partial<BlobbiPose>[] = [
  { view: 'front' },
  { view: 'side', facing: 1 },
  { view: 'back' },
  { view: 'side', facing: -1 },
  { view: 'front', expression: 'happy' },
  { view: 'front', expression: 'excited' },
  { view: 'front', expression: 'sad' },
  { view: 'front', expression: 'surprised' },
  { view: 'front', lid: 2 },
  { view: 'front', breath: 1 },
  { view: 'side', facing: 1, walk: 1 },
  { view: 'side', facing: 1, walk: 4 },
  { view: 'front', walk: 1 },
];
const columns = allColumns.slice(0, maxColumns);
const cell = Math.round(size * 1.9) + 6;
const sheet = new PixelBuffer(columns.length * cell, seeds.length * cell);
sheet.fill(hex('#78d04c'));
seeds.forEach((seed, row) => {
  const id = blobbiIdentity(seed);
  columns.forEach((col, c) => {
    const sprite = buildBlobbiSprite(id, { ...REST_POSE, ...col }, size);
    const gx = c * cell + Math.floor(cell / 2);
    const gy = row * cell + cell - 5;
    sheet.fillEllipse(gx + 0.5, gy + 0.5, sprite.footRx + 1, sprite.footRy, hex('#55a83a'));
    sheet.blit(sprite.buffer, gx - sprite.anchorX, gy - sprite.anchorY);
  });
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, toPng(sheet.scaled(scale)));
console.log(`wrote ${out}`);
