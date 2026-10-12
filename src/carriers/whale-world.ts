/**
 * THE WHALE WORLD (M8 phase 0): a playable world carried by a Ridge Carrier. The same terrain, path and placement
 * pipeline as the turtle and manta worlds, on a long body:
 *
 *  - the land is a long, narrow ridge meadow along the whale's spine, between the blowholes (east) and the knuckles
 *    near the tail (west), fitted inside its still trunk with room left round it to grow;
 *  - where the land meets the skin it has a mossy fringe (a whale's back is no beach), walkable like any shore;
 *  - the trunk is SKIN (not walkable, drawn from the whale's body); the long fins and the flukes sway and rise as
 *    animated sprites over the sea (`creatureParts`), the spout and the eyes as drawn moments; the sea's bands
 *    wrap the trunk;
 *  - hubs, paths (fore toward the head, aft toward the tail, along the spine), a plateau, meadows and objects come
 *    from the shared generators, so collision, navigation, building, farming, housing, saving and the camera all
 *    work unchanged.
 *
 * Deterministic from (world seed, whale seed, options). Turtle and manta worlds never import this module.
 */
import { stream } from '../core/rng';
import { TAU } from '../core/math';
import { PALETTES } from '../core/palette';
import { Mask } from '../core/pixel';
import { makePlateau } from '../world/layout';
import { rasterizeTerrain, bandsFor } from '../world/terrain';
import { buildPath, chooseHubs } from '../world/paths';
import { Occupancy, placeObjects } from '../world/placement';
import { dressGroundTurtle, paintMeadows } from '../world/turtle-world';
import { T, type Island, type Path, type Placement, type TerrainMap, type WorldDescription, type WorldOptions } from '../world/types';
import { generateWhaleGenome, whaleAnatomy, whaleBody, type WhaleAnatomy } from './whale';
import { insideDistance, outsideDistance, type WhaleInfo } from './creature';

export const DEFAULT_WHALE_OPTIONS: WorldOptions = { width: 1280, height: 768, palette: 'cozy', islands: 1, density: 1, scale: 1.6, kind: 'whale' };

/** The whale's still trunk at rest (snout to tail stock): the fins and the flukes move, so they are not part of it. */
export function whaleCore(a: WhaleAnatomy): Mask {
  return whaleBody(a, 0).trunk;
}

/** Where along the body land may grow: behind the eyes and blowholes, before the knuckles. */
export function whaleGrowRange(a: WhaleAnatomy): { x0: number; x1: number } {
  return { x0: Math.round(a.x(0.87)), x1: Math.round(a.x(0.23)) };
}

export function generateWhaleWorld(seed: string, partial: Partial<WorldOptions> = {}): WorldDescription {
  const t0 = performance.now();
  const options: WorldOptions = { ...DEFAULT_WHALE_OPTIONS, ...partial, kind: 'whale', islands: 1 };
  const { width, height, scale } = options;
  const palette = PALETTES[options.palette] ?? PALETTES.cozy;
  const whaleSeed = options.carrierSeed ?? seed;
  const a = whaleAnatomy(generateWhaleGenome(whaleSeed), width, height);
  const core = whaleCore(a);
  const toEdge = insideDistance(core, width, height);
  const B = bandsFor(scale);
  // A wide margin: the skin left round the land is where the island grows.
  const margin = Math.round(11 * scale);
  // The island: a long oval on the spine, shrunk until all of it (with its fringe) sits on the trunk, clear of its
  // edge, between the blowholes and the knuckles.
  const rng = stream(seed, 'whale-world', 'island');
  const harmonics = [2, 3, 5].map((k) => ({ k, amp: rng.range(0.015, 0.035), phase: rng.range(0, TAU) }));
  const range = whaleGrowRange(a);
  // A young island sits forward on the back, behind the fins; the long back behind it is where it grows.
  const cx = Math.round(a.x(0.46));
  let island: Island = { id: 0, cx, cy: a.cy, radius: 0, harmonics, roughness: 0.05, parent: -1, coast: [], plateau: null, aspect: 1 };
  for (let fit = 1; fit > 0.4; fit -= 0.03) {
    const rx = ((a.x(0.29) - a.x(0.63)) / 2) * fit;
    const ry = a.half(0.46) * 0.78 * fit;
    island = { ...island, radius: (rx + ry) / 2, aspect: ry / rx };
    let ok = true;
    const reachX = rx * 1.12 + B.sandSouth + 2;
    const reachY = ry * 1.25 + B.sandSouth + 2;
    for (let y = Math.floor(island.cy - reachY); y <= Math.ceil(island.cy + reachY) && ok; y += 2)
      for (let x = Math.floor(island.cx - reachX); x <= Math.ceil(island.cx + reachX) && ok; x += 2) {
        const dx = x + 0.5 - island.cx;
        const dy = y + 0.5 - island.cy;
        const r = Math.hypot(dx / rx, dy / ry);
        if (r > 1.08 + (B.sandSouth + 2) / Math.min(rx, ry)) continue;
        if (x < range.x0 || x > range.x1 || x < 0 || y < 0 || x >= width || y >= height || toEdge[y * width + x] < margin) ok = false;
      }
    if (ok) break;
  }
  island.plateau = makePlateau(seed, island);

  // Land and its shore bands from the shared rasterizer; then the body and the sea around it.
  const classify = (terrain: TerrainMap) => {
    const seaDist = outsideDistance(core, width, height);
    for (let i = 0; i < terrain.cls.length; i++) {
      const c = terrain.cls[i];
      if (terrain.dist[i] <= 0) continue; // land keeps its classes
      if (core.get(i % width, (i / width) | 0)) {
        // The shore's bands become a mossy fringe on the whale's back; the rest of the trunk is the animal.
        terrain.cls[i] = c === T.SAND || c === T.SAND_WET ? T.MOSS : T.SKIN;
        continue;
      }
      const d = seaDist[i];
      terrain.cls[i] = d <= 0 ? T.WATER : d <= B.foam + 1 ? T.FOAM : d <= B.foam + B.shallow ? T.SHALLOW : d <= B.deep ? T.WATER : T.DEEP;
    }
  };
  let terrain = rasterizeTerrain(seed, options, [island], [], []);
  classify(terrain);
  const hubs = chooseHubs(seed, terrain, [island], scale);
  const hub = hubs[0];
  paintMeadows(seed, terrain, island, hub, scale);
  const paths: Path[] = [];
  // Along the spine: fore toward the head (east, where one listens to the Carrier) and aft toward the tail.
  const longR = island.radius * (2 / (1 + island.aspect!));
  paths.push(buildPath(seed, 'spine-fore', terrain, 0, hub, { x: island.cx + longR * 0.72, y: island.cy + 0.5 }, Math.round(4 * scale)));
  paths.push(buildPath(seed, 'spine-aft', terrain, 0, hub, { x: island.cx - longR * 0.7, y: island.cy + 0.5 }, Math.round(3 * scale)));
  if (island.plateau) paths.push(buildPath(seed, 'overlook', terrain, 0, hub, { x: island.plateau.cx + 0.5, y: island.plateau.cy + 0.5 }, Math.round(3 * scale)));
  terrain = rasterizeTerrain(seed, options, [island], [], paths);
  classify(terrain);
  paintMeadows(seed, terrain, island, hub, scale);

  const occupancy = new Occupancy(terrain);
  const objects: Placement[] = placeObjects({ seed, palette, terrain, islands: [island], hubs, density: options.density, occupancy, scale });
  dressGroundTurtle(terrain, objects, hub, options.palette, scale);
  let landPixels = 0;
  for (let i = 0; i < terrain.cls.length; i++) if (terrain.cls[i] >= T.GRASS_EDGE && terrain.cls[i] !== T.RIM && terrain.cls[i] !== T.SKIN) landPixels++;
  const counts: Record<string, number> = {};
  for (const o of objects) counts[o.kind] = (counts[o.kind] ?? 0) + 1;
  const creature: WhaleInfo = { species: 'whale', seed: whaleSeed, head: { cx: Math.round(a.head.x), cy: Math.round(a.head.y) }, anatomy: a, growRange: range };
  return {
    seed,
    options: { ...options, carrierSeed: whaleSeed },
    islands: [island],
    bridges: [],
    piers: [],
    paths,
    hubs,
    terrain,
    objects,
    creature,
    stats: { islands: 1, bridges: 0, piers: 0, landPixels, objects: counts, generationMs: performance.now() - t0 },
  };
}
