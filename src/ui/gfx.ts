/**
 * UI DRAWING: immediate-mode pixel panels. A screen draws into a `Gfx` every frame, in UI pixels, and registers a hit
 * region for everything clickable; a pointer press runs the region under it. Since M11B the drawing goes to a
 * `UiSurface` at the screen's scale, so sentences use the readable body font at full resolution while panels, rims
 * and icons keep their pixel look; headings keep the chunky 3×5 capitals. Dark panels and light ink as the HUD, so
 * menus look like the rest of the game.
 */
import { hex, type Color } from '../core/color';
import type { PixelBuffer } from '../core/pixel';
import { upper } from '../i18n';
import { UiSurface, type TextStyle } from './surface';

export const UI = {
  bg: hex('#1b1f2a'),
  panel: hex('#232838'),
  slot: hex('#2c3246'),
  slotHi: hex('#3a4260'),
  line: hex('#4a5068'),
  ink: hex('#f4efe4'),
  muted: hex('#9aa3b5'),
  accent: hex('#ffe07a'),
  good: hex('#4dffb0'),
  bad: hex('#ff8a7a'),
  title: hex('#2b2340'),
};

export interface Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Runs on a press; gets the press point in panel pixels (for maps and the like). */
  action: (px: number, py: number) => void;
  /** A tooltip shown while the pointer rests on it. */
  tip?: string;
  /** Takes the press without acting (the panel's own background): no sound, nothing happens. */
  inert?: boolean;
}

/** UI pixels a string may take: the 3×5 font's width, which the body font never exceeds (a safe layout width). */
export const textWidth = (s: string): number => Math.max(0, [...s].length * 4 - 1);

/** Split text into lines of at most `chars` characters, on spaces. */
export function wrap(text: string, chars: number): string[] {
  return wrapBy(text, chars * 4 - 1, textWidth);
}

/** Split text into lines no wider than `maxW` as measured by `width`, on spaces (a long word is cut). */
export function wrapBy(text: string, maxW: number, width: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if (width(line + ' ' + word) <= maxW) line += ' ' + word;
      else {
        out.push(line);
        line = word;
      }
      while (width(line) > maxW && [...line].length > 1) {
        const chars = [...line];
        let n = chars.length - 1;
        while (n > 1 && width(chars.slice(0, n).join('')) > maxW) n--;
        out.push(chars.slice(0, n).join(''));
        line = chars.slice(n).join('');
      }
    }
    out.push(line);
  }
  return out;
}

export class Gfx {
  readonly buf: UiSurface;
  readonly hits: Hit[] = [];
  /** Where the pointer is (panel pixels), for hover highlights; null without a pointer. */
  hover: { x: number; y: number } | null = null;

  /** Whether the pointer is over a rectangle. */
  hovered(x: number, y: number, w: number, h: number): boolean {
    const p = this.hover;
    return !!p && p.x >= x && p.y >= y && p.x < x + w && p.y < y + h;
  }
  constructor(w: number, h: number, scale = 1) {
    this.buf = new UiSurface(w, h, scale);
  }

  /** The finished drawing at screen resolution. */
  get out(): PixelBuffer {
    return this.buf.out;
  }

  /** The hit regions in screen pixels, for a drawing placed at (ox, oy) on the screen. */
  screenHits(ox: number, oy: number): Hit[] {
    const b = this.buf;
    return this.hits.map((h) => ({ ...h, x: ox + b.sx(h.x), y: oy + b.sx(h.y), w: b.sx(h.x + h.w) - b.sx(h.x), h: b.sx(h.y + h.h) - b.sx(h.y) }));
  }

  box(x: number, y: number, w: number, h: number, bg: Color = UI.panel, border: Color | null = UI.line): void {
    this.buf.fillRect(x, y, w, h, bg);
    if (border !== null) this.buf.strokeRect(x, y, w, h, border);
  }

  /** One line of text (the body font, as written); returns the width drawn. `shadow` darkens beneath it (text on scenes). */
  text(t: string, x: number, y: number, c: Color = UI.ink, style: TextStyle = 'body', shadow?: Color): number {
    return this.buf.text(t, x, y, c, style, shadow);
  }

  /** A heading: the 3×5 capitals. */
  heading(t: string, x: number, y: number, c: Color = UI.accent, shadow?: Color): number {
    return this.buf.text(upper(t), x, y, c, 'title', shadow);
  }

  /** Width of a text as drawn (UI pixels). */
  measure(t: string, style: TextStyle = 'body'): number {
    return this.buf.measure(t, style);
  }

  /** Wrapped lines of a text that fit `maxW` as drawn. */
  lines(t: string, maxW: number): string[] {
    return wrapBy(t, maxW, (s) => this.buf.measure(s));
  }

  /** Wrapped text; returns the height used. */
  para(t: string, x: number, y: number, maxW: number, c: Color = UI.ink, maxLines = 99, shadow?: Color): number {
    const lines = this.lines(t, maxW).slice(0, maxLines);
    lines.forEach((l, i) => this.text(l, x, y + i * 7, c, 'body', shadow));
    return lines.length * 7;
  }

  hit(x: number, y: number, w: number, h: number, action: (px: number, py: number) => void, tip?: string): void {
    this.hits.push({ x, y, w, h, action, ...(tip ? { tip } : {}) });
  }

  /**
   * A button; returns its width. Disabled buttons draw muted and never run `action`; a press on one runs
   * `whyNot` when given (so the player is told why), and otherwise does nothing.
   */
  button(label: string, x: number, y: number, action: () => void, opts: { enabled?: boolean; primary?: boolean; w?: number; whyNot?: () => void; case?: 'upper' | 'as-is' } = {}): number {
    const enabled = opts.enabled ?? true;
    const w = opts.w ?? textWidth(label) + 8;
    const hover = enabled && this.hovered(x, y, w, 11);
    this.box(x, y, w, 11, opts.primary && enabled ? hex('#3b5a3a') : hover ? UI.slotHi : UI.slot, enabled ? (opts.primary ? UI.good : hover ? UI.muted : UI.line) : UI.slot);
    const text = opts.case === 'as-is' ? label : upper(label);
    this.text(text, x + Math.max(1, Math.round((w - this.measure(text)) / 2)), y + 3, enabled ? UI.ink : UI.line);
    if (enabled) this.hit(x, y, w, 11, action);
    else if (opts.whyNot) this.hit(x, y, w, 11, opts.whyNot);
    return w;
  }

  /** An item slot: icon centred, quantity bottom-right (yellow when the stack is full), marks for state. */
  slot(x: number, y: number, size: number, icon: PixelBuffer | null, qty: number, opts: { selected?: boolean; equipped?: boolean; full?: boolean; dim?: boolean } = {}): void {
    const hover = this.hovered(x, y, size, size);
    this.box(x, y, size, size, opts.selected || hover ? UI.slotHi : UI.slot, opts.selected ? UI.accent : hover ? UI.muted : UI.line);
    if (icon) {
      const ix = x + Math.floor((size - icon.width) / 2);
      const iy = y + Math.floor((size - icon.height) / 2) - (qty > 1 ? 1 : 0);
      if (opts.dim) {
        for (let j = 0; j < icon.height; j++) for (let i = 0; i < icon.width; i++) if (icon.get(i, j) >>> 24) this.buf.set(ix + i, iy + j, UI.line);
      } else this.buf.blit(icon, ix, iy);
    }
    if (qty > 1) {
      const t = String(qty);
      const tw = this.measure(t);
      this.buf.fillRect(x + size - tw - 3, y + size - 7, tw + 2, 6, UI.bg);
      this.text(t, x + size - tw - 2, y + size - 6, opts.full ? UI.accent : UI.ink);
    }
    if (opts.equipped) {
      // A small yellow corner: in hand.
      this.buf.hline(x + 1, x + 4, y + 1, UI.accent);
      this.buf.vline(x + 1, y + 1, y + 4, UI.accent);
    }
  }

  /** A horizontal bar 0..1. */
  bar(x: number, y: number, w: number, value: number, colour: Color): void {
    this.buf.strokeRect(x, y, w, 5, UI.line);
    const fill = Math.round((w - 2) * Math.max(0, Math.min(1, value)));
    if (fill > 0) this.buf.fillRect(x + 1, y + 1, fill, 3, colour);
  }
}
