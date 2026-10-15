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
export function relayBlobbiReader(o: QueryOptions = {}): BlobbiReader {
  return { readBlobbis: (pubkey, relays, signal) => queryRelays(relays, { kinds: [31124], authors: [pubkey], '#b': [BLOBBI_MARKER], limit: 200 }, signal, o) };
}

/** M11D.8: reads an owner's Blobbonaut profile (kind 11125, and the legacy 31125), which names the current Blobbi. */
export interface BlobbonautReader {
  readBlobbonaut(pubkey: string, relays: readonly string[], signal: AbortSignal): Promise<ProfileReadResult>;
}

/** M11D.8: the profile as the kit asks for it (`fetchFreshBlobbonautProfile`): both kinds, every d it may carry. */
export function relayBlobbonautReader(o: QueryOptions = {}): BlobbonautReader {
  return { readBlobbonaut: (pubkey, relays, signal) => queryRelays(relays, { kinds: [11125, 31125], authors: [pubkey], '#d': getBlobbonautQueryDValues(pubkey), limit: 20 }, signal, o) };
}

/** One relay connection for one request (Nostrify's `NRelay1` by default; tests pass their own). */
export interface RelayConnection {
  query(filters: Record<string, unknown>[], opts: { signal: AbortSignal }): Promise<unknown[]>;
  close(): Promise<unknown> | void;
}
export type RelayOpener = (url: string) => RelayConnection;

export interface QueryOptions {
  /**
   * M11D.8.4: once one relay has answered, how long the others still get (ms). Without it every relay is waited for
   * until the caller aborts. Either way the answers that DID arrive are kept: a slow relay never erases them.
   */
  graceMs?: number;
  /** The connection to use (tests); default `NRelay1`, opened for the request and closed after. */
  open?: RelayOpener;
}

/**
 * One REQ per relay, each relay opened for it and closed after (no reconnection); answers merged, never trusted.
 * M11D.8.4: settles as soon as every relay has answered, or the caller aborts, or the grace after the first answer
 * runs out, and ALWAYS with what the answering relays sent (`reachable` counts them). Before, the caller's timeout
 * discarded everything when one relay was slow: the cause of the first-load "offline" entry.
 */
export async function queryRelays(relays: readonly string[], filter: Record<string, unknown>, signal: AbortSignal, o: QueryOptions = {}): Promise<ProfileReadResult> {
  let open = o.open;
  if (!open) {
    // The network library is loaded once per request (never on the first screen), then one NRelay1 per relay.
    const { NRelay1 } = await import('@nostrify/nostrify');
    open = (url) => new NRelay1(url, { backoff: false, idleTimeout: false }) as unknown as RelayConnection;
  }
  const opener = open;
  const stop = new AbortController();
  const both = typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, stop.signal]) : signal;
  const events: unknown[] = [];
  let reachable = 0;
  let pending = relays.length;
  let grace: ReturnType<typeof setTimeout> | undefined;
  let finish!: () => void;
  const done = new Promise<void>((r) => (finish = r));
  const onAbort = () => finish();
  if (signal.aborted) finish();
  signal.addEventListener('abort', onAbort, { once: true });
  for (const url of relays)
    void (async () => {
      let relay: RelayConnection | null = null;
      try {
        relay = opener(url);
        const got = await relay.query([filter], { signal: both });
        if (both.aborted) return;
        reachable++;
        events.push(...got);
        if (o.graceMs !== undefined && grace === undefined && reachable < relays.length) grace = setTimeout(() => (stop.abort(), finish()), o.graceMs);
      } catch {
        // Not reached (refused, failed, aborted): counted as not answering.
      } finally {
        if (relay) void Promise.resolve(relay.close()).catch(() => {});
        if (--pending === 0) finish();
      }
    })();
  if (!relays.length) finish();
  await done;
  clearTimeout(grace);
  signal.removeEventListener('abort', onAbort);
  stop.abort();
  return { events: [...events], reachable };
}
