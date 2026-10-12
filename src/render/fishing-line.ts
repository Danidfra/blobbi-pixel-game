/**
 * THE FISHING LINE (M10): from the rod's tip to the float, the float's flight on the cast, and the float itself.
 * Shared by the view (at screen resolution, where the line leaves the natively drawn rod) and the classic world
 * renderer (in world pixels). The line hangs in a slight curve while slack and pulls straight on a bite.
 */
import type { PixelBuffer } from '../core/pixel';
import { hex, type Color } from '../core/color';
import { BITE_SECONDS, type LiveWorld } from '../sim/live-world';

export const LINE_COLOUR: Color = hex('#e8ecf4');
const FLOAT_TOP: Color = hex('#ff3b5c');
const FLOAT_BOTTOM: Color = hex('#ffffff');

/** Where the float sits on the water (the row just below it, in world pixels), or null when no line is out. */
export function floatAt(live: LiveWorld, time: number): { x: number; y: number; landed: boolean; bite: boolean } | null {
  const f = live.fishing;
  if (!f) return null;
  const k = live.castProgress(time) ?? 1;
  const bite = time >= f.biteAt && time <= f.biteAt + BITE_SECONDS;
  // Bobbing on the water; pulled under a little when a fish bites.
  const y = f.y + (bite ? 1 : Math.round(Math.sin(time * 3)));
  return { x: f.x, y, landed: k >= 1, bite };
}

/**
 * The float in flight: `k` 0..1 from the tip (sx, sy) to the water (ex, ey), on an arc `lift` high, all in the
 * buffer's own pixels.
 */
export function flight(sx: number, sy: number, ex: number, ey: number, k: number, lift: number): { x: number; y: number } {
  const e = 1 - (1 - k) * (1 - k); // fast off the rod, settling onto the water
  return { x: Math.round(sx + (ex - sx) * e), y: Math.round(sy + (ey - sy) * e - Math.sin(k * Math.PI) * lift) };
}

/** The line from the tip to the float's top; `sag` pixels of slack at its middle (0: taut). */
export function drawLine(buf: PixelBuffer, tx: number, ty: number, fx: number, fy: number, sag: number, colour = LINE_COLOUR): void {
  const steps = Math.max(1, Math.min(12, Math.round(Math.hypot(fx - tx, fy - ty) / 6)));
  let px = tx;
  let py = ty;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(tx + (fx - tx) * t);
    const y = Math.round(ty + (fy - ty) * t + Math.sin(t * Math.PI) * sag);
    buf.line(px, py, x, y, colour);
    px = x;
    py = y;
  }
}

/** The float: a red cap over a white body, each `px` square, standing on the row `y` (left edge `x`). */
export function drawFloat(buf: PixelBuffer, x: number, y: number, px: number): void {
  buf.fillRect(x, y - px, px, px, FLOAT_BOTTOM);
  buf.fillRect(x, y - 2 * px, px, px, FLOAT_TOP);
}
