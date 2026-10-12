/**
 * THE MANTA WORLD (M7): a playable world carried by a Wing Carrier. The same terrain, path and placement pipeline as
 * the turtle world, on a different body:
 *
 *  - the land is a wide, flat island fitted inside the manta's still core (the part of the disc that never moves),
 *    with a sandy beach on the manta's back (a manta island has a beach; a turtle island does not);
 *  - the core of the body is SKIN (not walkable, drawn from the manta's body); the wing tips beyond it rise and fall
 *    as animated sprites over the sea (`creatureParts`); the sea's bands wrap the body at rest;
 *  - hubs, paths, a plateau, meadows and objects come from the shared generators, so collision, navigation,
 *    building, farming, housing, saving and the camera all work unchanged.
 *
 * Deterministic from (world seed, manta seed, options). Turtle worlds never import this module.
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
import { generateMantaGenome, mantaAnatomy, mantaBody, MANTA_CORE, type MantaAnatomy } from './manta';
import { insideDistance, outsideDistance, type CreatureInfo } from './creature';

export const DEFAULT_MANTA_OPTIONS: WorldOptions = { width: 1024, height: 768, palette: 'cozy', islands: 1, density: 1, scale: 1.6, kind: 'manta' };

export type { CreatureInfo } from './creature';

/** The manta's still core at rest: the disc within |u| ≤ MANTA_CORE, plus the horns (the whip moves). */
export function mantaCore(a: MantaAnatomy): Mask {
  const body = mantaBody(a, 0, 0);
  const core = new Mask(a.w, a.h);
  const half = a.S * MANTA_CORE;
  for (let y = 0; y < a.h; y++)
    for (let x = 0; x < a.w; x++) {
      if (!body.all.get(x, y)) continue;
      if (Math.abs(x + 0.5 - a.cx) > half) continue;
      // The whip (behind the disc, north) is animated, not core.
      if (y < a.cy - a.C * 0.36) continue;
      core.set(x, y);
    }
  return core;
}

export function generateMantaWorld(seed: string, partial: Partial<WorldOptions> = {}): WorldDescription {
  const t0 = performance.now();
  const options: WorldOptions = { ...DEFAULT_MANTA_OPTIONS, ...partial, kind: 'manta', islands: 1 };
  const { width, height, scale } = options;
  const palette = PALETTES[options.palette] ?? PALETTES.cozy;
  const mantaSeed = options.carrierSeed ?? seed;
  const genome = generateMantaGenome(mantaSeed);
  const a = mantaAnatomy(genome, width, height);
  const core = mantaCore(a);
  const toEdge = insideDistance(core, width, height);
  const B = bandsFor(scale);
  const margin = Math.round(7 * scale);
  // The island: a wide oval on the disc, shrunk until all of it (with its beach) sits on the core, clear of its edge.
  const rng = stream(seed, 'manta-world', 'island');
  const harmonics = [2, 3, 5].map((k) => ({ k, amp: rng.range(0.015, 0.04), phase: rng.range(0, TAU) }));
  let fit = 1;
  let island: Island = { id: 0, cx: a.cx, cy: Math.round(a.cy - a.C * 0.05), radius: 0, harmonics, roughness: 0.05, parent: -1, coast: [], plateau: null, aspect: 1 };
  for (; fit > 0.4; fit -= 0.03) {
    const rx = a.S * 0.52 * fit;
    const ry = a.C * 0.3 * fit;
    island = { ...island, radius: (rx + ry) / 2, aspect: ry / rx };
    let ok = true;
    const reachX = rx * 1.2 + B.sandSouth + 2;
    const reachY = ry * 1.3 + B.sandSouth + 2;
    for (let y = Math.floor(island.cy - reachY); y <= Math.ceil(island.cy + reachY) && ok; y += 2)
      for (let x = Math.floor(island.cx - reachX); x <= Math.ceil(island.cx + reachX) && ok; x += 2) {
        const dx = x + 0.5 - island.cx;
        const dy = y + 0.5 - island.cy;
        const r = Math.hypot(dx / rx, dy / ry);
        if (r <= 1.08 + (B.sandSouth + 2) / Math.min(rx, ry) && (x < 0 || y < 0 || x >= width || y >= height || toEdge[y * width + x] < margin)) ok = false;
      }
    if (ok) break;
  }
  island.plateau = makePlateau(seed, island);

  // Land and its beach from the shared rasterizer; then the body and the sea around it.
  const classify = (terrain: TerrainMap) => {
    // The sea's still bands hug the still core; round the moving wing tips and whip the foam moves with them (it is
    // drawn with their frames), so no still foam line is left behind when a wing lifts.
    const seaDist = outsideDistance(core, width, height);
    for (let i = 0; i < terrain.cls.length; i++) {
      const c = terrain.cls[i];
      const onCore = core.get(i % width, (i / width) | 0);
      if (terrain.dist[i] <= 0) continue; // land keeps its classes
      if (onCore) {
        // The beach on the manta's back; the rest of the core is the animal.
        if (c === T.SAND || c === T.SAND_WET) continue;
        terrain.cls[i] = T.SKIN;
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
  // The prow: toward the head (south), where one listens to the Carrier; and two paths out along the wings.
  const southR = island.radius * (2 * island.aspect! / (1 + island.aspect!));
  paths.push(buildPath(seed, 'prow', terrain, 0, hub, { x: hub.x + 0.5, y: island.cy + southR * 0.6 }, Math.round(4 * scale)));
  const eastR = island.radius * (2 / (1 + island.aspect!));
  for (const side of [-1, 1]) paths.push(buildPath(seed, side < 0 ? 'wing-west' : 'wing-east', terrain, 0, hub, { x: island.cx + side * eastR * 0.62, y: island.cy + 2 }, Math.round(3 * scale)));
  if (island.plateau) paths.push(buildPath(seed, 'overlook', terrain, 0, hub, { x: island.plateau.cx + 0.5, y: island.plateau.cy + 0.5 }, Math.round(3 * scale)));
  terrain = rasterizeTerrain(seed, options, [island], [], paths);
  classify(terrain);
  paintMeadows(seed, terrain, island, hub, scale);

  const occupancy = new Occupancy(terrain);
  const objects: Placement[] = placeObjects({ seed, palette, terrain, islands: [island], hubs, density: options.density, occupancy, scale, houses: options.generatedHouse !== false });
  dressGroundTurtle(terrain, objects, hub, options.palette, scale);
  let landPixels = 0;
  for (let i = 0; i < terrain.cls.length; i++) if (terrain.cls[i] >= T.GRASS_EDGE && terrain.cls[i] !== T.RIM && terrain.cls[i] !== T.SKIN) landPixels++;
  const counts: Record<string, number> = {};
  for (const o of objects) counts[o.kind] = (counts[o.kind] ?? 0) + 1;
  const creature: CreatureInfo = { species: 'manta', seed: mantaSeed, head: { cx: a.cx, cy: a.cy + a.C * 0.43 }, anatomy: a };
  return {
    seed,
    options: { ...options, carrierSeed: mantaSeed },
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
