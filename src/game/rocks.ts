/**
 * LARGE ROCKS AS A RESOURCE. A large world rock takes a few pickaxe hits, then it is a pile of rubble that
 * yields stones; then (M10 phase B) its ground is clear — walkable and buildable — until, if the spot is still
 * free, the same rock surfaces there again (its seed, size and footprint never change). Rocks broken before
 * phase B keep the old timeline: rubble that blocks, then whole. State is per placement index in
 * persisted world time, like trees.
 */
import { stream } from '../core/rng';
import { PixelBuffer, type Sprite } from '../core/pixel';
import type { WorldPalette } from '../core/palette';

/** Rocks at least this wide (world pixels) can be mined; smaller ones are scenery. */
export const LARGE_ROCK_SIZE = 14;
/** Pickaxe hits to break a large rock. */
export const HITS_TO_MINE = 4;
/** Seconds of world time a rock broken before M10 phase B stays rubble before it is whole again. */
export const RUBBLE_SECONDS = 300;
/** M10 phase B: seconds the rubble lies there before its ground is clear, then before the rock may surface again. */
export const RUBBLE_CLEAR_SECONDS = 20;
export const ROCK_RETURN_SECONDS = 900;
/**
 * M10 phase C: a returning rock FORMS over this many seconds — a small deposit, then a growing one, then the whole
 * rock — instead of appearing at once. Each forming stage can be cleared with the pickaxe in one swing.
 */
export const ROCK_FORM_SECONDS = 360;
export type RockStage = 'deposit' | 'growing' | 'whole';
/** The forming stage at a progress 0..1, and the share of the rock's size it shows. */
export const rockStage = (progress: number): RockStage => (progress < 0.5 ? 'deposit' : progress < 1 ? 'growing' : 'whole');
export const ROCK_STAGE_SIZE: Record<RockStage, number> = { deposit: 0.45, growing: 0.72, whole: 1 };
/** Stones from clearing a forming rock (breaking a whole one gives 3-5). */
export const EARLY_STONES: Record<Exclude<RockStage, 'whole'>, number> = { deposit: 1, growing: 2 };

export interface RockState {
  hits: number;
  /** World time of the breaking, or null while the rock is whole. */
  minedAt: number | null;
  /**
   * M10 phase B: world time the rock surfaced again, or null while its ground is clear and it waits for the spot
   * to be free (`src/game/clearing.ts`). Absent: broken before phase B (the old rubble timeline applies).
   */
  reformAt?: number | null;
}

export type RockPhase = 'whole' | 'mining' | 'rubble' | 'cleared' | 'forming';

export interface RockCondition {
  phase: RockPhase;
  /** Seconds until the rock is whole again (0 when it is). */
  remaining: number;
  /** While forming (M10 phase C): its stage. */
  stage?: RockStage;
}

export function rockCondition(state: RockState | undefined, worldTime: number): RockCondition {
  if (!state || state.minedAt === null) return { phase: state && state.hits > 0 ? 'mining' : 'whole', remaining: 0 };
  const since = Math.max(0, worldTime - state.minedAt);
  // Before phase B: rubble for RUBBLE_SECONDS, then whole.
  if (state.reformAt === undefined) return since >= RUBBLE_SECONDS ? { phase: 'whole', remaining: 0 } : { phase: 'rubble', remaining: RUBBLE_SECONDS - since };
  if (since < RUBBLE_CLEAR_SECONDS) return { phase: 'rubble', remaining: RUBBLE_CLEAR_SECONDS + ROCK_RETURN_SECONDS - since };
  if (state.reformAt === null || worldTime < state.reformAt) return { phase: 'cleared', remaining: Math.max(0, RUBBLE_CLEAR_SECONDS + ROCK_RETURN_SECONDS - since) + ROCK_FORM_SECONDS };
  // M10 phase C: surfaced, it forms over ROCK_FORM_SECONDS (a deposit, a growing one), then it is whole.
  const progress = (worldTime - state.reformAt) / ROCK_FORM_SECONDS;
  if (progress < 1) return { phase: 'forming', remaining: ROCK_FORM_SECONDS - (worldTime - state.reformAt), stage: rockStage(progress) };
  return { phase: 'whole', remaining: 0 };
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
