/**
 * SHADING RULES. One light, top-left, for the whole world. Shapes are shaded
 * into crisp bands of a ramp (no gradients), with a 1px inside outline in the
 * ramp's outline colour. These are the rules that make different generators
 * look like one artist.
 */
import type { Color } from './color';
import { Mask, PixelBuffer, forEachEllipsePixel } from './pixel';
import type { Ramp } from './palette';

/** Light direction, pointing FROM the light: top-left, slightly from above. */
export const LIGHT = { x: -0.55, y: -0.85 } as const;

export interface BlobShading {
  /** Where the highlight band begins, in lighting score; lower = bigger highlight. */
  highlight?: number;
  light?: number;
  /** Below this the pixel is dark. */
  dark?: number;
  /** Skip the highlight shade entirely (matte objects). */
  noHighlight?: boolean;
  /** Vertical squash of the lighting model (1 = sphere, <1 = flatter top). */
  depth?: number;
}

/**
 * Lighting score of a point inside a unit ellipse: a combination of facing
 * the light (planar) and being near the centre (bulge). Bands over this
 * score give the classic pixel sphere: small bright highlight up-left, a wide
 * light region, a mid belt, and a dark rim down-right.
 */
export function blobScore(u: number, v: number, depth = 1): number {
  const rr = u * u + v * v;
  const facing = -(u * LIGHT.x + v * LIGHT.y * depth);
  return facing * 0.62 + (1 - rr) * 0.45;
}

export function shadeOf(score: number, ramp: Ramp, s: BlobShading = {}): Color {
  const hi = s.highlight ?? 0.72;
  const li = s.light ?? 0.42;
  const dk = s.dark ?? -0.02;
  if (!s.noHighlight && score > hi) return ramp.highlight;
  if (score > li) return ramp.light;
  if (score > dk) return ramp.mid;
  return ramp.dark;
}

/**
 * A shaded ellipse with an inside outline. Pixels are shaded by their
 * position in the ellipse; the outline is laid on the ellipse's own edge.
 * Returns the mask of the pixels it painted.
 */
export function shadedEllipse(buf: PixelBuffer, cx: number, cy: number, rx: number, ry: number, ramp: Ramp, s: BlobShading = {}, outline = true): Mask {
  const mask = new Mask(buf.width, buf.height);
  forEachEllipsePixel(cx, cy, rx, ry, (x, y) => {
    const u = (x + 0.5 - cx) / rx;
    const v = (y + 0.5 - cy) / ry;
    buf.set(x, y, shadeOf(blobScore(u, v, s.depth), ramp, s));
    mask.set(x, y);
  });
  if (outline) buf.paintMask(mask.edge(), ramp.outline);
  return mask;
}

export interface Blob {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * A CLOUD: several overlapping blobs that read as one mass (a tree canopy, a
 * bush, a rock pile). Blobs are drawn back to front (by cy); each later blob
 * covers the earlier ones and leaves a separation line only on its lower
 * half, which is how pixel artists draw clustered foliage. One outline wraps
 * the union. Returns the union mask.
 */
export function shadedCloud(buf: PixelBuffer, blobs: readonly Blob[], ramp: Ramp, s: BlobShading = {}, separation = 0.55): Mask {
  const sorted = blobs.slice().sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  const union = new Mask(buf.width, buf.height);
  for (const b of sorted) {
    const m = new Mask(buf.width, buf.height);
    forEachEllipsePixel(b.cx, b.cy, b.rx, b.ry, (x, y) => {
      const u = (x + 0.5 - b.cx) / b.rx;
      const v = (y + 0.5 - b.cy) / b.ry;
      buf.set(x, y, shadeOf(blobScore(u, v, s.depth), ramp, s));
      m.set(x, y);
    });
    // Separation line: this blob's edge where it overlaps the earlier mass, lower part only.
    const edge = m.edge();
    for (let y = 0; y < edge.height; y++)
      for (let x = 0; x < edge.width; x++)
        if (edge.data[y * edge.width + x] && union.get(x, y)) {
          const v = (y + 0.5 - b.cy) / b.ry;
          if (v > 1 - separation * 2) buf.set(x, y, ramp.dark);
        }
    union.union(m);
  }
  buf.paintMask(union.edge(), ramp.outline);
  return union;
}

/** A flat-shaded vertical cylinder (trunk, post): light on the left third, dark on the right. */
export function shadedColumn(buf: PixelBuffer, x: number, y: number, w: number, h: number, ramp: Ramp, outline = true): void {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const t = w <= 1 ? 0.5 : i / (w - 1);
      const c = t < 0.34 ? ramp.light : t > 0.72 ? ramp.dark : ramp.mid;
      buf.set(x + i, y + j, c);
    }
  if (outline) {
    buf.vline(x, y, y + h - 1, ramp.outline);
    buf.vline(x + w - 1, y, y + h - 1, ramp.outline);
  }
}
