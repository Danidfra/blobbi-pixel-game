/**
 * TOUCH CONTROLS: a floating joystick and a big USE button, drawn in the game's own pixels.
 *
 * - Press anywhere on the world (not on a menu) and drag: a stick appears where the finger went down and the
 *   Blobbi walks that way, at the stick's angle. A short tap without a drag still walks to the tapped spot
 *   (the playground's tap-to-walk), so both styles work.
 * - The USE button (bottom right, above the menu bar) presses E. It appears once a touch has been seen, so a
 *   mouse-and-keyboard player never sees it.
 *
 * Sizes are in screen pixels derived from the UI scale, and the button keeps clear of the screen's safe-area
 * insets (passed in by the playground from CSS `env(safe-area-inset-*)`).
 */
import type { PixelBuffer } from '../core/pixel';
import { hex } from '../core/color';

/** Drag distance (screen px, at UI scale 1) before a press becomes a stick instead of a tap. */
export const DEAD_ZONE = 6;
/** Stick radius at UI scale 1. */
export const STICK_RADIUS = 22;

export interface StickState {
  id: number;
  ox: number;
  oy: number;
  x: number;
  y: number;
  /** Became a stick (moved past the dead zone). */
  active: boolean;
}

export interface Directions {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/** Directions from a stick vector (8-way, a 22.5° wedge each side of a diagonal). */
export function stickDirections(dx: number, dy: number, deadZone: number): Directions {
  const none = { up: false, down: false, left: false, right: false };
  const len = Math.hypot(dx, dy);
  if (len < deadZone) return none;
  const a = Math.atan2(dy, dx); // screen y down
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = Math.sin(Math.PI / 8); // 22.5°: within this of an axis, only that axis
  return { right: c > t, left: c < -t, down: s > t, up: s < -t };
}

export class TouchControls {
  stick: StickState | null = null;
  /** A touch has been seen: show the USE button. */
  enabled = false;
  /** Safe-area insets (screen px). */
  insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private button: { x: number; y: number; r: number } | null = null;

  constructor(private uiScale: () => number) {}

  /** A pointer went down on the world. Returns true when the USE button took it. */
  down(id: number, x: number, y: number, touch: boolean): 'use' | 'stick' | null {
    if (touch) this.enabled = true;
    const b = this.button;
    if (this.enabled && b && Math.hypot(x - b.x, y - b.y) <= b.r * 1.15) return 'use';
    if (!touch) return null;
    this.stick = { id, ox: x, oy: y, x, y, active: false };
    return 'stick';
  }

  move(id: number, x: number, y: number): void {
    const s = this.stick;
    if (!s || s.id !== id) return;
    s.x = x;
    s.y = y;
    if (!s.active && Math.hypot(x - s.ox, y - s.oy) >= DEAD_ZONE * this.uiScale()) s.active = true;
    // Past the rim the base follows the finger, so a long drag never gets stuck at the edge.
    const r = STICK_RADIUS * this.uiScale();
    const d = Math.hypot(x - s.ox, y - s.oy);
    if (d > r * 1.4) {
      s.ox = x - ((x - s.ox) / d) * r * 1.4;
      s.oy = y - ((y - s.oy) / d) * r * 1.4;
    }
  }

  /** The pointer lifted: returns whether it was a tap (never became a stick). */
  up(id: number): boolean {
    const s = this.stick;
    if (!s || s.id !== id) return false;
    this.stick = null;
    return !s.active;
  }

  directions(): Directions {
    const s = this.stick;
    if (!s || !s.active) return { up: false, down: false, left: false, right: false };
    return stickDirections(s.x - s.ox, s.y - s.oy, DEAD_ZONE * this.uiScale());
  }

  /** Draw the stick (while held) and the USE button (once touch is in use). */
  draw(screen: PixelBuffer, menuBarHeight: number): void {
    const u = this.uiScale();
    const ring = hex('#f4efe4');
    const dark = hex('#1b1f2a');
    const s = this.stick;
    if (s?.active) {
      const r = STICK_RADIUS * u;
      circle(screen, s.ox, s.oy, r, dark, true, 0.35);
      circle(screen, s.ox, s.oy, r, ring, false);
      const d = Math.hypot(s.x - s.ox, s.y - s.oy);
      const k = d > r ? r / d : 1;
      circle(screen, s.ox + (s.x - s.ox) * k, s.oy + (s.y - s.oy) * k, 8 * u, ring, true, 0.85);
    }
    if (!this.enabled) {
      this.button = null;
      return;
    }
    const r = 15 * u;
    const x = screen.width - this.insets.right - r - 6 * u;
    const y = screen.height - this.insets.bottom - menuBarHeight - r - 8 * u;
    this.button = { x, y, r };
    circle(screen, x, y, r, hex('#3b5a3a'), true, 0.9);
    circle(screen, x, y, r, hex('#4dffb0'), false);
    // "E": the tiny font scaled up to the button.
    const k = Math.max(1, Math.round(u * 2));
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 3; i++) if ((i === 0 || j === 0 || j === 2 || j === 4) && !(i > 0 && j === 2 && i === 2)) screen.fillRect(Math.round(x - 1.5 * k + i * k), Math.round(y - 2.5 * k + j * k), k, k, ring);
  }
}

/** A pixel circle: filled (blended towards `c` by `alpha`) or a 1-scale ring. */
function circle(screen: PixelBuffer, cx: number, cy: number, r: number, c: number, fill: boolean, alpha = 1): void {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(screen.width - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(screen.height - 1, Math.ceil(cy + r + 1));
  const cr = c & 0xff;
  const cg = (c >>> 8) & 0xff;
  const cb = (c >>> 16) & 0xff;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (fill ? d > r : Math.abs(d - r) > 1) continue;
      const i = y * screen.width + x;
      if (alpha >= 1) screen.data[i] = c;
      else {
        const o = screen.data[i];
        const r0 = o & 0xff;
        const g0 = (o >>> 8) & 0xff;
        const b0 = (o >>> 16) & 0xff;
        screen.data[i] = 0xff000000 | (Math.round(b0 + (cb - b0) * alpha) << 16) | (Math.round(g0 + (cg - g0) * alpha) << 8) | Math.round(r0 + (cr - r0) * alpha);
      }
    }
}
