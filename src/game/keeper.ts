/**
 * KEEPER TRACES (Living Home): small signs of the island's Keepers that its own life brings to light, on top of the
 * discoveries lying about (`content/discoveries.ts`, `KEEPER_DISCOVERIES`). Here: the cairn, a fixture of the base
 * world placed once from the world seed (reachable grass, apart from everything else), which grows a stone with
 * each growth stage of the Carrier. The bunny's button and the songbird's ribbon are moments of the land life
 * (`sim/live-world.ts`); the constants of those moments live in `land-life.ts`.
 */
import { stream } from '../core/rng';
import { T, type WorldDescription } from '../world/types';

export interface Cairn {
  x: number;
  y: number;
}

/** How close E works at the cairn (world px, the vertical squeezed as for discoveries). */
export const CAIRN_REACH = 14;
/** The cairn's ground footprint (collision; nothing is built over it). */
export const CAIRN_FOOT = { rx: 3, ry: 1 } as const;

/** Stones on the cairn at a growth stage: three to begin with, one more per stage, six at most. */
export const cairnStones = (stage: number): number => 3 + Math.min(3, Math.max(0, Math.floor(stage)));

/**
 * Where the cairn stands on this world, chosen once from the world seed: on grass or meadow a Blobbi can stand on
 * and reach from the hub, well apart from the hub, the discoveries and the things on the ground. Null on a world
 * with no such ground (then there is simply no cairn).
 */
export function placeKeeperCairn(world: WorldDescription, canStand: (x: number, y: number) => boolean, reachable: (x: number, y: number) => boolean, avoid: readonly { x: number; y: number }[]): Cairn | null {
  const { width, height, cls } = world.terrain;
  const island = world.islands[0];
  const hub = world.hubs[0] ?? { x: island.cx, y: island.cy };
  const rng = stream(world.seed, 'keeper', 'cairn');
  const oval = world.creature?.species === 'whale' ? 2 / (1 + (island.aspect ?? 1)) : 1;
  const grassy = (x: number, y: number) => {
    const c = cls[y * width + x];
    return c === T.GRASS || c === T.GRASS_PATCH || c === T.MEADOW || c === T.GRASS_DARK;
  };
  for (let tries = 0; tries < 800; tries++) {
    const a = rng.range(0, Math.PI * 2);
    const r = island.radius * Math.sqrt(rng.range(0.15, 1));
    const x = Math.round(island.cx + Math.cos(a) * r * oval);
    const y = Math.round(island.cy + Math.sin(a) * r * (island.aspect ?? 1) * oval);
    if (x < 4 || y < 4 || x >= width - 4 || y >= height - 4) continue;
    if (!grassy(x, y) || !canStand(x, y) || !reachable(x, y)) continue;
    if (Math.hypot(hub.x - x, hub.y - y) < 30) continue;
    if (!avoid.every((p) => Math.hypot(p.x - x, p.y - y) > 24)) continue;
    // Room to stand on every side (so E can reach it from anywhere round it).
    if (![[-8, 0], [8, 0], [0, 6], [0, -6]].every(([dx, dy]) => canStand(x + dx, y + dy))) continue;
    return { x, y };
  }
  return null;
}
