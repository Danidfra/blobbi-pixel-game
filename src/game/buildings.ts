/**
 * BUILDINGS. The construction loop: a small wooden shelter and (M4) a few decorations the player places on the
 * island, paid for from the bag, raised over a little world time, and kept for good. Every kind shares one path:
 * a definition (cost, footprint, build time), a placement check, a footprint that blocks collision and
 * navigation, and a sprite per construction progress. Decorations are unlocked by objectives (`objectives.ts`).
 *
 * Coordinates are stable: a building's place is stored in the ISLAND FRAME (the Variant 0 canvas, the frame
 * every gameplay coordinate lives in, see `src/carrier/`), so a later carrier canvas or world growth can move
 * the canvas around the island without moving a single building. In memory the live world keeps canvas
 * coordinates (island frame + `carrier.origin`); the save converts.
 */
import { t } from '../i18n';
import { stream } from '../core/rng';
import { hex, mix } from '../core/color';
import { ramp, type WorldPalette } from '../core/palette';
import { Mask, PixelBuffer, type Sprite } from '../core/pixel';
import { T, WALKABLE, type WorldDescription } from '../world/types';
import type { Ingredient } from './crafting';
import { ITEMS } from './items';
import { generateDecoration } from './decorations';
import { ART } from './furniture-art';
import { PLACEABLE_CONTENT, type Layer, type Use, type Where } from '../content/placeables';
import { houseLevelInfo } from '../content/houses';
import { drawCottage, drawDoor, drawDreamHome, drawWindow, resolveLook, roofRamp, wallRamp, type HouseLook, type ResolvedLook } from './house-art';

/** A placeable's kind: the shelter, the M4 decorations, or any kind in `content/placeables.ts`. */
export type BuildingKind = string;
/** The kinds B builds in place, paying materials (locked ones are skipped), in the order B cycles them. */
export const BUILDING_KINDS: readonly BuildingKind[] = ['shelter', 'fence', 'flower-bed', 'lantern', 'bench', 'crate'];

export interface BuildingDefinition {
  kind: BuildingKind;
  id: string;
  label: string;
  /** A shelter is a building; outdoor pieces are decorations (the "improve the island" goal counts them); indoor ones furniture. */
  category: 'building' | 'decoration' | 'furniture';
  /** The bag item it is placed from and picked up into (null: the shelter, which is moved but never picked up). */
  item: string | null;
  where: Where;
  layer: Layer;
  use?: Use;
  joy?: number;
  /** Storage: distinct stacks it holds. */
  capacity?: number;
  variants?: number;
  /** What it does, for the UI. */
  purpose: string;
  /** Extra clearance kept to other buildings, in pixels. */
  gap: number;
  cost: readonly Ingredient[];
  /** Ground footprint half-sizes (a rectangle), in pixels at world scale 1.6. */
  footRx: number;
  footRy: number;
  /** Seconds of world time from placement to completion. */
  buildSeconds: number;
}

export const BUILDINGS: Record<BuildingKind, BuildingDefinition> = {
  shelter: {
    kind: 'shelter',
    id: 'blobbi-pixel:building:shelter',
    label: 'wooden shelter',
    category: 'building',
    purpose: 'Blobbi rests here, twice as fast',
    gap: 3,
    cost: [
      { item: ITEMS.wood.id, quantity: 6 },
      { item: ITEMS.stone.id, quantity: 3 },
    ],
    footRx: 12,
    footRy: 5,
    buildSeconds: 24,
    item: null,
    where: 'outdoor',
    layer: 'solid',
    use: 'sleep',
  },
  fence: {
    kind: 'fence',
    id: 'blobbi-pixel:building:fence',
    label: 'wooden fence',
    category: 'decoration',
    purpose: 'a short fence; fences line up end to end',
    gap: 0,
    cost: [{ item: ITEMS.wood.id, quantity: 2 }],
    footRx: 6,
    footRy: 1,
    buildSeconds: 2,
    item: 'blobbi-pixel:furniture:fence',
    where: 'outdoor',
    layer: 'solid',
    use: 'admire',
  },
  'flower-bed': {
    kind: 'flower-bed',
    id: 'blobbi-pixel:building:flower-bed',
    label: 'flower bed',
    category: 'decoration',
    purpose: 'Blobbi likes to visit it (happiness)',
    gap: 1,
    cost: [
      { item: ITEMS.wood.id, quantity: 1 },
      { item: ITEMS.seed.id, quantity: 2 },
    ],
    footRx: 6,
    footRy: 3,
    buildSeconds: 4,
    item: 'blobbi-pixel:furniture:flower-bed',
    where: 'outdoor',
    layer: 'solid',
    use: 'admire', joy: 2,
  },
  lantern: {
    kind: 'lantern',
    id: 'blobbi-pixel:building:lantern',
    label: 'small lantern',
    category: 'decoration',
    purpose: 'a warm glow and the odd firefly',
    gap: 1,
    cost: [
      { item: ITEMS.wood.id, quantity: 1 },
      { item: ITEMS.stone.id, quantity: 2 },
      { item: ITEMS.stick.id, quantity: 1 },
    ],
    footRx: 2,
    footRy: 1,
    buildSeconds: 3,
    item: 'blobbi-pixel:furniture:lantern',
    where: 'outdoor',
    layer: 'solid',
    use: 'light', joy: 2,
  },
  bench: {
    kind: 'bench',
    id: 'blobbi-pixel:building:bench',
    label: 'wooden bench',
    category: 'decoration',
    purpose: 'Blobbi sits and enjoys the view (happiness)',
    gap: 1,
    cost: [
      { item: ITEMS.wood.id, quantity: 3 },
      { item: ITEMS.stick.id, quantity: 1 },
    ],
    footRx: 6,
    footRy: 2,
    buildSeconds: 5,
    item: 'blobbi-pixel:furniture:bench',
    where: 'outdoor',
    layer: 'solid',
    use: 'sit', joy: 2,
  },
  crate: {
    kind: 'crate',
    id: 'blobbi-pixel:building:crate',
    label: 'storage crate',
    category: 'decoration',
    purpose: `+${10} to every stack in the bag (up to two crates)`,
    gap: 1,
    cost: [
      { item: ITEMS.wood.id, quantity: 4 },
      { item: ITEMS.stick.id, quantity: 2 },
    ],
    footRx: 5,
    footRy: 2,
    buildSeconds: 5,
    item: 'blobbi-pixel:furniture:crate',
    where: 'outdoor',
    layer: 'solid',
    use: 'admire',
  },
};

// Everything in the content catalogue: crafted into the bag, placed from it, built in a moment.
for (const p of PLACEABLE_CONTENT) {
  BUILDINGS[p.kind] = {
    kind: p.kind,
    id: `blobbi-pixel:placeable:${p.kind}`,
    label: p.label,
    category: p.where === 'indoor' ? 'furniture' : 'decoration',
    purpose: p.description,
    gap: p.layer === 'floor' ? 0 : 1,
    cost: p.recipe,
    footRx: p.footRx,
    footRy: p.footRy,
    buildSeconds: p.where === 'indoor' ? 0 : 2,
    item: `blobbi-pixel:furniture:${p.kind}`,
    where: p.where,
    layer: p.layer,
    use: p.use,
    joy: p.joy,
    capacity: p.capacity,
    variants: p.variants,
  };
}

/** Every placeable kind there is. */
export const ALL_PLACEABLE_KINDS: readonly BuildingKind[] = Object.keys(BUILDINGS);
/** The placeable kind an item places, or null. */
export const kindForItem = (item: string): BuildingKind | null => Object.values(BUILDINGS).find((d) => d.item === item)?.kind ?? null;
/** Walked over (rugs, paths, cushions) or under (the arch): never blocks collision. */
export const isWalkable = (kind: BuildingKind): boolean => BUILDINGS[kind].layer !== 'solid';

/** Stack room each finished storage crate adds, and how many crates count. */
export const CRATE_BONUS = 10;
export const MAX_CRATES = 2;

export const isDecoration = (kind: BuildingKind): boolean => BUILDINGS[kind].category === 'decoration';
export const isBuildingKind = (kind: string): kind is BuildingKind => kind in BUILDINGS;

export interface Building {
  /** Stable id: `<kind>:<n>` in placement order. */
  id: string;
  kind: BuildingKind;
  /** Ground anchor in canvas pixels (the live world's coordinates). */
  x: number;
  y: number;
  /** World time of placement; construction progress is measured from it. */
  placedAt: number;
  seed: string;
  /** Colourway (rugs, beds, cushions...). */
  variant?: number;
  /** A shelter's house level (M8): 1 Cozy Shelter (absent), 2 Cottage, 3 Dream Home. */
  level?: number;
  /** A shelter's look (M8): roof colour, wall material, door and window styles; absent parts use the level's own. */
  look?: HouseLook;
  /** World time an upgrade to `level` began (M8): the house is under construction until it is done. */
  upgradedAt?: number;
}

/** A shelter's house level (1-3); every other kind is 1. */
export const houseLevel = (b: { kind: BuildingKind; level?: number }): 1 | 2 | 3 => (b.kind === 'shelter' && (b.level === 2 || b.level === 3) ? b.level : 1);

/** A record's ground footprint: its kind's, or a house's own for its level. */
export function footOf(b: { kind: BuildingKind; level?: number }): { footRx: number; footRy: number } {
  if (b.kind === 'shelter') {
    const l = houseLevelInfo(houseLevel(b));
    return { footRx: l.footRx, footRy: l.footRy };
  }
  const d = BUILDINGS[b.kind];
  return { footRx: d.footRx, footRy: d.footRy };
}

/** Construction progress 0..1 at a world time. */
export function buildingProgress(b: Building, worldTime: number): number {
  // A house being upgraded is under construction again, for its new level's time.
  if (b.kind === 'shelter' && b.upgradedAt !== undefined) return Math.max(0, Math.min(1, (worldTime - b.upgradedAt) / houseLevelInfo(houseLevel(b)).buildSeconds));
  const def = BUILDINGS[b.kind];
  if (def.buildSeconds <= 0) return 1;
  return Math.max(0, Math.min(1, (worldTime - b.placedAt) / def.buildSeconds));
}

/** Progress quantized to construction steps, so sprites are reused. */
export const PROGRESS_STEPS = 12;
export const quantizeProgress = (p: number): number => Math.round(Math.max(0, Math.min(1, p)) * PROGRESS_STEPS) / PROGRESS_STEPS;

// ─── Placement ───────────────────────────────────────────────────────────────

export type PlacementProblem = 'water' | 'ground' | 'blocked' | 'building' | 'resource' | 'blobbi' | 'edge' | 'plot' | 'doorway' | 'path' | 'outdoor' | 'door' | 'growing';

export interface PlacementCheck {
  ok: boolean;
  problem: PlacementProblem | null;
  /** The footprint rectangle checked, canvas pixels. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const BUILDABLE = new Set<number>([T.GRASS, T.GRASS_PATCH, T.GRASS_DARK, T.MEADOW, T.GRASS_EDGE, T.MOSS, T.GRAVEL, T.CLOVER]);

export interface PlacementContext {
  world: WorldDescription;
  /** Pixels blocked by objects, water, cliffs and existing buildings. */
  isBlocked: (x: number, y: number) => boolean;
  buildings: readonly Building[];
  resources: readonly { x: number; y: number }[];
  blobbi: { x: number; y: number; footRx: number; footRy: number };
  /** Farm plots, as canvas rectangles (inclusive). Nothing is built on a field. */
  plots?: readonly { x0: number; y0: number; x1: number; y1: number }[];
}

/**
 * The ground rules every placement shares, over a rectangle (inclusive, plus a one-pixel margin): inside the map,
 * buildable grass on one level, unblocked (no object footprint, water, rim or cliff), no resource node on it.
 */
export function checkGround(x0: number, y0: number, x1: number, y1: number, level: { x: number; y: number }, ctx: PlacementContext): PlacementProblem | null {
  const { width, height, cls, elevation } = ctx.world.terrain;
  if (x0 - 1 < 0 || y0 - 1 < 0 || x1 + 1 >= width || y1 + 1 >= height) return 'edge';
  const ground = elevation[Math.round(level.y) * width + Math.round(level.x)];
  for (let py = y0 - 1; py <= y1 + 1; py++)
    for (let px = x0 - 1; px <= x1 + 1; px++) {
      const i = py * width + px;
      const c = cls[i];
      if (c < T.GRASS_EDGE || c === T.POND || c === T.POND_EDGE) return c <= T.FOAM || c === T.POND || c === T.POND_EDGE ? 'water' : 'ground';
      if (!BUILDABLE.has(c) || !WALKABLE.has(c) || elevation[i] !== ground) return 'ground';
      if (ctx.isBlocked(px, py)) return 'blocked';
    }
  for (const n of ctx.resources) if (n.x >= x0 - 1 && n.x <= x1 + 1 && n.y >= y0 - 1 && n.y <= y1 + 1) return 'resource';
  return null;
}

const overlaps = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }, margin: number) =>
  a.x0 - margin <= b.x1 && a.x1 + margin >= b.x0 && a.y0 - margin <= b.y1 && a.y1 + margin >= b.y0;

/** A building's footprint rectangle on the canvas (inclusive). */
export function footprintRect(b: { kind: BuildingKind; x: number; y: number; level?: number }): { x0: number; y0: number; x1: number; y1: number } {
  const d = footOf(b);
  return { x0: Math.round(b.x) - d.footRx, y0: Math.round(b.y) - d.footRy, x1: Math.round(b.x) + d.footRx, y1: Math.round(b.y) + d.footRy };
}

/** The ground in front of a shelter's door, kept clear so the Blobbi can always walk in to sleep. */
export function doorwayRect(b: { kind: BuildingKind; x: number; y: number; level?: number }): { x0: number; y0: number; x1: number; y1: number } | null {
  if (b.kind !== 'shelter') return null;
  const l = houseLevelInfo(houseLevel(b));
  // In front of the door (the Cottage's door, and its porch step, are right of centre).
  const cx = Math.round(b.x) + doorOffsetX(b);
  return { x0: cx - l.doorHalf, y0: Math.round(b.y) + l.footRy + 1, x1: cx + l.doorHalf, y1: Math.round(b.y) + l.footRy + 12 };
}

/** Where the Blobbi stands at a shelter's door (outside, facing it). */
export function doorSpot(b: { kind: BuildingKind; x: number; y: number; level?: number }, blobbiFootRy: number): { x: number; y: number } {
  return { x: b.x + doorOffsetX(b), y: b.y + footOf(b).footRy + blobbiFootRy + 3 };
}

/** The door's x offset from the house's centre (the Cottage's door is right of centre). */
export function doorOffsetX(b: { kind: BuildingKind; level?: number }): number {
  return houseLevel(b) === 2 ? 4 : 0;
}

const blocksDoorway = (rect: { x0: number; y0: number; x1: number; y1: number }, buildings: readonly Building[]) =>
  buildings.some((b) => {
    const door = doorwayRect(b);
    return door !== null && overlaps(rect, door, 0);
  });

/** Clearance kept between a farm plot and a building's footprint. */
export const PLOT_CLEARANCE = 2;

/**
 * Can a building stand with its ground anchor at (x, y)? Every pixel of the footprint (plus a one-pixel margin)
 * must be buildable grass on one level, unblocked (no object footprint, water, rim or cliff), clear of other
 * buildings, of resource nodes and of the Blobbi.
 */
export function checkPlacement(kind: BuildingKind, x: number, y: number, ctx: PlacementContext, level?: number): PlacementCheck {
  const def = { ...BUILDINGS[kind], ...footOf({ kind, level }) };
  const x0 = Math.round(x) - def.footRx;
  const x1 = Math.round(x) + def.footRx;
  const y0 = Math.round(y) - def.footRy;
  const y1 = Math.round(y) + def.footRy;
  const result = (problem: PlacementProblem | null): PlacementCheck => ({ ok: problem === null, problem, x0, y0, x1, y1 });
  const { width, height } = ctx.world.terrain;
  if (x0 - 1 < 0 || y0 - 1 < 0 || x1 + 1 >= width || y1 + 1 >= height) return result('edge');
  // Other buildings first (their footprints also block, but "too close to a building" is the useful answer).
  for (const b of ctx.buildings) {
    const d = { ...BUILDINGS[b.kind], ...footOf(b) };
    const gap = Math.max(def.gap, d.gap);
    if (Math.abs(b.x - Math.round(x)) < def.footRx + d.footRx + gap && Math.abs(b.y - Math.round(y)) < def.footRy + d.footRy + gap) return result('building');
  }
  const rect = { x0, y0, x1, y1 };
  if (blocksDoorway(rect, ctx.buildings)) return result('doorway');
  for (const p of ctx.plots ?? []) if (overlaps(rect, p, PLOT_CLEARANCE)) return result('plot');
  const ground = checkGround(x0, y0, x1, y1, { x, y }, ctx);
  if (ground) return result(ground);
  // A shelter needs open, walkable ground in front of its door (on its own level), so the Blobbi can walk in.
  const door = doorwayRect({ kind, x, y, level });
  if (door) {
    const { width, height, cls, elevation } = ctx.world.terrain;
    const level = elevation[Math.round(y) * width + Math.round(x)];
    for (let py = door.y0; py <= door.y1; py++)
      for (let px = door.x0; px <= door.x1; px++) {
        if (px < 0 || py < 0 || px >= width || py >= height) return result('doorway');
        const i = py * width + px;
        if (!WALKABLE.has(cls[i]) || elevation[i] !== level || ctx.isBlocked(px, py)) return result('doorway');
      }
  }
  const b = ctx.blobbi;
  if (b.x + b.footRx >= x0 - 1 && b.x - b.footRx <= x1 + 1 && b.y + b.footRy >= y0 - 1 && b.y - b.footRy <= y1 + 1) return result('blobbi');
  return result(null);
}

/**
 * Can a farm plot be tilled on a cell rectangle? The same ground rules as a building (flat buildable grass, nothing
 * standing or lying there), clear of buildings by `PLOT_CLEARANCE`, and not an existing plot. The Blobbi may stand
 * on it: plots are walkable.
 */
export function checkPlot(rect: { x0: number; y0: number; x1: number; y1: number }, ctx: PlacementContext): PlacementCheck {
  const result = (problem: PlacementProblem | null): PlacementCheck => ({ ok: problem === null, problem, ...rect });
  const { width, height } = ctx.world.terrain;
  if (rect.x0 - 1 < 0 || rect.y0 - 1 < 0 || rect.x1 + 1 >= width || rect.y1 + 1 >= height) return result('edge');
  for (const p of ctx.plots ?? []) if (overlaps(rect, p, -1)) return result('plot');
  for (const b of ctx.buildings) if (overlaps(rect, footprintRect(b), PLOT_CLEARANCE)) return result('building');
  if (blocksDoorway(rect, ctx.buildings)) return result('doorway');
  // Plot tiles abut, so the ground margin is checked only inside the tile (a field's own plots are not obstacles).
  return result(checkGround(rect.x0 + 1, rect.y0 + 1, rect.x1 - 1, rect.y1 - 1, { x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2 }, ctx));
}

const PROBLEMS: readonly PlacementProblem[] = ['water', 'ground', 'blocked', 'building', 'resource', 'blobbi', 'edge', 'plot', 'doorway', 'path', 'outdoor', 'door', 'growing'];
/** Why something cannot go here, in the player's language (M11B: `problem.<id>`; read when shown, never stored). */
export const PROBLEM_TEXT: Readonly<Record<PlacementProblem, string>> = Object.defineProperties(
  {} as Record<PlacementProblem, string>,
  Object.fromEntries(PROBLEMS.map((p) => [p, { enumerable: true, get: () => t(`problem.${p}`) }])),
);

// ─── The shelter ─────────────────────────────────────────────────────────────

const THATCH = ramp(hex('#c7a24c'), { step: 0.085, hueShift: 8 });

/**
 * A small wooden shelter: log walls, a thatched gable roof, an open doorway, corner posts. `progress` draws it
 * under construction: posts and a log pile first, then the walls rising, then the roof closing from the eaves
 * to the ridge. The seed decides the thatch's tone and the plank pattern; the shape is one design.
 */
export function generateShelter(seed: string, size: number, palette: WorldPalette, progress = 1, look: ResolvedLook = resolveLook(1, undefined), lit = false): Sprite {
  const w = Math.max(16, Math.min(40, Math.round(size)));
  const rng = stream(seed, 'shelter');
  const natural = rng.chance(0.5) ? THATCH : ramp(mix(hex('#c7a24c'), palette.trunk[0].mid, 0.35), { step: 0.085, hueShift: 8 });
  const wood = wallRamp(look, palette);
  const thatch = look.roof ? roofRamp(1, look, seed, palette) : natural;
  const wallH = Math.round(w * 0.42);
  const roofH = Math.round(w * 0.5);
  const eave = 2;
  const width = w + eave * 2 + 2;
  const height = wallH + roofH + 3;
  const buf = new PixelBuffer(width, height);
  const groundY = height - 2;
  const wallX = eave + 1;
  const wallTop = groundY - wallH + 1;
  const p = Math.max(0, Math.min(1, progress));

  // Walls: horizontal logs, lit on the left, a shadow line under the eave.
  const wallMask = new Mask(width, height);
  for (let y = wallTop; y <= groundY; y++) for (let x = wallX; x < wallX + w; x++) wallMask.set(x, y);
  buf.paintMaskWith(wallMask, (x, y) => {
    const log = (y - wallTop) % 3;
    const lit = x < wallX + Math.round(w * 0.3);
    if (log === 2) return wood.dark;
    if (log === 0) return lit ? wood.light : wood.mid;
    return lit ? wood.mid : mix(wood.mid, wood.dark, 0.35);
  });
  buf.hline(wallX, wallX + w - 1, wallTop, wood.dark);
  // Doorway: open and dark, with a lintel (or the chosen door, M8).
  const doorW = Math.max(5, Math.round(w * 0.24));
  const doorH = Math.max(6, Math.round(wallH * 0.8));
  const doorX = wallX + Math.round(w / 2 - doorW / 2);
  const doorY = groundY - doorH;
  if (look.door) drawDoor(buf, look.door, doorX, doorY, doorW, doorH, palette.wood, wood);
  else {
    buf.fillRect(doorX, doorY, doorW, doorH, mix(wood.outline, hex('#1b1410'), 0.6));
    buf.hline(doorX - 1, doorX + doorW, doorY - 1, wood.light);
    buf.vline(doorX - 1, doorY, groundY, wood.dark);
    buf.vline(doorX + doorW, doorY, groundY, wood.dark);
  }
  // One window (M8), left of the door.
  drawWindow(buf, look.window, wallX + Math.max(2, Math.round(w * 0.12)), wallTop + 3, 4, 3, palette.wood, lit);
  // Corner posts.
  buf.vline(wallX, wallTop, groundY, wood.dark);
  buf.vline(wallX + w - 1, wallTop, groundY, wood.dark);
  buf.strokeRect(wallX, wallTop, w, wallH + 1, wood.outline);
  buf.hline(wallX, wallX + w - 1, groundY, wood.outline);

  // Roof: a gable of thatch, a lit left slope, a dark ridge, a fringe at the eave.
  const roofBottom = wallTop + 1;
  const roofTop = roofBottom - roofH;
  const roofMask = new Mask(width, height);
  const rx0 = wallX - eave;
  const rw = w + eave * 2;
  const peakH = Math.round(roofH * 0.55);
  for (let y = roofTop; y <= roofBottom; y++) {
    const t = (y - roofTop) / peakH;
    const half = y - roofTop < peakH ? Math.max(1, (rw / 2) * Math.min(1, t)) : rw / 2;
    for (let x = Math.ceil(rx0 + rw / 2 - half); x <= Math.floor(rx0 + rw / 2 + half - 0.5); x++) roofMask.set(x, y);
  }
  const ridgeX = rx0 + rw / 2;
  buf.paintMaskWith(roofMask, (x, y) => {
    const row = y - roofTop;
    const left = x + 0.5 < ridgeX;
    const straw = (x * 7 + y * 3 + (rng.int(0, 1) === 0 ? 0 : 1)) % 5 === 0;
    if (row % 4 === 3) return left ? thatch.mid : thatch.dark;
    return left ? (straw ? thatch.highlight : thatch.light) : straw ? thatch.light : thatch.mid;
  });
  buf.paintMask(roofMask.edge(), thatch.outline);
  for (let x = rx0; x < rx0 + rw; x += 2) buf.set(x, roofBottom + 1, thatch.dark); // the fringe
  buf.set(Math.round(ridgeX) - 1, roofTop, thatch.outline);
  buf.set(Math.round(ridgeX), roofTop, thatch.outline);

  if (p < 1) {
    // Under construction: nothing above the built line; posts stand from the start, a log pile waits beside.
    const wallBuilt = Math.min(1, p / 0.6);
    const roofBuilt = Math.max(0, (p - 0.6) / 0.4);
    const wallLine = groundY - Math.round(wallH * wallBuilt);
    const roofLine = roofBottom - Math.round(roofH * roofBuilt);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const c = buf.get(x, y);
        if (!(c >>> 24)) continue;
        const roofPixel = roofMask.get(x, y) || y === roofBottom + 1;
        if (roofPixel ? y < roofLine || roofBuilt === 0 : y < wallLine) buf.set(x, y, 0);
      }
    // Corner posts to full wall height, the frame of what is coming.
    for (const x of [wallX, wallX + w - 1]) {
      buf.vline(x, wallTop, groundY, wood.dark);
      buf.set(x, wallTop - 1, wood.outline);
    }
    if (p < 0.6) buf.hline(wallX, wallX + w - 1, groundY, wood.outline);
    // Log pile at the right, shrinking as the logs go up.
    const logs = Math.max(1, Math.round(4 * (1 - p)));
    for (let i = 0; i < logs; i++) {
      const lx = wallX + w - 6 - i;
      const ly = groundY - 1 - i * 2;
      buf.hline(lx, lx + 5, ly, wood.mid);
      buf.hline(lx, lx + 5, ly + 1, wood.dark);
      buf.set(lx - 1, ly, wood.outline);
      buf.set(lx + 6, ly, wood.outline);
    }
  }
  buf.validate();
  const def = BUILDINGS.shelter;
  return { buffer: buf, anchorX: Math.round(width / 2), anchorY: groundY, footRx: def.footRx, footRy: def.footRy };
}

const spriteCache = new Map<string, Sprite>();

/** The sprite of a building at a construction progress (quantized), cached. */
export function buildingSprite(b: Building, palette: WorldPalette, progress: number, scale = 1.6, lit = false): Sprite {
  const q = quantizeProgress(progress);
  const look = b.kind === 'shelter' ? resolveLook(houseLevel(b), b.look) : null;
  // A house at night: its windows glow (M9).
  const glow = !!look && lit && q >= 1;
  const key = `${palette.name}|${b.kind}|${b.seed}|${b.variant ?? 0}|${q}|${scale}${look ? `|${houseLevel(b)}|${look.roof},${look.wall},${look.door},${look.window}${glow ? '|lit' : ''}` : ''}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const sprite = b.kind === 'shelter' ? houseSprite(b, palette, q, scale, glow) : BUILDING_KINDS.includes(b.kind) ? generateDecoration(b.kind as never, b.seed, palette, q) : placeableSprite(b.kind, b.seed, palette, b.variant ?? 0, q);
  spriteCache.set(key, sprite);
  return sprite;
}

/** Where a finished house's chimney smokes, in world pixels (Cottage and Dream Home; the shelter has none). */
const chimneyCache = new Map<string, { x: number; y: number } | null>();
export function houseChimney(b: Building, palette: WorldPalette, scale = 1.6): { x: number; y: number } | null {
  const level = houseLevel(b);
  if (b.kind !== 'shelter' || level === 1) return null;
  const look = resolveLook(level, b.look);
  // Cached by everything that moves the chimney (drawing a house is not free, and smoke asks often).
  const key = `${b.seed}|${level}|${look.roof},${look.wall},${look.door},${look.window}|${b.x},${b.y}|${scale}|${palette.name}`;
  if (chimneyCache.has(key)) return chimneyCache.get(key)!;
  const at = chimneyAt(b, palette, scale, level, look);
  if (chimneyCache.size > 64) chimneyCache.clear();
  chimneyCache.set(key, at);
  return at;
}

function chimneyAt(b: Building, palette: WorldPalette, scale: number, level: number, look: ResolvedLook): { x: number; y: number } | null {
  const size = Math.round(18 * scale);
  const art = level === 2 ? drawCottage(b.seed, size + 10, palette, look, 1) : drawDreamHome(b.seed, size + 20, palette, look, 1);
  return art.chimney ? { x: b.x - art.anchorX + art.chimney.x, y: b.y - art.anchorY + art.chimney.y } : null;
}

/** A house at its level and look: the shelter (level 1), the Cottage or the Dream Home. */
export function houseSprite(b: Building, palette: WorldPalette, progress: number, scale = 1.6, lit = false): Sprite {
  const level = houseLevel(b);
  const look = resolveLook(level, b.look);
  const size = Math.round(18 * scale);
  if (level === 1) return generateShelter(b.seed, size, palette, progress, look, lit);
  const art = level === 2 ? drawCottage(b.seed, size + 10, palette, look, progress, lit) : drawDreamHome(b.seed, size + 20, palette, look, progress, lit);
  const foot = footOf(b);
  return { buffer: art.buffer, anchorX: art.anchorX, anchorY: art.anchorY, footRx: foot.footRx, footRy: foot.footRy };
}

/**
 * A content placeable's sprite: its art, anchored so the footprint (anchor ± footRy) covers the bottom of the
 * drawing, rising from the ground while it is being placed (`progress` < 1).
 */
export function placeableSprite(kind: BuildingKind, seed: string, palette: WorldPalette, variant: number, progress = 1): Sprite {
  const def = BUILDINGS[kind];
  const content = PLACEABLE_CONTENT.find((p) => p.kind === kind)!;
  const full = ART[content.art]({ seed, palette, variant });
  const anchorY = def.layer === 'wall' ? full.height - 1 : Math.max(0, full.height - 1 - def.footRy);
  let buffer = full;
  if (progress < 1) {
    buffer = new PixelBuffer(full.width, full.height);
    const shown = Math.max(1, Math.round(full.height * Math.max(0, progress)));
    for (let y = full.height - shown; y < full.height; y++) for (let x = 0; x < full.width; x++) buffer.set(x, y, full.get(x, y));
  }
  return { buffer, anchorX: Math.floor(full.width / 2), anchorY, footRx: def.footRx, footRy: def.footRy };
}
