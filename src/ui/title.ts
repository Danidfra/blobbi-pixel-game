/**
 * THE TITLE SCREEN, drawn over a slowly drifting view of the island: the game's name, then CONTINUE, ISLANDS
 * (world selection), NEW ISLAND, SETTINGS and ABOUT. Keyboard (arrows, Enter, Escape), mouse and touch all work;
 * every page uses the same cards and buttons as the menus.
 *
 * Safety: NEW ISLAND always makes a world that has no save (see `newWorldSeeds`), so it can never overwrite one.
 * ISLANDS opens worlds; deleting one (its row's DELETE, or X / Delete on the keyboard) always asks first on a page
 * of its own that names the island, starts on KEEP IT, and accepts DELETE only after a short pause
 * (`ConfirmGate`), so a double click or a repeated tap can never delete by accident.
 */
import { PixelBuffer } from '../core/pixel';
import { Gfx, UI, textWidth, type Hit } from './gfx';
import { DESIGN, card } from './hud';
import { drawTinyText } from '../render/live-render';
import type { WorldEntry } from '../game/worlds';
import type { CarrierKind } from '../game/carrier';
import { ConfirmGate } from '../game/world-delete';

export type TitlePage = 'main' | 'islands' | 'about' | 'new' | 'delete';

export interface TitleActions {
  /** Saved worlds, most recent first. */
  worlds(): WorldEntry[];
  /** The world the playground has loaded now (its identity), and whether it has a save. */
  current(): { identity: string; name: string; saved: boolean };
  continueGame(): void;
  openWorld(w: WorldEntry): void;
  newWorld(kind: CarrierKind): void;
  settings(): void;
  /** Permanently delete a saved world (only ever called after the confirmation page). */
  deleteWorld?(w: WorldEntry): void;
  /** A small picture of a species (96×64) for the NEW ISLAND page; optional. */
  preview?(kind: CarrierKind, time: number): PixelBuffer | null;
}

const W = 320;
const H = 180;

export class TitleScreen {
  active = true;
  page: TitlePage = 'main';
  index = 0;
  /** First visible row of the islands list. */
  scroll = 0;
  private hits: Hit[] = [];
  /** The selection sound hook. */
  onSound: ((name: string) => void) | null = null;
  /** The island waiting for a delete confirmation. */
  readonly confirm = new ConfirmGate<WorldEntry>();
  /** Real seconds (the last render's time): the confirmation's arming clock. */
  private now = 0;

  constructor(private readonly actions: TitleActions) {}

  private items(): { label: string; detail?: string; kind?: CarrierKind; world?: WorldEntry; danger?: boolean; run: () => void }[] {
    const a = this.actions;
    if (this.page === 'main') {
      const cur = a.current();
      const worlds = a.worlds();
      return [
        { label: cur.saved ? 'CONTINUE' : 'START', detail: cur.name.toUpperCase(), run: () => a.continueGame() },
        { label: 'ISLANDS', detail: `${worlds.length} SAVED`, run: () => this.go('islands') },
        { label: 'NEW ISLAND', detail: 'A NEW WORLD CARRIER', run: () => this.go('new') },
        { label: 'SETTINGS', run: () => a.settings() },
        { label: 'ABOUT', run: () => this.go('about') },
      ];
    }
    if (this.page === 'islands') {
      const list = a.worlds().map((w) => ({ label: w.name.toUpperCase(), detail: worldDetail(w), world: w, run: () => a.openWorld(w) }));
      return [...list, { label: 'BACK', run: () => this.go('main') }];
    }
    if (this.page === 'delete') {
      const w = this.confirm.subject;
      return [
        { label: 'KEEP IT', detail: 'GO BACK TO YOUR ISLANDS', run: () => this.cancelDelete() },
        { label: 'DELETE FOREVER', detail: w ? `ERASE ${w.name.toUpperCase()}` : '', danger: true, run: () => this.confirmDelete() },
      ];
    }
    if (this.page === 'new')
      return [
        { label: 'A TURTLE ISLAND', detail: 'ROUND, ON A GREAT SHELL', kind: 'turtle' as const, run: () => a.newWorld('turtle') },
        { label: 'A MANTA ISLAND', detail: 'WIDE AND FLAT, WITH BEACHES', kind: 'manta' as const, run: () => a.newWorld('manta') },
        { label: 'A WHALE ISLAND', detail: 'LONG, ON A SINGING GIANT (NEW)', kind: 'whale' as const, run: () => a.newWorld('whale') },
        { label: 'BACK', run: () => this.go('main') },
      ];
    return [{ label: 'BACK', run: () => this.go('main') }];
  }

  private go(page: TitlePage): void {
    this.page = page;
    this.index = 0;
    this.scroll = 0;
  }

  /** Ask before deleting a saved world (nothing is deleted here). */
  askDelete(w: WorldEntry): void {
    if (!this.actions.deleteWorld) return;
    this.confirm.open(w, this.now);
    this.page = 'delete';
    this.index = 0; // KEEP IT is the default answer
  }

  private cancelDelete(): void {
    this.confirm.cancel();
    this.go('islands');
  }

  /** The DELETE FOREVER answer: acts only once the question has been on screen for a moment. */
  private confirmDelete(): void {
    const w = this.confirm.confirm(this.now);
    if (!w) {
      this.onSound?.('ui-deny');
      return;
    }
    this.actions.deleteWorld?.(w);
    this.go('islands');
  }

  key(code: string): boolean {
    if (!this.active) return false;
    const items = this.items();
    if (code === 'ArrowUp' || code === 'KeyW') this.index = (this.index + items.length - 1) % items.length;
    else if (code === 'ArrowDown' || code === 'KeyS') this.index = (this.index + 1) % items.length;
    else if (code === 'Enter' || code === 'Space' || code === 'KeyE' || code === 'NumpadEnter') {
      this.onSound?.('ui-confirm');
      items[this.index]?.run();
      return true;
    } else if (code === 'Escape' || code === 'Backspace') {
      if (this.page === 'delete') {
        this.onSound?.('ui-close');
        this.cancelDelete();
      } else if (this.page !== 'main') {
        this.onSound?.('ui-close');
        this.go('main');
      }
      return true;
    } else if ((code === 'KeyX' || code === 'Delete') && this.page === 'islands') {
      const w = items[this.index]?.world;
      if (w) this.askDelete(w);
      return true;
    } else if ((code === 'ArrowLeft' || code === 'ArrowRight' || code === 'KeyA' || code === 'KeyD') && this.page === 'delete') {
      this.index = 1 - this.index;
    } else return true; // the title owns the keyboard
    this.onSound?.('ui-select');
    return true;
  }

  pointer(sx: number, sy: number): boolean {
    if (!this.active) return false;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (sx >= h.x && sy >= h.y && sx < h.x + h.w && sy < h.y + h.h) {
        this.onSound?.('ui-confirm');
        h.action(0, 0);
        return true;
      }
    }
    return true;
  }

  /** Whole-number scale of the 320×180 title layout on this screen. */
  static scaleFor(w: number, h: number): number {
    return Math.max(1, Math.min(6, Math.floor(Math.min(w / W, h / H))));
  }

  /** Draw over the frame (the island behind is dimmed towards the night sky). */
  render(screen: PixelBuffer, time: number): void {
    if (!this.active) return;
    this.now = time;
    const d = screen.data;
    for (let i = 0; i < d.length; i++) {
      const c = d[i];
      // 55% towards a deep blue: the island stays visible, the text reads.
      const r = c & 0xff;
      const g = (c >>> 8) & 0xff;
      const b = (c >>> 16) & 0xff;
      d[i] = 0xff000000 | (((b * 0.45 + 0x40 * 0.55) & 0xff) << 16) | (((g * 0.45 + 0x24 * 0.55) & 0xff) << 8) | ((r * 0.45 + 0x1b * 0.55) & 0xff);
    }
    const scale = TitleScreen.scaleFor(screen.width, screen.height);
    const g = new Gfx(W, H);
    this.draw(g, time);
    const big = g.buf.scaled(scale);
    const ox = Math.floor((screen.width - big.width) / 2);
    const oy = Math.floor((screen.height - big.height) / 2);
    screen.blit(big, ox, oy);
    this.hits = g.hits.map((h) => ({ ...h, x: ox + h.x * scale, y: oy + h.y * scale, w: h.w * scale, h: h.h * scale }));
  }

  draw(g: Gfx, time: number): void {
    // The name, big: the tiny font at 4×, with a soft shadow, bobbing gently like the island on the sea.
    const name = 'BLOBBI';
    const word = new PixelBuffer(textWidth(name) + 1, 6);
    drawTinyText(word, name, 0, 0, UI.accent);
    const shadow = new PixelBuffer(textWidth(name) + 1, 6);
    drawTinyText(shadow, name, 0, 0, DESIGN.card);
    const big = word.scaled(4);
    const bob = Math.round(Math.sin(time * 1.2) * 1);
    const tx = Math.floor((W - big.width) / 2);
    g.buf.blit(shadow.scaled(4), tx + 2, 14 + bob + 2);
    g.buf.blit(big, tx, 14 + bob);
    const sub = 'A LIVING ISLAND ON A WORLD CARRIER';
    g.text(sub, Math.floor((W - textWidth(sub)) / 2), 42, UI.ink);

    const items = this.items();
    const rows = 5;
    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + rows) this.scroll = this.index - rows + 1;
    const panelW = 184;
    // NEW ISLAND shows a picture of the chosen Carrier beside the list.
    const pictured = this.page === 'new' && !!this.actions.preview;
    const px = pictured ? 18 : Math.floor((W - panelW) / 2);
    let y = 56;
    const heading = this.page === 'islands' ? 'YOUR ISLANDS' : this.page === 'new' ? 'NEW ISLAND' : this.page === 'about' ? 'ABOUT' : this.page === 'delete' ? 'DELETE THIS ISLAND?' : '';
    if (heading) {
      g.text(heading, px, y, UI.accent);
      y += 9;
    }
    if (this.page === 'about') {
      const para = 'A cozy procedural game. Your Blobbi lives on an island carried by a great sea turtle: gather, farm, build a home, cook, discover the island\'s secrets and become friends. Everything is generated from seeds; music and sounds are synthesized live. Saves stay in this browser.';
      y += g.para(para, px, y, panelW, UI.ink) + 6;
    }
    if (this.page === 'new') {
      y += g.para('A new Carrier, a new island, a fresh start. Islands you already played are kept: return to them from ISLANDS.', px, y, panelW, UI.muted) + 6;
    }
    if (this.page === 'delete' && this.confirm.subject) {
      const w = this.confirm.subject;
      g.text(w.name.toUpperCase(), px, y, UI.ink);
      g.text(worldDetail(w), px, y + 8, UI.muted);
      y += 17;
      y += g.para('Its island, buildings, bag and progress are erased from this browser. This cannot be undone.', px, y, panelW, UI.bad) + 5;
    }
    if (this.page === 'islands' && items.length === 1) {
      y += g.para('No saved islands yet. START or NEW ISLAND makes one.', px, y, panelW, UI.muted) + 6;
    }
    items.slice(this.scroll, this.scroll + rows).forEach((it, k) => {
      const i = k + this.scroll;
      const selected = i === this.index;
      const h = it.detail ? 18 : 11;
      // The delete answer waits, greyed, until the question has been read for a moment.
      const waiting = !!it.danger && !this.confirm.armed(time);
      const c = card(panelW, h, selected ? (it.danger ? UI.bad : DESIGN.accent) : undefined);
      if (selected) c.fillRect(1, 1, panelW - 2, h - 2, DESIGN.cardHi);
      g.buf.blit(c, px, y);
      // A non-colour selection mark too.
      if (selected) for (let k2 = 0; k2 < 3; k2++) g.buf.fillRect(px + 4 + k2, y + 3 + k2, 1, 5 - 2 * k2, UI.accent);
      g.text(it.label, px + 11, y + 3, waiting ? UI.line : it.danger ? UI.bad : selected ? UI.accent : UI.ink);
      if (it.detail) g.text(it.detail.slice(0, 44), px + 11, y + 10, UI.muted);
      g.hit(px, y, panelW, h, () => {
        this.index = i;
        it.run();
      });
      // Each saved island has its own small DELETE button (it only asks).
      const w = it.world;
      if (w && this.actions.deleteWorld) {
        const bw = textWidth('DELETE') + 6;
        g.button('DELETE', px + panelW - bw - 3, y + 3, () => this.askDelete(w), { w: bw });
      }
      y += h + 2;
    });
    const kind = items[this.index]?.kind;
    if (pictured && kind) {
      const pic = this.actions.preview!(kind, time);
      if (pic) {
        const fx = px + panelW + 8;
        const fy = 78;
        g.buf.blit(card(pic.width + 4, pic.height + 4, DESIGN.accent), fx - 2, fy - 2);
        g.buf.blit(pic, fx, fy);
      }
    }
    if (this.scroll > 0) g.text('MORE', px + panelW + 3, 66, UI.muted);
    if (this.scroll + rows < items.length) g.text('MORE', px + panelW + 3, y - 8, UI.muted);
    const foot = this.page === 'islands' ? 'ENTER OPENS. X DELETES (IT ASKS FIRST). ESC GOES BACK.' : 'ARROWS AND ENTER, OR CLICK. ESC GOES BACK.';
    g.text(foot, Math.floor((W - textWidth(foot)) / 2), H - 9, UI.muted);
  }
}

/** One line about a saved island: its Carrier, its day, quests and buildings. */
export function worldDetail(w: WorldEntry): string {
  return `${w.params.kind === 'manta' ? 'MANTA' : w.params.kind === 'whale' ? 'WHALE' : 'TURTLE'}  DAY ${w.day}  ${w.quests} QUESTS  ${w.buildings} BUILT`;
}
