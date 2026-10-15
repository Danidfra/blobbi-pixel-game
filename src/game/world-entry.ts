/**
 * M11D.8, SEAMLESS WORLD ENTRY: whether a returning player goes straight into their island, and with whom. A pure
 * decision over what this device knows (no network here; the host asks the relays and passes the answer in), so every
 * case is testable. The title stays the place for everything else, and is always one menu away.
 *
 * WHO MAY ENTER DIRECTLY: only a CONNECTED player whose identity is really here: an identity this game keeps (its key
 * in the vault) or a browser extension that answers with the account's own key (M11D.8.2). A remembered public key alone, a link or
 * a published profile never counts as being signed in. A disconnected account has no record, so it never enters.
 *
 * WHICH ISLAND: islands are never owned by a Blobbi (M11D.3), so the only local link between an island and an identity
 * is who played there last (`island-visits`). Islands whose last visitor is one of this identity's Blobbis are its
 * adventures. Exactly one: enter it. Several: the islands page (the player chooses). None: the title as always (an
 * island another identity or a guest played is never entered for this one). No island at all and a current Blobbi
 * that can walk: the welcome page (a new adventure WITH that Blobbi; nothing hatches in its place).
 *
* WITH WHOM: the Blobbi chosen on this device (the one that walks now). When the player's CURRENT Blobbi across the
 * Blobbi apps (kind 11125 `current_companion`, read by the host) is another one that can walk, M11D.8.3 compares the
 * two CHOICES (never the Blobbis' own state events): the device's choice carries when and by whom it was made
 * (`selectedAt`, `selectedBy`, `blobbi-selection.ts`), the current Blobbi carries the time its selection was
 * published (the profile's `created_at`). The most recent explicit choice wins when the two can be ordered reliably
 * (`compareSelections`): a newer remote choice brings that Blobbi in (`bring`); a newer local choice goes in as it
 * is. When they cannot be ordered (a choice made before M11D.8.3 with no time, equal or near-equal times within
 * `SELECTION_SKEW_MS`, a time in the future of this device's clock), the player is asked once: bring it, or stay.
 * "Stay" is remembered for that island and that current Blobbi (and stamps the device's choice as the player's,
 * now), so nothing is asked again until the current Blobbi changes. Offline (no answer): straight in with the
 * Blobbi of this device. Nothing here publishes: a choice made in this game stays on this device until an explicit,
 * consented synchronisation exists (none yet).
 *
 * A LINK NAMING AN ISLAND (`#seed=...`): while an island is played the game writes it into the address bar itself, so
 * a reload carries one (the M11D.8 intermittent title: every reload from inside an island stopped on the title, and
 * the next one, from the title, went in). An island named by a link is resumed only when it is saved on this device,
 * and it is then the only candidate; the same checks apply (its last visitor and the walking Blobbi are this
 * identity's). A link to an island not saved here keeps the title, which offers to play it, as before.
 *
 * M11D.8.2, WHILE IT IS DECIDED: the page shows the world-entry loading screen (`src/ui/entry-screen.ts`), never the
 * menu, and only while a connected account is really being looked at; a guest, `#menu` or SETTINGS > MAIN MENU
 * shows the title at once. With a browser extension (NIP-07) "present" now means the extension answered with THIS
 * account's key (`verifyExtension`): another key, no answer or no extension never enters an island for the
 * remembered account. A Blobbi chosen on the title (MY BLOBBIS) goes on with `decideChosen`: its island, the
 * islands page, or a new adventure with it; never the menu again.
 */
import type { KeyValueStore } from './persistence';

export interface EntryIsland {
  identity: string;
  /** The seed of the Blobbi that played there last (`island-visits`), or null. */
  lastSeed: string | null;
}

/** The current Blobbi as the host resolved it (only what the decision needs). `at`: when it was chosen (ms), or null. */
export type EntryCurrent =
  | { status: 'current'; d: string; name: string; seed: string | null; walkable: boolean; at?: number | null }
  | { status: 'missing' | 'no-selection' | 'unavailable' };

/** M11D.8.3: the device's stored choice of the walking Blobbi: when (ms) and by whom, or null when it does not say. */
export interface EntryLocalChoice {
  at: number | null;
  by: 'player' | 'remote' | null;
  /** M11D.8.4: for an unstamped choice, a moment it already existed by (an upper bound on its time), or null. */
  existedBy?: number | null;
}

/**
 * M11D.8.3: two choices within this many milliseconds of each other cannot be ordered (clocks of different devices
 * are never exactly the same), and a choice this far in the future of this device's clock is not trusted either.
 */
export const SELECTION_SKEW_MS = 60_000;

/** The time a current Blobbi was chosen, in ms, from the profile event's `created_at` (seconds); null when unusable. */
export function currentSelectionAt(profileAtSeconds: number | null | undefined): number | null {
  return typeof profileAtSeconds === 'number' && Number.isFinite(profileAtSeconds) && profileAtSeconds > 0 ? Math.floor(profileAtSeconds) * 1000 : null;
}

/**
 * Which choice is the most recent, when that can be said reliably: `local` or `remote`; else `ambiguous` (a missing
 * time, a time beyond `now + skew`, or the two within `skew` of each other). Times in ms; this device's clock is the
 * only one there is, so the rule is deliberately plain: a clear gap, both in the past.
 */
export function compareSelections(localAt: number | null, remoteAt: number | null, now: number, skewMs = SELECTION_SKEW_MS): 'local' | 'remote' | 'ambiguous' {
  return selectionOrder({ at: localAt, by: null }, remoteAt, now, skewMs).order;
}

/** M11D.8.4: why two choices could not be ordered (for the diagnostic record; never shown to the player). */
export type AmbiguityReason = 'no-local-time' | 'no-remote-time' | 'future' | 'too-close' | 'no-clock';

/**
 * M11D.8.4: the order of the device's choice and the current one, with the reason when there is none. A stamped
 * choice is compared by its time. An unstamped one with an `existedBy` bound can only be found OLDER (the remote
 * choice clearly after the bound); anything else about it stays ambiguous (never assumed old, never assumed new).
 */
export function selectionOrder(local: EntryLocalChoice | null, remoteAt: number | null, now: number, skewMs = SELECTION_SKEW_MS): { order: 'local' | 'remote' | 'ambiguous'; reason?: AmbiguityReason; basis: 'stamp' | 'bound' | 'none' } {
  const at = local?.at ?? null;
  const bound = at === null ? (local?.existedBy ?? null) : null;
  const basis = at !== null ? 'stamp' : bound !== null ? 'bound' : 'none';
  if (!Number.isFinite(now)) return { order: 'ambiguous', reason: 'no-clock', basis };
  if (remoteAt === null || !Number.isFinite(remoteAt)) return { order: 'ambiguous', reason: 'no-remote-time', basis };
  if (remoteAt > now + skewMs) return { order: 'ambiguous', reason: 'future', basis };
  if (at !== null && Number.isFinite(at)) {
    if (at > now + skewMs) return { order: 'ambiguous', reason: 'future', basis };
    const gap = remoteAt - at;
    if (Math.abs(gap) <= skewMs) return { order: 'ambiguous', reason: 'too-close', basis };
    return { order: gap > 0 ? 'remote' : 'local', basis };
  }
  if (bound !== null && Number.isFinite(bound) && bound <= now + skewMs) return remoteAt - bound > skewMs ? { order: 'remote', basis } : { order: 'ambiguous', reason: 'no-local-time', basis };
  return { order: 'ambiguous', reason: 'no-local-time', basis };
}


export interface EntryFacts {
  /** A plain start of play: no `#menu`, not a lab mode, the title untouched so far. */
  allowed: boolean;
  /** The island a link names (`#seed=...`, the game's own address after a reload, or a shared link), or null. */
  linked?: string | null;
  /** The connected account and whether its identity is really here (vault key, or the extension answering with its key). */
  account: { pubkey: string; present: boolean } | null;
  /** Saved islands (any order). */
  islands: readonly EntryIsland[];
  /** The seeds of this identity's Blobbis known on this device. */
  mine: ReadonlySet<string>;
  /** The seed of the Blobbi that walks now (the device's choice). */
  walkingSeed: string;
  current: EntryCurrent;
  /** The player already chose to stay with the walking Blobbi on this island while this Blobbi was current. */
  stayed?: (island: string, d: string) => boolean;
  /** M11D.8.3: the device's stored choice of the walking Blobbi (when, by whom), or null when nothing is stored. */
  local?: EntryLocalChoice | null;
  /** M11D.8.3: this device's clock now (ms); without it no choice can be ordered. */
  now?: number;
}

export type EntryDecision =
  | { kind: 'title'; why: 'not-allowed' | 'guest' | 'not-present' | 'linked-not-here' | 'not-mine' | 'nothing-to-bring' | 'walking-not-mine' }
  | { kind: 'enter'; island: string }
  | { kind: 'choose-island'; islands: string[] }
  | { kind: 'offer-switch'; island: string; d: string; name: string }
  /** M11D.8.3: the current Blobbi was chosen more recently than the device's one: it comes along, no question. */
  | { kind: 'bring'; island: string; d: string; name: string }
  | { kind: 'welcome'; d: string; name: string };

export function decideEntry(f: EntryFacts): EntryDecision {
  if (!f.allowed) return { kind: 'title', why: 'not-allowed' };
  if (!f.account) return { kind: 'title', why: 'guest' };
  if (!f.account.present) return { kind: 'title', why: 'not-present' };
  const current = f.current.status === 'current' && f.current.walkable ? f.current : null;
  let islands = f.islands;
  if (f.linked != null) {
    islands = f.islands.filter((i) => i.identity === f.linked);
    if (!islands.length) return { kind: 'title', why: 'linked-not-here' };
  }
  if (!islands.length) return current ? { kind: 'welcome', d: current.d, name: current.name } : { kind: 'title', why: 'nothing-to-bring' };
  const mine = islands.filter((i) => i.lastSeed !== null && f.mine.has(i.lastSeed));
  if (!mine.length) return { kind: 'title', why: 'not-mine' };
  if (mine.length > 1) return { kind: 'choose-island', islands: mine.map((i) => i.identity) };
  const island = mine[0].identity;
  // The Blobbi that would come must be this identity's own (never another identity's, never the default visitor).
  if (!f.mine.has(f.walkingSeed)) return { kind: 'title', why: 'walking-not-mine' };
  if (current && current.seed && current.seed !== f.walkingSeed) {
    // M11D.8.3: the most recent explicit choice, when it can be told; else the player's remembered answer, else ask.
    const order = f.now === undefined ? 'ambiguous' : selectionOrder(f.local ?? null, current.at ?? null, f.now).order;
    if (order === 'remote') return { kind: 'bring', island, d: current.d, name: current.name };
    if (order === 'local') return { kind: 'enter', island };
    if (!f.stayed?.(island, current.d)) return { kind: 'offer-switch', island, d: current.d, name: current.name };
  }
  return { kind: 'enter', island };
}

/**
 * M11D.8.2, A BLOBBI CHOSEN ON THE TITLE (MY BLOBBIS, after CONNECT or on the welcome back page): where to go on with
 * it, from this device alone (no network: the player just chose, so it is the current one here). Its island when
 * exactly one is theirs; the islands page when several; otherwise a new adventure WITH it (`welcome`): islands that
 * other identities or guests played last are not this player's, so a new adventure begins (they stay listed).
 */
export function decideChosen(f: { account: { pubkey: string; present: boolean }; islands: readonly EntryIsland[]; mine: ReadonlySet<string>; chosen: { d: string; name: string; seed: string } }): EntryDecision {
  const mine = new Set(f.mine);
  mine.add(f.chosen.seed);
  const d = decideEntry({ allowed: true, linked: null, account: f.account, islands: f.islands, mine, walkingSeed: f.chosen.seed, current: { status: 'current', d: f.chosen.d, name: f.chosen.name, seed: f.chosen.seed, walkable: true } });
  return d.kind === 'title' && (d.why === 'not-mine' || d.why === 'nothing-to-bring') ? { kind: 'welcome', d: f.chosen.d, name: f.chosen.name } : d;
}

// ─── "Stay with this Blobbi": remembered per island, for one current Blobbi ─────────────────────────────────────

/** Record `blobbi-pixel-lab:entry-choice`: `{ version: 1, islands: { <island>: { pubkey, d, at } } }` (public data). */
export const ENTRY_CHOICE_KEY = 'blobbi-pixel-lab:entry-choice';

function readChoices(store: KeyValueStore): Record<string, { pubkey: string; d: string; at: number }> {
  try {
    const v = JSON.parse(store.get(ENTRY_CHOICE_KEY) ?? 'null') as { version?: unknown; islands?: unknown } | null;
    return v?.version === 1 && v.islands && typeof v.islands === 'object' ? (v.islands as Record<string, { pubkey: string; d: string; at: number }>) : {};
  } catch {
    return {};
  }
}

/** The player chose to stay with the walking Blobbi on `island` while `d` (of `pubkey`) was their current Blobbi. */
export function rememberStay(store: KeyValueStore, island: string, pubkey: string, d: string, at: number): void {
  const all = readChoices(store);
  all[island] = { pubkey, d, at };
  try {
    store.set(ENTRY_CHOICE_KEY, JSON.stringify({ version: 1, islands: all }));
  } catch {
    /* not kept: the question is simply asked again next time */
  }
}

/** Whether that choice stands (the same identity, the same current Blobbi). */
export function stayedWith(store: KeyValueStore, island: string, pubkey: string, d: string): boolean {
  const c = readChoices(store)[island];
  return !!c && c.pubkey === pubkey && c.d === d;
}

// ─── The start of play: what the address allows, and the entry run in its order ─────────────────────────────────

/** What the address of a page load says about an automatic entry (`#menu` and the lab's `#intro` keep the title). */
export function entryAddress(params: { has(key: string): boolean }): { allowed: boolean; linked: boolean } {
  return { allowed: !params.has('menu') && !params.has('intro'), linked: params.has('seed') };
}

/** What a run needs from the page (the host): every answer is read when the run reaches it, never before. */
export interface EntryHost<R> {
  /** The connected account now (or null). */
  account(): { pubkey: string } | null;
  /** Whether that identity is really here (the vault keeps its key, or the extension is present). */
  present(pubkey: string): Promise<boolean>;
  /** The current Blobbi across the Blobbi apps (read only, bounded in time; any failure is an answer too). */
  current(pubkey: string): Promise<R>;
  /** The title is still showing and the player has not led (no key, no touch, no intro, no menu). */
  waiting(): boolean;
  /** The decision's facts, from this device and the answer, or null when nothing can be decided. */
  facts(pubkey: string, present: boolean, answer: R): EntryFacts | null;
}

/**
 * One automatic entry, in order: the account, its presence, the current Blobbi; after each wait the player may have
 * led, or the account changed or gone: the run then stops (null) and the title stays the player's. The decision (and
 * the answer it was made with) is returned for the host to carry out; nothing here acts.
 */
export async function runEntry<R>(host: EntryHost<R>): Promise<{ decision: EntryDecision; answer: R | null; pubkey: string } | null> {
  const first = host.account();
  if (!first || !host.waiting()) return null;
  const pubkey = first.pubkey;
  const still = () => host.waiting() && host.account()?.pubkey === pubkey;
  const present = await host.present(pubkey).catch(() => false);
  if (!still()) return null;
  if (!present) return { decision: { kind: 'title', why: 'not-present' }, answer: null, pubkey };
  const answer = await host.current(pubkey);
  if (!still()) return null;
  const facts = host.facts(pubkey, present, answer);
  return facts ? { decision: decideEntry(facts), answer, pubkey } : null;
}

// ─── M11D.8.4: the diagnostic record of the last automatic entry ─────────────────────────────────────────────────

/** Record `blobbi-pixel-lab:entry-diagnostic`: the last automatic entry's outcome and reasons. Public, no identifiers. */
export const ENTRY_DIAGNOSTIC_KEY = 'blobbi-pixel-lab:entry-diagnostic';

export interface EntryDiagnostic {
  version: 1;
  /** When the entry was decided (ms). */
  at: number;
  /** How long the entry waited (ms). */
  waitedMs: number;
  decision: EntryDecision['kind'];
  why: string | null;
  /** What the relays said about the current Blobbi; `partial` when not every relay answered. */
  current: string;
  partial: boolean;
  /** Whether the current Blobbi differs from the walking one, and how the two choices were ordered. */
  differs: boolean;
  order: 'local' | 'remote' | 'ambiguous' | null;
  reason: AmbiguityReason | null;
  /** How the device's choice is known: by its stamp (and who made it), by an existed-by bound, or not at all. */
  local: 'stamp-player' | 'stamp-remote' | 'bound' | 'none' | 'no-record';
  /** Seconds between the two choice times (remote minus local stamp or bound), rounded; null when unknown. */
  gapSeconds: number | null;
  stayRemembered: boolean;
}

/** Build the diagnostic from the decision and the facts it was made with (pure; nothing private goes in). */
export function entryDiagnostic(decision: EntryDecision, f: EntryFacts | null, answer: { status: string; partial: boolean }, waitedMs: number, at: number): EntryDiagnostic {
  const current = f && f.current.status === 'current' && f.current.walkable && f.current.seed ? f.current : null;
  const differs = !!current && current.seed !== f!.walkingSeed;
  const o = differs && f!.now !== undefined ? selectionOrder(f!.local ?? null, current!.at ?? null, f!.now) : null;
  const l = f?.local ?? null;
  const local: EntryDiagnostic['local'] = !l ? 'no-record' : l.at !== null ? (l.by === 'remote' ? 'stamp-remote' : 'stamp-player') : l.existedBy != null ? 'bound' : 'none';
  const base = l?.at ?? l?.existedBy ?? null;
  const gap = current?.at != null && base !== null ? Math.round((current.at - base) / 1000) : null;
  const island = decision.kind === 'enter' || decision.kind === 'offer-switch' || decision.kind === 'bring' ? decision.island : null;
  return {
    version: 1,
    at,
    waitedMs: Math.max(0, Math.round(waitedMs)),
    decision: decision.kind,
    why: decision.kind === 'title' ? decision.why : null,
    current: answer.status,
    partial: answer.partial,
    differs,
    order: o?.order ?? null,
    reason: o?.reason ?? null,
    local,
    gapSeconds: gap,
    stayRemembered: !!(differs && island && f!.stayed?.(island, current!.d)),
  };
}
