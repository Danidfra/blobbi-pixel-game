/**
 * PLACEMENT: where objects stand. Houses first (they own the open ground
 * near the hub), then fences and decor beside them, then trees in a few
 * loose groves plus some loners, then bushes, rocks, flower clusters and
 * tufts. Everything checks the same rules: fully on interior grass, off
 * paths, footprints never overlapping. Density is deliberately low.
 */
import { stream, subSeed, type Rng } from '../core/rng';
import { OBJECT_GENERATORS } from '../objects';
import type { Sprite } from '../core/pixel';
import type { WorldPalette } from '../core/palette';
import { T, type Island, type Placement, type TerrainMap, type Layer } from './types';
import type { Hub } from './paths';

interface Foot {
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** Non-solid feet (flowers, tufts) never claim a corridor. */
  soft: boolean;
}

export class Occupancy {
  private feet: Foot[] = [];
  constructor(private readonly terrain: TerrainMap) {}

  /** The pixel is interior grass at least `depth` pixels from the shore and not a path. */
  groundOk(x: number, y: number, depth: number, allowPath = false): boolean {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.terrain.width || yi >= this.terrain.height) return false;
    const i = yi * this.terrain.width + xi;
    const c = this.terrain.cls[i];
    if (c === T.PATH) return allowPath;
    const grass = c === T.GRASS || c === T.GRASS_PATCH || c === T.GRASS_DARK || c === T.MEADOW;
    return grass && this.terrain.dist[i] <= -depth;
  }

  elevationAt(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.terrain.width || yi >= this.terrain.height) return -1;
    return this.terrain.elevation[yi * this.terrain.width + xi];
  }

  /** Every sample point of the footprint ellipse must be good ground. */
  footprintOk(x: number, y: number, rx: number, ry: number, depth: number, allowPath = false): boolean {
    const samples = [
      [0, 0],
      [-rx, 0],
      [rx, 0],
      [0, -ry],
      [0, ry],
      [-rx * 0.7, -ry * 0.7],
      [rx * 0.7, -ry * 0.7],
      [-rx * 0.7, ry * 0.7],
      [rx * 0.7, ry * 0.7],
    ];
    if (!samples.every(([dx, dy]) => this.groundOk(x + dx, y + dy, depth, allowPath))) return false;
    // Never straddle a cliff: the whole footprint, plus a margin below it, is on one level.
    const level = this.elevationAt(x, y);
    return samples.every(([dx, dy]) => this.elevationAt(x + dx, y + dy) === level && this.elevationAt(x + dx, y + dy + 4) === level);
  }

  /** Does the footprint clear every placed footprint by `margin` pixels? */
  clear(x: number, y: number, rx: number, ry: number, margin: number): boolean {
    for (const f of this.feet) {
      const dx = Math.abs(f.x - x);
      const dy = Math.abs(f.y - y);
      // A soft foot (flower, tuft) only needs not to overlap; solids keep the corridor.
      const m = f.soft ? 0 : margin;
      if (dx < f.rx + rx + m && dy < f.ry + ry + m) return false;
    }
    return true;
  }

  add(x: number, y: number, rx: number, ry: number, soft = false): void {
    this.feet.push({ x, y, rx, ry, soft });
  }

  /** Mark a rectangle as taken (paths, bridge landings). */
  block(x: number, y: number, w: number, h: number): void {
    this.feet.push({ x: x + w / 2, y: y + h / 2, rx: w / 2, ry: h / 2, soft: false });
  }
}

/** Minimum gap between the footprints of solid objects: a character's foot (10 px) plus a margin. */
export const CORRIDOR = 12;

export interface PlacementContext {
  seed: string;
  palette: WorldPalette;
  terrain: TerrainMap;
  islands: Island[];
  hubs: Hub[];
  density: number;
  occupancy: Occupancy;
  /** World scale (`WorldOptions.scale`): every size and distance below is stated at scale 1 and multiplied. */
  scale: number;
  /** Place the procedural cottage on large islands (default true; M8 new worlds: false, see `generatedHouse`). */
  houses?: boolean;
}

/** Island area in pixels, from the terrain owner map. */
export function islandAreas(terrain: TerrainMap, islands: Island[]): number[] {
  const areas = islands.map(() => 0);
  for (let i = 0; i < terrain.owner.length; i++) if (terrain.owner[i] >= 0 && terrain.cls[i] >= T.GRASS) areas[terrain.owner[i]]++;
  return areas;
}

function sample(rng: Rng, island: Island, spread = 1): { x: number; y: number } {
  const a = rng.range(0, Math.PI * 2);
  const r = Math.sqrt(rng.next()) * island.radius * spread;
  return { x: island.cx + Math.cos(a) * r, y: island.cy + Math.sin(a) * r };
}

/** Try to place one object of a kind; returns the placement and its sprite, or null. */
function tryPlace(
  ctx: PlacementContext,
  rng: Rng,
  island: Island,
  kind: keyof typeof OBJECT_GENERATORS,
  layer: Layer,
  size: number,
  key: string,
  opts: { tries?: number; depth?: number; margin?: number; near?: { x: number; y: number; r: number }; allowPath?: boolean; variation?: Record<string, unknown>; avoid?: { x: number; y: number; r: number } } = {},
): { placement: Placement; sprite: Sprite } | null {
  const seed = subSeed(ctx.seed, 'obj', island.id, key);
  const sprite = OBJECT_GENERATORS[kind]({ seed, size, palette: ctx.palette, variation: opts.variation as never });
  const tries = opts.tries ?? 18;
  const depth = opts.depth ?? sprite.footRy + 2;
  const margin = opts.margin ?? 2;
  for (let t = 0; t < tries; t++) {
    let p: { x: number; y: number };
    if (opts.near) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(0, opts.near.r);
      p = { x: opts.near.x + Math.cos(a) * r, y: opts.near.y + Math.sin(a) * r * 0.7 };
    } else p = sample(rng, island, 0.95);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (!ctx.occupancy.footprintOk(x, y, sprite.footRx, sprite.footRy, depth, opts.allowPath)) continue;
    if (!ctx.occupancy.clear(x, y, sprite.footRx, sprite.footRy, margin)) continue;
    // The whole drawing, not just the footprint, keeps out of a reserved spot (a canopy must not overhang the plaza).
    if (opts.avoid && Math.hypot(x - opts.avoid.x, (y - sprite.anchorY / 2 - opts.avoid.y) * 1.2) < opts.avoid.r + sprite.buffer.width / 2) continue;
    ctx.occupancy.add(x, y, sprite.footRx, sprite.footRy, kind === 'flower' || kind === 'grass');
    return { placement: { kind, layer, seed, size, x, y, island: island.id, variation: opts.variation }, sprite };
  }
  return null;
}

export function placeObjects(ctx: PlacementContext): Placement[] {
  const out: Placement[] = [];
  const areas = islandAreas(ctx.terrain, ctx.islands);
  const worldRng = stream(ctx.seed, 'place', 'world');
  const S = ctx.scale;
  // Counts are per island AREA at scale 1: a bigger world holds the same number of things per island.
  const unitArea = S * S;
  // A per-world tree size bias so worlds differ in scale, within reason.
  const treeScale = worldRng.range(0.9, 1.15) * S;

  for (const island of ctx.islands) {
    const area = areas[island.id];
    const hub = ctx.hubs[island.id];
    // Keep the hub plaza open.
    ctx.occupancy.block(hub.x - 5 * S, hub.y - 4 * S, 10 * S, 8 * S);

    // ── Structures ──────────────────────────────────────────────────────
    const houseRng = stream(ctx.seed, 'place', 'island', island.id, 'house');
    if (ctx.houses !== false && island.radius >= 34 * S && houseRng.chance(0.85)) {
      const size = Math.round(houseRng.int(20, Math.min(30, Math.round(island.radius * 0.6 / S))) * S);
      const placed = tryPlace(ctx, houseRng, island, 'house', 'structures', size, 'house', { tries: 40, depth: 6 * S, margin: CORRIDOR, near: { x: hub.x, y: hub.y - 6 * S, r: island.radius * 0.45 } });
      if (placed) {
        out.push(placed.placement);
        // Nothing may stand where the house is drawn: reserve its whole sprite, not only its footprint.
        const hs = placed.sprite;
        ctx.occupancy.block(placed.placement.x - hs.anchorX - 2, placed.placement.y - hs.anchorY - 2, hs.buffer.width + 4, hs.buffer.height + 2);
        // A fence beside the house, and a decoration or two by the door.
        const side = houseRng.chance(0.5) ? -1 : 1;
        const fence = tryPlace(ctx, houseRng, island, 'fence', 'structures', Math.round(houseRng.int(12, 22) * S), 'fence', { tries: 12, depth: 4 * S, margin: CORRIDOR, near: { x: placed.placement.x + side * (placed.sprite.footRx + 10 * S), y: placed.placement.y + 2, r: 4 * S } });
        if (fence) {
          out.push(fence.placement);
          // A little garden behind the fence: a row of flowers of one colour.
          const color = houseRng.int(0, ctx.palette.flowers.length - 1);
          for (let i = 0; i < 4; i++) {
            const flower = tryPlace(ctx, houseRng, island, 'flower', 'details', houseRng.int(5, 7), `garden-${i}`, { tries: 6, depth: 3 * S, margin: 0, near: { x: fence.placement.x - fence.sprite.footRx + 2 + i * 4 * S, y: fence.placement.y - 4 * S, r: 1.5 }, variation: { color } });
            if (flower) out.push(flower.placement);
          }
        }
        const decorNear = tryPlace(ctx, houseRng, island, 'decor', 'details', 8, 'house-decor', { tries: 10, depth: 3 * S, margin: CORRIDOR, near: { x: placed.placement.x - side * (placed.sprite.footRx + 5 * S), y: placed.placement.y + 3, r: 5 * S }, variation: { kind: houseRng.pick(['barrel', 'crate', 'lantern'] as const) } });
        if (decorNear) out.push(decorNear.placement);
      }
    }
    // A signpost or lantern near the hub on every island, a stump or mushrooms somewhere.
    const decorRng = stream(ctx.seed, 'place', 'island', island.id, 'decor');
    const hubDecor = tryPlace(ctx, decorRng, island, 'decor', 'details', 8, 'hub-decor', { tries: 10, depth: 3 * S, margin: CORRIDOR, near: { x: hub.x, y: hub.y, r: 9 * S }, variation: { kind: decorRng.weighted(['sign', 'lantern', 'well'] as const, [3, 2, 2]) } });
    if (hubDecor) out.push(hubDecor.placement);
    if (decorRng.chance(0.7)) {
      const extra = tryPlace(ctx, decorRng, island, 'decor', 'details', 8, 'wild-decor', { tries: 10, depth: 4 * S, margin: CORRIDOR, variation: { kind: decorRng.pick(['stump', 'mushroom'] as const) } });
      if (extra) out.push(extra.placement);
    }

    // ── Trees: a few groves, a few loners ───────────────────────────────
    const treeRng = stream(ctx.seed, 'place', 'island', island.id, 'trees');
    const treeCount = Math.round((area / (950 * unitArea)) * ctx.density);
    const groves = treeCount >= 6 ? treeRng.int(1, 2) : treeCount >= 3 ? 1 : 0;
    const groveCentres: { x: number; y: number; r: number }[] = [];
    for (let g = 0; g < groves; g++) {
      const p = sample(treeRng, island, 0.6);
      groveCentres.push({ x: p.x, y: p.y, r: island.radius * 0.32 });
    }
    // Groves share a foliage ramp, so a wood reads as one species with individuals.
    const groveFoliage = groveCentres.map(() => treeRng.int(0, ctx.palette.foliage.length - 1));
    for (let i = 0; i < treeCount; i++) {
      const inGrove = groveCentres.length > 0 && treeRng.chance(0.65);
      const g = inGrove ? treeRng.int(0, groveCentres.length - 1) : -1;
      const size = Math.round(treeRng.range(18, 32) * treeScale);
      const placed = tryPlace(ctx, treeRng, island, 'tree', 'vegetation', size, `tree-${i}`, {
        tries: 14,
        depth: 4 * S,
        margin: CORRIDOR,
        near: g >= 0 ? groveCentres[g] : undefined,
        variation: g >= 0 ? { foliage: groveFoliage[g] } : undefined,
        avoid: { x: hub.x, y: hub.y, r: 6 * S },
      });
      if (placed) out.push(placed.placement);
    }

    // ── Bushes and rocks ─────────────────────────────────────────────────
    const bushRng = stream(ctx.seed, 'place', 'island', island.id, 'bushes');
    const bushCount = Math.round((area / (1400 * unitArea)) * ctx.density);
    for (let i = 0; i < bushCount; i++) {
      const placed = tryPlace(ctx, bushRng, island, 'bush', 'vegetation', Math.round(bushRng.int(9, 16) * S), `bush-${i}`, { tries: 10, depth: 3 * S, margin: CORRIDOR });
      if (placed) out.push(placed.placement);
    }
    const rockRng = stream(ctx.seed, 'place', 'island', island.id, 'rocks');
    const rockCount = Math.round((area / (2600 * unitArea)) * ctx.density) + (rockRng.chance(0.5) ? 1 : 0);
    for (let i = 0; i < rockCount; i++) {
      const placed = tryPlace(ctx, rockRng, island, 'rock', 'vegetation', Math.round(rockRng.int(5, 14) * S), `rock-${i}`, { tries: 10, depth: 2 * S, margin: CORRIDOR });
      if (placed) out.push(placed.placement);
    }

    // ── Flowers in clusters, tufts scattered ────────────────────────────
    const flowerRng = stream(ctx.seed, 'place', 'island', island.id, 'flowers');
    const clusters = Math.round((area / (2200 * unitArea)) * ctx.density);
    for (let c = 0; c < clusters; c++) {
      const centre = sample(flowerRng, island, 0.85);
      const n = flowerRng.int(3, 6);
      const color = flowerRng.int(0, ctx.palette.flowers.length - 1);
      for (let i = 0; i < n; i++) {
        const placed = tryPlace(ctx, flowerRng, island, 'flower', 'details', flowerRng.int(4, 7), `flower-${c}-${i}`, { tries: 6, depth: 2 * S, margin: 0, near: { x: centre.x, y: centre.y, r: 7 * S }, variation: { color } });
        if (placed) out.push(placed.placement);
      }
    }
    const tuftRng = stream(ctx.seed, 'place', 'island', island.id, 'tufts');
    const tufts = Math.round((area / (260 * unitArea)) * ctx.density * 1.4);
    for (let i = 0; i < tufts; i++) {
      const placed = tryPlace(ctx, tuftRng, island, 'grass', 'details', 4, `tuft-${i}`, { tries: 4, depth: 2 * S, margin: 0 });
      if (placed) out.push(placed.placement);
    }
  }
  return out;
}
