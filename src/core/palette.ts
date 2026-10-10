/**
 * THE SHARED PALETTE. Every object and terrain band paints from a Ramp: five
 * shades from outline to highlight. Ramps are derived from one base colour
 * with the classic pixel-art rule: shadows go darker AND cooler (hue toward
 * blue/purple), highlights lighter AND warmer (hue toward yellow). Because
 * every ramp follows the same rule and the same five steps, trees, rocks,
 * houses and water read as one style.
 */
import { type Color, hex, shift, toOklch } from './color';

export interface Ramp {
  outline: Color;
  dark: Color;
  mid: Color;
  light: Color;
  highlight: Color;
}

export type Shade = keyof Ramp;
export const SHADES: readonly Shade[] = ['outline', 'dark', 'mid', 'light', 'highlight'];

export interface RampOptions {
  /** Lightness step between neighbouring shades (OKLCH L). */
  step?: number;
  /** How far the outline sits below `dark`. */
  outlineStep?: number;
  /** Degrees of hue rotation per step toward the shadow side (positive = toward blue for warm hues). */
  hueShift?: number;
  /** Chroma multiplier applied per step going darker (>1 saturates shadows). */
  darkChroma?: number;
  /** Chroma multiplier applied per step going lighter. */
  lightChroma?: number;
}

/**
 * Build a five-shade ramp around a mid colour. The hue shift direction is
 * chosen per hue: shadows of greens/yellows/oranges rotate toward blue
 * (clockwise in OKLCH as hue decreases toward 260), shadows of blues and
 * purples rotate toward deeper blue, highlights the opposite way.
 */
export function ramp(mid: Color, opts: RampOptions = {}): Ramp {
  const step = opts.step ?? 0.09;
  const outlineStep = opts.outlineStep ?? 0.13;
  const { h } = toOklch(mid);
  // Toward 260° (blue) by the shortest way, for shadows.
  const target = 265;
  let delta = ((target - h + 540) % 360) - 180;
  const dir = delta === 0 ? 1 : Math.sign(delta);
  const hs = (opts.hueShift ?? 8) * dir;
  const dc = opts.darkChroma ?? 1.05;
  const lc = opts.lightChroma ?? 0.9;
  return {
    outline: shift(mid, -step - outlineStep, dc * dc * 0.9, hs * 2.2),
    dark: shift(mid, -step, dc, hs),
    mid,
    light: shift(mid, step, lc, -hs * 0.8),
    highlight: shift(mid, step * 1.9, lc * lc, -hs * 1.6),
  };
}

/** The named colour roles a world is painted with. */
export interface WorldPalette {
  name: string;
  water: Ramp;
  /** Shallow water close to the shore. */
  shallow: Ramp;
  foam: Color;
  sand: Ramp;
  grass: Ramp;
  /** The darker grass band hugging the island edge. */
  grassEdge: Color;
  /** A second grass tone used for large soft patches. */
  grassPatch: Color;
  path: Ramp;
  wood: Ramp;
  stone: Ramp;
  /** Foliage variants; each tree/bush picks one so a world has a few leaf colours, not a rainbow. */
  foliage: Ramp[];
  trunk: Ramp[];
  roof: Ramp[];
  wall: Ramp[];
  flowers: Color[];
  fruit: Color[];
  /** Shadow cast on the ground by objects (drawn as a solid, not alpha). */
  shadowOnGrass: Color;
  shadowOnSand: Color;
  shadowOnWater: Color;
}

const r = (h: string, o?: RampOptions) => ramp(hex(h), o);

/** The default: bright GBA-era cozy island. */
export const COZY: WorldPalette = {
  name: 'cozy',
  water: r('#3d7fe0', { step: 0.07, hueShift: 4 }),
  shallow: r('#5fb3f0', { step: 0.06, hueShift: 3 }),
  foam: hex('#eaf8ff'),
  sand: r('#edcf8e', { step: 0.08, hueShift: 6 }),
  grass: r('#78d04c', { step: 0.075, hueShift: 10 }),
  grassEdge: hex('#4e9e38'),
  grassPatch: hex('#86da56'),
  path: r('#dcb97a', { step: 0.07 }),
  wood: r('#b4733f', { step: 0.085, hueShift: 10 }),
  stone: r('#9a9fb3', { step: 0.085, hueShift: 4 }),
  foliage: [r('#3fb34a', { step: 0.095, hueShift: 7 }), r('#35a861', { step: 0.095, hueShift: 6 }), r('#67c23c', { step: 0.095, hueShift: 7 }), r('#2f9d5a', { step: 0.095, hueShift: 6 })],
  trunk: [r('#8a5a33', { step: 0.085, hueShift: 8 }), r('#6f4a3a', { step: 0.085, hueShift: 8 })],
  roof: [r('#d2504a', { step: 0.085, hueShift: 8 }), r('#4d74d6', { step: 0.085, hueShift: 4 }), r('#d49a3a', { step: 0.085, hueShift: 8 }), r('#8c5fc8', { step: 0.085, hueShift: 4 })],
  wall: [r('#f3e3c3', { step: 0.07, hueShift: 8 }), r('#e6c9a0', { step: 0.07, hueShift: 8 })],
  flowers: [hex('#ff6b7a'), hex('#ffd93b'), hex('#ffffff'), hex('#ff9ad1'), hex('#7ab8ff')],
  fruit: [hex('#ff5a4a'), hex('#ffb13b'), hex('#ff7cc4')],
  shadowOnGrass: hex('#55a83a'),
  shadowOnSand: hex('#d2b070'),
  shadowOnWater: hex('#2f68c4'),
};

/** A softer, more autumnal variant to prove the palette is a parameter, not a constant. */
export const AUTUMN: WorldPalette = {
  ...COZY,
  name: 'autumn',
  grass: r('#9ac64a', { step: 0.075, hueShift: 10 }),
  grassEdge: hex('#6a9a34'),
  grassPatch: hex('#a8d058'),
  foliage: [r('#e08a3a', { step: 0.095, hueShift: 8 }), r('#c9563a', { step: 0.095, hueShift: 8 }), r('#d8b23a', { step: 0.095, hueShift: 8 }), r('#6fa83c', { step: 0.095, hueShift: 7 })],
  shadowOnGrass: hex('#7ba83a'),
};

export const PALETTES: Record<string, WorldPalette> = { cozy: COZY, autumn: AUTUMN };
