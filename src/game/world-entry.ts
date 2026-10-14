/**
 * M11D.8, SEAMLESS WORLD ENTRY: whether a returning player goes straight into their island, and with whom. A pure
 * decision over what this device knows (no network here; the host asks the relays and passes the answer in), so every
 * case is testable. The title stays the place for everything else, and is always one menu away.
 *
 * WHO MAY ENTER DIRECTLY: only a CONNECTED player whose identity is really here: an identity this game keeps (its key
 * in the vault) or a browser extension account with the extension present. A remembered public key alone, a link or
 * a published profile never counts as being signed in. A disconnected account has no record, so it never enters.
 *
 * WHICH ISLAND: islands are never owned by a Blobbi (M11D.3), so the only local link between an island and an identity
 * is who played there last (`island-visits`). Islands whose last visitor is one of this identity's Blobbis are its
 * adventures. Exactly one: enter it. Several: the islands page (the player chooses). None: the title as always (an
 * island another identity or a guest played is never entered for this one). No island at all and a current Blobbi
 * that can walk: the welcome page (a new adventure WITH that Blobbi; nothing hatches in its place).
 *
 * WITH WHOM: the Blobbi chosen on this device (the one that walks now). When the player's CURRENT Blobbi across the
 * Blobbi apps (kind 11125 `current_companion`, read by the host) is another one that can walk, the player is asked
 * once: bring it, or stay. "Stay" is remembered for that island and that current Blobbi, so nothing is asked again
 * until the current Blobbi changes. Offline (no answer): straight in with the Blobbi of this device.
 */
import type { KeyValueStore } from './persistence';

export interface EntryIsland {
  identity: string;
  /** The seed of the Blobbi that played there last (`island-visits`), or null. */
  lastSeed: string | null;
}

/** The current Blobbi as the host resolved it (only what the decision needs). */
export type EntryCurrent =
  | { status: 'current'; d: string; name: string; seed: string | null; walkable: boolean }
  | { status: 'missing' | 'no-selection' | 'unavailable' };

export interface EntryFacts {
  /** A plain start of play: no link naming a world, no `#menu`, not a lab mode, the title untouched so far. */
  allowed: boolean;
  /** The connected account and whether its identity is really here (vault key, or the extension present). */
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
}

export type EntryDecision =
  | { kind: 'title'; why: 'not-allowed' | 'guest' | 'not-present' | 'not-mine' | 'nothing-to-bring' | 'walking-not-mine' }
  | { kind: 'enter'; island: string }
  | { kind: 'choose-island'; islands: string[] }
  | { kind: 'offer-switch'; island: string; d: string; name: string }
  | { kind: 'welcome'; d: string; name: string };

export function decideEntry(f: EntryFacts): EntryDecision {
  if (!f.allowed) return { kind: 'title', why: 'not-allowed' };
  if (!f.account) return { kind: 'title', why: 'guest' };
  if (!f.account.present) return { kind: 'title', why: 'not-present' };
  const current = f.current.status === 'current' && f.current.walkable ? f.current : null;
  if (!f.islands.length) return current ? { kind: 'welcome', d: current.d, name: current.name } : { kind: 'title', why: 'nothing-to-bring' };
  const mine = f.islands.filter((i) => i.lastSeed !== null && f.mine.has(i.lastSeed));
  if (!mine.length) return { kind: 'title', why: 'not-mine' };
  if (mine.length > 1) return { kind: 'choose-island', islands: mine.map((i) => i.identity) };
  const island = mine[0].identity;
  // The Blobbi that would come must be this identity's own (never another identity's, never the default visitor).
  if (!f.mine.has(f.walkingSeed)) return { kind: 'title', why: 'walking-not-mine' };
  if (current && current.seed && current.seed !== f.walkingSeed && !f.stayed?.(island, current.d)) return { kind: 'offer-switch', island, d: current.d, name: current.name };
  return { kind: 'enter', island };
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
