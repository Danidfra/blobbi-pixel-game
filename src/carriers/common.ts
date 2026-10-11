/**
 * SHARED CARRIER DRAWING: what every World Carrier species uses to become pixels. Smooth outlines (closed
 * Catmull-Rom curves), polygon masks, the lab's banded shading over a mask, and the island top: a patch of land
 * with a soft edge, ground shading and a few plants placed from the seed.
 *
 * Separation, as everywhere in this project:
 *   species      constants (what makes a whale a whale)       — whale.ts, manta.ts
 *   individual   a seeded genome (proportions, details)       — generate*Genome(seed)
 *   cosmetic     colours and markings (own RNG stream)        — inside the genome, from a separate stream
 *   geometry     anatomy in world pixels from the genome      — *Anatomy(genome, w, h)
 *   movement     how parts move (pure functions of time)      — *Pose(anatomy, t)
 *   animation    frames from geometry + pose                  — render*(anatomy, t)
 */
import { Mask, PixelBuffer } from '../core/pixel';
import type { Ramp, WorldPalette } from '../core/palette';
import { blobScore, shadeOf } from '../core/shade';
import { hash32, stream } from '../core/rng';
import { OBJECT_GENERATORS } from '../objects';

export interface Pt {
  x: number;
  y: number;
}

/** A closed Catmull-Rom curve through `pts`, `n` samples per segment. */
export function smoothClosed(pts: readonly Pt[], n = 8): Pt[] {
  const out: Pt[] = [];
  const k = pts.length;
  for (let i = 0; i < k; i++) {
    const p0 = pts[(i - 1 + k) % k];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % k];
    const p3 = pts[(i + 2) % k];
    for (let j = 0; j < n; j++) {
      const t = j / n;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
}

/** Fill a polygon into a mask (pixel centres, even-odd). */
export function polygonMask(w: number, h: number, poly: readonly Pt[]): Mask {
  const m = new Mask(w, h);
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.ceil(y1)); y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > cy !== b.y > cy) xs.push(a.x + ((cy - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(w - 1, Math.floor(xs[k + 1] - 0.5)); x++) m.set(x, y);
  }
  return m;
}

/** Shade a masked body as one lit form (centre and radii give the light's frame), with an outline. */
export function shadeBody(buf: PixelBuffer, mask: Mask, cx: number, cy: number, rx: number, ry: number, r: Ramp, depth = 0.9): void {
  buf.paintMaskWith(mask, (x, y) => shadeOf(blobScore((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry, depth), r, { highlight: 0.82, light: 0.46, dark: 0.04 }));
  buf.paintMask(mask.edge(), r.outline);
}

/** Grow or shrink a mask by `n` pixels. */
export const grow = (m: Mask, n: number): Mask => {
  let out = m;
  for (let i = 0; i < Math.abs(n); i++) out = n > 0 ? out.dilate() : out.erode();
  return out;
};

const seedHashes = new Map<string, number>();
/** A lattice value in [0,1) for a seed and integer point (an integer hash: fast enough per pixel). */
function lattice(seed: string, i: number, j: number): number {
  let s = seedHashes.get(seed);
  if (s === undefined) seedHashes.set(seed, (s = hash32(seed)));
  let h = (s ^ Math.imul(i, 374761393) ^ Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1) on a seeded lattice. */
export function valueNoise(seed: string, x: number, y: number, cell: number): number {
  const ix = Math.floor(x / cell);
  const iy = Math.floor(y / cell);
  const fx = x / cell - ix;
  const fy = y / cell - iy;
  const h = (i: number, j: number) => lattice(seed, i, j);
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = h(ix, iy) + (h(ix + 1, iy) - h(ix, iy)) * s(fx);
  const b = h(ix, iy + 1) + (h(ix + 1, iy + 1) - h(ix, iy + 1)) * s(fx);
  return a + (b - a) * s(fy);
}

export interface IslandTop {
  /** The land's mask (world size). */
  mask: Mask;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** A patch of land: an ellipse whose edge wobbles with noise (a coastline, not a disc), clipped to the body. */
export function islandMask(seed: string, w: number, h: number, cx: number, cy: number, rx: number, ry: number, body: Mask, wobble = 0.12): IslandTop {
  const mask = new Mask(w, h);
  for (let y = Math.floor(cy - ry * 1.3); y <= Math.ceil(cy + ry * 1.3); y++)
    for (let x = Math.floor(cx - rx * 1.3); x <= Math.ceil(cx + rx * 1.3); x++) {
      if (x < 0 || y < 0 || x >= w || y >= h || !body.get(x, y)) continue;
      const u = (x + 0.5 - cx) / rx;
      const v = (y + 0.5 - cy) / ry;
      const n = valueNoise(seed, x, y, 9) - 0.5;
      if (u * u + v * v <= 1 + n * wobble * 4) mask.set(x, y);
    }
  return { mask, cx, cy, rx, ry };
}

/**
 * Paint the island top: ground in the grass ramp (lit like a low dome), a darker band at the edge, an optional
 * fringe colour (sand, moss) one pixel outside, then plants from the seed, drawn back to front.
 */
export function paintIslandTop(buf: PixelBuffer, top: IslandTop, palette: WorldPalette, seed: string, fringe: number | null, ground?: (buf: PixelBuffer, top: IslandTop) => void): void {
  const { mask, cx, cy, rx, ry } = top;
  if (fringe !== null) buf.paintMask(mask.dilate().edge(), fringe);
  buf.paintMaskWith(mask, (x, y) => {
    const s = blobScore((x + 0.5 - cx) / (rx * 1.4), (y + 0.5 - cy) / (ry * 1.4), 0.6);
    const n = valueNoise(`${seed}|grass`, x, y, 6);
    return n > 0.68 ? palette.grassPatch : shadeOf(s + (n - 0.5) * 0.1, palette.grass, { highlight: 0.9, light: 0.42, dark: 0.0 });
  });
  buf.paintMask(mask.edge(), palette.grassEdge);
  // Species ground features (paths, pools) before the plants, so plants stand on them.
  ground?.(buf, top);
  // Plants: a few trees, bushes, flowers and tufts, spaced, inside the land (away from its edge).
  const rng = stream(seed, 'island-top', 'plants');
  const inner = grow(mask, -4);
  const spots: { x: number; y: number; kind: 'tree' | 'bush' | 'flower' | 'grass'; size: number }[] = [];
  const area = Math.PI * rx * ry;
  const wanted = Math.round(area / 260);
  for (let i = 0; i < wanted * 12 && spots.length < wanted; i++) {
    const x = Math.round(cx + rng.range(-rx, rx));
    const y = Math.round(cy + rng.range(-ry, ry));
    if (!inner.get(x, y) || (ground && (buf.get(x, y) === palette.path.light || buf.get(x, y) === palette.path.mid))) continue;
    const roll = rng.range(0, 1);
    const kind = roll < 0.22 ? 'tree' : roll < 0.45 ? 'bush' : roll < 0.75 ? 'flower' : 'grass';
    const gap = kind === 'tree' ? 14 : kind === 'bush' ? 8 : 4;
    if (spots.some((s) => Math.hypot(s.x - x, s.y - y) < gap)) continue;
    spots.push({ x, y, kind, size: kind === 'tree' ? Math.round(rng.range(20, 28)) : kind === 'bush' ? 10 : 6 });
  }
  spots.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const s of spots) {
    const sprite = OBJECT_GENERATORS[s.kind]({ seed: `${seed}|${s.kind}|${s.x},${s.y}`, size: s.size, palette });
    // A small shadow for trees and bushes.
    if (s.kind === 'tree' || s.kind === 'bush') {
      const sh = new Mask(buf.width, buf.height);
      sh.fillEllipse(s.x + 1, s.y, s.kind === 'tree' ? 5 : 3, 2);
      buf.paintMaskWith(sh, (x, y) => (mask.get(x, y) ? palette.shadowOnGrass : undefined));
    }
    buf.blit(sprite.buffer, s.x - sprite.anchorX, s.y - sprite.anchorY);
  }
}

/** Calm sea under a carrier: mostly one blue, long soft swells, a few glints. */
export function paintSea(buf: PixelBuffer, palette: WorldPalette, seed: string, t: number): void {
  const w = buf.width;
  const h = buf.height;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const n = valueNoise(`${seed}|sea`, x * 0.5 + t * 2, y * 1.6, 16);
      const glint = valueNoise(`${seed}|glint`, x, y * 2 + t * 4, 3);
      buf.set(x, y, glint > 0.93 ? palette.water.light : n > 0.66 ? palette.water.light : n < 0.3 ? palette.water.dark : palette.water.mid);
    }
}

/**
 * The body in the water: a band of lighter, shallower-looking water hugging it (as around the turtle) and broken
 * foam at its edge, never a solid ring.
 */
export function paintWake(buf: PixelBuffer, body: Mask, palette: WorldPalette, seed = 'wake'): void {
  const near = grow(body, 3);
  buf.paintMaskWith(near, (x, y) => (body.get(x, y) ? undefined : palette.shallow.mid));
  buf.paintMaskWith(grow(body, 1).edge(), (x, y) => (body.get(x, y) ? undefined : palette.shallow.light));
  buf.paintMaskWith(near.edge(), (x, y) => (valueNoise(seed, x, y, 4) > 0.45 ? palette.foam : undefined));
}
