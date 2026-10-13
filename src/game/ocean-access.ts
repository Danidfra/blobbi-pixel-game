/**
 * OCEAN ACCESS (M10 phase C): where, on a grown island, the Blobbi can reach the sea. Derived only from the world's
 * real geometry (the island's collision, the walkable graph from the hub, and the canoe's own `SeaNav`, which already
 * refuses land, the Carrier's body and everything its flippers, wings or flukes sweep) — never from fixed screen
 * coordinates.
 *
 * An access site is a SHORE SPOT where:
 *   1. the Blobbi can stand, connected on foot to the island's hub;
 *   2. facing one way (as it does to launch), open water lies within the canoe's launch reach;
 *   3. the canoe fits there (`SeaNav.canFloat`), clear of the Carrier's anatomy by a margin;
 *   4. from there the canoe can paddle out past the Carrier's outline into open sea (`departs`);
 *   5. the Blobbi can step back ashore at the same spot (it stands within a step of the moored hull).
 *
 * The ocean-access invariant (`docs/specifications/OCEAN-ACCESS.md`): every Carrier's island has such a site from the
 * stage `OCEAN_ACCESS_STAGE` names on, for every seed — guaranteed by the growth generator's coast rule (see
 * `world/growth.ts`, `coastReach`) and checked here.
 */
import { CANOE, type Heading, type SeaNav } from './canoe';

export interface OceanAccess {
  /** Where the Blobbi stands to launch (and lands back). */
  stand: { x: number; y: number };
  /** Which way it faces the water. */
  heading: Heading;
  /** Where the canoe floats when launched from there. */
  launch: { x: number; y: number };
}

export interface AccessInput {
  width: number;
  height: number;
  /** The Blobbi can stand here (the island's collision with its foot). */
  canStand: (x: number, y: number) => boolean;
  /** Connected on foot to the hub. */
  reach: (x: number, y: number) => boolean;
  nav: SeaNav;
  /** The Carrier's whole picture (island, body, moving parts): open sea lies outside it. */
  subject: { x0: number; y0: number; x1: number; y1: number };
  /** Pixels of the Carrier's anatomy to keep a margin from (its body and its moving parts); 1 = anatomy. */
  anatomy?: Uint8Array;
}

/** The launch reach in front of the Blobbi (`LiveWorld.launchSpot` uses the same numbers). */
export const LAUNCH_REACH = { min: 8, max: 28, step: 2 } as const;
/** How far (world px) a launched hull keeps from the Carrier's anatomy. */
export const ANATOMY_MARGIN = 4;

const STEP: Record<Heading, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

/** Where the canoe would float if launched by a Blobbi at (x, y) facing `heading` (as `launchSpot` does), or null. */
export function launchFrom(nav: SeaNav, x: number, y: number, heading: Heading): { x: number; y: number } | null {
  const [fx, fy] = STEP[heading];
  for (let r = LAUNCH_REACH.min; r <= LAUNCH_REACH.max; r += LAUNCH_REACH.step) {
    const lx = Math.round(x + fx * r);
    const ly = Math.round(y + fy * r);
    if (nav.canFloat(lx, ly, heading)) return { x: lx, y: ly };
  }
  return null;
}

/** Whether a hull at (x, y) keeps `ANATOMY_MARGIN` from the Carrier's anatomy. */
function clearOfAnatomy(input: AccessInput, x: number, y: number, heading: Heading): boolean {
  const a = input.anatomy;
  if (!a) return true;
  const along = heading === 'left' || heading === 'right';
  const hx = (along ? CANOE.halfLength : CANOE.halfBeam) + ANATOMY_MARGIN;
  const hy = (along ? CANOE.halfBeam : CANOE.halfLength) + ANATOMY_MARGIN;
  for (let dy = -hy; dy <= hy; dy++)
    for (let dx = -hx; dx <= hx; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= input.width || py >= input.height) continue;
      if (a[py * input.width + px]) return false;
    }
  return true;
}

/**
 * Can a canoe at (x, y) paddle out of the Carrier's outline into open sea? A flood over hull positions (every
 * `grid` px, any heading that fits) until one lies outside the subject rectangle; bounded, so it is cheap.
 */
export function departs(nav: SeaNav, subject: AccessInput['subject'], x: number, y: number, grid = 4, limit = 30000): boolean {
  const r = nav.region;
  const cols = Math.ceil((r.x1 - r.x0) / grid);
  const rows = Math.ceil((r.y1 - r.y0) / grid);
  const seen = new Uint8Array(cols * rows);
  const fits = (px: number, py: number) => nav.canFloat(px, py, 'right') || nav.canFloat(px, py, 'down') || nav.canFloat(px, py, 'left') || nav.canFloat(px, py, 'up');
  const c0 = Math.round((x - r.x0) / grid);
  const r0 = Math.round((y - r.y0) / grid);
  if (c0 < 0 || r0 < 0 || c0 >= cols || r0 >= rows) return false;
  const queue = [r0 * cols + c0];
  seen[queue[0]] = 1;
  for (let q = 0; q < queue.length && q < limit; q++) {
    const k = queue[q];
    const c = k % cols;
    const rr = (k / cols) | 0;
    const px = r.x0 + c * grid;
    const py = r.y0 + rr * grid;
    if (q > 0 && !fits(px, py)) continue;
    // Out past the Carrier's outline, and not yet in the current's band: open sea.
    if ((px < subject.x0 || py < subject.y0 || px >= subject.x1 || py >= subject.y1) && nav.edge(px, py) === 0) return true;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = rr + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const nk = nr * cols + nc;
      if (seen[nk]) continue;
      seen[nk] = 1;
      queue.push(nk);
    }
  }
  return false;
}

/**
 * Every shore spot the island offers (sampled every `step` px), best first: the ones nearest the hub's side of the
 * island are not preferred over others; the order is simply the scan order, so the result is deterministic.
 * `max` stops early (1 for "is there any?").
 */
export function findOceanAccess(input: AccessInput, max = 1, step = 2): OceanAccess[] {
  const { width, height, nav } = input;
  // Open water near a pixel: a summed-area table of world water, so only a thin band near the coast is tested.
  const W = width + 1;
  const sat = new Int32Array(W * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += nav.water(x, y) ? 1 : 0;
      sat[(y + 1) * W + x + 1] = sat[y * W + x + 1] + row;
    }
  }
  const box = (x0: number, y0: number, x1: number, y1: number) => {
    const ax = Math.max(0, x0);
    const ay = Math.max(0, y0);
    const bx = Math.min(width, x1);
    const by = Math.min(height, y1);
    if (bx <= ax || by <= ay) return 0;
    return sat[by * W + bx] - sat[ay * W + bx] - sat[by * W + ax] + sat[ay * W + ax];
  };
  const near = LAUNCH_REACH.max + CANOE.halfLength;
  const out: OceanAccess[] = [];
  const order: Heading[] = ['down', 'right', 'left', 'up'];
  for (let y = 2; y < height - 2; y += step)
    for (let x = 2; x < width - 2; x += step) {
      // Near the world's edge the open sea counts too.
      const edgeNear = x < near || y < near || x >= width - near || y >= height - near;
      if (!edgeNear && box(x - near, y - near, x + near + 1, y + near + 1) === 0) continue;
      if (!input.canStand(x, y) || !input.reach(x, y)) continue;
      for (const heading of order) {
        const launch = launchFrom(nav, x, y, heading);
        if (!launch || !clearOfAnatomy(input, launch.x, launch.y, heading)) continue;
        if (!departs(nav, input.subject, launch.x, launch.y)) continue;
        out.push({ stand: { x, y }, heading, launch });
        if (out.length >= max) return out;
        break;
      }
    }
  return out;
}
