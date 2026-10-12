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
import { Gfx, UI, textWidth, wrap as wrapLines, type Hit } from './gfx';
import { card } from './hud';

export type ScreenId = 'inventory' | 'storage' | 'crafting' | 'journal' | 'care' | 'cooking' | 'settings' | 'carrier' | 'map' | 'growth' | 'worlds' | 'home' | 'guide';

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
export const OPEN_KEYS: Readonly<Record<string, ScreenId>> = { KeyI: 'inventory', KeyK: 'crafting', KeyJ: 'journal', KeyU: 'care', KeyN: 'map', KeyL: 'growth', KeyY: 'worlds', Digit1: 'home', Slash: 'guide', F1: 'guide' };

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
  /** A larger HUD (3× instead of 2×) for readability. */
  largeText: boolean;
}

export const DEFAULT_SETTINGS: UiSettings = { daylight: true, goals: true, sound: true, scale: 0, reducedMotion: false, largeText: false };

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

  /** The whole-number scale the panel uses on a screen of this size. */
  scaleFor(w: number, h: number): number {
    if (this.settings.scale > 0) return this.settings.scale;
    return Math.max(1, Math.min(3, Math.floor(Math.min((w - 8) / PANEL_W, (h - 8) / PANEL_H))));
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
    if (!this.screen) {
      this.drawMenuBar(screen, Math.max(1, Math.min(2, scale)));
      this.drawTip(screen, this.settings.largeText ? 3 : 2);
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
    const g = new Gfx(PANEL_W, PANEL_H);
    if (this.pointerAt) g.hover = { x: Math.floor((this.pointerAt.x - ox0) / scale), y: Math.floor((this.pointerAt.y - oy0) / scale) };
    g.buf.blit(card(PANEL_W, PANEL_H), 0, 0);
    // The panel's own background takes presses first-registered (so lowest priority): a press inside the panel that
    // misses every control (a disabled button, a gap) does nothing, and only a press outside the panel closes it.
    g.hits.push({ x: 0, y: 0, w: PANEL_W, h: PANEL_H, action: () => {}, inert: true });
    g.box(1, 1, PANEL_W - 2, 11, UI.title, null);
    g.buf.fillRect(1, 12, PANEL_W - 2, 1, UI.line);
    const title = this.screen.title(this).toUpperCase();
    g.text(title, 5, 4, UI.accent);
    g.button('X', PANEL_W - 13, 1, () => this.close(), { w: 12 });
    this.screen.draw(g, this, 4, 15, PANEL_W - 8, PANEL_H - 27);
    // Footer: the last answer, or the keys.
    if (this.message) g.text(this.message.text.toUpperCase().slice(0, 74), 5, PANEL_H - 9, this.message.good ? UI.good : UI.bad);
    // A tooltip for the hit under a resting pointer.
    const over = g.hover ? [...g.hits].reverse().find((h) => g.hovered(h.x, h.y, h.w, h.h)) ?? null : null;
    if (over !== this.hoverHit) {
      this.hoverHit = over;
      this.hoverSince = realTime;
    }
    if (over?.tip && realTime - this.hoverSince > 0.35 && g.hover) {
      const tip = over.tip.toUpperCase();
      const tw = textWidth(tip) + 6;
      const tx = Math.max(1, Math.min(PANEL_W - tw - 1, g.hover.x + 4));
      const ty = Math.max(1, Math.min(PANEL_H - 12, g.hover.y + 8));
      g.buf.blit(card(tw, 11, UI.accent), tx, ty);
      g.text(tip, tx + 3, ty + 3, UI.ink);
    }
    const big = g.buf.scaled(scale);
    const ox = ox0;
    const oy = oy0;
    this.panelOrigin = { x: ox, y: oy, scale };
    screen.blit(big, ox, oy);
    this.hits = g.hits.map((h) => ({ ...h, x: ox + h.x * scale, y: oy + h.y * scale, w: h.w * scale, h: h.h * scale }));
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
    const text = tip ? (this.touchMode ? tip.touch : tip.keys) : 'Nice!';
    const maxW = Math.min(220, Math.floor(screen.width / scale) - 16);
    const lines = tip ? wrapLines(text.toUpperCase(), Math.floor((maxW - 62) / 4)) : ['NICE!'];
    const w = tip ? maxW : 30;
    const h = 6 + lines.length * 7 + 1;
    const g = new Gfx(w, h);
    g.buf.blit(card(w, h, tip ? UI.accent : UI.good), 0, 0);
    g.text(tip ? 'TIP' : '', 4, 3, UI.accent);
    lines.forEach((l, i) => g.text(l, tip ? 20 : 6, 3 + i * 7, tip ? UI.ink : UI.good));
    if (tip) g.button('SKIP TIPS', w - 36, Math.floor((h - 11) / 2), () => live.setTips(false), { w: 34 });
    const big = g.buf.scaled(scale);
    const ox = Math.round(screen.width / 2 - big.width / 2);
    // Above the action prompt and clear of the menu bar (which may be two rows on a phone).
    const oy = Math.max(0, Math.min(screen.height - big.height - 30 * scale, screen.height - this.menuBarHeight - big.height - 18 * scale));
    screen.blit(big, ox, oy);
    this.hits.push(...g.hits.map((hh) => ({ ...hh, x: ox + hh.x * scale, y: oy + hh.y * scale, w: hh.w * scale, h: hh.h * scale })));
    if (justDone && live.clock.time - live.tipDoneAt > 1.6) live.tipJustDone = null;
  }

  /** Screen pixels the menu bar (and mode bar) take at the bottom (the touch USE button sits above them). */
  menuBarHeight = 30;

  /**
   * The corner buttons that open screens with a click or a tap. On a touch screen they are drawn larger (3× when
   * there is room) and wrap onto two rows rather than run off a narrow screen.
   */
  private drawMenuBar(screen: PixelBuffer, scale: number): void {
    if (!this.live) return;
    const items: [string, ScreenId][] = [
      ['BAG I', 'inventory'],
      ['CRAFT K', 'crafting'],
      ['JOURNAL J', 'journal'],
      ['BLOBBI U', 'care'],
      ['MAP N', 'map'],
      ['HOME 1', 'home'],
      ['GUIDE ?', 'guide'],
      ['...', 'settings'],
    ];
    // A finger needs no key names: shorter labels, bigger buttons.
    const label = (l: string) => (this.touchMode ? l.replace(/ (?:[A-Z1?]|E)$/, '') : l);
    const use = label('USE E');
    const widthOf = (l: string) => textWidth(label(l)) + 6;
    const rowW = (list: [string, ScreenId][]) => list.reduce((n, [l]) => n + widthOf(l) + 1, 0);
    let s = this.touchMode ? 3 : scale;
    let rows: [string, ScreenId][][] = [items];
    const fits = (k: number, r: [string, ScreenId][][]) => Math.max(...r.map((row, i) => rowW(row) + (i === r.length - 1 ? textWidth(use) + 9 : 0))) * k + 4 * k <= screen.width;
    if (!fits(s, rows)) rows = [items.slice(0, 4), items.slice(4)];
    while (s > 1 && !fits(s, rows)) s--;
    const rowH = 11;
    const w = Math.max(...rows.map((row, i) => rowW(row) + (i === rows.length - 1 ? textWidth(use) + 9 : 0)));
    const g = new Gfx(w, rows.length * (rowH + 1));
    rows.forEach((row, r) => {
      const y = r * (rowH + 1);
      let x = w - rowW(row) - (r === rows.length - 1 ? textWidth(use) + 9 : 0);
      // USE presses E for a mouse or a touch screen (the same action as the key).
      if (r === rows.length - 1) x += g.button(use, x, y, () => this.onUse?.(), { w: textWidth(use) + 6, primary: true }) + 3;
      for (const [l, id] of row) x += g.button(label(l), x, y, () => this.open(id), { w: widthOf(l) }) + 1;
    });
    const big = g.buf.scaled(s);
    const ox = screen.width - big.width - 2 * s;
    const oy = screen.height - big.height - 2 * s;
    screen.blit(big, ox, oy);
    this.hits = g.hits.map((h) => ({ ...h, x: ox + h.x * s, y: oy + h.y * s, w: h.w * s, h: h.h * s }));
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
    const buttons: [string, () => void][] = [];
    if (live.moving) buttons.push(['CANCEL MOVE', () => live.cancelMove()]);
    else if (live.placing) buttons.push(['STYLE', () => live.cycleVariant()], ['DONE', () => live.stopPlacing()]);
    else if (live.manage) buttons.push(['STYLE', () => live.restyleSelected()], ['TO BAG', () => live.removeSelected()], ['DONE', () => live.toggleManage()]);
    else if (live.buildMode) buttons.push(['NEXT', () => live.cycleBuildMode()], ['CANCEL', () => live.setBuildMode(null)]);
    if (!buttons.length) return;
    const head = live.moving ? 'USE PUTS IT DOWN' : live.placing ? 'USE PLACES' : live.manage ? 'USE PICKS UP' : 'USE BUILDS';
    const bw = buttons.reduce((n, [l]) => n + textWidth(l) + 7, 0);
    const w = Math.max(bw, textWidth(head) + 4);
    const g = new Gfx(w, 19);
    g.text(head, 1, 0, UI.accent);
    let x = 0;
    for (const [l, run] of buttons) x += g.button(l, x, 7, run, { w: textWidth(l) + 6, primary: l === 'DONE' }) + 1;
    const big = g.buf.scaled(s);
    const ox = 2 * s;
    const oy = Math.max(0, menuTop - big.height - 2 * s);
    screen.blit(big, ox, oy);
    this.hits.push(...g.hits.map((h) => ({ ...h, x: ox + h.x * s, y: oy + h.y * s, w: h.w * s, h: h.h * s })));
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
