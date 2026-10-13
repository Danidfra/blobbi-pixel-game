/**
 * THE LANDING (M10 phase C, growth version 4): the guaranteed way to the sea.
 *
 * On a Carrier the island lies on the animal's back (a whale's, a manta's) or inside the turtle's ring of shell
 * plates, and a band of the Carrier itself lies between the land and the water — on a manta 20 to 50 pixels of it.
 * Ordinary growth keeps that band on purpose (the animal must still read as an animal), so some islands never came
 * within a launch's reach of open water. The landing fixes that by generation, not by luck: when the island first
 * grows (stage `OCEAN_ACCESS_STAGE`) it also grows one narrow tongue of shore across that band to the Carrier's edge,
 * at a place chosen from the world's own geometry:
 *
 *   - the tongue runs straight from the island to the Carrier's edge (so the Blobbi faces the water squarely to
 *     launch), over the carrying surface only (shell ring or back: never over water, never over anything a flipper,
 *     wing, fluke or the head sweeps — `movingPartsMask` — and never near a creature's head);
 *   - it reaches the edge only across the margin `suitableSurface` keeps (at most `MAX_CROSS`), so it never crosses
 *     anatomy that land elsewhere avoids (the whale's head and tail, the manta's wings and tail);
 *   - the water beyond takes the canoe (`SeaNav.canFloat`), clear of the moving parts by `ANATOMY_MARGIN`, and the
 *     canoe can paddle from there out past the Carrier's outline into open sea (`departs`);
 *   - of every place that qualifies, the shortest tongue wins (ties: scan order), so it is deterministic.
 *
 * The tongue is ADDED land only: it changes only pixels of the carrying surface, keeps a lip of the Carrier's edge
 * in front of it, grows no plants or stones (nothing can block it), and is painted after each stage's objects are
 * placed, so every object of a version-3 world is the same in version 4.
 */
import { CANOE, SeaNav, seaRegion, type Heading } from '../game/canoe';
import { ANATOMY_MARGIN, departs, launchFrom } from '../game/ocean-access';
import { worldBounds } from '../render/view-camera';
import { T, type WorldDescription } from './types';

/** The growth stage from which every island has its landing (the first growth: "The shore widens"). */
export const OCEAN_ACCESS_STAGE = 1;

export interface Landing {
  /** The way the tongue points: from the island toward the water. */
  heading: Heading;
  /** Where the tongue leaves the island's land (on the land, a little inside it). */
  root: { x: number; y: number };
  /** The tongue's end: the shore spot by the water. */
  tip: { x: number; y: number };
  /** Half its width (world px). */
  half: number;
  /** Where the canoe floats when launched from the tip. */
  launch: { x: number; y: number };
}

const STEP: Record<Heading, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const WATER = (c: number) => c === T.SHALLOW || c === T.WATER || c === T.DEEP || c === T.FOAM;
/** Land of any kind (a manta's beach counts: its sand sits below GRASS_EDGE in the class order). */
const LAND = (c: number) => c >= T.SAND_WET && c !== T.RIM && c !== T.SKIN;

/** The Blobbi stands this far inside the landing's tip to launch (its foot clear of the rounded end). */
export const STAND_IN = 6;

/** Where the Blobbi stands on a landing, facing the water. */
export function landingStandOf(l: Landing): { x: number; y: number; heading: Heading } {
  const [fx, fy] = STEP[l.heading];
  return { x: l.tip.x - fx * STAND_IN, y: l.tip.y - fy * STAND_IN, heading: l.heading };
}

/** At most this many pixels of the Carrier's edge margin (outside the suitable surface) are crossed (× scale). */
export const MAX_CROSS = 14;
/** The longest tongue (× scale): from the island over the carrying surface to the edge. */
export const MAX_TONGUE = 110;

/**
 * Plan the landing for a world from its terrain at the access stage. `suit` is `suitableSurface(base)`, `mask` the
 * Carrier's `movingPartsMask`, `occupied` where objects stand (1: a natural one, which the landing would clear; 2: a
 * keeper piece, which it never covers). Each natural object in the way counts as 40 pixels more of tongue. Null only
 * if the Carrier offers no such place at all (none of the shipped Carriers; see tests/ocean-access.test.ts).
 */
export function planLanding(base: WorldDescription, cls: Uint8Array, suit: Uint8Array, mask: Uint8Array, occupied?: Uint8Array): Landing | null {
  const { width, height } = base.terrain;
  const scale = base.options.scale;
  const free = base.turtle ? T.RIM : T.SKIN;
  const half = Math.round(6 * scale);
  const lip = base.turtle ? Math.max(2, Math.round(1.6 * scale)) : 2;
  const maxCross = Math.round(MAX_CROSS * scale);
  const maxLen = Math.round(MAX_TONGUE * scale);
  const head = base.creature?.head ?? null;
  const headKeep = 50 * scale;
  const sub = worldBounds(base).subject ?? { x0: 0, y0: 0, x1: width, y1: height };
  const nav = new SeaNav(base, seaRegion(sub), mask);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x);
  const guarded = protectedAnatomy(base);
  /** A pixel the tongue may cover: carrying surface, not swept by a moving part, not protected anatomy, or land. */
  const coverable = (x: number, y: number) => {
    const i = at(x, y);
    if (i < 0) return false;
    return LAND(cls[i]) || (cls[i] === free && !mask[i] && !guarded(x, y));
  };
  let best: (Landing & { len: number }) | null = null;
  for (const heading of ['down', 'right', 'left', 'up'] as Heading[]) {
    const [fx, fy] = STEP[heading];
    const px = -fy;
    const py = fx;
    for (let y = 1; y < height - 1; y += 2)
      for (let x = 1; x < width - 1; x += 2) {
        // An edge pixel of the carrying surface with open water just beyond it, this way.
        const i = at(x, y);
        if (cls[i] !== free || mask[i]) continue;
        const o = at(x + fx, y + fy);
        if (o >= 0 && !WATER(cls[o])) continue;
        if (head && Math.hypot(x - head.cx, y - head.cy) < headKeep) continue;
        if (guarded(x, y)) continue;
        // The tip keeps a lip of the Carrier's edge in front of it.
        const tx = x - fx * lip;
        const ty = y - fy * lip;
        // Walk inward: across the edge margin (to the suitable surface) and on over it to the island's land.
        let len = 0;
        let crossed = 0;
        let ok = false;
        let onSuit = false;
        for (; len <= maxLen; len++) {
          const cx = tx - fx * len;
          const cy = ty - fy * len;
          const j = at(cx, cy);
          if (j < 0) break;
          if (LAND(cls[j])) {
            ok = true;
            break;
          }
          if (cls[j] !== free || mask[j] || guarded(cx, cy)) break;
          if (suit[j]) onSuit = true;
          else if (!onSuit && ++crossed > maxCross) break;
          else if (onSuit) break; // left the suitable surface again: not a straight way over the back
          // The tongue's full width must be carrying surface (or land) here (its rounded tip is narrower).
          const need = len < half ? Math.round(Math.sqrt(half * half - (half - len) ** 2)) : half;
          let wide = true;
          for (let k = -need; k <= need && wide; k++) wide = coverable(cx + px * k, cy + py * k);
          if (!wide) break;
        }
        if (!ok) continue;
        // What stands on the tongue's ground (its tip, where the Blobbi stands, first of all).
        let cost = len + 1;
        if (occupied) {
          let natural = 0;
          let keeper = false;
          for (let u = -half; u <= len + half && !keeper; u++)
            for (let k = -half; k <= half; k++) {
              const j = at(tx - fx * u + px * k, ty - fy * u + py * k);
              if (j < 0 || !occupied[j]) continue;
              if (occupied[j] === 2) {
                keeper = true;
                break;
              }
              natural++;
            }
          if (keeper) continue;
          cost += Math.ceil(natural / 20) * 40;
        }
        if (cost >= (best?.len ?? Infinity)) continue;
        // The Blobbi stands on the tip (a step inside it) and faces the water: the canoe must float there, keep clear
        // of the moving parts, and be able to paddle out to open sea.
        const sx = tx - fx * STAND_IN;
        const sy = ty - fy * STAND_IN;
        const launch = launchFrom(nav, sx, sy, heading);
        if (!launch || !clearOf(mask, width, height, launch.x, launch.y, heading)) continue;
        if (!departs(nav, sub, launch.x, launch.y)) continue;
        best = { heading, root: { x: tx - fx * (len + half), y: ty - fy * (len + half) }, tip: { x: tx, y: ty }, half, launch, len: cost };
      }
  }
  if (!best) return null;
  const { len: _len, ...landing } = best;
  void _len;
  return landing;
}

/**
 * The Carrier's PROTECTED ANATOMY, from its own geometry: where a landing may never lie (beyond what is already not
 * carrying surface or swept by a moving part):
 *  - turtle: near its head, neck, flippers or tail (any of its skin, within 10 px × scale), and the shell's edge in
 *    front of its head and behind its tail (within 40 px × scale of either): a landing is on a flank;
 *  - whale: ahead of its blowholes (the head) or behind its knuckles (the tail stock) — outside `growRange`;
 *  - manta: on its head-to-tail axis (the cephalic fins in front, the tail behind): within 0.3 of its half-span.
 */
export function protectedAnatomy(base: WorldDescription): (x: number, y: number) => boolean {
  const { width, height, cls } = base.terrain;
  const scale = base.options.scale;
  if (base.turtle) {
    const keep = Math.round(10 * scale);
    // Steps from the turtle's skin, as far as `keep`.
    const d = new Int16Array(width * height).fill(-1);
    const queue: number[] = [];
    for (let i = 0; i < cls.length; i++)
      if (cls[i] === T.SKIN) {
        d[i] = 0;
        queue.push(i);
      }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      if (d[i] >= keep) continue;
      const x = i % width;
      const y = (i / width) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const j = yy * width + xx;
        if (d[j] < 0) {
          d[j] = d[i] + 1;
          queue.push(j);
        }
      }
    }
    const t = base.turtle;
    const ends = [
      { x: t.head.cx, y: t.head.cy, r: Math.max(t.head.rx, t.head.ry) + 40 * scale },
      { x: t.tail.cx, y: t.tail.cy, r: t.tail.length + 40 * scale },
    ];
    return (x, y) => (x >= 0 && y >= 0 && x < width && y < height && d[y * width + x] >= 0) || ends.some((e) => Math.hypot(x - e.x, y - e.y) < e.r);
  }
  const c = base.creature;
  if (c?.species === 'whale') return (x) => x < c.growRange.x0 || x > c.growRange.x1;
  if (c?.species === 'manta') {
    const m = c.anatomy;
    return (x) => Math.abs(x + 0.5 - m.cx) < m.S * 0.3;
  }
  return () => false;
}

/** A hull at (x, y) keeps `ANATOMY_MARGIN` from every moving part. */
function clearOf(mask: Uint8Array, width: number, height: number, x: number, y: number, heading: Heading): boolean {
  const along = heading === 'left' || heading === 'right';
  const hx = (along ? CANOE.halfLength : CANOE.halfBeam) + ANATOMY_MARGIN;
  const hy = (along ? CANOE.halfBeam : CANOE.halfLength) + ANATOMY_MARGIN;
  for (let dy = -hy; dy <= hy; dy++)
    for (let dx = -hx; dx <= hx; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px >= 0 && py >= 0 && px < width && py < height && mask[py * width + px]) return false;
    }
  return true;
}

/**
 * Paint the landing into a stage's terrain: carrying-surface pixels inside the tongue become shore (its ground, an
 * edge band along its sides, a beach at its tip on a creature), the old coast band it crosses becomes inland ground.
 * Only pixels of the carrying surface (never swept by a moving part) change; no land is lost. `bornAt` marks the new
 * pixels as `stage`, and `region` as `regionIndex` (1-based) unless it is 0 (growth passes 0: the landing belongs to
 * no growth region, so the regions' cells — where their resources, places and discoveries go — stay exactly v3's). Returns how many pixels became land.
 */
export function paintLanding(base: WorldDescription, landing: Landing, t: { cls: Uint8Array; dist: Float32Array; owner: Int8Array; region: Uint8Array; bornAt: Uint8Array }, mask: Uint8Array, regionIndex: number, stage: number, mark?: Uint8Array): number {
  const { width, height } = base.terrain;
  const scale = base.options.scale;
  const free = base.turtle ? T.RIM : T.SKIN;
  const [fx, fy] = STEP[landing.heading];
  const px = -fy;
  const py = fx;
  const { root, tip, half } = landing;
  const length = Math.abs(tip.x - root.x) + Math.abs(tip.y - root.y);
  const edgeW = Math.max(2, Math.round(1.5 * scale));
  const beachW = base.creature ? Math.max(2, Math.round(2 * scale)) : 0;
  const shore = base.creature?.species === 'whale' ? T.MOSS : base.creature ? T.SAND : T.GRASS_EDGE;
  const owner = base.islands[0]?.id ?? 0;
  let added = 0;
  // Along the tongue (u from the root, 0..length) and across it (v, -w..w): a rounded tip, a flared root, and a
  // width that breathes a pixel or two (a deterministic wobble), so it reads as grown shore, not a pier.
  const wobble = (u: number) => Math.round(Math.sin(u * 0.21 + landing.tip.x * 0.37) * 0.9 * scale);
  for (let u = 0; u <= length; u++) {
    const toTip = length - u;
    let w = half + wobble(u) + (u < half ? Math.round((half - u) * 0.6) : 0);
    if (toTip < half) w = Math.min(w, Math.round(Math.sqrt(Math.max(0, half * half - (half - toTip) ** 2))));
    for (let v = -w; v <= w; v++) {
      const x = root.x + fx * u + px * v;
      const y = root.y + fy * u + py * v;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = y * width + x;
      const side = w - Math.abs(v);
      const edgeDist = Math.min(side, toTip);
      if (t.cls[i] === free && !mask[i]) {
        t.cls[i] = toTip < beachW ? shore : edgeDist < edgeW ? T.GRASS_EDGE : T.CLOVER;
        t.dist[i] = -Math.max(0.5, edgeDist);
        t.owner[i] = owner;
        if (regionIndex) t.region[i] = regionIndex;
        t.bornAt[i] = stage;
        if (mark) mark[i] = 1;
        added++;
      } else if (side >= edgeW + 1 && u >= half && toTip > beachW && (t.cls[i] === T.GRASS_EDGE || ((t.cls[i] === T.SAND || t.cls[i] === T.SAND_WET || t.cls[i] === T.MOSS) && !!base.creature))) {
        // The old coast band where the tongue joins the island: inland now (no seam across its root).
        t.cls[i] = T.CLOVER;
        if (mark && !mark[i]) mark[i] = 2;
      }
    }
  }
  return added;
}

/**
 * Distance (px, chamfer) from every pixel to the nearest marked one (0 on it): the turtle shell's soil band and the
 * plates it hides follow the landing as they follow the coast.
 */
export function distanceField(mark: Uint8Array, width: number, height: number): Float32Array {
  const field = new Float32Array(width * height).fill(1e6);
  for (let i = 0; i < field.length; i++) if (mark[i]) field[i] = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x > 0) field[i] = Math.min(field[i], field[i - 1] + 1);
      if (y > 0) field[i] = Math.min(field[i], field[i - width] + 1, x > 0 ? field[i - width - 1] + 1.41 : 1e6, x < width - 1 ? field[i - width + 1] + 1.41 : 1e6);
    }
  for (let y = height - 1; y >= 0; y--)
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (x < width - 1) field[i] = Math.min(field[i], field[i + 1] + 1);
      if (y < height - 1) field[i] = Math.min(field[i], field[i + width] + 1, x < width - 1 ? field[i + width + 1] + 1.41 : 1e6, x > 0 ? field[i + width - 1] + 1.41 : 1e6);
    }
  return field;
}
