/**
 * Fidelity regression: the canonical pixel Blobbi must stay the kit's
 * Blobbi. These tests pin determinism, bounds under animation, direction
 * handling, the presence of anatomy at gameplay size, scale, and that the
 * gallery and the game draw through the very same function. Pixel hashes
 * for fixed seeds and poses are pinned in `__snapshots__/blobbi-hashes.json`
 * (`UPDATE_SNAPSHOTS=1 npm test` re-pins, after looking at the sheets).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateGenome, derivePalette } from '@blobbi-kit/renderer/procedural';
import { blobbiIdentity } from '../src/blobbi/identity';
import { buildBlobbiSprite, buildNativeSprite, REST_POSE, type BlobbiPose } from '../src/blobbi/sprite';
import { buildCanonicalSprite, CANONICAL_STANDING_HEIGHT, WALK_FRAMES, stateForPose } from '../src/blobbi/canonical';
import { rasterizeSvg } from '../src/blobbi/svg-raster';
import { generateWorld } from '../src/world/generate';
import { LiveWorld } from '../src/sim/live-world';
import { alpha, hex } from '../src/core/color';
import type { PixelBuffer } from '../src/core/pixel';

const SEEDS = ['abc123', 'pattern-0', 'horns-1', 'ears-2', 'tail-3', 'blobbi'];
const SNAP = new URL('./__snapshots__/blobbi-hashes.json', import.meta.url);

function fnv(data: Uint32Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i] & 0xffff;
    h = Math.imul(h, 0x01000193);
    h ^= data[i] >>> 16;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const count = (buf: PixelBuffer, pred: (c: number) => boolean) => {
  let n = 0;
  for (const c of buf.data) if (alpha(c) && pred(c)) n++;
  return n;
};
const near = (a: number, b: number, tol: number) => Math.abs((a & 0xff) - (b & 0xff)) <= tol && Math.abs(((a >>> 8) & 0xff) - ((b >>> 8) & 0xff)) <= tol && Math.abs(((a >>> 16) & 0xff) - ((b >>> 16) & 0xff)) <= tol;

describe('canonical pixel blobbi', () => {
  it('is deterministic for a seed, pose and size', () => {
    for (const seed of SEEDS) {
      const g = generateGenome(seed);
      const a = buildCanonicalSprite(g, REST_POSE, 24);
      const b = buildCanonicalSprite(g, REST_POSE, 24);
      expect(a.buffer.data).toEqual(b.buffer.data);
      expect([a.anchorX, a.anchorY, a.footRx]).toEqual([b.anchorX, b.anchorY, b.footRx]);
    }
  });

  it('stands at the requested height: the sprite is the size asked for, at every size', () => {
    for (const size of [12, 16, 20, 24, 32, 48]) {
      for (const seed of SEEDS.slice(0, 3)) {
        const s = buildCanonicalSprite(generateGenome(seed), REST_POSE, size, { outline: false });
        const b = s.buffer.bounds()!;
        // Ground (anchor) to the crown, tuft and antennae excluded, is within 20% of the nominal height;
        // the whole drawing (tuft, antennae) is at most 1.5x.
        const standing = s.anchorY - b.y;
        expect(standing).toBeGreaterThanOrEqual(size * 0.85);
        expect(standing).toBeLessThanOrEqual(size * 1.5);
        expect(b.h).toBeLessThanOrEqual(size * 1.55 + 2);
      }
    }
    expect(CANONICAL_STANDING_HEIGHT).toBeGreaterThan(150);
  });

  it('keeps stable bounds through the walk cycle and breathing: no popping, no size jumps', () => {
    for (const seed of SEEDS) {
      const g = generateGenome(seed);
      for (const view of ['front', 'side', 'back'] as const) {
        const rest = buildCanonicalSprite(g, { ...REST_POSE, view }, 20);
        const rb = rest.buffer.bounds()!;
        for (let walk = 0; walk < WALK_FRAMES; walk++) {
          const s = buildCanonicalSprite(g, { ...REST_POSE, view, walk: walk as BlobbiPose['walk'] }, 20);
          const b = s.buffer.bounds()!;
          expect(Math.abs(b.h - rb.h)).toBeLessThanOrEqual(3);
          expect(Math.abs(b.w - rb.w)).toBeLessThanOrEqual(4);
          expect(Math.abs(s.anchorY - rest.anchorY)).toBeLessThanOrEqual(2);
          expect(Math.abs(s.buffer.opaqueCount() - rest.buffer.opaqueCount()) / rest.buffer.opaqueCount()).toBeLessThan(0.2);
        }
        const breath = buildCanonicalSprite(g, { ...REST_POSE, view, breath: 1 }, 20);
        expect(Math.abs(breath.buffer.bounds()!.h - rb.h)).toBeLessThanOrEqual(2);
      }
    }
  });

  it('handles directions: left mirrors right, front and back share a silhouette, the face is only on front and side', () => {
    const white = hex('#ffffff');
    for (const seed of SEEDS) {
      const g = generateGenome(seed);
      const front = buildCanonicalSprite(g, { ...REST_POSE, view: 'front' }, 24);
      const back = buildCanonicalSprite(g, { ...REST_POSE, view: 'back' }, 24);
      const right = buildCanonicalSprite(g, { ...REST_POSE, view: 'side', facing: 1 }, 24);
      const left = buildCanonicalSprite(g, { ...REST_POSE, view: 'side', facing: -1 }, 24);
      const fb = front.buffer.bounds()!;
      const bb = back.buffer.bounds()!;
      expect(Math.abs(fb.h - bb.h)).toBeLessThanOrEqual(2);
      expect(Math.abs(fb.w - bb.w)).toBeLessThanOrEqual(3);
      // Eye whites: present facing the viewer, absent from behind.
      expect(count(front.buffer, (c) => c === white)).toBeGreaterThan(4);
      expect(count(right.buffer, (c) => c === white)).toBeGreaterThan(2);
      expect(count(back.buffer, (c) => c === white)).toBe(0);
      // The profile is narrower than the front and the same height.
      const rb = right.buffer.bounds()!;
      expect(rb.w).toBeLessThan(fb.w);
      expect(Math.abs(rb.h - fb.h)).toBeLessThanOrEqual(3);
      // Left is the mirror of right in silhouette.
      const rm = right.buffer.opaqueMask();
      const lm = left.buffer.opaqueMask();
      let mismatch = 0;
      for (let y = 0; y < rm.height; y++) for (let x = 0; x < rm.width; x++) if (rm.get(x, y) !== lm.get(rm.width - 1 - x, y)) mismatch++;
      expect(mismatch / rm.count()).toBeLessThan(0.15);
    }
  });

  it('keeps the anatomy at gameplay size (16 px): eyes, mouth, feet, cheeks, antenna tip, markings, mark', () => {
    for (const seed of SEEDS) {
      const g = generateGenome(seed);
      const id = blobbiIdentity(seed);
      const palette = derivePalette(g.colors);
      const s = buildCanonicalSprite(g, REST_POSE, 16);
      const white = hex('#ffffff');
      expect(count(s.buffer, (c) => c === white)).toBeGreaterThanOrEqual(2); // eye whites and highlights
      expect(count(s.buffer, (c) => near(c, hex(palette.pupil), 24) || near(c, hex('#21102e'), 20))).toBeGreaterThanOrEqual(1); // mouth ink or a pupil
      expect(count(s.buffer, (c) => near(c, hex(palette.cheek), 70))).toBeGreaterThanOrEqual(1); // blush, composited
      if (id.antenna.count > 0) {
        const tip = hex(palette.accentLight);
        const tip2 = hex(palette.accentDark);
        expect(count(s.buffer, (c) => near(c, tip, 40) || near(c, tip2, 40))).toBeGreaterThanOrEqual(1);
      }
      if (id.pattern.kind === 'striped' || id.pattern.kind === 'spotted') {
        const back = buildCanonicalSprite(g, { ...REST_POSE, view: 'back' }, 16);
        const marking = hex(palette.marking);
        // Markings are composited at 80%: look for pixels pulled toward the marking colour.
        const bodyMid = hex(palette.bodyMid);
        expect(count(back.buffer, (c) => !near(c, bodyMid, 10) && near(c, marking, 90))).toBeGreaterThanOrEqual(2);
      }
      // Feet: the lowest rows hold paint under the body on both halves.
      const b = s.buffer.bounds()!;
      let lowLeft = 0;
      let lowRight = 0;
      for (let y = b.y + b.h - 3; y < b.y + b.h; y++)
        for (let x = b.x; x < b.x + b.w; x++)
          if (alpha(s.buffer.get(x, y))) {
            if (x < s.anchorX) lowLeft++;
            else lowRight++;
          }
      expect(lowLeft).toBeGreaterThan(0);
      expect(lowRight).toBeGreaterThan(0);
    }
  });

  it('expressions and lids change the face only; blinking never changes the silhouette', () => {
    const g = generateGenome('pattern-0');
    const rest = buildCanonicalSprite(g, REST_POSE, 24);
    for (const expression of ['happy', 'excited', 'sad', 'surprised', 'sleepy'] as const) {
      const s = buildCanonicalSprite(g, { ...REST_POSE, expression }, 24);
      expect(s.buffer.data).not.toEqual(rest.buffer.data);
      let changed = 0;
      for (let i = 0; i < s.buffer.data.length; i++) if (s.buffer.data[i] !== rest.buffer.data[i]) changed++;
      expect(changed / rest.buffer.opaqueCount()).toBeLessThan(0.35);
    }
    const blink = buildCanonicalSprite(g, { ...REST_POSE, lid: 2 }, 24);
    expect(blink.buffer.opaqueMask().data).toEqual(rest.buffer.opaqueMask().data);
  });

  it('the gallery and the game draw through one function: a live world sprite equals a direct build', () => {
    const world = generateWorld('one-renderer', { width: 448, height: 288, scale: 1 });
    const live = new LiveWorld(world, 'abc123', 16);
    const pose = { ...REST_POSE, view: 'side' as const, walk: 2 as const };
    const fromGame = live.blobbiSprite(pose);
    const direct = buildBlobbiSprite(blobbiIdentity('abc123'), pose, 16);
    expect(fromGame.buffer.data).toEqual(direct.buffer.data);
    expect(fromGame.anchorY).toBe(direct.anchorY);
  });

  it('is the kit\'s drawing: the pose maps onto the kit state exactly', () => {
    expect(stateForPose({ ...REST_POSE, lid: 2 })).toMatchObject({ sleeping: true, motion: 'still' });
    expect(stateForPose({ ...REST_POSE, lid: 1 })).toMatchObject({ face: { eyes: 'half' } });
    expect(stateForPose({ ...REST_POSE, walk: 3 })).toMatchObject({ motion: 'walking', phase: 3 / WALK_FRAMES });
    expect(stateForPose({ ...REST_POSE, breath: 1 })).toMatchObject({ motion: 'idle', phase: 0.5 });
    expect(stateForPose({ ...REST_POSE, view: 'side', facing: -1, expression: 'happy' })).toMatchObject({ view: 'side', direction: 'left', expression: { happy: 1 } });
  });

  it('the native sprite is still available for comparison and differs from the canonical one', () => {
    const id = blobbiIdentity('abc123');
    const a = buildNativeSprite(id, REST_POSE, 24);
    const b = buildBlobbiSprite(id, REST_POSE, 24);
    expect(a.buffer.opaqueCount()).toBeGreaterThan(0);
    expect(a.buffer.data).not.toEqual(b.buffer.data);
  });

  it('the rasterizer paints a minimal SVG crisply and fails loudly on unknown transforms', () => {
    const svg = '<svg viewBox="0 0 10 10"><g transform="translate(1 1)"><ellipse cx="4" cy="4" rx="3" ry="3" fill="#ff0000"/><path d="M 0 0 L 8 0 L 8 1 Z" fill="#00ff00" opacity="0.5"/></g></svg>';
    const buf = rasterizeSvg(svg, { scale: 2, offsetX: 0, offsetY: 0, width: 20, height: 20 });
    expect(count(buf, (c) => c === hex('#ff0000'))).toBeGreaterThan(50);
    expect(() => rasterizeSvg('<svg viewBox="0 0 1 1"><g transform="skewX(3)"><ellipse cx="0" cy="0" rx="1" ry="1" fill="#000"/></g></svg>', { scale: 1, offsetX: 0, offsetY: 0, width: 4, height: 4 })).toThrow();
  });

  it('matches the pinned sprite hashes (UPDATE_SNAPSHOTS=1 to re-pin after inspecting the sheets)', () => {
    const update = process.env.UPDATE_SNAPSHOTS === '1';
    const pinned: Record<string, string> = existsSync(SNAP) ? JSON.parse(readFileSync(SNAP, 'utf8')) : {};
    const current: Record<string, string> = {};
    const poses: [string, BlobbiPose][] = [
      ['front', REST_POSE],
      ['happy', { ...REST_POSE, expression: 'happy' }],
      ['side-walk2', { ...REST_POSE, view: 'side', walk: 2 }],
      ['back', { ...REST_POSE, view: 'back' }],
    ];
    for (const seed of SEEDS.slice(0, 4))
      for (const [label, pose] of poses)
        for (const size of [16, 24]) {
          const s = buildBlobbiSprite(blobbiIdentity(seed), pose, size);
          current[`${seed}/${label}/${size}`] = fnv(s.buffer.data);
        }
    if (update) writeFileSync(SNAP, `${JSON.stringify(current, null, 2)}\n`);
    else expect(current).toEqual(pinned);
  });
});
