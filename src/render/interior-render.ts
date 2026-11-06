/**
 * THE ROOM RENDERER: draws a house interior with the same contract as `LiveRenderer.render` (viewport in world
 * pixels, optional split layers for the multi-scale view), so the camera modes, the native-resolution Blobbi and
 * the UI work indoors exactly as outside. The room is painted once per style; rugs lie flat, wall items hang on the
 * back wall, everything else stands in painter's order with the Blobbi.
 */
import { hex, mix } from '../core/color';
import { PixelBuffer, type Sprite } from '../core/pixel';
import { hash32 } from '../core/rng';
import { paletteFor } from '../world/generate';
import { BUILDINGS, buildingSprite } from '../game/buildings';
import { roomLightAt, roomLightKey, type RoomLight } from '../game/daylight';
import { isWallKind, layoutFor, roomSprite, type RoomLayout } from '../game/interior';
import { attachTool, EQUIPMENT } from '../game/equipment';
import type { LiveWorld } from '../sim/live-world';
import { drawTinyText, type LiveRenderOptions, type SplitLayers } from './live-render';
import { drawPlacementOverlay } from './placement-overlay';

interface Drawable {
  x: number;
  y: number;
  sprite: Sprite;
  dy: number;
  offset?: { x: number; y: number };
}

export class InteriorRenderer {
  private frame = new PixelBuffer(1, 1);
  private roomCache = new Map<string, PixelBuffer>();
  readonly background = hex('#15181f');
  /** The window's sky colour (day/night sets it). */
  sky = hex('#9ad0f0');

  constructor(readonly live: LiveWorld) {}

  /** The room in a light state, painted once per style, sky and state (all quantized) and kept. */
  private room(light: RoomLight): PixelBuffer {
    const state = this.live.interior!.state;
    const st = state.style;
    const palette = paletteFor(this.live.world.options.palette);
    const key = `${state.level}|${st.floor}|${st.wall}|${st.finish ?? 0}|${this.sky}|${roomLightKey(light)}`;
    let hit = this.roomCache.get(key);
    if (!hit) {
      if (this.roomCache.size >= ROOM_CACHE) this.roomCache.clear();
      hit = roomSprite(st, palette, this.sky, layoutFor(state.level), light);
      this.roomCache.set(key, hit);
    }
    return hit;
  }

  /** How many painted rooms are kept (a dusk passes through about a dozen states). */
  get cachedRooms(): number {
    return this.roomCache.size;
  }

  render(viewW: number, viewH: number, camX: number, camY: number, time: number, o: LiveRenderOptions, split?: SplitLayers): PixelBuffer {
    const live = this.live;
    const scene = live.interior!;
    const palette = paletteFor(live.world.options.palette);
    if (this.frame.width !== viewW || this.frame.height !== viewH) this.frame = new PixelBuffer(viewW, viewH);
    const frame = this.frame;
    const ox = Math.round(camX);
    const oy = Math.round(camY);
    frame.fill(this.background);
    const light = roomLightAt(live.world.seed, live.worldTime, live.rainOutside());
    frame.blit(this.room(light), -ox, -oy);
    // Live weather in the windows: a few streaks while it rains, a few stars at night (a handful of pixels).
    for (const win of layoutFor(scene.state.level).windows) {
      if (light.rain > 0) drawWindowRain(frame, win, light.rain, live.worldTime, live.world.seed, ox, oy);
      if (light.night) drawWindowStars(frame, win, this.sky, live.worldTime, live.world.seed, ox, oy);
    }
    const furniture = scene.state.furniture;
    const sprite = (f: (typeof furniture)[number]) => buildingSprite(f, palette, 1, live.world.options.scale);
    // Wall items, then rugs: behind everything.
    for (const f of furniture) if (isWallKind(f.kind)) {
      const s = sprite(f);
      frame.blit(s.buffer, f.x - s.anchorX - ox, f.y - s.anchorY - oy);
    }
    for (const f of furniture) if (!isWallKind(f.kind) && BUILDINGS[f.kind].layer === 'floor') {
      const s = sprite(f);
      frame.blit(s.buffer, f.x - s.anchorX - ox, f.y - s.anchorY - oy);
    }
    scene.particles.draw(frame, ox, oy, false);
    // Standing furniture and the Blobbi in painter's order.
    const drawables: Drawable[] = [];
    const b = live.blobbi;
    const pose = b.animator.pose(time);
    const drawn = live.drawnBlobbi();
    const bx = Math.round(drawn.x);
    const by = Math.round(drawn.y);
    // In bed (M9): the bed is drawn behind the Blobbi and, once it is tucked in, the blanket in front of it.
    const inBed = live.inBed();
    for (const f of furniture) {
      if (isWallKind(f.kind) || BUILDINGS[f.kind].layer === 'floor') continue;
      if (inBed && f === inBed.bed) {
        drawables.push({ x: f.x, y: by - 0.5, sprite: sprite(f), dy: f.y - by + 0.5 });
        if (inBed.tucked && f.kind === 'bed') drawables.push({ x: f.x, y: by + 0.25, sprite: blanketOf(sprite(f)), dy: f.y - by - 0.25 });
      } else drawables.push({ x: f.x, y: f.y, sprite: sprite(f), dy: 0 });
    }
    const hop = b.animator.hop(time);
    if (!split) {
      drawables.push({ x: bx, y: by, sprite: live.blobbiSprite(pose), dy: hop });
      if (live.equipped && EQUIPMENT[live.equipped]) {
        const at = attachTool(live.equipped, pose, live.equipmentAnimation(time), live.rig, (p) => live.blobbiSprite(p), palette);
        if (at.visible) drawables.push({ y: by, x: bx + (at.behind ? -0.5 : 0.5), sprite: at.sprite, dy: hop, offset: { x: at.dx, y: at.dy } });
      }
    }
    drawables.sort((a, c) => a.y - c.y || a.x - c.x);
    if (split) {
      if (split.overlay.width !== viewW || split.overlay.height !== viewH) split.overlay = new PixelBuffer(viewW, viewH);
      else split.overlay.fill(0);
      split.texts.length = 0;
    }
    let out = frame;
    for (const d of drawables) {
      if (split && out === frame && (d.y > by || (d.y === by && d.x > bx + 0.5))) out = split.overlay;
      out.blit(d.sprite.buffer, Math.round(d.x + (d.offset?.x ?? 0)) - d.sprite.anchorX - ox, d.y + (d.offset?.y ?? 0) - d.sprite.anchorY - oy + d.dy);
    }
    out = split ? split.overlay : frame;
    drawPlacementOverlay(live, out, ox, oy, palette, live.world.options.scale, split);
    scene.particles.draw(out, ox, oy, true);
    if (live.bubble) {
      if (split) split.texts.push({ kind: 'bubble', text: live.bubble.text, x: live.bubble.x, y: live.bubble.y, color: hex('#2b2340'), background: hex('#fffaf0'), head: live.bubble.head });
      else {
        const text = live.bubble.text;
        const w = text.length * 4 + 4;
        const bxx = Math.round(live.bubble.x - w / 2) - ox;
        const byy = live.bubble.y - 11 - oy;
        frame.fillRect(bxx, byy, w, 9, hex('#fffaf0'));
        drawTinyText(frame, text, bxx + 2, byy + 2, hex('#2b2340'));
      }
    }
    void o;
    return frame;
  }
}

const ROOM_CACHE = 16;
const RAIN = hex('#c8dcf8');
type Window = RoomLayout['windows'][number];

/**
 * Rain seen through a window: short streaks falling down the glass, one column in three or so (more in heavier
 * rain), never over the frame's cross. Where each streak is comes from a hash of (seed, window, column) and the world
 * time step, so the same moment shows the same rain on every machine; nothing is kept between frames.
 */
export function drawWindowRain(buf: PixelBuffer, win: Window, rain: number, time: number, seed: string, ox: number, oy: number): void {
  const midX = Math.round((win.x0 + win.x1) / 2);
  const midY = Math.round((win.y0 + win.y1) / 2);
  const period = win.y1 - win.y0 + 7;
  const step = Math.floor(time * 24);
  for (let i = 0; win.x0 + i * 3 <= win.x1; i++) {
    const h = hash32(`${seed}/window-rain/${win.x0},${win.y0}/${i}`);
    if (h % 8 >= rain * 6) continue;
    const x = win.x0 + i * 3 + ((h >>> 3) & 1);
    if (x === midX || x > win.x1) continue;
    const top = win.y0 - 2 + ((step + (h >>> 4)) % period);
    for (const y of [top, top + 1]) if (y >= win.y0 && y <= win.y1 && y !== midY) buf.set(x - ox, y - oy, RAIN);
  }
}

/**
 * Stars in a night window: up to three pixels, each twinkling on a two-second step (bright, dim, gone), placed by a
 * hash of (seed, window, star), never over the frame's cross.
 */
export function drawWindowStars(buf: PixelBuffer, win: Window, sky: number, time: number, seed: string, ox: number, oy: number): void {
  const midX = Math.round((win.x0 + win.x1) / 2);
  const midY = Math.round((win.y0 + win.y1) / 2);
  const bright = mix(sky, hex('#ffffff'), 0.75);
  const dim = mix(sky, hex('#ffffff'), 0.4);
  const tick = Math.floor(time / 2);
  for (let i = 0; i < 3; i++) {
    const h = hash32(`${seed}/window-stars/${win.x0},${win.y0}/${i}`);
    const x = win.x0 + (h % (win.x1 - win.x0 + 1));
    const y = win.y0 + ((h >>> 8) % (win.y1 - win.y0 + 1));
    if (x === midX || y === midY) continue;
    const phase = (tick + (h >>> 16)) % 3;
    if (phase === 0) continue;
    buf.set(x - ox, y - oy, phase === 1 ? dim : bright);
  }
}

const blankets = new WeakMap<Sprite, Sprite>();
/**
 * The front of a bed (blanket and foot): its rows from the blanket's top edge down, so the sleeping Blobbi looks
 * tucked in. The bed art (`furniture-art.ts`) puts the blanket's top at row 8 of the outlined sprite.
 */
export function blanketOf(bed: Sprite): Sprite {
  const hit = blankets.get(bed);
  if (hit) return hit;
  const top = 8;
  const buffer = new PixelBuffer(bed.buffer.width, bed.buffer.height);
  for (let y = top; y < bed.buffer.height; y++) for (let x = 0; x < bed.buffer.width; x++) buffer.set(x, y, bed.buffer.get(x, y));
  const out = { ...bed, buffer };
  blankets.set(bed, out);
  return out;
}
