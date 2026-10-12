/**
 * THE HOUSES (M8): the player's home at its three levels, drawn in the island's own pixel style (the same wood and
 * stone ramps, outlines and light from the left as every object), at the world's native pixel scale.
 *
 *   1 Cozy Shelter   log walls, a thatched gable, one door, one window            (the M3.1 shelter, with a window)
 *   2 Cottage        plank walls on a stone footing, a shingled roof with a chimney, two windows and a gable window,
 *                    a small porch over the door
 *   3 Dream Home     two storeys, a tiled roof with a dormer and a chimney, five windows with flower boxes, an arched
 *                    double door, a wide porch with a railing and lanterns
 *
 * Each level is its own drawing (never a scaled-up smaller house). The LOOK (roof colour, wall material, door style,
 * window style) changes colours and small parts, never the shape or the footprint, so a customised house stands on
 * exactly the same ground. Construction (`progress` < 1) shows the walls rising inside a scaffold, then the roof.
 */
import { hex, mix, type Color } from '../core/color';
import { ramp, type Ramp, type WorldPalette } from '../core/palette';
import { Mask, PixelBuffer } from '../core/pixel';
import { stream } from '../core/rng';

export interface HouseLook {
  /** Roof colour (`ROOF_COLOURS`). */
  roof?: number;
  /** Wall material (`WALL_MATERIALS`). */
  wall?: number;
  /** Door style (`DOOR_STYLES`). */
  door?: number;
  /** Window style (`WINDOW_STYLES`). */
  window?: number;
}

export type ResolvedLook = Required<HouseLook>;

/** Roof colours: 0 is each level's natural material colour (gold thatch, cedar shingles, red tiles). */
export const ROOF_COLOURS: readonly { name: string; colour: string | null }[] = [
  { name: 'natural', colour: null },
  { name: 'terracotta', colour: '#c0603e' },
  { name: 'slate blue', colour: '#5f7c9c' },
  { name: 'moss green', colour: '#6f9a4c' },
  { name: 'plum', colour: '#8c5a8c' },
  { name: 'honey', colour: '#d8a040' },
];
/** Wall materials: 0 is natural wood (the island's own). */
export const WALL_MATERIALS: readonly { name: string; colour: string | null }[] = [
  { name: 'natural wood', colour: null },
  { name: 'whitewash', colour: '#e6dcc4' },
  { name: 'dark timber', colour: '#7c5236' },
  { name: 'fieldstone', colour: '#a8a090' },
  { name: 'rose paint', colour: '#e2a8ae' },
  { name: 'sky paint', colour: '#9cc0e0' },
];
export const DOOR_STYLES = ['open doorway', 'plank door', 'round door', 'double door'] as const;
export const WINDOW_STYLES = ['cross panes', 'round', 'shutters', 'flower box'] as const;

/** Each level's own door when the look does not choose one. */
const DEFAULT_DOOR: Record<1 | 2 | 3, number> = { 1: 0, 2: 1, 3: 3 };

export function resolveLook(level: number, look: HouseLook | undefined): ResolvedLook {
  const lv = (level === 2 || level === 3 ? level : 1) as 1 | 2 | 3;
  const pick = (v: number | undefined, n: number, d: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : d);
  return {
    roof: pick(look?.roof, ROOF_COLOURS.length, 0),
    wall: pick(look?.wall, WALL_MATERIALS.length, 0),
    door: pick(look?.door, DOOR_STYLES.length, DEFAULT_DOOR[lv]),
    window: pick(look?.window, WINDOW_STYLES.length, 0),
  };
}

/** The roof ramp: the level's natural material, or the chosen colour. */
export function roofRamp(level: number, look: ResolvedLook, seed: string, palette: WorldPalette): Ramp {
  const c = ROOF_COLOURS[look.roof]?.colour;
  if (c) return ramp(hex(c), { step: 0.085, hueShift: 8 });
  if (level === 3) return ramp(hex('#b8553a'), { step: 0.085, hueShift: 8 });
  if (level === 2) return ramp(mix(hex('#9a6a44'), palette.trunk[0].mid, 0.3), { step: 0.08, hueShift: 8 });
  // Level 1: the M3.1 thatch, one of two tones by the seed.
  const rng = stream(seed, 'shelter');
  return rng.chance(0.5) ? ramp(hex('#c7a24c'), { step: 0.085, hueShift: 8 }) : ramp(mix(hex('#c7a24c'), palette.trunk[0].mid, 0.35), { step: 0.085, hueShift: 8 });
}

/** The wall ramp: the island's wood, or the chosen material. */
export function wallRamp(look: ResolvedLook, palette: WorldPalette): Ramp {
  const c = WALL_MATERIALS[look.wall]?.colour;
  return c ? ramp(hex(c), { step: 0.08, hueShift: 8 }) : palette.wood;
}

const GLASS = hex('#9ad0f0');
const GLASS_NIGHT = hex('#ffd98a');
const DARK = hex('#1b1410');

/**
 * A door in a wall: `x`, `top` its top-left, `w` × `h` its opening. Styles: an open doorway (dark), a plank door, a
 * round-topped door, a double door (with an arch over it when there is room).
 */
export function drawDoor(buf: PixelBuffer, style: number, x: number, top: number, w: number, h: number, wood: Ramp, frame: Ramp): void {
  const bottom = top + h - 1;
  const doorWood = ramp(mix(wood.mid, hex('#7a4a2a'), 0.45), { step: 0.08, hueShift: 8 });
  if (style === 0) {
    buf.fillRect(x, top, w, h, mix(wood.outline, DARK, 0.6));
  } else {
    for (let yy = top; yy <= bottom; yy++)
      for (let xx = x; xx < x + w; xx++) {
        // A round door loses its top corners; a double door has a centre seam.
        if (style === 2 && yy < top + 2 && (xx - x < 2 - (yy - top) || x + w - 1 - xx < 2 - (yy - top))) continue;
        const seam = style === 3 ? xx === x + Math.floor(w / 2) || xx === x + Math.floor(w / 2) - (w % 2 ? 0 : 1) : (xx - x) % 3 === 2;
        buf.set(xx, yy, seam ? doorWood.dark : xx === x ? doorWood.light : doorWood.mid);
      }
    // Handle(s) and a hinge band.
    const hy = top + Math.floor(h / 2) + 1;
    if (style === 3) {
      buf.set(x + Math.floor(w / 2) - 2, hy, hex('#f0d080'));
      buf.set(x + Math.floor(w / 2) + 1, hy, hex('#f0d080'));
    } else buf.set(x + w - 2, hy, hex('#f0d080'));
    buf.hline(x, x + w - 1, top + 2, doorWood.outline);
  }
  // The frame: posts and a lintel (an arch over a round or double door).
  buf.vline(x - 1, top, bottom, frame.dark);
  buf.vline(x + w, top, bottom, frame.dark);
  if (style === 2 || style === 3) {
    buf.hline(x + 1, x + w - 2, top - 1, frame.light);
    buf.set(x, top, frame.light);
    buf.set(x + w - 1, top, frame.light);
  } else buf.hline(x - 1, x + w, top - 1, frame.light);
}

/**
 * A window: `x`, `y` its top-left, `w` × `h` its glass. Styles: cross panes, round, shutters, a flower box under it.
 * `lit` shows warm light behind the glass (the house at night).
 */
export function drawWindow(buf: PixelBuffer, style: number, x: number, y: number, w: number, h: number, frame: Ramp, lit = false, flowers: Color = hex('#f07a9a')): void {
  const glass = lit ? GLASS_NIGHT : GLASS;
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) {
      if (style === 1 && (yy === y || yy === y + h - 1) && (xx === x || xx === x + w - 1)) continue;
      buf.set(xx, yy, glass);
    }
  if (!lit) buf.set(x + 1, y + 1, mix(glass, hex('#ffffff'), 0.6));
  if (style === 1) {
    // Round: the frame follows the clipped corners.
    for (let xx = x + 1; xx < x + w - 1; xx++) {
      buf.set(xx, y - 1, frame.dark);
      buf.set(xx, y + h, frame.dark);
    }
    for (let yy = y + 1; yy < y + h - 1; yy++) {
      buf.set(x - 1, yy, frame.dark);
      buf.set(x + w, yy, frame.dark);
    }
    for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) buf.set(cx, cy, frame.dark);
    if (w >= 4) buf.vline(x + Math.floor(w / 2), y, y + h - 1, frame.mid);
    return;
  }
  buf.strokeRect(x - 1, y - 1, w + 2, h + 2, frame.dark);
  if (w >= 4) buf.vline(x + Math.floor((w - 1) / 2), y, y + h - 1, frame.mid);
  if (h >= 4) buf.hline(x, x + w - 1, y + Math.floor((h - 1) / 2), frame.mid);
  buf.hline(x - 1, x + w, y + h, frame.light); // the sill
  if (style === 2) {
    // Shutters, open, on both sides.
    const sh = ramp(mix(frame.mid, hex('#4a7a5a'), 0.6), { step: 0.08 });
    for (let yy = y - 1; yy <= y + h; yy++) {
      buf.set(x - 2, yy, (yy - y) % 2 ? sh.dark : sh.mid);
      buf.set(x + w + 1, yy, (yy - y) % 2 ? sh.dark : sh.mid);
    }
  }
  if (style === 3) {
    // A flower box under the sill.
    buf.hline(x - 1, x + w, y + h + 1, frame.dark);
    for (let xx = x - 1; xx <= x + w; xx++) buf.set(xx, y + h, xx % 2 ? flowers : hex('#5aa04a'));
  }
}

export interface HouseArt {
  buffer: PixelBuffer;
  anchorX: number;
  anchorY: number;
  /** The chimney top (smoke), in sprite pixels, when there is one. */
  chimney: { x: number; y: number } | null;
}

/** Construction: pixels above a rising line are hidden; a scaffold of poles and planks shows the shape to come. */
function underConstruction(buf: PixelBuffer, roof: Mask, wallTop: number, groundY: number, x0: number, x1: number, p: number, wood: Ramp): void {
  if (p >= 1) return;
  const wallBuilt = Math.min(1, p / 0.6);
  const roofBuilt = Math.max(0, (p - 0.6) / 0.4);
  const wallLine = groundY - Math.round((groundY - wallTop) * wallBuilt);
  const roofTop = roof.bounds()?.y ?? wallTop;
  const roofLine = wallTop - Math.round((wallTop - roofTop) * roofBuilt);
  for (let y = 0; y < buf.height; y++)
    for (let x = 0; x < buf.width; x++) {
      if (!(buf.get(x, y) >>> 24)) continue;
      const isRoof = roof.get(x, y);
      if (isRoof ? y < roofLine || roofBuilt === 0 : y < wallLine && y >= wallTop) buf.set(x, y, 0);
      else if (!isRoof && y < wallTop && roofBuilt === 0) buf.set(x, y, 0);
    }
  // The scaffold: two poles to the roof's height, planks every few rows.
  for (const x of [x0, x1]) {
    buf.vline(x, roofTop + 2, groundY, wood.dark);
    buf.set(x, roofTop + 1, wood.outline);
  }
  for (let y = groundY - 5; y > roofTop + 2; y -= 6) buf.hline(x0, x1, y, mix(wood.mid, wood.dark, 0.4));
}

/** A gable roof mask over `rx0 .. rx0 + rw - 1`, from `top` to `bottom`, with a peak of `peakH` rows. */
function gable(width: number, height: number, rx0: number, rw: number, top: number, bottom: number, peakH: number): Mask {
  const m = new Mask(width, height);
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / peakH;
    const half = y - top < peakH ? Math.max(1, (rw / 2) * Math.min(1, t)) : rw / 2;
    for (let x = Math.ceil(rx0 + rw / 2 - half); x <= Math.floor(rx0 + rw / 2 + half - 0.5); x++) m.set(x, y);
  }
  return m;
}

/** Wall cladding at a pixel: logs (level 1), planks (2), smooth boards with a beam (3); stone gets courses. */
function wallPixel(level: number, stone: boolean, wall: Ramp, x: number, y: number, wallX: number, wallTop: number, w: number): Color {
  const lit = x < wallX + Math.round(w * 0.3);
  const ry = y - wallTop;
  if (stone) {
    const course = Math.floor(ry / 3);
    const seam = ry % 3 === 2 || (x + course * 3) % 6 === 0;
    return seam ? wall.dark : lit ? wall.light : wall.mid;
  }
  if (level === 1) {
    const log = ry % 3;
    if (log === 2) return wall.dark;
    if (log === 0) return lit ? wall.light : wall.mid;
    return lit ? wall.mid : mix(wall.mid, wall.dark, 0.35);
  }
  if (level === 2) {
    // Vertical board-and-batten.
    if ((x - wallX) % 4 === 3) return wall.dark;
    return lit ? mix(wall.mid, wall.light, 0.5) : wall.mid;
  }
  // Level 3: horizontal clapboard, every other row shadowed.
  return ry % 3 === 2 ? mix(wall.mid, wall.dark, 0.6) : lit ? mix(wall.mid, wall.light, 0.5) : wall.mid;
}

/** Shingles or tiles on a roof mask: rows with offset scallops, lit on the left slope. */
function paintRoof(buf: PixelBuffer, roof: Mask, r: Ramp, ridgeX: number, top: number, kind: 'thatch' | 'shingle' | 'tile', seed: string): void {
  const rng = stream(seed, 'roof');
  const flick = rng.int(0, 1);
  buf.paintMaskWith(roof, (x, y) => {
    const row = y - top;
    const left = x + 0.5 < ridgeX;
    if (kind === 'thatch') {
      const straw = (x * 7 + y * 3 + flick) % 5 === 0;
      if (row % 4 === 3) return left ? r.mid : r.dark;
      return left ? (straw ? r.highlight : r.light) : straw ? r.light : r.mid;
    }
    if (kind === 'shingle') {
      const band = Math.floor(row / 3);
      const edge = row % 3 === 2;
      const split = (x + band * 2) % 4 === 0 && !edge;
      if (edge) return left ? r.dark : r.outline;
      if (split) return r.dark;
      return left ? r.light : r.mid;
    }
    // Tiles: rounded courses.
    const band = Math.floor(row / 3);
    const edge = row % 3 === 2;
    const bump = (x + band) % 3 === 0;
    if (edge) return left ? r.dark : mix(r.dark, r.outline, 0.5);
    return bump ? (left ? r.highlight : r.light) : left ? r.light : r.mid;
  });
  buf.paintMask(roof.edge(), r.outline);
}

/** A stone chimney standing on the roof: `x` its left column, `top` its cap, `bottom` where it meets the roof. */
function chimney(buf: PixelBuffer, x: number, top: number, bottom: number, stone: Ramp): void {
  for (let y = top; y <= bottom; y++)
    for (let xx = x; xx < x + 4; xx++) buf.set(xx, y, (y - top) % 3 === 2 ? stone.dark : xx === x ? stone.light : stone.mid);
  buf.hline(x - 1, x + 4, top, stone.outline);
  buf.hline(x - 1, x + 4, top + 1, stone.light);
  buf.vline(x - 1, top + 1, bottom, stone.outline);
  buf.vline(x + 4, top + 1, bottom, stone.outline);
}

/** The Cottage (level 2): `w` wall width (39 at world scale 1.6). */
export function drawCottage(seed: string, w: number, palette: WorldPalette, look: ResolvedLook, progress: number, lit = false): HouseArt {
  const wall = wallRamp(look, palette);
  const roofR = roofRamp(2, look, seed, palette);
  const stoneR = palette.stone;
  const wood = palette.wood;
  const wallH = 17;
  const roofH = 19;
  const eave = 3;
  const width = w + eave * 2 + 2;
  const height = wallH + roofH + 9;
  const buf = new PixelBuffer(width, height);
  const groundY = height - 3;
  const wallX = eave + 1;
  const wallTop = groundY - wallH + 1;
  const isStone = WALL_MATERIALS[look.wall]?.name === 'fieldstone';
  // Walls on a stone footing.
  for (let y = wallTop; y <= groundY; y++)
    for (let x = wallX; x < wallX + w; x++) buf.set(x, y, y >= groundY - 1 ? ((x + y) % 4 === 0 ? stoneR.dark : stoneR.mid) : wallPixel(2, isStone, wall, x, y, wallX, wallTop, w));
  buf.strokeRect(wallX, wallTop, w, wallH, wall.outline);
  buf.hline(wallX, wallX + w - 1, groundY, stoneR.outline);
  buf.hline(wallX + 1, wallX + w - 2, wallTop + 1, mix(wall.dark, DARK, 0.3)); // the eave's shadow
  // Door (right of centre, as inside), two windows.
  const doorW = 7;
  const doorH = 11;
  const doorX = wallX + Math.round(w * 0.62) - Math.floor(doorW / 2);
  const doorTop = groundY - 1 - doorH;
  drawDoor(buf, look.door, doorX, doorTop, doorW, doorH, wood, wall);
  drawWindow(buf, look.window, wallX + 4, wallTop + 5, 6, 5, wood, lit);
  drawWindow(buf, look.window, wallX + w - 7, wallTop + 5, 4, 5, wood, lit);
  // Roof: a shingled gable with an overhang; a small round window in the gable.
  const roofBottom = wallTop + 1;
  const roofTop = roofBottom - roofH;
  const rx0 = wallX - eave;
  const rw = w + eave * 2;
  const roof = gable(width, height, rx0, rw, roofTop, roofBottom, Math.round(roofH * 0.62));
  const ridgeX = rx0 + rw / 2;
  // The chimney first, so the roof's near slope overlaps its foot.
  const chimX = wallX + 6;
  chimney(buf, chimX, roofTop + 5, roofTop + 12, stoneR);
  paintRoof(buf, roof, roofR, ridgeX, roofTop, 'shingle', seed);
  for (let x = rx0; x < rx0 + rw; x++) buf.set(x, roofBottom + 1, (x - rx0) % 2 ? roofR.dark : roofR.outline); // the eave line
  const gx = Math.round(ridgeX) - 2;
  drawWindow(buf, 1, gx, roofTop + 7, 4, 4, wood, lit);
  // The porch: a little lean-to over the door on two posts, a step in front.
  const px0 = doorX - 3;
  const px1 = doorX + doorW + 2;
  const py = doorTop - 3;
  for (let x = px0 - 1; x <= px1 + 1; x++) {
    buf.set(x, py, roofR.dark);
    buf.set(x, py + 1, (x - px0) % 2 ? roofR.mid : roofR.light);
  }
  buf.hline(px0 - 1, px1 + 1, py + 2, roofR.outline);
  for (const x of [px0, px1]) buf.vline(x, py + 3, groundY, wood.dark);
  buf.fillRect(px0, groundY + 1, px1 - px0 + 1, 2, wood.mid);
  buf.hline(px0, px1, groundY + 1, wood.light);
  buf.hline(px0, px1, groundY + 2, wood.dark);
  underConstruction(buf, roof, wallTop, groundY, wallX - 1, wallX + w, progress, wood);
  buf.validate();
  return { buffer: buf, anchorX: Math.round(width / 2), anchorY: groundY, chimney: progress >= 1 ? { x: chimX + 2, y: roofTop + 4 } : null };
}

/** The Dream Home (level 3): `w` wall width (49 at world scale 1.6). */
export function drawDreamHome(seed: string, w: number, palette: WorldPalette, look: ResolvedLook, progress: number, lit = false): HouseArt {
  const wall = wallRamp(look, palette);
  const roofR = roofRamp(3, look, seed, palette);
  const stoneR = palette.stone;
  const wood = palette.wood;
  const trim = ramp(mix(hex('#f4ecd8'), wall.light, 0.3), { step: 0.06 });
  const wallH = 27;
  const roofH = 20;
  const eave = 3;
  const width = w + eave * 2 + 6;
  const height = wallH + roofH + 12;
  const buf = new PixelBuffer(width, height);
  const groundY = height - 4;
  const wallX = eave + 3;
  const wallTop = groundY - wallH + 1;
  const floorLine = wallTop + 13;
  const isStone = WALL_MATERIALS[look.wall]?.name === 'fieldstone';
  for (let y = wallTop; y <= groundY; y++)
    for (let x = wallX; x < wallX + w; x++) buf.set(x, y, y >= groundY - 1 ? ((x + y) % 4 === 0 ? stoneR.dark : stoneR.mid) : wallPixel(3, isStone, wall, x, y, wallX, wallTop, w));
  buf.strokeRect(wallX, wallTop, w, wallH, wall.outline);
  buf.hline(wallX, wallX + w - 1, groundY, stoneR.outline);
  // The beam between the storeys, and corner boards.
  buf.hline(wallX, wallX + w - 1, floorLine, trim.dark);
  buf.hline(wallX, wallX + w - 1, floorLine + 1, trim.mid);
  for (const x of [wallX + 1, wallX + w - 2]) buf.vline(x, wallTop + 1, groundY - 2, trim.mid);
  // Upper storey: three windows; ground floor: two with flower boxes beside the arched double door.
  const upper = floorLine - 9;
  for (const k of [0.18, 0.5, 0.82]) drawWindow(buf, look.window, wallX + Math.round(w * k) - 3, upper, 6, 6, trim, lit);
  const doorW = 9;
  const doorH = 12;
  const doorX = wallX + Math.round(w / 2) - Math.floor(doorW / 2);
  const doorTop = groundY - 2 - doorH;
  drawDoor(buf, look.door, doorX, doorTop, doorW, doorH, wood, trim);
  const flowers = [hex('#f07a9a'), hex('#ffe07a')];
  // The ground-floor windows always keep their flower boxes.
  for (const [k, wx] of [[0, wallX + 5], [1, wallX + w - 12]] as const) {
    drawWindow(buf, look.window, wx, floorLine + 4, 7, 5, trim, lit, flowers[k]);
    if (look.window !== 3) {
      buf.hline(wx - 1, wx + 7, floorLine + 4 + 6, trim.dark);
      for (let xx = wx - 1; xx <= wx + 7; xx++) buf.set(xx, floorLine + 4 + 5, xx % 2 ? flowers[k] : hex('#5aa04a'));
    }
  }
  // Roof: tiled gable, a dormer with a round window, a chimney on the right.
  const roofBottom = wallTop + 1;
  const roofTop = roofBottom - roofH;
  const rx0 = wallX - eave;
  const rw = w + eave * 2;
  const roof = gable(width, height, rx0, rw, roofTop, roofBottom, Math.round(roofH * 0.7));
  const ridgeX = rx0 + rw / 2;
  const chimX = wallX + w - 12;
  chimney(buf, chimX, roofTop + 3, roofTop + 11, stoneR);
  paintRoof(buf, roof, roofR, ridgeX, roofTop, 'tile', seed);
  for (let x = rx0; x < rx0 + rw; x++) buf.set(x, roofBottom + 1, (x - rx0) % 3 ? trim.mid : trim.dark);
  // Dormer: a small gabled window box on the near slope.
  const dx = Math.round(ridgeX) - 5;
  const dTop = roofTop + 9;
  const dormer = gable(width, height, dx - 1, 12, dTop - 4, dTop + 1, 4);
  for (let y = dTop; y < dTop + 8; y++) for (let x = dx; x < dx + 10; x++) buf.set(x, y, wallPixel(3, isStone, wall, x, y, dx, dTop, 10));
  buf.strokeRect(dx, dTop, 10, 8, wall.outline);
  drawWindow(buf, 1, dx + 3, dTop + 2, 4, 4, trim, lit);
  buf.paintMaskWith(dormer, (x) => (x < dx + 5 ? roofR.light : roofR.mid));
  buf.paintMask(dormer.edge(), roofR.outline);
  // The porch: a deck across the front with a railing, a roof on posts, lanterns by the door, steps.
  const px0 = wallX - 2;
  const px1 = wallX + w + 1;
  const deckY = groundY + 1;
  buf.fillRect(px0, deckY, px1 - px0 + 1, 3, wood.mid);
  buf.hline(px0, px1, deckY, wood.light);
  buf.hline(px0, px1, deckY + 2, wood.dark);
  for (let x = px0; x <= px1; x += 3) buf.set(x, deckY + 1, wood.dark);
  const railY = groundY - 4;
  for (const [a, b] of [[px0, doorX - 3], [doorX + doorW + 2, px1]]) {
    buf.hline(a, b, railY, wood.light);
    for (let x = a; x <= b; x += 3) buf.vline(x, railY + 1, groundY, wood.dark);
  }
  const awning = floorLine - 1;
  for (let x = px0 - 1; x <= px1 + 1; x++) {
    buf.set(x, awning, roofR.dark);
    buf.set(x, awning + 1, (x - px0) % 2 ? roofR.mid : roofR.light);
  }
  buf.hline(px0 - 1, px1 + 1, awning + 2, roofR.outline);
  for (const x of [px0, px1, doorX - 3, doorX + doorW + 2]) buf.vline(x, awning + 3, groundY, wood.dark);
  for (const x of [doorX - 2, doorX + doorW + 1]) {
    buf.set(x, doorTop + 2, lit ? hex('#fff2b0') : hex('#ffd060'));
    buf.set(x, doorTop + 1, wood.outline);
  }
  // A climbing vine on the left corner.
  const vine = stream(seed, 'vine');
  for (let y = groundY - 2; y > wallTop + 3; y--) if (vine.chance(0.7)) buf.set(wallX + (y % 3 === 0 ? 1 : 0), y, y % 4 ? hex('#5aa04a') : hex('#3f7a3a'));
  underConstruction(buf, roof, wallTop, groundY, wallX - 2, wallX + w + 1, progress, wood);
  buf.validate();
  return { buffer: buf, anchorX: Math.round(width / 2), anchorY: groundY, chimney: progress >= 1 ? { x: chimX + 2, y: roofTop + 2 } : null };
}
