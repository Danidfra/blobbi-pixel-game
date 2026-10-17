/**
 * M11D.4, PUBLISHING: the only module in the game that sends an event (`EVENT`) to a relay (`tests/boundaries.test.ts`
 * enforces it). Used only by account activation (`activation.ts`), only after the player's explicit consent.
 *
 *   relayPublisher   real relays (Nostrify `NRelay1`, one connection per relay for the request, closed after)
 *   memoryRelay      an in-browser relay: tests, and the default REHEARSAL mode of this build, where everything is
 *                    prepared, signed, "sent" and read back exactly as for real, but nothing leaves the device
 *   relayGroup       M11D.6: several in-memory relays behind one publisher (tests: partial outages, quorum)
 *
 * M11D.6, WHAT A RELAY SAID: every publish reports each relay's answer (`RelayAck`): accepted only on a NIP-01 `OK`
 * true, or `OK` false with the `duplicate:` prefix (the relay already holds this very event). A WebSocket send that
 * got no `OK` is never counted. Every query reports what each relay returned (or that it did not answer), so the
 * caller can tell which relays really hold an event (read-back). A relay's own words are reduced to the NIP-01
 * machine prefix (`blocked`, `rate-limited`, ...): untrusted text is never shown or stored.
 *
 * Live publishing is OFF by default (the owner decides when it ships): see `relay-config.ts` for how a build or a
 * development page switches to real relays.
 */
import type { NostrEvent } from 'nostr-tools/pure';
import { PUBLISH_RELAYS } from './relay-config';

export { PUBLISH_RELAYS };

export interface PublishFilter {
  kinds: number[];
  authors: string[];
  '#d'?: string[];
  limit?: number;
}

/** One relay's answer to one event. `reason`: a NIP-01 prefix, or 'timeout' / 'unreachable' / 'refused'. */
export interface RelayAck {
  relay: string;
  ok: boolean;
  reason: string;
}

export interface QueryResult {
  /** Everything every relay returned (untrusted: the caller checks every event). */
  events: NostrEvent[];
  /** How many relays answered. */
  reachable: number;
  /** What each relay returned; null for a relay that did not answer. */
  byRelay: Record<string, NostrEvent[] | null>;
}

export interface Publisher {
  /** 'live' (real relays) or 'rehearsal' (nothing leaves the device). Shown to the player. */
  readonly mode: 'live' | 'rehearsal';
  readonly relays: readonly string[];
  /** Read events (preflight and read-back). Untrusted: the caller checks every event. */
  query(filter: PublishFilter, timeoutMs: number): Promise<QueryResult>;
  /** Send one signed event to every relay (or only to `only`); each relay's answer. Never throws for a relay. */
  publish(event: NostrEvent, timeoutMs: number, only?: readonly string[]): Promise<RelayAck[]>;
}

/** The NIP-01 machine-readable prefixes a relay may give with `OK` false; anything else is 'refused'. */
const PREFIXES = new Set(['duplicate', 'pow', 'blocked', 'rate-limited', 'invalid', 'restricted', 'mute', 'error', 'auth-required']);

/** A relay's message reduced to its NIP-01 prefix (its free text is never kept). */
export function reasonOf(message: unknown): string {
  if (message instanceof Error && (message.name === 'TimeoutError' || message.name === 'AbortError')) return 'timeout';
  const text = message instanceof Error ? message.message : typeof message === 'string' ? message : '';
  const prefix = text.split(':')[0].trim().toLowerCase();
  return PREFIXES.has(prefix) ? prefix : 'refused';
}

/** Whether a relay's answer means it holds the event (OK true, or a `duplicate:` refusal). */
export const accepted = (acks: readonly RelayAck[]): string[] => acks.filter((a) => a.ok).map((a) => a.relay);

const matches = (e: NostrEvent, f: PublishFilter) => f.kinds.includes(e.kind) && f.authors.includes(e.pubkey) && (!f['#d'] || e.tags.some((t) => t[0] === 'd' && f['#d']!.includes(t[1])));

/**
 * An in-memory relay (with optional failures, for tests): it keeps the newest replaceable event per (kind, author, d),
 * as a relay does. `refuse` makes it reject events; `down` makes it unreachable; `forget` makes it accept an event and
 * not keep it (a relay that answers OK and loses it). `mode` is 'rehearsal' unless a test plays a real relay.
 */
export function memoryRelay(opts: { url?: string; mode?: 'live' | 'rehearsal'; refuse?: (e: NostrEvent) => boolean; down?: () => boolean; forget?: (e: NostrEvent) => boolean } = {}): Publisher & { events: NostrEvent[]; sent: NostrEvent[] } {
  const url = opts.url ?? 'memory://rehearsal';
  const events: NostrEvent[] = [];
  const sent: NostrEvent[] = [];
  const key = (e: NostrEvent) => `${e.kind}|${e.pubkey}|${e.tags.find((t) => t[0] === 'd')?.[1] ?? ''}`;
  return {
    mode: opts.mode ?? 'rehearsal',
    relays: [url],
    events,
    sent,
    async query(filter) {
      if (opts.down?.()) return { events: [], reachable: 0, byRelay: { [url]: null } };
      const found = events.filter((e) => matches(e, filter)).map((e) => ({ ...e, tags: e.tags.map((t) => [...t]) }));
      return { events: found, reachable: 1, byRelay: { [url]: found } };
    },
    async publish(event, _timeoutMs, only) {
      if (only && !only.includes(url)) return [];
      sent.push(event);
      if (opts.down?.()) return [{ relay: url, ok: false, reason: 'timeout' }];
      if (opts.refuse?.(event)) return [{ relay: url, ok: false, reason: 'blocked' }];
      if (events.some((e) => e.id === event.id)) return [{ relay: url, ok: true, reason: 'duplicate' }];
      if (opts.forget?.(event)) return [{ relay: url, ok: true, reason: '' }];
      const i = events.findIndex((e) => key(e) === key(event));
      if (i < 0) events.push(event);
      else if (events[i].created_at < event.created_at || (events[i].created_at === event.created_at && event.id < events[i].id)) events[i] = event;
      return [{ relay: url, ok: true, reason: '' }];
    },
  };
}

/** M11D.6: several publishers (in-memory relays, each with its own url and failures) behind one. */
export function relayGroup(members: readonly Publisher[], mode: 'live' | 'rehearsal' = 'live'): Publisher {
  return {
    mode,
    relays: members.flatMap((m) => m.relays),
    async query(filter, timeoutMs) {
      const answers = await Promise.all(members.map((m) => m.query(filter, timeoutMs)));
      return { events: answers.flatMap((a) => a.events), reachable: answers.reduce((n, a) => n + a.reachable, 0), byRelay: Object.assign({}, ...answers.map((a) => a.byRelay)) };
    },
    async publish(event, timeoutMs, only) {
      return (await Promise.all(members.map((m) => m.publish(event, timeoutMs, only)))).flat();
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
      const byRelay: Record<string, NostrEvent[] | null> = {};
      const events: NostrEvent[] = [];
      let reachable = 0;
      answers.forEach((a, i) => {
        byRelay[relays[i]] = a.status === 'fulfilled' ? a.value : null;
        if (a.status === 'fulfilled') {
          reachable++;
          events.push(...a.value);
        }
      });
      return { events, reachable, byRelay };
    },
    async publish(event, timeoutMs, only) {
      const targets = only ? relays.filter((r) => only.includes(r)) : relays;
      const answers = await Promise.allSettled(targets.map((url) => withRelay(url, (r) => r.event(event, { signal: AbortSignal.timeout(timeoutMs) }))));
      return answers.map((a, i): RelayAck => {
        if (a.status === 'fulfilled') return { relay: targets[i], ok: true, reason: '' };
        const reason = reasonOf(a.reason);
        // NIP-01: a relay that already has this very event may say so with OK false and `duplicate:`; it holds it.
        return { relay: targets[i], ok: reason === 'duplicate', reason };
      });
    },
  };
}

/**
 * M16, WORLD TRAVEL: send one signed event to ONE relay (Nostrify `NRelay1`, opened for it and closed after).
 * Resolves when the relay accepted it or already held it (`duplicate:`); rejects otherwise. Used only by world
 * travel's relays (`world-travel.ts`), for a World Location the player asked for and the optional Active Presence.
 */
export async function sendToRelay(url: string, event: NostrEvent, signal: AbortSignal): Promise<void> {
  const { NRelay1 } = await import('@nostrify/nostrify');
  const relay = new NRelay1(url, { backoff: false, idleTimeout: false });
  try {
    await relay.event(event as never, { signal });
  } catch (error) {
    if (reasonOf(error) === 'duplicate') return;
    throw error;
  } finally {
    void relay.close().catch(() => {});
  }
}
