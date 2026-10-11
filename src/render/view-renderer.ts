/**
 * THE MULTI-SCALE VIEW. Composes one screen-sized frame from:
 *
 *   1. the world behind the Blobbi, rendered by `LiveRenderer` in world pixels and magnified by the camera's
 *      scale with nearest-neighbour sampling (each world pixel a crisp block: terrain, objects, buildings and
 *      footprints keep their world size and proportions; nothing is resampled smoothly);
 *   2. the Blobbi and its tool, rasterized NATIVELY at the screen size (12, 24 or 48 px for a 16 px Blobbi):
 *      the same canonical V3 drawing, genome, expression, walk frame and hand rig, never a magnified sprite;
 *   3. what stands in front of the Blobbi in painter's order (an overlay from the same render), magnified;
 *   4. text and the HUD at a fixed UI scale, so bubbles stay readable without growing with the zoom.
 *
 * LOD: the world is rendered only over the visible rectangle (a 4× view renders a sixteenth of the pixels of a
 * 1× view of the same screen); the 1× overview reuses the gameplay sprite cache; native sprites are cached per
 * (size, pose) with a bounded cache; the magnification copies whole repeated rows.
 */
import { PixelBuffer, type Sprite } from '../core/pixel';
import { hex } from '../core/color';
import { paletteFor } from '../world/generate';
import { poseKey, buildBlobbiSprite, type BlobbiPose } from '../blobbi/sprite';
import { attachTool, EquipmentRig, EQUIPMENT, toolIcon } from '../game/equipment';
import { ITEMS } from '../game/items';
import { RESOURCE_KINDS } from '../game/resources';
import type { LiveWorld } from '../sim/live-world';
import type { PixelBlobbiIdentity } from '../blobbi/identity';
import { drawTinyText, type LiveRenderer, type LiveRenderOptions, type SplitLayers, type FrameText } from './live-render';
import { CAMERA_MODES, CAMERA_CYCLE, blobbiScreenSize, type CameraModeId, type ViewRect } from './view-camera';

/** Native sprites kept per size; poses beyond this are evicted oldest first. */
const NATIVE_CACHE_LIMIT = 512;

/** The Blobbi drawn at one native size: its sprites per pose and its hand rig. */
export class NativeBlobbi {
  private readonly cache = new Map<string, Sprite>();
  readonly rig: EquipmentRig;
  /** The identity it was made for (a new Blobbi seed makes a new NativeBlobbi). */
  readonly identity: PixelBlobbiIdentity;
  /** Sprites rasterized so far (for measurements). */
  built = 0;

  constructor(
    live: LiveWorld,
    readonly size: number,
  ) {
    this.identity = live.blobbi.identity;
    this.rig = new EquipmentRig(this.identity, size);
  }

  get cached(): number {
    return this.cache.size;
  }

  sprite(pose: BlobbiPose): Sprite {
    const key = poseKey(pose);
    const hit = this.cache.get(key);
    if (hit) {
      // Least recently used goes first: re-insert on use.
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const s = buildBlobbiSprite(this.identity, pose, this.size);
    this.built++;
    this.cache.set(key, s);
    if (this.cache.size > NATIVE_CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    return s;
  }
}

export interface ViewTimings {
  /** World render (back + overlay) in world pixels. */
  world: number;
  /** Magnifying the world and the overlay onto the screen. */
  compose: number;
  /** The native Blobbi and its tool. */
  blobbi: number;
  /** Text, HUD and the camera indicator. */
  ui: number;
  total: number;
  /** World pixels rendered this frame. */
  worldPixels: number;
}

export interface ViewUiOptions {
  /** The resource counter and the tool icon. */
  hud: boolean;
  /** The camera mode indicator. */
  indicator: boolean;
  /** Screen pixels per UI font pixel. */
  uiScale: number;
}

export const DEFAULT_VIEW_UI: ViewUiOptions = { hud: true, indicator: true, uiScale: 2 };

/** Where the Blobbi was drawn last frame, in screen pixels (tests and screenshots read it). */
export interface BlobbiOnScreen {
  /** The ground point on screen. */
  x: number;
  y: number;
  /** Native raster size (standing height in screen pixels). */
  size: number;
  /** Resampling ratio applied (1 at rest; only differs while the camera eases between modes). */
  ratio: number;
  sprite: Sprite;
}

export class ViewRenderer {
  private screen = new PixelBuffer(1, 1);
  private readonly layers: SplitLayers = { overlay: new PixelBuffer(1, 1), texts: [] };
  private readonly natives = new Map<string, NativeBlobbi>();
  private readonly textCache = new Map<string, PixelBuffer>();
  readonly timings: ViewTimings = { world: 0, compose: 0, blobbi: 0, ui: 0, total: 0, worldPixels: 0 };
  lastBlobbi: BlobbiOnScreen | null = null;

  constructor(
    readonly live: LiveWorld,
    readonly world: LiveRenderer,
  ) {
    // Beyond the world's edge (the overview of a wide screen) the open sea continues: the most common colour of
    // the world's border, so the margin reads as more of the same water instead of a black bar.
    const layer = world.staticLayer;
    const counts = new Map<number, number>();
    const tally = (x: number, y: number) => {
      const c = layer.get(x, y);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    };
    for (let x = 0; x < layer.width; x++) (tally(x, 0), tally(x, layer.height - 1));
    for (let y = 0; y < layer.height; y++) (tally(0, y), tally(layer.width - 1, y));
    world.background = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  }

  /** The native Blobbi for a screen size; the gameplay size shares the live world's own cache and rig. */
  native(size: number): NativeBlobbi | null {
    if (size === this.live.blobbi.size) return null;
    const key = `${this.live.blobbi.seed}|${size}`;
    let n = this.natives.get(key);
    if (!n || n.identity !== this.live.blobbi.identity) {
      n = new NativeBlobbi(this.live, size);
      this.natives.set(key, n);
    }
    return n;
  }

  /** The native standing height of the Blobbi in a mode at rest scale `restScale`. */
  nativeSize(restScale: number, mode: CameraModeId): number {
    return blobbiScreenSize(this.live.blobbi.size, mode, restScale);
  }

  render(view: ViewRect, restScale: number, time: number, o: LiveRenderOptions, ui: ViewUiOptions = DEFAULT_VIEW_UI): PixelBuffer {
    const t0 = performance.now();
    const { screenW: W, screenH: H, scale: s, originX, originY } = view;
    if (this.screen.width !== W || this.screen.height !== H) this.screen = new PixelBuffer(W, H);
    const screen = this.screen;

    // ── 1. The world in world pixels, over the visible rectangle only ──────
    const wx0 = Math.floor(originX);
    const wy0 = Math.floor(originY);
    const vw = Math.max(1, Math.ceil(originX + W / s) - wx0 + 1);
    const vh = Math.max(1, Math.ceil(originY + H / s) - wy0 + 1);
    const frame = this.world.render(vw, vh, wx0, wy0, time, { ...o, hud: false }, this.layers);
    const overlay = this.layers.overlay;
    this.timings.worldPixels = vw * vh;
    const t1 = performance.now();

    // ── 2. Magnify: a screen pixel samples the world pixel under its centre ─
    const xmap = new Int32Array(W);
    const ymap = new Int32Array(H);
    for (let x = 0; x < W; x++) xmap[x] = Math.min(vw - 1, Math.max(0, Math.floor(originX + (x + 0.5) / s) - wx0));
    for (let y = 0; y < H; y++) ymap[y] = Math.min(vh - 1, Math.max(0, Math.floor(originY + (y + 0.5) / s) - wy0));
    const src = frame.data;
    const dst = screen.data;
    const oneToOne = s === 1 && originX === wx0 && originY === wy0;
    if (oneToOne) {
      // The 1× overview: the world frame is the screen; copy rows.
      for (let y = 0; y < H; y++) dst.set(src.subarray(y * vw, y * vw + W), y * W);
    } else {
      for (let y = 0; y < H; y++) {
        const row = ymap[y];
        if (y > 0 && row === ymap[y - 1]) {
          dst.copyWithin(y * W, (y - 1) * W, y * W);
          continue;
        }
        const base = row * vw;
        const out = y * W;
        for (let x = 0; x < W; x++) dst[out + x] = src[base + xmap[x]];
      }
    }
    const t2 = performance.now();

    // ── 3. The Blobbi and its tool at native resolution ───────────────────
    const live = this.live;
    const b = live.blobbi;
    const palette = paletteFor(live.world.options.palette);
    const size = this.nativeSize(restScale, view.mode);
    const ratio = s / restScale;
    const native = this.native(size);
    const spriteOf = (p: BlobbiPose) => (native ? native.sprite(p) : live.blobbiSprite(p));
    const pose = live.blobbi.animator.pose(time);
    const sprite = spriteOf(pose);
    const bx = Math.round(b.x);
    const by = Math.round(b.y);
    // The anchor pixel sits in the world ground pixel's block: centre column, bottom row.
    const ax = Math.floor((bx - originX) * s + s / 2);
    const ay = Math.floor((by - originY) * s + s - 1) + Math.round(b.animator.hop(time) * s);
    let tool: { sprite: Sprite; dx: number; dy: number; behind: boolean } | null = null;
    if (live.equipped && EQUIPMENT[live.equipped]) {
      const at = attachTool(live.equipped, pose, live.equipmentAnimation(time), native ? native.rig : live.rig, spriteOf, palette);
      if (at.visible) tool = at;
    }
    // A tool in front sits one world pixel right of its hand point, as the classic renderer has always drawn it
    // (its painter's-order nudge of +0.5 rounds up): the approved M2.3 look, kept in every mode.
    const drawTool = () => tool && blitAt(screen, tool.sprite, ax + Math.round(tool.dx * ratio) + (tool.behind ? 0 : Math.round(s)), ay + Math.round(tool.dy * ratio), ratio);
    if (tool?.behind) drawTool();
    blitAt(screen, sprite, ax, ay, ratio);
    if (tool && !tool.behind) drawTool();
    this.lastBlobbi = { x: ax, y: ay, size, ratio, sprite };
    const t3 = performance.now();

    // ── 4. What stands in front, magnified onto the screen ────────────────
    const xs = spans(xmap, vw);
    const ys = spans(ymap, vh);
    const od = overlay.data;
    for (let y = 0; y < vh; y++) {
      const ry0 = ys.start[y];
      const ry1 = ys.end[y];
      if (ry1 <= ry0) continue;
      for (let x = 0; x < vw; x++) {
        const c = od[y * vw + x];
        if (c >>> 24 === 0) continue;
        const rx0 = xs.start[x];
        const rx1 = xs.end[x];
        for (let yy = ry0; yy < ry1; yy++) dst.fill(c, yy * W + rx0, yy * W + rx1);
      }
    }
    const t4 = performance.now();

    // ── 5. Text, HUD and the camera indicator at the UI scale ─────────────
    // A bubble over the Blobbi rests on the head as drawn (its native height in world pixels), not as simulated.
    const drawnHeight = size / restScale;
    for (const t of this.layers.texts) {
      const y = t.head ? t.y + t.head - drawnHeight : t.y;
      this.drawText(screen, t, (t.x - originX) * s, (y - originY) * s, ui.uiScale);
    }
    if (ui.hud) this.drawHud(screen, ui.uiScale);
    if (ui.indicator) this.drawIndicator(screen, view, ui.uiScale);
    const t5 = performance.now();
    this.timings.world = t1 - t0;
    this.timings.compose = t2 - t1 + (t4 - t3);
    this.timings.blobbi = t3 - t2;
    this.timings.ui = t5 - t4;
    this.timings.total = t5 - t0;
    return screen;
  }

  private cachedText(key: string, make: () => PixelBuffer, scale: number): PixelBuffer {
    const k = `${scale}|${key}`;
    let hit = this.textCache.get(k);
    if (!hit) {
      hit = make().scaled(scale);
      if (this.textCache.size > 64) this.textCache.clear();
      this.textCache.set(k, hit);
    }
    return hit;
  }

  private drawText(screen: PixelBuffer, t: FrameText, sx: number, sy: number, ui: number): void {
    const w = t.text.length * 4 + (t.kind === 'bubble' ? 4 : 3);
    const h = 9;
    const buf = this.cachedText(`${t.kind}|${t.text}|${t.color}|${t.background}`, () => {
      const b = new PixelBuffer(w + 2, h + 4);
      b.fillRect(1, 1, w, h, t.background);
      if (t.kind === 'bubble') {
        b.strokeRect(0, 0, w + 2, h + 2, t.color);
        const tail = Math.floor((w + 2) / 2);
        b.set(tail, h + 1, t.color);
        b.set(tail, h + 2, t.color);
      }
      drawTinyText(b, t.text, 3, 3, t.color);
      return b;
    }, ui);
    // A bubble's tail points at (sx, sy); a label hangs from its top-centre.
    const x = Math.round(sx - buf.width / 2);
    const y = t.kind === 'bubble' ? Math.round(sy - buf.height) : Math.round(sy);
    screen.blit(buf, x, y);
  }

  private drawHud(screen: PixelBuffer, ui: number): void {
    const live = this.live;
    const counts = live.counts();
    const text = RESOURCE_KINDS.map((k) => `${k.toUpperCase()}S ${counts[k]}`).join('  ') + `  WOOD ${live.inventory.count(ITEMS.wood.id)}`;
    const palette = paletteFor(live.world.options.palette);
    const tool = live.equipped && EQUIPMENT[live.equipped] ? live.equipped : null;
    const buf = this.cachedText(`hud|${text}|${tool}`, () => {
      const w = text.length * 4 + 3;
      const icon = tool ? toolIcon(tool, palette) : null;
      const b = new PixelBuffer(w + (icon ? icon.buffer.width + 3 : 0), Math.max(9, icon ? icon.buffer.height + 2 : 0));
      b.fillRect(0, 0, w, 9, hex('#1b1f2a'));
      drawTinyText(b, text, 2, 2, hex('#f4efe4'));
      if (icon) {
        b.fillRect(w + 1, 0, icon.buffer.width + 2, icon.buffer.height + 2, hex('#1b1f2a'));
        b.blit(icon.buffer, w + 2, 1);
      }
      return b;
    }, ui);
    screen.blit(buf, 2 * ui, 2 * ui);
  }

  /** "CAMERA  EXPLORATION 2X" and three pips, the active one lit, in the bottom-left corner. */
  private drawIndicator(screen: PixelBuffer, view: ViewRect, ui: number): void {
    const mode = CAMERA_MODES[view.mode];
    const scaleText = Number.isInteger(view.scale) ? `${view.scale}X` : '';
    const text = `Z CAMERA  ${mode.label} ${scaleText}`.trimEnd();
    const buf = this.cachedText(`cam|${text}`, () => {
      const pips = CAMERA_CYCLE.length * 4 + 2;
      const w = text.length * 4 + 3 + pips;
      const b = new PixelBuffer(w, 9);
      b.fillRect(0, 0, w, 9, hex('#1b1f2a'));
      CAMERA_CYCLE.forEach((id, i) => b.fillRect(2 + i * 4, 3, 3, 3, id === view.mode ? hex('#ffe07a') : hex('#4a5068')));
      drawTinyText(b, text, pips + 1, 2, hex('#f4efe4'));
      return b;
    }, ui);
    screen.blit(buf, 2 * ui, screen.height - buf.height - 2 * ui);
  }
}

/** For each source index, the half-open range of destination indices that sample it (the map is monotonic). */
function spans(map: Int32Array, n: number): { start: Int32Array; end: Int32Array } {
  const start = new Int32Array(n);
  const end = new Int32Array(n);
  for (let i = map.length - 1; i >= 0; i--) start[map[i]] = i;
  for (let i = 0; i < map.length; i++) end[map[i]] = i + 1;
  return { start, end };
}

/** Blit a sprite with its anchor at (x, y); `ratio` ≠ 1 only during a camera transition (nearest-neighbour). */
function blitAt(dst: PixelBuffer, sprite: Sprite, x: number, y: number, ratio: number): void {
  if (ratio === 1) {
    dst.blit(sprite.buffer, x - sprite.anchorX, y - sprite.anchorY);
    return;
  }
  const src = sprite.buffer;
  const x0 = Math.floor(x - sprite.anchorX * ratio);
  const y0 = Math.floor(y - sprite.anchorY * ratio);
  const w = Math.ceil(src.width * ratio);
  const h = Math.ceil(src.height * ratio);
  for (let j = 0; j < h; j++) {
    const ty = y0 + j;
    if (ty < 0 || ty >= dst.height) continue;
    const sy = Math.min(src.height - 1, Math.floor((j + 0.5) / ratio));
    for (let i = 0; i < w; i++) {
      const tx = x0 + i;
      if (tx < 0 || tx >= dst.width) continue;
      const c = src.data[sy * src.width + Math.min(src.width - 1, Math.floor((i + 0.5) / ratio))];
      if (c >>> 24 !== 0) dst.data[ty * dst.width + tx] = c;
    }
  }
}

