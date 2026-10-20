/**
 * THE OTHER WORLDS' ICONS in the World Travel menu: each app's own icon (a PNG on this origin, public/icons/worlds/),
 * decoded once through an image element and a canvas, reduced to the card's size by averaging whole areas (never
 * sampled: a 192 px icon at 36 px keeps its colours), and kept. While it loads, or when it cannot be had (an old
 * build, a blocked image, a test without a page), the card draws its own emblem instead; nothing waits for it.
 */
import { PixelBuffer } from '../core/pixel';
import { rgba } from '../core/color';

export type IconLoader = (src: string) => Promise<PixelBuffer>;

/** Decode an image on this origin into pixels (the page's canvas; rejects where there is none). */
export const loadImageBuffer: IconLoader = (src) =>
  new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') return reject(new Error('no page'));
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('no canvas'));
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // The same byte order (R, G, B, A, little-endian words) as PixelBuffer's packed colours.
        resolve(new PixelBuffer(canvas.width, canvas.height, new Uint32Array(data.data.buffer.slice(0))));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });

/** A square image reduced to `size` by area averaging (box filter); a source no larger than `size` is copied. */
export function downscale(src: PixelBuffer, size: number): PixelBuffer {
  const out = new PixelBuffer(size, size);
  const fx = src.width / size;
  const fy = src.height / size;
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1 && sy < src.height; sy++)
        for (let sx = x0; sx < x1 && sx < src.width; sx++) {
          const c = src.data[sy * src.width + sx];
          const ca = (c >>> 24) & 255;
          // Weighted by alpha, so a transparent corner never darkens its neighbours
          r += (c & 255) * ca;
          g += ((c >>> 8) & 255) * ca;
          b += ((c >>> 16) & 255) * ca;
          a += ca;
          n++;
        }
      if (!n || !a) continue;
      out.set(x, y, rgba(Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / n)));
    }
  }
  return out;
}

export class WorldIcons {
  private sources = new Map<string, PixelBuffer | 'loading' | 'failed'>();
  private sized = new Map<string, PixelBuffer>();
  /** Something changed (an icon arrived): the menu may redraw. */
  onChange: (() => void) | null = null;

  constructor(private readonly load: IconLoader = loadImageBuffer) {}

  /** The icon at `size`, or null while it loads or when it cannot be had (loading starts on the first ask). */
  get(src: string, size: number): PixelBuffer | null {
    const have = this.sources.get(src);
    if (have === undefined) {
      this.sources.set(src, 'loading');
      this.load(src).then(
        (buf) => {
          this.sources.set(src, buf);
          this.onChange?.();
        },
        () => this.sources.set(src, 'failed'),
      );
      return null;
    }
    if (have === 'loading' || have === 'failed') return null;
    const key = `${src}@${size}`;
    let out = this.sized.get(key);
    if (!out) {
      out = have.width === size && have.height === size ? have : downscale(have, size);
      this.sized.set(key, out);
    }
    return out;
  }

  /** The icon could not be loaded (the emblem stays). */
  failed(src: string): boolean {
    return this.sources.get(src) === 'failed';
  }
}
