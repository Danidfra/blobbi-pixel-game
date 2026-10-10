/**
 * generateWorld(seed, options): the whole pipeline, as plain data.
 *
 *   seed ─► layout ─► terrain raster ─► bridges (read off the land) ─► hubs & paths
 *        ─► paths carved ─► placement ─► WorldDescription
 */
import { PALETTES, type WorldPalette } from '../core/palette';
import { layoutIslands } from './layout';
import { rasterizeTerrain } from './terrain';
import { resolveBridges } from './bridges';
import { bridgeLandings, buildPath, chooseHubs } from './paths';
import { Occupancy, placeObjects } from './placement';
import { DEFAULT_WORLD_OPTIONS, T, type Path, type Pier, type Placement, type WorldDescription, type WorldOptions } from './types';
import { stream } from '../core/rng';
import { OBJECT_GENERATORS } from '../objects';

export function paletteFor(name: string): WorldPalette {
  return PALETTES[name] ?? PALETTES.cozy;
}

export function generateWorld(seed: string, partial: Partial<WorldOptions> = {}): WorldDescription {
  const t0 = performance.now();
  const options: WorldOptions = { ...DEFAULT_WORLD_OPTIONS, ...partial };
  const palette = paletteFor(options.palette);
  const layout = layoutIslands(seed, options);

  // 1. Land first, without paths, so bridges can be read off real shores.
  let terrain = rasterizeTerrain(seed, options, layout.islands, [], []);
  const scale = options.scale;
  const bridges = resolveBridges(terrain, layout.islands, layout.bridges, scale);

  // 2. Hubs and paths.
  const hubs = chooseHubs(seed, terrain, layout.islands, scale);
  const paths: Path[] = [];
  for (const b of bridges) {
    const land = bridgeLandings(b);
    paths.push(buildPath(seed, `bridge-${b.id}-from`, terrain, b.from, hubs[b.from], land.from, Math.round(4 * scale)));
    paths.push(buildPath(seed, `bridge-${b.id}-to`, terrain, b.to, hubs[b.to], land.to, Math.round(4 * scale)));
  }

  // 3. Placement happens on the terrain WITH paths, so nothing stands on a path;
  //    houses then get their own path to the hub, carved in a final pass.
  terrain = rasterizeTerrain(seed, options, layout.islands, bridges, paths);
  const occupancy = new Occupancy(terrain);
  for (const b of bridges) {
    const land = bridgeLandings(b);
    occupancy.block(land.from.x - 5 * scale, land.from.y - 5 * scale, 10 * scale, 10 * scale);
    occupancy.block(land.to.x - 5 * scale, land.to.y - 5 * scale, 10 * scale, 10 * scale);
  }
  const objects: Placement[] = placeObjects({ seed, palette, terrain, islands: layout.islands, hubs, density: options.density, occupancy, scale });

  const housePaths: Path[] = [];
  for (const o of objects) {
    if (o.kind !== 'house') continue;
    const door = { x: o.x + 0.5, y: o.y + 3 };
    housePaths.push(buildPath(seed, `house-${o.island}`, terrain, o.island, hubs[o.island], door, Math.round(3 * scale)));
  }
  if (housePaths.length) {
    const withHouses = rasterizeTerrain(seed, options, layout.islands, bridges, [...paths, ...housePaths]);
    // Keep the placement terrain's classes except where the new paths were carved.
    for (let i = 0; i < terrain.cls.length; i++) if (withHouses.cls[i] === T.PATH) terrain.cls[i] = T.PATH;
    paths.push(...housePaths);
  }

  // 5. Piers: a short wooden deck from a sandy shore into the shallows, on some islands.
  const piers = placePiers(seed, terrain, layout.islands, bridges, scale);

  // 6. Ground that remembers what stands on it: darker grass under tree groves, a clearing round each hub.
  dressGround(terrain, objects, hubs, palette.name, scale);

  let landPixels = 0;
  for (let i = 0; i < terrain.cls.length; i++) if (terrain.cls[i] >= T.GRASS_EDGE) landPixels++;
  const counts: Record<string, number> = {};
  for (const o of objects) counts[o.kind] = (counts[o.kind] ?? 0) + 1;
  return {
    seed,
    options,
    islands: layout.islands,
    bridges,
    piers,
    paths,
    hubs,
    terrain,
    objects,
    stats: { islands: layout.islands.length, bridges: bridges.length, piers: piers.length, landPixels, objects: counts, generationMs: performance.now() - t0 },
  };
}

/** A pier per island that has a calm southern or eastern shore for it, at most two per world. */
function placePiers(seed: string, terrain: { width: number; height: number; cls: Uint8Array; owner: Int8Array }, islands: WorldDescription['islands'], bridges: WorldDescription['bridges'], scale: number): Pier[] {
  const rng = stream(seed, 'piers');
  const out: Pier[] = [];
  const { width, height, cls, owner } = terrain;
  for (const isl of islands) {
    if (out.length >= 2 || !rng.chance(0.65)) continue;
    const axis = rng.chance(0.6) ? 'v' : 'h';
    const dir = axis === 'v' ? 1 : rng.chance(0.5) ? 1 : -1;
    // Try a few lines near the centre; walk outward from the centre until sand, then require open shallow water beyond.
    for (let attempt = 0; attempt < 6; attempt++) {
      const off = Math.round(rng.centered() * isl.radius * 0.5);
      const line = Math.round(axis === 'v' ? isl.cx + off : isl.cy + off);
      let p = Math.round(axis === 'v' ? isl.cy : isl.cx);
      const at = (q: number) => (axis === 'v' ? line + q * width : q + line * width);
      const limit = axis === 'v' ? height : width;
      if (line < 4 || line >= (axis === 'v' ? width : height) - 4) continue;
      // Walk out through the grass and the beach to the water's edge.
      while (p > 0 && p < limit - 1 && cls[at(p)] >= T.SAND) p += dir;
      if (owner[at(p - dir * 4)] !== isl.id) continue;
      // p is the first wet pixel; the pier starts three pixels back on the sand.
      const start = p - dir * 3;
      const length = Math.round(rng.int(12, 18) * scale);
      const end = start + dir * length;
      if (end < 2 || end >= limit - 2) continue;
      let ok = true;
      for (let q = start + dir * 3; q !== end + dir; q += dir) {
        const c = cls[at(q)];
        if (c !== T.SHALLOW && c !== T.FOAM && c !== T.SAND_WET && c !== T.WATER) ok = false;
      }
      // Must not collide with a bridge.
      for (const b of bridges) if (Math.abs((axis === 'v' ? b.x0 : b.y0) - line) < 12 * scale && Math.abs((axis === 'v' ? b.y0 : b.x0) - start) < 30 * scale) ok = false;
      if (!ok) continue;
      out.push({ island: isl.id, axis, x0: axis === 'v' ? line : start, y0: axis === 'v' ? start : line, x1: axis === 'v' ? line : end, y1: axis === 'v' ? end : line, width: Math.round(5 * scale) | 1 });
      break;
    }
  }
  return out;
}

/** Forest floor under trees and a clearing at each hub, written into the terrain classes. */
function dressGround(terrain: { width: number; height: number; cls: Uint8Array }, objects: Placement[], hubs: { x: number; y: number }[], paletteName: string, scale: number): void {
  const { width, height, cls } = terrain;
  const isGrass = (i: number) => cls[i] === T.GRASS || cls[i] === T.GRASS_PATCH || cls[i] === T.GRASS_DARK;
  for (const h of hubs) {
    const r = Math.round(11 * scale);
    for (let y = Math.max(0, h.y - r); y <= Math.min(height - 1, h.y + r); y++)
      for (let x = Math.max(0, h.x - r); x <= Math.min(width - 1, h.x + r); x++) {
        const i = y * width + x;
        if (isGrass(i) && Math.hypot(x - h.x, (y - h.y) * 1.3) <= r) cls[i] = T.GRASS_PATCH;
      }
  }
  for (const o of objects) {
    if (o.kind !== 'tree') continue;
    const sprite = OBJECT_GENERATORS.tree({ seed: o.seed, size: o.size, palette: paletteFor(paletteName), variation: o.variation as never });
    const rx = sprite.footRx * 2.1 + 2 * scale;
    const ry = rx * 0.55;
    const cy = o.y + 1;
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(height - 1, Math.ceil(cy + ry)); y++)
      for (let x = Math.max(0, Math.floor(o.x - rx)); x <= Math.min(width - 1, Math.ceil(o.x + rx)); x++) {
        const i = y * width + x;
        const u = (x + 0.5 - o.x) / rx;
        const v = (y + 0.5 - cy) / ry;
        if (u * u + v * v <= 1 && (cls[i] === T.GRASS || cls[i] === T.GRASS_PATCH)) cls[i] = T.GRASS_DARK;
      }
  }
}
