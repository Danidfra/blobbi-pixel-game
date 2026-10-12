/**
 * ISLAND GROWTH. A World Carrier's island grows by adding new land over the shell's free ring, region by region,
 * in three stages. The generator is a pure function of the stage-0 world (itself a pure function of its seeds)
 * and a stage, and it is VERSIONED: a save records the version its growth was made with.
 *
 * Invariants (tested):
 *  - Only shell-ring pixels (class RIM) ever become land; every pixel that was land stays land; the turtle's head,
 *    neck, flippers, tail, face and its Variant B shell are untouched (the shell keeps a ring of plates).
 *  - Nothing moves: existing objects keep their index, kind, seed and position (new ones are APPENDED); the base
 *    island record, the hubs, the paths and the carrier are the same objects; world coordinates are unchanged.
 *  - The only base pixels that change class are the old coastline's edge band where it is now inland (dark edge
 *    grass becomes plain grass, so no seam line runs through the new land). They were walkable and stay walkable.
 *  - Stage s+1 contains stage s exactly (land and objects).
 *
 * Geometry: the grown coastline is the base island record with a ring factor and extra coast lobes (the same
 * `CoastFeature` the generator already uses), evaluated with the base terrain's own edge wobble, and kept inside
 * the shell by a numerically measured limit per angle, so the new coast looks like the old one.
 */
import { stream } from '../core/rng';
import { createNoise } from '../core/noise';
import { TAU } from '../core/math';
import { PALETTES } from '../core/palette';
import { OBJECT_GENERATORS } from '../objects';
import { shellRadius } from '../turtle/turtle';
import { islandRadius } from './layout';
import { bandsFor, islandDistance } from './terrain';
import { T, type CoastFeature, type Island, type Placement, type WorldDescription } from './types';

/**
 * The growth generator's version. Bump it (and keep the old branch) whenever its output would change.
 *  1  M7: turtle and manta growth; the first whale growth (M8 phase 0).
 *  2  The whale's solid plants and rocks leave a Blobbi-wide passage between each other and to the coast, so its
 *     narrow aft land is never walled off (v1 could fence off the tip of the stage-3 grove). Turtle and manta
 *     worlds are identical in v1 and v2; a v1 save is still regrown exactly as v1.
 */
export const GROWTH_VERSION = 2;
/** Every version this generator can reproduce. */
export const GROWTH_VERSIONS: readonly number[] = [1, 2];
export const MAX_GROWTH_STAGE = 3;

export type BiomeId = 'meadow' | 'woodland' | 'rocky' | 'coastal' | 'mushroom';

export interface BiomeDef {
  id: BiomeId;
  name: string;
  /** The ground class its new land gets. */
  ground: number;
  note: string;
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  meadow: { id: 'meadow', name: 'Flower meadow', ground: T.MEADOW, note: 'Blooms in every colour, herbs and seeds; bees love it.' },
  woodland: { id: 'woodland', name: 'Little woodland', ground: T.GRASS_DARK, note: 'A young wood: sticks, wood and shade.' },
  rocky: { id: 'rocky', name: 'Rocky garden', ground: T.GRAVEL, note: 'Gravel and boulders with tough little flowers; stone and copper.' },
  coastal: { id: 'coastal', name: 'Shore turf', ground: T.CLOVER, note: 'Salt-loving turf along the new shore: reeds (fibre) and shells.' },
  mushroom: { id: 'mushroom', name: 'Mushroom grove', ground: T.MOSS, note: 'Soft moss under old trees, and mushrooms after rain.' },
};

export interface GrowthRegion {
  id: string;
  stage: 1 | 2 | 3;
  biome: BiomeId;
  /** Where on the coast, as an angle from the island's centre (radians; 0 east, π/2 south); null for a ring. */
  bearing: number | null;
}

export interface GrowthStageDef {
  stage: 1 | 2 | 3;
  name: string;
  regions: BiomeId[];
}

/** What each stage adds (the regions' bearings come from the world's seed). */
export const GROWTH_STAGES: readonly GrowthStageDef[] = [
  { stage: 1, name: 'The shore widens', regions: ['coastal', 'meadow'] },
  { stage: 2, name: 'Groves and stones', regions: ['woodland', 'rocky'] },
  { stage: 3, name: 'The deep green', regions: ['mushroom', 'coastal'] },
];

export interface WorldGrowth {
  version: number;
  stage: number;
  regions: GrowthRegion[];
  /** Objects before growth (the stage-0 world's): every index below this is the base world's. */
  baseObjects: number;
  /** The grown coastline (for drawing the shell's soil band along it). */
  land: Island;
  /** Per pixel: 0 base or never land; otherwise the 1-based index into `regions` of the region it belongs to. */
  region: Uint8Array;
  /** Per pixel: the stage the pixel became land at (0 base or never). */
  bornAt: Uint8Array;
  /** Pixels per region (same order as `regions`). */
  area: number[];
  /** Object count after each stage (index 0 = the base world's): stage s's new objects are [objectsAt[s-1], objectsAt[s]). */
  objectsAt: number[];
}

/** Can this world grow? A turtle on an enlarged shell (Variant A-C): there must be a shell ring to grow over. */
export function canGrow(base: WorldDescription): boolean {
  if (base.growth) return false;
  // A turtle on an enlarged shell grows over the shell's free ring; a creature (the manta) over its still back.
  return (!!base.turtle && !!base.carrier && base.carrier.variant > 0) || !!base.creature;
}

/** The class new land grows over: the turtle's shell ring, or a creature's back. */
const freeClass = (base: WorldDescription) => (base.turtle ? T.RIM : T.SKIN);

/** Steps from each SKIN pixel to the nearest pixel that is not SKIN (a creature's back: how far from its edge). */
function skinDepth(base: WorldDescription): Int32Array {
  const { width, height, cls } = base.terrain;
  const d = new Int32Array(width * height).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < cls.length; i++)
    if (cls[i] !== T.SKIN) {
      d[i] = 0;
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % width;
    const y = (i / width) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const j = yy * width + xx;
      if (d[j] < 0) {
        d[j] = d[i] + 1;
        queue.push(j);
      }
    }
  }
  return d;
}

interface Lobe extends CoastFeature {
  region: number;
}

interface Plan {
  regions: GrowthRegion[];
  /** Ring factor per stage (index 0..3). */
  ring: number[];
  lobes: Lobe[];
  /** Allowed outer radius per angle sample (from the island's centre). */
  limit: Float32Array;
}

const SAMPLES = 360;

/** The plan for a world: regions, bearings, sizes. Pure; version 1. */
export function planV1(base: WorldDescription): Plan {
  const island = base.islands[0];
  const a = base.turtle;
  const scale = base.options.scale;
  const { width, height, cls } = base.terrain;
  const lip = Math.max(2, Math.round(1.6 * scale));
  const keep = Math.round(2.5 * scale);
  const depth = a ? null : skinDepth(base);
  // A whale's land grows only between its blowholes and its knuckles (the head and the tail ridge stay its own).
  const whale = base.creature?.species === 'whale' ? base.creature : null;
  const range = whale?.growRange;
  const backKeep = Math.round(6 * scale);
  // The allowed radius per angle: march out from the coast while the pixel is free carrier surface: on a turtle,
  // far enough from the shell's edge that a ring of plates (and the lip) stays visible; on a creature, far enough
  // inside its back that the body still shows round the land.
  const allowed = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const i = y * width + x;
    if (!a) return cls[i] === T.SKIN && depth![i] >= backKeep && (!range || (x >= range.x0 && x <= range.x1));
    if (cls[i] !== T.RIM) return false;
    const dx = x + 0.5 - a.cx;
    const dy = y + 0.5 - a.cy;
    return shellRadius(a, Math.atan2(dy, dx)) + a.rimWidth - Math.hypot(dx, dy) >= lip + keep;
  };
  const limit = new Float32Array(SAMPLES);
  for (let k = 0; k < SAMPLES; k++) {
    const ang = (k / SAMPLES) * TAU;
    const r0 = islandRadius(island, ang);
    let r = r0 * 0.85;
    let last = r0;
    let seenRing = false;
    // (A whale's back runs far behind its island: its land may reach further.)
    for (; r < r0 * (whale ? 2.8 : 1.6); r += 0.5) {
      const x = Math.floor(island.cx + Math.cos(ang) * r);
      const y = Math.floor(island.cy + Math.sin(ang) * r);
      if (allowed(x, y)) {
        seenRing = true;
        last = r;
      } else if (seenRing && r - last > 6 * scale) break; // a short gap (a stray pixel) does not end the room
    }
    limit[k] = last;
  }
  const rng = stream(base.seed, 'growth', 'v1', 'plan');
  // Bearings: five lobes spread round the coast from a seeded start, never on the head's side (south, where the
  // listening spot is) for the first one, so the head stays the island's front.
  const start = rng.range(0, TAU);
  // Species growth geometry: a turtle's land grows round its shell (lobes spread round the compass); a manta's
  // grows out along its wings (east and west), never toward its head or tail.
  // A whale's grows the way it swims, toward its tail (west): first along the spine, then along both flanks behind
  // the fins, and last the rest of the way aft.
  const bearings = whale
    ? [Math.PI, -Math.PI / 2 - 0.35, Math.PI / 2 + 0.35, Math.PI].map((b) => (b + rng.range(-0.06, 0.06) + TAU) % TAU)
    : base.creature
      ? [0, Math.PI, -0.32, Math.PI + 0.32].map((b) => (b + rng.range(-0.08, 0.08) + TAU) % TAU)
      : [0, 1, 2, 3].map((i) => (start + (i * TAU) / 4 + rng.range(-0.25, 0.25)) % TAU);
  // The share of the room left at its bearing each whale lobe takes (the first aft lobe leaves room for the last).
  const whaleShare = [0.5, 1, 1, 1];
  const regions: GrowthRegion[] = [];
  const lobes: Lobe[] = [];
  let lobeIndex = 0;
  // The ring: a share of the narrowest room, at stage 1 and again (more) at stage 3.
  let minRoom = Infinity;
  for (let k = 0; k < SAMPLES; k++) minRoom = Math.min(minRoom, limit[k] / islandRadius(island, (k / SAMPLES) * TAU) - 1);
  minRoom = Math.max(0, minRoom);
  const ring = [0, minRoom * 0.18, minRoom * 0.18, minRoom * 0.4];
  for (const def of GROWTH_STAGES) {
    for (const biome of def.regions) {
      if (biome === 'coastal') {
        regions.push({ id: `s${def.stage}-${biome}`, stage: def.stage, biome, bearing: null });
        continue;
      }
      const bearing = bearings[lobeIndex++ % bearings.length];
      regions.push({ id: `s${def.stage}-${biome}`, stage: def.stage, biome, bearing });
      // A whale's lobes are broader: its land spreads along a long back, not round a dome.
      const width = rng.range(0.3, 0.38) * (whale ? 1.6 : 1);
      // The largest size that keeps the lobe (with the edge wobble at its widest) inside the limit everywhere.
      let size = Infinity;
      const k0 = Math.round((bearing / TAU) * SAMPLES);
      for (let dk = -60; dk <= 60; dk++) {
        const k = (((k0 + dk) % SAMPLES) + SAMPLES) % SAMPLES;
        const ang = (k / SAMPLES) * TAU;
        const d = wrap(ang - bearing) / width;
        const bump = Math.exp(-d * d * 1.6);
        if (bump < 0.02) continue;
        const r = islandRadius(island, ang) * (1 + ring[def.stage]);
        size = Math.min(size, (limit[k] / r - 1) / bump);
      }
      // A creature's land may be cut by the limit (the cut becomes beach), so its lobe reaches the room at its own
      // bearing; a turtle's must fit everywhere (the shell's soil band follows the uncut coastline).
      if (!a) size = limit[k0 % SAMPLES] / (islandRadius(island, bearing) * (1 + ring[def.stage])) - 1;
      // A whale's lobes share bearings: each takes its share of what the earlier lobes left at its bearing.
      if (whale) {
        let prior = 1;
        for (const l of lobes) {
          const d = wrap(bearing - l.angle) / l.width;
          prior *= 1 + l.size * Math.exp(-d * d * 1.6);
        }
        size = (limit[k0 % SAMPLES] / (islandRadius(island, bearing) * (1 + ring[def.stage]) * prior) - 1) * whaleShare[lobeIndex - 1];
      }
      lobes.push({ angle: bearing, width, size: Math.max(0, size * 1.02), kind: 'cape', region: regions.length - 1 });
    }
  }
  return { regions, ring, lobes, limit };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The grown coastline at a stage: the base record, a ring factor, and the lobes of every stage up to it. */
function landAt(island: Island, plan: Plan, stage: number): Island {
  const lobes = plan.lobes.filter((l) => plan.regions[l.region].stage <= stage).map(({ angle, width, size, kind }) => ({ angle, width, size, kind }));
  return { ...island, radius: island.radius * (1 + plan.ring[stage]), coast: [...(island.coast ?? []), ...lobes] };
}

/**
 * The world at a growth stage. Stage 0 returns the base world itself. Throws for an unknown version (a save from
 * a newer generator must not be "regrown" differently).
 */
export function growWorld(base: WorldDescription, stage: number, version = GROWTH_VERSION): WorldDescription {
  if (!GROWTH_VERSIONS.includes(version)) throw new Error(`unknown growth version ${version}`);
  if (stage <= 0 || !canGrow(base)) return base;
  stage = Math.min(MAX_GROWTH_STAGE, Math.floor(stage));
  const plan = planV1(base);
  const island = base.islands[0];
  const { width, height } = base.terrain;
  const scale = base.options.scale;
  const B = bandsFor(scale);
  const origin = base.carrier?.origin ?? { x: 0, y: 0 };
  const wobbleNoise = createNoise(`${base.seed}/terrain/wobble`, 28 * scale);
  const patchNoise = createNoise(`${base.seed}/growth/patch`, 20 * scale);
  const lands = [0, 1, 2, 3].map((s) => (s <= stage ? landAt(island, plan, s) : null));
  // The region a new pixel belongs to: the lobe of its stage that reaches it most, else that stage's ring (or the
  // nearest earlier one).
  const regionFor = (ang: number, s: number) => {
    let best = -1;
    let bestBump = 0.3;
    for (const l of plan.lobes) {
      if (plan.regions[l.region].stage !== s) continue;
      const d = wrap(ang - l.angle) / l.width;
      const bump = Math.exp(-d * d * 1.6);
      if (bump > bestBump) {
        bestBump = bump;
        best = l.region;
      }
    }
    if (best >= 0) return best;
    for (let t = s; t >= 1; t--) {
      const r = plan.regions.findIndex((g) => g.stage === t && g.bearing === null);
      if (r >= 0) return r;
    }
    return plan.regions.findIndex((g) => g.bearing === null);
  };
  // (A whale's land may reach much further along its back: see `planV1`.)
  const reach = Math.max(island.radius * (base.creature?.species === 'whale' ? 3.4 : 1.6), 40);
  const x0 = Math.max(0, Math.floor(island.cx - reach * 1.3));
  const x1 = Math.min(width - 1, Math.ceil(island.cx + reach * 1.3));
  const y0 = Math.max(0, Math.floor(island.cy - reach * 1.3));
  const y1 = Math.min(height - 1, Math.ceil(island.cy + reach * 1.3));
  const free = freeClass(base);
  const beach = !!base.creature;
  const beachW = bandsFor(scale).sandNorth + 1;
  // A creature island's shore: a manta's is a sandy beach, a whale's a mossy fringe.
  const shore = base.creature?.species === 'whale' ? T.MOSS : T.SAND;
  // The old shore's bands that become inland: the grass edge (both), and a creature island's shore.
  const seam = new Set<number>(beach ? (shore === T.MOSS ? [T.GRASS_EDGE, T.MOSS] : [T.GRASS_EDGE, T.SAND, T.SAND_WET]) : [T.GRASS_EDGE]);
  const limitAt = (ang: number) => plan.limit[Math.round((((ang + TAU) % TAU) / TAU) * SAMPLES) % SAMPLES];
  /** The terrain at stage `s` (each stage computed on its own, so objects are placed on the terrain they grew in). */
  const terrainAt = (s: number) => {
    const cls = base.terrain.cls.slice();
    const dist = base.terrain.dist.slice();
    const owner = base.terrain.owner.slice();
    const region = new Uint8Array(width * height);
    const bornAt = new Uint8Array(width * height);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * width + x;
        const px = x + 0.5;
        const py = y + 0.5;
        const was = base.terrain.cls[i];
        if (was !== free && !seam.has(was)) continue;
        const w = (wobbleNoise.fbm(px - origin.x, py - origin.y, 2) - 0.5) * 2 * island.roughness;
        const ang = Math.atan2(py - island.cy, px - island.cx);
        const rr = Math.hypot(px - island.cx, py - island.cy);
        const d = islandDistance(lands[s]!, px, py, w);
        if (was === free) {
          if (d > 0 || rr > limitAt(ang)) continue;
          // Which stage made it land: the first whose coastline covers it.
          let born = 1;
          while (born < s && islandDistance(lands[born]!, px, py, w) > 0) born++;
          bornAt[i] = born;
          const r = regionFor(ang, born);
          region[i] = r + 1;
          const ground = BIOMES[plan.regions[r].biome].ground;
          // The coast band where the land meets the shell; the biome's ground inside, with soft patches.
          const toShell = limitAt(ang) - rr;
          const edge = d > -B.grassEdge || toShell < B.grassEdge;
          const n = patchNoise.fbm(px, py, 2);
          // A creature's island keeps its shore (beach or moss) at its new edge, as its first shore had.
          const sand = beach && (d > -beachW || toShell < beachW);
          cls[i] = sand ? shore : edge || (beach && (d > -beachW - B.grassEdge || toShell < beachW + B.grassEdge)) ? T.GRASS_EDGE : ground === T.MEADOW && n > 0.62 ? T.GRASS_PATCH : ground === T.GRAVEL && n < 0.38 ? T.GRASS : ground;
          dist[i] = Math.max(d, -toShell);
          owner[i] = island.id;
        } else if (d <= -(beach ? beachW + B.grassEdge : B.grassEdge)) {
          // The old shore, now inland: no seam through the new land.
          cls[i] = T.GRASS;
          dist[i] = d;
        }
      }
    return { cls, dist, owner, region, bornAt };
  };
  const feet: Foot[] = [];
  const newObjects: Placement[] = [];
  const objectsAt = [base.objects.length];
  let final = terrainAt(1);
  for (let s = 1; s <= stage; s++) {
    if (s > 1) final = terrainAt(s);
    newObjects.push(...regionObjects(base, plan, s, final.cls, final.dist, final.region, feet, passageFor(base, version)));
    objectsAt.push(base.objects.length + newObjects.length);
  }
  const { cls, dist, owner, region, bornAt } = final;
  const regions = plan.regions.filter((g) => g.stage <= stage);
  const area = regions.map(() => 0);
  for (let i = 0; i < region.length; i++) if (region[i]) area[region[i] - 1]++;
  const objects = [...base.objects, ...newObjects];
  const counts: Record<string, number> = {};
  for (const o of objects) counts[o.kind] = (counts[o.kind] ?? 0) + 1;
  let landPixels = 0;
  for (let i = 0; i < cls.length; i++) if (cls[i] >= T.GRASS_EDGE && cls[i] !== T.RIM && cls[i] !== T.SKIN) landPixels++;
  return {
    ...base,
    terrain: { width, height, cls, dist, owner, elevation: base.terrain.elevation },
    objects,
    stats: { ...base.stats, landPixels, objects: counts },
    growth: { version, stage, regions, baseObjects: base.objects.length, land: lands[stage]!, region, bornAt, area, objectsAt },
  };
}

interface Foot {
  x: number;
  y: number;
  rx: number;
  ry: number;
  soft: boolean;
}

/**
 * The clear ground (world pixels) a solid grown object keeps to every other solid one and to the coast: 0 in v1
 * (the plain margins), a Blobbi's width and a navigation cell for a whale from v2 (its land is long and narrow).
 */
function passageFor(base: WorldDescription, version: number): number {
  return version >= 2 && base.creature?.species === 'whale' ? Math.round(10 * base.options.scale) : 0;
}

/** Plants and stones for one stage's regions, on that stage's terrain; `feet` carries earlier stages' footprints. */
function regionObjects(base: WorldDescription, plan: Plan, stage: number, cls: Uint8Array, dist: Float32Array, region: Uint8Array, feet: Foot[], passage = 0): Placement[] {
  const out: Placement[] = [];
  const palette = PALETTES[base.options.palette] ?? PALETTES.cozy;
  const S = base.options.scale;
  const { width, height } = base.terrain;
  const baseDist = base.terrain.dist;
  const ground = (x: number, y: number, r: number, depth: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= width || yi >= height) return false;
    const i = yi * width + xi;
    const c = cls[i];
    return region[i] === r + 1 && c !== T.GRASS_EDGE && c !== T.PATH && dist[i] <= -depth && baseDist[i] >= depth + 2;
  };
  plan.regions.forEach((g, r) => {
    if (g.stage !== stage) return;
    const rng = stream(base.seed, 'growth', 'v1', 'objects', g.id);
    const cells: number[] = [];
    for (let i = 0; i < region.length; i++) if (region[i] === r + 1) cells.push(i);
    if (!cells.length) return;
    const put = (kind: keyof typeof OBJECT_GENERATORS, layer: Placement['layer'], size: number, n: number, key: string, variation?: Record<string, unknown>, margin = 6) => {
      for (let k = 0; k < n; k++) {
        const seed = `${base.seed}|growth|${g.id}|${key}|${k}`;
        const sprite = OBJECT_GENERATORS[kind]({ seed, size, palette, variation: variation as never });
        const soft = kind === 'flower' || kind === 'grass';
        for (let t = 0; t < 30; t++) {
          const i = cells[rng.int(0, cells.length - 1)];
          const x = i % width;
          const y = Math.floor(i / width);
          // (A solid object keeps `passage` clear to the coast and to other solid objects; see passageFor.)
          const clear = soft ? 0 : passage;
          const depth = sprite.footRy + 2 + clear;
          const pts = [[0, 0], [-sprite.footRx, 0], [sprite.footRx, 0], [0, -sprite.footRy], [0, sprite.footRy]];
          if (!pts.every(([dx, dy]) => ground(x + dx, y + dy, r, depth))) continue;
          if (feet.some((f) => Math.abs(f.x - x) < f.rx + sprite.footRx + (f.soft || soft ? 1 : Math.max(margin, clear)) && Math.abs(f.y - y) < f.ry + sprite.footRy + (f.soft || soft ? 1 : Math.max(margin, clear)))) continue;
          feet.push({ x, y, rx: sprite.footRx, ry: sprite.footRy, soft });
          out.push({ kind, layer, seed, size, x, y, island: 0, variation });
          break;
        }
      }
    };
    const area = cells.length / (S * S);
    const per = (k: number) => Math.max(1, Math.round((area / 1000) * k));
    switch (g.biome) {
      case 'meadow': {
        const color = rng.int(0, palette.flowers.length - 1);
        put('flower', 'details', 6, per(14), 'flower-a', { color });
        put('flower', 'details', 5, per(10), 'flower-b', { color: (color + 2) % palette.flowers.length });
        put('bush', 'vegetation', Math.round(10 * S), per(0.6), 'bush');
        put('grass', 'details', 4, per(3), 'tuft');
        break;
      }
      case 'woodland': {
        const foliage = rng.int(0, palette.foliage.length - 1);
        put('tree', 'vegetation', Math.round(rng.range(18, 26) * S), per(3.5), 'tree', { foliage }, 8);
        put('bush', 'vegetation', Math.round(10 * S), per(2), 'bush', undefined, 8);
        put('grass', 'details', 4, per(2), 'tuft');
        put('decor', 'details', 8, 1, 'stump', { kind: 'stump' }, 10);
        break;
      }
      case 'rocky': {
        put('rock', 'vegetation', Math.round(14 * S), per(1.2), 'boulder', undefined, 10);
        put('rock', 'vegetation', Math.round(7 * S), per(3), 'stone', undefined, 8);
        put('flower', 'details', 4, per(4), 'alpine', { color: rng.int(0, palette.flowers.length - 1) });
        put('grass', 'details', 4, per(1), 'tuft');
        break;
      }
      case 'coastal': {
        put('grass', 'details', 4, per(6), 'reed');
        put('bush', 'vegetation', Math.round(9 * S), per(0.4), 'bush', undefined, 10);
        put('flower', 'details', 4, per(1), 'thrift', { color: 0 });
        break;
      }
      case 'mushroom': {
        put('tree', 'vegetation', Math.round(rng.range(22, 28) * S), per(2.5), 'old-tree', { foliage: palette.foliage.length - 1 }, 8);
        put('decor', 'details', 8, per(4), 'mushroom', { kind: 'mushroom' }, 4);
        put('grass', 'details', 4, per(2), 'tuft');
        break;
      }
    }
  });
  return out;
}
