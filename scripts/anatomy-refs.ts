/**
 * VARIANT 0 REFERENCES: the approved turtle anatomy, captured as images and pixel hashes.
 * Head (neutral, blink, left, right glance), the four flippers, and the neck/tail region of the body,
 * for several turtle seeds. `tests/turtle-anatomy.test.ts` asserts these never change.
 *   npx tsx scripts/anatomy-refs.ts [write-hashes]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateTurtleGenome, turtleAnatomy, renderTurtleBody } from '../src/turtle/turtle';
import { PixelBuffer } from '../src/core/pixel';
import { hex } from '../src/core/color';
import { toPng } from '../src/node/png';

export const ANATOMY_SEEDS = ['turtle-0', 'turtle-1', 'turtle-2', 'turtle-3', 'turtle-4', 'turtle-5'];

export function fnv(data: Uint32Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i] & 0xffff;
    h = Math.imul(h, 0x01000193);
    h ^= data[i] >>> 16;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Crop a region of the body buffer (neck and tail live there). */
function crop(src: PixelBuffer, x0: number, y0: number, w: number, h: number): PixelBuffer {
  const c = new PixelBuffer(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) c.data[y * w + x] = src.get(x0 + x, y0 + y);
  return c;
}

export function anatomyHashes(seed: string): Record<string, string> {
  const a = turtleAnatomy(generateTurtleGenome(seed), 704, 480, 1.6);
  const body = renderTurtleBody(a);
  const neck = crop(body.buffer, Math.floor(a.neck.x0) - 2, Math.floor(a.neck.y0), Math.ceil(a.neck.x1 - a.neck.x0) + 4, Math.ceil(a.neck.y1 - a.neck.y0) + 1);
  const tail = crop(body.buffer, Math.floor(a.tail.cx - a.tail.width), Math.floor(a.tail.cy - a.tail.length) - 1, Math.ceil(a.tail.width * 2) + 1, Math.ceil(a.tail.length) + 2);
  const out: Record<string, string> = {
    head: fnv(body.head.buffer.data),
    blink: fnv(body.head.blink.data),
    left: fnv(body.head.left.data),
    right: fnv(body.head.right.data),
    neck: fnv(neck.data),
    tail: fnv(tail.data),
  };
  body.flippers.forEach((f, i) => (out[`flipper${i}`] = fnv(f.buffer.data)));
  return out;
}

if (process.argv[1]?.endsWith('anatomy-refs.ts')) {
  const dir = 'examples/turtle/anatomy';
  mkdirSync(dir, { recursive: true });
  const all: Record<string, Record<string, string>> = {};
  for (const seed of ANATOMY_SEEDS) {
    const a = turtleAnatomy(generateTurtleGenome(seed), 704, 480, 1.6);
    const body = renderTurtleBody(a);
    // One sheet per seed: head variants in a row, flippers below.
    const cell = Math.max(body.head.buffer.width, ...body.flippers.map((f) => f.buffer.width)) + 4;
    const sheet = new PixelBuffer(cell * 4, cell * 2);
    sheet.fill(hex('#3d7fe0'));
    [body.head.buffer, body.head.blink, body.head.left, body.head.right].forEach((b, i) => sheet.blit(b, i * cell + 2, 2));
    body.flippers.forEach((f, i) => sheet.blit(f.buffer, i * cell + 2, cell + 2));
    writeFileSync(`${dir}/${seed}-anatomy.png`, toPng(sheet.scaled(3)));
    all[seed] = anatomyHashes(seed);
  }
  if (process.argv[2] === 'write-hashes') writeFileSync('tests/__snapshots__/turtle-anatomy-hashes.json', `${JSON.stringify(all, null, 2)}\n`);
  console.log(`wrote anatomy references for ${ANATOMY_SEEDS.length} seeds${process.argv[2] === 'write-hashes' ? ' and pinned their hashes' : ''}`);
}
