/**
 * READING A BLOBBI'S CANONICAL CARE (kind 31124), read only: the newest state event for one Blobbi by its owner,
 * checked (well formed, by the owner, its signature verified, modern per the kit, the d it was asked for), its five
 * stats as the event states them, and the kit's own decay projection (`applyBlobbiDecay`) for showing them as they
 * stand now, exactly as Blobbi Home projects them for display. Nothing here signs, publishes or changes anything:
 * the reader can only ask relays for events and close (`queryRelays`).
 */
import { applyBlobbiDecay, classifyBlobbiEvent, parseBlobbiEvent } from '@blobbi-kit/core';
import { verifyEvent, type NostrEvent } from 'nostr-tools/pure';
import { isWellFormedEvent } from './profile';
import { queryRelays, BLOBBI_MARKER, type ProfileReadResult, type QueryOptions } from './relays';
import type { SharedCare, SharedCareRead, SharedStats } from '../game/shared-care';

export interface CanonicalCareReader {
  /** The owner's kind 31124 events for one d, as the relays return them (checked later, never trusted). */
  readCare(pubkey: string, d: string, relays: readonly string[], signal: AbortSignal): Promise<ProfileReadResult>;
}

/** Every relay is asked for the one Blobbi's state (kind 31124 by its owner, that d, the ecosystem marker). */
export function relayCanonicalCareReader(o: QueryOptions = {}): CanonicalCareReader {
  return { readCare: (pubkey, d, relays, signal) => queryRelays(relays, { kinds: [31124], authors: [pubkey], '#d': [d], '#b': [BLOBBI_MARKER], limit: 5 }, signal, o) };
}

export interface CanonicalCareDeps {
  reader: CanonicalCareReader;
  relays: readonly string[];
  /** How long the relays get to answer (ms). */
  timeoutMs?: number;
  /** The signature check (tests may pass their own; the default is nostr-tools' `verifyEvent`). */
  verify?: (e: NostrEvent) => boolean;
}

const HEX64 = /^[0-9a-f]{64}$/;
const STATS: readonly (keyof SharedStats)[] = ['hunger', 'happiness', 'health', 'hygiene', 'energy'];

/** The newest valid state among what the relays sent, as shared care; null when none is this Blobbi's. */
export function pickCanonicalCare(events: readonly unknown[], owner: string, d: string, verify: (e: NostrEvent) => boolean = verifyEvent): SharedCare | null {
  const mine = events.filter((e): e is NostrEvent => {
    if (!isWellFormedEvent(e) || e.pubkey !== owner || e.kind !== 31124) return false;
    try {
      return verify(e as NostrEvent);
    } catch {
      return false;
    }
  });
  // The newest wins, the lower id on a tie (NIP-01 replaceable events).
  mine.sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1));
  for (const e of mine) {
    if (!e.tags.some((t) => t[0] === 'd' && t[1] === d)) continue;
    let parsed: ReturnType<typeof parseBlobbiEvent>;
    try {
      if (classifyBlobbiEvent(e) !== 'modern') continue;
      parsed = parseBlobbiEvent(e);
    } catch {
      continue;
    }
    if (!parsed || parsed.isLegacy || parsed.d !== d) continue;
    const stats: Partial<SharedStats> = {};
    for (const k of STATS) {
      const v = parsed.stats[k];
      if (typeof v === 'number' && Number.isFinite(v)) stats[k] = v;
    }
    const stage = parsed.stage;
    const state = parsed.state;
    const lastDecayAt = typeof parsed.lastDecayAt === 'number' && Number.isFinite(parsed.lastDecayAt) ? parsed.lastDecayAt : null;
    return {
      pubkey: owner,
      d,
      name: parsed.name,
      stage,
      state,
      stats,
      lastDecayAt,
      lastInteraction: parsed.lastInteraction,
      createdAt: e.created_at,
      eventId: e.id,
      // The kit's decay, as Home shows it: from the checkpoint to `nowSec`; without a checkpoint, no decay.
      project: (nowSec) => applyBlobbiDecay({ stage, state, stats, lastDecayAt: lastDecayAt ?? undefined, now: Math.max(nowSec, lastDecayAt ?? 0) }).stats,
    };
  }
  return null;
}

/** The Blobbi's shared care from the relays: ready, missing (none holds it), or unavailable (none answered). */
export async function readCanonicalCare(owner: string, d: string, deps: CanonicalCareDeps): Promise<SharedCareRead> {
  if (!HEX64.test(owner) || !deps.relays.length) return { status: 'unavailable' };
  const abort = new AbortController();
  const timeoutMs = deps.timeoutMs ?? 6000;
  // At the deadline the read is aborted and gives back what the answering relays sent; a reader that ignores the
  // abort gets a short backstop (as the current-Blobbi read does).
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  let backstop: ReturnType<typeof setTimeout> | undefined;
  const never = new Promise<null>((resolve) => (backstop = setTimeout(() => resolve(null), timeoutMs + 1000)));
  let res: ProfileReadResult | null;
  try {
    res = await Promise.race([deps.reader.readCare(owner, d, deps.relays, abort.signal).catch(() => null), never]);
  } finally {
    clearTimeout(timer);
    clearTimeout(backstop);
    abort.abort();
  }
  if (!res || res.reachable === 0) return { status: 'unavailable' };
  const partial = res.reachable < deps.relays.length;
  const care = pickCanonicalCare(res.events, owner, d, deps.verify);
  return care ? { status: 'ready', care, partial } : { status: 'missing', partial };
}
