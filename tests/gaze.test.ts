/**
 * COHERENT GAZE. Both eyes must look the same way: for every gaze, seed and
 * size, the iris sits at the same offset inside each eye's pixel box, and a
 * glance moves both irises by the same whole pixels in the glance's
 * direction. Measured against the kit's own eye positions.
 */
import { describe, expect, it } from 'vitest';
import { DOCUMENT_TRANSFORM, buildBlobbiGeometry, deriveMorphology, derivePalette, generateGenome, normalizeState } from '@blobbi-kit/renderer/procedural';
import { buildCanonicalSprite, CANONICAL_STANDING_HEIGHT, gazeShiftFor, stateForPose } from '../src/blobbi/canonical';
import { BlobbiAnimator } from '../src/blobbi/animation';
import { REST_POSE, type BlobbiPose } from '../src/blobbi/pose';
import { alpha, hex } from '../src/core/color';
import type { PixelBuffer } from '../src/core/pixel';

const WHITE = hex('#ffffff');
const SEEDS = ['blobbi-0', 'blobbi-1', 'blobbi-9', 'blobbi-19', 'blobbi-43', 'blobbi-44', 'blobbi-62', 'abc123', 'pattern-0', 'horns-1'];
const near = (a: number, b: number, tol: number) => Math.abs((a & 0xff) - (b & 0xff)) <= tol && Math.abs(((a >>> 8) & 0xff) - ((b >>> 8) & 0xff)) <= tol && Math.abs(((a >>> 16) & 0xff) - ((b >>> 16) & 0xff)) <= tol;

function toPx(size: number, x: number, y: number): [number, number] {
  const k = size / CANONICAL_STANDING_HEIGHT;
  return [(x * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.tx) * k + 2, (y * DOCUMENT_TRANSFORM.scale + DOCUMENT_TRANSFORM.ty) * k + 2];
}

interface EyeMeasure {
  /** Centroid of all eye pixels (white, iris, pupil, highlight) within the canonical white. */
  eye: [number, number];
  /** Centroid of iris and pupil pixels. */
  iris: [number, number];
  irisCount: number;
}

/** Measure one eye: pixels within the canonical white radius, split into white and iris. */
function measureEye(buf: PixelBuffer, seed: string, size: number, eyeIndex: number, pose: BlobbiPose): EyeMeasure {
  const g = generateGenome(seed);
  const palette = derivePalette(g.colors);
  const geo = buildBlobbiGeometry(deriveMorphology(g, 'adult'), normalizeState(stateForPose(pose)));
  const eye = geo.face!.eyes[eyeIndex];
  const [cx, cy] = toPx(size, eye.white.cx, eye.white.cy);
  const k = size / CANONICAL_STANDING_HEIGHT;
  const r = eye.white.rx * DOCUMENT_TRANSFORM.scale * k + 1.5;
  const isIris = (c: number) => alpha(c) !== 0 && c !== WHITE && (near(c, hex(palette.irisMid), 60) || near(c, hex(palette.pupil), 30));
  let ex = 0;
  let ey = 0;
  let en = 0;
  let ix = 0;
  let iy = 0;
  let inn = 0;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
      const c = buf.get(x, y);
      if (!alpha(c)) continue;
      const white = c === WHITE;
      const iris = isIris(c);
      if (!white && !iris) continue;
      ex += x;
      ey += y;
      en++;
      if (iris) {
        ix += x;
        iy += y;
        inn++;
      }
    }
  return { eye: [ex / Math.max(1, en), ey / Math.max(1, en)], iris: [ix / Math.max(1, inn), iy / Math.max(1, inn)], irisCount: inn };
}

describe('coherent gaze', () => {
  it('both irises sit at the same offset inside their eyes, at rest and when glancing, at every size', () => {
    const failures: string[] = [];
    for (const seed of SEEDS)
      for (const size of [16, 24, 32])
        for (const gazeX of [-1, 0, 1] as const) {
          const pose: BlobbiPose = { ...REST_POSE, gazeX };
          const s = buildCanonicalSprite(generateGenome(seed), pose, size);
          const a = measureEye(s.buffer, seed, size, 0, pose);
          const b = measureEye(s.buffer, seed, size, 1, pose);
          if (a.irisCount === 0 || b.irisCount === 0) {
            failures.push(`${seed}@${size} gaze ${gazeX}: an eye has no iris`);
            continue;
          }
          const offA = [a.iris[0] - a.eye[0], a.iris[1] - a.eye[1]];
          const offB = [b.iris[0] - b.eye[0], b.iris[1] - b.eye[1]];
          // The two eyes agree on where the iris sits, within half a pixel (rasterization of the whites differs by a pixel at most).
          if (Math.abs(offA[0] - offB[0]) > 0.75 || Math.abs(offA[1] - offB[1]) > 0.75) failures.push(`${seed}@${size} gaze ${gazeX}: offsets differ ${offA.map((v) => v.toFixed(2))} vs ${offB.map((v) => v.toFixed(2))}`);
        }
    expect(failures).toEqual([]);
  });

  it('a glance moves both irises the same whole pixels in the glance direction', () => {
    for (const seed of SEEDS.slice(0, 6))
      for (const size of [16, 24, 32]) {
        const rest = buildCanonicalSprite(generateGenome(seed), REST_POSE, size);
        for (const gazeX of [-1, 1] as const) {
          const pose: BlobbiPose = { ...REST_POSE, gazeX };
          const s = buildCanonicalSprite(generateGenome(seed), pose, size);
          const shift = gazeShiftFor(pose, size);
          for (const eyeIndex of [0, 1]) {
            const r0 = measureEye(rest.buffer, seed, size, eyeIndex, REST_POSE);
            const r1 = measureEye(s.buffer, seed, size, eyeIndex, pose);
            const moved = r1.iris[0] - r0.iris[0];
            // Moves with the gaze (allowing the clamp at the white's edge to shorten it, never reverse it).
            expect(Math.sign(moved) === Math.sign(shift.dx) || moved === 0).toBe(true);
            expect(Math.abs(moved)).toBeLessThanOrEqual(Math.abs(shift.dx) + 0.5);
          }
          // And by the same amount for both eyes.
          const a = measureEye(s.buffer, seed, size, 0, pose).iris[0] - measureEye(rest.buffer, seed, size, 0, REST_POSE).iris[0];
          const b = measureEye(s.buffer, seed, size, 1, pose).iris[0] - measureEye(rest.buffer, seed, size, 1, REST_POSE).iris[0];
          expect(Math.abs(a - b)).toBeLessThanOrEqual(0.75);
        }
      }
  });

  it('the animator only ever asks for whole gaze steps, and walking clears a glance', () => {
    const a = new BlobbiAnimator('gaze-anim');
    const seen = new Set<number>();
    let t = 0;
    for (let i = 0; i < 60 * 30; i++) {
      a.step(1 / 60, t, { moving: false, direction: 'down' });
      seen.add(a.pose(t).gazeX);
      t += 1 / 60;
    }
    expect([...seen].every((g) => g === -1 || g === 0 || g === 1)).toBe(true);
    expect(seen.size).toBeGreaterThan(1); // it does glance
    a.step(1 / 60, t, { moving: true, direction: 'right' });
    expect(a.pose(t).gazeX).toBe(0);
  });
});
