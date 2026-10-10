import { describe, expect, it } from 'vitest';
import { createRng, hashSeed, stream } from '../src/core/rng';
import { createNoise } from '../src/core/noise';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng('x');
    const b = createRng('x');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('keyed streams are independent of each other and of draw order', () => {
    const treeThenRock = [stream('s', 'tree').next(), stream('s', 'rock').next()];
    const rockThenTree = [stream('s', 'rock').next(), stream('s', 'tree').next()].reverse();
    expect(treeThenRock).toEqual(rockThenTree);
    expect(stream('s', 'tree').next()).not.toBe(stream('s', 'rock').next());
  });
  it('produces values in range and never NaN', () => {
    const r = createRng('range');
    for (let i = 0; i < 2000; i++) {
      const v = r.range(-3, 7);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(7);
      const n = r.int(2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
      expect(Number.isFinite(r.centered())).toBe(true);
    }
  });
  it('weighted pick respects zero weights', () => {
    const r = createRng('w');
    for (let i = 0; i < 200; i++) expect(r.weighted(['a', 'b', 'c'], [0, 1, 0])).toBe('b');
  });
  it('hashSeed differs for close strings', () => {
    expect(hashSeed('seed-1')).not.toEqual(hashSeed('seed-2'));
  });
  it('noise is deterministic, bounded and smooth', () => {
    const n1 = createNoise('n', 20);
    const n2 = createNoise('n', 20);
    for (let i = 0; i < 200; i++) {
      const v = n1.fbm(i * 1.7, i * 0.3, 3);
      expect(v).toBe(n2.fbm(i * 1.7, i * 0.3, 3));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // Neighbouring samples differ little: no thresholded noise could look smooth otherwise.
    expect(Math.abs(n1.at(10, 10) - n1.at(10.5, 10))).toBeLessThan(0.1);
  });
});
