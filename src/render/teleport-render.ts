/**
 * TELEPORT DRAWING: the Blobbi's dissolve and rebuild, its glow, the ground shadow and the travelling pixels, in
 * screen space from world positions, so every camera mode shows the same effect at its own scale.
 *
 * The sprite is the canonical one (same identity, same pose rules: only the lids close). The mask hides whole rows
 * above (departure) or not yet rebuilt (arrival); the line between is a dithered band of light. Particles are
 * square pixels whose size follows the native Blobbi's pixel size, a little smaller when far up in the sky; their
 * altitude is drawn as height on the screen, with a short trail behind them.
 */
import { PixelBuffer, type Sprite } from '../core/pixel';
import { hex, mix } from '../core/color';
import { SKY, type TeleportController } from '../game/teleport';

export const TELEPORT_COLOURS = { core: hex('#fffbe6'), mid: hex('#a8f0ff'), faint: hex('#7aa8ff') } as const;
const TONES = [TELEPORT_COLOURS.core, TELEPORT_COLOURS.mid, TELEPORT_COLOURS.faint];

/** A small integer hash for dithering (stable per pixel and per frame bucket). */
const hash = (x: number, y: number, k: number) => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * The Blobbi's sprite as the teleport shows it now: squashed a little while concentrating, only its visible
 * bottom part, a band of light along the cut, and a faint glow around it. Null when nothing of it shows.
 */
export function teleportSprite(sprite: Sprite, t: TeleportController, now: number): Sprite | null {
  const visible = t.visible(now);
  if (visible <= 0) return null;
  const src = sprite.buffer;
  const W = src.width;
  const H = src.height;
  // Squash: shorter and a touch wider, about the bottom centre (the anchor).
  const q = t.squash(now);
  let body = src;
  if (q > 0.01) {
    const sy = 1 - 0.09 * q;
    const sx = 1 + 0.05 * q;
    body = new PixelBuffer(W, H);
    for (let y = 0; y < H; y++) {
      const fy = Math.round(sprite.anchorY - (sprite.anchorY - y) / sy);
      if (fy < 0 || fy >= H) continue;
      for (let x = 0; x < W; x++) {
        const fx = Math.round(sprite.anchorX + (x - sprite.anchorX) / sx);
        if (fx < 0 || fx >= W) continue;
        body.data[y * W + x] = src.data[fy * W + fx];
      }
    }
  }
  // The opaque rows.
  let top = H;
  let bottom = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (body.data[y * W + x] >>> 24) {
        top = Math.min(top, y);
        bottom = y;
        break;
      }
  if (bottom < 0) return null;
  const rows = bottom - top + 1;
  const cut = visible >= 1 ? top : top + Math.round((1 - visible) * rows);
  const band = Math.max(1, Math.round(rows / 9));
  const frame = Math.floor(now * 12);
  // One pixel of room on each side for the glow.
  const out = new PixelBuffer(W + 2, H + 2);
  const opaque = (x: number, y: number) => x >= 0 && y >= cut && x < W && y < H && body.data[y * W + x] >>> 24 !== 0;
  for (let y = cut; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = body.data[y * W + x];
      if (!(c >>> 24)) continue;
      const d = y - cut; // rows below the cut
      let px = c;
      if (visible < 1 && d < band) px = mix(c, d === 0 || hash(x, y, frame) < 0.5 ? TELEPORT_COLOURS.core : TELEPORT_COLOURS.mid, d === 0 ? 0.85 : 0.5);
      out.data[(y + 1) * (W + 2) + x + 1] = px;
    }
  // Loose motes just above the cut: the edge crumbling (departure) or settling (arrival).
  if (visible < 1)
    for (let y = Math.max(top, cut - band * 2); y < cut; y++)
      for (let x = 0; x < W; x++) {
        if (!(body.data[y * W + x] >>> 24)) continue;
        if (hash(x, y, frame) < 0.22 * (1 - (cut - y) / (band * 2 + 1))) out.data[(y + 1) * (W + 2) + x + 1] = TELEPORT_COLOURS.core;
      }
  // The glow: a faint dithered rim around the visible body while anything is happening.
  if (t.state !== 'present') {
    const glow = t.state === 'departing' ? Math.min(1, t.squash(now) + (visible < 1 ? 1 : 0)) : 1;
    if (glow > 0.05)
      for (let y = -1; y <= H; y++)
        for (let x = -1; x <= W; x++) {
          if (opaque(x, y)) continue;
          if (!(opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1))) continue;
          if (hash(x, y, frame >> 1) < 0.55 * glow) out.data[(y + 1) * (W + 2) + x + 1] = TELEPORT_COLOURS.mid;
        }
  }
  return { ...sprite, buffer: out, anchorX: sprite.anchorX + 1, anchorY: sprite.anchorY + 1 };
}

/** The soft shadow on the ground under an arrival (and under a Blobbi about to leave), darkening by dither. */
export function drawTeleportShadow(screen: PixelBuffer, amount: number, cx: number, cy: number, rx: number): void {
  if (amount <= 0.02 || rx < 1) return;
  const r = rx * (0.35 + 0.65 * amount);
  const ry = Math.max(1, r * 0.38);
  const x0 = Math.floor(cx - r);
  const x1 = Math.ceil(cx + r);
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  const dark = hex('#101828');
  for (let y = Math.max(0, y0); y <= Math.min(screen.height - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(screen.width - 1, x1); x++) {
      const d = ((x - cx) / r) ** 2 + ((y - cy) / ry) ** 2;
      if (d > 1) continue;
      // Denser at the centre; never a solid black disc.
      const k = 0.42 * amount * (d < 0.5 ? 1 : 0.6);
      const i = y * screen.width + x;
      screen.data[i] = mix(screen.data[i], dark, k);
    }
}

/**
 * The travelling pixels. `ax`/`groundY` are the Blobbi's anchor on the screen, `s` screen pixels per world pixel,
 * A particle is one world pixel up close to the ground (crisp, like the island's own pixels), half that far up.
 */
export function drawTeleportParticles(screen: PixelBuffer, t: TeleportController, now: number, ax: number, groundY: number, s: number): number {
  const ps = t.particles(now);
  const square = (x: number, y: number, size: number, c: number) => screen.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size, c);
  let drawn = 0;
  // Altitude on the screen: a world pixel per world pixel when the sky fits in view; up close, compressed so the
  // whole climb (and the arriving cluster high above) stays on the screen.
  const zs = Math.max(0.5, Math.min(s, (groundY * 0.92) / SKY));
  ps.forEach((p, i) => {
    const x = ax + p.dx * s;
    // Far up the sky a pixel is smaller (distant); close to the ground it is full size.
    const near = 1 - Math.min(1, p.z / SKY);
    const size = Math.max(1, Math.round(s * (0.5 + 0.5 * near)));
    const unit = Math.max(1, Math.round(s / 2));
    // Fade by dither: a fading pixel skips frames rather than going translucent (crisp pixels only).
    if (p.alpha < 1 && hash(i, 7, Math.floor(now * 20)) > p.alpha) return;
    // The trail: fainter, smaller, every other point.
    p.trail.forEach((z, k) => {
      const ty = groundY - z * zs;
      if (Math.abs(ty - (groundY - p.z * zs)) < size) return;
      square(x, ty, Math.max(1, size - (k > 0 ? 1 : 0)), k === 0 ? TONES[Math.min(2, p.tone + 1)] : TELEPORT_COLOURS.faint);
    });
    const y = groundY - p.z * zs;
    // A blue halo: the glow of the bright ones, and contrast on light ground for every pixel when they are small.
    if (p.tone === 0 || s <= 2) square(x, y, size + 2 * Math.max(1, Math.floor(unit / 2)), TELEPORT_COLOURS.faint);
    square(x, y, size, TONES[p.tone]);
    drawn++;
  });
  return drawn;
}
