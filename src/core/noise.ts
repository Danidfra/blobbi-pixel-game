/**
 * Deterministic 2D value noise and fractal sums, seeded by a keyed stream.
 * Used sparingly, as a modulation on art-directed shapes, never as the shape.
 */
import { hashSeed } from './rng';

export interface Noise2D {
  /** Smooth value noise in [0, 1] with lattice period `scale` pixels. */
  at(x: number, y: number): number;
  /** Fractal Brownian motion in [0, 1]. */
  fbm(x: number, y: number, octaves: number, lacunarity?: number, gain?: number): number;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export function createNoise(seed: string, scale: number): Noise2D {
  const [s1, s2] = hashSeed(seed);
  // Lattice hash: integer coordinates → [0, 1). Pure 32-bit integer math.
  const lattice = (ix: number, iy: number): number => {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ s1;
    h = Math.imul(h ^ (h >>> 13), 1274126177) ^ s2;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const value = (x: number, y: number, period: number): number => {
    const fx = x / period;
    const fy = y / period;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fade(fx - x0);
    const ty = fade(fy - y0);
    const a = lattice(x0, y0);
    const b = lattice(x0 + 1, y0);
    const c = lattice(x0, y0 + 1);
    const d = lattice(x0 + 1, y0 + 1);
    const top = a + (b - a) * tx;
    const bottom = c + (d - c) * tx;
    return top + (bottom - top) * ty;
  };
  return {
    at: (x, y) => value(x, y, scale),
    fbm: (x, y, octaves, lacunarity = 2, gain = 0.5) => {
      let sum = 0;
      let amp = 1;
      let norm = 0;
      let period = scale;
      for (let i = 0; i < octaves; i++) {
        sum += value(x + i * 17.3, y - i * 11.7, period) * amp;
        norm += amp;
        amp *= gain;
        period /= lacunarity;
      }
      return sum / norm;
    },
  };
}
