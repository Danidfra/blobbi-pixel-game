/**
 * THE ACCOUNT INVITATION (M11C.5): one gentle, optional card that tells a guest who has grown fond of their island
 * that accounts exist. It never asks the signer anything, never creates an account, never publishes, and never
 * touches an island: its only action opens the existing ACCOUNT page.
 *
 * WHEN. Only after real engagement, all of them:
 * - at least `MIN_ACTIVE_SECONDS` of ACTIVE play in this browser: seconds the world was running (no menu, no intro,
 *   tab visible) while the player had pressed a key or touched the screen within the last `IDLE_AFTER` seconds;
 *   an idle tab never counts;
 * - at least one Blobbi interaction (petted, fed, played, a meal);
 * - at least `MIN_MAIN_QUESTS` main quests finished (the first three take a few minutes: meet, explore, gather).
 * And never: when an account is connected, after "Don't show this again", within `COOLDOWN_MS` of the last time it
 * was shown, twice in one session, for a visitor, or while the player is busy (`isBusy`: a menu, a bubble or the
 * Carrier speaking, a notice, fishing, a swing, resting, teleporting, a reveal, the canoe, building or placing, the
 * first chapter's tips). It waits for a calm moment instead of interrupting one.
 *
 * Kept per browser under `blobbi-pixel-lab:account-invite` (public, tiny, never part of a save).
 */
import type { KeyValueStore } from '../game/persistence';
import { QUEST_CONTENT } from '../content/quests';

export const INVITE_KEY = 'blobbi-pixel-lab:account-invite';
export const INVITE_VERSION = 1;
/** Ten minutes of active play. */
export const MIN_ACTIVE_SECONDS = 600;
/** Main quests finished (meet, arrive and gather come first). */
export const MIN_MAIN_QUESTS = 3;
/** Seconds without a key or a touch after which play no longer counts as active. */
export const IDLE_AFTER = 60;
/** Three days between showings, whatever the answer was (and after a reload). */
export const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
/** Shown this long (active seconds) without an answer, the card quietly leaves (counts as "maybe later"). */
export const SHOW_SECONDS = 90;

/** The first chapter's tips: the invitation never competes with them. */
export const IMPORTANT_TIPS: ReadonlySet<string> = new Set(['move', 'blobbi', 'gather', 'bag', 'craft', 'tool', 'build']);

export interface InviteRecord {
  version: typeof INVITE_VERSION;
  /** Active play counted so far (seconds). */
  activeSeconds: number;
  /** "Don't show this again". */
  optOut: boolean;
  /** When it was last shown (ms since 1970), or null. */
  shownAt: number | null;
  /** How the last showing ended: 'later' (or timed out), 'explore', or null. */
  answer: 'later' | 'explore' | null;
}

export const newInviteRecord = (): InviteRecord => ({ version: INVITE_VERSION, activeSeconds: 0, optOut: false, shownAt: null, answer: null });

export function loadInvite(store: KeyValueStore | null): InviteRecord {
  if (!store) return newInviteRecord();
  try {
    const v = JSON.parse(store.get(INVITE_KEY) ?? 'null') as Partial<InviteRecord> | null;
    if (!v || v.version !== INVITE_VERSION) return newInviteRecord();
    return {
      version: INVITE_VERSION,
      activeSeconds: typeof v.activeSeconds === 'number' && Number.isFinite(v.activeSeconds) && v.activeSeconds >= 0 ? v.activeSeconds : 0,
      optOut: v.optOut === true,
      shownAt: typeof v.shownAt === 'number' && Number.isFinite(v.shownAt) ? v.shownAt : null,
      answer: v.answer === 'later' || v.answer === 'explore' ? v.answer : null,
    };
  } catch {
    return newInviteRecord();
  }
}

export function saveInvite(store: KeyValueStore | null, r: InviteRecord): void {
  try {
    store?.set(INVITE_KEY, JSON.stringify(r));
  } catch {
    // A browser that will not store it: the invitation simply stays quieter (it is already once per session).
  }
}

/** What the invitation needs to know about the island being played (a `LiveWorld` fits). */
export interface InviteWorld {
  visitor: boolean;
  tally: { petted: number; fed: number; played: number; mealsFed: number };
  objectives: { completed: Readonly<Record<string, number>> };
}

const MAIN_QUESTS: ReadonlySet<string> = new Set(QUEST_CONTENT.filter((q) => q.type === 'main').map((q) => q.id));

/** Real engagement with this island and its Blobbi. */
export function engaged(w: InviteWorld): boolean {
  const care = w.tally.petted + w.tally.fed + w.tally.played + w.tally.mealsFed;
  const mains = Object.keys(w.objectives.completed).filter((id) => MAIN_QUESTS.has(id)).length;
  return care >= 1 && mains >= MIN_MAIN_QUESTS;
}

/** Everything that makes a moment "not calm": the card waits while any of it is true. */
export interface BusyState {
  menuOpen: boolean;
  /** A speech bubble (the Blobbi, the Carrier) is on screen. */
  bubble: boolean;
  notice: boolean;
  /** Fishing, a tool swing, resting, teleporting, a reveal, the canoe, building, placing, managing, moving. */
  action: boolean;
  /** The tip on screen, if any (its tutorial step id). */
  tip: string | null;
  intro: boolean;
}

export function isBusy(b: BusyState): boolean {
  return b.menuOpen || b.bubble || b.notice || b.action || b.intro || (b.tip !== null && IMPORTANT_TIPS.has(b.tip));
}

/** May the card appear now? Pure: the record, the session, the account and the island. */
export function eligible(r: InviteRecord, o: { now: number; shownThisSession: boolean; connected: boolean; world: InviteWorld | null }): boolean {
  if (r.optOut || o.connected || o.shownThisSession || !o.world || o.world.visitor) return false;
  if (r.shownAt !== null && o.now - r.shownAt < COOLDOWN_MS) return false;
  return r.activeSeconds >= MIN_ACTIVE_SECONDS && engaged(o.world);
}

/**
 * The invitation's state machine, owned by the playground: count active time, show the card at a calm moment,
 * answer it. Writes the small record on show, on every answer and every 30 active seconds.
 */
export class AccountInvite {
  record: InviteRecord;
  /** The card is up (drawn by the game UI when nothing else is open). */
  visible = false;
  /** "Don't show this again" is ticked on the card. */
  optOutTicked = false;
  private shownThisSession = false;
  private visibleFor = 0;
  private sinceWrite = 0;
  private readonly now: () => number;

  constructor(
    private readonly store: KeyValueStore | null,
    private readonly connected: () => boolean,
    now?: () => number,
  ) {
    this.now = now ?? Date.now;
    this.record = loadInvite(store);
  }

  /**
   * One frame of play: `running` (the world stepped, no menu, no intro, tab visible), `inputAge` seconds since the
   * player's last key or touch, the island, and whether the moment is busy.
   */
  update(dt: number, o: { running: boolean; inputAge: number; world: InviteWorld | null; busy: boolean }): void {
    if (this.visible) {
      // Connected meanwhile, or the card was left alone long enough: it leaves without a fuss.
      if (this.connected()) this.visible = false;
      else if (o.running && !o.busy && (this.visibleFor += dt) >= SHOW_SECONDS) this.answer('later');
      return;
    }
    if (o.running && o.inputAge <= IDLE_AFTER && dt > 0 && dt < 1) {
      this.record.activeSeconds += dt;
      if ((this.sinceWrite += dt) >= 30) {
        this.sinceWrite = 0;
        saveInvite(this.store, this.record);
      }
    }
    if (!o.running || o.busy) return;
    if (!eligible(this.record, { now: this.now(), shownThisSession: this.shownThisSession, connected: this.connected(), world: o.world })) return;
    this.visible = true;
    this.visibleFor = 0;
    this.optOutTicked = false;
    this.shownThisSession = true;
    this.record.shownAt = this.now();
    saveInvite(this.store, this.record);
  }

  /** The player answered: 'explore' (the host opens ACCOUNT) or 'later'. The tick box applies to both. */
  answer(how: 'explore' | 'later'): void {
    if (!this.visible) return;
    this.visible = false;
    this.record.answer = how;
    if (this.optOutTicked) this.record.optOut = true;
    saveInvite(this.store, this.record);
  }
}
