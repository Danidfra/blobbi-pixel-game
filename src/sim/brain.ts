/**
 * THE BRAIN: autonomous behaviour for a Blobbi. Lightweight and
 * deterministic: a nav grid over the collision map, A* with string pulling,
 * and a four-state machine (idle, wander, inspect, rest) whose choices come
 * from a keyed stream. The brain never moves the character itself: it
 * produces a movement intent each step, and the live world feeds that
 * through the same collision and animation as the keyboard does.
 */
import { stream, type Rng } from '../core/rng';
import type { CollisionMap } from './collision';
import type { Placement } from '../world/types';

export const NAV_CELL = 4;

/** A coarse walkability grid: a cell is free when a foot ellipse can stand at its centre. */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly free: Uint8Array;
  constructor(
    readonly collision: CollisionMap,
    readonly footRx: number,
    readonly footRy: number,
  ) {
    this.cols = Math.ceil(collision.width / NAV_CELL);
    this.rows = Math.ceil(collision.height / NAV_CELL);
    this.free = new Uint8Array(this.cols * this.rows);
    this.rebuild();
  }
  rebuild(x0 = 0, y0 = 0, x1 = this.collision.width, y1 = this.collision.height): void {
    const c0 = Math.max(0, Math.floor(x0 / NAV_CELL));
    const r0 = Math.max(0, Math.floor(y0 / NAV_CELL));
    const c1 = Math.min(this.cols - 1, Math.ceil(x1 / NAV_CELL));
    const r1 = Math.min(this.rows - 1, Math.ceil(y1 / NAV_CELL));
    // Conservative: a cell is free when a slightly larger foot fits at its centre, so straight lines between
    // adjacent free centres stay clear of obstacles.
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.free[r * this.cols + c] = this.collision.canStand(c * NAV_CELL + NAV_CELL / 2, r * NAV_CELL + NAV_CELL / 2, this.footRx + 1, this.footRy + 1) ? 1 : 0;
  }
  isFree(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.free[r * this.cols + c] === 1;
  }
  cellOf(x: number, y: number): { c: number; r: number } {
    return { c: Math.floor(x / NAV_CELL), r: Math.floor(y / NAV_CELL) };
  }
  centre(c: number, r: number): { x: number; y: number } {
    return { x: c * NAV_CELL + NAV_CELL / 2, y: r * NAV_CELL + NAV_CELL / 2 };
  }
  /** The nearest free cell to a point, within `maxCells` rings. */
  nearestFree(x: number, y: number, maxCells = 6): { c: number; r: number } | null {
    const { c, r } = this.cellOf(x, y);
    if (this.isFree(c, r)) return { c, r };
    for (let ring = 1; ring <= maxCells; ring++)
      for (let dr = -ring; dr <= ring; dr++)
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          if (this.isFree(c + dc, r + dr)) return { c: c + dc, r: r + dr };
        }
    return null;
  }
  /** Count of free cells (for tests). */
  freeCount(): number {
    let n = 0;
    for (const v of this.free) n += v;
    return n;
  }
}

/** A* over the grid, 8-connected with no corner cutting; returns cell centres from start to goal, or null. */
export function findPath(grid: NavGrid, from: { x: number; y: number }, to: { x: number; y: number }, maxExpansions = 6000): { x: number; y: number }[] | null {
  const s = grid.nearestFree(from.x, from.y, 3);
  const g = grid.nearestFree(to.x, to.y, 3);
  if (!s || !g) return null;
  const { cols, rows } = grid;
  const key = (c: number, r: number) => r * cols + c;
  const goalK = key(g.c, g.r);
  const gScore = new Float32Array(cols * rows).fill(Infinity);
  const came = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  const h = (c: number, r: number) => Math.hypot(c - g.c, r - g.r);
  // A small binary heap keyed by f.
  const heap: { k: number; f: number }[] = [];
  const push = (k: number, f: number) => {
    heap.push({ k, f });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const startK = key(s.c, s.r);
  gScore[startK] = 0;
  push(startK, h(s.c, s.r));
  let expansions = 0;
  while (heap.length && expansions < maxExpansions) {
    const { k } = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    expansions++;
    if (k === goalK) break;
    const c = k % cols;
    const r = (k / cols) | 0;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (!grid.isFree(nc, nr)) continue;
        if (dc && dr && (!grid.isFree(c + dc, r) || !grid.isFree(c, r + dr))) continue; // no corner cutting
        const nk = key(nc, nr);
        if (closed[nk]) continue;
        const cost = gScore[k] + (dc && dr ? 1.4142 : 1);
        if (cost < gScore[nk]) {
          gScore[nk] = cost;
          came[nk] = k;
          push(nk, cost + h(nc, nr));
        }
      }
  }
  if (came[goalK] < 0 && goalK !== startK) return null;
  const cells: number[] = [];
  for (let k = goalK; k >= 0; k = came[k]) {
    cells.push(k);
    if (k === startK) break;
  }
  cells.reverse();
  const pts = cells.map((k) => grid.centre(k % cols, (k / cols) | 0));
  return stringPull(grid, pts);
}

/** Drop waypoints that a straight walkable line can skip. */
function stringPull(grid: NavGrid, pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineFree(grid, pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

function lineFree(grid: NavGrid, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5);
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (!grid.collision.canStand(x, y, grid.footRx, grid.footRy)) return false;
  }
  return true;
}

export type BehaviourState = 'idle' | 'wander' | 'inspect' | 'rest' | 'manual';

export interface BrainIntent {
  dx: number;
  dy: number;
  moving: boolean;
  /** Fire the interaction (edge) this step. */
  interact: boolean;
  /** Face this way without moving (for inspecting). */
  face?: 'up' | 'down' | 'left' | 'right';
}

/** What the brain looks at when inspecting. */
export const INSPECTABLE = new Set<Placement['kind']>(['decor', 'flower', 'house', 'tree', 'bush', 'rock']);

export interface BrainOptions {
  /** Pixels per second when wandering. */
  speed: number;
  /** Seconds without input before autonomy resumes. */
  manualTimeout: number;
}

export class Brain {
  state: BehaviourState = 'idle';
  target: { x: number; y: number } | null = null;
  path: { x: number; y: number }[] = [];
  /** Index of the next waypoint. */
  private next = 0;
  /** When the current state ends (sim seconds). */
  until = 0;
  private manualUntil = -1;
  private wanders = 0;
  private stuckSince = -1;
  private lastPos = { x: 0, y: 0 };
  private inspecting: Placement | null = null;
  private interactAt = -1;
  readonly rng: Rng;
  readonly options: BrainOptions = { speed: 30, manualTimeout: 5 };
  enabled = true;
  /** For the UI: why the current state was chosen. */
  note = '';

  constructor(
    seed: string,
    readonly grid: NavGrid,
    readonly objects: readonly Placement[],
  ) {
    this.rng = stream(seed, 'brain');
  }

  /** The keyboard spoke: take manual control for a while. */
  manual(time: number): void {
    this.manualUntil = time + this.options.manualTimeout;
    if (this.state !== 'manual') {
      this.state = 'manual';
      this.target = null;
      this.path = [];
      this.note = 'manual control';
    }
  }

  get manualActive(): boolean {
    return this.state === 'manual';
  }

  /** Seconds of manual control left (0 when autonomous). */
  manualLeft(time: number): number {
    return this.state === 'manual' ? Math.max(0, this.manualUntil - time) : 0;
  }

  /** One simulation step: returns what the Blobbi wants to do. */
  step(time: number, dt: number, pos: { x: number; y: number }, moved: boolean): BrainIntent {
    const still: BrainIntent = { dx: 0, dy: 0, moving: false, interact: false };
    if (this.state === 'manual') {
      if (time >= this.manualUntil && this.enabled) {
        this.state = 'idle';
        this.until = time + this.rng.range(0.5, 1.5);
        this.note = 'autonomy resumed';
      }
      return still;
    }
    if (!this.enabled) return still;
    switch (this.state) {
      case 'idle':
        if (time >= this.until) this.choose(time, pos);
        return still;
      case 'rest':
        if (time >= this.until) {
          this.state = 'idle';
          this.until = time + 0.5;
          this.note = 'woke up';
        }
        return still;
      case 'wander':
      case 'inspect': {
        if (this.next >= this.path.length) {
          // Arrived.
          if (this.state === 'inspect' && this.inspecting) {
            const o = this.inspecting;
            const face = Math.abs(o.x - pos.x) > Math.abs(o.y - pos.y) ? (o.x > pos.x ? 'right' : 'left') : o.y > pos.y ? 'down' : 'up';
            if (this.interactAt < 0) {
              this.interactAt = time + 0.4;
              return { ...still, face };
            }
            if (time >= this.interactAt) {
              this.state = 'idle';
              this.until = time + this.rng.range(1.5, 3);
              this.inspecting = null;
              this.interactAt = -1;
              this.note = `looked at the ${o.kind}`;
              return { ...still, face, interact: true };
            }
            return { ...still, face };
          }
          this.state = 'idle';
          this.until = time + this.rng.range(1, 3.5);
          this.wanders++;
          this.note = 'arrived';
          return still;
        }
        // Stuck detection: no progress for a second means the path is blocked; replan.
        if (moved && Math.hypot(pos.x - this.lastPos.x, pos.y - this.lastPos.y) > 0.3) this.stuckSince = -1;
        else if (this.stuckSince < 0) this.stuckSince = time;
        else if (time - this.stuckSince > 1) {
          this.note = 'stuck, replanning';
          this.stuckSince = -1;
          this.state = 'idle';
          this.until = time + 0.3;
          return still;
        }
        this.lastPos = { x: pos.x, y: pos.y };
        const wp = this.path[this.next];
        const dx = wp.x - pos.x;
        const dy = wp.y - pos.y;
        const d = Math.hypot(dx, dy);
        if (d < Math.max(1.5, this.options.speed * dt)) {
          this.next++;
          return this.step(time, dt, pos, moved);
        }
        return { dx: dx / d, dy: dy / d, moving: true, interact: false };
      }
    }
    return still;
  }

  /** Pick the next thing to do. */
  private choose(time: number, pos: { x: number; y: number }): void {
    const roll = this.rng.next();
    if (this.wanders >= 3 && roll < 0.3) {
      this.state = 'rest';
      this.until = time + this.rng.range(6, 12);
      this.wanders = 0;
      this.note = 'resting';
      return;
    }
    if (roll < 0.62) {
      const candidates = this.objects.filter((o) => INSPECTABLE.has(o.kind) && Math.hypot(o.x - pos.x, o.y - pos.y) < 90 && Math.hypot(o.x - pos.x, o.y - pos.y) > 10);
      if (candidates.length && this.rng.chance(0.45)) {
        const o = this.rng.pick(candidates);
        // Stand a little in front of (below) the object, on free ground.
        const standAt = this.grid.nearestFree(o.x, o.y + 8, 4);
        if (standAt) {
          const to = this.grid.centre(standAt.c, standAt.r);
          const path = findPath(this.grid, pos, to);
          if (path && path.length > 1) {
            this.state = 'inspect';
            this.inspecting = o;
            this.interactAt = -1;
            this.setPath(path, to);
            this.note = `going to look at the ${o.kind}`;
            return;
          }
        }
      }
      // Wander: a free cell 40-120 px away that A* can reach.
      for (let tries = 0; tries < 8; tries++) {
        const a = this.rng.range(0, Math.PI * 2);
        const r = this.rng.range(40, 120);
        const to = { x: pos.x + Math.cos(a) * r, y: pos.y + Math.sin(a) * r };
        const cell = this.grid.nearestFree(to.x, to.y, 3);
        if (!cell) continue;
        const c = this.grid.centre(cell.c, cell.r);
        const path = findPath(this.grid, pos, c);
        if (path && path.length > 1) {
          this.state = 'wander';
          this.setPath(path, c);
          this.note = 'wandering';
          return;
        }
      }
    }
    this.state = 'idle';
    this.until = time + this.rng.range(1, 3);
    this.note = 'idling';
  }

  private setPath(path: { x: number; y: number }[], target: { x: number; y: number }): void {
    this.path = path;
    this.next = 1;
    this.target = target;
    this.stuckSince = -1;
  }
}
