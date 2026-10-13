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
import { OCEAN_ACCESS_STAGE, distanceField, paintLanding, planLanding, type Landing } from './landing';
import { movingPartsMask } from '../cinematic/sea';
import { clearableKind } from '../game/clearing';

/**
 * The growth generator's version. Bump it (and keep the old branch) whenever its output would change.
 *  1  M7: turtle and manta growth; the first whale growth (M8 phase 0).
 *  2  The whale's solid plants and rocks leave a Blobbi-wide passage between each other and to the coast, so its
 *     narrow aft land is never walled off (v1 could fence off the tip of the stage-3 grove). Turtle and manta
 *     worlds are identical in v1 and v2; a v1 save is still regrown exactly as v1.
 */
export const GROWTH_VERSION = 4;
/** Every version this generator can reproduce. */
export const GROWTH_VERSIONS: readonly number[] = [1, 2, 3, 4];
/**
 *  3  M9: stage 4, the Sanctuary. Stages 1-3 are exactly v2's for every Carrier; only stage 4 is new, so a v1 or v2
 *     save at stage 0-3 is still regrown exactly, and grows on to stage 4 with v3.
 *  4  M10 phase C: the LANDING (`world/landing.ts`). From stage `OCEAN_ACCESS_STAGE` every island also has one narrow
 *     tongue of shore across the Carrier's edge margin to open water, so the sea (fishing, the canoe) is always
 *     reachable. Everything else is exactly v3's: the same land (the tongue only adds carrying-surface pixels), the
 *     same objects (it is painted after each stage's objects are placed, and grows none). A world grown with v1-v3
 *     is therefore upgraded to v4 safely (`LiveWorld` does so on load: see `upgradeGrowth`).
 */
export const MAX_GROWTH_STAGE = 4;
/** The last stage each generator version can make (a v1/v2 save cannot be stage 4). */
export const MAX_STAGE_OF_VERSION: Readonly<Record<number, number>> = { 1: 3, 2: 3, 3: 4, 4: 4 };
/** The first version with the landing (the guaranteed way to the sea). */
export const LANDING_VERSION = 4;

export type BiomeId = 'meadow' | 'woodland' | 'rocky' | 'coastal' | 'mushroom' | 'sanctuary';

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
  sanctuary: { id: 'sanctuary', name: 'Sanctuary gardens', ground: T.GRASS, note: 'The island spreads across the Carrier\'s whole back: orchards, flowers and soft lawns.' },
};

export interface GrowthRegion {
  id: string;
  stage: 1 | 2 | 3 | 4;
  biome: BiomeId;
  /** Where on the coast, as an angle from the island's centre (radians; 0 east, π/2 south); null for a ring. */
  bearing: number | null;
}

export interface GrowthStageDef {
  stage: 1 | 2 | 3 | 4;
  name: string;
  regions: BiomeId[];
}

/** What each stage adds (the regions' bearings come from the world's seed). */
export const GROWTH_STAGES: readonly GrowthStageDef[] = [
  { stage: 1, name: 'The shore widens', regions: ['coastal', 'meadow'] },
  { stage: 2, name: 'Groves and stones', regions: ['woodland', 'rocky'] },
  { stage: 3, name: 'The deep green', regions: ['mushroom', 'coastal'] },
  { stage: 4, name: 'Sanctuary', regions: ['sanctuary'] },
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
  /**
   * Stage 4: distance (pixels) from every pixel outside the land to the nearest land pixel (0 on land), for the
   * turtle shell's soil band along a coast that is no longer the island record's. Absent below stage 4.
   */
  landField?: Float32Array;
  /** Version 4 from `OCEAN_ACCESS_STAGE`: the landing, the island's guaranteed way to the sea. */
  landing?: Landing;
  /** A turtle's landing: distance from every pixel to the landing's land (the shell's soil band follows it). */
  landingField?: Float32Array;
  /**
   * Natural objects (indices: trees, bushes, rocks, stumps, mushrooms) whose ground the landing covers: they are not
   * there (cleared ground that never returns), so nothing ever blocks the way to the sea. Indices never change.
   */
  landingClear?: number[];
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
  // (Stage 4 adds no ring or lobe: its land is the Sanctuary fill, see `sanctuaryFill`.)
  const ring = [0, minRoom * 0.18, minRoom * 0.18, minRoom * 0.4, minRoom * 0.4];
  for (const def of GROWTH_STAGES) {
    for (const biome of def.regions) {
      if (biome === 'coastal' || biome === 'sanctuary') {
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

/** A coast's shore band (it may become inland ground when land grows past it). */
const shoreBand = (c: number) => c === T.GRASS_EDGE || c === T.SAND || c === T.SAND_WET || c === T.MOSS;

/** The grown coastline at a stage: the base record, a ring factor, and the lobes of every stage up to it. */
function landAt(island: Island, plan: Plan, stage: number): Island {
  const lobes = plan.lobes.filter((l) => plan.regions[l.region].stage <= stage).map(({ angle, width, size, kind }) => ({ angle, width, size, kind }));
  return { ...island, radius: island.radius * (1 + plan.ring[stage]), coast: [...(island.coast ?? []), ...lobes] };
}

/**
 * The world at a growth stage. Stage 0 returns the base world itself. Throws for an unknown version (a save from
 * a newer generator must not be "regrown" differently).
 */
export function growWorld(base: WorldDescription, stage: number, version = GROWTH_VERSION, history: readonly { stage: number; version: number }[] = []): WorldDescription {
  if (!GROWTH_VERSIONS.includes(version)) throw new Error(`unknown growth version ${version}`);
  if (stage <= 0 || !canGrow(base)) return base;
  stage = Math.min(MAX_STAGE_OF_VERSION[version] ?? 3, Math.floor(stage));
  const plan = planV1(base);
  const island = base.islands[0];
  const { width, height } = base.terrain;
  const scale = base.options.scale;
  const B = bandsFor(scale);
  const origin = base.carrier?.origin ?? { x: 0, y: 0 };
  const wobbleNoise = createNoise(`${base.seed}/terrain/wobble`, 28 * scale);
  const patchNoise = createNoise(`${base.seed}/growth/patch`, 20 * scale);
  const lands = [0, 1, 2, 3, 4].map((s) => (s <= stage ? landAt(island, plan, s) : null));
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
  let landField: Float32Array | undefined;
  // Version 4: the landing, planned once on the access stage's terrain and objects (before it is painted).
  let landing: Landing | null = null;
  const mask: Uint8Array | null = version >= LANDING_VERSION && stage >= OCEAN_ACCESS_STAGE ? landingInputs(base).mask : null;
  const palette = PALETTES[base.options.palette] ?? PALETTES.cozy;
  const footOf = (p: Placement) => objectFoot(p, palette);
  // The landing's pixels (1: its new land, 2: old shore made inland at its root), over every stage.
  const landingMark = mask ? new Uint8Array(width * height) : null;
  let prevCls: Uint8Array | null = null;
  for (let s = 1; s <= stage; s++) {
    if (s > 1) final = terrainAt(s);
    // Stage 4: the stage-3 land (stage 4's coastline record is stage 3's), then the Sanctuary fill over the back.
    if (s === 4) landField = sanctuaryFill(base, plan, final, version);
    // Each stage's objects with the version that stage was grown with (a v1 whale's stages keep v1's passages when
    // it grows on to stage 4 with v3): its history entry, else the record's version.
    const sv = history.find((h) => h.stage === s)?.version ?? version;
    newObjects.push(...regionObjects(base, plan, s, final.cls, final.dist, final.region, feet, passageFor(base, Math.min(sv, version))));
    objectsAt.push(base.objects.length + newObjects.length);
    // The landing is planned on the access stage, once its objects stand: it keeps off their ground where it can.
    if (mask && s === OCEAN_ACCESS_STAGE) landing = planLanding(base, final.cls, landingInputs(base).suit, mask, occupancy(base, [...base.objects, ...newObjects], footOf));
    // After the stage's objects: the landing never changes where anything grows (and nothing grows on it).
    if (landing && mask && s >= OCEAN_ACCESS_STAGE) {
      paintLanding(base, landing, final, mask, 0, OCEAN_ACCESS_STAGE, landingMark ?? undefined);
      // Later stages are computed afresh: under them the landing's pixels are free again (painted again above) or
      // covered by the stage's own new land, which keeps its ground (as in version 3) — except that a landing pixel
      // never turns back into a shore band, and the Sanctuary (stage 4, which never repaints land) leaves every
      // landing pixel the class it had at stage 3. It has been land since the access stage (`bornAt`, for the reveal).
      if (s > OCEAN_ACCESS_STAGE && prevCls && landingMark)
        for (let i = 0; i < landingMark.length; i++) {
          if (!landingMark[i]) continue;
          const was = prevCls[i];
          const now = final.cls[i];
          if ((!shoreBand(was) && (s === 4 || shoreBand(now))) || (was >= T.GRASS_EDGE && now < T.GRASS_EDGE)) final.cls[i] = was;
          if (landingMark[i] === 1) {
            final.bornAt[i] = OCEAN_ACCESS_STAGE;
            if (final.dist[i] > 0) final.dist[i] = -0.5;
          }
        }
      prevCls = final.cls.slice();
    }
  }
  const landingField = landing && landingMark && base.turtle ? distanceField(landingMark, width, height) : undefined;
  // Natural objects on the landing's ground (of any stage) are cleared for good; a keeper piece never is (the
  // landing was planned off them).
  const landingClear: number[] = [];
  if (landing && landingMark) {
    const all = [...base.objects, ...newObjects];
    for (let k = 0; k < all.length; k++) {
      const p = all[k];
      if (!SOLID_KINDS_GROWTH.has(p.kind) || !clearableKind(p)) continue;
      const f = footOf(p);
      if (f.footRx <= 1 && f.footRy <= 1) continue;
      // The foot, grown by the Blobbi's own foot (3 × 2) and a pixel: room to stand and walk the landing.
      if (ellipseTouches(landingMark, width, height, p.x, p.y, f.footRx + 4, Math.max(1, f.footRy) + 3)) landingClear.push(k);
    }
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
    growth: { version, stage, regions, baseObjects: base.objects.length, land: lands[stage]!, region, bornAt, area, objectsAt, ...(landField ? { landField } : {}), ...(landing ? { landing } : {}), ...(landingField ? { landingField } : {}), ...(landingClear.length ? { landingClear } : {}) },
  };
}

/**
 * What planning the landing needs from a base world, made once per base world (both are pure functions of it): the
 * Carrier's moving-parts mask and its suitable carrying surface.
 */
const landingCache = new WeakMap<WorldDescription, { mask: Uint8Array; suit: Uint8Array }>();
function landingInputs(base: WorldDescription): { mask: Uint8Array; suit: Uint8Array } {
  let hit = landingCache.get(base);
  if (!hit) {
    hit = { mask: movingPartsMask(base), suit: suitableSurface(base) };
    landingCache.set(base, hit);
  }
  return hit;
}

/** An object's footprint (only the foot is kept: the sprite is not), by what decides it. */
const footCache = new Map<string, { footRx: number; footRy: number }>();
function objectFoot(p: Placement, palette: (typeof PALETTES)[string]): { footRx: number; footRy: number } {
  const key = `${p.kind}|${p.seed}|${p.size}|${JSON.stringify(p.variation ?? null)}`;
  let hit = footCache.get(key);
  if (!hit) {
    const s = OBJECT_GENERATORS[p.kind]({ seed: p.seed, size: p.size, palette, variation: p.variation as never });
    hit = { footRx: s.footRx, footRy: s.footRy };
    if (footCache.size > 20000) footCache.clear();
    footCache.set(key, hit);
  }
  return hit;
}

/** Kinds a Blobbi cannot walk through (the same set as the collision map's `SOLID_KINDS`). */
const SOLID_KINDS_GROWTH = new Set<Placement['kind']>(['tree', 'bush', 'rock', 'house', 'fence', 'decor']);

/**
 * Where objects stand, for planning the landing: 1 under a natural object's foot (it could be cleared), 2 under
 * anything else solid (a keeper piece: a sign, a well, the house).
 */
function occupancy(base: WorldDescription, objects: readonly Placement[], footOf: (p: Placement) => { footRx: number; footRy: number }): Uint8Array {
  const { width, height } = base.terrain;
  const out = new Uint8Array(width * height);
  for (const p of objects) {
    if (!SOLID_KINDS_GROWTH.has(p.kind)) continue;
    const f = footOf(p);
    if (f.footRx <= 1 && f.footRy <= 1) continue;
    const v = clearableKind(p) ? 1 : 2;
    const rx = f.footRx + 4;
    const ry = Math.max(1, f.footRy) + 3;
    for (let y = Math.floor(p.y - ry); y <= Math.ceil(p.y + ry); y++)
      for (let x = Math.floor(p.x - rx); x <= Math.ceil(p.x + rx); x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const u = (x + 0.5 - p.x) / (rx + 0.5);
        const w = (y + 0.5 - p.y) / (ry + 0.5);
        if (u * u + w * w <= 1) out[y * width + x] = Math.max(out[y * width + x], v);
      }
  }
  return out;
}

/** Does an ellipse at (cx, cy) touch any marked pixel? */
function ellipseTouches(mark: Uint8Array, width: number, height: number, cx: number, cy: number, rx: number, ry: number): boolean {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (x < 0 || y < 0 || x >= width || y >= height || !mark[y * width + x]) continue;
      const u = (x + 0.5 - cx) / (rx + 0.5);
      const v = (y + 0.5 - cy) / (ry + 0.5);
      if (u * u + v * v <= 1) return true;
    }
  return false;
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

/**
 * The SUITABLE CARRYING SURFACE (stage 4): where land may lie on a Carrier at all, leaving its anatomy visible.
 *  - turtle: the shell top, with a ring of plates and the lip kept round it (the same rule as stages 1-3);
 *  - manta: the still back, clear of its edge by a margin, never out on the wings (which beat) nor toward the tail;
 *  - whale: the still back between the blowholes (with their spout) and the knuckles, clear of its edge.
 * Pure; 1 = suitable.
 */
export function suitableSurface(base: WorldDescription): Uint8Array {
  const { width, height, cls } = base.terrain;
  const out = new Uint8Array(width * height);
  const scale = base.options.scale;
  const a = base.turtle;
  if (a) {
    const lip = Math.max(2, Math.round(1.6 * scale));
    const keep = Math.round(2.5 * scale);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (cls[i] !== T.RIM) continue;
        const dx = x + 0.5 - a.cx;
        const dy = y + 0.5 - a.cy;
        if (shellRadius(a, Math.atan2(dy, dx)) + a.rimWidth - Math.hypot(dx, dy) >= lip + keep) out[i] = 1;
      }
    return out;
  }
  // Depth from the BODY's edge (the sea), the island counted as body: the back round the land stays suitable.
  const body = new Uint8Array(width * height);
  for (let i = 0; i < body.length; i++) body[i] = cls[i] === T.SKIN || isLandClass(cls[i]) ? 1 : 0;
  const depth = stepsInside(body, width, height);
  const keep = Math.round(7 * scale);
  const c = base.creature!;
  let inside = (_x: number, _y: number) => true;
  if (c.species === 'whale') {
    // From just behind the blowholes (their spout rises in front of the land) back to the knuckles; the ends wobble
    // across the back (no straight cut).
    const east = Math.max(c.anatomy.x(0.18), c.anatomy.x(0.87));
    const west = Math.min(c.anatomy.x(0.18), c.anatomy.x(0.87));
    const wob = createNoise(`${base.seed}/growth/sanctuary-ends`, 14 * scale);
    // Rounded ends: the limit bows back toward the middle away from the spine, as the back curves away.
    const half = Math.max(1, c.anatomy.half(0.4));
    const bow = (y: number) => 34 * scale * Math.min(1.5, ((y + 0.5 - c.anatomy.cy) / half) ** 2);
    inside = (x, y) => x >= west + bow(y) + 9 * scale * wob.at(0, y) && x <= east - bow(y) - 9 * scale * wob.at(100, y);
  } else {
    // The manta's disc: out along the wings only as far as they stay still, never toward the tail (north).
    const m = c.anatomy;
    const wob = createNoise(`${base.seed}/growth/sanctuary-ends`, 20 * scale);
    // An oval over the disc (it breathes with noise: no straight sides), cut off before the tail.
    inside = (x, y) => {
      const ex = (x + 0.5 - m.cx) / (m.S * 0.64);
      const ey = (y + 0.5 - m.cy) / (m.C * 0.5);
      return ex * ex + ey * ey <= 1 + 0.18 * (wob.at(x, y) - 0.5) && y + 0.5 >= m.cy - m.C * 0.32;
    };
  }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (cls[i] === T.SKIN && depth[i] >= keep && inside(x, y)) out[i] = 1;
    }
  return out;
}

/** Steps (4-neighbour) from each pixel of `mask` to the nearest pixel outside it; 0 outside. */
function stepsInside(mask: Uint8Array, width: number, height: number): Int32Array {
  const d = new Int32Array(width * height).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < mask.length; i++)
    if (!mask[i]) {
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

/** The share of the suitable surface's depth the Sanctuary's coast keeps free (tuned for ~80 % coverage). */
const SANCTUARY_INSET: Readonly<Record<'turtle' | 'manta' | 'whale', { base: number; wobble: number }>> = {
  turtle: { base: 4.5, wobble: 4 },
  manta: { base: 3.5, wobble: 4 },
  whale: { base: 5, wobble: 5 },
};

/** The island's own ground (its beach included; a manta's sand sits below GRASS_EDGE in the class order). */
const isLandClass = (c: number) => c >= T.SAND_WET && c !== T.RIM && c !== T.SKIN;

/**
 * Stage 4, the Sanctuary: the island spreads over most of the suitable surface. New land is ADDED only: every pixel
 * that was land stays land (the old coast's edge band becomes plain inland ground, as at every stage), nothing
 * moves. The new coast follows the carrying surface's own edge at a breathing inset (noise, no straight lines),
 * and only land connected to the island is kept. Mutates `t` (the stage-3 terrain) into the stage-4 terrain;
 * returns the distance field outside the land (for the turtle's soil band).
 */
function sanctuaryFill(base: WorldDescription, plan: Plan, t: { cls: Uint8Array; dist: Float32Array; owner: Int8Array; region: Uint8Array; bornAt: Uint8Array }, version: number): Float32Array {
  void version;
  const { width, height } = base.terrain;
  const scale = base.options.scale;
  const B = bandsFor(scale);
  const species = base.turtle ? 'turtle' : base.creature!.species;
  const free = freeClass(base);
  const suit = suitableSurface(base);
  // Depth into the carrying surface measured with the island as part of it, so the new land meets the old coast
  // with no strip of bare Carrier between them.
  const inner = new Uint8Array(width * height);
  for (let i = 0; i < inner.length; i++) inner[i] = suit[i] || isLandClass(t.cls[i]) ? 1 : 0;
  const depth = stepsInside(inner, width, height);
  const noise = createNoise(`${base.seed}/growth/sanctuary`, 34 * scale);
  const inset = SANCTUARY_INSET[species];
  const sanc = plan.regions.findIndex((g) => g.biome === 'sanctuary');
  const ground = BIOMES.sanctuary.ground;
  const patch = createNoise(`${base.seed}/growth/patch`, 20 * scale);
  // Candidates: still-free suitable pixels deep enough inside the surface.
  const cand = new Uint8Array(width * height);
  for (let i = 0; i < suit.length; i++) {
    if (!suit[i] || t.cls[i] !== free) continue;
    const x = i % width;
    const y = (i / width) | 0;
    const need = (inset.base + inset.wobble * noise.fbm(x + 0.5, y + 0.5, 2)) * scale;
    if (depth[i] >= need) cand[i] = 1;
  }
  // Only what joins the island: a flood from the land through the candidates.
  const keep = new Uint8Array(width * height);
  const queue: number[] = [];
  for (let i = 0; i < t.cls.length; i++) if (isLandClass(t.cls[i])) queue.push(i);
  const seen = new Uint8Array(width * height);
  for (const i of queue) seen[i] = 1;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % width;
    const y = (i / width) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const j = yy * width + xx;
      if (seen[j] || !cand[j]) continue;
      seen[j] = 1;
      keep[j] = 1;
      queue.push(j);
    }
  }
  const island = base.islands[0];
  for (let i = 0; i < keep.length; i++) {
    if (!keep[i]) continue;
    t.cls[i] = ground;
    t.region[i] = sanc + 1;
    t.bornAt[i] = 4;
    t.owner[i] = island.id;
  }
  // The coast, again: every land pixel's distance to the nearest non-land pixel; the new shore bands where it is
  // close, and plain ground where an old shore band is now inland.
  const land = new Uint8Array(width * height);
  for (let i = 0; i < land.length; i++) land[i] = isLandClass(t.cls[i]) ? 1 : 0;
  const nd = stepsInside(land, width, height);
  const creature = !!base.creature;
  const beachW = B.sandNorth + 1;
  const shore = base.creature?.species === 'whale' ? T.MOSS : T.SAND;
  const edgeBand = creature ? beachW + B.grassEdge : B.grassEdge;
  const shoreSet = new Set<number>(creature ? (shore === T.MOSS ? [T.GRASS_EDGE, T.MOSS] : [T.GRASS_EDGE, T.SAND, T.SAND_WET]) : [T.GRASS_EDGE]);
  for (let i = 0; i < land.length; i++) {
    if (!land[i]) continue;
    const fresh = keep[i] === 1;
    // Base land never changes class except its old shore band (as at every stage); grown land likewise.
    if (!fresh && !shoreSet.has(t.cls[i])) continue;
    // A whale's moss and a manta's sand that belong to the base island's own beach stay where they still face the
    // sea; only bands now enclosed by land become inland ground.
    const d = nd[i];
    let c: number;
    if (creature && d <= beachW) c = fresh ? shore : t.cls[i];
    else if (d <= edgeBand) c = fresh ? T.GRASS_EDGE : t.cls[i] === T.GRASS_EDGE || !creature ? T.GRASS_EDGE : t.cls[i];
    else if (fresh) {
      const x = i % width;
      const y = (i / width) | 0;
      c = patch.fbm(x + 0.5, y + 0.5, 2) > 0.64 ? T.GRASS_PATCH : ground;
    } else {
      // An old shore band, now inland.
      const r = t.region[i];
      c = r ? BIOMES[plan.regions[r - 1].biome].ground : T.GRASS;
      if (c === T.MEADOW || c === T.GRAVEL || c === T.CLOVER || c === T.MOSS) c = c === T.MOSS ? T.MOSS : c;
    }
    t.cls[i] = c;
    if (fresh || d > edgeBand) t.dist[i] = Math.min(t.dist[i] < 0 ? t.dist[i] : 0, -d);
  }
  // The distance field outside the land, for the turtle's soil band (chamfer, a few pixels is all it needs).
  const field = new Float32Array(width * height).fill(1e6);
  for (let i = 0; i < field.length; i++) if (isLandClass(t.cls[i])) field[i] = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x > 0) field[i] = Math.min(field[i], field[i - 1] + 1);
      if (y > 0) field[i] = Math.min(field[i], field[i - width] + 1, x > 0 ? field[i - width - 1] + 1.41 : 1e6, x < width - 1 ? field[i - width + 1] + 1.41 : 1e6);
    }
  for (let y = height - 1; y >= 0; y--)
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (x < width - 1) field[i] = Math.min(field[i], field[i + 1] + 1);
      if (y < height - 1) field[i] = Math.min(field[i], field[i + width] + 1, x < width - 1 ? field[i + width + 1] + 1.41 : 1e6, x > 0 ? field[i + width - 1] + 1.41 : 1e6);
    }
  return field;
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
      case 'sanctuary': {
        // Orchards, flowers and lawns: the island's long-term home garden.
        const foliage = rng.int(0, palette.foliage.length - 1);
        put('tree', 'vegetation', Math.round(rng.range(20, 28) * S), per(1.6), 'orchard', { foliage }, 10);
        put('bush', 'vegetation', Math.round(10 * S), per(1.2), 'bush', undefined, 8);
        const color = rng.int(0, palette.flowers.length - 1);
        put('flower', 'details', 6, per(10), 'flower-a', { color });
        put('flower', 'details', 5, per(8), 'flower-b', { color: (color + 3) % palette.flowers.length });
        put('rock', 'vegetation', Math.round(9 * S), per(0.6), 'stone', undefined, 8);
        put('grass', 'details', 4, per(3), 'tuft');
        put('decor', 'details', 8, per(0.4), 'mushroom', { kind: 'mushroom' }, 6);
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
