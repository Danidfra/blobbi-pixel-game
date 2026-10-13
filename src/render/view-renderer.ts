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
import { attachTool, EquipmentRig, EQUIPMENT, type Attachment } from '../game/equipment';
import { drawFloat, drawLine, flight, floatAt } from './fishing-line';
import { ITEMS, FOODS, itemLabel, itemPlural } from '../game/items';
import { currentObjective, OBJECTIVES } from '../game/objectives';
import { BASIC_KINDS, RESOURCE_ITEM } from '../game/resources';
import type { LiveWorld } from '../sim/live-world';
import type { PixelBlobbiIdentity } from '../blobbi/identity';
import { InteriorRenderer } from './interior-render';
import { drawTeleportParticles, drawTeleportShadow, teleportSprite } from './teleport-render';
import { applyLight, dayAt, hourAt } from '../game/daylight';
import { goalCard, identityChip, pinnedCard, statusCard, timeChip, toastCard, ToastFeed, type StatusInfo } from '../ui/hud';
import { UiSurface, textPreference } from '../ui/surface';
import { getLocale, sentence, t as lang, upper } from '../i18n';
import { itemIcon } from '../ui/icons';
import { FRIEND_TITLES, friendLevel } from '../game/friendship';
import { REST_POSE } from '../blobbi/pose';
import { hex as hexColour, mix as mixColour } from '../core/color';

/** The window's sky over the day: blue, gold at dawn and dusk, a deep blue at night. */
function skyColour(t: number): number {
  const h = hourAt(t);
  const day = hexColour('#9ad0f0');
  const gold = hexColour('#f0b878');
  const night = hexColour('#1f2c4d');
  if (h >= 7.5 && h < 17) return day;
  if (h >= 5 && h < 7.5) return h < 6.2 ? mixColour(night, gold, (h - 5) / 1.2) : mixColour(gold, day, (h - 6.2) / 1.3);
  if (h >= 17 && h < 20.5) return h < 18.8 ? mixColour(day, gold, (h - 17) / 1.8) : mixColour(gold, night, (h - 18.8) / 1.7);
  return night;
}
import { type LiveRenderer, type LiveRenderOptions, type SplitLayers, type FrameText } from './live-render';
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
  /** The resource counter, the tool icon and the needs bars. */
  hud: boolean;
  /** The current objective, top right (O toggles it); follows `hud` when unset. */
  goals?: boolean;
  /** What E would do now, bottom centre; follows `hud` when unset. */
  prompt?: boolean;
  /** Screen pixels kept free at the bottom (the menu bar): the action prompt sits above them. */
  bottom?: number;
  /** Day and night lighting (presentation only; off unless set: the game's defaults turn it on). */
  lighting?: boolean;
  /** The camera mode indicator. */
  indicator: boolean;
  /** Screen pixels per UI font pixel. */
  uiScale: number;
  /** M11C: who is playing, shown small under the status card (a guest or a connected account); none when unset. */
  identity?: 'guest' | 'connected' | null;
  /** M11C: a rectangle (screen pixels) the action prompt must not cover (the hotbar); it moves right of it. */
  promptAvoid?: { x: number; y: number; w: number; h: number } | null;
  /** M11C: the Blobbi's name for the status card (a canonical Blobbi's own name); else the seed, when short. */
  blobbiName?: string | null;
}

export const DEFAULT_VIEW_UI: ViewUiOptions = { hud: true, indicator: true, uiScale: 2, goals: true, prompt: true, lighting: true };

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
  private xmap = new Int32Array(0);
  private ymap = new Int32Array(0);
  private xspans: Spans | undefined;
  private yspans: Spans | undefined;
  readonly timings: ViewTimings = { world: 0, compose: 0, blobbi: 0, ui: 0, total: 0, worldPixels: 0 };
  lastBlobbi: BlobbiOnScreen | null = null;
  /** Where the teleport effect was drawn this frame (null when the Blobbi is simply present). */
  teleportAnchor: { ax: number; groundY: number } | null = null;
  /** Teleport pixels drawn in the last frame (tests and dev tools). */
  teleportParticles = 0;
  /** The room renderer, made the first time the Blobbi goes indoors. */
  room: InteriorRenderer | null = null;

  constructor(
    readonly live: LiveWorld,
    readonly world: LiveRenderer,
  ) {
    // Beyond the world's edge the live renderer paints the open sea (M10): no flat margin to choose here.
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
    // The scene: the island, or the room the Blobbi is in.
    const lit = ui.lighting ?? false;
    const light = lit ? this.live.ambientLight() : { dark: 0, warm: 0, night: false };
    if (this.live.interior) (this.room ??= new InteriorRenderer(this.live)).sky = skyColour(this.live.worldTime);
    const scene = this.live.interior ? this.room! : this.world;
    const frame = scene.render(vw, vh, wx0, wy0, time, { ...o, hud: false }, this.layers);
    const overlay = this.layers.overlay;
    // Day and night, in world pixels (a fraction of the screen's): the world, what stands in front, the Blobbi.
    const rain = lit ? this.live.rainNow() : 0;
    const lights = light.dark > 0.01 ? this.live.lightSources() : [];
    if (lit) {
      applyLight(frame.data, vw, vh, wx0, wy0, light, rain, lights);
      applyLight(overlay.data, vw, vh, wx0, wy0, light, rain, lights);
    }
    this.timings.worldPixels = vw * vh;
    const t1 = performance.now();

    // ── 2. Magnify: a screen pixel samples the world pixel under its centre ─
    // The maps and spans are kept between frames (a frame used to allocate four arrays per screen side).
    if (this.xmap.length !== W) this.xmap = new Int32Array(W);
    if (this.ymap.length !== H) this.ymap = new Int32Array(H);
    const xmap = this.xmap;
    const ymap = this.ymap;
    for (let x = 0; x < W; x++) xmap[x] = Math.min(vw - 1, Math.max(0, Math.floor(originX + (x + 0.5) / s) - wx0));
    for (let y = 0; y < H; y++) ymap[y] = Math.min(vh - 1, Math.max(0, Math.floor(originY + (y + 0.5) / s) - wy0));
    const src = frame.data;
    const dst = screen.data;
    const oneToOne = s === 1 && originX === wx0 && originY === wy0;
    const xs = (this.xspans = spans(xmap, vw, this.xspans));
    const ys = (this.yspans = spans(ymap, vh, this.yspans));
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
    // Teleporting: the eyes stay tightly shut while it concentrates and while it rebuilds (only the lids change).
    const tp = live.teleport;
    const away = tp.state !== 'present';
    if (away && tp.eyesClosed(time)) {
      pose.lid = 2;
      pose.expression = 'neutral';
      pose.walk = -1;
    }
    const canonical = spriteOf(pose);
    let sprite = canonical;
    if (lit && (light.dark > 0.01 || light.warm > 0.01 || rain > 0)) {
      // The Blobbi in the same light: a tinted copy, as dark as the world around it (less near a lamp).
      let f = 1;
      for (const l of lights) f = Math.min(f, Math.hypot(l.x - b.x, (l.y - b.y) * 1.3) / l.radius);
      const tinted = sprite.buffer.clone();
      applyLight(tinted.data, tinted.width, tinted.height, 0, 0, { dark: light.dark * f, warm: light.warm }, rain * f, []);
      sprite = { ...sprite, buffer: tinted };
    }
    const bx = Math.round(b.x);
    const by = Math.round(b.y);
    // The anchor pixel sits in the world ground pixel's block: centre column, bottom row.
    const ax = Math.floor((bx - originX) * s + s / 2);
    const ay = Math.floor((by - originY) * s + s - 1) + Math.round(b.animator.hop(time) * s);
    let tool: Attachment | null = null;
    if (live.equipped && EQUIPMENT[live.equipped]) {
      const at = attachTool(live.equipped, pose, live.equipmentAnimation(time), native ? native.rig : live.rig, spriteOf, palette);
      if (at.visible) tool = at;
    }
    // A fish on the line tugs the rod: a pixel down and back, a few times a second.
    const float = away ? null : floatAt(live, time);
    const tug = float?.bite && Math.floor(time * 8) % 2 ? Math.max(1, Math.round(ratio)) : 0;
    // A tool in front sits one world pixel right of its hand point, as the classic renderer has always drawn it
    // (its painter's-order nudge of +0.5 rounds up): the approved M2.3 look, kept in every mode.
    const toolX = () => ax + Math.round(tool!.dx * ratio) + (tool!.behind ? 0 : Math.round(s));
    const toolY = () => ay + Math.round(tool!.dy * ratio) + tug;
    const drawTool = () => tool && blitAt(screen, tool.sprite, toolX(), toolY(), ratio);
    // The fishing line (M10): from the rod's tip as drawn, in the rod's own layer (behind the Blobbi when the rod
    // is), to the float; the float flies there on the cast. At screen resolution, one pixel thin.
    const drawFishing = (layer: 'behind' | 'front') => {
      if (!float) return;
      const fx = Math.floor((float.x - originX) * s);
      const fy = Math.floor((float.y - originY) * s);
      const px = Math.max(1, Math.round(s));
      const floatBehind = float.y <= b.y;
      // The tip on screen: the rod's grip (its anchor, where it is blitted) plus the tip's offset from the grip.
      const tx = tool?.tip ? toolX() + Math.round((tool.tip.dx - tool.dx) * ratio) : fx;
      const ty = tool?.tip ? toolY() + Math.round((tool.tip.dy - tool.dy) * ratio) : fy;
      const k = live.castProgress(time) ?? 1;
      const at = float.landed ? { x: fx, y: fy } : flight(tx, ty, fx, fy, k, 14 * s);
      if ((tool?.behind ? 'behind' : 'front') === layer && tool?.tip && live.equipmentAnimation(time) !== 'raise') drawLine(screen, tx, ty, at.x + (px >> 1), at.y - 2 * px, float.bite || !float.landed ? 0 : Math.max(1, Math.round(2 * s)));
      if ((floatBehind && float.landed ? 'behind' : 'front') === layer) drawFloat(screen, at.x, at.y, px);
    };
    if (away) {
      // No tool in hand while teleporting; the shadow first (on the ground), then whatever of the body shows.
      const groundY = ay - Math.round(b.animator.hop(time) * s);
      drawTeleportShadow(screen, Math.max(tp.shadow(time), tp.state === 'departing' ? tp.visible(time) * 0.5 : 0), ax, groundY - Math.floor(s / 2), tp.halfWidth * s);
      const shown = teleportSprite(sprite, tp, time);
      if (shown) blitAt(screen, shown, ax, ay, ratio);
      this.teleportAnchor = { ax, groundY };
    } else {
      this.teleportAnchor = null;
      if (tool?.behind) drawTool();
      drawFishing('behind');
      blitAt(screen, sprite, ax, ay, ratio);
      if (tool && !tool.behind) drawTool();
      drawFishing('front');
    }
    this.lastBlobbi = { x: ax, y: ay, size, ratio, sprite: canonical };
    const t3 = performance.now();

    // ── 4. What stands in front, magnified onto the screen ────────────────
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
    // The teleport's travelling pixels fly in front of everything (they are up in the air).
    this.teleportParticles = this.teleportAnchor ? drawTeleportParticles(screen, tp, time, this.teleportAnchor.ax, this.teleportAnchor.groundY, s) : 0;
    const t4 = performance.now();

    // ── 5. Text, HUD and the camera indicator at the UI scale ─────────────
    // A bubble over the Blobbi rests on the head as drawn (its native height in world pixels), not as simulated.
    const drawnHeight = size / restScale;
    for (const t of this.layers.texts) {
      const y = t.head ? t.y + t.head - drawnHeight : t.y;
      this.drawText(screen, t, (t.x - originX) * s, (y - originY) * s, ui.uiScale);
    }
    this.hudBox = null;
    // The same HUD at every camera scale (M10 phase B: the zoom never changes its design).
    this.identityBox = null;
    if (ui.hud) this.drawHud(screen, ui.uiScale, ui);
    // The goal box, the prompt and goal notices are part of the HUD unless set on their own.
    if (ui.goals ?? ui.hud) this.drawGoal(screen, ui.uiScale);
    if (ui.prompt ?? ui.hud) this.drawPrompt(screen, ui.uiScale, ui.bottom ?? 0, ui.promptAvoid ?? null);
    if (ui.hud) this.drawNotice(screen, ui.uiScale);
    this.indicatorBox = null;
    if (ui.indicator) this.drawIndicator(screen, view, ui.uiScale);
    const t5 = performance.now();
    this.timings.world = t1 - t0;
    this.timings.compose = t2 - t1 + (t4 - t3);
    this.timings.blobbi = t3 - t2;
    this.timings.ui = t5 - t4;
    this.timings.total = t5 - t0;
    return screen;
  }

  /**
   * HUD pieces are built at the UI scale (screen resolution, M11B) and kept until their text or the language changes.
   * The key carries the language and the text size, so switching either redraws them.
   */
  private cachedText(key: string, make: (scale: number) => PixelBuffer, scale: number): PixelBuffer {
    const k = `${scale}|${getLocale()}|${textPreference.smaller ? 's' : 'n'}|${key}`;
    let hit = this.textCache.get(k);
    if (!hit) {
      hit = make(scale);
      if (this.textCache.size > 64) this.textCache.clear();
      this.textCache.set(k, hit);
    }
    return hit;
  }

  private drawText(screen: PixelBuffer, t: FrameText, sx: number, sy: number, ui: number): void {
    const buf = this.cachedText(`${t.kind}|${t.text}|${t.color}|${t.background}`, (scale) => {
      const tw = new UiSurface(1, 1, scale).measure(t.text);
      const w = tw + (t.kind === 'bubble' ? 5 : 4);
      const h = 9;
      const b = new UiSurface(w + 2, h + 4, scale);
      b.fillRect(1, 1, w, h, t.background);
      if (t.kind === 'bubble') {
        b.strokeRect(0, 0, w + 2, h + 2, t.color);
        const tail = Math.floor((w + 2) / 2);
        b.set(tail, h + 1, t.color);
        b.set(tail, h + 2, t.color);
      }
      b.text(t.text, 3, 3, t.color);
      return b.out;
    }, ui);
    // A bubble's tail points at (sx, sy); a label hangs from its top-centre.
    const x = Math.round(sx - buf.width / 2);
    const y = t.kind === 'bubble' ? Math.round(sy - buf.height) : Math.round(sy);
    screen.blit(buf, x, y);
  }

  private drawHud(screen: PixelBuffer, ui: number, opts: Pick<ViewUiOptions, 'identity' | 'blobbiName'> = {}): void {
    const live = this.live;
    const palette = paletteFor(live.world.options.palette);
    // The status card: portrait, name, friendship, the three needs and what is carried.
    const c = live.care;
    const steps = (v: number) => Math.round(v / 10) * 10;
    const counts = live.counts();
    const food = FOODS.reduce((n, f) => n + live.inventory.count(f), 0);
    // What is carried, by its name in the player's language (plural names: "wood 6  sticks 4").
    const carried = ([[itemPlural(ITEMS.wood.id), live.inventory.count(ITEMS.wood.id)], ...BASIC_KINDS.map((k) => [itemPlural(RESOURCE_ITEM[k]), counts[k]]), [lang('hud.food'), food]] as [string, number][])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, n]) => `${k} ${n}`);
    const away = live.getPresenceState() !== 'present';
    const level = friendLevel(live.companion.friendship);
    const info: StatusInfo = { name: opts.blobbiName || (live.blobbi.seed.length > 14 ? 'Blobbi' : live.blobbi.seed), title: FRIEND_TITLES[Math.max(0, level - 1)], fed: steps(c.hunger), energy: steps(c.energy), joy: steps(c.happiness), carried, face: null, away };
    const status = this.cachedText(`status|${JSON.stringify(info)}`, (k) => statusCard({ ...info, face: this.portrait() }, k), ui);
    screen.blit(status, 2 * ui, 2 * ui);
    let bottom = 2 * ui + status.height;
    // M11C: Guest or Connected, small, right under the card (the toasts follow it).
    if (opts.identity) {
      const chip = this.cachedText(`identity|${opts.identity}`, (k) => identityChip(opts.identity === 'connected', k), ui);
      this.identityBox = { x: 2 * ui, y: bottom + ui, w: chip.width, h: chip.height };
      screen.blit(chip, 2 * ui, bottom + ui);
      bottom += chip.height + ui;
    }
    // Item toasts under the card, newest last; they slide in (unless motion is reduced) and leave on time. Sim
    // time keeps frames deterministic, and a toast waits while a menu pauses the world.
    const now = live.clock.time;
    this.toasts.update(live.inventory, now);
    for (const t of this.toasts.toasts) {
      const text = `+${t.quantity} ${t.quantity > 1 ? itemPlural(t.item) : itemLabel(t.item)}`;
      const card = this.cachedText(`toast|${t.item}|${text}`, (k) => toastCard(itemIcon(t.item, palette), text, k), ui);
      const age = now - t.at;
      const slide = this.reducedMotion ? 0 : Math.round(Math.max(0, 1 - age / 0.18) * -card.width);
      screen.blit(card, 2 * ui + slide, bottom + ui);
      bottom += card.height + ui;
    }
    // The tool in hand is shown by the hotbar (M11C, drawn by the game UI), not here.
    this.hudBox = { right: 2 * ui + status.width, bottom: this.identityBox ? this.identityBox.y + this.identityBox.h : 2 * ui + status.height };
  }

  /** The Blobbi's face for the status card: its canonical front sprite at the gameplay size. */
  private portrait(): PixelBuffer {
    const s = this.live.blobbiSprite({ ...REST_POSE });
    const b = s.buffer;
    // Crop to 16×16 around the body (the portrait frame is 18 px).
    const out = new PixelBuffer(16, 16);
    out.blit(b, 8 - s.anchorX, 16 - 1 - s.anchorY + 1);
    return out;
  }

  /** Item toasts (the bag watched between frames). */
  readonly toasts = new ToastFeed();
  /** Calmer HUD motion (the playground copies the setting). */
  reducedMotion = false;

  /** Where the HUD ended last frame (the goal box moves under it on a narrow screen). */
  private hudBox: { right: number; bottom: number } | null = null;

  /** The time and weather chip, then the current objective, in the top-right corner. */
  private drawGoal(screen: PixelBuffer, ui: number): void {
    const live = this.live;
    const t = live.worldTime;
    const hour = hourAt(t);
    const rain = live.rainNow();
    const chip = this.cachedText(`time|${dayAt(t)}|${Math.floor(hour * 6)}|${rain > 0.45 ? 2 : rain > 0.2 ? 1 : 0}`, (k) => timeChip(dayAt(t), hour, rain, k), ui);
    const hud = this.hudBox;
    const narrow = (w: number) => !!hud && screen.width - w - 2 * ui < hud.right + 4 * ui;
    let y = 2 * ui;
    if (!narrow(chip.width)) {
      screen.blit(chip, screen.width - chip.width - 2 * ui, y);
      y += chip.height + ui;
    }
    // A visitor sees where it is and how to go home, not the host's story.
    if (live.visitor) {
      const text = upper(lang('hud.visiting', { name: live.visitLabel || lang('hud.anIsland') }));
      const chipV = this.cachedText(`visit|${text}`, (k) => toastCard(null, text, k), ui);
      if (narrow(chipV.width)) screen.blit(chipV, 2 * ui, (hud?.bottom ?? 0) + ui);
      else screen.blit(chipV, screen.width - chipV.width - 2 * ui, y);
      return;
    }
    const goal = currentObjective(live.objectives);
    let below = y;
    if (goal) {
      const n = OBJECTIVES.indexOf(goal) + 1;
      const progress = live.questProgress(goal);
      const buf = this.cachedText(`goal|${n}|${goal.title}|${progress}`, (k) => goalCard(n, OBJECTIVES.length, goal.title, progress, k), ui);
      const gx = narrow(buf.width) ? 2 * ui : screen.width - buf.width - 2 * ui;
      const gy = narrow(buf.width) ? (hud?.bottom ?? 0) + ui : y;
      screen.blit(buf, gx, gy);
      below = gy + buf.height + ui;
    }
    // M10 phase C: one pinned side quest, small, under the main goal (never more than one).
    const pinned = live.pinnedObjective();
    if (!pinned) return;
    const progress = live.questProgress(pinned);
    const card = this.cachedText(`pinned|${pinned.title}|${progress}`, (k) => pinnedCard(pinned.title, progress, k), ui);
    const px = narrow(card.width) ? 2 * ui : screen.width - card.width - 2 * ui;
    const py = goal ? below : narrow(card.width) ? (hud?.bottom ?? 0) + ui : y;
    screen.blit(card, px, py);
  }

  /** What E would do now, centred at the bottom. */
  private drawPrompt(screen: PixelBuffer, ui: number, bottom = 0, avoid: { x: number; y: number; w: number; h: number } | null = null): void {
    const text = this.live.prompt();
    if (!text) return;
    const buf = this.cachedText(`prompt|${text}`, (scale) => {
      // The key, in yellow and in the 3×5 capitals, when the prompt starts with one; then the words.
      const key = /^(\S) {2}/.exec(text);
      const words = sentence(key ? text.slice(key[0].length) : text);
      const probe = new UiSurface(1, 1, scale);
      const kw = key ? probe.measure(key[1], 'title') + 6 : 0;
      const w = kw + probe.measure(words) + 7;
      const b = new UiSurface(w, 11, scale);
      b.fillRect(0, 0, w, 11, hex('#1b1f2a'));
      b.strokeRect(0, 0, w, 11, hex('#4a5068'));
      if (key) b.text(key[1], 3, 3, hex('#ffe07a'), 'title');
      b.text(words, 3 + kw, 3, hex('#fffaf0'));
      return b.out;
    }, ui);
    let x = Math.round(screen.width / 2 - buf.width / 2);
    const y = screen.height - buf.height - Math.max(14 * ui, bottom + 3 * ui);
    // Beside the hotbar rather than over it (a narrow phone, a long prompt).
    if (avoid && x < avoid.x + avoid.w && avoid.x < x + buf.width && y < avoid.y + avoid.h && avoid.y < y + buf.height) x = Math.min(screen.width - buf.width, avoid.x + avoid.w + 2 * ui);
    screen.blit(buf, x, y);
  }

  /** A completed objective and its reward, centred at the top for a few seconds. */
  private drawNotice(screen: PixelBuffer, ui: number): void {
    const notice = this.live.notices[0];
    if (!notice) return;
    const line1 = `${sentence(notice.heading)}: ${notice.title}`;
    const line2 = sentence(notice.text);
    const buf = this.cachedText(`notice|${line1}|${line2}`, (scale) => {
      const probe = new UiSurface(1, 1, scale);
      const w1 = probe.measure(line1);
      const w2 = probe.measure(line2);
      const w = Math.max(w1, w2) + 9;
      const b = new UiSurface(w, 17, scale);
      b.fillRect(0, 0, w, 17, hex('#2b2340'));
      b.strokeRect(0, 0, w, 17, hex('#ffe07a'));
      b.text(line1, Math.round((w - w1) / 2), 3, hex('#ffe07a'));
      b.text(line2, Math.round((w - w2) / 2), 10, hex('#f4efe4'));
      return b.out;
    }, ui);
    screen.blit(buf, Math.round(screen.width / 2 - buf.width / 2), 16 * ui);
  }

  /** "Z CAMERA  EXPLORATION 2X" and a pip per mode, the active one lit, in the bottom-left corner (tappable). */
  private drawIndicator(screen: PixelBuffer, view: ViewRect, ui: number): void {
    const mode = CAMERA_MODES[view.mode];
    const scaleText = Number.isInteger(view.scale) ? `${view.scale}X` : '';
    const text = `${upper(lang('hud.camera'))}  ${mode.label} ${scaleText}`.trimEnd();
    const buf = this.cachedText(`cam|${text}`, (scale) => {
      const pips = CAMERA_CYCLE.length * 4 + 2;
      const w = new UiSurface(1, 1, scale).measure(text) + 3 + pips;
      const b = new UiSurface(w, 9, scale);
      b.fillRect(0, 0, w, 9, hex('#1b1f2a'));
      CAMERA_CYCLE.forEach((id, i) => b.fillRect(2 + i * 4, 3, 3, 3, id === view.mode ? hex('#ffe07a') : hex('#4a5068')));
      b.text(text, pips + 1, 2, hex('#f4efe4'));
      return b.out;
    }, ui);
    screen.blit(buf, 2 * ui, screen.height - buf.height - 2 * ui);
    this.indicatorBox = { x: 2 * ui, y: screen.height - buf.height - 2 * ui, w: buf.width, h: buf.height };
  }

  /** Where the camera indicator was drawn last frame: a click or a tap on it changes the camera (M10). */
  indicatorBox: { x: number; y: number; w: number; h: number } | null = null;

  /** Whether screen point (x, y) is on the camera indicator (with a finger's margin). */
  /** Where the HUD's top-left cards (status, identity) end, in screen pixels (0 without a HUD). */
  get hudBottom(): number {
    return this.hudBox?.bottom ?? 0;
  }

  /** Where the Guest / Connected chip was drawn last frame: a click or a tap on it opens the ACCOUNT page (M11C). */
  identityBox: { x: number; y: number; w: number; h: number } | null = null;

  onIdentity(x: number, y: number, margin = 4): boolean {
    const b = this.identityBox;
    return !!b && x >= b.x - margin && x < b.x + b.w + margin && y >= b.y - margin && y < b.y + b.h + margin;
  }

  onIndicator(x: number, y: number, margin = 6): boolean {
    const b = this.indicatorBox;
    return !!b && x >= b.x - margin && x < b.x + b.w + margin && y >= b.y - margin && y < b.y + b.h + margin;
  }
}

/** For each source index, the half-open range of destination indices that sample it (the map is monotonic). */
function spans(map: Int32Array, n: number, reuse?: Spans): Spans {
  const fits = reuse && reuse.start.length === n;
  const start = fits ? reuse.start.fill(0) : new Int32Array(n);
  const end = fits ? reuse.end.fill(0) : new Int32Array(n);
  for (let i = map.length - 1; i >= 0; i--) start[map[i]] = i;
  for (let i = 0; i < map.length; i++) end[map[i]] = i + 1;
  return { start, end };
}

interface Spans {
  start: Int32Array;
  end: Int32Array;
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

