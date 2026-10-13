/**
 * THE CANOE (M10 phase B): the first boat. Pure rules, no drawing:
 *
 *   - where it may float: open water (SHALLOW, WATER, DEEP, or the open sea beyond the world's edge), never over
 *     land, the Carrier's body, or where its moving parts (flippers, wings, flukes) sweep — so it can never clip
 *     through the animal;
 *   - how far it may go: a bounded region round the Carrier (`seaRegion`). The sea beyond is drawn forever, but the
 *     gameplay world is this region; in its outer band (rounded and breathing, M10 phase C) a current turns the canoe
 *     back, and the band is drawn as rough water, so the limit is visible and never an invisible wall;
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
  halfLength: 13,
  halfBeam: 5,
  /** The sea round the Carrier's island picture the canoe may roam, and the band where the current turns it back. */
  margin: 150,
  band: 36,
  /**
   * M10 phase C (KI-51): the band follows a rounded outline (this corner radius) whose line breathes in and out by
   * up to `wobble` pixels, so the edge of the sea is never a straight rectangle.
   */
  corner: 120,
  wobble: 13,
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

  /** Phases of the outline's breathing, from the world's seed (deterministic; made on first use). */
  private phasesCache: [number, number, number] | null = null;
  private get phases(): [number, number, number] {
    if (!this.phasesCache) {
      let h = 2166136261;
      for (let i = 0; i < this.world.seed.length; i++) h = Math.imul(h ^ this.world.seed.charCodeAt(i), 16777619);
      this.phasesCache = [((h >>> 0) % 628) / 100, ((h >>> 10) % 628) / 100, ((h >>> 20) % 628) / 100];
    }
    return this.phasesCache;
  }

  /** Beyond the outline, how far the rough water holds, then fades back to calm (drawing only; M10 phase C). */
  static readonly ROUGH_HOLD = 12;
  static readonly ROUGH_FADE = 28;
  /** How far beyond the region the rough ring can reach (hold, fade and the outline's wobble). */
  static readonly ROUGH_OUT = SeaNav.ROUGH_HOLD + SeaNav.ROUGH_FADE + CANOE.wobble;

  /** The rough ring's strength per row (0..255) over the region grown by `ROUGH_OUT`, made the first time a row is drawn. */
  private roughRows: (Uint8Array | null)[] | null = null;

  /**
   * How rough the water looks at (x, y), 0..1, for drawing: it rises through the band (`edge`), holds just past the
   * region's rounded, breathing outline, then fades back to calm open sea — a ring with no straight edge, inner or
   * outer. Rows are made on first use (the field is fixed for a world) and read every frame. Returns the strength as
   * 0..255.
   */
  roughness255(x: number, y: number): number {
    const row = this.roughRow(y);
    const i = x - (this.region.x0 - SeaNav.ROUGH_OUT);
    return row && i >= 0 && i < row.length ? row[i] : 0;
  }

  /** One row of the rough ring (index 0 is x = region.x0 − `ROUGH_OUT`), or null beyond the ring's rows. */
  roughRow(y: number): Uint8Array | null {
    const r = this.region;
    const out = SeaNav.ROUGH_OUT;
    const x0 = r.x0 - out;
    const y0 = r.y0 - out;
    const h = r.y1 - r.y0 + 2 * out;
    if (y < y0 || y >= y0 + h) return null;
    const rows = (this.roughRows ??= new Array(h).fill(null));
    let row = rows[y - y0];
    if (!row) {
      row = new Uint8Array(r.x1 - r.x0 + 2 * out);
      for (let i = 0; i < row.length; i++) row[i] = Math.round(this.roughAt(x0 + i, y) * 255);
      rows[y - y0] = row;
    }
    return row;
  }

  /** The rough ring's strength at (x, y), computed (see `roughness255`). */
  private roughAt(x: number, y: number): number {
    const d = this.outlineDistance(x, y);
    if (d >= CANOE.band) return 0;
    if (d >= 0) return 1 - d / CANOE.band;
    if (d >= -SeaNav.ROUGH_HOLD) return 1;
    return Math.max(0, 1 - (-d - SeaNav.ROUGH_HOLD) / SeaNav.ROUGH_FADE);
  }

  /**
   * Signed distance (px) from (x, y) to the sea's breathing outline: positive inside the region, negative beyond. The
   * outline is the region's rectangle with rounded corners, moved in and out by a slow deterministic wobble.
   */
  private outlineDistance(x: number, y: number): number {
    const r = this.region;
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    const R = Math.min(CANOE.corner, (r.x1 - r.x0) / 2, (r.y1 - r.y0) / 2);
    const qx = Math.abs(x - cx) - ((r.x1 - r.x0) / 2 - R);
    const qy = Math.abs(y - cy) - ((r.y1 - r.y0) / 2 - R);
    const inside = R - Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - Math.min(Math.max(qx, qy), 0);
    if (inside > CANOE.band + CANOE.wobble) return inside;
    const a = Math.atan2(y - cy, x - cx);
    const [p1, p2, p3] = this.phases;
    return inside + CANOE.wobble * (0.55 * Math.sin(3 * a + p1) + 0.3 * Math.sin(7 * a + p2) + 0.15 * Math.sin(13 * a + p3));
  }

  /**
   * How far into the outer band a point is, 0 (inside) .. 1 (at the edge). The band follows the region's outline with
   * rounded corners and a slow deterministic wobble (M10 phase C): never a straight rectangle. Beyond the region
   * the canoe cannot float at all (`water`), so the wobble only moves where the current starts.
   */
  edge(x: number, y: number): number {
    return Math.max(0, Math.min(1, 1 - this.outlineDistance(x, y) / CANOE.band));
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
  // Turning in place must fit too; where it does not (a narrow channel), the canoe keeps its heading.
  if (held) {
    const want: Heading = Math.abs(ix) >= Math.abs(iy) ? (ix > 0 ? 'right' : 'left') : iy > 0 ? 'down' : 'up';
    if (want !== boat.heading && nav.canFloat(boat.x, boat.y, want)) boat.heading = want;
  }
  let bumped = false;
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
