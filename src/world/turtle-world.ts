/**
 * THE TURTLE WORLD. The shell's top is the island: the existing terrain
 * raster, hubs, paths, placement and ground dressing all run on an Island
 * record whose radius function is the shell's oval. What the turtle adds:
 *
 *  - the beach bands become the shell RIM, the head, neck, flippers and tail
 *    become SKIN, and the sea's foam and shallows wrap the whole animal;
 *  - a freshwater POND with a muddy bank, flower MEADOWS and a second clearing
 *    give the terrain features to walk to;
 *  - the hub gets paths to the front of the shell (the "prow") and to the pond.
 *
 * Everything the character touches is still a terrain class, so collision,
 * placement and the live world work unchanged.
 */
import { stream } from '../core/rng';
import { createNoise } from '../core/noise';
import { PALETTES } from '../core/palette';
import { islandRadius, makePlateau } from './layout';
import { rasterizeTerrain, bandsFor } from './terrain';
import { buildPath, chooseHubs } from './paths';
import { Occupancy, placeObjects } from './placement';
import { DEFAULT_WORLD_OPTIONS, T, type Island, type Path, type Placement, type TerrainMap, type WorldDescription, type WorldOptions } from './types';
import { OBJECT_GENERATORS } from '../objects';
import { generateTurtleGenome, turtleAnatomy, turtleBodyDistance, turtlePartAt, type TurtleAnatomy } from '../turtle/turtle';
import { TAU } from '../core/math';

export const DEFAULT_TURTLE_OPTIONS: WorldOptions = { ...DEFAULT_WORLD_OPTIONS, kind: 'turtle', width: 704, height: 480, islands: 1 };

/** The Island record a turtle's shell is: an oval with faceted edges, the same radius function the body uses. */
export function shellIsland(a: TurtleAnatomy): Island {
  const g = a.genome;
  return {
    id: 0,
    cx: a.cx,
    cy: a.cy,
    radius: a.meanRadius,
    harmonics: [
      { k: 6, amp: g.facets, phase: g.facetPhase + Math.PI / 2 },
      { k: 4, amp: g.squareness, phase: Math.PI / 2 },
    ],
    roughness: 0,
    parent: -1,
    coast: [],
    plateau: null,
    aspect: a.ry / a.rx,
  };
}

/** Rewrite the sea around the shell: rim, skin, and foam that follows the whole body. */
function turtleize(terrain: TerrainMap, a: TurtleAnatomy, scale: number): void {
  const { width, height, cls, dist } = terrain;
  const B = bandsFor(scale);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const d = dist[i];
      if (d <= 0) continue; // the shell top keeps its land classes
      if (d <= a.rimWidth) {
        cls[i] = T.RIM;
        continue;
      }
      const part = turtlePartAt(a, x, y);
      if (part) {
        cls[i] = T.SKIN;
        continue;
      }
      const sea = Math.min(d - a.rimWidth, turtleBodyDistance(a, x, y));
      cls[i] = sea <= B.foam + 0.5 ? T.FOAM : sea <= B.foam + B.shallow ? T.SHALLOW : sea <= B.deep ? T.WATER : T.DEEP;
    }
}

interface Pond {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  phase: number;
}

/** A pond off the hub, inside the shell, never under the plateau rim. */
function placePond(seed: string, terrain: TerrainMap, island: Island, hub: { x: number; y: number }, scale: number): Pond | null {
  const rng = stream(seed, 'turtle', 'pond');
  if (!rng.chance(0.85)) return null;
  const { width, cls, dist, elevation } = terrain;
  for (let tries = 0; tries < 30; tries++) {
    const ang = rng.range(0, TAU);
    const r = island.radius * rng.range(0.3, 0.62);
    const cx = Math.round(island.cx + Math.cos(ang) * r * (island.aspect && island.aspect < 1 ? 1 : 0.9));
    const cy = Math.round(island.cy + Math.sin(ang) * r);
    const rx = rng.range(9, 14) * scale;
    const ry = rx * rng.range(0.6, 0.8);
    if (Math.hypot(cx - hub.x, cy - hub.y) < rx + 16 * scale) continue;
    // The whole pond plus its bank must be interior grass on one level.
    let ok = true;
    const level = elevation[cy * width + cx];
    for (let k = 0; k < 16 && ok; k++) {
      const t = (k / 16) * TAU;
      const px = Math.round(cx + Math.cos(t) * (rx + 3 * scale));
      const py = Math.round(cy + Math.sin(t) * (ry + 3 * scale));
      const j = py * width + px;
      if (px < 0 || py < 0 || px >= width || j >= cls.length) ok = false;
      else if (dist[j] > -8 * scale || elevation[j] !== level || (cls[j] !== T.GRASS && cls[j] !== T.GRASS_PATCH && cls[j] !== T.GRASS_DARK)) ok = false;
    }
    if (!ok) continue;
    return { cx, cy, rx, ry, phase: rng.range(0, TAU) };
  }
  return null;
}

function carvePond(terrain: TerrainMap, p: Pond): void {
  const { width, height, cls } = terrain;
  const r = (angle: number) => 1 + 0.08 * Math.sin(3 * angle + p.phase) + 0.04 * Math.sin(5 * angle);
  const bank = 1.5;
  for (let y = Math.max(0, Math.floor(p.cy - p.ry - bank - 1)); y <= Math.min(height - 1, Math.ceil(p.cy + p.ry + bank + 1)); y++)
    for (let x = Math.max(0, Math.floor(p.cx - p.rx - bank - 1)); x <= Math.min(width - 1, Math.ceil(p.cx + p.rx + bank + 1)); x++) {
      const dx = x + 0.5 - p.cx;
      const dy = y + 0.5 - p.cy;
      const ang = Math.atan2(dy / p.ry, dx / p.rx);
      const k = Math.hypot(dx / p.rx, dy / p.ry) / r(ang);
      const i = y * width + x;
      if (k <= 1) cls[i] = T.POND;
      else if (k <= 1 + bank / Math.min(p.rx, p.ry)) cls[i] = T.POND_EDGE;
    }
}

/** Flower meadows: one or two soft patches of lighter grass with blooms, away from the hub. */
function paintMeadows(seed: string, terrain: TerrainMap, island: Island, hub: { x: number; y: number }, scale: number): void {
  const rng = stream(seed, 'turtle', 'meadow');
  const { width, height, cls, dist } = terrain;
  const noise = createNoise(`${seed}/meadow`, 18 * scale);
  const count = rng.int(1, 2);
  for (let m = 0; m < count; m++) {
    const ang = rng.range(0, TAU);
    const r = island.radius * rng.range(0.25, 0.6);
    const cx = island.cx + Math.cos(ang) * r;
    const cy = island.cy + Math.sin(ang) * r;
    if (Math.hypot(cx - hub.x, cy - hub.y) < 20 * scale) continue;
    const rx = rng.range(14, 22) * scale;
    const ry = rx * rng.range(0.55, 0.8);
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(height - 1, Math.ceil(cy + ry)); y++)
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(width - 1, Math.ceil(cx + rx)); x++) {
        const k = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
        // A soft, lobed edge from low-frequency noise rather than a hard ellipse.
        if (k > 0.75 + 0.3 * noise.at(x, y)) continue;
        const i = y * width + x;
        if ((cls[i] === T.GRASS || cls[i] === T.GRASS_PATCH) && dist[i] <= -6 * scale) cls[i] = T.MEADOW;
      }
  }
}

export function generateTurtleWorld(seed: string, partial: Partial<WorldOptions> = {}): WorldDescription {
  const t0 = performance.now();
  const options: WorldOptions = { ...DEFAULT_TURTLE_OPTIONS, ...partial, kind: 'turtle', islands: 1 };
  const palette = PALETTES[options.palette] ?? PALETTES.cozy;
  const scale = options.scale;
  const genome = generateTurtleGenome(options.turtleSeed ?? seed);
  const anatomy = turtleAnatomy(genome, options.width, options.height, scale);
  const island = shellIsland(anatomy);
  island.plateau = makePlateau(seed, island);

  // 1. Land on the shell, then the sea rewritten around the animal.
  let terrain = rasterizeTerrain(seed, options, [island], [], []);
  turtleize(terrain, anatomy, scale);

  // 2. Hub, pond, meadows, paths.
  const hubs = chooseHubs(seed, terrain, [island], scale);
  const hub = hubs[0];
  const pond = placePond(seed, terrain, island, hub, scale);
  if (pond) carvePond(terrain, pond);
  paintMeadows(seed, terrain, island, hub, scale);
  const paths: Path[] = [];
  // The prow: a short path from the hub toward the front (south) edge, where the head is.
  const prow = { x: hub.x + 0.5, y: hub.y + Math.round(islandRadius(island, Math.PI / 2) * 0.62) };
  paths.push(buildPath(seed, 'prow', terrain, 0, hub, prow, Math.round(4 * scale)));
  if (pond) paths.push(buildPath(seed, 'pond', terrain, 0, hub, { x: pond.cx - pond.rx - 4 * scale, y: pond.cy + 1 }, Math.round(3 * scale)));
  // The overlook: a path between the hub and the plateau's centre, so the raised ground always has a ramp.
  if (island.plateau) paths.push(buildPath(seed, 'overlook', terrain, 0, hub, { x: island.plateau.cx + 0.5, y: island.plateau.cy + 0.5 }, Math.round(3 * scale)));
  terrain = rasterizeTerrain(seed, options, [island], [], paths);
  turtleize(terrain, anatomy, scale);
  if (pond) carvePond(terrain, pond);
  paintMeadows(seed, terrain, island, hub, scale);

  // 3. Placement on the shell top.
  const occupancy = new Occupancy(terrain);
  if (pond) occupancy.block(pond.cx - pond.rx - 4, pond.cy - pond.ry - 4, pond.rx * 2 + 8, pond.ry * 2 + 8);
  const objects: Placement[] = placeObjects({ seed, palette, terrain, islands: [island], hubs, density: options.density, occupancy, scale });
  const housePaths: Path[] = [];
  for (const o of objects) if (o.kind === 'house') housePaths.push(buildPath(seed, `house-${o.island}`, terrain, 0, hub, { x: o.x + 0.5, y: o.y + 3 }, Math.round(3 * scale)));
  if (housePaths.length) {
    const withHouses = rasterizeTerrain(seed, options, [island], [], [...paths, ...housePaths]);
    for (let i = 0; i < terrain.cls.length; i++) if (withHouses.cls[i] === T.PATH && terrain.cls[i] !== T.POND && terrain.cls[i] !== T.POND_EDGE) terrain.cls[i] = T.PATH;
    paths.push(...housePaths);
  }
  dressGroundTurtle(terrain, objects, hub, options.palette, scale);

  let landPixels = 0;
  for (let i = 0; i < terrain.cls.length; i++) if (terrain.cls[i] >= T.GRASS_EDGE && terrain.cls[i] !== T.RIM && terrain.cls[i] !== T.SKIN) landPixels++;
  const counts: Record<string, number> = {};
  for (const o of objects) counts[o.kind] = (counts[o.kind] ?? 0) + 1;
  return {
    seed,
    options,
    islands: [island],
    bridges: [],
    piers: [],
    paths,
    hubs,
    terrain,
    objects,
    turtle: anatomy,
    stats: { islands: 1, bridges: 0, piers: 0, landPixels, objects: counts, generationMs: performance.now() - t0 },
  };
}

/** Forest floor under trees and a clearing round the hub, as the island world does. */
function dressGroundTurtle(terrain: TerrainMap, objects: Placement[], hub: { x: number; y: number }, paletteName: string, scale: number): void {
  const { width, height, cls } = terrain;
  const isGrass = (i: number) => cls[i] === T.GRASS || cls[i] === T.GRASS_PATCH || cls[i] === T.GRASS_DARK;
  const r = Math.round(11 * scale);
  for (let y = Math.max(0, hub.y - r); y <= Math.min(height - 1, hub.y + r); y++)
    for (let x = Math.max(0, hub.x - r); x <= Math.min(width - 1, hub.x + r); x++) {
      const i = y * width + x;
      if (isGrass(i) && Math.hypot(x - hub.x, (y - hub.y) * 1.3) <= r) cls[i] = T.GRASS_PATCH;
    }
  const palette = PALETTES[paletteName] ?? PALETTES.cozy;
  for (const o of objects) {
    if (o.kind !== 'tree') continue;
    const sprite = OBJECT_GENERATORS.tree({ seed: o.seed, size: o.size, palette, variation: o.variation as never });
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
