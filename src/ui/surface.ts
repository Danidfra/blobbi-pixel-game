/**
 * A UI SURFACE (M11B): drawing in UI pixels, stored at screen resolution. Panels, the title and HUD cards keep their
 * layouts in UI pixels (a 304×184 panel is still 304×184), but every shape is drawn straight at the screen scale and
 * text gets the screen's full resolution: the body font, magnified by whole pixels, where a UI pixel is big enough
 * for it, else the 3×5 capitals (as before M11B). Boxes, rims and pictures look exactly as when a small buffer was
 * scaled up.
 *
 * Two text styles: 'body' (sentences, labels, lists: the readable body font, as written) and 'title' (headings: the
 * chunky 3×5 capitals, upper-cased). Layout widths stay conservative (`textWidth`: 4 UI pixels a character), and the
 * body font is never wider than that, so nothing written for the 3×5 font can overflow.
 */
import type { Color } from '../core/color';
import { PixelBuffer } from '../core/pixel';
import { drawTinyText } from '../render/live-render';
import { BODY_LARGE, BODY_SMALL, type PixelFont } from './fonts/body-font';
import { upper } from '../i18n';

export type TextStyle = 'body' | 'title';

/** A body font at a whole magnification. */
export interface BodyChoice {
  font: PixelFont;
  m: number;
}

/** Every body font size there is, smallest first (font × magnification). */
const LADDER: readonly BodyChoice[] = [1, 2, 3, 4]
  .flatMap((m) => [{ font: BODY_SMALL, m }, { font: BODY_LARGE, m }])
  .sort((a, b) => a.font.spec.capRows * a.m - b.font.spec.capRows * b.m);

/**
 * The body text for a scale: the largest size whose line (accents to descenders) fits the 7-UI-pixel line pitch the
 * layouts use (one pixel of overlap allowed: only an accent over a capital could touch a descender) and whose widest
 * letter fits the 4 UI pixels a character is given. `smaller` steps one size down (the "small" text size). Null where
 * no size fits: there the 3×5 capitals are used.
 */
export function bodyChoice(scale: number, smaller = false): BodyChoice | null {
  const fits = LADDER.filter((c) => c.font.cellRows * c.m <= 7 * scale + 1 && c.font.maxAdvance * c.m <= 4 * scale);
  if (!fits.length) return null;
  return fits[Math.max(0, fits.length - 1 - (smaller ? 1 : 0))];
}

/** The current text size preference for drawing (set by the host from the settings; presentation only). */
export const textPreference = { smaller: false };

export class UiSurface {
  readonly out: PixelBuffer;

  /** The body font used on this surface (null: the 3×5 capitals). */
  readonly body: BodyChoice | null;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly scale: number,
  ) {
    this.out = new PixelBuffer(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    this.body = bodyChoice(scale, textPreference.smaller);
  }

  /** Opaque pixels drawn so far (tests). */
  opaqueCount(): number {
    return this.out.opaqueCount();
  }

  /** A UI coordinate in screen pixels. */
  sx(v: number): number {
    return Math.round(v * this.scale);
  }

  fillRect(x: number, y: number, w: number, h: number, c: Color): void {
    const x0 = this.sx(x);
    const y0 = this.sx(y);
    this.out.fillRect(x0, y0, this.sx(x + w) - x0, this.sx(y + h) - y0, c);
  }

  strokeRect(x: number, y: number, w: number, h: number, c: Color): void {
    this.fillRect(x, y, w, 1, c);
    this.fillRect(x, y + h - 1, w, 1, c);
    this.fillRect(x, y + 1, 1, h - 2, c);
    this.fillRect(x + w - 1, y + 1, 1, h - 2, c);
  }

  set(x: number, y: number, c: Color): void {
    this.fillRect(x, y, 1, 1, c);
  }

  hline(x0: number, x1: number, y: number, c: Color): void {
    this.fillRect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, c);
  }

  vline(x: number, y0: number, y1: number, c: Color): void {
    this.fillRect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, c);
  }

  /** A picture in UI pixels, magnified to the screen (nearest neighbour; transparent pixels skipped). */
  blit(src: PixelBuffer, x: number, y: number): void {
    const s = this.scale;
    if (Number.isInteger(s)) {
      this.out.blit(s === 1 ? src : src.scaled(s), Math.round(x * s), Math.round(y * s));
      return;
    }
    const x0 = this.sx(x);
    const y0 = this.sx(y);
    const x1 = this.sx(x + src.width);
    const y1 = this.sx(y + src.height);
    const o = this.out;
    for (let ty = Math.max(0, y0); ty < Math.min(o.height, y1); ty++) {
      const sy = Math.min(src.height - 1, Math.floor((ty - y0 + 0.5) / s));
      for (let tx = Math.max(0, x0); tx < Math.min(o.width, x1); tx++) {
        const c = src.data[sy * src.width + Math.min(src.width - 1, Math.floor((tx - x0 + 0.5) / s))];
        if (c >>> 24 !== 0) o.data[ty * o.width + tx] = c;
      }
    }
  }

  /** Width a text takes, in UI pixels, as it will be drawn. */
  measure(text: string, style: TextStyle = 'body'): number {
    const b = style === 'body' ? this.body : null;
    if (!b) return Math.max(0, [...text].length * 4 - 1);
    return Math.ceil((b.font.width(text) * b.m) / this.scale);
  }

  /**
   * Text whose 3×5 cell (in UI pixels) starts at (x, y): the body font is centred on that cell, so layouts made for the
   * 3×5 font stay aligned. Returns the width drawn, in UI pixels.
   */
  text(text: string, x: number, y: number, c: Color, style: TextStyle = 'body', shadow?: Color): number {
    if (shadow !== undefined) {
      // A dark copy one font pixel down and right first: text over the island scene stays readable.
      const k = style === 'body' && this.body ? this.body.m : Math.max(1, Math.floor(this.scale));
      this.paint(text, x, y, shadow, style, k);
    }
    return this.paint(text, x, y, c, style, 0);
  }

  private paint(text: string, x: number, y: number, c: Color, style: TextStyle, offset: number): number {
    const b = style === 'body' ? this.body : null;
    if (!b) {
      // The 3×5 capitals, each font pixel a whole number of screen pixels, centred on the UI cell.
      const k = Math.max(1, Math.floor(this.scale));
      const t = upper(text);
      const n = [...t].length;
      if (!n) return 0;
      const glyphs = new PixelBuffer(n * 4, 9);
      drawTinyText(glyphs, t, 0, 2, c);
      const big = k === 1 ? glyphs : glyphs.scaled(k);
      const cy = this.scale * (y + 2.5);
      this.out.blit(big, this.sx(x) + offset, Math.round(cy - 4.5 * k) + offset);
      return Math.max(0, n * 4 - 1);
    }
    const top = Math.round(this.scale * (y + 2.5) - (b.font.spec.capRows / 2) * b.m);
    b.font.draw(this.out, text, this.sx(x) + offset, top + offset, c, b.m);
    return Math.ceil((b.font.width(text) * b.m) / this.scale);
  }
}
