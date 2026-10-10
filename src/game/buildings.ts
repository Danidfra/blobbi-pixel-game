/**
 * BUILDINGS. The first construction loop: a small wooden shelter the player places on the island, paid for
 * from the bag, raised over a little world time, and kept for good.
 *
 * Coordinates are stable: a building's place is stored in the ISLAND FRAME (the Variant 0 canvas, the frame
 * every gameplay coordinate lives in, see `src/carrier/`), so a later carrier canvas or world growth can move
 * the canvas around the island without moving a single building. In memory the live world keeps canvas
 * coordinates (island frame + `carrier.origin`); the save converts.
 */
import { stream } from '../core/rng';
import { hex, mix } from '../core/color';
import { ramp, type WorldPalette } from '../core/palette';
import { Mask, PixelBuffer, type Sprite } from '../core/pixel';
import { T, WALKABLE, type TerrainMap, type WorldDescription } from '../world/types';
import type { Ingredient } from './crafting';
import { ITEMS } from './items';

export type BuildingKind = 'shelter';

export interface BuildingDefinition {
  kind: BuildingKind;
  id: string;
  label: string;
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
    cost: [
      { item: ITEMS.wood.id, quantity: 6 },
      { item: ITEMS.stone.id, quantity: 3 },
    ],
    footRx: 12,
    footRy: 5,
    buildSeconds: 24,
  },
};

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
}

/** Construction progress 0..1 at a world time. */
export function buildingProgress(b: Building, worldTime: number): number {
  const def = BUILDINGS[b.kind];
  return Math.max(0, Math.min(1, (worldTime - b.placedAt) / def.buildSeconds));
}

/** Progress quantized to construction steps, so sprites are reused. */
export const PROGRESS_STEPS = 12;
export const quantizeProgress = (p: number): number => Math.round(Math.max(0, Math.min(1, p)) * PROGRESS_STEPS) / PROGRESS_STEPS;

// ─── Placement ───────────────────────────────────────────────────────────────

export type PlacementProblem = 'water' | 'ground' | 'blocked' | 'building' | 'resource' | 'blobbi' | 'edge';

export interface PlacementCheck {
  ok: boolean;
  problem: PlacementProblem | null;
  /** The footprint rectangle checked, canvas pixels. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const BUILDABLE = new Set<number>([T.GRASS, T.GRASS_PATCH, T.GRASS_DARK, T.MEADOW, T.GRASS_EDGE]);

export interface PlacementContext {
  world: WorldDescription;
  /** Pixels blocked by objects, water, cliffs and existing buildings. */
  isBlocked: (x: number, y: number) => boolean;
  buildings: readonly Building[];
  resources: readonly { x: number; y: number }[];
  blobbi: { x: number; y: number; footRx: number; footRy: number };
}

/**
 * Can a building stand with its ground anchor at (x, y)? Every pixel of the footprint (plus a one-pixel margin)
 * must be buildable grass on one level, unblocked (no object footprint, water, rim or cliff), clear of other
 * buildings, of resource nodes and of the Blobbi.
 */
export function checkPlacement(kind: BuildingKind, x: number, y: number, ctx: PlacementContext): PlacementCheck {
  const def = BUILDINGS[kind];
  const x0 = Math.round(x) - def.footRx;
  const x1 = Math.round(x) + def.footRx;
  const y0 = Math.round(y) - def.footRy;
  const y1 = Math.round(y) + def.footRy;
  const result = (problem: PlacementProblem | null): PlacementCheck => ({ ok: problem === null, problem, x0, y0, x1, y1 });
  const terrain: TerrainMap = ctx.world.terrain;
  const { width, height, cls, elevation } = terrain;
  if (x0 - 1 < 0 || y0 - 1 < 0 || x1 + 1 >= width || y1 + 1 >= height) return result('edge');
  // Other buildings first (their footprints also block, but "too close to a building" is the useful answer).
  for (const b of ctx.buildings) {
    const d = BUILDINGS[b.kind];
    if (Math.abs(b.x - Math.round(x)) < def.footRx + d.footRx + 3 && Math.abs(b.y - Math.round(y)) < def.footRy + d.footRy + 3) return result('building');
  }
  const level = elevation[Math.round(y) * width + Math.round(x)];
  for (let py = y0 - 1; py <= y1 + 1; py++)
    for (let px = x0 - 1; px <= x1 + 1; px++) {
      const i = py * width + px;
      const c = cls[i];
      if (c < T.GRASS_EDGE || c === T.POND || c === T.POND_EDGE) return result(c <= T.FOAM || c === T.POND || c === T.POND_EDGE ? 'water' : 'ground');
      if (!BUILDABLE.has(c) || !WALKABLE.has(c) || elevation[i] !== level) return result('ground');
      if (ctx.isBlocked(px, py)) return result('blocked');
    }
  for (const n of ctx.resources) if (n.x >= x0 - 1 && n.x <= x1 + 1 && n.y >= y0 - 1 && n.y <= y1 + 1) return result('resource');
  const b = ctx.blobbi;
  if (b.x + b.footRx >= x0 - 1 && b.x - b.footRx <= x1 + 1 && b.y + b.footRy >= y0 - 1 && b.y - b.footRy <= y1 + 1) return result('blobbi');
  return result(null);
}

export const PROBLEM_TEXT: Record<PlacementProblem, string> = {
  water: 'not on water',
  ground: 'needs flat grass',
  blocked: 'something is in the way',
  building: 'too close to a building',
  resource: 'resources lie there',
  blobbi: 'you are standing there',
  edge: 'too close to the edge',
};

// ─── The shelter ─────────────────────────────────────────────────────────────

const THATCH = ramp(hex('#c7a24c'), { step: 0.085, hueShift: 8 });

/**
 * A small wooden shelter: log walls, a thatched gable roof, an open doorway, corner posts. `progress` draws it
 * under construction: posts and a log pile first, then the walls rising, then the roof closing from the eaves
 * to the ridge. The seed decides the thatch's tone and the plank pattern; the shape is one design.
 */
export function generateShelter(seed: string, size: number, palette: WorldPalette, progress = 1): Sprite {
  const w = Math.max(16, Math.min(40, Math.round(size)));
  const rng = stream(seed, 'shelter');
  const wood = palette.wood;
  const thatch = rng.chance(0.5) ? THATCH : ramp(mix(hex('#c7a24c'), palette.trunk[0].mid, 0.35), { step: 0.085, hueShift: 8 });
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
  // Doorway: open and dark, with a lintel.
  const doorW = Math.max(5, Math.round(w * 0.24));
  const doorH = Math.max(6, Math.round(wallH * 0.8));
  const doorX = wallX + Math.round(w / 2 - doorW / 2);
  const doorY = groundY - doorH;
  buf.fillRect(doorX, doorY, doorW, doorH, mix(wood.outline, hex('#1b1410'), 0.6));
  buf.hline(doorX - 1, doorX + doorW, doorY - 1, wood.light);
  buf.vline(doorX - 1, doorY, groundY, wood.dark);
  buf.vline(doorX + doorW, doorY, groundY, wood.dark);
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
export function buildingSprite(b: Building, palette: WorldPalette, progress: number, scale = 1.6): Sprite {
  const q = quantizeProgress(progress);
  const key = `${palette.name}|${b.kind}|${b.seed}|${q}|${scale}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const sprite = generateShelter(b.seed, Math.round(18 * scale), palette, q);
  spriteCache.set(key, sprite);
  return sprite;
}
