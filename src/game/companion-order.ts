/**
 * COMPANION SYNC: WHICH CHOICE OF COMPANION WINS, this device's (the walking Blobbi, `blobbi-selection.ts`) or the
 * player's global one (kind 11125 `current_companion`, which every Blobbi app reads and writes: Blobbi Standalone,
 * this game, Ditto). A pure function, no network.
 *
 * The SAME rules as Blobbi Standalone's `src/features/companion/choice-order.ts`, pinned by the same test vectors
 * (`tests/companion-order.test.ts`); a later `@blobbi-kit/core` release could hold them once for every app. The one
 * difference is not in the rules: this game's choices made before M11D.8.3 carry no time, and their order by the
 * clock is still `selectionOrder` (`world-entry.ts`: an `existedBy` bound can only find them older), passed in as
 * `clock` for rule 6b.
 *
 * THE RULES ("choice order v1"), in order:
 *
 *  1. Same Blobbi on both sides: `agree`.
 *  2. Nothing usable on one side: the other one. A global choice is usable
 *     only when its profile is valid and it names a Blobbi of the player's
 *     own collection (checked by the caller).
 *  3. The local choice is known to the network (`synced`: the very profile
 *     event this device published or adopted, signed, with its `created_at`
 *     and id): both are profile events, so they are ordered the way relays
 *     order replaceable events (NIP-01): the newer `created_at` wins, and on
 *     equal times the lower id. A choice that reached the network never blocks
 *     a later one made anywhere else.
 *  4. A choice adopted from the network before ids were kept (`by: 'remote'`
 *     with only its time): ordered by `created_at` alone, equal is ambiguous.
 *  5. A choice from before choices were stamped, made by an app that
 *     published every change (`by: 'legacy'`): the global choice wins.
 *  6. A choice made here and NOT yet known to the network (offline, a failed
 *     or refused signature, no profile to update):
 *     a. made over the very profile now seen, or over a newer one (`over`:
 *        the profile the player was shown when they chose): the player chose
 *        knowing that choice, so theirs wins. A profile written AFTER it is
 *        never ignored, even one naming the Blobbi the player passed over (it
 *        may be a real new choice made elsewhere): the clock decides (b);
 *     b. otherwise this device's clock against the profile's `created_at`.
 *        Only a clear gap of more than `CHOICE_SKEW_MS`, both times in the
 *        past, decides; anything else (too close, a future time, a missing
 *        time) is ambiguous.
 *
 * `ambiguous` is never settled silently: the player is asked which Blobbi
 * comes along.
 */

/** Clocks of different devices are never exactly the same: closer than this, two choices cannot be ordered. */
export const CHOICE_SKEW_MS = 60_000;

/**
 * For WRITERS: a choice shared within this long of being made is the player's latest act in real time: every profile
 * a writer finds on the relays then was written before it (give or take these seconds), whatever its device's clock
 * says, so it is written over them without asking. Only a later attempt (a retry, a choice kept offline) is ordered
 * by the rules above against what it finds. (Two choices made in two apps within these seconds: the later write wins.)
 */
export const CHOICE_FRESH_MS = 30_000;

/** A profile event, as far as ordering goes. `createdAt` in seconds (NIP-01). */
export interface ProfileStamp {
  id: string;
  createdAt: number;
}

export type ChoiceOrigin = 'player' | 'remote' | 'legacy';

export interface LocalChoiceFacts {
  d: string;
  /** When the choice was made on this device (ms), or the adopted event's time (ms) for `remote`; null when unknown. */
  at: number | null;
  by: ChoiceOrigin | null;
  /** The profile event that carries this choice on the network (published here, or adopted from it). */
  synced: ProfileStamp | null;
  /** For a choice made here: the profile the player was shown when they made it (null: none was known). */
  over?: SeenProfile | null;
}

/** The profile a choice was made over: its stamp and the Blobbi it named then. */
export interface SeenProfile extends ProfileStamp {
  d?: string | null;
}

export interface GlobalChoiceFacts extends ProfileStamp {
  d: string;
}

export type ChoiceWinner = 'agree' | 'local' | 'global' | 'ambiguous' | 'none';

export type AmbiguityReason = 'too-close' | 'future' | 'no-local-time' | 'equal-time';

export interface ChoiceOrder {
  winner: ChoiceWinner;
  /** Which rule decided (for tests and diagnostics; never shown). */
  rule: 'same' | 'only-local' | 'only-global' | 'nothing' | 'nip01' | 'remote-time' | 'legacy' | 'seen' | 'clock';
  reason?: AmbiguityReason;
}

/** NIP-01 for replaceable events: whether `a` replaces `b` (newer, or as new with the lower id). */
export function replaces(a: ProfileStamp, b: ProfileStamp): boolean {
  return a.createdAt > b.createdAt || (a.createdAt === b.createdAt && a.id < b.id);
}

/** Rule 6b by another clock rule (this game's `selectionOrder` for its unstamped choices); same answers for stamped ones. */
export type ClockRule = (local: LocalChoiceFacts, remoteAtMs: number, now: number) => ChoiceOrder;

export function orderChoices(local: LocalChoiceFacts | null, global: GlobalChoiceFacts | null, now: number, skewMs = CHOICE_SKEW_MS, clock?: ClockRule): ChoiceOrder {
  if (!local && !global) return { winner: 'none', rule: 'nothing' };
  if (!global) return { winner: 'local', rule: 'only-local' };
  if (!local) return { winner: 'global', rule: 'only-global' };
  if (local.d === global.d) return { winner: 'agree', rule: 'same' };

  if (local.synced) {
    if (local.synced.id === global.id) return { winner: 'global', rule: 'nip01' };
    return { winner: replaces(global, local.synced) ? 'global' : 'local', rule: 'nip01' };
  }
  if (local.by === 'legacy') return { winner: 'global', rule: 'legacy' };
  const remoteAt = global.createdAt * 1000;
  if (local.by === 'remote' && local.at !== null) {
    if (remoteAt === local.at) return { winner: 'ambiguous', rule: 'remote-time', reason: 'equal-time' };
    return { winner: remoteAt > local.at ? 'global' : 'local', rule: 'remote-time' };
  }
  if (local.over && (local.over.id === global.id || !replaces(global, local.over))) return { winner: 'local', rule: 'seen' };
  if (clock) return clock(local, remoteAt, now);
  if (local.at === null || !Number.isFinite(local.at)) return { winner: 'ambiguous', rule: 'clock', reason: 'no-local-time' };
  if (local.at > now + skewMs || remoteAt > now + skewMs) return { winner: 'ambiguous', rule: 'clock', reason: 'future' };
  const gap = remoteAt - local.at;
  if (Math.abs(gap) <= skewMs) return { winner: 'ambiguous', rule: 'clock', reason: 'too-close' };
  return { winner: gap > 0 ? 'global' : 'local', rule: 'clock' };
}

/** The current Blobbi as ordering facts, from the time it was chosen in ms (the profile's `created_at` × 1000). */
export function globalChoiceAt(d: string, id: string, atMs: number): GlobalChoiceFacts {
  return { d, id, createdAt: Math.floor(atMs / 1000) };
}
