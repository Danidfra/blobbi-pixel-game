/**
 * THE LIVE RENDERER. Four layers, each paid for once:
 *  - STATIC: terrain and the ground shadows of placed objects, painted once
 *    per world into a buffer and copied into the frame by rows.
 *  - ANIMATED ENVIRONMENT: foam dashes and wave strokes, repainted every
 *    frame from precomputed lists (a few thousand pixels, not the map).
 *  - DYNAMIC: objects (with wind sway), the Blobbi, planted trees and
 *    particles, in painter's order by ground y.
 *  - DEBUG: the collision mask and footprints, when asked.
 * The frame is a viewport-sized PixelBuffer; the page blits it at a zoom.
 */
import { PixelBuffer, type Sprite } from '../core/pixel';
import { hash32 } from '../core/rng';
import { type Color, hex } from '../core/color';
import { paletteFor } from '../world/generate';
import { paintTerrain } from './paint-terrain';
import { turtleUnderlay, turtleBodyForWorld } from './compose';
import { windAt } from '../sim/live-world';
import { T, type Layer, type Placement } from '../world/types';
import type { LiveWorld } from '../sim/live-world';

export interface LiveRenderOptions {
  vegetation: boolean;
  structures: boolean;
  details: boolean;
  shadows: boolean;
  debugCollision: boolean;
  /** Draw the brain's path, target and nav grid. */
  debugPath: boolean;
  animateWater: boolean;
  animateWind: boolean;
}

export const DEFAULT_LIVE_OPTIONS: LiveRenderOptions = { vegetation: true, structures: true, details: true, shadows: true, debugCollision: false, debugPath: false, animateWater: true, animateWind: true };

export interface FrameTimings {
  copy: number;
  water: number;
  objects: number;
  particles: number;
  total: number;
  drawn: number;
}

interface WaveStroke {
  x: number;
  y: number;
  len: number;
  cls: number;
  curl: 1 | -1;
  speed: number;
}

interface Drawable {
  y: number;
  x: number;
  sprite: Sprite;
  sway: number;
  dy: number;
}

export class Camera {
  x = 0;
  y = 0;
  /** Smoothly follow a target; clamps to the world, centres when the world is smaller than the view. */
  follow(tx: number, ty: number, viewW: number, viewH: number, worldW: number, worldH: number, dt: number, snap = false): void {
    const wantX = tx - viewW / 2;
    const wantY = ty - viewH / 2;
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    this.x += (wantX - this.x) * k;
    this.y += (wantY - this.y) * k;
    if (worldW <= viewW) this.x = (worldW - viewW) / 2;
    else this.x = Math.max(0, Math.min(worldW - viewW, this.x));
    if (worldH <= viewH) this.y = (worldH - viewH) / 2;
    else this.y = Math.max(0, Math.min(worldH - viewH, this.y));
  }
}

export class LiveRenderer {
  readonly staticLayer: PixelBuffer;
  private frame: PixelBuffer = new PixelBuffer(1, 1);
  private readonly foam: Int32Array;
  private readonly waves: WaveStroke[] = [];
  private readonly sorted: { index: number; p: Placement }[];
  readonly timings: FrameTimings = { copy: 0, water: 0, objects: 0, particles: 0, total: 0, drawn: 0 };
  private readonly background = hex('#0d1016');

  constructor(readonly live: LiveWorld) {
    const world = live.world;
    const palette = paletteFor(world.options.palette);
    const { width, height, cls } = world.terrain;
    this.staticLayer = new PixelBuffer(width, height);
    paintTerrain(this.staticLayer, world.terrain, palette, world.seed, { animatedWater: true, underlay: turtleUnderlay(world, { head: false, flippers: false }) });
    // Static shadows of placed objects.
    for (const p of world.objects) {
      const s = live.spriteOf(p);
      if (s.footRx > 0) this.paintShadow(this.staticLayer, p.x, p.y, s.footRx, s.footRy, 0, 0);
    }
    for (const b of world.bridges) {
      const half = Math.floor(b.width / 2);
      if (b.axis === 'h') for (let x = b.x0; x <= b.x1; x++) for (let y = b.y0 + half + 1; y <= b.y0 + half + 2; y++) if (cls[y * width + x] < T.GRASS_EDGE) this.staticLayer.set(x, y, palette.shadowOnWater);
      else for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0 + half + 1; x <= b.x0 + half + 2; x++) if (cls[y * width + x] < T.GRASS_EDGE) this.staticLayer.set(x, y, palette.shadowOnWater);
    }
    // Bridges are flat on the ground: bake them into the static layer too.
    for (const b of world.bridges) {
      const half = Math.floor(b.width / 2);
      const length = b.axis === 'h' ? b.x1 - b.x0 + 1 : b.y1 - b.y0 + 1;
      const sprite = live.spriteOf({ kind: 'bridge', layer: 'structures', seed: `${world.seed}/bridge/${b.id}`, size: length, x: 0, y: 0, island: -1, variation: { axis: b.axis, length, width: b.width } });
      if (b.axis === 'h') this.staticLayer.blit(sprite.buffer, b.x0, b.y0 - half - sprite.anchorY);
      else this.staticLayer.blit(sprite.buffer, b.x0 - half - 1, b.y0);
    }
    for (const p of world.piers) {
      const half = Math.floor(p.width / 2);
      const length = Math.abs(p.axis === 'h' ? p.x1 - p.x0 : p.y1 - p.y0) + 1;
      const sprite = live.spriteOf({ kind: 'bridge', layer: 'structures', seed: `${world.seed}/pier`, size: length, x: 0, y: 0, island: -1, variation: { axis: p.axis, length, width: p.width, pier: true } });
      if (p.axis === 'h') this.staticLayer.blit(sprite.buffer, Math.min(p.x0, p.x1), p.y0 - half - sprite.anchorY);
      else this.staticLayer.blit(sprite.buffer, p.x0 - half - 1, Math.min(p.y0, p.y1));
    }
    // Foam pixels and wave strokes, precomputed once.
    const foam: number[] = [];
    for (let i = 0; i < cls.length; i++) if (cls[i] === T.FOAM) foam.push(i);
    this.foam = Int32Array.from(foam);
    const salt = hash32(`${world.seed}/waves`);
    for (let cy = 0; cy < height; cy += 4)
      for (let cx = 0; cx < width; cx += 8) {
        const h = hash32(`${salt}:${cx >> 3}:${cy >> 2}`);
        if ((h & 0xff) > 60) continue;
        const x = cx + ((h >>> 8) & 7);
        const y = cy + ((h >>> 11) & 3);
        if (x >= width - 6 || y >= height - 2 || y < 2) continue;
        const c = cls[y * width + x];
        if (c !== T.WATER && c !== T.DEEP && c !== T.SHALLOW) continue;
        this.waves.push({ x, y, len: 3 + ((h >>> 14) & 1) * 2, cls: c, curl: ((h >>> 15) & 1) === 1 ? 1 : -1, speed: 2.5 + ((h >>> 16) & 3) * 0.8 });
      }
    this.sorted = world.objects.map((p, index) => ({ index, p })).sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x);
  }

  private paintShadow(buf: PixelBuffer, px: number, py: number, rx: number, ry: number, ox: number, oy: number): void {
    const world = this.live.world;
    const palette = paletteFor(world.options.palette);
    const { width, cls } = world.terrain;
    const cx = px + 1;
    const cy = py + 1;
    const rrx = rx + 1;
    const rry = Math.max(1, ry);
    for (let y = Math.floor(cy - rry); y <= Math.ceil(cy + rry); y++)
      for (let x = Math.floor(cx - rrx); x <= Math.ceil(cx + rrx); x++) {
        if (x < 0 || y < 0 || x >= width || y >= world.terrain.height) continue;
        const u = (x + 0.5 - cx) / rrx;
        const v = (y + 0.5 - cy) / rry;
        if (u * u + v * v > 1) continue;
        const c = cls[y * width + x];
        const color = c === T.SAND || c === T.SAND_WET || c === T.PATH ? palette.shadowOnSand : c >= T.GRASS_EDGE ? palette.shadowOnGrass : palette.shadowOnWater;
        buf.set(x - ox, y - oy, color);
      }
  }

  /** Render the viewport (viewW × viewH world pixels) whose top-left is the camera position. */
  render(viewW: number, viewH: number, camX: number, camY: number, time: number, o: LiveRenderOptions): PixelBuffer {
    const t0 = performance.now();
    const world = this.live.world;
    const palette = paletteFor(world.options.palette);
    const { width, height, cls } = world.terrain;
    if (this.frame.width !== viewW || this.frame.height !== viewH) this.frame = new PixelBuffer(viewW, viewH);
    const frame = this.frame;
    const ox = Math.round(camX);
    const oy = Math.round(camY);

    // ── Static copy, row by row ───────────────────────────────────────────
    frame.fill(this.background);
    const x0 = Math.max(0, ox);
    const x1 = Math.min(width, ox + viewW);
    const y0 = Math.max(0, oy);
    const y1 = Math.min(height, oy + viewH);
    if (x1 > x0)
      for (let y = y0; y < y1; y++) {
        const src = this.staticLayer.data.subarray(y * width + x0, y * width + x1);
        frame.data.set(src, (y - oy) * viewW + (x0 - ox));
      }
    const t1 = performance.now();

    // ── Animated water ────────────────────────────────────────────────────
    if (o.animateWater) {
      const phase = Math.floor(time * 2.5);
      for (let k = 0; k < this.foam.length; k++) {
        const i = this.foam[k];
        const y = (i / width) | 0;
        const x = i - y * width;
        if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
        frame.data[(y - oy) * viewW + (x - ox)] = (x + y * 2 + phase) % 5 < 3 ? palette.foam : palette.shallow.light;
      }
      for (const w of this.waves) {
        const drift = Math.floor(time * w.speed) % 10;
        const x = w.x + drift - 5;
        const y = w.y;
        if (x + w.len < x0 || x > x1 || y < y0 || y >= y1) continue;
        // Only over water of its own class, so a stroke never crosses onto sand.
        let ok = true;
        for (let i = -1; i <= w.len; i++) {
          const xx = x + i;
          if (xx < 0 || xx >= width || cls[y * width + xx] !== w.cls) ok = false;
        }
        if (!ok) continue;
        const light = w.cls === T.SHALLOW ? palette.shallow.light : w.cls === T.DEEP ? palette.water.mid : palette.water.light;
        frame.hline(x - ox, x + w.len - 1 - ox, y - oy, light);
        frame.set((w.curl > 0 ? x + w.len : x - 1) - ox, y + 1 - oy, light);
      }
    }
    const t2 = performance.now();

    // ── The turtle's living parts: flippers paddling, the head bobbing, blinking and glancing ──
    if (world.turtle) this.drawTurtle(frame, ox, oy, time, o.animateWind);

    // ── Ground particles (leaves on the ground, sparkles) ─────────────────
    this.live.particles.draw(frame, ox, oy, false);

    // ── Dynamic: objects, planted trees, the Blobbi ───────────────────────
    const live = this.live;
    const enabled = (layer: Layer) => (layer === 'vegetation' ? o.vegetation : layer === 'structures' ? o.structures : o.details);
    const drawables: Drawable[] = [];
    const margin = 48;
    for (const { index, p } of this.sorted) {
      if (!enabled(p.layer)) continue;
      if (p.x < ox - margin || p.x > ox + viewW + margin || p.y < oy - margin || p.y > oy + viewH + margin) continue;
      const sprite = live.spriteOf(p);
      const sway = o.animateWind && sprite.swayRow !== undefined ? live.swayOf(index, p.x, p.kind, time) : 0;
      drawables.push({ y: p.y, x: p.x, sprite, sway, dy: 0 });
    }
    live.planted.forEach((t, k) => {
      const p = t.placement;
      const growth = live.growthOf(t);
      const sprite = live.spriteOf(p, growth);
      if (o.shadows) this.paintShadow(frame, p.x, p.y, sprite.footRx, sprite.footRy, ox, oy);
      const sway = o.animateWind && sprite.swayRow !== undefined ? live.swayOf(world.objects.length + k, p.x, 'tree', time) : 0;
      drawables.push({ y: p.y, x: p.x, sprite, sway, dy: 0 });
    });
    // The Blobbi.
    const b = live.blobbi;
    const pose = b.animator.pose(time);
    const bs = live.blobbiSprite(pose);
    const bx = Math.round(b.x);
    const by = Math.round(b.y);
    if (o.shadows) this.paintShadow(frame, bx, by - 1, b.footRx, 2, ox, oy);
    drawables.push({ y: by, x: bx, sprite: bs, sway: 0, dy: b.animator.hop(time) });
    drawables.sort((a, c) => a.y - c.y || a.x - c.x);
    for (const d of drawables) this.blitSway(frame, d.sprite, d.x - d.sprite.anchorX - ox, d.y - d.sprite.anchorY - oy + d.dy, d.sway);
    this.timings.drawn = drawables.length;
    const t3 = performance.now();

    // ── Front particles and the speech bubble ─────────────────────────────
    live.particles.draw(frame, ox, oy, true);
    if (live.bubble) this.drawBubble(frame, live.bubble.text, live.bubble.x - ox, live.bubble.y - oy);
    const t4 = performance.now();

    // ── Debug overlay ─────────────────────────────────────────────────────
    if (o.debugCollision) {
      const red = hex('#ff3b5c');
      const blocked = live.collision.blocked;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++)
          if (blocked[y * width + x] && ((x + y) & 1) === 0) frame.data[(y - oy) * viewW + (x - ox)] = red;
      const yellow = hex('#ffe44d');
      const n = 24;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        frame.set(Math.round(b.x + Math.cos(a) * b.footRx) - ox, Math.round(b.y + Math.sin(a) * b.footRy) - oy, yellow);
      }
      const target = live.facingObject();
      if (target) frame.strokeRect(target.placement.x - target.sprite.footRx - 1 - ox, target.placement.y - target.sprite.footRy - 1 - oy, target.sprite.footRx * 2 + 3, target.sprite.footRy * 2 + 3, hex('#4dffb0'));
    }
    if (o.debugPath) {
      const brain = live.brain;
      const cyan = hex('#4de3ff');
      const magenta = hex('#ff4dd2');
      // Free nav cells as faint dots, the planned path as a line, the target as a cross.
      for (let r = 0; r < live.nav.rows; r++)
        for (let c = 0; c < live.nav.cols; c++) {
          if (!live.nav.isFree(c, r)) continue;
          const p = live.nav.centre(c, r);
          if (p.x < ox || p.y < oy || p.x >= ox + viewW || p.y >= oy + viewH) continue;
          if (((c + r) & 3) === 0) frame.set(Math.floor(p.x) - ox, Math.floor(p.y) - oy, hex('#2fbf7a'));
        }
      for (let i = 0; i + 1 < brain.path.length; i++) frame.line(Math.round(brain.path[i].x) - ox, Math.round(brain.path[i].y) - oy, Math.round(brain.path[i + 1].x) - ox, Math.round(brain.path[i + 1].y) - oy, cyan);
      if (brain.target) {
        const tx = Math.round(brain.target.x) - ox;
        const ty = Math.round(brain.target.y) - oy;
        frame.hline(tx - 3, tx + 3, ty, magenta);
        frame.vline(tx, ty - 3, ty + 3, magenta);
      }
    }
    const t5 = performance.now();
    this.timings.copy = t1 - t0;
    this.timings.water = t2 - t1;
    this.timings.objects = t3 - t2;
    this.timings.particles = t4 - t3;
    this.timings.total = t5 - t0;
    return frame;
  }

  /** The animated turtle parts over the static layer (which holds water under them). */
  private drawTurtle(frame: PixelBuffer, ox: number, oy: number, time: number, animate: boolean): void {
    const world = this.live.world;
    const body = turtleBodyForWorld(world);
    const ta = this.live.turtleAnim;
    // Flippers: a slow paddle along each flipper's axis, phased per flipper, one pixel of travel.
    body.flippers.forEach((f, i) => {
      const k = animate ? Math.round(Math.sin(time * (Math.PI * 2) / 6.5 + i * 1.9) * 1.2) : 0;
      frame.blit(f.buffer, f.x + Math.round(f.axis.x * k) - ox, f.y + Math.round(f.axis.y * k) - oy);
    });
    // Head: breathing bob, a blink, a glance; the wind has nothing to do with it.
    const bob = animate ? Math.round(Math.sin((time * Math.PI * 2) / 4.5) * 1.1) : 0;
    const blinking = ta.blinkUntil >= 0;
    const variant = blinking ? body.head.blink : ta.glance < 0 && time < ta.glanceUntil ? body.head.left : ta.glance > 0 && time < ta.glanceUntil ? body.head.right : body.head.buffer;
    frame.blit(variant, body.head.x - ox, body.head.y + bob - oy);
    void windAt;
  }

  /** Blit a sprite with its rows above `swayRow` shifted horizontally by `sway` pixels. */
  private blitSway(frame: PixelBuffer, sprite: Sprite, x: number, y: number, sway: number): void {
    if (sway === 0 || sprite.swayRow === undefined) {
      frame.blit(sprite.buffer, x, y);
      return;
    }
    const src = sprite.buffer;
    const row = sprite.swayRow;
    for (let j = 0; j < src.height; j++) {
      const ty = y + j;
      if (ty < 0 || ty >= frame.height) continue;
      // The canopy shifts fully; the row just above the trunk joint shifts by half the amount (rounded toward zero), hiding the seam.
      const shift = j < row ? sway : 0;
      for (let i = 0; i < src.width; i++) {
        const c = src.data[j * src.width + i];
        if ((c >>> 24) === 0) continue;
        const tx = x + i + shift;
        if (tx < 0 || tx >= frame.width) continue;
        frame.data[ty * frame.width + tx] = c;
      }
    }
  }

  private drawBubble(frame: PixelBuffer, text: string, x: number, y: number): void {
    const w = text.length * 4 + 4;
    const h = 9;
    const bx = Math.round(x - w / 2);
    const by = y - h - 2;
    const ink = hex('#2b2340');
    frame.fillRect(bx, by, w, h, hex('#fffaf0'));
    frame.strokeRect(bx - 1, by - 1, w + 2, h + 2, ink);
    frame.set(x, by + h, ink);
    frame.set(x, by + h + 1, ink);
    drawTinyText(frame, text, bx + 2, by + 2, ink);
  }
}

/** A 3×5 pixel font for the few words a sign says. */
const GLYPHS: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  ',': ['...', '...', '...', '.#.', '#..'],
  '-': ['...', '...', '###', '...', '...'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  Q: ['.#.', '#.#', '#.#', '.##', '..#'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['#.#', '###', '###', '###', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  ' ': ['...', '...', '...', '...', '...'],
};

export function drawTinyText(buf: PixelBuffer, text: string, x: number, y: number, color: Color): void {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch] ?? GLYPHS[' '];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (glyph[j][i] === '#') buf.set(cx + i, y + j, color);
    cx += 4;
  }
}
