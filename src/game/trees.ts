/**
 * TREES AS A RESOURCE. A grown tree takes a few axe hits, then it is a stump that yields wood; then its ground is
 * clear (M10 phase B: walkable and buildable); after a while, if the spot is still free, a seedling comes up and
 * the tree regrows through the existing growth stages into the same tree it was (its seed never changes). State
 * is kept per placement index in world time (simulated seconds, persisted), never in frames, so a reload
 * continues exactly where the regrowth was.
 */
import { stream } from '../core/rng';
import { PixelBuffer, type Sprite } from '../core/pixel';
import type { WorldPalette } from '../core/palette';
import type { TreeResult } from '../objects/tree';

/** Axe hits to fell a grown tree. */
export const HITS_TO_FELL = 3;
/** Seconds of world time a stump stays a stump before the seedling shows. */
export const STUMP_SECONDS = 20;
/** Seconds of world time from seedling to a grown, harvestable tree again. */
export const REGROW_SECONDS = 240;
/** M10 phase B: seconds the ground stays clear after the stump before the seedling may come up (`clearing.ts`). */
export const TREE_RETURN_SECONDS = 600;

/**
 * M10 phase C: the stages of a regrowing tree, by growth (0..1): a SEEDLING (stepped over, pulled up with the axe
 * for nothing), a YOUNG TREE (cleared with one swing for a single log), then the grown tree (felled as always).
 */
export const SEEDLING_UNTIL = 1 / 3;
export type TreeStage = 'seedling' | 'young' | 'grown';
export const treeStage = (growth: number): TreeStage => (growth < SEEDLING_UNTIL ? 'seedling' : growth < 1 ? 'young' : 'grown');
/** Wood from clearing a tree before it is grown: a seedling gives none, a young tree one log (felling gives 2-4). */
export const EARLY_WOOD: Record<Exclude<TreeStage, 'grown'>, number> = { seedling: 0, young: 1 };

export interface TreeState {
  /** Axe hits taken since the last regrowth (reset on felling). */
  hits: number;
  /** World time of the felling, or null while the tree stands. */
  harvestedAt: number | null;
  /**
   * M10 phase B: world time the seedling came up (the regrowth began), or null while its ground is clear and the
   * tree waits for the spot to be free (`src/game/clearing.ts`). Absent: felled before phase B, so the old
   * schedule (the seedling right after the stump) applies.
   */
  regrowAt?: number | null;
}

export type TreePhase = 'grown' | 'chopping' | 'stump' | 'cleared' | 'regrowing';

export interface TreeCondition {
  phase: TreePhase;
  /** Growth 0..1 for the sprite (1 when grown or a stump). */
  growth: number;
  /** Seconds until the tree is grown again (0 when it is). */
  remaining: number;
}

export function treeCondition(state: TreeState | undefined, worldTime: number): TreeCondition {
  if (!state || state.harvestedAt === null) return { phase: state && state.hits > 0 ? 'chopping' : 'grown', growth: 1, remaining: 0 };
  const since = Math.max(0, worldTime - state.harvestedAt);
  // (A tree felled since M10 phase B also has its clear-ground wait ahead of it.)
  if (since < STUMP_SECONDS) return { phase: 'stump', growth: 1, remaining: STUMP_SECONDS + (state.regrowAt === undefined ? 0 : TREE_RETURN_SECONDS) + REGROW_SECONDS - since };
  const regrowAt = state.regrowAt === undefined ? state.harvestedAt + STUMP_SECONDS : state.regrowAt;
  // Cleared ground: the tree comes back only when its spot is free (remaining is the earliest it may try).
  if (regrowAt === null) return { phase: 'cleared', growth: 0, remaining: Math.max(0, STUMP_SECONDS + TREE_RETURN_SECONDS - since) + REGROW_SECONDS };
  const growth = Math.min(1, Math.max(0, worldTime - regrowAt) / REGROW_SECONDS);
  if (growth >= 1) return { phase: 'grown', growth: 1, remaining: 0 };
  // Quantized like planted trees, so sprites are reused.
  return { phase: 'regrowing', growth: Math.max(0.02, Math.round(growth * 24) / 24), remaining: REGROW_SECONDS - (worldTime - regrowAt) };
}

/** Wood a tree yields when felled: bigger trees give more, the seed decides the odd extra log. */
export function woodYield(seed: string, size: number): number {
  return 2 + (size >= 30 ? 1 : 0) + (stream(seed, 'wood').chance(0.35) ? 1 : 0);
}

/** A stump where the tree stood: the trunk's base, rings on top, the tree's own footprint. */
export function stumpSprite(tree: TreeResult, palette: WorldPalette): Sprite {
  const ramp = palette.trunk[tree.variation.trunkRamp % palette.trunk.length];
  const w = Math.max(5, Math.min(11, Math.round(tree.footRx * 1.6) | 1));
  const h = Math.max(4, Math.round(w * 0.6));
  const buf = new PixelBuffer(w + 2, h + 3);
  const cx = Math.floor(buf.width / 2);
  // The cut face: a lit ellipse with two rings.
  const top = 1;
  const faceRy = Math.max(1, Math.round(w * 0.22));
  for (let y = -faceRy; y <= faceRy; y++)
    for (let x = -Math.floor(w / 2); x <= Math.floor(w / 2); x++) {
      const u = x / (w / 2);
      const v = y / faceRy;
      if (u * u + v * v > 1) continue;
      const r = u * u + v * v;
      buf.set(cx + x, top + faceRy + y, r > 0.75 ? ramp.mid : r > 0.35 ? palette.wood.light : r > 0.1 ? ramp.light : palette.wood.light);
    }
  // The trunk below the face.
  const trunkTop = top + faceRy * 2;
  for (let y = trunkTop; y < buf.height - 1; y++)
    for (let x = -Math.floor(w / 2) + 1; x <= Math.floor(w / 2) - 1; x++) buf.set(cx + x, y, x < -1 ? ramp.light : x > 1 ? ramp.dark : ramp.mid);
  // Outline.
  const mask = buf.opaqueMask();
  const grown = mask.dilate();
  for (let y = 0; y < buf.height; y++) for (let x = 0; x < buf.width; x++) if (grown.get(x, y) && !mask.get(x, y)) buf.set(x, y, ramp.outline);
  buf.validate();
  return { buffer: buf, anchorX: cx, anchorY: buf.height - 2, footRx: tree.footRx, footRy: tree.footRy };
}
