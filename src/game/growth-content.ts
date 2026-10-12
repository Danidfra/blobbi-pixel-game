/**
 * WHAT GROWS ON GROWN LAND (M7): each new region's resources, its named place and its discovery. All of it comes
 * from the grown world alone (seeded per region), with ids of its own, so nothing on the original island moves.
 */
import { stream } from '../core/rng';
import { WALKABLE, T, type WorldDescription } from '../world/types';
import { BIOMES, type BiomeId } from '../world/growth';
import { GROWTH_DISCOVERIES } from '../content/discoveries';
import { FORAGE_CONTENT } from '../content/forage';
import type { ResourceKind, ResourceNode, StandCheck } from './resources';
import type { DiscoverySpot } from './discoveries';
import type { Place } from './places';

/** Resources per biome: kind and how many per 1000 world pixels of region (at scale 1). */
const RESOURCES: Record<BiomeId, [ResourceKind, number][]> = {
  meadow: [['herb', 4], ['seed', 4], ['stick', 1]],
  woodland: [['stick', 6], ['mushroom', 2], ['berry', 2]],
  rocky: [['stone', 7], ['herb', 1]],
  coastal: [['fibre', 3], ['shell', 2], ['stick', 1]],
  mushroom: [['mushroom', 6], ['stick', 2]],
  sanctuary: [['berry', 3], ['seed', 3], ['herb', 2], ['stick', 2]],
};

const SPRITES: Partial<Record<ResourceKind, number>> = { stick: 3, stone: 3, seed: 2, ...Object.fromEntries(FORAGE_CONTENT.map((f) => [f.kind, f.sprites.length])) };

/** The cells of each grown region (pixel indices), by region index. */
function regionCells(world: WorldDescription): number[][] {
  const g = world.growth!;
  const cells: number[][] = g.regions.map(() => []);
  for (let i = 0; i < g.region.length; i++) if (g.region[i]) cells[g.region[i] - 1].push(i);
  return cells;
}

/** Grown land's resources, region by region, in a stable order (ids `g:<region>:<kind>:<n>`). */
export function growthResources(world: WorldDescription, canStand: StandCheck): ResourceNode[] {
  const g = world.growth;
  if (!g) return [];
  const { width, cls } = world.terrain;
  const out: ResourceNode[] = [];
  const S = world.options.scale;
  const cells = regionCells(world);
  g.regions.forEach((r, k) => {
    const list = cells[k];
    if (!list.length) return;
    const rng = stream(world.seed, 'growth', 'resources', r.id);
    for (const [kind, per] of RESOURCES[r.biome]) {
      const n = Math.max(1, Math.round(((list.length / (S * S)) / 1000) * per));
      let made = 0;
      for (let t = 0; t < n * 20 && made < n; t++) {
        const i = list[rng.int(0, list.length - 1)];
        const x = i % width;
        const y = Math.floor(i / width);
        const c = cls[i];
        if (!WALKABLE.has(c) || c === T.PATH || c === T.GRASS_EDGE) continue;
        if (!canStand(x, y, 2, 1)) continue;
        if (out.some((o) => Math.hypot(o.x - x, o.y - y) < 7)) continue;
        out.push({ id: `g:${r.id}:${kind}:${made}`, kind, x, y, variant: rng.int(0, (SPRITES[kind] ?? 1) - 1), source: -1 });
        made++;
      }
    }
  });
  return out;
}

/** Each grown region is a named place, at the most inland reachable point of it. */
export function regionPlaces(world: WorldDescription, canStand: (x: number, y: number) => boolean): Place[] {
  const g = world.growth;
  if (!g) return [];
  const { width, dist } = world.terrain;
  const cells = regionCells(world);
  const out: Place[] = [];
  g.regions.forEach((r, k) => {
    // The deepest standable cell (most inland), ties by index: stable.
    let best = -1;
    for (const i of cells[k]) if ((best < 0 || dist[i] < dist[best]) && canStand(i % width, Math.floor(i / width))) best = i;
    if (best < 0) return;
    const b = BIOMES[r.biome];
    out.push({ id: `region:${r.id}`, name: r.biome === 'coastal' && r.stage === 3 ? 'The outer shore' : `The ${b.name.toLowerCase()}`, note: `${b.note} (grown at stage ${r.stage})`, x: best % width, y: Math.floor(best / width), radius: 24 });
  });
  return out;
}

/** Each biome's discovery, in the first region of that biome, on reachable ground away from other things. */
export function placeGrowthDiscoveries(world: WorldDescription, canStand: (x: number, y: number) => boolean, avoid: readonly { x: number; y: number }[]): DiscoverySpot[] {
  const g = world.growth;
  if (!g) return [];
  const { width } = world.terrain;
  const cells = regionCells(world);
  const out: DiscoverySpot[] = [];
  for (const d of GROWTH_DISCOVERIES) {
    const k = g.regions.findIndex((r) => r.biome === d.biome);
    if (k < 0 || !cells[k].length) continue;
    const rng = stream(world.seed, 'growth', 'discovery', d.id);
    for (let t = 0; t < 400; t++) {
      const i = cells[k][rng.int(0, cells[k].length - 1)];
      const x = i % width;
      const y = Math.floor(i / width);
      if (!canStand(x, y)) continue;
      if (avoid.some((n) => Math.hypot(n.x - x, n.y - y) < 12) || out.some((s) => Math.hypot(s.x - x, s.y - y) < 20)) continue;
      out.push({ id: d.id, x, y, content: d });
      break;
    }
  }
  return out;
}
