/**
 * THE ROOM RENDERER: draws a house interior with the same contract as `LiveRenderer.render` (viewport in world
 * pixels, optional split layers for the multi-scale view), so the camera modes, the native-resolution Blobbi and
 * the UI work indoors exactly as outside. The room is painted once per style; rugs lie flat, wall items hang on the
 * back wall, everything else stands in painter's order with the Blobbi.
 */
import { hex } from '../core/color';
import { PixelBuffer, type Sprite } from '../core/pixel';
import { paletteFor } from '../world/generate';
import { BUILDINGS, buildingSprite } from '../game/buildings';
import { isWallKind, layoutFor, roomSprite } from '../game/interior';
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

  private room(): PixelBuffer {
    const state = this.live.interior!.state;
    const st = state.style;
    const palette = paletteFor(this.live.world.options.palette);
    const key = `${state.level}|${st.floor}|${st.wall}|${st.finish ?? 0}|${this.sky}`;
    let hit = this.roomCache.get(key);
    if (!hit) {
      if (this.roomCache.size > 8) this.roomCache.clear();
      hit = roomSprite(st, palette, this.sky, layoutFor(state.level));
      this.roomCache.set(key, hit);
    }
    return hit;
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
    frame.blit(this.room(), -ox, -oy);
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
    for (const f of furniture) if (!isWallKind(f.kind) && BUILDINGS[f.kind].layer !== 'floor') drawables.push({ x: f.x, y: f.y, sprite: sprite(f), dy: 0 });
    const b = live.blobbi;
    const pose = b.animator.pose(time);
    const bx = Math.round(b.x);
    const by = Math.round(b.y);
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
