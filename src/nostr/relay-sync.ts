/**
 * CARRYING THE PLAYER'S OWN BLOBBI EVENTS BETWEEN THE RELAYS: an event one relay holds and another certainly lacks is
 * offered to that other relay, the ORIGINAL signed event (same id, same signature: nothing is signed here, there is
 * no signer). So what the secondary relays hold reaches the Blobbi relay (the primary, young and at first empty), and
 * what only the primary holds reaches the secondaries: a relay that is down then never hides a player's Blobbis.
 *
 * It is the same delivery as `spreadRegistration` (the same publisher, the same round, `IdentityService.spreadAll`),
 * for events this device did not sign itself: a Blobbi adopted in another Blobbi app, a profile another app wrote.
 * The decisions are the shared ones (`relay-routing.ts`: `planSync`, `SyncLedger`, `classifyRejection`); this file only
 * says what Pixel allows.
 *
 * THE LIMITS (each one a line below):
 * - WHOSE: only events by the account this game is connected as, their signature checked here again.
 * - WHAT: its canonical Blobbis (kind 31124, modern by the kit's reading) and its Blobbonaut profile (kind 11125).
 *   Never the legacy 31125 profile, never anything private, ephemeral, expiring, relay-bound or deleted (`planSync`;
 *   the owner's NIP-09 deletions are asked for before anything is sent).
 * - WHICH REVISION: only the winning one (NIP-01: the newest, then the lower id). An older revision is never carried.
 * - WHERE: only this game's own relays, and the primary only for the kinds it takes.
 * - WHEN ABSENCE IS CERTAIN: only to a relay that ANSWERED and returned fewer events than the filter's limit. A relay
 *   that was silent, was cut off, or whose answer may be truncated is left alone: there the presence is unknown.
 * - NO LOOPS: every (event, relay) offer is remembered (`blobbi-pixel-lab:relay-sync`, public data only). Accepted:
 *   never again. Refused for good (`blocked`, the primary's write list): not again for hours. No verdict: again after
 *   a growing wait, three times in all. At most `SYNC_MAX_EVENTS` events a round.
 * - ONLY ONCE THE ACCOUNT SAID SO (`sync-consent.ts`): off by default. Without the account's choice nothing is read
 *   for this and nothing is sent; with it, only the relays it was shown receive anything (`withSyncConsent`).
 * - LIVE ONLY: a rehearsal build carries nothing (nothing leaves the device in rehearsal).
 */
import type { NostrEvent } from 'nostr-tools/pure';
import { verifyEvent } from 'nostr-tools/pure';
import type { KeyValueStore } from '../game/persistence';
import { isCanonicalBlobbi, isProfile, profileFilter } from './canonical-events';
import type { Publisher, PublishFilter, QueryResult } from './publisher';
import { PRIMARY_RELAY } from './relay-config';
import { blobbiRelayAcceptsKind, classifyRejection, matchesFilter, planSync, SyncLedger, withSyncConsent, type SyncConsent, type RelayFilter, type RelayReadState, type SyncLedgerEntry, type SyncPolicy, type SyncTask } from './relay-routing';
import { BLOBBI_MARKER } from './relays';

export const RELAY_SYNC_KEY = 'blobbi-pixel-lab:relay-sync';

/** How many events one round offers at most (a relay new to a player with many Blobbis is filled over a few rounds). */
export const SYNC_MAX_EVENTS = 20;

/** The owner's deletions asked for before anything is carried; an answer this long may be cut, so nothing is decided. */
const DELETIONS_LIMIT = 200;

const HEX64 = /^[0-9a-f]{64}$/;

export interface RelaySyncDeps {
  store: KeyValueStore;
  publisher: Publisher;
  /** The accounts' choices: an account that did not turn this on is never read for it, and nothing of its is sent. */
  consent: SyncConsent;
  now: () => number;
  /** Per request (ms). */
  timeoutMs?: number;
  verify?: (e: NostrEvent) => boolean;
}

export interface RelaySyncRound {
  /** Offers a relay accepted in this round (it holds the event now, or already did). */
  carried: number;
  /** Offers still to be made later (no verdict yet, held back by the round's limit, or undecided this round). */
  pending: number;
}

/** The reads whose answers are compared: the owner's Blobbis, and the owner's profile, as the game itself asks. */
export const syncFilters = (owner: string): PublishFilter[] => [{ kinds: [31124], authors: [owner], '#b': [BLOBBI_MARKER], limit: 200 }, profileFilter(owner)];

function readLedger(store: KeyValueStore): Record<string, SyncLedgerEntry> {
  try {
    const v = JSON.parse(store.get(RELAY_SYNC_KEY) ?? 'null') as { version?: unknown; entries?: unknown } | null;
    return v?.version === 1 && v.entries && typeof v.entries === 'object' ? (v.entries as Record<string, SyncLedgerEntry>) : {};
  } catch {
    return {};
  }
}

/** The remembered offers (accepted, refused, to be tried again), kept across reloads. */
export function syncLedger(store: KeyValueStore, now: () => number): SyncLedger {
  return new SyncLedger({
    now,
    initial: readLedger(store),
    onChange: (entries) => {
      try {
        store.set(RELAY_SYNC_KEY, JSON.stringify({ version: 1, entries }));
      } catch {
        /* not kept: an offer may be repeated once after a reload (the relay answers `duplicate`) */
      }
    },
  });
}

/** What Pixel allows to be carried, and where. */
function policyFor(owner: string, relays: readonly string[]): SyncPolicy<NostrEvent> {
  return {
    allows: (e) => e.pubkey === owner && (e.kind === 31124 ? isCanonicalBlobbi(e) : e.kind === 11125 && isProfile(e)),
    destinations: (e) => relays.filter((r) => r !== PRIMARY_RELAY || blobbiRelayAcceptsKind(e.kind)),
  };
}

/**
 * One relay's answer as the shared planner reads it. Silent: `failed` (nothing is known of it). An answer as long as
 * the filter's limit may have been cut: `failed` too. Otherwise what it returned, by the owner and truly signed.
 */
function statesOf(relays: readonly string[], q: QueryResult, filter: PublishFilter, keep: (e: NostrEvent) => boolean): RelayReadState<NostrEvent>[] {
  return relays.map((relay) => {
    const got = q.byRelay[relay];
    if (got == null || (filter.limit !== undefined && got.length >= filter.limit)) return { relay, status: 'failed', events: [] };
    return { relay, status: 'eose', events: got.filter(keep) };
  });
}

/**
 * One round for one owner: read what each relay holds, plan what each certainly lacks, and offer it. Never throws for
 * a relay. Returns what was carried and what is left for a later round.
 */
export async function syncOwnEvents(owner: string, deps: RelaySyncDeps): Promise<RelaySyncRound> {
  const { publisher, store } = deps;
  const nothing: RelaySyncRound = { carried: 0, pending: 0 };
  if (publisher.mode !== 'live' || publisher.relays.length < 2 || !HEX64.test(owner) || !deps.consent.isEnabled(owner)) return nothing;
  const timeout = deps.timeoutMs ?? 8000;
  const verify = deps.verify ?? verifyEvent;
  const authentic = (e: NostrEvent): boolean => {
    try {
      return !!e && typeof e === 'object' && e.pubkey === owner && verify(e);
    } catch {
      return false;
    }
  };
  const ledger = syncLedger(store, deps.now);
  const policy = withSyncConsent(policyFor(owner, publisher.relays), deps.consent, owner);
  const due = (tasks: readonly SyncTask<NostrEvent>[]) => tasks.filter((t) => ledger.canAttempt(t.event.id, t.relay));

  // 1. What each relay holds, per read (each read is judged by its own filter).
  const reads: { filter: RelayFilter; states: RelayReadState<NostrEvent>[] }[] = [];
  for (const asked of syncFilters(owner)) {
    const filter = asked as unknown as RelayFilter;
    const q = await publisher.query(asked, timeout);
    reads.push({ filter, states: statesOf(publisher.relays, q, asked, (e) => authentic(e) && matchesFilter(e, filter)) });
  }
  const plan = (deletions: readonly NostrEvent[]) =>
    reads.flatMap(({ filter, states }) => planSync({ states: states.map((s) => (s.status === 'eose' ? { ...s, events: [...s.events, ...deletions] } : s)), filters: [filter], policy }));
  if (!due(plan([])).length) return { carried: 0, pending: ledger.pending().length };

  // 2. Something may be carried: first the owner's deletions, from every relay whose answer the plan rests on. A
  // deleted event is never brought back; deletions that cannot be read in full leave everything where it is.
  const relied = new Set(reads.flatMap((r) => r.states.filter((s) => s.status === 'eose').map((s) => s.relay)));
  const gone = await publisher.query({ kinds: [5], authors: [owner], limit: DELETIONS_LIMIT }, timeout);
  const undecided = [...relied].some((relay) => {
    const got = gone.byRelay[relay];
    return got == null || got.length >= DELETIONS_LIMIT;
  });
  const tasks = due(plan(gone.events.filter((e) => authentic(e) && e.kind === 5)));
  if (undecided) return { carried: 0, pending: tasks.length };

  // 3. Offer each event once, to the relays that lack it; every verdict is remembered.
  const byEvent = new Map<string, { event: NostrEvent; relays: string[] }>();
  for (const t of tasks) {
    const entry = byEvent.get(t.event.id) ?? { event: t.event, relays: [] };
    if (!entry.relays.includes(t.relay)) entry.relays.push(t.relay);
    byEvent.set(t.event.id, entry);
  }
  let carried = 0;
  let later = 0;
  let offered = 0;
  for (const { event, relays } of byEvent.values()) {
    if (offered >= SYNC_MAX_EVENTS) {
      later += relays.length;
      continue;
    }
    offered++;
    const acks = await publisher.publish(event, timeout, relays);
    for (const relay of relays) {
      const ack = acks.find((a) => a.relay === relay);
      const verdict = ack?.ok ? 'accepted' : classifyRejection(ack?.reason ?? 'timeout');
      ledger.record(event.id, relay, verdict, ack?.reason);
      if (verdict === 'accepted' || verdict === 'superseded') carried++;
      else if (verdict === 'retry') later++;
    }
  }
  return { carried, pending: later };
}
