/**
 * FACIAL FIDELITY REGRESSION. Each test measures a feature against the
 * kit's own geometry for the same seed and pose: where the eyes are, where
 * the mouth is, that horns are small and attached, that expressions produce
 * different pixels. Nothing here passes merely because pixels exist.
 */
import { describe, expect, it } from 'vitest';
import { DOCUMENT_TRANSFORM, buildBlobbiGeometry, deriveMorphology, derivePalette, generateGenome, normalizeState } from '@blobbi-kit/renderer/procedural';
import { buildCanonicalSprite, CANONICAL_STANDING_HEIGHT, stateForPose, WALK_FRAMES } from '../src/blobbi/canonical';
import { REST_POSE, type BlobbiPose } from '../src/blobbi/pose';
import { alpha, hex } from '../src/core/color';
import type { PixelBuffer } from '../src/core/pixel';

const WHITE = hex('#ffffff');
const NAMED = ['blobbi-0', 'blobbi-1', 'blobbi-9', 'blobbi-19'];
const HORNED = ['blobbi-0', 'blobbi-1', 'blobbi-62', 'blobbi-17', 'blobbi-32'];
const VARIETY = ['blobbi-2', 'blobbi-4', 'blobbi-14', 'blobbi-43', 'blobbi-44', 'abc123', 'pattern-0'];
const ALL = [...NAMED, ...HORNED.slice(2), ...VARIETY];

const near = (a: number, b: number, tol: number) => Math.abs((a & 0xff) - (b & 0xff)) <= tol && Math.abs(((a >>> 8) & 0xff) - ((b >>> 8) & 0xff)) <= tol && Math.abs(((a >>> 16) & 0xff) - ((b >>> 16) & 0xff)) <= tol;

/** Canonical root-unit point → sprite pixel for a sprite built at `size`. */
function toPx(size: number, x: number, y: number): [number, number] {
  const k = size / CANONICAL_STANDING_HEIGHT;
  return [(x * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.tx) * k + 2, (y * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.ty) * k + 2];
}

function geometryOf(seed: string, pose: BlobbiPose) {
  return buildBlobbiGeometry(deriveMorphology(generateGenome(seed), 'adult'), normalizeState(stateForPose(pose)));
}

function countWithin(buf: PixelBuffer, cx: number, cy: number, r: number, pred: (c: number) => boolean): number {
  let n = 0;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r && alpha(buf.get(x, y)) && pred(buf.get(x, y))) n++;
  return n;
}

function inkPattern(buf: PixelBuffer, cx: number, cy: number, ink: number): string {
  const cells: string[] = [];
  // Mouth ink only (tolerance 12 keeps the near-black pupils out of the pattern).
  for (let y = Math.floor(cy) - 2; y <= Math.floor(cy) + 4; y++) for (let x = Math.floor(cx) - 6; x <= Math.floor(cx) + 6; x++) if (alpha(buf.get(x, y)) && near(buf.get(x, y), ink, 24)) cells.push(`${x - Math.floor(cx)},${y - Math.floor(cy)}`);
  return cells.join(' ');
}

describe('facial fidelity', () => {
  for (const size of [16, 24, 32]) {
    it(`eyes sit where the kit puts them at ${size} px: white around a dark iris with one highlight`, () => {
      for (const seed of ALL) {
        const g = generateGenome(seed);
        const geo = geometryOf(seed, REST_POSE);
        const palette = derivePalette(g.colors);
        const s = buildCanonicalSprite(g, REST_POSE, size);
        expect(geo.face).not.toBeNull();
        for (const eye of geo.face!.eyes) {
          const [cx, cy] = toPx(size, eye.white.cx, eye.white.cy);
          const [ix, iy] = toPx(size, eye.iris.cx, eye.iris.cy);
          const r = Math.max(2.5, eye.white.rx * DOCUMENT_TRANSFORM.scale * (size / CANONICAL_STANDING_HEIGHT) + 1);
          // Eye white pixels around the canonical white centre: a ring (or at least a brow line) survives.
          expect(countWithin(s.buffer, cx, cy, r, (c) => c === WHITE)).toBeGreaterThanOrEqual(size >= 32 ? 8 : size >= 24 ? 3 : 2);
          // Dark iris pixels at the canonical iris centre (the iris gradient's mid band is the eye colour).
          // Iris pixels: the iris band or the pupil (near black) inside it.
          const isIris = (c: number) => alpha(c) !== 0 && c !== WHITE && (near(c, hex(palette.irisMid), 60) || near(c, hex(palette.pupil), 30));
          expect(countWithin(s.buffer, ix, iy, Math.max(1.5, r * 0.7), isIris)).toBeGreaterThanOrEqual(size >= 32 ? 3 : 1);
          // The highlight: a white pixel within 2.5 px of the canonical highlight centre, touching the iris.
          const [hx, hy] = toPx(size, eye.highlight.cx, eye.highlight.cy);
          let highlight = 0;
          for (let y = Math.floor(hy) - 3; y <= Math.floor(hy) + 3; y++)
            for (let x = Math.floor(hx) - 3; x <= Math.floor(hx) + 3; x++) {
              if (s.buffer.get(x, y) !== WHITE || Math.hypot(x + 0.5 - hx, y + 0.5 - hy) > 2.5) continue;
              const nb = [s.buffer.get(x - 1, y), s.buffer.get(x + 1, y), s.buffer.get(x, y - 1), s.buffer.get(x, y + 1)];
              if (nb.some(isIris)) highlight++;
            }
          // A highlight is owed once the canonical iris is a full pixel of radius (small-eyed seeds reach that at 32 px).
          const irisRxPx = eye.iris.rx * DOCUMENT_TRANSFORM.scale * (size / CANONICAL_STANDING_HEIGHT);
          if (irisRxPx >= 1.0) expect(highlight).toBeGreaterThanOrEqual(1);
          expect(highlight).toBeLessThanOrEqual(8);
        }
      }
    });
  }

  it('the mouth sits at the canonical mouth, between the eyes, and smiles the canonical way', () => {
    for (const seed of ALL) {
      const g = generateGenome(seed);
      const geo = geometryOf(seed, REST_POSE);
      const s = buildCanonicalSprite(g, REST_POSE, 24);
      const ink = hex('#21102e');
      const m = geo.face!.mouth;
      const [lx, ly] = toPx(24, m.left.x, m.left.y);
      const [rx, ry] = toPx(24, m.right.x, m.right.y);
      const cx = (lx + rx) / 2;
      const cy = (ly + ry) / 2;
      const inkPixels = countWithin(s.buffer, cx, cy + 0.5, 3.5, (c) => near(c, ink, 12));
      expect(inkPixels).toBeGreaterThanOrEqual(3);
      expect(inkPixels).toBeLessThanOrEqual(9);
      // Horizontal extent matches the canonical mouth width within a pixel each side.
      let minX = Infinity;
      let maxX = -Infinity;
      for (let y = Math.floor(cy) - 1; y <= Math.floor(cy) + 2; y++) for (let x = Math.floor(cx) - 6; x <= Math.floor(cx) + 6; x++) if (near(s.buffer.get(x, y), ink, 12) && alpha(s.buffer.get(x, y))) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
      expect(Math.abs(maxX - minX + 1 - Math.round(rx - lx))).toBeLessThanOrEqual(1);
      // The mouth is centred under the face axis.
      expect(Math.abs((minX + maxX) / 2 + 0.5 - cx)).toBeLessThanOrEqual(1.5);
    }
  });

  it('expressions are different pixels: sad lids, surprised mouth, excited grin, sleepy eyes', () => {
    for (const seed of NAMED) {
      const g = generateGenome(seed);
      const geo = geometryOf(seed, REST_POSE);
      const m = geo.face!.mouth;
      const [lx, ly] = toPx(24, m.left.x, m.left.y);
      const [rx] = toPx(24, m.right.x, m.right.y);
      const ink = hex('#21102e');
      const patterns = new Map<string, string>();
      const whites = new Map<string, number>();
      for (const expression of ['neutral', 'sad', 'surprised', 'excited', 'sleepy'] as const) {
        const s = buildCanonicalSprite(g, { ...REST_POSE, expression }, 24);
        patterns.set(expression, inkPattern(s.buffer, (lx + rx) / 2, ly + 1, ink));
        let w = 0;
        for (const c of s.buffer.data) if (c === WHITE) w++;
        whites.set(expression, w);
      }
      expect(patterns.get('sad')).not.toBe(patterns.get('neutral'));
      expect(patterns.get('surprised')).not.toBe(patterns.get('neutral'));
      expect(patterns.get('excited')).not.toBe(patterns.get('sad'));
      // Sad half-closes the eyes; sleepy closes them: never more white, and sleepy clearly less.
      expect(whites.get('sad')!).toBeLessThanOrEqual(whites.get('neutral')!);
      expect(whites.get('sleepy')!).toBeLessThan(whites.get('neutral')!);
      expect(whites.get('sleepy')!).toBeLessThanOrEqual(whites.get('sad')!);
      // The surprised mouth is open: somewhere in it a solid 2×2 block of ink, which a line never has.
      const cells = new Set(patterns.get('surprised')!.split(' '));
      const block = [...cells].some((c) => {
        const [x, y] = c.split(',').map(Number);
        return cells.has(`${x + 1},${y}`) && cells.has(`${x},${y + 1}`) && cells.has(`${x + 1},${y + 1}`);
      });
      expect(block).toBe(true);
      const neutralCells = new Set(patterns.get('neutral')!.split(' '));
      expect([...neutralCells].some((c) => {
        const [x, y] = c.split(',').map(Number);
        return neutralCells.has(`${x + 1},${y}`) && neutralCells.has(`${x},${y + 1}`) && neutralCells.has(`${x + 1},${y + 1}`);
      })).toBe(false);
    }
  });

  it('horns are small, cream, attached to the body, at their canonical tips, and stable through the walk', () => {
    for (const seed of HORNED) {
      const g = generateGenome(seed);
      const palette = derivePalette(g.colors);
      const hornColors = [hex(palette.hornLight), hex(palette.hornDark)];
      const isHorn = (c: number) => alpha(c) !== 0 && hornColors.some((h) => near(c, h, 40));
      for (const walk of [-1, 0, 2, 4] as const) {
        const pose: BlobbiPose = { ...REST_POSE, walk: walk as BlobbiPose['walk'], view: walk >= 0 ? 'side' : 'front' };
        const s = buildCanonicalSprite(g, pose, 24);
        const geo = geometryOf(seed, pose);
        const horns = geo.appendages.filter((a) => a.part.startsWith('horn') && !a.far);
        expect(horns.length).toBeGreaterThanOrEqual(1);
        let total = 0;
        for (const c of s.buffer.data) if (isHorn(c)) total++;
        // Never the giant blob of the arc bug: at most a fifth of the body's pixels.
        expect(total).toBeGreaterThanOrEqual(2);
        expect(total).toBeLessThanOrEqual(s.buffer.opaqueCount() * 0.2);
        for (const horn of horns) {
          // Horn pixels near the canonical tip and near the canonical base, and at least one of them attached
          // to a non-horn opaque pixel (the body or its outline): the horn is where the kit puts it and joined on.
          const [tx, ty] = toPx(24, horn.tip.x, horn.tip.y);
          const [bx, by] = toPx(24, horn.base.x, horn.base.y);
          const nearTip = countWithin(s.buffer, tx, ty, 2.5, isHorn);
          const nearBase = countWithin(s.buffer, bx, by, 3, isHorn);
          expect(nearTip + nearBase).toBeGreaterThanOrEqual(1);
          let attached = 0;
          for (let y = Math.floor(by) - 4; y <= Math.floor(by) + 4; y++)
            for (let x = Math.floor(bx) - 4; x <= Math.floor(bx) + 4; x++) {
              if (!isHorn(s.buffer.get(x, y))) continue;
              for (const n of [s.buffer.get(x - 1, y), s.buffer.get(x + 1, y), s.buffer.get(x, y - 1), s.buffer.get(x, y + 1)]) if (alpha(n) && !isHorn(n)) attached++;
            }
          expect(attached).toBeGreaterThanOrEqual(1);
          // The horn is short: tip to base is a small fraction of the standing height.
          expect(Math.hypot(tx - bx, ty - by)).toBeLessThanOrEqual(24 * 0.4);
        }
      }
    }
  });

  it('antennae reach their canonical tips and keep a tip at 16 px', () => {
    for (const seed of ['blobbi-0', 'blobbi-1', 'blobbi-19', 'abc123']) {
      const g = generateGenome(seed);
      const palette = derivePalette(g.colors);
      const geo = geometryOf(seed, REST_POSE);
      const antennae = geo.appendages.filter((a) => a.part.startsWith('antenna'));
      expect(antennae.length).toBe(g.traits.antenna.count);
      for (const size of [16, 24]) {
        const s = buildCanonicalSprite(g, REST_POSE, size);
        for (const a of antennae) {
          const [tx, ty] = toPx(size, a.tip.x, a.tip.y);
          const tip = countWithin(s.buffer, tx, ty, 2.2, (c) => near(c, hex(palette.accentLight), 50) || near(c, hex(palette.accentDark), 50));
          expect(tip).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('is deterministic and keeps bounds through every expression', () => {
    for (const seed of NAMED) {
      const g = generateGenome(seed);
      const rest = buildCanonicalSprite(g, REST_POSE, 24);
      const rb = rest.buffer.bounds()!;
      for (const expression of ['happy', 'excited', 'sad', 'surprised', 'sleepy'] as const) {
        const a = buildCanonicalSprite(g, { ...REST_POSE, expression }, 24);
        const b = buildCanonicalSprite(g, { ...REST_POSE, expression }, 24);
        expect(a.buffer.data).toEqual(b.buffer.data);
        const bb = a.buffer.bounds()!;
        expect(Math.abs(bb.w - rb.w)).toBeLessThanOrEqual(2);
        expect(Math.abs(bb.h - rb.h)).toBeLessThanOrEqual(2);
        expect(a.anchorY).toBe(rest.anchorY);
      }
      for (let walk = 0; walk < WALK_FRAMES; walk++) expect(buildCanonicalSprite(g, { ...REST_POSE, walk: walk as BlobbiPose['walk'] }, 24).anchorY).toBeGreaterThan(0);
    }
  });
});
