/**
 * GROWING THE LIVE WORLD. The steps between "the player chose to grow" (or a dev stage change) and the grown world
 * on screen, shared by the playground and the tests so the button-to-world path is the one that is tested:
 *
 *   1. the stage is saved (`LiveWorld.growIsland` / `devSetGrowthStage`),
 *   2. a new LiveWorld is built from the same base world and the save, exactly as a reload would,
 *   3. the Blobbi stays where it stood (land never disappears, so the spot is still ground),
 *   4. when land was added, the reveal plays from the stage the player last saw.
 *
 * World coordinates never change: nothing here moves, scales or regenerates existing land, objects or buildings.
 * The caller swaps its renderers for the returned world (they are built from `live.world`).
 */
import type { BlobbiSource } from '../blobbi/source';
import type { KeyValueStore } from '../game/persistence';
import type { WorldDescription } from '../world/types';
import { LiveWorld } from './live-world';

export interface RebuildOptions {
  /** The stage-0 world the old LiveWorld was built from (its `baseWorld`). */
  base: WorldDescription;
  blobbi: string | BlobbiSource;
  blobbiSize: number;
  store: KeyValueStore | null;
  /** Play the reveal when the rebuilt world has more land than the old one. */
  reveal: boolean;
}

/** Rebuild a live world from its save (after growth, or a dev stage change). Returns the new world. */
export function rebuildFromSave(old: LiveWorld, o: RebuildOptions): LiveWorld {
  const at = { x: old.blobbi.x, y: old.blobbi.y };
  const inside = !!old.interior;
  const seen = old.world.growth?.stage ?? 0;
  old.save();
  const live = new LiveWorld(o.base, o.blobbi, o.blobbiSize, { store: o.store });
  if (!inside && live.collision.canStand(at.x, at.y, live.blobbi.footRx, live.blobbi.footRy)) {
    live.blobbi.x = at.x;
    live.blobbi.y = at.y;
  }
  live.clock.speed = old.clock.speed;
  live.sounds.push(...old.sounds);
  const now = live.world.growth?.stage ?? 0;
  if (o.reveal && now > seen) live.startReveal(undefined, seen);
  return live;
}

/** Why the island did not grow (shown to the player), or null when it did. */
export type GrowOutcome = { grown: true; live: LiveWorld; stage: number } | { grown: false; reason: string };

/**
 * The player's growth (LET THE ISLAND GROW, confirmed): grow when ready, then rebuild with the reveal. Refuses inside
 * a building (the island grows around you) and when not ready, saying why.
 */
export function growLiveIsland(live: LiveWorld, o: Omit<RebuildOptions, 'reveal'>): GrowOutcome {
  if (live.interior) return { grown: false, reason: 'step outside first: the island grows around you' };
  const r = live.growthReadiness();
  if (r.blocked) return { grown: false, reason: r.blocked };
  if (!r.next) return { grown: false, reason: 'the island has grown as far as it can' };
  if (!r.ready) return { grown: false, reason: 'not ready yet: see what the island still needs' };
  const stage = live.growIsland();
  if (stage === null) return { grown: false, reason: 'the island cannot grow here' };
  return { grown: true, live: rebuildFromSave(live, { ...o, reveal: true }), stage };
}
