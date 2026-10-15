/**
 * COMPANION SYNC: SHARING THE PLAYER'S CHOICE OF BLOBBI with the other Blobbi apps (Blobbi Standalone, Ditto), as
 * the profile's `current_companion` (kind 11125; no new kind, no new tag). Only for a choice the player made in this
 * game (MY BLOBBIS, BRING, CONTINUE WITH), for a Blobbi of their own account, signed by that account.
 *
 * The profile is REPLACEABLE: what is published replaces the player's profile everywhere (`has`, xp, the content,
 * tags other apps wrote). So, as Blobbi Standalone's `profile-write.ts` (the same steps, the same checks):
 *
 *   read       the profile from every relay; COMPLETE only when each of `PROFILE_REQUIRED_RELAYS` answered.
 *              Incomplete: nothing is built (`unsafe`).
 *   base       the newest valid profile by the owner (11125 before 31125; NIP-01 order). None: `no-profile` (a profile
 *              is never made here for a choice).
 *   order      a choice made clearly later elsewhere is never overwritten (`companion-order.ts`): `superseded`;
 *              too close to tell: `ambiguous` (the player is asked; nothing written).
 *   build      `companionProfileTemplate` (only `current_companion` changes; the Blobbi listed in `has` if missing),
 *              checked by `preservesProfile` before signing.
 *   sign       the account's own signer; another key is refused. The signed event is STORED before it is sent
 *              (`blobbi-pixel-lab:companion-share`): every retry sends that very event (same id: no duplicate).
 *   re-check   a second complete read just before sending: a profile written meanwhile is built over, once.
 *   send       then READ BACK: shared only when `policyMet` (two relays, relay.ditto.pub among them), as activation.
 *              Fewer: `partial` (Try again resends the same event to the relays still missing it).
 *
 * A stored write found superseded by a newer profile is dropped, never sent. REHEARSAL builds share nothing (the
 * choice stays on this device: nothing leaves it in rehearsal).
 */
import type { NostrEvent } from 'nostr-tools/pure';
import { verifyEvent } from 'nostr-tools/pure';
import { parseBlobbonautEvent } from '@blobbi-kit/core';
import type { KeyValueStore } from '../game/persistence';
import { orderChoices, replaces, type ProfileStamp, type SeenProfile } from '../game/companion-order';
import { companionProfileTemplate, isProfile, preservesProfile, profileFilter, type EventTemplate } from './canonical-events';
import { accepted, type Publisher, type QueryResult } from './publisher';
import { policyMet, PROFILE_REQUIRED_RELAYS } from './relay-config';

export const COMPANION_SHARE_KEY = 'blobbi-pixel-lab:companion-share';

export interface PendingShare {
  owner: string;
  d: string;
  /** The signed profile (public). */
  event: NostrEvent;
  /** The profile it was built over. */
  base: ProfileStamp;
  /** Relays that returned it on a read-back. */
  seenOn: string[];
}

export type ShareOutcome =
  | { kind: 'shared'; event: NostrEvent }
  | { kind: 'unchanged'; profile: ProfileStamp }
  | { kind: 'superseded'; profile: ProfileStamp & { d: string | null } }
  | { kind: 'ambiguous'; profile: ProfileStamp & { d: string | null } }
  | { kind: 'no-profile' }
  | { kind: 'unsafe' }
  | { kind: 'rehearsal' }
  | { kind: 'sign-failed' }
  | { kind: 'wrong-account' }
  | { kind: 'partial'; event: NostrEvent }
  | { kind: 'failed' };

export interface ShareRequest {
  owner: string;
  d: string;
  /** When the player chose (ms, this device's clock), and the profile they had been shown then. */
  at: number;
  over: SeenProfile | null;
}

export interface ShareDeps {
  store: KeyValueStore;
  publisher: Publisher;
  sign: (template: EventTemplate) => Promise<NostrEvent>;
  /** The account is still the one this share is for, and still really here (never a read-only session). */
  stillAccount: () => boolean;
  now: () => number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  verify?: (e: NostrEvent) => boolean;
}

// ─── The stored write (public data: a signed event, relay urls) ───

function readAll(store: KeyValueStore): Record<string, PendingShare> {
  try {
    const v = JSON.parse(store.get(COMPANION_SHARE_KEY) ?? 'null') as { version?: unknown; runs?: unknown } | null;
    return v?.version === 1 && v.runs && typeof v.runs === 'object' ? (v.runs as Record<string, PendingShare>) : {};
  } catch {
    return {};
  }
}
function writeAll(store: KeyValueStore, runs: Record<string, PendingShare>): void {
  try {
    store.set(COMPANION_SHARE_KEY, JSON.stringify({ version: 1, runs }));
  } catch {
    /* not kept: a retry signs again (after the same checks) */
  }
}
/** The write stored for this owner's choice of `d` (another choice's write is not this one's). */
export function pendingShare(store: KeyValueStore, owner: string, d: string): PendingShare | null {
  const p = readAll(store)[owner];
  return p && p.d === d && p.owner === owner && p.event?.pubkey === owner ? p : null;
}
function keepPending(store: KeyValueStore, p: PendingShare | null, owner: string): void {
  const runs = readAll(store);
  if (p) runs[owner] = p;
  else delete runs[owner];
  writeAll(store, runs);
}

// ─── Reading ───

const stamp = (e: NostrEvent): ProfileStamp => ({ id: e.id, createdAt: e.created_at });
const companionOf = (e: NostrEvent | null): string | null => (e ? (parseBlobbonautEvent(e as never)?.currentCompanion ?? null) : null);

/** The owner's newest valid profile: an 11125 before any 31125; NIP-01 order within a kind; signatures checked. */
export function newestProfileOf(events: readonly NostrEvent[], owner: string, verify: (e: NostrEvent) => boolean = verifyEvent): NostrEvent | null {
  const ok = events.filter((e) => e.pubkey === owner && (e.kind === 11125 || e.kind === 31125) && isProfile(e) && safe(verify, e));
  const pick = (kind: number) => ok.filter((e) => e.kind === kind).sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1))[0] ?? null;
  return pick(11125) ?? pick(31125);
}
function safe(verify: (e: NostrEvent) => boolean, e: NostrEvent): boolean {
  try {
    return verify(e);
  } catch {
    return false;
  }
}

interface Census {
  complete: boolean;
  answer: QueryResult;
  newest: NostrEvent | null;
}
async function census(publisher: Publisher, owner: string, timeoutMs: number, verify: (e: NostrEvent) => boolean): Promise<Census> {
  const answer = await publisher.query(profileFilter(owner), timeoutMs);
  const required = PROFILE_REQUIRED_RELAYS.filter((u) => publisher.relays.includes(u));
  const must = required.length ? required : publisher.relays;
  return { complete: must.every((u) => answer.byRelay[u] != null), answer, newest: newestProfileOf(answer.events, owner, verify) };
}

/** Relays whose newest profile is `ours`, or a newer one naming the same Blobbi. */
function holders(q: QueryResult, ours: NostrEvent, owner: string, d: string, verify: (e: NostrEvent) => boolean): string[] {
  return Object.entries(q.byRelay)
    .filter(([, evs]) => {
      const top = evs ? newestProfileOf(evs, owner, verify) : null;
      return !!top && (top.id === ours.id || (replaces(stamp(top), stamp(ours)) && companionOf(top) === d));
    })
    .map(([url]) => url);
}

// ─── The share ───

export async function shareCompanion(req: ShareRequest, deps: ShareDeps): Promise<ShareOutcome> {
  const { publisher, store } = deps;
  if (publisher.mode !== 'live') return { kind: 'rehearsal' };
  const timeout = deps.timeoutMs ?? 8000;
  const verify = deps.verify ?? verifyEvent;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const { owner, d } = req;

  let first = await census(publisher, owner, timeout, verify);
  if (!first.complete) return { kind: 'unsafe' };

  let pending = pendingShare(store, owner, d);
  if (pending) {
    const top = first.newest;
    if (top && top.id !== pending.event.id) {
      if (replaces(stamp(top), stamp(pending.event))) {
        keepPending(store, null, owner);
        return companionOf(top) === d ? { kind: 'unchanged', profile: stamp(top) } : { kind: 'superseded', profile: { ...stamp(top), d: companionOf(top) } };
      }
      // Older than ours but not what ours was built over: ours would drop what it added. Rebuild.
      if (top.id !== pending.base.id && replaces(stamp(top), pending.base)) pending = null;
    }
  }

  if (!pending) {
    for (let round = 0; round < 2 && !pending; round++) {
      const base = first.newest;
      if (!base) return { kind: 'no-profile' };
      const named = companionOf(base);
      if (named === d) return { kind: 'unchanged', profile: stamp(base) };
      if (named) {
        const order = orderChoices({ d, at: req.at, by: 'player', synced: null, over: req.over }, { d: named, ...stamp(base) }, deps.now());
        if (order.winner === 'global') return { kind: 'superseded', profile: { ...stamp(base), d: named } };
        if (order.winner === 'ambiguous') return { kind: 'ambiguous', profile: { ...stamp(base), d: named } };
      }
      const template = companionProfileTemplate(owner, d, Math.floor(deps.now() / 1000), base);
      if (!preservesProfile(base, template, d)) return { kind: 'failed' };
      if (!deps.stillAccount()) return { kind: 'wrong-account' };
      let signed: NostrEvent;
      try {
        signed = await deps.sign(template);
      } catch {
        return { kind: 'sign-failed' };
      }
      if (signed.pubkey !== owner || !safe(verify, signed) || !deps.stillAccount()) return { kind: 'wrong-account' };
      const candidate: PendingShare = { owner, d, event: signed, base: stamp(base), seenOn: [] };
      const again = await census(publisher, owner, timeout, verify);
      if (!again.complete) {
        keepPending(store, candidate, owner);
        return { kind: 'unsafe' };
      }
      if (again.newest && again.newest.id !== base.id && replaces(stamp(again.newest), stamp(base))) {
        first = again;
        continue;
      }
      pending = candidate;
      keepPending(store, pending, owner);
    }
    if (!pending) return { kind: 'unsafe' };
  }

  // Send the one signed event where it is not held yet; then read it back
  const event = pending.event;
  let held = [...new Set([...pending.seenOn, ...holders(first.answer, event, owner, d, verify)])];
  const acks = await publisher.publish(event, timeout, publisher.relays.filter((r) => !held.includes(r)));
  const ok = accepted(acks);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(1500);
    const back = await census(publisher, owner, timeout, verify);
    held = [...new Set([...held, ...holders(back.answer, event, owner, d, verify)])];
    keepPending(store, { ...pending, seenOn: held }, owner);
    if (policyMet(publisher.relays, held)) {
      keepPending(store, null, owner);
      return { kind: 'shared', event };
    }
    const top = back.newest;
    if (top && top.id !== event.id && replaces(stamp(top), stamp(event)) && companionOf(top) !== d) {
      keepPending(store, null, owner);
      return { kind: 'superseded', profile: { ...stamp(top), d: companionOf(top) } };
    }
  }
  return ok.length || held.length ? { kind: 'partial', event } : { kind: 'failed' };
}

/** Forget the stored write of an owner (the choice changed, or the account went). */
export function forgetShare(store: KeyValueStore, owner: string): void {
  keepPending(store, null, owner);
}
