/**
 * ISLAND LAYOUT: art-directed, not random. Islands form a chain: each new
 * island is placed beside an existing one along an axis, with a gap in the
 * range a bridge can span, so every island is reachable and every bridge is
 * axis-aligned (diagonal bridges do not pixel well). Shapes are low-order
 * radial harmonics: blobby, never spiky, never noise.
 */
import { stream } from '../core/rng';
import { clamp, TAU } from '../core/math';
import type { Axis, Bridge, CoastFeature, Harmonic, Island, Plateau, WorldOptions } from './types';

/** Bridge gaps and deck width at world scale 1; see `WorldOptions.scale`. */
export const BRIDGE_GAP = { min: 14, max: 30 } as const;
export const BRIDGE_WIDTH = 7;
export const bridgeGap = (scale: number) => ({ min: BRIDGE_GAP.min * scale, max: BRIDGE_GAP.max * scale });
/** The deck is always an odd number of pixels, so it has a centre line. */
export const bridgeWidth = (scale: number) => Math.round(BRIDGE_WIDTH * scale) | 1;
/** An island's radius in any direction is within [2 - MAX_BULGE, MAX_BULGE] of its mean (harmonics 0.16, a cape 0.22). */
export const MAX_BULGE = 1.4;
const HARMONIC_BUDGET = 0.16;

const wrapAngle = (a: number) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

/**
 * Radius of an island in direction `angle` (radians), before fine noise:
 * the harmonic silhouette, then bays cut in and capes reach out as smooth
 * bumps. Keeping the coast a function of angle keeps every other system
 * (distance fields, bridge gaps, layout) unchanged.
 */
export function islandRadius(island: Island, angle: number): number {
  let f = 1;
  if (island.aspect && island.aspect !== 1) {
    // An oval base: the ellipse with half-axes (1, aspect), as a factor on the mean radius.
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const k = 2 / (1 + island.aspect); // keeps the mean radius the island's radius
    f *= (k * island.aspect) / Math.sqrt((island.aspect * c) ** 2 + s ** 2);
  }
  for (const h of island.harmonics) f += h.amp * Math.sin(h.k * angle + h.phase);
  for (const c of island.coast ?? []) {
    const d = wrapAngle(angle - c.angle) / c.width;
    if (Math.abs(d) > 2.5) continue;
    const bump = Math.exp(-d * d * 1.6);
    f *= c.kind === 'bay' ? 1 - c.size * bump : 1 + c.size * bump;
  }
  return island.radius * f;
}

/** Radius of a plateau in direction `angle`. */
export function plateauRadius(p: Plateau, angle: number): number {
  let f = 1;
  for (const h of p.harmonics) f += h.amp * Math.sin(h.k * angle + h.phase);
  return p.radius * f;
}

function makeHarmonics(seed: string, id: number): Harmonic[] {
  const rng = stream(seed, 'layout', 'island', id, 'shape');
  const out: Harmonic[] = [];
  // k=2 gives an oval, k=3 a rounded triangle, k=4/5 gentle lobes; k=7/9 a little coastal irregularity.
  const ks = [2, 3, 4, 5, 7, 9];
  for (const k of ks) {
    const amp = k === 2 ? rng.range(0.04, 0.14) : k === 3 ? rng.range(0.03, 0.1) : k <= 5 ? rng.range(0.015, 0.05) : rng.range(0.008, 0.022);
    out.push({ k, amp, phase: rng.range(0, TAU) });
  }
  // The total amplitude is budgeted, so the harmonic part never moves a shore more than HARMONIC_BUDGET.
  const total = out.reduce((s, h) => s + h.amp, 0);
  if (total > HARMONIC_BUDGET) for (const h of out) h.amp *= HARMONIC_BUDGET / total;
  return out;
}

/**
 * Bays and capes: one or two of each on a large island, fewer on a small
 * one, never two in the same direction. A bay is cut away from where a
 * bridge might land (bridges are read off the final shore anyway).
 */
function makeCoast(seed: string, id: number, radius: number): CoastFeature[] {
  const rng = stream(seed, 'layout', 'island', id, 'coast');
  const out: CoastFeature[] = [];
  const count = radius >= 45 ? rng.int(2, 3) : radius >= 32 ? rng.int(1, 2) : rng.int(0, 1);
  const used: number[] = [];
  for (let i = 0; i < count; i++) {
    let angle = rng.range(0, TAU);
    let tries = 0;
    while (used.some((u) => Math.abs(wrapAngle(angle - u)) < 1.1) && tries++ < 8) angle = rng.range(0, TAU);
    used.push(angle);
    const kind = rng.chance(0.55) ? 'bay' : 'cape';
    out.push({ kind, angle, size: kind === 'bay' ? rng.range(0.14, 0.3) : rng.range(0.12, 0.22), width: kind === 'bay' ? rng.range(0.28, 0.45) : rng.range(0.18, 0.3) });
  }
  return out;
}

/** A plateau on islands large enough to carry one: set toward the back, so its cliff faces the viewer. */
export function makePlateau(seed: string, island: Island): Plateau | null {
  const rng = stream(seed, 'layout', 'island', island.id, 'plateau');
  if (island.radius < 38 || !rng.chance(0.7)) return null;
  const radius = island.radius * rng.range(0.34, 0.46);
  const harmonics: Harmonic[] = [2, 3, 5].map((k) => ({ k, amp: k === 2 ? rng.range(0.05, 0.14) : rng.range(0.03, 0.08), phase: rng.range(0, TAU) }));
  return { cx: island.cx + rng.centered() * island.radius * 0.12, cy: island.cy - island.radius * rng.range(0.14, 0.26), radius, harmonics };
}

export interface Layout {
  islands: Island[];
  bridges: Bridge[];
}

export function layoutIslands(seed: string, options: WorldOptions): Layout {
  const rng = stream(seed, 'layout');
  const { width, height, scale } = options;
  const margin = 16 * scale; // water around the map edge (tall trees near a north shore need headroom)
  const gap = bridgeGap(scale);
  const islands: Island[] = [];
  const bridges: Bridge[] = [];
  const maxR = Math.min(width, height) * 0.21;
  const minR = Math.min(width, height) * 0.12;
  const BULGE = MAX_BULGE;

  const fits = (cx: number, cy: number, r: number, parent: Island): boolean => {
    const pad = r * BULGE + margin;
    if (cx - pad < 0 || cx + pad > width || cy - pad < 0 || cy + pad > height) return false;
    for (const o of islands) {
      const d = Math.hypot(o.cx - cx, o.cy - cy);
      // The parent is placed at a bridgeable gap by construction; every other island must stay clearly apart.
      const need = o === parent ? o.radius + r + gap.min - 2 : (o.radius + r) * BULGE + 8 * scale;
      if (d < need) return false;
    }
    return true;
  };

  // First island: near the centre, the largest.
  const r0 = rng.range(maxR * 0.85, maxR);
  const first: Island = { id: 0, cx: 0, cy: 0, radius: r0, harmonics: makeHarmonics(seed, 0), roughness: rng.range(0.02, 0.035), parent: -1, coast: makeCoast(seed, 0, r0), plateau: null };
  // Bias the first island off-centre so the chain has room to grow. `islands: 0` lets the seed choose.
  const wantIslands = options.islands > 0 ? clamp(options.islands, 1, 6) : rng.weighted([2, 3, 4], [2, 5, 3]);
  const sideX = wantIslands > 1 ? (rng.chance(0.5) ? -1 : 1) : 0;
  first.cx = Math.round(width / 2 + sideX * width * rng.range(0.12, 0.22));
  first.cy = Math.round(height / 2 + rng.centered() * height * 0.08);
  islands.push(first);

  // Grow the chain.
  let attempts = 0;
  while (islands.length < wantIslands && attempts < 60) {
    attempts++;
    const parent = rng.pick(islands);
    const r = rng.range(minR, maxR * 0.85);
    const axis: Axis = rng.weighted(['h', 'v'] as const, [3, 2]);
    const dir = rng.chance(0.5) ? -1 : 1;
    const gapLen = rng.range(gap.min + 2 * scale, gap.max - 4 * scale);
    const id = islands.length;
    const island: Island = { id, cx: 0, cy: 0, radius: r, harmonics: makeHarmonics(seed, id), roughness: rng.range(0.02, 0.035), parent: parent.id, coast: makeCoast(seed, id, r), plateau: null };
    // Boundary-to-boundary gap along the axis, using the REAL radius of each island in that direction
    // (the harmonics can bulge a shore by 16%); the perpendicular offset keeps the bridge inside both extents.
    const angle = axis === 'h' ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const span = islandRadius(parent, angle) + islandRadius(island, angle + Math.PI) + gapLen;
    const perp = rng.centered() * Math.min(parent.radius, r) * 0.35;
    island.cx = Math.round(axis === 'h' ? parent.cx + dir * span : parent.cx + perp);
    island.cy = Math.round(axis === 'v' ? parent.cy + dir * span : parent.cy + perp);
    if (!fits(island.cx, island.cy, r, parent)) continue;
    // A bridge needs plain shore: no bay or cape on either island where the deck will land.
    const facing = (c: CoastFeature, a: number) => Math.abs(wrapAngle(c.angle - a)) < 0.75;
    parent.coast = parent.coast.filter((c) => !facing(c, angle));
    island.coast = island.coast.filter((c) => !facing(c, angle + Math.PI));
    islands.push(island);
    bridges.push({ id: bridges.length, from: parent.id, to: id, axis, x0: 0, y0: 0, x1: 0, y1: 0, width: bridgeWidth(scale) });
  }
  // Centre the archipelago: islands are placed by growth, so the group drifts; shift it back to the middle.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const isl of islands) {
    x0 = Math.min(x0, isl.cx - isl.radius * BULGE);
    x1 = Math.max(x1, isl.cx + isl.radius * BULGE);
    y0 = Math.min(y0, isl.cy - isl.radius * BULGE);
    y1 = Math.max(y1, isl.cy + isl.radius * BULGE);
  }
  const shiftX = Math.round((width - (x0 + x1)) / 2);
  const shiftY = Math.round((height - (y0 + y1)) / 2);
  for (const isl of islands) {
    isl.cx += shiftX;
    isl.cy += shiftY;
    isl.plateau = makePlateau(seed, isl);
  }
  return { islands, bridges };
}
