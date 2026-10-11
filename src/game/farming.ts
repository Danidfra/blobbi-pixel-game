/**
 * FARMING. A farm plot is one tile of tilled soil on a fixed grid; a crop planted in it grows only while the soil
 * is wet, through five stages, and is harvested into food. Everything is a pure function of WORLD TIME (persisted
 * simulated seconds), never of frames, so growth continues exactly where it was after a reload.
 *
 * WATER. Watering wets the soil for the crop's `waterSeconds`; growth accrues inside that window and pauses when
 * it ends (nothing wilts, nothing is lost: a dry crop simply waits). A crop needs `growSeconds` of wet time, so
 * the fewest waterings it takes is growSeconds / waterSeconds (two or three). Watering a wet crop does nothing.
 *
 * COORDINATES. A plot is stored by its grid cell in the ISLAND FRAME (the frame buildings are saved in), so a
 * later canvas or world growth never moves a field. One cell is `PLOT_GRID` pixels square.
 *
 * CONTENT. Crops are data (`content/crops.ts`): growth and watering times, yields, sprites. Multi-harvest crops
 * (tomato, strawberry) go back to their growing stage after a picking and need water again; the last picking
 * returns their seeds and frees the plot.
 */
import { stream } from '../core/rng';
import { hex, mix, type Color } from '../core/color';
import { ramp, type WorldPalette } from '../core/palette';
import { PixelBuffer, type Sprite } from '../core/pixel';
import type { Ingredient } from './crafting';
import { CROP_CONTENT } from '../content/crops';

/** Pixels per grid cell (island frame). A plot fills one cell; plots side by side make a field. */
export const PLOT_GRID = 8;

/** A crop's kind: a key of `CROPS` (data-driven, see `content/crops.ts`). */
export type CropKind = string;
export const CROP_KINDS: readonly CropKind[] = CROP_CONTENT.map((c) => c.kind);

export interface CropDefinition {
  kind: CropKind;
  label: string;
  /** The seed item one planting consumes. */
  seed: string;
  /** The produce item. */
  produce: string;
  /** What the LAST (or only) harvest puts in the bag: produce and seeds back, all of it or the harvest waits. */
  harvest: readonly Ingredient[];
  /** Produce per picking (multi-harvest crops pick this many each time). */
  yield: number;
  /** Seconds of WET world time from planting to maturity. */
  growSeconds: number;
  /** Seconds one watering keeps the soil wet. */
  waterSeconds: number;
  /** Pickings before the plant is spent (1 for most crops). */
  harvests: number;
  /** Wet seconds from one picking to the next. */
  regrowSeconds: number;
  flower: boolean;
}

export const CROPS: Record<CropKind, CropDefinition> = Object.fromEntries(
  CROP_CONTENT.map((c) => {
    const seed = typeof c.seed === 'string' ? c.seed : c.seed.id;
    const harvest: Ingredient[] = [{ item: c.produce.id, quantity: c.yield }];
    if (c.seedBack > 0) harvest.push({ item: seed, quantity: c.seedBack });
    return [c.kind, { kind: c.kind, label: c.label, seed, produce: c.produce.id, harvest, yield: c.yield, growSeconds: c.growSeconds, waterSeconds: c.waterSeconds, harvests: c.harvests ?? 1, regrowSeconds: c.regrowSeconds ?? c.growSeconds, flower: !!c.flower }];
  }),
);

/** The crop planted from a seed item, or null. */
export const cropForSeed = (item: string): CropKind | null => CROP_KINDS.find((k) => CROPS[k].seed === item) ?? null;

/** A crop in the ground. */
export interface CropState {
  kind: CropKind;
  /** World time of planting. */
  plantedAt: number;
  /** Seconds of growth banked at the last watering. */
  grown: number;
  /** The current (or last) wet window, or null before the first watering. */
  wetFrom: number | null;
  wetUntil: number | null;
  /** Pickings taken so far (multi-harvest crops). */
  picks?: number;
}

export interface FarmPlot {
  /** Stable id: `plot:<n>` in the order the plots were made. */
  id: string;
  /** Grid cell in the island frame. */
  gx: number;
  gy: number;
  /** World time the soil was tilled. */
  preparedAt: number;
  crop: CropState | null;
  /** Harvests taken from this plot (its history; every harvest is counted once). */
  harvests: number;
}

/** Growth stages: seeds in the soil, sprout, young, growing, mature. */
export const CROP_STAGES = 5;
export type CropStage = 0 | 1 | 2 | 3 | 4;
export const STAGE_NAMES = ['seeds', 'sprout', 'young', 'growing', 'mature'] as const;

/** Seconds of growth a crop has at a world time: what it banked plus its wet time since. */
export function cropGrowth(crop: CropState, t: number): number {
  const def = CROPS[crop.kind];
  const wet = crop.wetFrom === null || crop.wetUntil === null ? 0 : Math.max(0, Math.min(t, crop.wetUntil) - crop.wetFrom);
  return Math.min(def.growSeconds, crop.grown + wet);
}

/** Growth 0..1. */
export const cropProgress = (crop: CropState, t: number): number => cropGrowth(crop, t) / CROPS[crop.kind].growSeconds;

export const isMature = (crop: CropState, t: number): boolean => cropGrowth(crop, t) >= CROPS[crop.kind].growSeconds;

export function cropStage(crop: CropState, t: number): CropStage {
  if (isMature(crop, t)) return 4;
  // A plant that has been picked stays a full plant while it fruits again.
  if ((crop.picks ?? 0) > 0) return 3;
  return Math.min(3, Math.floor(cropProgress(crop, t) * 4)) as CropStage;
}

export const isWet = (crop: CropState, t: number): boolean => crop.wetUntil !== null && t < crop.wetUntil;

/** A crop that is not mature and whose soil is dry is waiting for water. */
export const needsWater = (crop: CropState, t: number): boolean => !isMature(crop, t) && !isWet(crop, t);

/** Wet seconds still needed to mature (0 when mature). */
export const growthRemaining = (crop: CropState, t: number): number => CROPS[crop.kind].growSeconds - cropGrowth(crop, t);

export function plantCrop(kind: CropKind, t: number): CropState {
  return { kind, plantedAt: t, grown: 0, wetFrom: null, wetUntil: null };
}

/** What harvesting this crop now yields: the produce, plus the seeds back on its last picking. */
export function harvestFor(crop: CropState): Ingredient[] {
  const def = CROPS[crop.kind];
  const last = (crop.picks ?? 0) + 1 >= def.harvests;
  return last ? [...def.harvest] : [{ item: def.produce, quantity: def.yield }];
}

/** The crop after a picking: back to growing (and dry) when it fruits again, or null when the plant is spent. */
export function afterHarvest(crop: CropState): CropState | null {
  const def = CROPS[crop.kind];
  const picks = (crop.picks ?? 0) + 1;
  if (picks >= def.harvests) return null;
  return { ...crop, picks, grown: Math.max(0, def.growSeconds - def.regrowSeconds), wetFrom: null, wetUntil: null };
}

/** Water a dry crop at world time t: bank the growth so far and open a new wet window. Null when it cannot be watered. */
export function waterCrop(crop: CropState, t: number): CropState | null {
  if (!needsWater(crop, t)) return null;
  return { ...crop, grown: cropGrowth(crop, t), wetFrom: t, wetUntil: t + CROPS[crop.kind].waterSeconds };
}

// ─── Grid ───────────────────────────────────────────────────────────────────

export interface Cell {
  gx: number;
  gy: number;
}

export const cellKey = (c: Cell): string => `${c.gx},${c.gy}`;

/** The grid cell containing a canvas point. `origin` is the carrier's origin (canvas = island frame + origin). */
export function cellAt(x: number, y: number, origin: { x: number; y: number }): Cell {
  return { gx: Math.floor((x - origin.x) / PLOT_GRID), gy: Math.floor((y - origin.y) / PLOT_GRID) };
}

/** A cell's pixel rectangle on the canvas, inclusive. */
export function cellRect(c: Cell, origin: { x: number; y: number }): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = c.gx * PLOT_GRID + origin.x;
  const y0 = c.gy * PLOT_GRID + origin.y;
  return { x0, y0, x1: x0 + PLOT_GRID - 1, y1: y0 + PLOT_GRID - 1 };
}

/** A cell's ground centre on the canvas (where its crop stands). */
export function cellCentre(c: Cell, origin: { x: number; y: number }): { x: number; y: number } {
  const r = cellRect(c, origin);
  return { x: r.x0 + PLOT_GRID / 2, y: r.y0 + PLOT_GRID / 2 };
}

// ─── Sprites ────────────────────────────────────────────────────────────────

const SOIL = ramp(hex('#9b6b3f'), { step: 0.08, hueShift: 6 });
const WET_SOIL = ramp(hex('#6a4429'), { step: 0.08, hueShift: 6 });
const LEAF = ramp(hex('#4fbf3a'), { step: 0.1, hueShift: 8 });
const CROP_COLOURS: Record<CropKind, Record<string, Color>> = Object.fromEntries(CROP_CONTENT.map((c) => [c.kind, Object.fromEntries(Object.entries(c.colours).map(([k, v]) => [k, hex(v)]))]));
const TEMPLATES: Record<CropKind, { growing: string[]; mature: string[] }> = Object.fromEntries(CROP_CONTENT.map((c) => [c.kind, { growing: c.growing, mature: c.mature }]));

/** The tilled soil of one plot: a raked tile with two furrows, dark when wet. */
export function plotSprite(wet: boolean, variant = 0): PixelBuffer {
  const s = wet ? WET_SOIL : SOIL;
  const n = PLOT_GRID;
  const buf = new PixelBuffer(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const rim = x === 0 || y === 0 || x === n - 1 || y === n - 1;
      const furrow = y === 2 || y === 5;
      // A few lighter clods, fixed per variant so a field is not a wallpaper.
      const clod = !rim && !furrow && ((x * 5 + y * 3 + variant) % 7 === 0);
      buf.set(x, y, rim ? s.dark : furrow ? mix(s.dark, s.mid, 0.4) : clod ? s.light : s.mid);
    }
  // Soft corners.
  for (const [x, y] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]]) buf.set(x, y, mix(s.dark, s.outline, 0.5));
  return buf;
}

// Crop templates, bottom row on the soil. g/G/d leaf mid/light/dark, s seed; crop colours per kind (see above).
const SEEDS = ['s.s.s'];
const SPROUT = ['G.G', '.g.'];
const YOUNG = ['G...G', '.g.g.', '..g..'];

function template(kind: CropKind, stage: CropStage): string[] {
  if (stage === 0) return SEEDS;
  if (stage === 1) return SPROUT;
  if (stage === 2) return YOUNG;
  return stage === 3 ? TEMPLATES[kind].growing : TEMPLATES[kind].mature;
}

const cropCache = new Map<string, Sprite>();

/**
 * A crop's sprite at a stage: hand-set shapes in a leaf ramp and the crop's own colours, outlined like every object
 * in the lab, mirrored by the plot's seed so a field of one crop is not a stamp. Anchor: the bottom centre, on the
 * plot's centre.
 */
export function cropSprite(kind: CropKind, stage: CropStage, seed: string): Sprite {
  const mirror = stream(seed, 'crop-mirror').chance(0.5);
  const key = `${kind}|${stage}|${mirror ? 'm' : ''}`;
  const hit = cropCache.get(key);
  if (hit) return hit;
  const rows = template(kind, stage).map((r) => (mirror ? [...r].reverse().join('') : r));
  const w = rows[0].length;
  const h = rows.length;
  const colours: Record<string, Color> = { g: LEAF.mid, G: LEAF.light, d: LEAF.dark, s: hex('#e3c48a'), ...CROP_COLOURS[kind] };
  const buf = new PixelBuffer(w + 2, h + 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch !== '.') buf.set(x + 1, y + 1, colours[ch]);
    }
  // Seeds lie in the soil (no outline); everything else gets one, dark green by leaves, darker crop by the crop.
  if (stage > 0) {
    const mask = buf.opaqueMask();
    const grown = mask.dilate();
    const leafy = new Set([LEAF.mid, LEAF.light, LEAF.dark]);
    for (let y = 0; y < buf.height; y++)
      for (let x = 0; x < buf.width; x++) {
        if (!grown.get(x, y) || mask.get(x, y)) continue;
        let leaf = false;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (leafy.has(buf.get(x + ox, y + oy))) leaf = true;
        buf.set(x, y, leaf ? LEAF.outline : mix(colours.c ?? LEAF.outline, hex('#2b1a10'), 0.55));
      }
  }
  buf.validate();
  const sprite: Sprite = { buffer: buf, anchorX: Math.floor(buf.width / 2), anchorY: buf.height - 2, footRx: 0, footRy: 0 };
  cropCache.set(key, sprite);
  return sprite;
}

/** The little water drop that bobs over a dry crop. */
export function waterDropSprite(): PixelBuffer {
  const blue = hex('#5fb3f0');
  const light = hex('#d8f1ff');
  const ink = hex('#1f4f8a');
  const buf = new PixelBuffer(5, 6);
  const rows = ['..o..', '.oBo.', 'oBbbo', 'obbbo', '.ooo.'];
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== '.' && buf.set(x, y, ch === 'o' ? ink : ch === 'B' ? light : blue)));
  return buf;
}

/** The soil palette, for particles. */
export const SOIL_COLOURS = { dry: SOIL, wet: WET_SOIL, leaf: LEAF };
export const cropColour = (kind: CropKind): Color => Object.values(CROP_COLOURS[kind])[0];

/** The palette argument is accepted for symmetry with the other sprite makers; soil and crops keep their colours. */
export type { WorldPalette };
