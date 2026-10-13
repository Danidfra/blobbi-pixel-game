/**
 * COLLISION: a per-pixel walkability mask built once from the world. Land
 * (sand and inward) is walkable, water is not, bridge decks are walkable
 * over water, and the ground footprint of every solid object is blocked.
 * Movement slides: an axis that collides is dropped, the other proceeds.
 */
import { T, WALKABLE, type Placement, type WorldDescription } from '../world/types';
import type { Sprite } from '../core/pixel';

/** Which object kinds a Blobbi cannot walk through. Flowers and tufts are stepped over. */
export const SOLID_KINDS = new Set<Placement['kind']>(['tree', 'bush', 'rock', 'house', 'fence', 'decor']);

export class CollisionMap {
  readonly blocked: Uint8Array;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.blocked = new Uint8Array(width * height);
  }

  /**
   * `absent` (M10 phase B): world objects (by index) that are not there now — a felled tree's cleared ground, a
   * broken rock, a cleared bush — whose ground is free. Terrain is permanent; natural resources occupy it only while
   * they stand.
   */
  static fromWorld(world: WorldDescription, spriteOf: (p: Placement) => Sprite, extra: Placement[] = [], absent?: (index: number) => boolean): CollisionMap {
    const { width, height, cls, elevation } = world.terrain;
    const map = new CollisionMap(width, height);
    for (let i = 0; i < cls.length; i++) map.blocked[i] = WALKABLE.has(cls[i]) ? 0 : 1;
    // A plateau's rim can only be crossed where a path climbs it.
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!elevation[i] || cls[i] === T.PATH) continue;
        const e = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= width || yy >= height ? 0 : elevation[yy * width + xx]);
        if (!e(x - 1, y) || !e(x + 1, y) || !e(x, y - 1) || !e(x, y + 1)) map.blocked[i] = 1;
      }
    for (const p of world.piers) {
      const half = Math.floor(p.width / 2);
      if (p.axis === 'h') for (let y = p.y0 - half; y <= p.y0 + half; y++) for (let x = Math.min(p.x0, p.x1); x <= Math.max(p.x0, p.x1); x++) map.unblock(x, y);
      else for (let x = p.x0 - half; x <= p.x0 + half; x++) for (let y = Math.min(p.y0, p.y1); y <= Math.max(p.y0, p.y1); y++) map.unblock(x, y);
    }
    for (const b of world.bridges) {
      const half = Math.floor(b.width / 2);
      if (b.axis === 'h') for (let y = b.y0 - half + 1; y <= b.y0 + half - 1; y++) for (let x = b.x0; x <= b.x1; x++) map.unblock(x, y);
      else for (let x = b.x0 - half + 1; x <= b.x0 + half - 1; x++) for (let y = b.y0; y <= b.y1; y++) map.unblock(x, y);
    }
    const all = [...world.objects, ...extra];
    // The landing's ground (M10 phase C): the natural objects it covers are never there.
    const gone = world.growth?.landingClear ? new Set(world.growth.landingClear) : null;
    for (let k = 0; k < all.length; k++) {
      const p = all[k];
      if (!SOLID_KINDS.has(p.kind)) continue;
      if (gone?.has(k)) continue;
      if (absent && k < world.objects.length && absent(k)) continue;
      const s = spriteOf(p);
      if (s.footRx <= 1 && s.footRy <= 1) continue; // seedlings are stepped over
      map.blockEllipse(p.x, p.y, s.footRx, Math.max(1, s.footRy), p.kind === 'house');
    }
    return map;
  }

  private unblock(x: number, y: number): void {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.blocked[y * this.width + x] = 0;
  }

  blockEllipse(cx: number, cy: number, rx: number, ry: number, asRect = false): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
        const u = (x + 0.5 - cx) / (rx + 0.5);
        const v = (y + 0.5 - cy) / (ry + 0.5);
        if (asRect || u * u + v * v <= 1) this.blocked[y * this.width + x] = 1;
      }
  }

  isBlocked(x: number, y: number): boolean {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) return true;
    return this.blocked[yi * this.width + xi] !== 0;
  }

  /**
   * Can a foot ellipse of (rx, ry) stand centred at (x, y)? Samples the rim AND the interior on a 2 px lattice,
   * so a one-pixel wall (a plateau rim, a fence) cannot slip between the probes.
   */
  canStand(x: number, y: number, rx: number, ry: number): boolean {
    if (this.isBlocked(x, y)) return false;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (this.isBlocked(x + Math.cos(a) * rx, y + Math.sin(a) * ry)) return false;
    }
    // Every pixel column and row inside the ellipse (step 1), so a bigger foot is a strict superset test.
    for (let dy = -ry; dy <= ry + 1e-6; dy += 1)
      for (let dx = -rx; dx <= rx + 1e-6; dx += 1) {
        if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1.0001) continue;
        if (this.isBlocked(x + dx, y + dy)) return false;
      }
    return true;
  }

  /**
   * Move a foot ellipse by (dx, dy), sliding along obstacles. Each axis is
   * advanced in sub-pixel steps and stops at the first blocked position.
   */
  move(x: number, y: number, dx: number, dy: number, rx: number, ry: number): { x: number; y: number; hitX: boolean; hitY: boolean } {
    let hitX = false;
    let hitY = false;
    const stepsX = Math.ceil(Math.abs(dx) / 0.5);
    for (let i = 0; i < stepsX; i++) {
      const nx = x + dx / stepsX;
      if (this.canStand(nx, y, rx, ry)) x = nx;
      else {
        hitX = true;
        break;
      }
    }
    const stepsY = Math.ceil(Math.abs(dy) / 0.5);
    for (let i = 0; i < stepsY; i++) {
      const ny = y + dy / stepsY;
      if (this.canStand(x, ny, rx, ry)) y = ny;
      else {
        hitY = true;
        break;
      }
    }
    return { x, y, hitX, hitY };
  }

  /** A walkable spot nearest to (x, y), searched in widening rings; for spawning. */
  nearestFree(x: number, y: number, rx: number, ry: number, maxRadius = 80): { x: number; y: number } | null {
    for (let r = 0; r <= maxRadius; r += 2) {
      const n = Math.max(1, Math.round(r * 2));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = Math.round(x + Math.cos(a) * r);
        const py = Math.round(y + Math.sin(a) * r);
        if (this.canStand(px + 0.5, py + 0.5, rx, ry)) return { x: px + 0.5, y: py + 0.5 };
      }
    }
    return null;
  }
}
