/**
 * COMPANION SYNC, IN THE GAME: the Blobbi the player chooses is their companion in every Blobbi app (kind 11125
 * `current_companion`, shared with Blobbi Standalone and Ditto), and a choice made there is met here.
 *
 * No network here (the host passes `resolve` and `share`), so every rule is testable:
 *
 *  - A CHOICE MADE HERE (MY BLOBBIS, BRING, CONTINUE WITH, the answer to the question below) walks at once and is
 *    shared in the background (`chosen`). Never shared: a reload, an automatic entry or resume, a choice adopted from
 *    another app, the visiting Blobbi, a Blobbi met here and not shared yet. A failure is said once, small, and
 *    retried in this visit (when the connection returns, then after 15 s, 60 s, 180 s), or by TRY AGAIN in MY BLOBBIS.
 *    Only the player's own acts (the choice, TRY AGAIN, the answer) may ask the browser extension to sign: an automatic
 *    retry resends a write already signed, and one that would need a new signature waits for TRY AGAIN
 *    (`needs-signature`). The vault signs without asking anyone, so its retries may sign.
 *  - A CHOICE MADE ELSEWHERE is looked for every minute in play and when the page comes back (`check`). When the rules
 *    (`companion-order.ts`) say it is newer, it comes along by teleport, but only when the moment is calm (no menu,
 *    no speech, no timed action, no teleport, no cinematic: `calm`); until then the Blobbi of this device walks on.
 *  - TOO CLOSE TO TELL: nothing is overwritten; the player is told once, and MY BLOBBIS asks which one comes along.
 *
 * Only the connected account whose identity is really here (`present`: the vault keeps its key, or the extension
 * answered with it) ever shares; everything is keyed by that account, so a switch never carries a choice over.
 */
import { orderChoices, type ChoiceOrder, type LocalChoiceFacts, type ProfileStamp, type SeenProfile } from './companion-order';
import { selectionOrder, SELECTION_SKEW_MS, type EntryLocalChoice } from './world-entry';

/** The player's current Blobbi across the apps, as the host read it. */
export type RemoteCompanion =
  | { status: 'current'; d: string; name: string; id: string; createdAt: number; walkable: boolean; item: unknown }
  | { status: 'other'; profile: ProfileStamp | null };

/** The device's choice of the walking Blobbi, when it is the connected account's own canonical Blobbi. */
export interface LocalCompanion extends EntryLocalChoice {
  d: string;
  name: string;
}

export type ShareResult = 'shared' | 'unchanged' | 'superseded' | 'ambiguous' | 'no-profile' | 'rehearsal' | 'unsafe' | 'partial' | 'failed' | 'sign-failed' | 'wrong-account' | 'offline' | 'needs-signature';

export interface CompanionHost {
  /** The connected account, and whether its identity is really here (never a read-only session). */
  account(): { pubkey: string; present: boolean } | null;
  /** The walking Blobbi, when it is that account's own Blobbi (else null: a visitor, a Blobbi met here). */
  local(): LocalCompanion | null;
  resolve(pubkey: string): Promise<RemoteCompanion | null>;
  /** `byPlayer`: the player's own act (it may ask the signer); else an automatic retry. */
  share(req: { owner: string; d: string; at: number; over: SeenProfile | null; byPlayer: boolean }): Promise<{ kind: ShareResult; stamp?: ProfileStamp }>;
  /** Bring the remote choice along (stored as adopted: never shared again). */
  bring(remote: Extract<RemoteCompanion, { status: 'current' }>): void;
  /** The stored choice of `d` is now carried by this profile event. */
  markSynced(d: string, stamp: ProfileStamp): void;
  /** The player confirmed the walking Blobbi (the answer "keep"): stamp it as their choice, now, made over `over`. */
  restamp(over: SeenProfile | null): void;
  calm(): boolean;
  online(): boolean;
  now(): number;
  notify(kind: 'came' | 'not-shared' | 'offline' | 'sign-failed' | 'ask', names: { name: string; other?: string }): void;
}

export type CompanionStatus = { kind: 'idle' } | { kind: 'sharing' } | { kind: 'shared' } | { kind: 'local-only' } | { kind: 'waiting'; reason: 'unsafe' | 'partial' | 'failed' | 'sign-failed' | 'offline' | 'not-sent' };

export const RETRY_DELAYS_MS = [15_000, 60_000, 180_000];
const ZERO: ProfileStamp = { id: '0'.repeat(64), createdAt: 0 };

export class CompanionSync {
  status: CompanionStatus = { kind: 'idle' };
  /** The question to put in MY BLOBBIS, or null. */
  ambiguity: { here: LocalCompanion; there: Extract<RemoteCompanion, { status: 'current' }> } | null = null;
  /** The profile the player was last shown (a choice made now is made over it). */
  seen: SeenProfile | null = null;
  private waitingToBring: Extract<RemoteCompanion, { status: 'current' }> | null = null;
  private owner: string | null = null;
  private sharing: Promise<void> | null = null;
  private again = false;
  private againByPlayer = false;
  private retriesLeft = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private askedAbout: string | null = null;

  constructor(private readonly host: CompanionHost) {}

  /** The account changed (connect, disconnect, switch): forget everything about the previous one. */
  accountChanged(): void {
    const acc = this.host.account();
    if (acc?.pubkey === this.owner) return;
    this.owner = acc?.pubkey ?? null;
    this.status = { kind: 'idle' };
    this.ambiguity = null;
    this.waitingToBring = null;
    this.seen = null;
    this.askedAbout = null;
    this.retriesLeft = 0;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private present(): { pubkey: string } | null {
    const acc = this.host.account();
    if (!acc || !acc.present) return null;
    if (acc.pubkey !== this.owner) this.accountChanged();
    return acc;
  }

  /** The player chose the walking Blobbi here (it walks already): share it, with retries in this visit. */
  chosen(): Promise<void> {
    this.present();
    this.ambiguity = null;
    this.waitingToBring = null;
    this.retriesLeft = RETRY_DELAYS_MS.length;
    return this.runShare(true);
  }

  /** TRY AGAIN (MY BLOBBIS). */
  retry(): Promise<void> {
    this.present();
    this.retriesLeft = RETRY_DELAYS_MS.length;
    return this.runShare(true);
  }

  /** The connection came back: a share still waiting in this visit goes again. */
  online(): void {
    if (this.status.kind === 'waiting' && this.status.reason !== 'not-sent' && this.retriesLeft > 0) void this.runShare();
  }

  private async runShare(byPlayer = false): Promise<void> {
    if (this.sharing) {
      this.again = true;
      this.againByPlayer ||= byPlayer;
      return this.sharing;
    }
    const acc = this.present();
    const local = this.host.local();
    if (!acc || !local || local.by !== 'player' || local.synced) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.retriesLeft > 0) this.retriesLeft--;
    this.status = { kind: 'sharing' };
    const d = local.d;
    this.sharing = (async () => {
      let out: { kind: ShareResult; stamp?: ProfileStamp };
      if (!this.host.online()) out = { kind: 'offline' };
      else {
        try {
          out = await this.host.share({ owner: acc.pubkey, d, at: local.at ?? this.host.now(), over: local.over ?? null, byPlayer });
        } catch {
          out = { kind: 'failed' };
        }
      }
      // The account or the choice changed meanwhile: this result is nobody's now
      if (this.host.account()?.pubkey !== acc.pubkey || this.host.local()?.d !== d) {
        this.status = { kind: 'idle' };
        return;
      }
      switch (out.kind) {
        case 'shared':
        case 'unchanged':
          if (out.stamp) this.host.markSynced(d, out.stamp);
          this.status = { kind: 'shared' };
          return;
        case 'superseded':
          // A newer choice elsewhere: this one is older by the network's order; the next look brings that one
          this.host.markSynced(d, ZERO);
          this.status = { kind: 'idle' };
          void this.check();
          return;
        case 'ambiguous':
          this.status = { kind: 'idle' };
          void this.check();
          return;
        case 'no-profile':
        case 'rehearsal':
          this.status = { kind: 'local-only' };
          return;
        case 'wrong-account':
          this.status = { kind: 'idle' };
          return;
        case 'needs-signature':
          // Only the player may ask the signer: TRY AGAIN (said once, as any share that waits)
          this.status = { kind: 'waiting', reason: 'not-sent' };
          this.host.notify('not-shared', { name: local.name });
          return;
        default: {
          const reason = out.kind;
          this.status = { kind: 'waiting', reason };
          this.host.notify(reason === 'offline' ? 'offline' : reason === 'sign-failed' ? 'sign-failed' : 'not-shared', { name: local.name });
        }
      }
    })();
    try {
      await this.sharing;
    } finally {
      this.sharing = null;
    }
    if (this.again) {
      const byPlayerAgain = this.againByPlayer;
      this.again = false;
      this.againByPlayer = false;
      return this.runShare(byPlayerAgain);
    }
    const now = this.status as CompanionStatus;
    if (now.kind === 'waiting' && now.reason !== 'sign-failed' && now.reason !== 'not-sent' && this.retriesLeft > 0 && !this.timer) {
      const delay = RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - this.retriesLeft] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.runShare();
      }, delay);
    }
  }

  /** Look at the player's current Blobbi across the apps and put it in order with the walking one (reads only). */
  async check(): Promise<void> {
    const acc = this.host.account();
    if (!acc) return;
    if (acc.pubkey !== this.owner) this.accountChanged();
    const remote = await this.host.resolve(acc.pubkey);
    if (!remote || this.host.account()?.pubkey !== acc.pubkey) return;
    if (remote.status === 'other') {
      if (remote.profile) this.seen = { ...remote.profile, d: null };
      return;
    }
    this.seen = { id: remote.id, createdAt: remote.createdAt, d: remote.d };
    const local = this.host.local();
    if (!local) return;
    if (local.d === remote.d) {
      this.ambiguity = null;
      this.waitingToBring = null;
      // The same Blobbi on both sides: a choice still waiting to be shared is shared already
      if (local.by === 'player' && !local.synced) {
        this.host.markSynced(local.d, { id: remote.id, createdAt: remote.createdAt });
        if (this.status.kind === 'waiting') this.status = { kind: 'shared' };
      }
      return;
    }
    if (!remote.walkable) return;
    const order = orderOf(local, remote, this.host.now());
    if (order.winner === 'global') {
      this.ambiguity = null;
      this.waitingToBring = remote;
      this.tick();
    } else if (order.winner === 'ambiguous') {
      this.waitingToBring = null;
      this.ambiguity = { here: local, there: remote };
      const key = `${local.d}|${remote.id}`;
      if (this.askedAbout !== key) {
        this.askedAbout = key;
        this.host.notify('ask', { name: local.name, other: remote.name });
      }
    } else {
      this.ambiguity = null;
      this.waitingToBring = null;
      // This device's choice is newer and not shared yet (a reload): it waits for TRY AGAIN, never sent by itself
      if (local.by === 'player' && !local.synced && this.status.kind === 'idle') this.status = { kind: 'waiting', reason: 'not-sent' };
    }
  }

  /** Every so often in play: a remote choice waiting for a calm moment comes along now. */
  tick(): void {
    const r = this.waitingToBring;
    if (!r || !this.host.calm()) return;
    if (this.host.account()?.pubkey !== this.owner) return void (this.waitingToBring = null);
    this.waitingToBring = null;
    this.host.bring(r);
    this.host.notify('came', { name: r.name });
  }

  /** Whether a remote choice is waiting for a calm moment. */
  get bringing(): boolean {
    return this.waitingToBring !== null;
  }

  /** The player's answer to the question: keep the Blobbi here (shared now), or bring the other one. */
  answer(keep: boolean): Promise<void> {
    const a = this.ambiguity;
    if (!a) return Promise.resolve();
    this.ambiguity = null;
    if (keep) {
      // Now their newest choice, made knowing the other one: shared like any other
      this.host.restamp(this.seen);
      return this.chosen();
    }
    this.host.bring(a.there);
    this.host.notify('came', { name: a.there.name });
    return Promise.resolve();
  }
}

/** The shared rules, with this game's clock rule (an unstamped choice's `existedBy` bound). */
export function orderOf(local: LocalCompanion, remote: Extract<RemoteCompanion, { status: 'current' }>, now: number): ChoiceOrder {
  const facts: LocalChoiceFacts = { d: local.d, at: local.at, by: local.by, synced: local.synced ?? null, over: local.over ?? null };
  return orderChoices(facts, { d: remote.d, id: remote.id, createdAt: remote.createdAt }, now, SELECTION_SKEW_MS, (_l, remoteAt, n) => {
    const o = selectionOrder(local, remoteAt, n);
    return o.order === 'remote' ? { winner: 'global', rule: 'clock' } : o.order === 'local' ? { winner: 'local', rule: 'clock' } : { winner: 'ambiguous', rule: 'clock' };
  });
}
