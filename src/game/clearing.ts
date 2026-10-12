/**
 * CLEARING LAND (M10 phase B). Terrain is permanent; natural resources are temporary occupants of it.
 *
 * Felling a tree, breaking a rock, clearing a bush, a small rock or a natural stump or mushroom frees the ground it
 * stood on: after a short stump or rubble moment the spot is clear — walkable, and free for a building, a path, a
 * plot or furniture. Later the resource may come back, gradually and on the very same spot, but only if that spot
 * is still free when it is due:
 *
 *   POLICY: wait in place. A resource never grows over a building, a path, a rug, a plot or its crop, a doorway,
 *   a planted tree or the Blobbi, and never where it would cut a building or the hub off from the rest of the
 *   island. If the spot is taken it simply waits (it is tried again every few seconds of world time) and returns
 *   the moment the spot is free again. Nothing moves: no player object, no other resource, no terrain.
 *
 *   Why not move it elsewhere: every world object has a fixed index, position and seed that saves, quests, places,
 *   discoveries and the island's look rely on; a relocated tree would be a new kind of record. Waiting keeps every
 *   object where the world put it, is deterministic, and is exactly what a player sees: build on it and it stays
 *   gone; clear the spot and it comes back.
 *
 *   Never short of materials: building over many trees could leave little to chop. Sticks and stones lie about and
 *   come back on their own (resources.ts); and while the island has fewer than `MIN_STANDING_TREES` trees standing,
 *   driftwood (wood) washes up on the shore (LiveWorld.stepDriftwood), so wood can always be found.
 *
 * Saves made before M10 phase B keep their timelines: a tree felled then (no `regrowAt` recorded) regrows on the old
 * schedule, a rock broken then is whole again after the old rubble time.
 */
import type { Placement } from '../world/types';
import { isLargeRock } from './rocks';

/** What the player can clear, and with what. */
export type Clearable = 'tree' | 'rock' | 'small-rock' | 'bush' | 'stump' | 'mushroom';

export const CLEAR_TOOL: Record<Clearable, 'axe' | 'pickaxe'> = { tree: 'axe', rock: 'pickaxe', 'small-rock': 'pickaxe', bush: 'axe', stump: 'axe', mushroom: 'axe' };

/** The kind of clearable thing a world object is, or null for the island's permanent pieces (signs, wells…). */
export function clearableKind(p: Placement): Clearable | null {
  if (p.kind === 'tree') return 'tree';
  if (p.kind === 'rock') return isLargeRock(p.size) ? 'rock' : 'small-rock';
  if (p.kind === 'bush') return 'bush';
  if (p.kind === 'decor') {
    const k = (p.variation as { kind?: string } | undefined)?.kind;
    if (k === 'stump') return 'stump';
    if (k === 'mushroom') return 'mushroom';
  }
  return null;
}

/**
 * Seconds of world time the ground stays clear before the resource first tries to come back (a day is 1200).
 * Null: it does not come back (a natural stump, once dug out, is gone).
 */
export const RETURN_SECONDS: Record<Clearable, number | null> = { tree: 600, rock: 900, 'small-rock': 900, bush: 480, stump: null, mushroom: 600 };

/** How often (world seconds) a resource that is due but blocked looks at its spot again. */
export const RETRY_SECONDS = 5;

/** Below this many standing trees, driftwood washes up on the shore. */
export const MIN_STANDING_TREES = 8;

/** Bushes, small rocks and natural stumps or mushrooms the player has cleared (per world object index). */
export interface ClearState {
  /** World time it was cleared. */
  at: number;
  /** World time it came back, or null while the ground is clear. */
  returnedAt: number | null;
}

/** What clearing one gives. */
export const CLEAR_YIELD: Record<'small-rock' | 'bush' | 'stump' | 'mushroom', { item: string; quantity: number }[]> = {
  'small-rock': [{ item: 'blobbi-pixel:resource:stone', quantity: 1 }],
  bush: [{ item: 'blobbi-pixel:resource:stick', quantity: 1 }, { item: 'blobbi-pixel:resource:fibre', quantity: 1 }],
  stump: [{ item: 'blobbi-pixel:material:wood', quantity: 1 }],
  mushroom: [{ item: 'blobbi-pixel:food:mushroom', quantity: 1 }],
};
