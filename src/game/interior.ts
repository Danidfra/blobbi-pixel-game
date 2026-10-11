/**
 * THE HOUSE INTERIOR: a separate small scene behind the shelter's door. A cozy room of log walls, a window and a
 * plank floor, with the same pixel scale as the island, so the Blobbi walks in it with the same movement,
 * collision and navigation code. One interior per shelter, keyed by the shelter's stable id (moving the shelter
 * keeps its interior), saved in the world record.
 *
 *   back wall (wall items hang here, the window lets in the day)
 *   ┌──────────────────────────────┐
 *   │ floor: furniture, rugs        │
 *   └────────────┐ door ┌──────────┘   walking into the door gap goes back outside
 */
import { hex, mix } from '../core/color';
import { ramp, type WorldPalette } from '../core/palette';
import { PixelBuffer } from '../core/pixel';
import { CollisionMap } from '../sim/collision';
import { BUILDINGS, type Building, type BuildingKind, type PlacementCheck } from './buildings';

export const ROOM_W = 128;
export const ROOM_H = 96;
/** The back wall's face (rows 0 .. WALL_H - 1); wall items hang on it. */
export const WALL_H = 24;
/** Side and front wall thickness. */
export const SIDE = 6;
export const FRONT = 6;
/** The door gap in the front wall. */
export const DOOR = { x0: 57, x1: 70 } as const;
/** The window on the back wall. */
export const WINDOW = { x0: 88, x1: 107, y0: 5, y1: 16 } as const;
/** Where the Blobbi appears when it comes in, facing into the room. */
export const SPAWN = { x: 64, y: ROOM_H - FRONT - 4 } as const;
/** The floor rectangle furniture stands on (inclusive). */
export const FLOOR = { x0: SIDE + 1, y0: WALL_H + 2, x1: ROOM_W - SIDE - 2, y1: ROOM_H - FRONT - 1 } as const;
/** Kept free in front of the door so the way in and out is never blocked. */
export const DOOR_CLEAR = { x0: DOOR.x0 - 3, y0: ROOM_H - FRONT - 12, x1: DOOR.x1 + 3, y1: ROOM_H - 1 } as const;
/** Wall items hang with their bottom on this row. */
export const WALL_ANCHOR_Y = WALL_H - 4;

export interface InteriorStyle {
  /** Floor planks: 0 honey, 1 dark, 2 pale. */
  floor: number;
  /** Wall logs: 0 warm, 1 painted cream, 2 sage. */
  wall: number;
}

export interface InteriorState {
  /** The shelter it belongs to (its building id). */
  shelterId: string;
  /** Furniture in ROOM coordinates. */
  furniture: Building[];
  style: InteriorStyle;
  /** House level, for future upgrades (1: the first room). */
  level: number;
}

/** A new interior, furnished once with what came with the house: a bed, a table, a chest, a lantern, a rug. */
export function newInterior(shelterId: string, seed: string): InteriorState {
  const f = (kind: BuildingKind, x: number, y: number, variant = 0): Building => ({ id: `${kind}:0`, kind, x, y, placedAt: 0, seed: `${seed}/${kind}/0`, ...(variant ? { variant } : {}) });
  return {
    shelterId,
    furniture: [f('bed', 22, 38), f('table', 98, 44), f('chest', 104, 31), f('wall-lantern', 40, WALL_ANCHOR_Y), f('rug', 64, 62, 1)],
    style: { floor: 0, wall: 0 },
    level: 1,
  };
}

export const isWallKind = (kind: BuildingKind): boolean => BUILDINGS[kind].layer === 'wall';

/** A furniture record's footprint in room pixels (wall items: their strip on the wall). */
export function roomRect(b: { kind: BuildingKind; x: number; y: number }): { x0: number; y0: number; x1: number; y1: number } {
  const d = BUILDINGS[b.kind];
  if (isWallKind(b.kind)) return { x0: b.x - d.footRx, y0: 2, x1: b.x + d.footRx, y1: WALL_H - 3 };
  return { x0: b.x - d.footRx, y0: b.y - d.footRy, x1: b.x + d.footRx, y1: b.y + d.footRy };
}

const overlap = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }, m = 0) => a.x0 - m <= b.x1 && a.x1 + m >= b.x0 && a.y0 - m <= b.y1 && a.y1 + m >= b.y0;

/**
 * Can a kind stand at (x, y) in the room? Indoors or both; inside the floor (wall items on the wall, clear of the
 * window); never in front of the door; solids never on solids, floor pieces never on floor pieces, wall items
 * never on each other; never on the Blobbi.
 */
export function checkInterior(kind: BuildingKind, x: number, y: number, furniture: readonly Building[], blobbi: { x: number; y: number; footRx: number; footRy: number }, ignore?: Building): PlacementCheck {
  const def = BUILDINGS[kind];
  const rect = roomRect({ kind, x, y });
  const result = (problem: PlacementCheck['problem']): PlacementCheck => ({ ok: problem === null, problem, ...rect });
  if (def.where === 'outdoor' || def.kind === 'shelter') return result('ground');
  if (isWallKind(kind)) {
    if (rect.x0 < SIDE + 2 || rect.x1 > ROOM_W - SIDE - 3) return result('edge');
    if (overlap(rect, { x0: WINDOW.x0 - 1, y0: WINDOW.y0, x1: WINDOW.x1 + 1, y1: WINDOW.y1 }, 0)) return result('blocked');
    for (const f of furniture) if (f !== ignore && isWallKind(f.kind) && overlap(rect, roomRect(f), 1)) return result('building');
    return result(null);
  }
  if (rect.x0 < FLOOR.x0 || rect.y0 < FLOOR.y0 || rect.x1 > FLOOR.x1 || rect.y1 > FLOOR.y1) return result('edge');
  if (overlap(rect, DOOR_CLEAR)) return result('door');
  const floor = def.layer === 'floor';
  for (const f of furniture) {
    if (f === ignore || isWallKind(f.kind)) continue;
    const otherFloor = BUILDINGS[f.kind].layer === 'floor';
    if (floor !== otherFloor) continue; // a rug may lie under a table
    if (overlap(rect, roomRect(f), floor ? 0 : 1)) return result('building');
  }
  if (!floor && blobbi.x + blobbi.footRx >= rect.x0 - 1 && blobbi.x - blobbi.footRx <= rect.x1 + 1 && blobbi.y + blobbi.footRy >= rect.y0 - 1 && blobbi.y - blobbi.footRy <= rect.y1 + 1) return result('blobbi');
  return result(null);
}

/** The room's collision: walls, the front wall but its door gap, solid furniture. `closeDoor` blocks the gap (for navigation). */
export function roomCollision(furniture: readonly Building[], closeDoor = false): CollisionMap {
  const map = new CollisionMap(ROOM_W, ROOM_H);
  for (let y = 0; y < ROOM_H; y++)
    for (let x = 0; x < ROOM_W; x++) {
      const inDoor = x >= DOOR.x0 && x <= DOOR.x1 && y > FLOOR.y1;
      const wall = y < FLOOR.y0 || x < FLOOR.x0 || x > FLOOR.x1 || (y > FLOOR.y1 && (!inDoor || closeDoor));
      if (wall) map.blocked[y * ROOM_W + x] = 1;
    }
  for (const f of furniture) if (!isWallKind(f.kind) && BUILDINGS[f.kind].layer === 'solid') map.blockEllipse(f.x, f.y, BUILDINGS[f.kind].footRx, BUILDINGS[f.kind].footRy, true);
  return map;
}

/** Walking into the door gap leaves the house. */
export const atDoor = (x: number, y: number): boolean => y >= ROOM_H - FRONT + 1 && x >= DOOR.x0 && x <= DOOR.x1;

const FLOORS = [ramp(hex('#c08a50'), { step: 0.07, hueShift: 8 }), ramp(hex('#8a5a3a'), { step: 0.07, hueShift: 8 }), ramp(hex('#e0c48e'), { step: 0.06, hueShift: 8 })];
const WALLS = [ramp(hex('#b4733f'), { step: 0.085, hueShift: 10 }), ramp(hex('#e8dcc0'), { step: 0.06, hueShift: 8 }), ramp(hex('#9ab88a'), { step: 0.07, hueShift: 6 })];
export const FLOOR_STYLES = FLOORS.length;
export const WALL_STYLES = WALLS.length;

/** The room itself (walls, window, floor, door), drawn once per style; furniture is drawn over it. */
export function roomSprite(style: InteriorStyle, palette: WorldPalette, sky: number = hex('#9ad0f0')): PixelBuffer {
  const fl = FLOORS[style.floor % FLOORS.length];
  const wl = WALLS[style.wall % WALLS.length];
  const buf = new PixelBuffer(ROOM_W, ROOM_H);
  // Floor: planks four pixels wide, staggered seams; a pool of light under the window.
  for (let y = WALL_H; y < ROOM_H; y++)
    for (let x = 0; x < ROOM_W; x++) {
      const row = Math.floor((y - WALL_H) / 4);
      const seam = (y - WALL_H) % 4 === 3 || (x + row * 11) % 23 === 0;
      const sun = x >= WINDOW.x0 - 6 + (y - WALL_H) / 3 && x <= WINDOW.x1 + 6 + (y - WALL_H) / 3 && y < WALL_H + 34;
      buf.set(x, y, seam ? fl.dark : sun ? fl.light : (x * 7 + row * 3) % 13 === 0 ? mix(fl.mid, fl.light, 0.4) : fl.mid);
    }
  // Back wall: horizontal logs lit from the left, a dark baseboard.
  for (let y = 0; y < WALL_H; y++)
    for (let x = 0; x < ROOM_W; x++) {
      const log = y % 4;
      buf.set(x, y, log === 3 ? wl.dark : log === 0 ? wl.light : x < ROOM_W * 0.3 ? wl.mid : mix(wl.mid, wl.dark, 0.25));
    }
  buf.hline(0, ROOM_W - 1, WALL_H - 2, wl.outline);
  buf.hline(0, ROOM_W - 1, WALL_H - 1, mix(fl.dark, wl.outline, 0.5));
  // Window: sky, a cross frame, a sill.
  buf.fillRect(WINDOW.x0, WINDOW.y0, WINDOW.x1 - WINDOW.x0 + 1, WINDOW.y1 - WINDOW.y0 + 1, sky);
  buf.set(WINDOW.x0 + 2, WINDOW.y0 + 2, mix(sky, hex('#ffffff'), 0.6));
  buf.set(WINDOW.x0 + 3, WINDOW.y0 + 2, mix(sky, hex('#ffffff'), 0.6));
  buf.strokeRect(WINDOW.x0 - 1, WINDOW.y0 - 1, WINDOW.x1 - WINDOW.x0 + 3, WINDOW.y1 - WINDOW.y0 + 3, palette.wood.dark);
  buf.vline(Math.round((WINDOW.x0 + WINDOW.x1) / 2), WINDOW.y0, WINDOW.y1, palette.wood.mid);
  buf.hline(WINDOW.x0, WINDOW.x1, Math.round((WINDOW.y0 + WINDOW.y1) / 2), palette.wood.mid);
  buf.hline(WINDOW.x0 - 2, WINDOW.x1 + 2, WINDOW.y1 + 2, palette.wood.light);
  // Side walls: dark beams down the edges.
  for (const x0 of [0, ROOM_W - SIDE])
    for (let y = 0; y < ROOM_H; y++) for (let x = x0; x < x0 + SIDE; x++) buf.set(x, y, x === x0 + (x0 ? 0 : SIDE - 1) ? wl.outline : y < WALL_H ? wl.dark : mix(wl.dark, wl.outline, 0.3));
  // Front wall: a low log wall with the door gap; outside light shows through the gap, a mat in front of it.
  for (let y = ROOM_H - FRONT; y < ROOM_H; y++)
    for (let x = 0; x < ROOM_W; x++) {
      if (x >= DOOR.x0 && x <= DOOR.x1) buf.set(x, y, y === ROOM_H - FRONT ? palette.wood.dark : palette.grass.mid);
      else buf.set(x, y, (y - (ROOM_H - FRONT)) % 3 === 0 ? wl.light : wl.mid);
    }
  buf.hline(0, ROOM_W - 1, ROOM_H - FRONT - 1, wl.outline);
  for (const x of [DOOR.x0 - 1, DOOR.x1 + 1]) buf.vline(x, ROOM_H - FRONT - 1, ROOM_H - 1, palette.wood.dark);
  buf.fillRect(DOOR.x0 + 2, ROOM_H - FRONT - 5, DOOR.x1 - DOOR.x0 - 3, 3, hex('#c06a4a'));
  buf.hline(DOOR.x0 + 2, DOOR.x1 - 2, ROOM_H - FRONT - 5, hex('#e08a5a'));
  return buf;
}
