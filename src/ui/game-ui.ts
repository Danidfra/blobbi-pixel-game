/**
 * THE GAME UI: menus over the play view. One screen at a time (inventory, storage, crafting, journal, care,
 * cooking, settings), drawn as a pixel panel at a whole-number scale that fits the view.
 *
 * INPUT. While a screen is open the UI takes every key: movement keys move the selection, never the Blobbi, and
 * gameplay keys do nothing; the playground does not step the world while `capturing` (menus pause the game).
 * Keys that open screens (I, K, J, U, Esc) work from play. Mouse and touch: a press runs the hit region under it
 * (slots select, buttons act); the small menu bar in the corner opens screens when nothing is open.
 *
 * The UI holds no game state of its own beyond what is on screen: every action calls the live world's public
 * methods (equip, feed, transfer, craft...), the same ones the keyboard uses, so menus can never duplicate items.
 */
import { PixelBuffer } from '../core/pixel';
import type { WorldPalette } from '../core/palette';
import type { LiveWorld } from '../sim/live-world';
import type { Building } from '../game/buildings';
import { Gfx, UI, type Hit } from './gfx';
import { card } from './hud';
import { getLocale, t, upper, type MessageKey } from '../i18n';
import { drawHotbar, hotbarSlots, selectHotbarSlot } from './hotbar';
import type { AccountInvite } from './account-invite';
import { REST_POSE } from '../blobbi/sprite';

export type ScreenId = 'inventory' | 'storage' | 'crafting' | 'journal' | 'care' | 'cooking' | 'settings' | 'carrier' | 'map' | 'growth' | 'worlds' | 'home' | 'guide' | 'blobbis' | 'identity' | 'naming' | 'travel';

export interface Screen {
  readonly id: ScreenId;
  title(ui: GameUI): string;
  /** Draw the body inside (x, y, w, h) of the panel. */
  draw(g: Gfx, ui: GameUI, x: number, y: number, w: number, h: number): void;
  /** A key while open; true when used. */
  key(code: string, shift: boolean, ui: GameUI): boolean;
  /** Called when the screen opens (selection reset etc.). */
  opened?(ui: GameUI): void;
  /** The placed object the screen is about (a chest, a stove), when it has one. */
  target?: Building | null;
}

/** The panel's size in UI pixels; the scale is the largest whole number that fits the view. */
export const PANEL_W = 304;
export const PANEL_H = 184;

/** Keys that open a screen from play. */
export const OPEN_KEYS: Readonly<Record<string, ScreenId>> = { KeyI: 'inventory', KeyK: 'crafting', KeyJ: 'journal', KeyU: 'care', KeyN: 'map', KeyL: 'growth', KeyY: 'travel', Digit0: 'home', Home: 'home', Slash: 'guide', F1: 'guide' };

export interface UiSettings {
  /** Day and night lighting (presentation only). */
  daylight: boolean;
  /** The goal box in the corner. */
  goals: boolean;
  /** Sound hooks enabled (events are emitted for an audio layer; there is no audio yet). */
  sound: boolean;
  /** UI scale: 0 automatic, else 1-3. */
  scale: number;
  /** Calmer motion: shorter teleports with fewer pixels, no camera choreography, softer effects. */
  reducedMotion: boolean;
  /** Before M11B: a larger HUD (3× instead of 2×). Read once into `textSize` ('large'), then kept false. */
  largeText: boolean;
  /** Text size (M11B): how large menus, the HUD and tips may be drawn. Presentation only. */
  textSize: TextSize;
}

export type TextSize = 'small' | 'normal' | 'large';
export const TEXT_SIZES: readonly TextSize[] = ['small', 'normal', 'large'];

export const DEFAULT_SETTINGS: UiSettings = { daylight: true, goals: true, sound: true, scale: 0, reducedMotion: false, largeText: false, textSize: 'normal' };

/**
 * Settings read from a browser (any older shape): unknown fields dropped, bad values replaced by defaults, and the
 * pre-M11B "large HUD text" carried over as the large text size.
 */
export function readSettings(raw: unknown, base: UiSettings = DEFAULT_SETTINGS): UiSettings {
  const out: UiSettings = { ...base };
  if (!raw || typeof raw !== 'object') return out;
  const v = raw as Record<string, unknown>;
  for (const k of ['daylight', 'goals', 'sound', 'reducedMotion'] as const) if (typeof v[k] === 'boolean') out[k] = v[k] as boolean;
  if (typeof v.scale === 'number' && [0, 1, 2, 3].includes(v.scale)) out.scale = v.scale;
  if (TEXT_SIZES.includes(v.textSize as TextSize)) out.textSize = v.textSize as TextSize;
  else if (v.largeText === true) out.textSize = 'large';
  out.largeText = false;
  return out;
}

/**
 * M11D.1, REDUCED MOTION FOLLOWS THE SYSTEM UNTIL THE PLAYER CHOOSES. The settings record used to store
 * `reducedMotion` whenever ANY setting changed, so the system preference of that moment (or a toggle made once while
 * testing) was frozen for good, silently: every later intro played its short reduced form (the Carrier's shadow
 * already there, a one-second surfacing). Now the record keeps `reducedMotion` only beside `reducedMotionChosen: true`,
 * set when the player toggles it in SETTINGS. Records written before M11D.1 (a stored value, no marker) are kept
 * exactly as they read before: their value may have been a real choice, and an accessibility setting is never
 * dropped by an update.
 */
export function reducedMotionChosen(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const v = raw as Record<string, unknown>;
  if (typeof v.reducedMotion !== 'boolean') return false;
  return v.reducedMotionChosen === true || !('reducedMotionChosen' in v);
}

/** The settings as stored: `reducedMotion` (with its marker) only when the player chose it; else left to the system. */
export function settingsRecord(s: UiSettings, chosen: boolean): Record<string, unknown> {
  const { reducedMotion, ...rest } = s;
  return chosen ? { ...rest, reducedMotion, reducedMotionChosen: true } : { ...rest, reducedMotionChosen: false };
}

/** Settings read from a record, the system's reduced motion used unless the record holds the player's own choice. */
export function readStoredSettings(raw: unknown, base: UiSettings, systemReduced: boolean): { settings: UiSettings; chosen: boolean } {
  const chosen = reducedMotionChosen(raw);
  const settings = readSettings(raw, { ...base, reducedMotion: systemReduced });
  if (!chosen) settings.reducedMotion = systemReduced;
  return { settings, chosen };
}

/** The HUD's scale for a text size (the HUD is not a fixed panel: it can always grow). */
export const hudScale = (s: Pick<UiSettings, 'textSize'>): number => (s.textSize === 'large' ? 3 : 2);
/** The largest menu scale a text size allows (menus use less when the screen is smaller). */
export const MENU_SCALE_CAP: Readonly<Record<TextSize, number>> = { small: 2, normal: 3, large: 4 };

export class GameUI {
  screen: Screen | null = null;
  /** The last action's answer, shown in the panel's footer for a moment. */
  message: { text: string; good: boolean; until: number } | null = null;
  settings: UiSettings = { ...DEFAULT_SETTINGS };
  private readonly screens = new Map<ScreenId, Screen>();
  /** Hit regions of the last frame, in screen pixels. */
  private hits: Hit[] = [];
  private lastScale = 2;
  /** Real seconds, for message timing (the world may be paused). */
  now = 0;

  constructor(
    readonly getLive: () => LiveWorld | null,
    readonly palette: () => WorldPalette,
  ) {}

  register(screen: Screen): void {
    this.screens.set(screen.id, screen);
  }

  get live(): LiveWorld | null {
    return this.getLive();
  }

  /** A screen is open: the UI owns the keyboard and the world is paused. */
  get capturing(): boolean {
    return this.screen !== null;
  }

  /** Where the last panel (or menu bar) was drawn, to turn a press into panel pixels. */
  private panelOrigin = { x: 0, y: 0, scale: 1 };
  /** When the current panel opened (real seconds), for its short slide-in. */
  private openedAt = -1;
  /** The pointer over the canvas (screen pixels), for hover highlights and tooltips; null without one. */
  pointerAt: { x: number; y: number } | null = null;
  private hoverSince = 0;
  private hoverHit: Hit | null = null;

  /** UI sounds (open, close, select, confirm, deny), for the audio layer. */
  onSound: ((name: string) => void) | null = null;

  open(id: ScreenId): boolean {
    const s = this.screens.get(id);
    if (!s || !this.live) return false;
    if (this.screen !== s) {
      this.onSound?.('ui-open');
      this.openedAt = this.now;
    }
    this.screen = s;
    this.message = null;
    this.live?.noteEvent(`open:${id}`);
    s.opened?.(this);
    return true;
  }

  close(): void {
    if (this.screen) this.onSound?.('ui-close');
    this.screen = null;
    this.message = null;
  }

  /** Open the journal on a note (special items that can be read). */
  openNote(item: string): void {
    this.noteToShow = item;
    this.open('journal');
  }
  /** The note the journal should show when it opens. */
  noteToShow: string | null = null;
  /** What the USE button does (the playground presses E). */
  onUse: (() => void) | null = null;

  say(text: string, good = true): void {
    if (!good) this.onSound?.('ui-deny');
    this.message = { text, good, until: this.now + 2.5 };
  }

  /**
   * A key press. Returns true when the UI used it, in which case the caller must not treat it as gameplay.
   * With a screen open every key is used (movement included) so nothing leaks into the world.
   */
  handleKey(code: string, shift = false): boolean {
    if (this.screen) {
      if (code === 'Escape' || OPEN_KEYS[code] === this.screen.id || (code === 'KeyI' && this.screen.id === 'storage')) {
        this.close();
        return true;
      }
      const used = this.screen.key(code, shift, this);
      if (used) this.onSound?.(isConfirm(code) ? 'ui-confirm' : 'ui-select');
      else if (OPEN_KEYS[code]) this.open(OPEN_KEYS[code]);
      return true;
    }
    if (OPEN_KEYS[code]) return this.open(OPEN_KEYS[code]);
    if (code === 'Escape') {
      // Escape first leaves a mode (build, move, placing) — the caller handles that; settings only from plain play.
      const live = this.live;
      if (live && (live.buildMode || live.placing || live.manage)) return false;
      return this.open('settings');
    }
    return false;
  }

  /** A pointer press at screen pixels. True when it hit the UI. */
  handlePointer(sx: number, sy: number): boolean {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (sx >= h.x && sy >= h.y && sx < h.x + h.w && sy < h.y + h.h) {
        if (h.inert) return true;
        this.onSound?.('ui-select');
        const o = this.panelOrigin;
        h.action(Math.floor((sx - o.x) / o.scale), Math.floor((sy - o.y) / o.scale));
        return true;
      }
    }
    // A press outside an open panel closes it (touch-friendly), anything else is the world's.
    if (this.screen) {
      this.close();
      return true;
    }
    return false;
  }

  /**
   * The whole-number scale the panel uses on a screen of this size: as large as fits (with a 2 pixel margin each side),
   * up to the text size's cap. A manual menu scale (older settings) still wins.
   */
  scaleFor(w: number, h: number): number {
    if (this.settings.scale > 0) return this.settings.scale;
    const cap = MENU_SCALE_CAP[this.settings.textSize] ?? 3;
    return Math.max(1, Math.min(cap, Math.floor(Math.min((w - 4) / PANEL_W, (h - 4) / PANEL_H))));
  }

  /** Open what the world asked for (E on a chest, a stove, a workbench). */
  poll(): void {
    const live = this.live;
    const req = live?.uiRequest;
    if (!live || !req) return;
    live.uiRequest = null;
    const s = this.screens.get(req.screen);
    if (!s) return;
    s.target = req.target;
    this.open(req.screen);
  }

  /** Draw the open screen (or the menu bar) over a finished frame. */
  render(screen: PixelBuffer, realTime: number): void {
    this.now = realTime;
    this.poll();
    if (this.message && realTime >= this.message.until) this.message = null;
    this.hits = [];
    const scale = (this.lastScale = this.scaleFor(screen.width, screen.height));
    this.hotbarBox = null;
    this.tipBox = null;
    this.inviteBox = null;
    if (!this.screen) {
      this.drawMenuBar(screen, Math.max(1, Math.min(2, scale)));
      this.drawHotbar(screen, hudScale(this.settings));
      this.drawTip(screen, hudScale(this.settings));
      this.drawInvite(screen, hudScale(this.settings));
      return;
    }
    // Dim the world behind the panel.
    const d = screen.data;
    for (let i = 0; i < d.length; i++) {
      const c = d[i];
      d[i] = (c & 0xff000000) | ((((c >>> 16) & 0xff) >>> 1) << 16) | ((((c >>> 8) & 0xff) >>> 1) << 8) | ((c & 0xff) >>> 1);
    }
    // The panel slides up a few pixels as it opens (not with reduced motion), then holds still.
    const opening = this.settings.reducedMotion ? 0 : Math.max(0, 1 - (realTime - this.openedAt) / 0.14);
    const ox0 = Math.floor((screen.width - PANEL_W * scale) / 2);
    const oy0 = Math.floor((screen.height - PANEL_H * scale) / 2) + Math.round(opening * 6) * scale;
    const g = new Gfx(PANEL_W, PANEL_H, scale);
    if (this.pointerAt) g.hover = { x: Math.floor((this.pointerAt.x - ox0) / scale), y: Math.floor((this.pointerAt.y - oy0) / scale) };
    g.buf.blit(card(PANEL_W, PANEL_H), 0, 0);
    // The panel's own background takes presses first-registered (so lowest priority): a press inside the panel that
    // misses every control (a disabled button, a gap) does nothing, and only a press outside the panel closes it.
    g.hits.push({ x: 0, y: 0, w: PANEL_W, h: PANEL_H, action: () => {}, inert: true });
    g.box(1, 1, PANEL_W - 2, 11, UI.title, null);
    g.buf.fillRect(1, 12, PANEL_W - 2, 1, UI.line);
    // The title in the 3×5 capitals; a long one (counts, other languages) in the narrower body capitals, cut to fit.
    const title = upper(this.screen.title(this));
    const room = PANEL_W - 22;
    if (g.measure(title, 'title') <= room) g.heading(title, 5, 4, UI.accent);
    else {
      let fit = title;
      while (fit.length > 1 && g.measure(fit) > room) fit = fit.slice(0, -2) + '…';
      g.text(fit, 5, 4, UI.accent);
    }
    g.button('X', PANEL_W - 13, 1, () => this.close(), { w: 12 });
    this.screen.draw(g, this, 4, 15, PANEL_W - 8, PANEL_H - 27);
    // Footer: the last answer, or the keys.
    if (this.message) g.text(g.lines(this.message.text, PANEL_W - 10)[0] ?? '', 5, PANEL_H - 9, this.message.good ? UI.good : UI.bad);
    // A tooltip for the hit under a resting pointer.
    const over = g.hover ? [...g.hits].reverse().find((h) => g.hovered(h.x, h.y, h.w, h.h)) ?? null : null;
    if (over !== this.hoverHit) {
      this.hoverHit = over;
      this.hoverSince = realTime;
    }
    if (over?.tip && realTime - this.hoverSince > 0.35 && g.hover) {
      const tip = over.tip;
      const tw = g.measure(tip) + 6;
      const tx = Math.max(1, Math.min(PANEL_W - tw - 1, g.hover.x + 4));
      const ty = Math.max(1, Math.min(PANEL_H - 12, g.hover.y + 8));
      g.buf.blit(card(tw, 11, UI.accent), tx, ty);
      g.text(tip, tx + 3, ty + 3, UI.ink);
    }
    const ox = ox0;
    const oy = oy0;
    this.panelOrigin = { x: ox, y: oy, scale };
    screen.blit(g.out, ox, oy);
    this.hits = g.screenHits(ox, oy);
  }

  /** Touch is in use (tips say "tap" instead of naming keys). */
  touchMode = false;

  /**
   * The tutorial's tip (M8): one short card above the action prompt, with SKIP TIPS. A step just done shows "NICE!"
   * for a moment instead. Never shown while a menu is open.
   */
  private drawTip(screen: PixelBuffer, scale: number): void {
    const live = this.live;
    if (!live || live.visitor) return;
    const tip = live.tutorialTip();
    const justDone = !tip && live.tipJustDone && !live.tutorial.skipped;
    if (!tip && !justDone) return;
    const text = tip ? (this.touchMode ? tip.touch : tip.keys) : t('tip.nice');
    const maxW = Math.min(220, Math.floor(screen.width / scale) - 16);
    const measure = new Gfx(1, 1, scale);
    // "TIP" in the 3×5 capitals, the words after it, SKIP TIPS on the right; each as wide as its language needs.
    const head = upper(t('tip.tip'));
    const textX = tip ? 4 + measure.measure(head, 'title') + 5 : 6;
    const skip = upper(t('tip.skip'));
    const sw = Math.max(34, measure.measure(skip) + 6);
    const lines = tip ? measure.lines(text, maxW - textX - sw - 6) : [text];
    const w = tip ? maxW : Math.max(30, measure.measure(text) + 12);
    const h = 6 + lines.length * 7 + 1;
    const g = new Gfx(w, h, scale);
    g.buf.blit(card(w, h, tip ? UI.accent : UI.good), 0, 0);
    if (tip) g.heading(head, 4, 3, UI.accent);
    lines.forEach((l, i) => g.text(l, textX, 3 + i * 7, tip ? UI.ink : UI.good));
    if (tip) g.button(skip, w - sw - 2, Math.floor((h - 11) / 2), () => live.setTips(false), { w: sw });
    const big = g.out;
    const ox = Math.round(screen.width / 2 - big.width / 2);
    // Above the action prompt and clear of the menu bar (which may be two rows on a phone).
    let ox2 = ox;
    let oy = Math.max(0, Math.min(screen.height - big.height - 30 * scale, screen.height - this.menuBarHeight - big.height - 18 * scale));
    // Never over the hotbar (M11C): beside it when there is room, else above it.
    const hb = this.hotbarBox;
    if (hb && ox2 < hb.x + hb.w && hb.x < ox2 + big.width && oy < hb.y + hb.h && hb.y < oy + big.height) {
      if (hb.x + hb.w + 2 * scale + big.width <= screen.width - 2 * scale) ox2 = hb.x + hb.w + 2 * scale;
      else oy = Math.max(0, hb.y - big.height - 2 * scale);
    }
    screen.blit(big, ox2, oy);
    this.tipBox = { x: ox2, y: oy, w: big.width, h: big.height };
    this.hits.push(...g.screenHits(ox2, oy));
    if (justDone && live.clock.time - live.tipDoneAt > 1.6) live.tipJustDone = null;
  }

  /** Screen pixels the menu bar (and mode bar) take at the bottom (the touch USE button sits above them). */
  menuBarHeight = 30;
  /** Where the menu bar was drawn last (screen pixels). */
  private menuBox: { x: number; y: number; w: number; h: number } | null = null;
  /** The screen's safe-area insets (screen pixels), set by the playground. */
  insets = { top: 0, right: 0, bottom: 0, left: 0 };
  /** Where the hotbar was drawn this frame (screen pixels), or null when it is not shown. */
  hotbarBox: { x: number; y: number; w: number; h: number } | null = null;
  private hotbarCache: { key: string; out: PixelBuffer; slotRects: { x: number; y: number; w: number; h: number }[] } | null = null;

  /**
   * The tool hotbar (M11C), bottom left above the camera indicator, or above the menu bar when a narrow screen's bar
   * reaches that far. Hidden for a visitor, while building, placing or moving (the mode's own buttons sit there), and
   * when the player owns no tool. On a touch screen the slots are larger (22 UI pixels: 44 screen pixels at 2x).
   */
  private drawHotbar(screen: PixelBuffer, hud: number): void {
    const live = this.live;
    if (!live || live.visitor || live.buildMode || live.placing || live.manage || live.moving) return;
    const slots = hotbarSlots((id) => live.inventory.count(id), live.equipped);
    if (!slots.length) return;
    const s = hud;
    const key = `${slots.map((x) => x.item).join(',')}|${live.equipped}|${s}|${this.touchMode}|${getLocale()}|${live.world.options.palette}`;
    if (this.hotbarCache?.key !== key) this.hotbarCache = { key, ...drawHotbar(slots, live.equipped, this.palette(), { scale: s, touch: this.touchMode }) };
    const { out, slotRects } = this.hotbarCache;
    const ox = this.insets.left + 2 * hud;
    let oy = screen.height - this.insets.bottom - 13 * hud - out.height;
    const m = this.menuBox;
    if (m && ox < m.x + m.w && m.x < ox + out.width && oy < m.y + m.h && m.y < oy + out.height) oy = m.y - out.height - 2 * s;
    oy = Math.max(0, oy);
    screen.blit(out, ox, oy);
    this.hotbarBox = { x: ox, y: oy, w: out.width, h: out.height };
    // The card itself takes presses (a near miss between slots must not walk the Blobbi), the slots pick a tool.
    this.hits.push({ x: ox, y: oy, w: out.width, h: out.height, action: () => {}, inert: true });
    slotRects.forEach((r, i) => this.hits.push({ x: ox + r.x * s, y: oy + r.y * s, w: r.w * s, h: r.h * s, action: () => this.pickTool(i) }));
  }

  /** Where the tip and the invitation were drawn this frame (screen pixels). */
  tipBox: { x: number; y: number; w: number; h: number } | null = null;
  inviteBox: { x: number; y: number; w: number; h: number } | null = null;
  /** M11C.5: the gentle account invitation (owned by the playground), and what EXPLORE ACCOUNTS does. */
  invite: AccountInvite | null = null;
  /** Where the HUD's top-left cards end (screen pixels; the playground sets it): the card stays below when it can. */
  hudBottom = 0;
  onInviteExplore: (() => void) | null = null;
  /** M11D.5: the walking Blobbi's name for the invitation (the playground sets it). */
  inviteName: () => string = () => 'Blobbi';

  /**
   * The account invitation card (M11C.5): the player's Blobbi, a title, two short lines, EXPLORE ACCOUNTS, MAYBE LATER
   * and a "don't show this again" box. A floating card at the bottom right on a keyboard screen; on a touch screen
   * a wider card above the menu bar, the hotbar and USE. It never pauses the world and takes no key: only its own
   * presses (the rest of the screen plays on).
   */
  private drawInvite(screen: PixelBuffer, s: number): void {
    const inv = this.invite;
    const live = this.live;
    if (!inv?.visible || !live) return;
    const touch = this.touchMode;
    const avail = Math.floor((screen.width - this.insets.left - this.insets.right) / s) - 8;
    const w = Math.max(150, Math.min(touch ? 300 : 210, avail));
    const probe = new Gfx(1, 1, s);
    const pic = 20;
    const textX = 4 + pic + 5;
    const textW = w - textX - 4;
    // M11D.5: the Blobbi's own curiosity, by its real name, then one line of what an account brings.
    const title = probe.lines(t('invite.title', { name: this.inviteName() }), textW);
    const body = probe.lines(t('invite.body'), textW);
    const later = t('invite.later');
    const lw = probe.measure(later) + 10;
    const explore = t('invite.explore');
    const ew = probe.measure(explore) + 12;
    const label = t('invite.never');
    const tickW = 10 + probe.measure(label);
    // The tick box shares the buttons' row when it fits (a shorter card), else gets its own row above them.
    const oneRow = ew + 8 + tickW + 8 + lw + 8 <= w;
    const textH = title.length * 8 + 1 + body.length * 7;
    const top = 4 + Math.max(pic, textH) + 3;
    const boxY = oneRow ? top + 2 : top;
    const btnY = oneRow ? top : top + 11;
    const h = btnY + 11 + 4;
    const g = new Gfx(w, h, s);
    g.buf.blit(card(w, h, UI.accent), 0, 0);
    g.hits.push({ x: 0, y: 0, w, h, action: () => {}, inert: true });
    // The player's own Blobbi, as it walks (the existing sprite, cropped to the frame).
    g.box(4, 4, pic, pic, UI.slot, UI.line);
    const sprite = live.blobbiSprite({ ...REST_POSE });
    const face = new PixelBuffer(pic - 2, pic - 2);
    face.blit(sprite.buffer, Math.floor((pic - 2) / 2) - sprite.anchorX, pic - 3 - sprite.anchorY);
    g.buf.blit(face, 5, 5);
    title.forEach((l, i) => g.text(l, textX, 4 + i * 8, UI.accent));
    body.forEach((l, i) => g.text(l, textX, 4 + title.length * 8 + 1 + i * 7, UI.ink));
    g.button(explore, 4, btnY, () => {
      inv.answer('explore');
      this.onInviteExplore?.();
    }, { w: Math.min(ew, w - lw - 12), primary: true, case: 'as-is' });
    g.button(later, w - lw - 4, btnY, () => inv.answer('later'), { w: lw, case: 'as-is' });
    // "Don't show this again": a real tick box, the label pressable too.
    const tx = oneRow ? 4 + ew + 8 : 4;
    const ticked = inv.optOutTicked;
    g.box(tx, boxY, 7, 7, UI.slot, ticked ? UI.accent : UI.muted);
    if (ticked) g.buf.fillRect(tx + 2, boxY + 2, 3, 3, UI.accent);
    g.text(label, tx + 10, boxY, UI.muted);
    g.hit(tx - 2, boxY - 2, tickW + 4, 11, () => (inv.optOutTicked = !inv.optOutTicked));
    const out = g.out;
    // Above everything at the bottom (menu bar, hotbar, the touch USE button, a tip), clear of the safe area.
    let bottom = screen.height - this.insets.bottom - this.menuBarHeight - 2 * s;
    if (touch) bottom -= 40 * s; // the USE button sits above the menu bar
    const ox = touch ? Math.round((screen.width - out.width) / 2) : screen.width - this.insets.right - out.width - 2 * s;
    const over = (b: { x: number; y: number; w: number; h: number } | null) => b && b.x < ox + out.width && ox < b.x + b.w;
    if (over(this.hotbarBox)) bottom = Math.min(bottom, this.hotbarBox!.y - 2 * s);
    if (over(this.tipBox)) bottom = Math.min(bottom, this.tipBox!.y - 2 * s);
    const oy = Math.max(this.insets.top, Math.min(bottom - out.height, Math.max(this.hudBottom, bottom - out.height)));
    screen.blit(out, ox, oy);
    this.inviteBox = { x: ox, y: oy, w: out.width, h: out.height };
    this.hits.push(...g.screenHits(ox, oy));
  }

  /** A hotbar slot was clicked or tapped (or its number key pressed): the same as the bag's EQUIP / PUT AWAY. */
  pickTool(index: number): boolean {
    const live = this.live;
    if (!live || live.visitor) return false;
    return selectHotbarSlot(live, index) !== 'none';
  }

  /**
   * The corner buttons that open screens with a click or a tap. On a touch screen they are drawn larger (3× when
   * there is room) and wrap onto two rows rather than run off a narrow screen.
   */
  private drawMenuBar(screen: PixelBuffer, scale: number): void {
    if (!this.live) return;
    const key = (name: MessageKey, k: string) => `${upper(t(name))} ${k}`;
    const items: [string, ScreenId][] = [
      [key('menu.bag', 'I'), 'inventory'],
      [key('menu.craft', 'K'), 'crafting'],
      [key('menu.journal', 'J'), 'journal'],
      [key('menu.blobbi', 'U'), 'care'],
      [key('menu.map', 'N'), 'map'],
      [key('menu.home', '0'), 'home'],
      [key('menu.worlds', 'Y'), 'travel'],
      [key('menu.guide', '?'), 'guide'],
      ['...', 'settings'],
    ];
    // A finger needs no key names: shorter labels, bigger buttons.
    const label = (l: string) => (this.touchMode ? l.replace(/ (?:[A-Z0?]|E)$/, '') : l);
    const use = label(key('menu.use', 'E'));
    // Widths as the labels are drawn at a scale (M11B: the body font is narrower than the 3×5 capitals).
    const probes = new Map<number, Gfx>();
    const measureAt = (k: number, l: string) => (probes.get(k) ?? probes.set(k, new Gfx(1, 1, k)).get(k)!).measure(l);
    let s = this.touchMode ? 3 : scale;
    const widthOf = (l: string, k = s) => measureAt(k, label(l)) + 6;
    const rowW = (list: [string, ScreenId][], k = s) => list.reduce((n, [l]) => n + widthOf(l, k) + 1, 0);
    let rows: [string, ScreenId][][] = [items];
    const fits = (k: number, r: [string, ScreenId][][]) => Math.max(...r.map((row, i) => rowW(row, k) + (i === r.length - 1 ? measureAt(k, use) + 9 : 0))) * k + 4 * k <= screen.width;
    if (!fits(s, rows)) rows = [items.slice(0, 5), items.slice(5)];
    while (s > 1 && !fits(s, rows)) s--;
    const rowH = 11;
    const w = Math.max(...rows.map((row, i) => rowW(row) + (i === rows.length - 1 ? measureAt(s, use) + 9 : 0)));
    const g = new Gfx(w, rows.length * (rowH + 1), s);
    rows.forEach((row, r) => {
      const y = r * (rowH + 1);
      let x = w - rowW(row) - (r === rows.length - 1 ? measureAt(s, use) + 9 : 0);
      // USE presses E for a mouse or a touch screen (the same action as the key).
      if (r === rows.length - 1) x += g.button(use, x, y, () => this.onUse?.(), { w: measureAt(s, use) + 6, primary: true }) + 3;
      for (const [l, id] of row) x += g.button(label(l), x, y, () => this.open(id), { w: widthOf(l) }) + 1;
    });
    const big = g.out;
    const ox = screen.width - big.width - 2 * s;
    const oy = screen.height - big.height - 2 * s;
    screen.blit(big, ox, oy);
    this.hits = g.screenHits(ox, oy);
    this.menuBox = { x: ox, y: oy, w: big.width, h: big.height };
    this.menuBarHeight = big.height + 2 * s;
    this.drawModeBar(screen, s, oy);
  }

  /**
   * While building, placing or moving furniture: the mode's own buttons (so a mouse or a finger never needs Esc, B, T
   * or X): NEXT (the next buildable), STYLE, TO BAG, DONE / CANCEL. Drawn just above the menu bar, on the left.
   */
  private drawModeBar(screen: PixelBuffer, s: number, menuTop: number): void {
    const live = this.live;
    if (!live) return;
    const buttons: [string, () => void, boolean?][] = [];
    const done = upper(t('mode.done'));
    if (live.moving) buttons.push([upper(t('mode.cancelMove')), () => live.cancelMove()]);
    else if (live.placing) buttons.push([upper(t('mode.style')), () => live.cycleVariant()], [done, () => live.stopPlacing(), true]);
    else if (live.manage) buttons.push([upper(t('mode.style')), () => live.restyleSelected()], [upper(t('mode.toBag')), () => live.removeSelected()], [done, () => live.toggleManage(), true]);
    else if (live.buildMode) buttons.push([upper(t('mode.next')), () => live.cycleBuildMode()], [upper(t('mode.cancel')), () => live.setBuildMode(null)]);
    if (!buttons.length) return;
    const head = upper(t(live.moving ? 'mode.head.move' : live.placing ? 'mode.head.place' : live.manage ? 'mode.head.manage' : 'mode.head.build'));
    const probe = new Gfx(1, 1, s);
    const bw = buttons.reduce((n, [l]) => n + probe.measure(l) + 7, 0);
    const w = Math.max(bw, probe.measure(head) + 4);
    const g = new Gfx(w, 19, s);
    g.text(head, 1, 0, UI.accent);
    let x = 0;
    for (const [l, run, primary] of buttons) x += g.button(l, x, 7, run, { w: probe.measure(l) + 6, primary: !!primary }) + 1;
    const big = g.out;
    const ox = 2 * s;
    const oy = Math.max(0, menuTop - big.height - 2 * s);
    screen.blit(big, ox, oy);
    this.hits.push(...g.screenHits(ox, oy));
  }

  /** The current scale (tests and the playground). */
  get scale(): number {
    return this.lastScale;
  }

  /** Hit regions of the last render (tests click them). */
  get regions(): readonly Hit[] {
    return this.hits;
  }
}

/** Grid navigation shared by item screens: arrows and WASD move inside `count` cells of `cols` columns. */
export function moveSelection(code: string, index: number, count: number, cols: number): number | null {
  if (count === 0) return 0;
  const dx = code === 'ArrowLeft' || code === 'KeyA' ? -1 : code === 'ArrowRight' || code === 'KeyD' ? 1 : 0;
  const dy = code === 'ArrowUp' || code === 'KeyW' ? -1 : code === 'ArrowDown' || code === 'KeyS' ? 1 : 0;
  if (!dx && !dy) return null;
  const next = index + dx + dy * cols;
  return Math.max(0, Math.min(count - 1, next));
}

/** True for the keys that confirm the selection. */
export const isConfirm = (code: string): boolean => code === 'Enter' || code === 'Space' || code === 'NumpadEnter';
