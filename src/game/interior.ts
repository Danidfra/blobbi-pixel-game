/**
 * THE HOUSE INTERIOR: a separate small scene behind the shelter's door, at the same pixel scale as the island, so the
 * Blobbi walks in it with the same movement, collision and navigation code. One interior per shelter, keyed by the
 * shelter's stable id (moving the shelter keeps its interior), saved in the world record.
 *
 * The room follows the house's LEVEL (M8, `RoomLayout`):
 *
 *   1 Cozy Shelter   one room                                    128 × 96   (exactly the M5 room)
 *   2 Cottage        a sleeping nook · the main room · a kitchen  192 × 112  (a half wall, a tiled corner)
 *   3 Dream Home     bedroom · study · kitchen above,            240 × 144  (a wall with three openings)
 *                    the living room below
 *
 *   back wall (wall items hang here, the windows let in the day)
 *   ┌────────┬──────────┬─────────┐
 *   │ room   │ room     │ room    │   partitions are walls with openings: the Blobbi walks room to room
 *   ├──  ────┴───  ─────┴───  ────┤
 *   │ living room                 │
 *   └────────────┐ door ┌─────────┘   walking into the door gap goes back outside
 *
 * Partitions are part of the room (collision and art), never furniture. Every room stays reachable from the door: a
 * placement that would cut one off is refused, and an upgrade moves furniture so that it never does
 * (`relocateFurniture`).
 */
import { hex, mix, type Color } from '../core/color';
import { ramp, type WorldPalette } from '../core/palette';
import { PixelBuffer } from '../core/pixel';
import { CollisionMap } from '../sim/collision';
import { BUILDINGS, type Building, type BuildingKind, type PlacementCheck } from './buildings';

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type RoomName = 'room' | 'bedroom' | 'living' | 'kitchen' | 'study';

export interface RoomLayout {
  level: 1 | 2 | 3;
  w: number;
  h: number;
  /** The back wall's face (rows 0 .. wallH - 1). */
  wallH: number;
  /** The door gap in the front wall. */
  door: { x0: number; x1: number };
  /** Windows on the back wall. */
  windows: readonly Rect[];
  /** Where the Blobbi appears when it comes in. */
  spawn: { x: number; y: number };
  /** The floor rectangle furniture stands on (inclusive). */
  floor: Rect;
  /** Kept free so the ways in, out and between rooms are never blocked (the door, every partition opening). */
  clear: readonly Rect[];
  /** Interior walls: blocked rectangles (inclusive). A horizontal one shows a wall face on its lower rows. */
  partitions: readonly (Rect & { face?: number })[];
  /** The rooms (for relocation, the cut-off check and the guide), each with a point that must stay reachable. */
  rooms: readonly { name: RoomName; label: string; rect: Rect; anchor: { x: number; y: number } }[];
  /** Tiled floor (the kitchen). */
  tiles: readonly Rect[];
  /** Back-wall stretches with a built-in counter (no wall items there). */
  counters: readonly { x0: number; x1: number }[];
  /** Wall items hang with their bottom on this row. */
  wallAnchorY: number;
}

export const SIDE = 6;
export const FRONT = 6;
export const WALL_H = 24;

const L1: RoomLayout = {
  level: 1,
  w: 128,
  h: 96,
  wallH: WALL_H,
  door: { x0: 57, x1: 70 },
  windows: [{ x0: 88, x1: 107, y0: 5, y1: 16 }],
  spawn: { x: 64, y: 96 - FRONT - 4 },
  floor: { x0: SIDE + 1, y0: WALL_H + 2, x1: 128 - SIDE - 2, y1: 96 - FRONT - 1 },
  clear: [{ x0: 57 - 3, y0: 96 - FRONT - 12, x1: 70 + 3, y1: 95 }],
  partitions: [],
  rooms: [
    { name: 'bedroom', label: 'sleeping corner', rect: { x0: 7, y0: 26, x1: 63, y1: 89 }, anchor: { x: 30, y: 60 } },
    { name: 'living', label: 'living corner', rect: { x0: 64, y0: 26, x1: 120, y1: 89 }, anchor: { x: 90, y: 60 } },
  ],
  tiles: [],
  counters: [],
  wallAnchorY: WALL_H - 4,
};

const L2: RoomLayout = {
  level: 2,
  w: 192,
  h: 112,
  wallH: WALL_H,
  door: { x0: 121, x1: 134 },
  windows: [
    { x0: 26, x1: 41, y0: 5, y1: 16 },
    { x0: 92, x1: 111, y0: 5, y1: 16 },
    { x0: 160, x1: 171, y0: 5, y1: 14 },
  ],
  spawn: { x: 128, y: 112 - FRONT - 4 },
  floor: { x0: SIDE + 1, y0: WALL_H + 2, x1: 192 - SIDE - 2, y1: 112 - FRONT - 1 },
  clear: [
    { x0: 121 - 3, y0: 112 - FRONT - 12, x1: 134 + 3, y1: 111 },
    // The nook's opening beside the half wall.
    { x0: 58, y0: 70, x1: 78, y1: 105 },
  ],
  partitions: [{ x0: 66, y0: WALL_H, x1: 69, y1: 70 }],
  rooms: [
    { name: 'bedroom', label: 'sleeping nook', rect: { x0: 7, y0: 26, x1: 65, y1: 105 }, anchor: { x: 34, y: 80 } },
    { name: 'living', label: 'main room', rect: { x0: 70, y0: 26, x1: 141, y1: 105 }, anchor: { x: 104, y: 80 } },
    { name: 'kitchen', label: 'kitchen', rect: { x0: 142, y0: 26, x1: 184, y1: 105 }, anchor: { x: 162, y: 80 } },
  ],
  tiles: [{ x0: 142, y0: WALL_H, x1: 185, y1: 66 }],
  counters: [{ x0: 174, x1: 185 }],
  wallAnchorY: WALL_H - 4,
};

/** The Dream Home's wall between the upper rooms and the living room: rows y0..y1, a face on its lower rows. */
const L3_WALL = { y0: 79, y1: 86 };
const L3_GAPS = [
  { x0: 36, x1: 53 },
  { x0: 112, x1: 129 },
  { x0: 186, x1: 203 },
];
const L3_PARTS = (() => {
  const out: (Rect & { face?: number })[] = [
    { x0: 86, y0: WALL_H, x1: 89, y1: L3_WALL.y0 - 1 },
    { x0: 154, y0: WALL_H, x1: 157, y1: L3_WALL.y0 - 1 },
  ];
  let x = SIDE;
  for (const g of L3_GAPS) {
    out.push({ x0: x, y0: L3_WALL.y0, x1: g.x0 - 1, y1: L3_WALL.y1, face: 6 });
    x = g.x1 + 1;
  }
  out.push({ x0: x, y0: L3_WALL.y0, x1: 240 - SIDE - 1, y1: L3_WALL.y1, face: 6 });
  return out;
})();

const L3: RoomLayout = {
  level: 3,
  w: 240,
  h: 144,
  wallH: WALL_H,
  door: { x0: 113, x1: 126 },
  windows: [
    { x0: 30, x1: 49, y0: 5, y1: 16 },
    { x0: 112, x1: 127, y0: 5, y1: 16 },
    { x0: 176, x1: 189, y0: 5, y1: 14 },
  ],
  spawn: { x: 120, y: 144 - FRONT - 4 },
  floor: { x0: SIDE + 1, y0: WALL_H + 2, x1: 240 - SIDE - 2, y1: 144 - FRONT - 1 },
  clear: [
    { x0: 113 - 3, y0: 144 - FRONT - 12, x1: 126 + 3, y1: 143 },
    ...L3_GAPS.map((g) => ({ x0: g.x0 - 3, y0: L3_WALL.y0 - 9, x1: g.x1 + 3, y1: L3_WALL.y1 + 9 })),
  ],
  partitions: L3_PARTS,
  rooms: [
    { name: 'bedroom', label: 'bedroom', rect: { x0: 7, y0: 26, x1: 85, y1: 78 }, anchor: { x: 44, y: 62 } },
    { name: 'study', label: 'study (any use)', rect: { x0: 90, y0: 26, x1: 153, y1: 78 }, anchor: { x: 120, y: 62 } },
    { name: 'kitchen', label: 'kitchen', rect: { x0: 158, y0: 26, x1: 232, y1: 78 }, anchor: { x: 194, y: 62 } },
    { name: 'living', label: 'living room', rect: { x0: 7, y0: 87, x1: 232, y1: 137 }, anchor: { x: 120, y: 112 } },
  ],
  tiles: [{ x0: 158, y0: WALL_H, x1: 233, y1: 78 }],
  counters: [{ x0: 210, x1: 233 }],
  wallAnchorY: WALL_H - 4,
};

export const LAYOUTS: Readonly<Record<1 | 2 | 3, RoomLayout>> = { 1: L1, 2: L2, 3: L3 };
export const layoutFor = (level: number | undefined): RoomLayout => LAYOUTS[(level === 2 || level === 3 ? level : 1) as 1 | 2 | 3];

// The level-1 room, by its M5 names (kept: tests, scripts and the cozy shelter use them).
export const ROOM_W = L1.w;
export const ROOM_H = L1.h;
export const DOOR = L1.door;
export const WINDOW = L1.windows[0];
export const SPAWN = L1.spawn;
export const FLOOR = L1.floor;
export const DOOR_CLEAR = L1.clear[0];
export const WALL_ANCHOR_Y = L1.wallAnchorY;

export interface InteriorStyle {
  /** Floor: 0 honey planks, 1 dark planks, 2 pale planks, then the unlockable ones (see `FLOOR_NAMES`). */
  floor: number;
  /** Wall colour: 0 warm, 1 cream, 2 sage, then the unlockable ones (see `WALL_NAMES`). */
  wall: number;
  /** Wall finish (M8): 0 logs, 1 plaster, 2 stripes, 3 flower paper, 4 wainscot. Absent: logs. */
  finish?: number;
}

export interface InteriorState {
  /** The shelter it belongs to (its building id). */
  shelterId: string;
  /** Furniture in ROOM coordinates. */
  furniture: Building[];
  style: InteriorStyle;
  /** The house level whose room this is (1: the first room). */
  level: number;
}

/** A new interior, furnished once with what came with the house: a bed, a table, a chest, a lantern, a rug. */
export function newInterior(shelterId: string, seed: string, level = 1): InteriorState {
  const f = (kind: BuildingKind, x: number, y: number, variant = 0): Building => ({ id: `${kind}:0`, kind, x, y, placedAt: 0, seed: `${seed}/${kind}/0`, ...(variant ? { variant } : {}) });
  const state: InteriorState = {
    shelterId,
    furniture: [f('bed', 22, 38), f('table', 98, 44), f('chest', 104, 31), f('wall-lantern', 40, WALL_ANCHOR_Y), f('rug', 64, 62, 1)],
    style: { floor: 0, wall: 0 },
    level: 1,
  };
  // A house first entered after an upgrade: the same starter furniture, arranged in its bigger rooms.
  if (level > 1) {
    const moved = relocateFurniture(state.furniture, L1, layoutFor(level), { footRx: 4, footRy: 2 });
    state.furniture = moved.placed;
    state.level = level;
  }
  return state;
}

export const isWallKind = (kind: BuildingKind): boolean => BUILDINGS[kind].layer === 'wall';

/** A furniture record's footprint in room pixels (wall items: their strip on the wall). */
export function roomRect(b: { kind: BuildingKind; x: number; y: number }, layout: RoomLayout = L1): Rect {
  const d = BUILDINGS[b.kind];
  if (isWallKind(b.kind)) return { x0: b.x - d.footRx, y0: 2, x1: b.x + d.footRx, y1: layout.wallH - 3 };
  return { x0: b.x - d.footRx, y0: b.y - d.footRy, x1: b.x + d.footRx, y1: b.y + d.footRy };
}

const overlap = (a: Rect, b: Rect, m = 0) => a.x0 - m <= b.x1 && a.x1 + m >= b.x0 && a.y0 - m <= b.y1 && a.y1 + m >= b.y0;

/** Back-wall columns where a vertical partition meets the wall (nothing hangs there). */
const partitionColumns = (layout: RoomLayout): Rect[] => layout.partitions.filter((p) => p.y0 <= layout.wallH).map((p) => ({ x0: p.x0, y0: 0, x1: p.x1, y1: layout.wallH }));

/**
 * Can a kind stand at (x, y) in the room? Indoors or both; inside the floor (wall items on the back wall, clear of
 * windows, counters and partitions); never on a partition or in the ways in, out and between rooms; solids never on
 * solids, floor pieces never on floor pieces, wall items never on each other; never on the Blobbi.
 */
export function checkInterior(kind: BuildingKind, x: number, y: number, furniture: readonly Building[], blobbi: { x: number; y: number; footRx: number; footRy: number }, ignore?: Building, layout: RoomLayout = L1): PlacementCheck {
  const def = BUILDINGS[kind];
  const rect = roomRect({ kind, x, y }, layout);
  const result = (problem: PlacementCheck['problem']): PlacementCheck => ({ ok: problem === null, problem, ...rect });
  if (def.where === 'outdoor' || def.kind === 'shelter') return result('ground');
  if (isWallKind(kind)) {
    if (rect.x0 < SIDE + 2 || rect.x1 > layout.w - SIDE - 3) return result('edge');
    for (const w of layout.windows) if (overlap(rect, { x0: w.x0 - 1, y0: w.y0, x1: w.x1 + 1, y1: w.y1 }, 0)) return result('blocked');
    for (const c of layout.counters) if (rect.x1 >= c.x0 - 1 && rect.x0 <= c.x1 + 1) return result('blocked');
    for (const p of partitionColumns(layout)) if (rect.x1 >= p.x0 - 1 && rect.x0 <= p.x1 + 1) return result('blocked');
    for (const f of furniture) if (f !== ignore && isWallKind(f.kind) && overlap(rect, roomRect(f, layout), 1)) return result('building');
    return result(null);
  }
  const fl = layout.floor;
  if (rect.x0 < fl.x0 || rect.y0 < fl.y0 || rect.x1 > fl.x1 || rect.y1 > fl.y1) return result('edge');
  for (const p of layout.partitions) if (overlap(rect, p, 1)) return result('edge');
  for (const c of layout.clear) if (overlap(rect, c)) return result('door');
  const floor = def.layer === 'floor';
  for (const f of furniture) {
    if (f === ignore || isWallKind(f.kind)) continue;
    const otherFloor = BUILDINGS[f.kind].layer === 'floor';
    if (floor !== otherFloor) continue; // a rug may lie under a table
    if (overlap(rect, roomRect(f, layout), floor ? 0 : 1)) return result('building');
  }
  if (!floor && blobbi.x + blobbi.footRx >= rect.x0 - 1 && blobbi.x - blobbi.footRx <= rect.x1 + 1 && blobbi.y + blobbi.footRy >= rect.y0 - 1 && blobbi.y - blobbi.footRy <= rect.y1 + 1) return result('blobbi');
  return result(null);
}

/** The room's collision: walls, partitions, the front wall but its door gap, solid furniture. `closeDoor` blocks the gap (for navigation). */
export function roomCollision(furniture: readonly Building[], closeDoor = false, layout: RoomLayout = L1): CollisionMap {
  const { w, h, floor: fl, door } = layout;
  const map = new CollisionMap(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inDoor = x >= door.x0 && x <= door.x1 && y > fl.y1;
      const wall = y < fl.y0 || x < fl.x0 || x > fl.x1 || (y > fl.y1 && (!inDoor || closeDoor));
      if (wall) map.blocked[y * w + x] = 1;
    }
  for (const p of layout.partitions) for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) map.blocked[y * w + x] = 1;
  for (const f of furniture) if (!isWallKind(f.kind) && BUILDINGS[f.kind].layer === 'solid') map.blockEllipse(f.x, f.y, BUILDINGS[f.kind].footRx, BUILDINGS[f.kind].footRy, true);
  return map;
}

/** Walking into the door gap leaves the house. */
export const atDoor = (x: number, y: number, layout: RoomLayout = L1): boolean => y >= layout.h - FRONT + 1 && x >= layout.door.x0 && x <= layout.door.x1;

/**
 * Can a Blobbi of this foot walk from the door to every room (and to the bed, if there is one)? A flood fill over
 * the room's collision with the door closed, on a 2-pixel grid.
 */
export function roomsReachable(furniture: readonly Building[], layout: RoomLayout, foot: { footRx: number; footRy: number }): boolean {
  const map = roomCollision(furniture, true, layout);
  const step = 2;
  const cols = Math.ceil(layout.w / step);
  const rows = Math.ceil(layout.h / step);
  const free = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows && map.canStand(c * step + 1, r * step + 1, foot.footRx, foot.footRy);
  const seen = new Uint8Array(cols * rows);
  const sc = Math.floor(layout.spawn.x / step);
  let sr = Math.floor((layout.spawn.y - 2) / step);
  while (sr > 0 && !free(sc, sr)) sr--;
  if (!free(sc, sr)) return false;
  const queue = [sr * cols + sc];
  seen[queue[0]] = 1;
  while (queue.length) {
    const k = queue.pop()!;
    const c = k % cols;
    const r = (k / cols) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (!free(nc, nr) || seen[nr * cols + nc]) continue;
      seen[nr * cols + nc] = 1;
      queue.push(nr * cols + nc);
    }
  }
  const reached = (x: number, y: number, slack = 8) => {
    for (let r = Math.floor((y - slack) / step); r <= Math.floor((y + slack) / step); r++) for (let c = Math.floor((x - slack) / step); c <= Math.floor((x + slack) / step); c++) if (c >= 0 && r >= 0 && c < cols && r < rows && seen[r * cols + c]) return true;
    return false;
  };
  // Every room has some reachable floor near its anchor (or anywhere inside it).
  for (const room of layout.rooms) {
    if (reached(room.anchor.x, room.anchor.y, 10)) continue;
    let any = false;
    for (let r = Math.floor(room.rect.y0 / step); r <= Math.floor(room.rect.y1 / step) && !any; r++) for (let c = Math.floor(room.rect.x0 / step); c <= Math.floor(room.rect.x1 / step) && !any; c++) if (seen[r * cols + c]) any = true;
    if (!any) return false;
  }
  const bed = furniture.find((f) => f.kind === 'bed');
  if (bed && !reached(bed.x, bed.y + BUILDINGS.bed.footRy + foot.footRy + 2, 6)) return false;
  return true;
}

/** The room a point is in (the first whose rectangle holds it), or null. */
export function roomAt(layout: RoomLayout, x: number, y: number): RoomLayout['rooms'][number] | null {
  return layout.rooms.find((r) => x >= r.rect.x0 && x <= r.rect.x1 && y >= r.rect.y0 && y <= r.rect.y1) ?? null;
}

/** Where a kind prefers to be after a move to a bigger house (beds to the bedroom, stoves to the kitchen). */
const PREFERRED_ROOM: Partial<Record<BuildingKind, RoomName>> = {
  bed: 'bedroom',
  'pet-bed': 'bedroom',
  'cooking-station': 'kitchen',
  cabinet: 'kitchen',
  'dining-table': 'kitchen',
  armchair: 'living',
  bookshelf: 'study',
  workbench: 'study',
};

export interface Relocation {
  /** Every piece that has a place in the new room, in the new room's coordinates (same ids, seeds, styles). */
  placed: Building[];
  /** Pieces with no room left in the new layout (the caller returns them to the bag, or refuses the move). */
  displaced: Building[];
  /** How many pieces had to move somewhere other than their mapped spot. */
  moved: number;
}

/**
 * Move a room's furniture into another layout, deterministically and without losing a piece. Each piece keeps its
 * id, seed and colourway. It is first mapped to the matching room of the new layout (its preferred room for beds,
 * stoves, bookshelves…, else the room it stood in, proportionally inside it); if that spot is taken, blocked, or
 * would cut a room off, the nearest free spot in that room is used, then anywhere; a piece that fits nowhere is
 * returned in `displaced`. `keepFirst` pieces (chests that hold things) are placed before all others.
 */
export function relocateFurniture(furniture: readonly Building[], from: RoomLayout, to: RoomLayout, foot: { footRx: number; footRy: number }, keepFirst: (b: Building) => boolean = () => false): Relocation {
  const order = [...furniture].sort((a, b) => Number(keepFirst(b)) - Number(keepFirst(a)) || layerRank(a) - layerRank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const placed: Building[] = [];
  const displaced: Building[] = [];
  let moved = 0;
  const nobody = { x: -100, y: -100, footRx: 0, footRy: 0 };
  const fits = (b: Building, x: number, y: number) => {
    if (!checkInterior(b.kind, x, y, placed, nobody, undefined, to).ok) return false;
    if (isWallKind(b.kind) || BUILDINGS[b.kind].layer !== 'solid') return true;
    return roomsReachable([...placed, { ...b, x, y }], to, foot);
  };
  for (const b of order) {
    const target = mapPoint(b, from, to);
    if (fits(b, target.x, target.y)) {
      placed.push({ ...b, x: target.x, y: target.y });
      continue;
    }
    const spot = nearestSpot(b, target, to, fits);
    if (spot) {
      moved++;
      placed.push({ ...b, x: spot.x, y: spot.y });
    } else displaced.push(b);
  }
  // Keep the original order of the list (the room's own order), for stable saves.
  const index = new Map(furniture.map((b, i) => [b.id, i]));
  placed.sort((a, b) => index.get(a.id)! - index.get(b.id)!);
  return { placed, displaced, moved };
}

const layerRank = (b: Building) => (isWallKind(b.kind) ? 2 : BUILDINGS[b.kind].layer === 'floor' ? 1 : 0);

/** A piece's spot in the new layout: the same place in the matching room, proportionally. */
function mapPoint(b: Building, from: RoomLayout, to: RoomLayout): { x: number; y: number } {
  if (isWallKind(b.kind)) {
    const k = (b.x - from.floor.x0) / Math.max(1, from.floor.x1 - from.floor.x0);
    return { x: Math.round(to.floor.x0 + k * (to.floor.x1 - to.floor.x0)), y: to.wallAnchorY };
  }
  const src = roomAt(from, b.x, b.y);
  const want = PREFERRED_ROOM[b.kind] ?? src?.name ?? 'living';
  const dst = to.rooms.find((r) => r.name === want) ?? to.rooms.find((r) => r.name === 'living') ?? to.rooms[0];
  const s = src?.rect ?? from.floor;
  const kx = (b.x - s.x0) / Math.max(1, s.x1 - s.x0);
  const ky = (b.y - s.y0) / Math.max(1, s.y1 - s.y0);
  return { x: Math.round(dst.rect.x0 + kx * (dst.rect.x1 - dst.rect.x0)), y: Math.round(dst.rect.y0 + ky * (dst.rect.y1 - dst.rect.y0)) };
}

/** The nearest spot where a piece fits: first inside the room of the target, then anywhere on the floor (or wall). */
function nearestSpot(b: Building, target: { x: number; y: number }, to: RoomLayout, fits: (b: Building, x: number, y: number) => boolean): { x: number; y: number } | null {
  const candidates: { x: number; y: number; d: number; inRoom: boolean }[] = [];
  const room = roomAt(to, target.x, target.y);
  if (isWallKind(b.kind)) {
    for (let x = SIDE + 2; x <= to.w - SIDE - 3; x += 2) candidates.push({ x, y: to.wallAnchorY, d: Math.abs(x - target.x), inRoom: true });
  } else {
    for (let y = to.floor.y0; y <= to.floor.y1; y += 2)
      for (let x = to.floor.x0; x <= to.floor.x1; x += 2) {
        const inRoom = !!room && x >= room.rect.x0 && x <= room.rect.x1 && y >= room.rect.y0 && y <= room.rect.y1;
        candidates.push({ x, y, d: Math.hypot(x - target.x, y - target.y), inRoom });
      }
  }
  candidates.sort((p, q) => Number(q.inRoom) - Number(p.inRoom) || p.d - q.d || p.y - q.y || p.x - q.x);
  for (const c of candidates) if (fits(b, c.x, c.y)) return { x: c.x, y: c.y };
  return null;
}

// ─── The room's look ─────────────────────────────────────────────────────────

/** Floor materials (the first three are the M5 planks). */
const FLOORS = [
  ramp(hex('#c08a50'), { step: 0.07, hueShift: 8 }),
  ramp(hex('#8a5a3a'), { step: 0.07, hueShift: 8 }),
  ramp(hex('#e0c48e'), { step: 0.06, hueShift: 8 }),
  ramp(hex('#b8b0a4'), { step: 0.06, hueShift: 4 }), // 3 flagstone
  ramp(hex('#d88a6a'), { step: 0.07, hueShift: 6 }), // 4 terracotta tile
  ramp(hex('#7aa0b8'), { step: 0.06, hueShift: 6 }), // 5 blue carpet
];
/** Wall colours (the first three are the M5 logs). */
const WALLS = [
  ramp(hex('#b4733f'), { step: 0.085, hueShift: 10 }),
  ramp(hex('#e8dcc0'), { step: 0.06, hueShift: 8 }),
  ramp(hex('#9ab88a'), { step: 0.07, hueShift: 6 }),
  ramp(hex('#e8b4b8'), { step: 0.06, hueShift: 6 }), // 3 rose
  ramp(hex('#a8c8e8'), { step: 0.06, hueShift: 6 }), // 4 sky
  ramp(hex('#c4b0e0'), { step: 0.06, hueShift: 6 }), // 5 lavender
];
export const FLOOR_NAMES = ['honey planks', 'dark planks', 'pale planks', 'flagstones', 'terracotta tiles', 'blue carpet'] as const;
export const WALL_NAMES = ['warm wood', 'cream', 'sage', 'rose', 'sky', 'lavender'] as const;
export const FINISH_NAMES = ['logs', 'plaster', 'stripes', 'flower paper', 'wainscot'] as const;
export const FLOOR_STYLES = FLOORS.length;
export const WALL_STYLES = WALLS.length;
export const FINISH_STYLES = FINISH_NAMES.length;

/** The floor's pattern at a pixel: planks (0–2), stones (3), tiles (4), carpet (5). */
function floorPixel(style: number, fl: ReturnType<typeof ramp>, x: number, y: number, wallH: number, sun: boolean): Color {
  const yy = y - wallH;
  if (style === 3) {
    const row = Math.floor(yy / 6);
    const seam = yy % 6 === 5 || (x + (row % 2) * 5) % 10 === 0;
    return seam ? fl.dark : sun ? fl.light : (x * 5 + row * 7) % 11 === 0 ? mix(fl.mid, fl.light, 0.4) : fl.mid;
  }
  if (style === 4) {
    const seam = yy % 6 === 5 || x % 6 === 5;
    return seam ? fl.dark : sun ? fl.light : (Math.floor(x / 6) + Math.floor(yy / 6)) % 2 ? fl.mid : mix(fl.mid, fl.light, 0.3);
  }
  if (style === 5) return sun ? fl.light : (x + yy * 3) % 7 === 0 ? mix(fl.mid, fl.dark, 0.3) : fl.mid;
  const row = Math.floor(yy / 4);
  const seam = yy % 4 === 3 || (x + row * 11) % 23 === 0;
  return seam ? fl.dark : sun ? fl.light : (x * 7 + row * 3) % 13 === 0 ? mix(fl.mid, fl.light, 0.4) : fl.mid;
}

/** The wall face's pattern at a pixel (row `y` from the top of the face, `x` across): logs, plaster, stripes, flowers, wainscot. */
function wallPixel(finish: number, wl: ReturnType<typeof ramp>, x: number, y: number, faceH: number, w: number): Color {
  const lit = x < w * 0.3;
  switch (finish) {
    case 1: // plaster: smooth, a little texture
      return (x * 7 + y * 13) % 29 === 0 ? mix(wl.mid, wl.dark, 0.25) : lit ? mix(wl.mid, wl.light, 0.35) : wl.mid;
    case 2: // stripes
      return x % 6 < 2 ? mix(wl.mid, wl.light, 0.5) : lit ? wl.mid : mix(wl.mid, wl.dark, 0.12);
    case 3: {
      // flower paper: small four-dot flowers on a light ground
      const fx = (x + (Math.floor(y / 6) % 2) * 4) % 8;
      const fy = y % 6;
      if ((fx === 3 && (fy === 1 || fy === 3)) || (fy === 2 && (fx === 2 || fx === 4))) return hex('#f07a9a');
      if (fx === 3 && fy === 2) return hex('#ffe07a');
      return mix(wl.mid, wl.light, 0.45);
    }
    case 4: // wainscot: panels below, plaster above
      if (y >= faceH * 0.55) return y === Math.ceil(faceH * 0.55) ? wl.light : x % 8 === 0 ? wl.dark : mix(wl.mid, wl.dark, 0.2);
      return mix(wl.mid, wl.light, 0.3);
    default: {
      const log = y % 4;
      return log === 3 ? wl.dark : log === 0 ? wl.light : lit ? wl.mid : mix(wl.mid, wl.dark, 0.25);
    }
  }
}

/**
 * The room itself (walls, windows, partitions, floor, door), drawn once per style and layout; furniture is drawn over
 * it. Level 1 with the M5 styles (logs) is pixel for pixel the M5 room.
 */
export function roomSprite(style: InteriorStyle, palette: WorldPalette, sky: number = hex('#9ad0f0'), layout: RoomLayout = L1): PixelBuffer {
  const { w, h, wallH } = layout;
  const fs = style.floor % FLOORS.length;
  const fl = FLOORS[fs];
  const wl = WALLS[style.wall % WALLS.length];
  const finish = (style.finish ?? 0) % FINISH_STYLES;
  const buf = new PixelBuffer(w, h);
  const sunny = (x: number, y: number) => layout.windows.some((win) => x >= win.x0 - 6 + (y - wallH) / 3 && x <= win.x1 + 6 + (y - wallH) / 3 && y < wallH + 34);
  // Floor: the chosen material; a pool of light under each window; the kitchen tiled.
  const tile = ramp(hex('#e4dccb'), { step: 0.06, hueShift: 4 });
  for (let y = wallH; y < h; y++)
    for (let x = 0; x < w; x++) {
      const tiled = layout.tiles.some((t) => x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1);
      if (tiled) {
        const seam = (y - wallH) % 6 === 5 || x % 6 === 5;
        buf.set(x, y, seam ? tile.dark : (Math.floor(x / 6) + Math.floor((y - wallH) / 6)) % 2 ? tile.mid : mix(tile.mid, hex('#a8c8b8'), 0.35));
      } else buf.set(x, y, floorPixel(fs, fl, x, y, wallH, sunny(x, y)));
    }
  // Back wall: the finish, lit from the left, a dark baseboard.
  for (let y = 0; y < wallH; y++) for (let x = 0; x < w; x++) buf.set(x, y, wallPixel(finish, wl, x, y, wallH, w));
  buf.hline(0, w - 1, wallH - 2, wl.outline);
  buf.hline(0, w - 1, wallH - 1, mix(fl.dark, wl.outline, 0.5));
  // Windows: sky, a cross frame, a sill.
  for (const win of layout.windows) {
    buf.fillRect(win.x0, win.y0, win.x1 - win.x0 + 1, win.y1 - win.y0 + 1, sky);
    buf.set(win.x0 + 2, win.y0 + 2, mix(sky, hex('#ffffff'), 0.6));
    buf.set(win.x0 + 3, win.y0 + 2, mix(sky, hex('#ffffff'), 0.6));
    buf.strokeRect(win.x0 - 1, win.y0 - 1, win.x1 - win.x0 + 3, win.y1 - win.y0 + 3, palette.wood.dark);
    buf.vline(Math.round((win.x0 + win.x1) / 2), win.y0, win.y1, palette.wood.mid);
    buf.hline(win.x0, win.x1, Math.round((win.y0 + win.y1) / 2), palette.wood.mid);
    buf.hline(win.x0 - 2, win.x1 + 2, win.y1 + 2, palette.wood.light);
  }
  // Kitchen counters: a worktop along the bottom of the wall, jars and a pot on it.
  for (const c of layout.counters) {
    buf.fillRect(c.x0, wallH - 9, c.x1 - c.x0 + 1, 7, palette.wood.mid);
    buf.hline(c.x0, c.x1, wallH - 9, palette.wood.light);
    buf.hline(c.x0, c.x1, wallH - 3, palette.wood.dark);
    for (let x = c.x0 + 2; x < c.x1 - 2; x += 5) buf.vline(x, wallH - 7, wallH - 4, palette.wood.dark);
    buf.fillRect(c.x0 + 2, wallH - 13, 3, 4, hex('#d8e8f0'));
    buf.fillRect(c.x0 + 6, wallH - 12, 3, 3, hex('#e8a060'));
    buf.fillRect(c.x1 - 6, wallH - 13, 4, 4, hex('#5a5a66'));
    buf.hline(c.x1 - 7, c.x1 - 1, wallH - 13, hex('#7a7a88'));
  }
  // Side walls: dark beams down the edges.
  for (const x0 of [0, w - SIDE])
    for (let y = 0; y < h; y++) for (let x = x0; x < x0 + SIDE; x++) buf.set(x, y, x === x0 + (x0 ? 0 : SIDE - 1) ? wl.outline : y < wallH ? wl.dark : mix(wl.dark, wl.outline, 0.3));
  // Partitions: a wall top seen from above; a horizontal one shows its face to the room below.
  for (const p of layout.partitions) {
    const face = p.face ?? 0;
    for (let y = p.y0; y <= p.y1; y++)
      for (let x = p.x0; x <= p.x1; x++) {
        const faceRow = y - (p.y1 - face + 1);
        if (face && faceRow >= 0) buf.set(x, y, faceRow === face - 1 ? wl.outline : wallPixel(finish, wl, x, faceRow + 4, face + 4, w));
        else buf.set(x, y, x === p.x0 || y === p.y0 ? wl.light : x === p.x1 ? wl.outline : wl.dark);
      }
    // A post where a partition opening ends, so openings read as doorways.
    if (face) {
      buf.vline(p.x0, p.y0, p.y1, palette.wood.dark);
      buf.vline(p.x1, p.y0, p.y1, palette.wood.dark);
    } else buf.hline(p.x0, p.x1, p.y1, wl.outline);
  }
  // Front wall: a low wall with the door gap; outside light shows through the gap, a mat in front of it.
  const { door } = layout;
  for (let y = h - FRONT; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x >= door.x0 && x <= door.x1) buf.set(x, y, y === h - FRONT ? palette.wood.dark : palette.grass.mid);
      else buf.set(x, y, (y - (h - FRONT)) % 3 === 0 ? wl.light : wl.mid);
    }
  buf.hline(0, w - 1, h - FRONT - 1, wl.outline);
  for (const x of [door.x0 - 1, door.x1 + 1]) buf.vline(x, h - FRONT - 1, h - 1, palette.wood.dark);
  buf.fillRect(door.x0 + 2, h - FRONT - 5, door.x1 - door.x0 - 3, 3, hex('#c06a4a'));
  buf.hline(door.x0 + 2, door.x1 - 2, h - FRONT - 5, hex('#e08a5a'));
  return buf;
}
