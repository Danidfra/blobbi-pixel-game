/**
 * THE TITLE SCREEN, drawn over a slowly drifting view of an island. Keyboard (arrows, Enter, Escape), mouse and touch
 * all work; every page uses the same cards and buttons as the menus.
 *
 *   first time (no saved island)   BLOBBI PIXEL, "a little world awaits you": BEGIN · SETTINGS (· about)
 *                                  BEGIN → CHOOSE YOUR CARRIER → NAME YOUR ISLAND → the island is made → intro
 *   returning                      "welcome back!": CONTINUE (the active island) · SETTINGS (· islands · about)
 *
 * One island (M10 phase C): the first public release gives each player one active Carrier and island, so the main
 * menu has no NEW ISLAND. This is a product rule only: every island keeps its own identity and save, the ISLANDS page
 * lists every island this browser holds (older versions could make several) so none is ever trapped, opening one
 * makes it the active island, and `allowNewIsland` brings NEW ISLAND back (development, or a later release).
 *
 * The title never makes a world itself: CREATE ISLAND moves to a short "creating" page and leaves a request
 * (`pendingCreate`) that the host takes on its next frame — exactly once, so a double press cannot make two islands.
 * If making the island fails, the host says why (`createFailed`) and the player is back on the Carrier page.
 *
 * Safety: NEW ISLAND always makes a world that has no save (see `newWorldSeeds`), so it can never overwrite one.
 * ISLANDS opens worlds; deleting one (its row's DELETE, or X / Delete on the keyboard) always asks first on a page
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
import { getLocale, LOCALES, t, upper } from '../i18n';
import { nextLocale } from './screens/settings';

export type TitlePage = 'welcome' | 'main' | 'islands' | 'about' | 'carrier' | 'name' | 'creating' | 'error' | 'delete' | 'newConfirm' | 'companion' | 'login' | 'owner' | 'arrived' | 'switch';

/** M11D.4: whose a new Blobbi is: a new identity of its own on this device, or the connected account. */
export type NewOwner = 'guest' | 'account';

/** M11D.3: who lives on a new island: a Blobbi met there (an egg hatches) or the one already chosen. */
export type Companion = 'new' | 'current';

/** M11D.3: the optional Nostr account as the title shows it (the Nostr module itself is never imported here). */
export interface TitleAccount {
  status: 'connected' | 'connecting' | 'disconnected';
  name: string | null;
  signerAvailable: boolean;
  /** M11D.4: how it is connected ('vault': an identity this game keeps; 'nip07': a browser extension). */
  method?: 'nip07' | 'vault' | null;
}

export interface TitleActions {
  /** Saved worlds, most recent first. */
  worlds(): WorldEntry[];
  /** The world the playground has loaded now (its identity), whether it has a save, and whether a link named it. */
  current(): { identity: string; name: string; saved: boolean; linked?: boolean };
  /** CONTINUE: the active island. */
  continueGame(): void;
  /** The active island's identity (the one CONTINUE plays), when the host knows it; else the most recent one. */
  activeIdentity?(): string | null;
  /** Offer NEW ISLAND on the islands page (off for the one-island release; on in development). */
  allowNewIsland?: boolean;
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
  /** M11D.3: the optional Nostr account (absent: no LOGIN WITH NOSTR row). */
  account?(): TitleAccount;
  /** M11D.3: connect the browser extension (NIP-07, read-only; the existing connection). */
  connect?(): void;
  /** M11D.3: open MY BLOBBIS over the title (choose one of my Blobbis). */
  myBlobbis?(): void;
  /** M11D.3: the Blobbi chosen now, when it is one worth keeping (not the default visitor): its name for the companion page. */
  currentBlobbi?(): { name: string } | null;
  /** M11D.3: one more line for an island's card: when it was last played and who came last. */
  islandNote?(w: WorldEntry): string;
  /** M11D.4: open the backup restore (I HAVE A BACKUP) over the title. */
  restoreBackup?(): void;
}

/** What each Carrier is like: the same game on each, a different look and mood (in the current language). */
const carrierCard = (kind: CarrierKind) => ({
  kind,
  get name(): string {
    return upper(t(`carrier.${kind}.name`));
  },
  get mood(): string {
    return t(`carrier.${kind}.mood`);
  },
});
export const CARRIER_CARDS: readonly { readonly kind: CarrierKind; readonly name: string; readonly mood: string }[] = [carrierCard('turtle'), carrierCard('manta'), carrierCard('whale')];

const W = 320;
const H = 180;
/** The dark under text drawn straight on the island scene (M11B readability). */
const SHADE = DESIGN.card;
/** The Carrier pictures on the cards. */
export const CARD_PIC = { w: 92, h: 56 } as const;

interface Item {
  label: string;
  detail?: string;
  world?: WorldEntry;
  danger?: boolean;
  /** A small secondary row (ISLANDS, ABOUT): a slim card, never prominent. */
  minor?: boolean;
  /** M11D.3: a second detail line (an island's last played time and Blobbi). */
  detail2?: string;
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
  pendingCreate: { kind: CarrierKind; name: string; companion: Companion; owner: NewOwner } | null = null;
  /** M11D.4: whose the new Blobbi will be (asked when an account is connected). */
  private owner: NewOwner = 'guest';
  /** M11D.3: the companion already decided for this adventure (LOGIN WITH NOSTR's MEET A NEW BLOBBI), or null. */
  companionPreset: Companion | null = null;
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
  /**
   * M11D.6: the Blobbi just brought back from a backup (its name), while the player chooses where to go on: the
   * islands page greets it, and a new adventure offers CONTINUE WITH <name> first (MEET A NEW BLOBBI still there).
   */
  restoredName: string | null = null;
  /** M11D.8: the player pressed a key or touched the title (an automatic entry then never takes over). */
  touched = false;
  /** M11D.8: the "who comes along?" question: the current Blobbi, the one that would come, the island, the answers. */
  private switchOffer: { current: string; walking: string; island: string; bring: () => void; keep: () => void } | null = null;

  constructor(private readonly actions: TitleActions) {
    this.reset();
  }

  /** Show the right first page: WELCOME for a first-time player (no saved island), else the main menu. */
  reset(): void {
    const first = this.actions.worlds().length === 0 && !this.actions.current().saved && !this.actions.current().linked;
    this.go(first ? 'welcome' : 'main');
    this.pendingCreate = null;
    this.restoredName = null;
    this.switchOffer = null;
  }

  /**
   * M11D.8, A CONNECTED PLAYER WITH NO ISLAND ON THIS DEVICE: welcome back, with their current Blobbi (already chosen
   * by the host). A new adventure offers it first as the companion (no new egg in its place).
   */
  arrived(name: string): void {
    this.active = true;
    this.restoredName = name;
    this.pendingCreate = null;
    this.go('arrived');
  }

  /**
   * M11D.8, ANOTHER CURRENT BLOBBI: the player's current Blobbi in the other worlds is not the one that would come to
   * this island. Asked once: BRING it, or CONTINUE with the one of this device (nothing about the island changes).
   */
  offerSwitch(o: { current: string; walking: string; island: string; bring: () => void; keep: () => void }): void {
    this.active = true;
    this.switchOffer = o;
    this.go('switch');
  }

  /** M11D.8: several islands could be the player's: they choose (never one picked for them). */
  showIslands(): void {
    this.active = true;
    this.go('islands');
  }

  get firstTime(): boolean {
    return this.page === 'welcome';
  }

  private items(): Item[] {
    const a = this.actions;
    if (this.page === 'welcome')
      return [
        { label: upper(t('title.newAdventure')), detail: upper(t('title.newAdventure.first')), run: () => this.newAdventure() },
        ...this.loginRow(),
        { label: upper(t('title.settings')), run: () => a.settings() },
        { label: upper(t('title.about')), minor: true, run: () => this.go('about') },
      ];
    if (this.page === 'main') {
      const worlds = a.worlds();
      const active = this.activeEntry(worlds);
      const cur = a.current();
      const out: Item[] = [];
      // CONTINUE ADVENTURE: the island itself when there is one; a choice of islands when there are several (M11D.3).
      if (active && worlds.length > 1) out.push({ label: upper(t('title.continueAdventure')), detail: upper(t('title.continueChoose', { count: worlds.length })), run: () => this.go('islands') });
      else if (active) out.push({ label: upper(t('title.continueAdventure')), detail: upper(t('title.continue.detail', { name: active.name, species: speciesName(active), day: active.day })), run: () => a.continueGame() });
      if (cur.linked && !worlds.some((w) => w.identity === cur.identity) && a.playCurrent) out.push({ label: upper(t('title.playLinked')), detail: upper(t('title.playLinked.detail', { name: cur.name })), run: () => a.playCurrent!() });
      out.push({ label: upper(t('title.newAdventure')), detail: upper(t('title.newAdventure.detail')), run: () => this.newAdventure() });
      out.push(...this.loginRow());
      out.push({ label: upper(t('title.settings')), run: () => a.settings() });
      // The islands page is always reachable (a quiet row): every saved island stays recoverable.
      out.push({ label: upper(worlds.length > 1 ? t('title.islandsCount', { count: worlds.length }) : t('title.islands')), minor: true, run: () => this.go('islands') });
      out.push({ label: upper(t('title.about')), minor: true, run: () => this.go('about') });
      return out;
    }
    if (this.page === 'islands') {
      const worlds = a.worlds();
      const active = this.activeEntry(worlds);
      const list = worlds.map((w) => ({ label: upper(w.name), detail: (w === active ? `${upper(t('title.active'))}  ` : '') + worldDetail(w), detail2: a.islandNote ? upper(a.islandNote(w)) : undefined, world: w, run: () => a.openWorld(w) }));
      // M11D.3: several islands are a feature now; a new one always asks first (the others stay saved).
      const more: Item[] = [{ label: upper(t('title.newAdventure')), detail: upper(t('title.newAdventure.detail')), run: () => this.newAdventure() }];
      return [...list, ...more, { label: upper(t('title.back')), run: () => this.back() }];
    }
    if (this.page === 'newConfirm')
      return [
        { label: upper(t('title.newConfirm.go')), detail: upper(t('title.newConfirm.goDetail')), run: () => this.go('carrier') },
        { label: upper(t('title.newConfirm.back')), detail: upper(t('title.newConfirm.backDetail')), run: () => this.back() },
      ];
    if (this.page === 'companion') {
      const cur = a.currentBlobbi?.() ?? null;
      const meet: Item = { label: upper(t('title.meetNew')), detail: upper(t('title.meetNew.detail')), run: () => this.create('new') };
      const bring: Item[] = cur ? [{ label: upper(t('title.bringCurrent', { name: cur.name })), detail: upper(t('title.bringCurrent.detail')), run: () => this.create('current') }] : [];
      // M11D.6: a Blobbi just restored is the obvious companion: it comes first.
      return [...(this.restoredName ? [...bring, meet] : [meet, ...bring]), { label: upper(t('title.back')), run: () => this.back() }];
    }
    if (this.page === 'login') {
      const acc = a.account?.();
      const backup: Item[] = a.restoreBackup ? [{ label: upper(t('title.login.backup')), detail: upper(t('title.login.backupDetail')), minor: true, run: () => a.restoreBackup!() }] : [];
      if (acc?.status === 'connected')
        return [
          ...(a.myBlobbis ? [{ label: upper(t('title.login.mine')), detail: upper(t('title.login.mineDetail')), run: () => a.myBlobbis!() }] : []),
          { label: upper(t('title.meetNew')), detail: upper(t('title.login.newDetail')), run: () => this.newAdventure('new') },
          ...backup,
          { label: upper(t('title.back')), run: () => this.back() },
        ];
      return [
        { label: upper(t(acc?.status === 'connecting' ? 'title.login.connecting' : 'title.login.connect')), detail: upper(t('title.login.connectDetail')), run: () => (acc?.status === 'connecting' ? undefined : a.connect?.()) },
        { label: upper(t('title.login.guest')), detail: upper(t('title.login.guestDetail')), run: () => this.back() },
        ...backup,
      ];
    }
    if (this.page === 'arrived') {
      const name = this.restoredName ?? 'Blobbi';
      return [
        { label: upper(t('title.arrived.go', { name })), detail: upper(t('title.arrived.goDetail', { name })), run: () => this.newAdventure() },
        ...(a.myBlobbis ? [{ label: upper(t('title.login.mine')), detail: upper(t('title.login.mineDetail')), run: () => a.myBlobbis!() }] : []),
        { label: upper(t('title.back')), run: () => this.back() },
      ];
    }
    if (this.page === 'switch' && this.switchOffer) {
      const o = this.switchOffer;
      return [
        { label: upper(t('title.switch.bring', { name: o.current })), detail: upper(t('title.switch.bringDetail', { island: o.island })), run: () => ((this.switchOffer = null), o.bring()) },
        { label: upper(t('title.switch.keep', { name: o.walking })), detail: upper(t('title.switch.keepDetail')), run: () => ((this.switchOffer = null), o.keep()) },
        { label: upper(t('title.back')), run: () => this.back() },
      ];
    }
    if (this.page === 'owner') {
      const acc = a.account?.();
      return [
        { label: upper(t('title.owner.account', { name: acc?.name ?? t('title.login.connectedAnon') })), detail: upper(t('title.owner.accountDetail')), run: () => this.createAs('account') },
        { label: upper(t('title.owner.device')), detail: upper(t('title.owner.deviceDetail')), run: () => this.createAs('guest') },
        { label: upper(t('title.back')), run: () => this.back() },
      ];
    }
    if (this.page === 'delete') {
      const w = this.confirm.subject;
      return [
        { label: upper(t('title.keepIt')), detail: upper(t('title.keepIt.detail')), run: () => this.cancelDelete() },
        { label: upper(t('title.deleteForever')), detail: w ? upper(t('title.deleteForever.detail', { name: w.name })) : '', danger: true, run: () => this.confirmDelete() },
      ];
    }
    if (this.page === 'name') {
      const out: Item[] = [
        { label: upper(t('title.createIsland')), detail: this.name.trim() ? `"${upper(sanitizeIslandName(this.name))}"` : upper(t('title.createIsland.unnamed')), run: () => this.afterName() },
        { label: upper(t('title.surprise')), detail: upper(t('title.surprise.detail')), run: () => this.suggest() },
      ];
      if (a.requestTextInput) out.push({ label: upper(t('title.typeName')), detail: upper(t('title.typeName.detail')), run: () => a.requestTextInput!(this.name) });
      out.push({ label: upper(t('title.back')), run: () => this.back() });
      return out;
    }
    if (this.page === 'error') return [{ label: upper(t('title.back')), detail: upper(t('title.tryAgain')), run: () => this.go('carrier') }];
    if (this.page === 'about') {
      const watch: Item[] = a.watchIntro ? CARRIER_CARDS.map((c) => ({ label: upper(t('title.watchIntro', { carrier: t(`carrier.${c.kind}.name`) })), detail: upper(t('title.watchIntro.detail')), run: () => a.watchIntro!(c.kind) })) : [];
      return [...watch, { label: upper(t('title.back')), run: () => this.back() }];
    }
    return [];
  }

  /**
   * M11D.6, AFTER A RESTORE: on to playing. With saved islands, the islands page (choose one, or a new adventure);
   * with none, straight into a new adventure (its Carrier first; the restored Blobbi is offered first as companion).
   * Never makes an island by itself. `name` null: an identity came back without a Blobbi.
   */
  afterRestore(name: string | null): void {
    this.active = true;
    this.restoredName = name;
    this.pendingCreate = null;
    if (this.actions.worlds().length > 0) return this.go('islands');
    if (name) return this.newAdventure();
    this.reset();
  }

  /** The island CONTINUE plays: the host's active one, else the most recent. */
  private activeEntry(worlds: readonly WorldEntry[]): WorldEntry | null {
    const id = this.actions.activeIdentity?.() ?? null;
    return worlds.find((w) => w.identity === id) ?? worlds[0] ?? null;
  }

  private go(page: TitlePage): void {
    this.page = page;
    this.index = 0;
    this.scroll = 0;
  }

  /** One step back: to WELCOME for a first-time player, else to the main menu. */
  private back(): void {
    if (this.page === 'name') return this.go('carrier');
    if (this.page === 'companion') return this.go('name');
    if (this.page === 'owner') return this.go('name');
    if (this.page === 'carrier' || this.page === 'about' || this.page === 'error' || this.page === 'islands' || this.page === 'newConfirm' || this.page === 'login' || this.page === 'arrived' || this.page === 'switch') {
      this.switchOffer = null;
      if (this.page !== 'login') this.companionPreset = null;
      const first = this.actions.worlds().length === 0 && !this.actions.current().saved && !this.actions.current().linked;
      this.restoredName = null;
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

  /**
   * M11D.3, NEW ADVENTURE: with islands already saved, the narrative confirmation first ("your Carrier keeps sailing
   * until you come back": nothing is deleted, the other islands stay saved and recoverable); else straight to the
   * Carrier. `companion` presets who will live there (LOGIN WITH NOSTR's MEET A NEW BLOBBI).
   */
  newAdventure(companion: Companion | null = null): void {
    this.companionPreset = companion;
    const saved = this.actions.worlds().length > 0;
    this.go(saved ? 'newConfirm' : 'carrier');
  }

  /** The name is set: who lives here? Asked only when the player has a Blobbi worth keeping and nothing is preset. */
  private afterName(): void {
    if (this.companionPreset) return this.create(this.companionPreset);
    if (this.actions.currentBlobbi?.()) return this.go('companion');
    this.create('new');
  }

  /**
   * CREATE ISLAND: leave the request for the host, once. M11D.4: a NEW Blobbi met while an account is connected asks
   * whose it will be first (the account's, or a new identity of its own on this device): never decided silently.
   */
  private create(companion: Companion = 'new'): void {
    if (this.pendingCreate || this.page === 'creating') return;
    if (companion === 'new' && this.actions.account?.().status === 'connected' && this.page !== 'owner') {
      this.companionPreset = 'new';
      this.go('owner');
      return;
    }
    this.pendingCreate = { kind: CARRIER_CARDS[this.carrier].kind, name: sanitizeIslandName(this.name), companion, owner: this.owner };
    this.companionPreset = null;
    this.restoredName = null;
    this.owner = 'guest';
    this.go('creating');
  }

  /** M11D.4: the owner chosen on the owner page. */
  private createAs(owner: NewOwner): void {
    this.owner = owner;
    this.create('new');
  }

  /** LOGIN WITH NOSTR (optional): a row on the first pages when the host has an account to offer. */
  private loginRow(): Item[] {
    const acc = this.actions.account?.();
    if (!acc) return [];
    if (acc.status === 'connected') return [{ label: upper(t('title.login.connected')), detail: upper(acc.name ? t('title.login.connectedAs', { name: acc.name }) : t('title.login.connectedAnon')), run: () => this.go('login') }];
    return [{ label: upper(t('title.login')), detail: upper(t('title.login.detail')), run: () => this.go('login') }];
  }

  /** The host takes the request (exactly once) when it is ready to make the island. */
  takeCreate(): { kind: CarrierKind; name: string; companion: Companion; owner: NewOwner } | null {
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
    this.touched = true;
    if (this.page === 'creating') return true;
    if (this.page === 'carrier') return this.carrierKey(code);
    const items = this.items();
    const naming = this.page === 'name';
    // On the name page letters type (so WASD do not move the selection there).
    if (naming && code === 'Backspace') {
      this.name = this.name.slice(0, -1);
      return true;
    }
    // L changes the language on every page but the name page (where it types).
    if (!naming && code === 'KeyL') {
      nextLocale(1);
      this.onSound?.('ui-select');
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
    this.touched = true;
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
    const g = new Gfx(W, H, scale);
    this.draw(g, time);
    const big = g.out;
    const ox = Math.floor((screen.width - big.width) / 2);
    const oy = Math.floor((screen.height - big.height) / 2);
    screen.blit(big, ox, oy);
    this.hits = g.screenHits(ox, oy);
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
    const ty = compact ? 6 : 10;
    g.buf.blit(shadow.scaled(k), tx + 2, ty + bob + 2);
    g.buf.blit(big, tx, ty + bob);
    if (!compact) {
      // PIXEL under the name, smaller; then one warm line: a welcome, or a welcome back.
      const pixel = new PixelBuffer(textWidth('PIXEL') + 1, 6);
      drawTinyText(pixel, 'PIXEL', 0, 0, UI.ink);
      const p2 = pixel.scaled(2);
      g.buf.blit(p2, Math.floor((W - p2.width) / 2), ty + 27 + bob);
      const sub = this.page === 'welcome' ? upper(t('title.tagline')) : this.page === 'main' ? upper(t('title.welcomeBack')) : '';
      if (sub) g.text(sub, Math.floor((W - g.measure(sub)) / 2), 52, this.page === 'main' ? UI.accent : UI.ink, 'body', SHADE);
    }
    this.drawLanguage(g);
    if (this.page === 'carrier') return this.drawCarriers(g, time);
    if (this.page === 'creating') return this.drawCreating(g, time);

    const items = this.items();
    // The islands page explains the active island above its list: one row fewer fits under it.
    const rows = this.page === 'islands' ? (items.some((i) => i.detail2) ? 3 : items.length > 2 ? 4 : 5) : this.page === 'newConfirm' || this.page === 'login' || this.page === 'arrived' || this.page === 'switch' ? 3 : 5;
    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + rows) this.scroll = this.index - rows + 1;
    const panelW = 184;
    const named = this.page === 'name';
    const px = named ? 18 : Math.floor((W - panelW) / 2);
    const menu = this.page === 'welcome' || this.page === 'main';
    let y = named ? 24 : menu ? 64 : 56;
    const headings: Partial<Record<TitlePage, string>> = { islands: t('title.heading.islands'), about: t('title.heading.about'), delete: t('title.heading.delete'), name: t('title.heading.name'), error: t('title.heading.error'), newConfirm: t('title.newConfirm.title'), companion: t('title.companion.title'), login: t('title.login.title'), owner: t('title.owner.title'), arrived: t('title.arrived.title'), switch: t('title.switch.title') };
    const heading = headings[this.page];
    if (heading) {
      g.heading(heading, px, y, UI.accent, SHADE);
      y += 9;
    }
    if (this.page === 'islands' && this.restoredName) y += g.para(t('title.restored', { name: this.restoredName }), px, y, panelW, UI.good, 3, SHADE) + 3;
    else if (this.page === 'islands' && items.length > 2) {
      y += g.para(t('title.islandsNote'), px, y, panelW, UI.muted, 5, SHADE) + 3;
    }
    if (this.page === 'about') y += g.para(t('title.aboutText'), px, y, panelW, UI.ink, 5, SHADE) + 4;
    if (this.page === 'newConfirm') y += g.para(t('title.newConfirm.body'), px, y, panelW, UI.ink, 6, SHADE) + 5;
    if (this.page === 'companion') y += g.para(t('title.companion.body'), px, y, panelW, UI.ink, 4, SHADE) + 4;
    if (this.page === 'owner') y += g.para(t('title.owner.body'), px, y, panelW, UI.ink, 5, SHADE) + 4;
    if (this.page === 'arrived') y += g.para(t('title.arrived.body', { name: this.restoredName ?? 'Blobbi' }), px, y, panelW, UI.ink, 5, SHADE) + 4;
    if (this.page === 'switch' && this.switchOffer) y += g.para(t('title.switch.body', { current: this.switchOffer.current, walking: this.switchOffer.walking, island: this.switchOffer.island }), px, y, panelW, UI.ink, 5, SHADE) + 4;
    if (this.page === 'login') {
      const acc = this.actions.account?.();
      const text = acc?.status === 'connected' ? (acc.name ? t('title.login.welcome', { name: acc.name }) : t('title.login.welcomeAnon')) : acc && !acc.signerAvailable ? `${t('title.login.body')} ${t('title.login.noSigner')}` : t('title.login.body');
      y += g.para(text, px, y, panelW, UI.ink, 6, SHADE) + 4;
    }
    if (this.page === 'error') y += g.para(this.error || t('title.createError'), px, y, panelW, UI.bad, 99, SHADE) + 6;
    if (this.page === 'name') y = this.drawNameField(g, px, y, panelW, time);
    if (this.page === 'delete' && this.confirm.subject) {
      const w = this.confirm.subject;
      g.text(upper(w.name), px, y, UI.ink, 'body', SHADE);
      g.text(worldDetail(w), px, y + 8, UI.muted, 'body', SHADE);
      y += 17;
      y += g.para(t('title.deleteWarning'), px, y, panelW, UI.bad, 99, SHADE) + 5;
    }
    if (this.page === 'islands' && items.length === 1) {
      y += g.para(t('title.noIslands'), px, y, panelW, UI.muted, 99, SHADE) + 6;
    }
    items.slice(this.scroll, this.scroll + rows).forEach((it, k2) => {
      const i = k2 + this.scroll;
      const selected = i === this.index;
      const h = it.minor ? 10 : it.detail2 ? 25 : it.detail ? 18 : 11;
      // The delete answer waits, greyed, until the question has been read for a moment.
      const waiting = !!it.danger && !this.confirm.armed(time);
      const c = card(panelW, h, selected ? (it.danger ? UI.bad : DESIGN.accent) : undefined);
      if (selected) c.fillRect(1, 1, panelW - 2, h - 2, DESIGN.cardHi);
      g.buf.blit(c, px, y);
      // A non-colour selection mark too.
      if (selected) for (let m = 0; m < 3; m++) g.buf.fillRect(px + 4 + m, y + 3 + m, 1, 5 - 2 * m, UI.accent);
      g.text(it.label, px + 11, y + (it.minor ? 2 : 3), waiting ? UI.line : it.danger ? UI.bad : selected ? UI.accent : it.minor ? UI.muted : UI.ink);
      // (A saved island's row keeps room for its DELETE button.)
      if (it.detail) g.text(fit(g, it.detail, panelW - 14 - (it.world && this.actions.deleteWorld ? 36 : 0)), px + 11, y + 10, UI.muted);
      if (it.detail2) g.text(fit(g, it.detail2, panelW - 14), px + 11, y + 17, UI.muted);
      g.hit(px, y, panelW, h, () => {
        this.index = i;
        it.run();
      });
      // Each saved island has its own small DELETE button (it only asks).
      const w = it.world;
      if (w && this.actions.deleteWorld) {
        const del = upper(t('title.delete'));
        const bw = Math.max(textWidth('DELETE'), g.measure(del)) + 6;
        g.button(del, px + panelW - bw - 3, y + 3, () => this.askDelete(w), { w: bw });
      }
      y += h + (it.minor ? 1 : 2);
    });
    if (named) this.drawChosen(g, px + panelW + 10, 40, time);
    if (this.scroll > 0) g.text(upper(t('title.more')), px + panelW + 3, 66, UI.muted, 'body', SHADE);
    if (this.scroll + rows < items.length) g.text(upper(t('title.more')), px + panelW + 3, y - 8, UI.muted, 'body', SHADE);
    const foot = upper(t(named ? 'title.foot.name' : this.page === 'islands' ? 'title.foot.islands' : 'title.foot.menu'));
    g.text(foot, Math.floor((W - g.measure(foot)) / 2), H - 9, UI.ink, 'body', SHADE);
  }

  /**
   * The language, in a small button at the top right of every page (M11B): a press (or L) moves to the next one.
   * It names the language in itself, so a player can find their own.
   */
  private drawLanguage(g: Gfx): void {
    const name = LOCALES.find((l) => l.id === getLocale())!.name;
    const label = t('title.language', { language: name });
    const w = Math.min(120, g.measure(label) + 10);
    g.button(label, W - w - 4, 4, () => nextLocale(1), { w, case: 'as-is' });
  }

  /** The three Carrier cards: animated pictures, names and moods; the chosen one raised with an accent frame. */
  private drawCarriers(g: Gfx, time: number): void {
    const head = upper(t('title.chooseCarrier'));
    g.text(head, Math.floor((W - g.measure(head)) / 2), 22, UI.accent, 'body', SHADE);
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
      g.para(c.mood, x + 4, y + CARD_PIC.h + 16, cw - 7, chosen ? UI.ink : UI.muted, 4);
      g.hit(x, y, cw, ch, () => {
        if (this.carrier === i) this.chooseCarrier(i);
        else this.carrier = i;
      });
    });
    const note = upper(t('title.carrierNote'));
    g.text(fit(g, note, W - 8), Math.floor((W - Math.min(W - 8, g.measure(note))) / 2), top + ch + 7, UI.ink, 'body', SHADE);
    const by = H - 22;
    g.button(t('title.back'), x0, by, () => this.back(), { w: 50 });
    const next = t('title.next', { carrier: CARRIER_CARDS[this.carrier].name });
    const nw = Math.min(150, Math.max(textWidth('NEXT: GREAT WHALE'), g.measure(upper(next))) + 12);
    g.button(next, x0 + cw * 3 + gap * 2 - nw, by, () => this.chooseCarrier(this.carrier), { w: nw, primary: true });
    const foot = upper(t('title.foot.carrier'));
    g.text(fit(g, foot, W - 8), Math.floor((W - Math.min(W - 8, g.measure(foot))) / 2), H - 9, UI.ink, 'body', SHADE);
  }

  /** The name being typed, in a field with a caret; returns the next free y. */
  private drawNameField(g: Gfx, x: number, y: number, w: number, time: number): number {
    y += g.para(t('title.nameOptional'), x, y, w, UI.ink, 99, SHADE) + 3;
    g.box(x, y, w, 13, UI.bg, UI.accent);
    const shown = upper(this.name);
    g.text(shown, x + 4, y + 4, UI.ink);
    const caretOn = this.reducedMotion || Math.floor(time * 2) % 2 === 0;
    if (caretOn) g.buf.fillRect(x + 4 + (shown ? g.measure(shown) + 1 : 0), y + 3, 1, 7, UI.accent);
    g.text(`${this.name.length}/${MAX_NAME}`, x + w - 22, y + 4, UI.muted);
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
    const lines = [upper(t('title.creating1')), upper(t('title.creating2'))];
    lines.forEach((l, i) => g.text(l, Math.floor((W - g.measure(l)) / 2), 80 + i * 10, i ? UI.ink : UI.accent, 'body', SHADE));
    const dots = this.reducedMotion ? 3 : 1 + (Math.floor(time * 3) % 3);
    for (let i = 0; i < dots; i++) g.buf.fillRect(W / 2 - 6 + i * 5, 104, 2, 2, UI.accent);
  }
}

const speciesName = (w: WorldEntry) => t(w.params.kind === 'manta' ? 'carrier.manta.short' : w.params.kind === 'whale' ? 'carrier.whale.short' : 'carrier.turtle.short');

/** One line about a saved island: its Carrier, its day, quests and buildings (upper case, like the title's rows). */
export function worldDetail(w: WorldEntry): string {
  return upper(t('title.worldDetail', { species: speciesName(w), day: w.day, quests: t('title.quests', { count: w.quests }), buildings: t('title.built', { count: w.buildings }) }));
}

/** A line cut (with "…") to fit `maxW` UI pixels as drawn. */
function fit(g: Gfx, text: string, maxW: number): string {
  if (g.measure(text) <= maxW) return text;
  const chars = [...text];
  while (chars.length > 1 && g.measure(chars.join('') + '…') > maxW) chars.pop();
  return chars.join('').trimEnd() + '…';
}
