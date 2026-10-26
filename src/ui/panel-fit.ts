/**
 * FITTING A FIXED-SIZE LAYOUT ON A SHORT SCREEN (P1.2A phase 2). Menu panels (304×184 UI pixels) and the title's
 * pages (320×180) are drawn at a whole scale, the largest that fits. On a phone held sideways the height runs out
 * first: a 640×360 phone, an iPhone with Safari's bars showing (about 844×340) or an iPhone SE in Safari (about
 * 667×325) used to drop from 2× to 1×, where the 3×5 capitals are 5 pixels tall and every button is about 10.
 *
 * Instead, when 2× fits the width and at least MIN_VISIBLE of its height, the layout stays at 2× and scrolls
 * vertically (by dragging, the wheel, or Page Up / Page Down). Only that one step is taken: larger scales and other
 * screens are fitted exactly as before, and a screen too narrow for 2× (568×320) still uses 1×.
 *
 * Pure: sizes in, a scale and a scroll range out; `PanelScroll` keeps the offset.
 */

/** The share of a 2× layout's height that must be visible for it to scroll instead of dropping to 1×. */
export const MIN_VISIBLE = 0.75;

export interface PanelFit {
  /** Screen pixels per UI pixel. */
  scale: number;
  /** Screen pixels of the layout below the visible area at the top scroll (0: it fits). */
  overflow: number;
}

/**
 * The scale for a `w`×`h` layout on a `sw`×`sh` screen with `margin` screen pixels kept free on each side, at most
 * `cap`: the largest whole scale that fits, or 2× scrolling where that would be 1×.
 */
export function fitPanel(sw: number, sh: number, w: number, h: number, cap: number, margin = 0): PanelFit {
  const roomW = sw - 2 * margin;
  const roomH = sh - 2 * margin;
  const scale = Math.max(1, Math.min(cap, Math.floor(Math.min(roomW / w, roomH / h))));
  if (scale === 1 && cap >= 2 && 2 * w <= roomW && roomH >= MIN_VISIBLE * 2 * h) return { scale: 2, overflow: 2 * h - roomH };
  return { scale, overflow: 0 };
}

/** The scroll offset (screen pixels) of one layout; kept in range as the layout or the screen changes. */
export class PanelScroll {
  y = 0;
  max = 0;
  /** Screen pixels a Page Up / Page Down moves: half the visible height. */
  page = 0;

  /** This frame's range (and the visible height): the offset is clamped into it. */
  range(overflow: number, visible: number): void {
    this.max = Math.max(0, overflow);
    this.page = Math.max(1, Math.round(visible / 2));
    this.y = Math.max(0, Math.min(this.max, this.y));
  }

  /** Scroll to an offset (clamped). */
  to(y: number): void {
    this.y = Math.max(0, Math.min(this.max, Math.round(y)));
  }

  /** Scroll by `dy` screen pixels; true when the layout can scroll at all. */
  by(dy: number): boolean {
    if (!this.max) return false;
    this.to(this.y + dy);
    return true;
  }

  /** Page Up / Page Down (Home is the HOME menu's key): true when used. */
  key(code: string, page: number): boolean {
    if (!this.max || (code !== 'PageDown' && code !== 'PageUp')) return false;
    this.to(this.y + (code === 'PageDown' ? page : -page));
    return true;
  }

  reset(): void {
    this.y = 0;
  }

  /**
   * Bring the span [top, bottom) (screen pixels where it would be unscrolled) into the view [viewTop, viewBottom),
   * moving as little as possible (a little margin past it); its top wins when it is taller than the view.
   */
  follow(top: number, bottom: number, viewTop: number, viewBottom: number, margin = 4): void {
    if (!this.max) return;
    let y = this.y;
    if (bottom - y > viewBottom) y = bottom - viewBottom + margin;
    if (top - y < viewTop) y = top - viewTop - margin;
    this.to(y);
  }
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * What a key just highlighted: of the marks drawn now that were not drawn the frame before (the selection moved, a
 * tab changed), the topmost, as a vertical span; null when nothing new is highlighted. Only the topmost: a selection
 * often lights up an action further down too (READ beside a journal entry), and following both would jump.
 */
export function newlyMarked(now: readonly Rect[], before: readonly Rect[]): { top: number; bottom: number } | null {
  const seen = new Set(before.map((r) => `${r.x},${r.y},${r.w},${r.h}`));
  const fresh = now.filter((r) => !seen.has(`${r.x},${r.y},${r.w},${r.h}`)).sort((a, b) => a.y - b.y);
  return fresh.length ? { top: fresh[0].y, bottom: fresh[0].y + fresh[0].h } : null;
}
