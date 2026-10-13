/**
 * M11D.4, PUBLISHING: the only module in the game that sends an event (`EVENT`) to a relay (`tests/boundaries.test.ts`
 * enforces it). Used only by account activation (`activation.ts`), only after the player's explicit consent.
 *
 *   relayPublisher   real relays (Nostrify `NRelay1`, one connection per relay for the request, closed after)
 *   memoryRelay      an in-browser relay: tests, and the default REHEARSAL mode of this build, where everything is
 *                    prepared, signed, "sent" and read back exactly as for real, but nothing leaves the device
 *
 * Live publishing is OFF by default in this build (the owner decides when it ships): the host switches to real relays
 * only with an explicit development flag (`#publish=live`), see docs/milestones/M11D4.md.
 */
import type { NostrEvent } from 'nostr-tools/pure';

export interface PublishFilter {
  kinds: number[];
  authors: string[];
  '#d'?: string[];
  limit?: number;
}

export interface Publisher {
  /** 'live' (real relays) or 'rehearsal' (nothing leaves the device). Shown to the player. */
  readonly mode: 'live' | 'rehearsal';
  readonly relays: readonly string[];
  /** Read events (preflight and verification). Untrusted: the caller checks every event. */
  query(filter: PublishFilter, timeoutMs: number): Promise<{ events: NostrEvent[]; reachable: number }>;
  /** Send one signed event; the relays that accepted it (OK true). Never throws for a refusing relay. */
  publish(event: NostrEvent, timeoutMs: number): Promise<string[]>;
}

/** The relays the Blobbi apps publish to (the Standalone's set). */
export const PUBLISH_RELAYS: readonly string[] = ['wss://relay.ditto.pub', 'wss://relay.primal.net', 'wss://relay.nostr.band'];

const matches = (e: NostrEvent, f: PublishFilter) => f.kinds.includes(e.kind) && f.authors.includes(e.pubkey) && (!f['#d'] || e.tags.some((t) => t[0] === 'd' && f['#d']!.includes(t[1])));

/**
 * An in-memory relay (with optional failures, for tests): it keeps the newest replaceable event per (kind, author, d),
 * as a relay does. `refuse` makes it reject events; `down` makes it unreachable.
 */
export function memoryRelay(opts: { url?: string; refuse?: (e: NostrEvent) => boolean; down?: () => boolean } = {}): Publisher & { events: NostrEvent[]; sent: NostrEvent[] } {
  const url = opts.url ?? 'memory://rehearsal';
  const events: NostrEvent[] = [];
  const sent: NostrEvent[] = [];
  const key = (e: NostrEvent) => `${e.kind}|${e.pubkey}|${e.tags.find((t) => t[0] === 'd')?.[1] ?? ''}`;
  return {
    mode: 'rehearsal',
    relays: [url],
    events,
    sent,
    async query(filter) {
      if (opts.down?.()) return { events: [], reachable: 0 };
      return { events: events.filter((e) => matches(e, filter)).map((e) => ({ ...e, tags: e.tags.map((t) => [...t]) })), reachable: 1 };
    },
    async publish(event) {
      sent.push(event);
      if (opts.down?.() || opts.refuse?.(event)) return [];
      const i = events.findIndex((e) => key(e) === key(event));
      if (i < 0) events.push(event);
      else if (events[i].created_at <= event.created_at) events[i] = event;
      return [url];
    },
  };
}

/** Real relays, through Nostrify. Each relay is opened for one request and closed after (no background sockets). */
export function relayPublisher(relays: readonly string[] = PUBLISH_RELAYS): Publisher {
  const withRelay = async <T>(url: string, use: (r: { query: (f: PublishFilter[], o: { signal: AbortSignal }) => Promise<NostrEvent[]>; event: (e: NostrEvent, o: { signal: AbortSignal }) => Promise<void> }) => Promise<T>): Promise<T> => {
    const { NRelay1 } = await import('@nostrify/nostrify');
    const relay = new NRelay1(url, { backoff: false, idleTimeout: false });
    try {
      return await use(relay as never);
    } finally {
      void relay.close().catch(() => {});
    }
  };
  return {
    mode: 'live',
    relays,
    async query(filter, timeoutMs) {
      const answers = await Promise.allSettled(relays.map((url) => withRelay(url, (r) => r.query([filter], { signal: AbortSignal.timeout(timeoutMs) }))));
      const events: NostrEvent[] = [];
      let reachable = 0;
      for (const a of answers)
        if (a.status === 'fulfilled') {
          reachable++;
          events.push(...a.value);
        }
      return { events, reachable };
    },
    async publish(event, timeoutMs) {
      const answers = await Promise.allSettled(relays.map((url) => withRelay(url, (r) => r.event(event, { signal: AbortSignal.timeout(timeoutMs) }).then(() => url))));
      return answers.filter((a): a is PromiseFulfilledResult<string> => a.status === 'fulfilled').map((a) => a.value);
    },
  };
}
