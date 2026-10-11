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
import { resourceSprite, BASIC_KINDS } from '../game/resources';
import { ITEMS } from '../game/items';
import { attachTool, toolIcon, EQUIPMENT } from '../game/equipment';
import { BUILDINGS, buildingSprite } from '../game/buildings';
import { drawPlacementOverlay } from './placement-overlay';
import { itemIcon } from '../ui/icons';
import { PICKUP_SECONDS, HARVEST_POP_SECONDS } from '../sim/live-world';
import { cropSprite, plotSprite, waterDropSprite, isWet, needsWater, isMature, PLOT_GRID, type CropStage } from '../game/farming';
import { windAt } from '../sim/live-world';
import { T, type Layer, type Placement, type WorldDescription } from '../world/types';
import { growWorld } from '../world/growth';
import { drawCreatureParts } from '../carriers/creature-render';
import type { LiveWorld } from '../sim/live-world';

export interface LiveRenderOptions {
  vegetation: boolean;
  structures: boolean;
  details: boolean;
  shadows: boolean;
  debugCollision: boolean;
  /** Draw the brain's path, target and nav grid. */
  debugPath: boolean;
  /** The resource counter in the corner of the frame. */
  hud: boolean;
  animateWater: boolean;
  animateWind: boolean;
}

export const DEFAULT_LIVE_OPTIONS: LiveRenderOptions = { vegetation: true, structures: true, details: true, shadows: true, debugCollision: false, debugPath: false, animateWater: true, animateWind: true, hud: true };

export interface FrameTimings {
  copy: number;
  water: number;
  objects: number;
  particles: number;
  total: number;
  drawn: number;
}

/**
 * A split frame, for the multi-scale view: the Blobbi and its tool are left out (the view draws them at native
 * resolution), whatever stands in front of the Blobbi in painter's order goes to `overlay` (transparent
 * elsewhere), and text is handed back to be drawn at the screen's UI scale instead of being magnified.
 */
export interface SplitLayers {
  overlay: PixelBuffer;
  texts: FrameText[];
}

export interface FrameText {
  kind: 'bubble' | 'label';
  text: string;
  /** World position: the bubble's tail point, or the label's top-centre. */
  x: number;
  y: number;
  color: Color;
  background: Color;
  /** A bubble over the Blobbi: its world height (see `Bubble.head`). */
  head?: number;
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
  /** World offset of the sprite's anchor from (x, y), for attached equipment. */
  offset?: { x: number; y: number };
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
  /** What fills the frame beyond the world's edge. */
  background = hex('#0d1016');

  /** During a growth reveal: the layer before and after this stage's new land (see LiveWorld.startReveal). */
  private revealFrom: PixelBuffer | null = null;
  private revealTo: PixelBuffer | null = null;

  constructor(readonly live: LiveWorld) {
    const world = live.world;
    const { width, height, cls } = world.terrain;
    this.staticLayer = this.paintStatic(world);
    if (live.reveal && live.world.growth) {
      // The island as it was a moment ago (the previous stage), to grow the new land in from.
      this.revealFrom = this.paintStatic(growWorld(live.baseWorld, live.reveal.stage - 1, live.world.growth.version));
      this.revealTo = this.staticLayer.clone();
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

  /** Terrain, the carrier underlay, object shadows, bridges and piers: everything that never moves, for a world. */
  private paintStatic(world: WorldDescription): PixelBuffer {
    const live = this.live;
    const palette = paletteFor(world.options.palette);
    const { width, height, cls } = world.terrain;
    const layer = new PixelBuffer(width, height);
    paintTerrain(layer, world.terrain, palette, world.seed, { animatedWater: true, underlay: turtleUnderlay(world, { head: false, flippers: false }) });
    // Static shadows of placed objects.
    for (const p of world.objects) {
      const s = live.spriteOf(p);
      if (s.footRx > 0) this.paintShadow(layer, p.x, p.y, s.footRx, s.footRy, 0, 0, world);
    }
    for (const b of world.bridges) {
      const half = Math.floor(b.width / 2);
      if (b.axis === 'h') for (let x = b.x0; x <= b.x1; x++) for (let y = b.y0 + half + 1; y <= b.y0 + half + 2; y++) if (cls[y * width + x] < T.GRASS_EDGE) layer.set(x, y, palette.shadowOnWater);
      else for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0 + half + 1; x <= b.x0 + half + 2; x++) if (cls[y * width + x] < T.GRASS_EDGE) layer.set(x, y, palette.shadowOnWater);
    }
    // Bridges are flat on the ground: bake them into the static layer too.
    for (const b of world.bridges) {
      const half = Math.floor(b.width / 2);
      const length = b.axis === 'h' ? b.x1 - b.x0 + 1 : b.y1 - b.y0 + 1;
      const sprite = live.spriteOf({ kind: 'bridge', layer: 'structures', seed: `${world.seed}/bridge/${b.id}`, size: length, x: 0, y: 0, island: -1, variation: { axis: b.axis, length, width: b.width } });
      if (b.axis === 'h') layer.blit(sprite.buffer, b.x0, b.y0 - half - sprite.anchorY);
      else layer.blit(sprite.buffer, b.x0 - half - 1, b.y0);
    }
    for (const p of world.piers) {
      const half = Math.floor(p.width / 2);
      const length = Math.abs(p.axis === 'h' ? p.x1 - p.x0 : p.y1 - p.y0) + 1;
      const sprite = live.spriteOf({ kind: 'bridge', layer: 'structures', seed: `${world.seed}/pier`, size: length, x: 0, y: 0, island: -1, variation: { axis: p.axis, length, width: p.width, pier: true } });
      if (p.axis === 'h') layer.blit(sprite.buffer, Math.min(p.x0, p.x1), p.y0 - half - sprite.anchorY);
      else layer.blit(sprite.buffer, p.x0 - half - 1, Math.min(p.y0, p.y1));
    }
    void height;
    return layer;
  }

  private paintShadow(buf: PixelBuffer, px: number, py: number, rx: number, ry: number, ox: number, oy: number, world: WorldDescription = this.live.world): void {
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
  render(viewW: number, viewH: number, camX: number, camY: number, time: number, o: LiveRenderOptions, split?: SplitLayers): PixelBuffer {
    const t0 = performance.now();
    const world = this.live.world;
    const palette = paletteFor(world.options.palette);
    const { width, height, cls } = world.terrain;
    if (this.frame.width !== viewW || this.frame.height !== viewH) this.frame = new PixelBuffer(viewW, viewH);
    const frame = this.frame;
    const ox = Math.round(camX);
    const oy = Math.round(camY);

    // ── The growth reveal: the new land spreads out from the old coast ─────
    if (this.revealFrom && this.revealTo) {
      const r = this.live.reveal;
      const p = r ? this.live.revealProgress() : 1;
      const pixels = r?.pixels;
      if (r && pixels) for (let k = 0; k < pixels.length; k++) {
        const i = pixels[k];
        this.staticLayer.data[i] = r.order[i] <= p ? this.revealTo.data[i] : this.revealFrom.data[i];
      }
      if (!r) {
        this.staticLayer.data.set(this.revealTo.data);
        this.revealFrom = this.revealTo = null;
      }
    }

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
    // A creature carrier (M7: the manta): its wing tips and tail whip, over the sea.
    else if (world.creature) drawCreatureParts(frame, world, ox, oy, time);

    // ── Farm plots: flat tilled soil on the ground, dark where watered ────
    const plotTime = this.live.worldTime;
    for (const plot of this.live.plots) {
      const r = this.live.plotRect(plot);
      if (r.x1 < ox || r.x0 >= ox + viewW || r.y1 < oy || r.y0 >= oy + viewH) continue;
      frame.blit(this.soil(!!plot.crop && isWet(plot.crop, plotTime), (plot.gx + plot.gy) & 1), r.x0 - ox, r.y0 - oy);
    }

    // ── Ground particles (leaves on the ground, sparkles) ─────────────────
    this.live.particles.draw(frame, ox, oy, false);

    // ── Dynamic: objects, planted trees, the Blobbi ───────────────────────
    const live = this.live;
    const enabled = (layer: Layer) => (layer === 'vegetation' ? o.vegetation : layer === 'structures' ? o.structures : o.details);
    const drawables: Drawable[] = [];
    const margin = 48;
    const reveal = live.reveal;
    const revealAt = reveal ? live.revealProgress() : 1;
    for (const { index, p } of this.sorted) {
      if (!enabled(p.layer)) continue;
      // New plants appear as the growing land reaches them.
      if (reveal && index >= reveal.from && index < reveal.to && reveal.order[p.y * width + p.x] > revealAt) continue;
      if (p.x < ox - margin || p.x > ox + viewW + margin || p.y < oy - margin || p.y > oy + viewH + margin) continue;
      const sprite = live.objectSprite(index);
      const sway = (o.animateWind && sprite.swayRow !== undefined) || live.impulses.has(index) ? live.swayOf(index, p.x, p.kind, time) : 0;
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
    // Discoveries: a small thing on the ground that glints now and then.
    for (const d of live.hiddenDiscoveries) {
      if (d.x < ox - 8 || d.x > ox + viewW + 8 || d.y < oy - 8 || d.y > oy + viewH + 8) continue;
      const icon = itemIcon(d.content.item.id, palette);
      drawables.push({ y: d.y, x: d.x, sprite: { buffer: icon, anchorX: Math.floor(icon.width / 2), anchorY: icon.height - 1, footRx: 0, footRy: 0 }, sway: 0, dy: 0 });
    }
    // Resources on the ground, and the one in reach marked.
    const reachable = live.nearestResource() ?? live.nearestDiscovery();
    for (const n of live.resources) {
      if (n.x < ox - 8 || n.x > ox + viewW + 8 || n.y < oy - 8 || n.y > oy + viewH + 8) continue;
      drawables.push({ y: n.y, x: n.x, sprite: resourceSprite(n.kind, n.variant, palette), sway: 0, dy: 0 });
    }
    // Crops stand on their plots, in painter's order like everything else.
    for (const plot of live.plots) {
      if (!plot.crop) continue;
      const r = live.plotRect(plot);
      if (r.x1 < ox - 8 || r.x0 > ox + viewW + 8 || r.y1 < oy - 8 || r.y0 > oy + viewH + 16) continue;
      const sprite = cropSprite(plot.crop.kind, live.cropStageOf(plot) as CropStage, plot.id);
      drawables.push({ y: r.y0 + PLOT_GRID - 2, x: r.x0 + PLOT_GRID / 2, sprite, sway: 0, dy: 0 });
    }
    // Buildings, placed and under construction, with their shadows.
    for (const building of live.buildings) {
      if (building.x < ox - 48 || building.x > ox + viewW + 48 || building.y < oy - 48 || building.y > oy + viewH + 48) continue;
      const sprite = buildingSprite(building, palette, live.buildingAt(building), world.options.scale);
      // Paths and rugs lie flat on the ground, under everything that stands.
      if (BUILDINGS[building.kind].layer === 'floor') {
        frame.blit(sprite.buffer, building.x - sprite.anchorX - ox, building.y - sprite.anchorY - oy);
        continue;
      }
      if (o.shadows) this.paintShadow(frame, building.x, building.y, sprite.footRx, sprite.footRy, ox, oy);
      drawables.push({ y: building.y, x: building.x, sprite, sway: 0, dy: 0 });
    }
    // The Blobbi.
    const b = live.blobbi;
    const pose = b.animator.pose(time);
    const bs = live.blobbiSprite(pose);
    const bx = Math.round(b.x);
    const by = Math.round(b.y);
    if (o.shadows) this.paintShadow(frame, bx, by - 1, b.footRx, 2, ox, oy);
    const hop = b.animator.hop(time);
    if (!split) {
      drawables.push({ y: by, x: bx, sprite: bs, sway: 0, dy: hop });
      // The equipped tool, attached to a hand, just behind or just in front of the Blobbi in the painter's order.
      if (live.equipped && EQUIPMENT[live.equipped]) {
        const at = attachTool(live.equipped, pose, live.equipmentAnimation(time), live.rig, (p) => live.blobbiSprite(p), palette);
        if (at.visible) drawables.push({ y: by, x: bx + (at.behind ? -0.5 : 0.5), sprite: at.sprite, sway: 0, dy: hop, offset: { x: at.dx, y: at.dy } });
      }
    }
    drawables.sort((a, c) => a.y - c.y || a.x - c.x);
    // Split: what sorts after the Blobbi (and its tool, at x ± 0.5) stands in front of it and goes to the overlay.
    if (split) {
      if (split.overlay.width !== viewW || split.overlay.height !== viewH) split.overlay = new PixelBuffer(viewW, viewH);
      else split.overlay.fill(0);
      split.texts.length = 0;
    }
    let out = frame;
    for (const d of drawables) {
      if (split && out === frame && (d.y > by || (d.y === by && d.x > bx + 0.5))) out = split.overlay;
      this.blitSway(out, d.sprite, Math.round(d.x + (d.offset?.x ?? 0)) - d.sprite.anchorX - ox, d.y + (d.offset?.y ?? 0) - d.sprite.anchorY - oy + d.dy, d.sway);
    }
    // Everything drawn from here on is in front of the Blobbi.
    out = split ? split.overlay : frame;
    this.timings.drawn = drawables.length + (split ? 1 : 0);
    const t3 = performance.now();

    // ── Placement: build mode, placing from the bag, moving; management highlights ──
    drawPlacementOverlay(live, out, ox, oy, palette, world.options.scale, split);
    // ── Fishing: the line from the Blobbi's hand to a bobbing float (it dips when a fish bites) ──
    if (live.fishing) {
      const f = live.fishing;
      const bite = time >= f.biteAt;
      const fy = f.y + (bite ? 1 : Math.round(Math.sin(time * 3)));
      const hx = Math.round(live.blobbi.x) - ox;
      const hy = Math.round(live.blobbi.y - live.blobbi.size * 0.7) - oy;
      out.line(hx, hy, f.x - ox, fy - 2 - oy, hex('#e8ecf4'));
      out.set(f.x - ox, fy - 2 - oy, hex('#ff3b5c'));
      out.set(f.x - ox, fy - 1 - oy, hex('#ffffff'));
    }
    // ── The farm: the target cell, water drops over dry crops, a glint on ripe ones, harvests rising ──
    this.drawFarmOverlay(out, ox, oy, viewW, viewH, time);
    // ── Pickups floating up, the reach marker, the resource counter ──────
    for (const p of live.pickups) {
      const t = Math.min(1, (time - p.start) / PICKUP_SECONDS);
      if (t >= 1 || ((t * 10) | 0) % 3 === 2) continue; // flickers out near the end
      const s = resourceSprite(p.node.kind, p.node.variant, palette);
      out.blit(s.buffer, p.node.x - s.anchorX - ox, p.node.y - s.anchorY - Math.round(t * 14) - oy);
    }
    // A glint over each hidden discovery, a couple of times a few seconds.
    for (const d of live.hiddenDiscoveries) {
      const phase = (time * 0.7 + (d.x * 13 + d.y * 7) * 0.01) % 2.5;
      if (phase > 0.35) continue;
      const gx = d.x + 2 - ox;
      const gy = d.y - 7 - oy;
      const c = hex('#ffffff');
      out.set(gx, gy, c);
      if (phase > 0.08 && phase < 0.27) {
        out.set(gx - 1, gy, c);
        out.set(gx + 1, gy, c);
        out.set(gx, gy - 1, c);
        out.set(gx, gy + 1, c);
      }
    }
    if (reachable) {
      const s = 'kind' in reachable ? resourceSprite(reachable.kind, reachable.variant, palette) : { buffer: itemIcon(reachable.content.item.id, palette) };
      const bob = Math.round(Math.sin(time * 6) * 1);
      const mx = reachable.x - ox;
      const my = reachable.y - s.buffer.height - 3 - oy + bob;
      const ink = hex('#fffaf0');
      out.set(mx, my, ink);
      out.set(mx - 1, my - 1, ink);
      out.set(mx + 1, my - 1, ink);
      out.set(mx, my - 1, ink);
    }
    if (o.hud && !split) {
      const counts = live.counts();
      const text = BASIC_KINDS.map((k) => `${k.toUpperCase()}S ${counts[k]}`).join('  ') + `  WOOD ${live.inventory.count(ITEMS.wood.id)}`;
      const w = text.length * 4 + 3;
      out.fillRect(2, 2, w, 9, hex('#1b1f2a'));
      drawTinyText(out, text, 4, 4, hex('#f4efe4'));
      // The equipped tool's icon beside the counter.
      if (live.equipped && EQUIPMENT[live.equipped]) {
        const icon = toolIcon(live.equipped, palette);
        out.fillRect(2 + w + 1, 2, icon.buffer.width + 2, icon.buffer.height + 2, hex('#1b1f2a'));
        out.blit(icon.buffer, 2 + w + 2, 3);
      }
    }
    // ── Front particles and the speech bubble ─────────────────────────────
    live.particles.draw(out, ox, oy, true);
    if (live.bubble) {
      if (split) split.texts.push({ kind: 'bubble', text: live.bubble.text, x: live.bubble.x, y: live.bubble.y, color: hex('#2b2340'), background: hex('#fffaf0'), head: live.bubble.head });
      else this.drawBubble(frame, live.bubble.text, live.bubble.x - ox, live.bubble.y - oy);
    }
    const t4 = performance.now();

    // ── Debug overlay ─────────────────────────────────────────────────────
    if (o.debugCollision) {
      const red = hex('#ff3b5c');
      const blocked = live.collision.blocked;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++)
          if (blocked[y * width + x] && ((x + y) & 1) === 0) out.data[(y - oy) * viewW + (x - ox)] = red;
      const yellow = hex('#ffe44d');
      const n = 24;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        out.set(Math.round(b.x + Math.cos(a) * b.footRx) - ox, Math.round(b.y + Math.sin(a) * b.footRy) - oy, yellow);
      }
      const target = live.facingObject();
      if (target) out.strokeRect(target.placement.x - target.sprite.footRx - 1 - ox, target.placement.y - target.sprite.footRy - 1 - oy, target.sprite.footRx * 2 + 3, target.sprite.footRy * 2 + 3, hex('#4dffb0'));
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
          if (((c + r) & 3) === 0) out.set(Math.floor(p.x) - ox, Math.floor(p.y) - oy, hex('#2fbf7a'));
        }
      for (let i = 0; i + 1 < brain.path.length; i++) out.line(Math.round(brain.path[i].x) - ox, Math.round(brain.path[i].y) - oy, Math.round(brain.path[i + 1].x) - ox, Math.round(brain.path[i + 1].y) - oy, cyan);
      if (brain.target) {
        const tx = Math.round(brain.target.x) - ox;
        const ty = Math.round(brain.target.y) - oy;
        out.hline(tx - 3, tx + 3, ty, magenta);
        out.vline(tx, ty - 3, ty + 3, magenta);
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

  private readonly soilCache = new Map<string, PixelBuffer>();
  private soil(wet: boolean, variant: number): PixelBuffer {
    const key = `${wet}|${variant}`;
    let hit = this.soilCache.get(key);
    if (!hit) this.soilCache.set(key, (hit = plotSprite(wet, variant)));
    return hit;
  }
  private readonly drop = waterDropSprite();

  private drawFarmOverlay(out: PixelBuffer, ox: number, oy: number, viewW: number, viewH: number, time: number): void {
    const live = this.live;
    const t = live.worldTime;
    // The cell E acts on: soft white corners on a plot, a dotted green (fits) or red (cannot) frame for the hoe.
    if (!live.buildMode) {
      const action = live.farmAction();
      if (action && !(action.kind === 'cannot-till' && (live.facingObject() || live.facingBuilding()))) {
        const cell = 'plot' in action ? action.plot : action.cell;
        const r = live.plotRect(cell);
        const x0 = r.x0 - ox - 1;
        const y0 = r.y0 - oy - 1;
        const x1 = r.x1 - ox + 1;
        const y1 = r.y1 - oy + 1;
        if (action.kind === 'till' || action.kind === 'cannot-till') {
          const c = action.kind === 'till' ? hex('#4dffb0') : hex('#ff3b5c');
          for (let x = x0; x <= x1; x++) if ((x & 1) === 0) (out.set(x, y0, c), out.set(x, y1, c));
          for (let y = y0; y <= y1; y++) if ((y & 1) === 0) (out.set(x0, y, c), out.set(x1, y, c));
        } else {
          const c = hex('#fffaf0');
          for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
            out.set(cx, cy, c);
            out.set(cx + sx, cy, c);
            out.set(cx, cy + sy, c);
          }
        }
      }
    }
    const bob = Math.round(Math.sin(time * 4) * 1);
    const glint = (time * 0.8) % 1 < 0.25;
    for (const plot of live.plots) {
      if (!plot.crop) continue;
      const r = live.plotRect(plot);
      if (r.x1 < ox - 8 || r.x0 > ox + viewW + 8 || r.y1 < oy - 16 || r.y0 > oy + viewH + 8) continue;
      const sprite = cropSprite(plot.crop.kind, live.cropStageOf(plot) as CropStage, plot.id);
      const top = r.y0 + PLOT_GRID - 2 - sprite.anchorY;
      const cx = r.x0 + PLOT_GRID / 2;
      if (needsWater(plot.crop, t)) out.blit(this.drop, cx - 2 - ox, top - this.drop.height - 1 + bob - oy);
      else if (isMature(plot.crop, t) && glint) {
        const c = hex('#fffaf0');
        const gx = cx + 2 - ox;
        const gy = top - 1 - oy;
        out.set(gx, gy, c);
        out.set(gx - 1, gy, c);
        out.set(gx + 1, gy, c);
        out.set(gx, gy - 1, c);
        out.set(gx, gy + 1, c);
      }
    }
    for (const pop of live.harvestPops) {
      const k = Math.min(1, (time - pop.start) / HARVEST_POP_SECONDS);
      if (k >= 1 || ((k * 10) | 0) % 4 === 3) continue;
      const s = cropSprite(pop.kind, 4, 'pop');
      out.blit(s.buffer, pop.x - s.anchorX - ox, pop.y + 2 - s.anchorY - Math.round(k * 12) - oy);
    }
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
  '(': ['.#.', '#..', '#..', '#..', '.#.'],
  ')': ['.#.', '..#', '..#', '..#', '.#.'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '.': ['...', '...', '...', '...', '.#.'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  "'": ['.#.', '.#.', '...', '...', '...'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'],
  '<': ['..#', '.#.', '#..', '.#.', '..#'],
  '*': ['...', '#.#', '.#.', '#.#', '...'],
  '=': ['...', '###', '...', '###', '...'],
};

export function drawTinyText(buf: PixelBuffer, text: string, x: number, y: number, color: Color): void {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch] ?? GLYPHS[' '];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (glyph[j][i] === '#') buf.set(cx + i, y + j, color);
    cx += 4;
  }
}
