/**
 * READING PUBLIC PROFILES (AND, M11C, CANONICAL BLOBBIS) FROM RELAYS. Read-only by construction: a reader can only
 * ask relays for events (REQ) and close; it has no way to send an event (EVENT), answer an AUTH challenge or sign.
 *
 * The default reader opens a Nostrify `NRelay1` per relay only for the request (no reconnection, closed straight
 * after), and NRelay1 verifies every event's signature before returning it. The relays are the ones the Blobbi apps
 * already use; no relay list is read from the player's profile in this version.
 */

import { getBlobbonautQueryDValues } from '@blobbi-kit/core';
import { READ_RELAYS } from './relay-config';

/** The relays profiles are read from (M11D.6: the same set Blobbis are published to, `relay-config.ts`). */
export const DEFAULT_RELAYS: readonly string[] = READ_RELAYS;

export interface ProfileReadResult {
  /** Whatever the relays returned (checked later, never trusted). */
  events: unknown[];
  /** How many relays answered before the deadline. */
  reachable: number;
}

export interface ProfileReader {
  readProfile(pubkey: string, relays: readonly string[], signal: AbortSignal): Promise<ProfileReadResult>;
}

/** Ask every relay for the author's newest kind 0; each relay is opened for the request and closed after. */
export function relayProfileReader(): ProfileReader {
  return { readProfile: (pubkey, relays, signal) => queryRelays(relays, { kinds: [0], authors: [pubkey], limit: 1 }, signal) };
}

/** The ecosystem marker every canonical Blobbi carries (`b` tag); collections are queried by it. */
export const BLOBBI_MARKER = 'blobbi:ecosystem:v1';

export interface BlobbiReader {
  /** The owner's kind 31124 Blobbi state events, as the relays return them (checked later, never trusted). */
  readBlobbis(pubkey: string, relays: readonly string[], signal: AbortSignal): Promise<ProfileReadResult>;
}

/** M11C: every relay is asked for the owner's Blobbis (kind 31124 by that author, with the ecosystem marker). */
export function relayBlobbiReader(): BlobbiReader {
  return { readBlobbis: (pubkey, relays, signal) => queryRelays(relays, { kinds: [31124], authors: [pubkey], '#b': [BLOBBI_MARKER], limit: 200 }, signal) };
}

/** M11D.8: reads an owner's Blobbonaut profile (kind 11125, and the legacy 31125), which names the current Blobbi. */
export interface BlobbonautReader {
  readBlobbonaut(pubkey: string, relays: readonly string[], signal: AbortSignal): Promise<ProfileReadResult>;
}

/** M11D.8: the profile as the kit asks for it (`fetchFreshBlobbonautProfile`): both kinds, every d it may carry. */
export function relayBlobbonautReader(): BlobbonautReader {
  return { readBlobbonaut: (pubkey, relays, signal) => queryRelays(relays, { kinds: [11125, 31125], authors: [pubkey], '#d': getBlobbonautQueryDValues(pubkey), limit: 20 }, signal) };
}

/** One REQ per relay, each relay opened for it and closed after (no reconnection); answers merged, never trusted. */
async function queryRelays(relays: readonly string[], filter: { kinds: number[]; authors: string[]; limit: number; '#b'?: string[]; '#d'?: string[] }, signal: AbortSignal): Promise<ProfileReadResult> {
  const { NRelay1 } = await import('@nostrify/nostrify');
  const answers = await Promise.allSettled(
    relays.map(async (url) => {
      const relay = new NRelay1(url, { backoff: false, idleTimeout: false });
      try {
        return await relay.query([filter], { signal });
      } finally {
        void relay.close().catch(() => {});
      }
    }),
  );
  const events: unknown[] = [];
  let reachable = 0;
  for (const a of answers)
    if (a.status === 'fulfilled') {
      reachable++;
      events.push(...a.value);
    }
  return { events, reachable };
}
