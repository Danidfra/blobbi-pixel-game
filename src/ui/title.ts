/**
 * THE TITLE SCREEN, drawn over a slowly drifting view of an island. Keyboard (arrows, Enter, Escape), mouse and touch
 * all work; every page uses the same cards and buttons as the menus.
 *
 *   first time (no saved island)   WELCOME → CHOOSE YOUR CARRIER → NAME YOUR ISLAND → the island is made → intro
 *   returning                      CONTINUE (the most recent island) · MY ISLANDS · NEW ISLAND · SETTINGS · ABOUT
 *
 * NEW ISLAND uses the same two steps as the first time. Choosing a Carrier changes the look and the mood of the
 * world, never how much there is to do. The name is optional (an empty one lets the island name itself).
 *
 * The title never makes a world itself: CREATE ISLAND moves to a short "creating" page and leaves a request
 * (`pendingCreate`) that the host takes on its next frame — exactly once, so a double press cannot make two islands.
 * If making the island fails, the host says why (`createFailed`) and the player is back on the Carrier page.
 *
 * Safety: NEW ISLAND always makes a world that has no save (see `newWorldSeeds`), so it can never overwrite one.
 * MY ISLANDS opens worlds; deleting one (its row's DELETE, or X / Delete on the keyboard) always asks first on a page
 * of its own that names the island, starts on KEEP IT, and accepts DELETE only after a short pause (`ConfirmGate`),
 * so a double click or a repeated tap can never delete by accident.
 */
import { PixelBuffer } from '../core/pixel';
import { Gfx, UI, textWidth, type Hit } from './gfx';
import { DESIGN, card } from './hud';
import { drawTinyText } from '../render/live-render';
import type { WorldEntry } from '../game/worlds';
import type { CarrierKind } from '../game/carrier';
import { ConfirmGate } from '../game/world-delete';
import { MAX_NAME, sanitizeIslandName, suggestIslandName, typingIslandName } from '../game/island-name';

export type TitlePage = 'welcome' | 'main' | 'islands' | 'about' | 'carrier' | 'name' | 'creating' | 'error' | 'delete';

export interface TitleActions {
  /** Saved worlds, most recent first. */
  worlds(): WorldEntry[];
  /** The world the playground has loaded now (its identity), whether it has a save, and whether a link named it. */
  current(): { identity: string; name: string; saved: boolean; linked?: boolean };
  /** CONTINUE: the most recently played island. */
  continueGame(): void;
  openWorld(w: WorldEntry): void;
  /** Play the world the link named (a lab or shared link), when it is not a saved island yet. */
  playCurrent?(): void;
  settings(): void;
  /** Permanently delete a saved world (only ever called after the confirmation page). */
  deleteWorld?(w: WorldEntry): void;
  /** A small picture of a species for the Carrier cards; optional. */
  preview?(kind: CarrierKind, time: number): PixelBuffer | null;
  /** Watch the intro again on a preview island (nothing is created or changed). */
  watchIntro?(kind: CarrierKind): void;
  /** Touch: bring up the device keyboard for the island name (the host mirrors what is typed into `name`). */
  requestTextInput?(current: string): void;
}

/** What each Carrier is like: the same game on each, a different look and mood. */
export const CARRIER_CARDS: readonly { kind: CarrierKind; name: string; mood: string }[] = [
  { kind: 'turtle', name: 'SEA TURTLE', mood: 'OLD AND PATIENT. A ROUND, SHELTERED ISLAND ON A MOSSY SHELL.' },
  { kind: 'manta', name: 'MANTA RAY', mood: 'GRACEFUL AND CURIOUS. A WIDE, SUNNY ISLAND THAT GLIDES.' },
  { kind: 'whale', name: 'GREAT WHALE', mood: 'GENTLE AND DREAMY. A LONG ISLAND THAT HUMS AND SINGS.' },
];

const W = 320;
const H = 180;
/** The Carrier pictures on the cards. */
export const CARD_PIC = { w: 92, h: 56 } as const;

interface Item {
  label: string;
  detail?: string;
  world?: WorldEntry;
  danger?: boolean;
  run: () => void;
}

export class TitleScreen {
  active = true;
  page: TitlePage = 'main';
  index = 0;
  /** First visible row of a list page. */
  scroll = 0;
  /** The Carrier chosen on the Carrier page (index into `CARRIER_CARDS`). */
  carrier = 0;
  /** The island name being typed (may be empty). */
  name = '';
  /** A CREATE ISLAND waiting for the host (taken once with `takeCreate`). */
  pendingCreate: { kind: CarrierKind; name: string } | null = null;
  /** Why the last island could not be made. */
  error = '';
  private suggestion = 0;
  private hits: Hit[] = [];
  /** The selection sound hook. */
  onSound: ((name: string) => void) | null = null;
  /** The island waiting for a delete confirmation. */
  readonly confirm = new ConfirmGate<WorldEntry>();
  /** Real seconds (the last render's time): the confirmation's arming clock. */
  private now = 0;
  /** Calmer drawing (no bobbing title, a steady caret). */
  reducedMotion = false;

  constructor(private readonly actions: TitleActions) {
    this.reset();
  }

  /** Show the right first page: WELCOME for a first-time player (no saved island), else the main menu. */
  reset(): void {
    const first = this.actions.worlds().length === 0 && !this.actions.current().saved && !this.actions.current().linked;
    this.go(first ? 'welcome' : 'main');
    this.pendingCreate = null;
  }

  get firstTime(): boolean {
    return this.page === 'welcome';
  }

  private items(): Item[] {
    const a = this.actions;
    if (this.page === 'welcome')
      return [
        { label: 'BEGIN', detail: 'CHOOSE YOUR WORLD CARRIER', run: () => this.go('carrier') },
        { label: 'SETTINGS', run: () => a.settings() },
        { label: 'ABOUT', run: () => this.go('about') },
      ];
    if (this.page === 'main') {
      const worlds = a.worlds();
      const recent = worlds[0];
      const cur = a.current();
      const out: Item[] = [];
      if (recent) out.push({ label: 'CONTINUE', detail: `${recent.name.toUpperCase()}  ${speciesName(recent)}  DAY ${recent.day}`, run: () => a.continueGame() });
      if (cur.linked && !worlds.some((w) => w.identity === cur.identity) && a.playCurrent) out.push({ label: 'PLAY THIS ISLAND', detail: `${cur.name.toUpperCase()} (FROM THE LINK)`, run: () => a.playCurrent!() });
      out.push(
        { label: 'MY ISLANDS', detail: `${worlds.length} SAVED`, run: () => this.go('islands') },
        { label: 'NEW ISLAND', detail: 'A NEW WORLD CARRIER', run: () => this.go('carrier') },
        { label: 'SETTINGS', run: () => a.settings() },
        { label: 'ABOUT', detail: 'AND WATCH THE INTRO AGAIN', run: () => this.go('about') },
      );
      return out;
    }
    if (this.page === 'islands') {
      const list = a.worlds().map((w) => ({ label: w.name.toUpperCase(), detail: worldDetail(w), world: w, run: () => a.openWorld(w) }));
      return [...list, { label: 'BACK', run: () => this.back() }];
    }
    if (this.page === 'delete') {
      const w = this.confirm.subject;
      return [
        { label: 'KEEP IT', detail: 'GO BACK TO YOUR ISLANDS', run: () => this.cancelDelete() },
        { label: 'DELETE FOREVER', detail: w ? `ERASE ${w.name.toUpperCase()}` : '', danger: true, run: () => this.confirmDelete() },
      ];
    }
    if (this.page === 'name') {
      const out: Item[] = [
        { label: 'CREATE ISLAND', detail: this.name.trim() ? `"${sanitizeIslandName(this.name).toUpperCase()}"` : 'IT WILL NAME ITSELF', run: () => this.create() },
        { label: 'SURPRISE ME', detail: 'SUGGEST A NAME', run: () => this.suggest() },
      ];
      if (a.requestTextInput) out.push({ label: 'TYPE A NAME', detail: 'OPENS THE KEYBOARD', run: () => a.requestTextInput!(this.name) });
      out.push({ label: 'BACK', run: () => this.back() });
      return out;
    }
    if (this.page === 'error') return [{ label: 'BACK', detail: 'TRY AGAIN', run: () => this.go('carrier') }];
    if (this.page === 'about') {
      const watch: Item[] = a.watchIntro ? CARRIER_CARDS.map((c) => ({ label: `WATCH THE ${c.name} INTRO`, detail: 'A PREVIEW: NO ISLAND IS MADE OR CHANGED', run: () => a.watchIntro!(c.kind) })) : [];
      return [...watch, { label: 'BACK', run: () => this.back() }];
    }
    return [];
  }

  private go(page: TitlePage): void {
    this.page = page;
    this.index = 0;
    this.scroll = 0;
  }

  /** One step back: to WELCOME for a first-time player, else to the main menu. */
  private back(): void {
    if (this.page === 'name') return this.go('carrier');
    if (this.page === 'carrier' || this.page === 'about' || this.page === 'error' || this.page === 'islands') {
      const first = this.actions.worlds().length === 0 && !this.actions.current().saved && !this.actions.current().linked;
      return this.go(first ? 'welcome' : 'main');
    }
    this.go('main');
  }

  /** The Carrier chosen: on to the name. */
  chooseCarrier(i: number): void {
    this.carrier = Math.max(0, Math.min(CARRIER_CARDS.length - 1, i));
    this.go('name');
  }

  private suggest(): void {
    this.name = suggestIslandName(this.suggestion++);
  }

  /** A key the player typed for the name (printable characters only). */
  typeChar(ch: string): void {
    if (this.page !== 'name' || ch.length !== 1) return;
    this.name = typingIslandName(this.name + ch);
  }

  /** The host's text field (touch keyboard) changed: keep what the font can show. */
  setName(value: string): void {
    this.name = typingIslandName(value).slice(0, MAX_NAME);
  }

  /** CREATE ISLAND: leave the request for the host, once. */
  private create(): void {
    if (this.pendingCreate || this.page === 'creating') return;
    this.pendingCreate = { kind: CARRIER_CARDS[this.carrier].kind, name: sanitizeIslandName(this.name) };
    this.go('creating');
  }

  /** The host takes the request (exactly once) when it is ready to make the island. */
  takeCreate(): { kind: CarrierKind; name: string } | null {
    const p = this.pendingCreate;
    this.pendingCreate = null;
    return p;
  }

  /** Making the island failed: say why, and go back to the Carrier page. */
  createFailed(reason: string): void {
    this.error = reason;
    this.pendingCreate = null;
    this.go('error');
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
    this.go(this.actions.worlds().length ? 'islands' : 'welcome');
  }

  /**
   * A key. `char` is the typed character (KeyboardEvent.key), used for the island name. The title owns the keyboard:
   * every key is used.
   */
  key(code: string, char = ''): boolean {
    if (!this.active) return false;
    if (this.page === 'creating') return true;
    if (this.page === 'carrier') return this.carrierKey(code);
    const items = this.items();
    const naming = this.page === 'name';
    // On the name page letters type (so WASD do not move the selection there).
    if (naming && code === 'Backspace') {
      this.name = this.name.slice(0, -1);
      return true;
    }
    if (naming && char.length === 1 && /[A-Za-z0-9 .!-]/.test(char) && code !== 'Enter' && code !== 'NumpadEnter') {
      if (code === 'Space' && this.name === '') return true;
      this.typeChar(char);
      return true;
    }
    const up = code === 'ArrowUp' || (!naming && code === 'KeyW');
    const down = code === 'ArrowDown' || (!naming && code === 'KeyS');
    if (up) this.index = (this.index + items.length - 1) % items.length;
    else if (down) this.index = (this.index + 1) % items.length;
    else if (code === 'Enter' || code === 'NumpadEnter' || (!naming && (code === 'Space' || code === 'KeyE'))) {
      this.onSound?.('ui-confirm');
      items[this.index]?.run();
      return true;
    } else if (code === 'Escape' || code === 'Backspace') {
      if (this.page === 'delete') {
        this.onSound?.('ui-close');
        this.cancelDelete();
      } else if (this.page !== 'main' && this.page !== 'welcome') {
        this.onSound?.('ui-close');
        this.back();
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

  /** The Carrier page: left and right choose, Enter goes on, Escape goes back. */
  private carrierKey(code: string): boolean {
    const n = CARRIER_CARDS.length;
    if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowUp' || code === 'KeyW') {
      this.carrier = (this.carrier + n - 1) % n;
      this.onSound?.('ui-select');
    } else if (code === 'ArrowRight' || code === 'KeyD' || code === 'ArrowDown' || code === 'KeyS') {
      this.carrier = (this.carrier + 1) % n;
      this.onSound?.('ui-select');
    } else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'KeyE') {
      this.onSound?.('ui-confirm');
      this.chooseCarrier(this.carrier);
    } else if (code === 'Escape' || code === 'Backspace') {
      this.onSound?.('ui-close');
      this.back();
    }
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

  /** Hit regions of the last render, in screen pixels (tests press them). */
  get regions(): readonly Hit[] {
    return this.hits;
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
    const compact = this.page === 'carrier' || this.page === 'name';
    const word = new PixelBuffer(textWidth(name) + 1, 6);
    drawTinyText(word, name, 0, 0, UI.accent);
    const shadow = new PixelBuffer(textWidth(name) + 1, 6);
    drawTinyText(shadow, name, 0, 0, DESIGN.card);
    const k = compact ? 2 : 4;
    const big = word.scaled(k);
    const bob = this.reducedMotion ? 0 : Math.round(Math.sin(time * 1.2) * 1);
    const tx = Math.floor((W - big.width) / 2);
    const ty = compact ? 6 : 14;
    g.buf.blit(shadow.scaled(k), tx + 2, ty + bob + 2);
    g.buf.blit(big, tx, ty + bob);
    if (!compact) {
      const sub = 'A LIVING ISLAND ON A WORLD CARRIER';
      g.text(sub, Math.floor((W - textWidth(sub)) / 2), 42, UI.ink);
    }
    if (this.page === 'carrier') return this.drawCarriers(g, time);
    if (this.page === 'creating') return this.drawCreating(g, time);

    const items = this.items();
    const rows = 5;
    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + rows) this.scroll = this.index - rows + 1;
    const panelW = 184;
    const named = this.page === 'name';
    const px = named ? 18 : Math.floor((W - panelW) / 2);
    let y = named ? 24 : 56;
    const heading = { islands: 'YOUR ISLANDS', about: 'ABOUT', delete: 'DELETE THIS ISLAND?', name: 'NAME YOUR ISLAND', error: 'THE SEA IS TOO ROUGH', welcome: 'WELCOME', main: '', carrier: '', creating: '' }[this.page];
    if (heading) {
      g.text(heading, px, y, UI.accent);
      y += 9;
    }
    if (this.page === 'welcome') {
      y += g.para('A little Blobbi is looking for a home: an island on the back of a great sea creature. Choose its Carrier, name the island, and watch it begin.', px, y, panelW, UI.ink) + 5;
    }
    if (this.page === 'about') {
      const para = 'A cozy procedural game. Your Blobbi lives on an island carried by a great sea creature: gather, farm, build a home, cook, discover the island\'s secrets and become friends. Everything is made from seeds; saves stay in this browser.';
      y += g.para(para, px, y, panelW, UI.ink, 5) + 4;
    }
    if (this.page === 'error') y += g.para(this.error || 'The island could not be made. Nothing was saved.', px, y, panelW, UI.bad) + 6;
    if (this.page === 'name') y = this.drawNameField(g, px, y, panelW, time);
    if (this.page === 'delete' && this.confirm.subject) {
      const w = this.confirm.subject;
      g.text(w.name.toUpperCase(), px, y, UI.ink);
      g.text(worldDetail(w), px, y + 8, UI.muted);
      y += 17;
      y += g.para('Its island, buildings, bag and progress are erased from this browser. This cannot be undone.', px, y, panelW, UI.bad) + 5;
    }
    if (this.page === 'islands' && items.length === 1) {
      y += g.para('No saved islands yet. NEW ISLAND makes one.', px, y, panelW, UI.muted) + 6;
    }
    items.slice(this.scroll, this.scroll + rows).forEach((it, k2) => {
      const i = k2 + this.scroll;
      const selected = i === this.index;
      const h = it.detail ? 18 : 11;
      // The delete answer waits, greyed, until the question has been read for a moment.
      const waiting = !!it.danger && !this.confirm.armed(time);
      const c = card(panelW, h, selected ? (it.danger ? UI.bad : DESIGN.accent) : undefined);
      if (selected) c.fillRect(1, 1, panelW - 2, h - 2, DESIGN.cardHi);
      g.buf.blit(c, px, y);
      // A non-colour selection mark too.
      if (selected) for (let m = 0; m < 3; m++) g.buf.fillRect(px + 4 + m, y + 3 + m, 1, 5 - 2 * m, UI.accent);
      g.text(it.label, px + 11, y + 3, waiting ? UI.line : it.danger ? UI.bad : selected ? UI.accent : UI.ink);
      if (it.detail) g.text(it.detail.slice(0, 43), px + 11, y + 10, UI.muted);
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
    if (named) this.drawChosen(g, px + panelW + 10, 40, time);
    if (this.scroll > 0) g.text('MORE', px + panelW + 3, 66, UI.muted);
    if (this.scroll + rows < items.length) g.text('MORE', px + panelW + 3, y - 8, UI.muted);
    const foot = named ? 'TYPE A NAME, OR LEAVE IT EMPTY. ENTER CREATES.' : this.page === 'islands' ? 'ENTER OPENS. X DELETES (IT ASKS FIRST). ESC GOES BACK.' : 'ARROWS AND ENTER, OR CLICK OR TAP. ESC GOES BACK.';
    g.text(foot, Math.floor((W - textWidth(foot)) / 2), H - 9, UI.muted);
  }

  /** The three Carrier cards: animated pictures, names and moods; the chosen one raised with an accent frame. */
  private drawCarriers(g: Gfx, time: number): void {
    const head = 'CHOOSE YOUR WORLD CARRIER';
    g.text(head, Math.floor((W - textWidth(head)) / 2), 22, UI.accent);
    const cw = CARD_PIC.w + 6;
    const gap = 5;
    const x0 = Math.floor((W - (cw * 3 + gap * 2)) / 2);
    const top = 32;
    const ch = 100;
    CARRIER_CARDS.forEach((c, i) => {
      const chosen = i === this.carrier;
      const x = x0 + i * (cw + gap);
      const y = top + (chosen ? 0 : 3);
      const box = card(cw, ch, chosen ? DESIGN.accent : undefined);
      if (chosen) box.fillRect(1, 1, cw - 2, ch - 2, DESIGN.cardHi);
      g.buf.blit(box, x, y);
      if (chosen) {
        g.buf.strokeRect(x - 1, y - 1, cw + 2, ch + 2, UI.accent);
        for (let m = 0; m < 3; m++) g.buf.fillRect(x + 3 + m, y + CARD_PIC.h + 7 + m, 1, 5 - 2 * m, UI.accent);
      }
      // Every card is alive (still with reduced motion: the first frame).
      const pic = this.actions.preview?.(c.kind, this.reducedMotion ? 0 : time + i * 0.7) ?? null;
      if (pic) g.buf.blit(pic, x + 3, y + 3);
      else g.box(x + 3, y + 3, CARD_PIC.w, CARD_PIC.h, UI.slot, UI.line);
      g.text(c.name, x + 10, y + CARD_PIC.h + 7, chosen ? UI.accent : UI.ink);
      g.para(c.mood, x + 4, y + CARD_PIC.h + 16, cw - 7, chosen ? UI.ink : UI.muted, 5);
      g.hit(x, y, cw, ch, () => {
        if (this.carrier === i) this.chooseCarrier(i);
        else this.carrier = i;
      });
    });
    const note = 'EVERY CARRIER HAS THE SAME ADVENTURE. ONLY ITS LOOK AND MOOD DIFFER.';
    g.text(note, Math.floor((W - textWidth(note)) / 2), top + ch + 7, UI.muted);
    const by = H - 22;
    g.button('BACK', x0, by, () => this.back(), { w: 50 });
    const next = `NEXT: ${CARRIER_CARDS[this.carrier].name}`;
    const nw = textWidth(next) + 12;
    g.button(next, x0 + cw * 3 + gap * 2 - nw, by, () => this.chooseCarrier(this.carrier), { w: nw, primary: true });
    const foot = 'LEFT AND RIGHT CHOOSE. ENTER OR TAP AGAIN TO GO ON.';
    g.text(foot, Math.floor((W - textWidth(foot)) / 2), H - 9, UI.muted);
  }

  /** The name being typed, in a field with a caret; returns the next free y. */
  private drawNameField(g: Gfx, x: number, y: number, w: number, time: number): number {
    y += g.para('Optional. Leave it empty and the island names itself.', x, y, w, UI.muted) + 3;
    g.box(x, y, w, 13, UI.bg, UI.accent);
    const shown = this.name.toUpperCase();
    g.text(shown, x + 4, y + 4, UI.ink);
    const caretOn = this.reducedMotion || Math.floor(time * 2) % 2 === 0;
    if (caretOn) g.buf.fillRect(x + 4 + (shown ? textWidth(shown) + 1 : 0), y + 3, 1, 7, UI.accent);
    g.text(`${this.name.length}/${MAX_NAME}`, x + w - 22, y + 4, UI.line);
    if (this.actions.requestTextInput) g.hit(x, y, w, 13, () => this.actions.requestTextInput!(this.name));
    return y + 17;
  }

  /** The chosen Carrier, small, beside the name page. */
  private drawChosen(g: Gfx, x: number, y: number, time: number): void {
    const c = CARRIER_CARDS[this.carrier];
    const pic = this.actions.preview?.(c.kind, time) ?? null;
    const cw = CARD_PIC.w + 6;
    g.buf.blit(card(cw, CARD_PIC.h + 17, DESIGN.accent), x, y);
    if (pic) g.buf.blit(pic, x + 3, y + 3);
    g.text(c.name, x + 4, y + CARD_PIC.h + 7, UI.accent);
  }

  private drawCreating(g: Gfx, time: number): void {
    const lines = ['THE SEA STIRS...', 'A WORLD CARRIER IS RISING.'];
    lines.forEach((l, i) => g.text(l, Math.floor((W - textWidth(l)) / 2), 80 + i * 10, i ? UI.muted : UI.accent));
    const dots = this.reducedMotion ? 3 : 1 + (Math.floor(time * 3) % 3);
    for (let i = 0; i < dots; i++) g.buf.fillRect(W / 2 - 6 + i * 5, 104, 2, 2, UI.accent);
  }
}

const speciesName = (w: WorldEntry) => (w.params.kind === 'manta' ? 'MANTA' : w.params.kind === 'whale' ? 'WHALE' : 'TURTLE');

/** One line about a saved island: its Carrier, its day, quests and buildings. */
export function worldDetail(w: WorldEntry): string {
  return `${speciesName(w)}  DAY ${w.day}  ${w.quests} QUESTS  ${w.buildings} BUILT`;
}
