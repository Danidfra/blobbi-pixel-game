/**
 * M11D.8.2, THE WORLD-ENTRY LOADING SCREEN: what a returning connected player sees while the game finds out where
 * they go (their adventures on this device, their current Blobbi across the connected worlds, and, with a browser
 * extension, whether it still holds their account). Before this, the main menu showed for a second or more and then
 * left by itself; now the menu is never drawn under a pending entry, and this page says what is happening.
 *
 *   "Your Blobbi is on the way!"  three little worlds joined by travelling lights (the recovery animation, M11D.7),
 *   the walking Blobbi arriving on the middle one as a soft silhouette; one more line when the extension may ask;
 *   after a moment, MAIN MENU (and ESC at any time) gives the player the lead; after a while, a word that other worlds
 *   are slow; and if nothing settles in time the title comes back by itself. With REDUCED MOTION nothing moves.
 *
 * No minimum time: the host ends the page the moment the entry is decided (into the island, a question, or the
 * title). It is shown only while a connected account is really being looked at; a guest, `#menu` or the player's own
 * MAIN MENU choice shows the title at once. Nothing here reads the network or changes anything: it only draws, counts
 * seconds and reports one wish (the menu). The screen owns the keyboard while it is up, so a key pressed while the
 * island loads never reaches the menu behind it.
 */
import { PixelBuffer } from '../core/pixel';
import { hex } from '../core/color';
import { Gfx, UI, textWidth, type Hit } from './gfx';
import { DESIGN } from './hud';
import { drawTinyText } from '../render/live-render';
import { drawConnectedWorlds } from './portrait';
import { t } from '../i18n';
import { TitleScreen } from './title';
import type { GameUI } from './game-ui';

/** Which wait the entry is in: the account on this device, the extension's answer, the connected worlds. */
export type EntryPhase = 'account' | 'signer' | 'worlds';

export interface EntryScreenHost {
  /** The walking Blobbi's small picture (its resting sprite, trimmed), for the arrival silhouette; or null. */
  portrait?(): PixelBuffer | null;
  /** The player asked for the main menu (MAIN MENU, ESC), or the page gave up waiting: the host shows the title. */
  cancel(): void;
}

/** Seconds on screen before MAIN MENU is offered (a quick entry shows no button at all). */
export const ENTRY_MENU_AFTER = 1.5;
/** Seconds on screen before the page says that other worlds are slow. */
export const ENTRY_SLOW_AFTER = 4;
/** Seconds on screen after which the page gives up by itself and the title comes back (never blocks for good). */
export const ENTRY_GIVE_UP = 15;

const W = 320;
const H = 180;
/** The arriving Blobbi's silhouette: a soft slate over the dimmed island. */
const SILHOUETTE = hex('#6b7fa8');
/** The panels' one-pixel frame. */
const PANEL_EDGE = hex('#3a4660');

/** Darken a screen rectangle towards the night blue (70%): a translucent panel without blur. */
function darken(screen: PixelBuffer, x: number, y: number, w: number, h: number): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(screen.width, x + w);
  const y1 = Math.min(screen.height, y + h);
  const d = screen.data;
  for (let py = y0; py < y1; py++)
    for (let px = x0; px < x1; px++) {
      const i = py * screen.width + px;
      const c = d[i];
      const r = c & 0xff;
      const g = (c >>> 8) & 0xff;
      const b = (c >>> 16) & 0xff;
      d[i] = 0xff000000 | (((b * 0.3 + 0x40 * 0.7) & 0xff) << 16) | (((g * 0.3 + 0x24 * 0.7) & 0xff) << 8) | ((r * 0.3 + 0x1b * 0.7) & 0xff);
    }
}

export class EntryScreen {
  active = false;
  /** The player (or the clock) gave the title back: the entry run, when it settles, changes nothing. */
  cancelled = false;
  phase: EntryPhase = 'account';
  private startedAt: number | null = null;
  private now = 0;
  private hits: Hit[] = [];
  /** M11D.8.3: the panels drawn behind the words (UI pixels), darkened on the screen under them. */
  private panels: { x: number; y: number; w: number; h: number }[] = [];

  constructor(
    private readonly host: EntryScreenHost,
    private readonly ui: GameUI,
  ) {}

  /** An entry is being decided: show the page from the next frame on. */
  begin(): void {
    this.active = true;
    this.cancelled = false;
    this.phase = 'account';
    this.startedAt = null;
    this.hits = [];
  }

  /** The entry is decided (or given up): the page goes away at once. */
  end(): void {
    this.active = false;
    this.hits = [];
  }

  /** Seconds the page has been on screen (0 before its first frame). */
  elapsed(): number {
    return this.startedAt === null ? 0 : Math.max(0, this.now - this.startedAt);
  }

  /** The entry may still take over: the page is up and nobody gave the title back. */
  waiting(): boolean {
    return this.active && !this.cancelled;
  }

  /** MAIN MENU is on the page (after a moment: a quick entry never flashes a button). */
  menuOffered(): boolean {
    return this.elapsed() >= ENTRY_MENU_AFTER;
  }

  private giveUp(): void {
    if (!this.active || this.cancelled) return;
    this.cancelled = true;
    this.host.cancel();
  }

  /** The page owns the keyboard: ESC (or Backspace) gives the title back; ENTER presses MAIN MENU once it is offered. */
  key(code: string): boolean {
    if (!this.active) return false;
    if (code === 'Escape' || code === 'Backspace') this.giveUp();
    else if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && this.menuOffered()) this.giveUp();
    return true;
  }

  pointer(sx: number, sy: number): boolean {
    if (!this.active) return false;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (sx >= h.x && sy >= h.y && sx < h.x + h.w && sy < h.y + h.h) {
        h.action(0, 0);
        return true;
      }
    }
    return true;
  }

  /** Hit regions of the last render, in screen pixels (tests press them). */
  get regions(): readonly Hit[] {
    return this.hits;
  }

  /** Draw over the frame (the island behind is dimmed as under the title). Gives up by itself after `ENTRY_GIVE_UP`. */
  render(screen: PixelBuffer, time: number): void {
    if (!this.active) return;
    if (this.startedAt === null) this.startedAt = time;
    this.now = time;
    if (this.elapsed() >= ENTRY_GIVE_UP) {
      this.giveUp();
      return;
    }
    const d = screen.data;
    for (let i = 0; i < d.length; i++) {
      const c = d[i];
      const r = c & 0xff;
      const g = (c >>> 8) & 0xff;
      const b = (c >>> 16) & 0xff;
      d[i] = 0xff000000 | (((b * 0.45 + 0x40 * 0.55) & 0xff) << 16) | (((g * 0.45 + 0x24 * 0.55) & 0xff) << 8) | ((r * 0.45 + 0x1b * 0.55) & 0xff);
    }
    const scale = TitleScreen.scaleFor(screen.width, screen.height);
    const g = new Gfx(W, H, scale);
    this.draw(g, time);
    const big = g.out;
    const ox = Math.floor((screen.width - big.width) / 2);
    const oy = Math.floor((screen.height - big.height) / 2);
    // M11D.8.3: a darker, translucent panel under the words (the island still shows through; no blur, no motion).
    for (const p of this.panels) darken(screen, ox + p.x * scale, oy + p.y * scale, p.w * scale, p.h * scale);
    screen.blit(big, ox, oy);
    this.hits = g.screenHits(ox, oy);
  }

  /** The page in UI pixels (320 by 180). */
  draw(g: Gfx, time: number): void {
    const still = this.ui.settings.reducedMotion;
    // The lights between the worlds read the UI clock.
    this.ui.now = time;
    // The name, small, as on the title's compact pages.
    const name = 'BLOBBI';
    const word = new PixelBuffer(textWidth(name) + 1, 6);
    drawTinyText(word, name, 0, 0, UI.accent);
    const shadow = new PixelBuffer(textWidth(name) + 1, 6);
    drawTinyText(shadow, name, 0, 0, DESIGN.card);
    const big = word.scaled(2);
    const tx = Math.floor((W - big.width) / 2);
    g.buf.blit(shadow.scaled(2), tx + 1, 7);
    g.buf.blit(big, tx, 6);

    const heading = t('entry.title');
    const px = 50;
    const pw = W - 2 * px;
    this.panels = [];
    // The words sit on a dark panel: the heading, then the line under it, centred.
    const body = t('entry.body');
    const bodyLines = g.lines(body, pw);
    const panelTop = 24;
    const panelH = 4 + 7 + 4 + bodyLines.length * 7 + 4;
    this.panel(g, px - 8, panelTop, pw + 16, panelH);
    g.heading(heading, Math.floor((W - g.measure(heading.toUpperCase(), 'title')) / 2), panelTop + 4, UI.accent);
    let y = panelTop + 15;
    y += g.para(body, px, y, pw, UI.ink, 4) + 10;

    // Three little worlds joined by travelling lights; the Blobbi arrives on the middle one.
    const worldsW = 150;
    const wx = Math.floor((W - worldsW) / 2);
    const wy = Math.max(y + 22, 96);
    drawConnectedWorlds(g, this.ui, wx, wy, worldsW, { sparks: 3 });
    this.drawArrival(g, wx + Math.round(worldsW / 2), wy - 1, still);
    y = wy + 12;

    // One line about what is being waited for, when it helps (on its own small panel).
    const slow = this.elapsed() >= ENTRY_SLOW_AFTER;
    const note = slow ? t('entry.slow') : this.phase === 'signer' ? t('entry.signer') : null;
    if (note) {
      const lines = Math.min(3, g.lines(note, pw).length);
      this.panel(g, px - 8, y - 3, pw + 16, lines * 7 + 6);
      y += g.para(note, px, y, pw, UI.muted, 3) + 6;
    }

    // MAIN MENU, after a moment (ESC always works).
    if (this.menuOffered()) {
      const label = t('entry.menu');
      const bw = Math.max(60, g.measure(label.toUpperCase()) + 12);
      g.button(label, Math.floor((W - bw) / 2), H - 26, () => this.giveUp(), { w: bw });
    }
  }

  /** A panel's frame in UI pixels (its darkening happens on the screen, under it, in `render`). */
  private panel(g: Gfx, x: number, y: number, w: number, h: number): void {
    this.panels.push({ x, y, w, h });
    for (let i = 0; i < w; i++) {
      g.buf.set(x + i, y, PANEL_EDGE);
      g.buf.set(x + i, y + h - 1, PANEL_EDGE);
    }
    for (let j = 0; j < h; j++) {
      g.buf.set(x, y + j, PANEL_EDGE);
      g.buf.set(x + w - 1, y + j, PANEL_EDGE);
    }
  }

  /**
   * The walking Blobbi as a soft silhouette standing on the middle world: it drifts down into place over the first
   * second (dithered while it arrives), then breathes with a tiny bob. Still, and whole, with reduced motion.
   */
  private drawArrival(g: Gfx, cx: number, ground: number, still: boolean): void {
    const p = this.host.portrait?.() ?? null;
    if (!p || !p.width || !p.height) return;
    const age = this.elapsed();
    const arriving = !still && age < 0.8;
    const f = arriving ? age / 0.8 : 1;
    const lift = arriving ? Math.round((1 - f) * 10) : 0;
    const bob = still || arriving ? 0 : Math.round(Math.sin(this.now * 2) * 1);
    const x0 = cx - Math.floor(p.width / 2);
    const y0 = ground - p.height - lift + bob;
    for (let py = 0; py < p.height; py++)
      for (let px = 0; px < p.width; px++) {
        if (((p.data[py * p.width + px] >>> 24) & 0xff) < 128) continue;
        // Arriving: every other pixel, so it fades in rather than pops.
        if (arriving && f < 0.6 && (px + py) % 2 === 1) continue;
        g.buf.set(x0 + px, y0 + py, SILHOUETTE);
      }
  }
}
