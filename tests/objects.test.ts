import { describe, expect, it } from 'vitest';
import { OBJECT_GENERATORS, type ObjectKind } from '../src/objects';
import { COZY, AUTUMN } from '../src/core/palette';
import { alpha } from '../src/core/color';
import { generateTree, CANOPY_KINDS, TRUNK_KINDS } from '../src/objects/tree';

const kinds = Object.keys(OBJECT_GENERATORS) as ObjectKind[];
const sizes: Record<ObjectKind, number[]> = {
  tree: [12, 18, 24, 32, 48, 64],
  bush: [6, 10, 16, 24, 32],
  flower: [3, 5, 7, 9],
  grass: [4],
  rock: [4, 8, 14, 20, 28],
  house: [16, 22, 28, 36, 40],
  bridge: [8, 20, 40],
  fence: [10, 20, 45],
  decor: [8],
};

describe('object generators', () => {
  for (const kind of kinds) {
    it(`${kind}: valid geometry across seeds and sizes`, () => {
      for (const size of sizes[kind]) {
        for (let i = 0; i < 12; i++) {
          const s = OBJECT_GENERATORS[kind]({ seed: `t-${kind}-${size}-${i}`, size, palette: COZY });
          expect(s.buffer.width).toBeGreaterThan(0);
          expect(s.buffer.height).toBeGreaterThan(0);
          expect(s.buffer.opaqueCount()).toBeGreaterThan(0);
          expect(() => s.buffer.validate()).not.toThrow();
          expect(s.anchorX).toBeGreaterThanOrEqual(0);
          expect(s.anchorX).toBeLessThan(s.buffer.width);
          expect(s.anchorY).toBeGreaterThanOrEqual(0);
          expect(s.anchorY).toBeLessThan(s.buffer.height);
          expect(Number.isFinite(s.footRx) && Number.isFinite(s.footRy)).toBe(true);
          // Nothing drawn too far outside its nominal size.
          expect(Math.max(s.buffer.width, s.buffer.height)).toBeLessThanOrEqual(Math.max(size, 8) * 2.2 + 8);
          // The ground anchor sits on or just above the lowest opaque row (standing objects).
          if (kind !== 'bridge') {
            const b = s.buffer.bounds()!;
            expect(Math.abs(b.y + b.h - 1 - s.anchorY)).toBeLessThanOrEqual(2);
          }
        }
      }
    });
    it(`${kind}: deterministic for a seed`, () => {
      const a = OBJECT_GENERATORS[kind]({ seed: 'same', size: sizes[kind][0], palette: COZY });
      const b = OBJECT_GENERATORS[kind]({ seed: 'same', size: sizes[kind][0], palette: COZY });
      expect(a.buffer.data).toEqual(b.buffer.data);
      expect([a.anchorX, a.anchorY]).toEqual([b.anchorX, b.anchorY]);
    });
  }

  it('trees vary in morphology, not only colour', () => {
    const canopies = new Set<string>();
    const trunks = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const t = generateTree({ seed: `morph-${i}`, size: 28, palette: COZY });
      canopies.add(t.variation.canopy);
      trunks.add(t.variation.trunk);
    }
    expect(canopies.size).toBe(CANOPY_KINDS.length);
    expect(trunks.size).toBe(TRUNK_KINDS.length);
  });

  it('every tree has an outline: all opaque edge pixels are the outline colour of their ramp', () => {
    for (let i = 0; i < 20; i++) {
      const t = generateTree({ seed: `outline-${i}`, size: 30, palette: COZY });
      const outlines = new Set([...COZY.foliage.map((r) => r.outline), ...COZY.trunk.map((r) => r.outline)]);
      const edge = t.buffer.opaqueMask().edge();
      let bad = 0;
      let total = 0;
      for (let y = 0; y < edge.height; y++)
        for (let x = 0; x < edge.width; x++)
          if (edge.get(x, y)) {
            total++;
            if (!outlines.has(t.buffer.get(x, y))) bad++;
          }
      // Fruit/blossom dots and root flares may sit on the edge; allow a small share.
      expect(bad / total).toBeLessThan(0.08);
    }
  });

  it('the palette is a parameter: the same seed in another palette keeps its shape', () => {
    const a = generateTree({ seed: 'pal', size: 30, palette: COZY });
    const b = generateTree({ seed: 'pal', size: 30, palette: AUTUMN });
    expect(a.variation).toEqual(b.variation);
    for (let i = 0; i < a.buffer.data.length; i++) expect(alpha(a.buffer.data[i]) !== 0).toBe(alpha(b.buffer.data[i]) !== 0);
  });

  it('explicit variation overrides the seed', () => {
    const t = generateTree({ seed: 'forced', size: 30, palette: COZY, variation: { canopy: 'pine', trunk: 'thick' } });
    expect(t.variation.canopy).toBe('pine');
    expect(t.variation.trunk).toBe('thick');
  });
});
