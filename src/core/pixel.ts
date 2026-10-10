/**
 * THE PIXEL BUFFER: a logical-resolution raster with integer primitives.
 * Everything in the lab is drawn here, pixel by pixel, with pixel-aware
 * geometry (integer ellipses, Bresenham lines, mask outlines). No canvas,
 * no DOM, no anti-aliasing; the browser only blits the result.
 */
import { type Color, TRANSPARENT, alpha } from './color';
import { assertFinite, type Rect } from './math';

export class Mask {
  readonly data: Uint8Array;
  constructor(
    readonly width: number,
    readonly height: number,
    data?: Uint8Array,
  ) {
    this.data = data ?? new Uint8Array(width * height);
  }
  get(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height && this.data[y * this.width + x] !== 0;
  }
  set(x: number, y: number, on = true): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data[y * this.width + x] = on ? 1 : 0;
  }
  clone(): Mask {
    return new Mask(this.width, this.height, this.data.slice());
  }
  count(): number {
    let n = 0;
    for (let i = 0; i < this.data.length; i++) if (this.data[i]) n++;
    return n;
  }
  /** Tight bounds of set pixels, or null when empty. */
  bounds(): Rect | null {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++)
        if (this.data[y * this.width + x]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  fillEllipse(cx: number, cy: number, rx: number, ry: number): void {
    forEachEllipsePixel(cx, cy, rx, ry, (x, y) => this.set(x, y));
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j);
  }
  union(other: Mask): void {
    for (let i = 0; i < this.data.length; i++) if (other.data[i]) this.data[i] = 1;
  }
  /** Pixels of this mask that have at least one 4-neighbour outside it. */
  edge(): Mask {
    const out = new Mask(this.width, this.height);
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++)
        if (this.get(x, y) && (!this.get(x - 1, y) || !this.get(x + 1, y) || !this.get(x, y - 1) || !this.get(x, y + 1))) out.set(x, y);
    return out;
  }
  /** Morphological erosion by one pixel (4-neighbourhood). */
  erode(): Mask {
    const out = new Mask(this.width, this.height);
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++)
        if (this.get(x, y) && this.get(x - 1, y) && this.get(x + 1, y) && this.get(x, y - 1) && this.get(x, y + 1)) out.set(x, y);
    return out;
  }
  dilate(): Mask {
    const out = new Mask(this.width, this.height);
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++)
        if (this.get(x, y) || this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) out.set(x, y);
    return out;
  }
}

/**
 * Integer ellipse rasterization by row scanning: for each row the exact
 * horizontal extent is computed, so edges are symmetric and have no stray
 * single pixels. Radii below 0.5 draw nothing; rx=ry=0.5 draws one pixel.
 */
export function forEachEllipsePixel(cx: number, cy: number, rx: number, ry: number, fn: (x: number, y: number) => void): void {
  assertFinite(cx, 'ellipse cx');
  assertFinite(cy, 'ellipse cy');
  if (rx <= 0 || ry <= 0) return;
  // Every row whose pixel CENTRE can lie inside the ellipse: from floor(cy - ry - 0.5) to ceil(cy + ry), each
  // tested below. (Starting at ceil(cy - ry) skipped a row whose centre was inside when cy - ry fell just past it.)
  const top = Math.floor(cy - ry - 0.5);
  const bottom = Math.ceil(cy + ry);
  for (let y = top; y <= bottom; y++) {
    const dy = (y + 0.5 - cy) / ry; // sample at the pixel centre
    const t = 1 - dy * dy;
    if (t < 0) continue;
    const half = rx * Math.sqrt(t);
    const x0 = Math.ceil(cx - half - 0.5);
    const x1 = Math.floor(cx + half - 0.5);
    for (let x = x0; x <= x1; x++) fn(x, y);
  }
}

export class PixelBuffer {
  readonly data: Uint32Array;
  constructor(
    readonly width: number,
    readonly height: number,
    data?: Uint32Array,
  ) {
    this.data = data ?? new Uint32Array(width * height);
  }
  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }
  get(x: number, y: number): Color {
    return this.inBounds(x, y) ? this.data[y * this.width + x] : TRANSPARENT;
  }
  set(x: number, y: number, c: Color): void {
    if (this.inBounds(x, y)) this.data[y * this.width + x] = c;
  }
  fill(c: Color): void {
    this.data.fill(c);
  }
  clone(): PixelBuffer {
    return new PixelBuffer(this.width, this.height, this.data.slice());
  }
  fillRect(x: number, y: number, w: number, h: number, c: Color): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + w);
    const y1 = Math.min(this.height, y + h);
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this.data[j * this.width + i] = c;
  }
  strokeRect(x: number, y: number, w: number, h: number, c: Color): void {
    this.hline(x, x + w - 1, y, c);
    this.hline(x, x + w - 1, y + h - 1, c);
    this.vline(x, y, y + h - 1, c);
    this.vline(x + w - 1, y, y + h - 1, c);
  }
  hline(x0: number, x1: number, y: number, c: Color): void {
    if (x1 < x0) [x0, x1] = [x1, x0];
    for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }
  vline(x: number, y0: number, y1: number, c: Color): void {
    if (y1 < y0) [y0, y1] = [y1, y0];
    for (let y = y0; y <= y1; y++) this.set(x, y, c);
  }
  /** Bresenham line, inclusive at both ends. */
  line(x0: number, y0: number, x1: number, y1: number, c: Color): void {
    x0 |= 0;
    y0 |= 0;
    x1 |= 0;
    y1 |= 0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  fillEllipse(cx: number, cy: number, rx: number, ry: number, c: Color): void {
    forEachEllipsePixel(cx, cy, rx, ry, (x, y) => this.set(x, y, c));
  }
  /** Paint every set pixel of a mask. */
  paintMask(mask: Mask, c: Color, ox = 0, oy = 0): void {
    for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) if (mask.data[y * mask.width + x]) this.set(x + ox, y + oy, c);
  }
  /** Paint a mask through a callback (for per-pixel shading). */
  paintMaskWith(mask: Mask, fn: (x: number, y: number) => Color | undefined, ox = 0, oy = 0): void {
    for (let y = 0; y < mask.height; y++)
      for (let x = 0; x < mask.width; x++)
        if (mask.data[y * mask.width + x]) {
          const c = fn(x, y);
          if (c !== undefined) this.set(x + ox, y + oy, c);
        }
  }
  /** Copy every opaque pixel of `src` with its top-left at (x, y). */
  blit(src: PixelBuffer, x: number, y: number): void {
    x |= 0;
    y |= 0;
    for (let j = 0; j < src.height; j++) {
      const ty = y + j;
      if (ty < 0 || ty >= this.height) continue;
      for (let i = 0; i < src.width; i++) {
        const tx = x + i;
        if (tx < 0 || tx >= this.width) continue;
        const c = src.data[j * src.width + i];
        if (alpha(c) !== 0) this.data[ty * this.width + tx] = c;
      }
    }
  }
  /** Mask of all opaque pixels. */
  opaqueMask(): Mask {
    const m = new Mask(this.width, this.height);
    for (let i = 0; i < this.data.length; i++) if (alpha(this.data[i]) !== 0) m.data[i] = 1;
    return m;
  }
  /** Paint `c` on opaque pixels that touch a transparent 4-neighbour (an inside outline). */
  outline(c: Color, mask = this.opaqueMask()): void {
    this.paintMask(mask.edge(), c);
  }
  /** Number of opaque pixels. */
  opaqueCount(): number {
    let n = 0;
    for (let i = 0; i < this.data.length; i++) if (alpha(this.data[i]) !== 0) n++;
    return n;
  }
  /** Tight bounds of opaque pixels. */
  bounds(): Rect | null {
    return this.opaqueMask().bounds();
  }
  /** Trim transparent margins; returns the new buffer and the offset of its origin in this one. */
  trimmed(): { buffer: PixelBuffer; dx: number; dy: number } {
    const b = this.bounds();
    if (!b) return { buffer: new PixelBuffer(1, 1), dx: 0, dy: 0 };
    const out = new PixelBuffer(b.w, b.h);
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) out.data[y * b.w + x] = this.data[(y + b.y) * this.width + (x + b.x)];
    return { buffer: out, dx: b.x, dy: b.y };
  }
  /** Nearest-neighbour upscale by an integer factor (for exports). */
  scaled(factor: number): PixelBuffer {
    const f = Math.max(1, factor | 0);
    const out = new PixelBuffer(this.width * f, this.height * f);
    for (let y = 0; y < out.height; y++) {
      const sy = (y / f) | 0;
      for (let x = 0; x < out.width; x++) out.data[y * out.width + x] = this.data[sy * this.width + ((x / f) | 0)];
    }
    return out;
  }
  /** Every pixel must be a finite packed integer; a NaN would become black silently. */
  validate(): void {
    for (let i = 0; i < this.data.length; i++) if (!Number.isFinite(this.data[i])) throw new Error(`invalid pixel at ${i}`);
  }
}

/** 50% checkerboard, for the rare controlled dither. */
export const checker = (x: number, y: number) => ((x + y) & 1) === 0;

/**
 * A finished procedural object: its pixels, where it stands on the ground
 * (the anchor, in sprite pixels), and the ground area it occupies.
 */
export interface Sprite {
  buffer: PixelBuffer;
  /** Ground contact point in sprite pixel coordinates; the compositor sorts by its world y. */
  anchorX: number;
  anchorY: number;
  /** Ground ellipse for the cast shadow and placement collision (centred on the anchor). */
  footRx: number;
  footRy: number;
  /** Rows above this sprite row may sway in the wind (a canopy over a trunk); absent: rigid. */
  swayRow?: number;
}
