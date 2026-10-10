/**
 * Deterministic, seeded randomness: the only source of variation in the lab.
 * Nothing here or downstream calls `Math.random()` or reads a clock.
 *
 * Same design as blobbi-kit's V3 engine (`procedural/rng.ts`):
 *  - PURE INTEGER MATH (`Math.imul`, 32-bit shifts) so every engine agrees.
 *  - KEYED STREAMS. `stream(seed, 'terrain', 'island', 2)` is its own
 *    generator. Adding a new decoration draws from a new key and never moves
 *    the values any existing feature draws. That is what makes a seed stable
 *    while the generators grow.
 */

/** cyrb128: four well-mixed 32-bit words from a string. */
export function hashSeed(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** One 32-bit hash of a string; for cheap per-cell decisions. */
export function hash32(str: string): number {
  return hashSeed(str)[0];
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** Triangular in [-1, 1], concentrated around 0. */
  centered(): number;
  pick<T>(items: readonly T[]): T;
  /** Weighted pick: `weights[i]` is the relative weight of `items[i]`. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
  /** A new, independent stream derived from this one's seed and a key. */
  fork(...keys: readonly (string | number)[]): Rng;
  /** Fisher-Yates shuffle, returns a new array. */
  shuffle<T>(items: readonly T[]): T[];
}

/** sfc32 over a hashed seed: small, fast, 32-bit only. */
export function createRng(seed: string): Rng {
  let [a, b, c, d] = hashSeed(seed);
  const next = (): number => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  const rng: Rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    centered: () => next() + next() - 1,
    pick: (items) => items[Math.floor(next() * items.length)],
    weighted: (items, weights) => {
      let total = 0;
      for (const w of weights) total += w;
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r < 0) return items[i];
      }
      return items[items.length - 1];
    },
    fork: (...keys) => stream(seed, ...keys),
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = out[i];
        out[i] = out[j];
        out[j] = t;
      }
      return out;
    },
  };
  return rng;
}

/** The stream that belongs to one named feature of one seed. */
export function stream(seed: string, ...keys: readonly (string | number)[]): Rng {
  return createRng(`${seed}\u0000${keys.join('\u0000')}`);
}

/** A sub-seed string for handing to an object generator (keeps streams keyed, not chained). */
export function subSeed(seed: string, ...keys: readonly (string | number)[]): string {
  return `${seed}/${keys.join('/')}`;
}
