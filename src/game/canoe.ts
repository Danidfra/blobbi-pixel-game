/**
 * THE CANOE (M10 phase B): the first boat. Pure rules, no drawing:
 *
 *   - where it may float: open water (SHALLOW, WATER, DEEP, or the open sea beyond the world's edge), never over
 *     land, the Carrier's body, or where its moving parts (flippers, wings, flukes) sweep — so it can never clip
 *     through the animal;
 *   - how far it may go: a bounded region round the Carrier (`seaRegion`). The sea beyond is drawn forever, but the
 *     gameplay world is this rectangle; in its outer band a current turns the canoe back, and the band is drawn as
 *     rough water, so the limit is visible and never an invisible wall;
 *   - how it moves: gentle acceleration toward the stick or keys, drag when let go, speed a little under walking.
 *
 * The state (where it is moored or paddling, which way it points, whether the Blobbi is aboard) is saved with the
 * world; everything else is derived.
 */
import { T, type WorldDescription } from '../world/types';

export type Heading = 'left' | 'right' | 'up' | 'down';

export interface BoatState {
  /** World position of the hull's centre (floats while paddling; whole when moored). */
  x: number;
  y: number;
  heading: Heading;
  /** Velocity (world px / s); not saved. */
  vx: number;
  vy: number;
  aboard: boolean;
}

export const CANOE = {
  /** Top speed (world px / s): a little under the Blobbi's walk (42). */
  speed: 30,
  /** Acceleration toward the wanted velocity, and drag when no direction is held (per second). */
  accel: 2.4,
  drag: 1.6,
  /** The hull's half length and half beam (world px), along its heading. */
  halfLength: 8,
  halfBeam: 3,
  /** The sea round the Carrier's island picture the canoe may roam, and the band where the current turns it back. */
  margin: 150,
  band: 36,
  /** How far the Blobbi reaches to step aboard or ashore (world px). */
  reach: 22,
};

export interface SeaRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const WATER = (c: number) => c === T.SHALLOW || c === T.WATER || c === T.DEEP || c === T.FOAM;

/**
 * The navigable region: the Carrier with everything it carries (`subject`, the non-water bounding box) and
 * `CANOE.margin` of sea round it, which may reach past the world's edge into the open sea.
 */
export function seaRegion(subject: { x0: number; y0: number; x1: number; y1: number }): SeaRegion {
  const m = CANOE.margin;
  return { x0: subject.x0 - m, y0: subject.y0 - m, x1: subject.x1 + m, y1: subject.y1 + m };
}

export class SeaNav {
  constructor(
    readonly world: WorldDescription,
    readonly region: SeaRegion,
    /** Pixels the Carrier's moving parts may cover (`movingPartsMask`): never water for a boat. */
    readonly moving: Uint8Array,
  ) {}

  /** Water a hull pixel may lie on. */
  water(x: number, y: number): boolean {
    const { width, height, cls } = this.world.terrain;
    if (x < this.region.x0 || y < this.region.y0 || x >= this.region.x1 || y >= this.region.y1) return false;
    if (x < 0 || y < 0 || x >= width || y >= height) return true; // the open sea
    const i = y * width + x;
    return WATER(cls[i]) && !this.moving[i];
  }

  /** Whether the hull fits at (x, y) pointing `heading` (its outline sampled every pixel). */
  canFloat(x: number, y: number, heading: Heading): boolean {
    const along = heading === 'left' || heading === 'right';
    const hx = along ? CANOE.halfLength : CANOE.halfBeam;
    const hy = along ? CANOE.halfBeam : CANOE.halfLength;
    const cx = Math.round(x);
    const cy = Math.round(y);
    for (let dy = -hy; dy <= hy; dy++)
      for (let dx = -hx; dx <= hx; dx++) {
        // An ellipse, checked on its rim and centre line (the inside follows).
        const r = (dx / (hx + 0.5)) ** 2 + (dy / (hy + 0.5)) ** 2;
        if (r > 1) continue;
        if (!this.water(cx + dx, cy + dy)) return false;
      }
    return true;
  }

  /** How far into the outer band a point is, 0 (inside) .. 1 (at the edge). */
  edge(x: number, y: number): number {
    const r = this.region;
    const d = Math.min(x - r.x0, y - r.y0, r.x1 - x, r.y1 - y);
    return Math.max(0, Math.min(1, 1 - d / CANOE.band));
  }
}

export interface PaddleInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/**
 * One fixed step of paddling. Velocity eases toward the held direction (or drifts to rest); the move is taken per
 * axis so the canoe slides along a coast instead of sticking; the current pushes back in the outer band. Returns
 * whether it bumped something this step and how deep in the band it is.
 */
export function stepBoat(boat: BoatState, input: PaddleInput, dt: number, nav: SeaNav): { bumped: boolean; edge: number } {
  const ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(ix, iy) || 1;
  const held = ix !== 0 || iy !== 0;
  const wx = held ? (ix / len) * CANOE.speed : 0;
  const wy = held ? (iy / len) * CANOE.speed : 0;
  const k = 1 - Math.exp(-(held ? CANOE.accel : CANOE.drag) * dt);
  boat.vx += (wx - boat.vx) * k;
  boat.vy += (wy - boat.vy) * k;
  if (Math.abs(boat.vx) < 0.05) boat.vx = 0;
  if (Math.abs(boat.vy) < 0.05) boat.vy = 0;
  // The current near the limit: a push back toward the Carrier, stronger the deeper in the band.
  const edge = nav.edge(boat.x, boat.y);
  if (edge > 0) {
    const r = nav.region;
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    const d = Math.hypot(cx - boat.x, cy - boat.y) || 1;
    boat.vx += ((cx - boat.x) / d) * CANOE.speed * 1.6 * edge * dt * 3;
    boat.vy += ((cy - boat.y) / d) * CANOE.speed * 1.6 * edge * dt * 3;
  }
  // The heading follows the stronger component of the paddling (the canoe turns, it does not slide sideways).
  if (held) boat.heading = Math.abs(ix) >= Math.abs(iy) ? (ix > 0 ? 'right' : 'left') : iy > 0 ? 'down' : 'up';
  let bumped = false;
  // Turning in place must fit too; if it does not, keep the old heading.
  const nx = boat.x + boat.vx * dt;
  if (nav.canFloat(nx, boat.y, boat.heading)) boat.x = nx;
  else {
    boat.vx = 0;
    bumped = true;
  }
  const ny = boat.y + boat.vy * dt;
  if (nav.canFloat(boat.x, ny, boat.heading)) boat.y = ny;
  else {
    boat.vy = 0;
    bumped = true;
  }
  return { bumped, edge };
}
