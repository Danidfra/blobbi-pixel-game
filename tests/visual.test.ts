/**
 * Visual regression: a content hash of the rendered pixels for fixed seeds,
 * pinned in `__snapshots__/render-hashes.json`. A change in any generator
 * moves these; rewrite them on purpose with `UPDATE_SNAPSHOTS=1 npm test`,
 * after looking at `out/regression/*.png`.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/generate';
import { renderWorld } from '../src/render/compose';
import { toPng } from '../src/node/png';

const SNAP = new URL('./__snapshots__/render-hashes.json', import.meta.url);
const SEEDS = ['blobbi', 'pixel-lab', 'island-7', 'cove-0042', 'autumn:1'];

function fnv1a(data: Uint32Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    h ^= v & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (v >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

describe('visual regression', () => {
  const update = process.env.UPDATE_SNAPSHOTS === '1';
  const pinned: Record<string, string> = existsSync(SNAP) ? JSON.parse(readFileSync(SNAP, 'utf8')) : {};
  const current: Record<string, string> = {};
  for (const seed of SEEDS) {
    const palette = seed.startsWith('autumn') ? 'autumn' : 'cozy';
    const img = renderWorld(generateWorld(seed, { palette }));
    current[seed] = fnv1a(img.data);
    if (update || pinned[seed] !== current[seed]) {
      mkdirSync('out/regression', { recursive: true });
      writeFileSync(`out/regression/${seed.replace(/[^a-z0-9-]/gi, '_')}.png`, toPng(img.scaled(2)));
    }
  }
  if (update) writeFileSync(SNAP, `${JSON.stringify(current, null, 2)}\n`);

  it('matches the pinned render hashes (UPDATE_SNAPSHOTS=1 to re-pin after inspecting out/regression)', () => {
    if (update) return;
    expect(current).toEqual(pinned);
  });
});
