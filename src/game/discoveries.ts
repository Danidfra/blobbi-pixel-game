/**
 * DISCOVERY SPOTS: where each discovery lies on this world, chosen once from the world seed (a keyed stream per
 * discovery), on its kind of terrain, on ground the Blobbi can stand on and reach from the hub, apart from each
 * other and from resource nodes. The same world always hides them in the same places.
 */
import { stream } from '../core/rng';
import { T, type WorldDescription } from '../world/types';
import { DISCOVERY_CONTENT, type DiscoveryContent, type Terrain } from '../content/discoveries';
import { isShore } from './resources';

export interface DiscoverySpot {
  id: string;
  x: number;
  y: number;
  content: DiscoveryContent;
}

export function placeDiscoveries(world: WorldDescription, canStand: (x: number, y: number) => boolean, reachable: (x: number, y: number) => boolean, avoid: readonly { x: number; y: number }[]): DiscoverySpot[] {
  const { width, height, cls, elevation } = world.terrain;
  const at = (x: number, y: number) => cls[y * width + x];
  const nearPond = (x: number, y: number) => {
    for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
      const c = at(Math.min(width - 1, Math.max(0, x + dx)), Math.min(height - 1, Math.max(0, y + dy)));
      if (c === T.POND || c === T.POND_EDGE) return true;
    }
    return false;
  };
  const fits: Record<Terrain, (x: number, y: number) => boolean> = {
    beach: (x, y) => isShore(world, x, y),
    forest: (x, y) => at(x, y) === T.GRASS_DARK,
    meadow: (x, y) => at(x, y) === T.MEADOW,
    grass: (x, y) => at(x, y) === T.GRASS || at(x, y) === T.GRASS_PATCH,
    plateau: (x, y) => elevation[y * width + x] > 0 && (at(x, y) === T.GRASS || at(x, y) === T.MEADOW || at(x, y) === T.GRASS_PATCH),
    pond: (x, y) => (at(x, y) === T.GRASS || at(x, y) === T.GRASS_EDGE || at(x, y) === T.GRASS_PATCH) && nearPond(x, y),
  };
  const island = world.islands[0];
  // (A whale's island is long: sample its true oval. Other worlds keep their original sampling, and their finds.)
  const oval = world.creature?.species === 'whale' ? 2 / (1 + (island.aspect ?? 1)) : 1;
  const spots: DiscoverySpot[] = [];
  const clear = (x: number, y: number) => spots.every((s) => Math.hypot(s.x - x, s.y - y) > 28) && avoid.every((n) => Math.hypot(n.x - x, n.y - y) > 30);
  for (const d of DISCOVERY_CONTENT) {
    const rng = stream(world.seed, 'discovery', d.id);
    let found: { x: number; y: number } | null = null;
    // Its own terrain first; any reachable grass if the world has none of that terrain.
    for (const test of [fits[d.terrain], fits.grass]) {
      for (let tries = 0; tries < 600 && !found; tries++) {
        const a = rng.range(0, Math.PI * 2);
        const r = island.radius * Math.sqrt(rng.range(0, 1.1));
        const x = Math.round(island.cx + Math.cos(a) * r * oval);
        const y = Math.round(island.cy + Math.sin(a) * r * (island.aspect ?? 1) * oval);
        if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) continue;
        if (test(x, y) && canStand(x, y) && reachable(x, y) && clear(x, y)) found = { x, y };
      }
      if (found) break;
    }
    if (found) spots.push({ id: d.id, ...found, content: d });
  }
  return spots;
}
