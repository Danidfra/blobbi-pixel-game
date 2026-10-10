import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ANATOMY_SEEDS, anatomyHashes, fnv } from '../scripts/anatomy-refs';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { turtleBodyForWorld } from '../src/render/compose';
import { SHELL_VARIANTS, type ShellVariant } from '../src/carrier/types';

const pinned = JSON.parse(readFileSync('tests/__snapshots__/turtle-anatomy-hashes.json', 'utf8')) as Record<string, Record<string, string>>;

describe('preserved anatomy (Variant 0 references)', () => {
  it('head, blink, glances, neck, tail and flippers of the M1 turtle are pixel-identical to the baseline', () => {
    for (const seed of ANATOMY_SEEDS) expect(anatomyHashes(seed)).toEqual(pinned[seed]);
  });

  it('every shell variant draws the same head, expressions and flippers, only elsewhere', () => {
    for (const seed of ANATOMY_SEEDS.slice(0, 4)) {
      const ref = pinned[seed];
      const base = generateTurtleWorld(seed, { shellVariant: 0 });
      const baseBody = turtleBodyForWorld(base);
      for (const v of SHELL_VARIANTS) {
        if (v.id === 0) continue;
        const world = generateTurtleWorld(seed, { shellVariant: v.id as ShellVariant });
        const body = turtleBodyForWorld(world);
        expect(fnv(body.head.buffer.data)).toBe(ref.head);
        expect(fnv(body.head.blink.data)).toBe(ref.blink);
        expect(fnv(body.head.left.data)).toBe(ref.left);
        expect(fnv(body.head.right.data)).toBe(ref.right);
        body.flippers.forEach((f, i) => {
          expect(fnv(f.buffer.data)).toBe(ref[`flipper${i}`]);
          expect(f.axis).toEqual(baseBody.flippers[i].axis);
        });
        // Only positions changed: the head and every flipper moved by whole pixels, the head still centred under the shell.
        const a = world.turtle!;
        const b = base.turtle!;
        expect(a.head.rx).toBe(b.head.rx);
        expect(a.head.ry).toBe(b.head.ry);
        expect(a.head.cx).toBe(b.head.cx);
        expect(Number.isInteger(body.head.y - baseBody.head.y)).toBe(true);
        expect(a.neck.x1 - a.neck.x0).toBeCloseTo(b.neck.x1 - b.neck.x0, 9);
        expect(a.neck.y1 - a.neck.y0).toBeCloseTo(b.neck.y1 - b.neck.y0, 9);
        expect(a.tail.length).toBe(b.tail.length);
        expect(a.tail.width).toBe(b.tail.width);
        a.flippers.forEach((f, i) => {
          expect(f.rx).toBe(b.flippers[i].rx);
          expect(f.ry).toBe(b.flippers[i].ry);
          expect(f.angle).toBe(b.flippers[i].angle);
        });
        // The visible neck (below the shell's edge) and the tail (above it) keep their lengths.
        expect(a.head.cy - (a.cy + a.ry) - (b.head.cy - (b.cy + b.ry))).toBeLessThanOrEqual(1.5 + Math.abs(a.ry - b.ry) * 0.07);
      }
    }
  });
});
