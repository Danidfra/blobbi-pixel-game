/**
 * LARGE ROCKS AS A RESOURCE. A large world rock takes a few pickaxe hits, then it is a pile of rubble that
 * yields stones; after a while of world time the rock is whole again (the same rock: its seed, size and
 * footprint never change, so collision and navigation never change either). State is per placement index in
 * persisted world time, like trees.
 */
import { stream } from '../core/rng';
import { PixelBuffer, type Sprite } from '../core/pixel';
import type { WorldPalette } from '../core/palette';

/** Rocks at least this wide (world pixels) can be mined; smaller ones are scenery. */
export const LARGE_ROCK_SIZE = 14;
/** Pickaxe hits to break a large rock. */
export const HITS_TO_MINE = 4;
/** Seconds of world time a mined rock stays rubble before it is whole again. */
export const RUBBLE_SECONDS = 300;

export interface RockState {
  hits: number;
  /** World time of the breaking, or null while the rock is whole. */
  minedAt: number | null;
}

export type RockPhase = 'whole' | 'mining' | 'rubble';

export interface RockCondition {
  phase: RockPhase;
  /** Seconds until the rock is whole again (0 when it is). */
  remaining: number;
}

export function rockCondition(state: RockState | undefined, worldTime: number): RockCondition {
  if (!state || state.minedAt === null) return { phase: state && state.hits > 0 ? 'mining' : 'whole', remaining: 0 };
  const since = Math.max(0, worldTime - state.minedAt);
  if (since >= RUBBLE_SECONDS) return { phase: 'whole', remaining: 0 };
  return { phase: 'rubble', remaining: RUBBLE_SECONDS - since };
}

export const isLargeRock = (size: number): boolean => size >= LARGE_ROCK_SIZE;

/** Stones a large rock yields when broken: bigger rocks give more, the seed decides the odd extra. */
export function stoneYield(seed: string, size: number): number {
  return 3 + (size >= 18 ? 1 : 0) + (stream(seed, 'stones').chance(0.35) ? 1 : 0);
}

/** Rubble: a low scatter of broken stone the width of the rock's footprint, in the stone ramp. */
export function rubbleSprite(seed: string, footRx: number, footRy: number, palette: WorldPalette): Sprite {
  const rng = stream(seed, 'rubble');
  const w = footRx * 2 + 3;
  const h = Math.max(4, footRy * 2 + 3);
  const buf = new PixelBuffer(w + 2, h + 2);
  const s = palette.stone;
  const n = Math.max(3, Math.round(footRx * 0.7));
  for (let i = 0; i < n; i++) {
    const cx = 1 + Math.round(rng.range(1, w - 2));
    const cy = 1 + Math.round(rng.range(Math.max(1, h * 0.35), h - 1));
    const big = rng.chance(0.4);
    buf.set(cx, cy, s.mid);
    buf.set(cx + 1, cy, s.dark);
    if (big) {
      buf.set(cx, cy - 1, s.light);
      buf.set(cx + 1, cy - 1, s.mid);
    }
  }
  const mask = buf.opaqueMask();
  const grown = mask.dilate();
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (grown.get(x, y) && !mask.get(x, y)) buf.set(x, y, s.outline);
  buf.validate();
  return { buffer: buf, anchorX: Math.floor(buf.width / 2), anchorY: buf.height - 2, footRx, footRy };
}
