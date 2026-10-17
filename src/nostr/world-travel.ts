/**
 * M16, WORLD TRAVEL: the network half of Pixel's world travel (the rules are `@blobbi-kit/core`'s `world-travel*`;
 * the game's half is `src/game/travel-host.ts`). Only this file and `publisher.ts` touch relays for it.
 *
 *   relays    `BLOBBI_WORLD_TRAVEL_RELAYS` (relay.ditto.pub and relay.primal.net, the two every Blobbi app writes
 *             profiles to; Blobbi Standalone uses the same two), each asked and written to on its own
 *   reads     one NRelay1 per request, closed after (as everywhere in this game)
 *   writes    `sendToRelay` (publisher.ts): one World Location per move the player asked for, and the optional
 *             Active Presence
 *   stream    THE ONE NARROW EXCEPTION to "no background sockets": while world travel is on, an account is connected
 *             and the page is VISIBLE, one live subscription per relay for the walking Blobbi's World Location and
 *             Active Presence (REQ only, never EVENT or AUTH), so a move made on another device shows up within a
 *             moment. Closed as soon as the page is hidden or the session ends; opened again (and the session told to
 *             look again) when the page shows. A dropped stream is opened again after a growing pause.
 *
 * Every event is passed on untrusted: the kit checks signatures (`verifyEvent`), authors and schema.
 */
import type { NostrEvent } from 'nostr-tools/pure';
import { verifyEvent } from 'nostr-tools/pure';
import { BLOBBI_WORLD_TRAVEL_RELAYS, type WorldTravelLock, type WorldTravelRelays, type WorldTravelStore } from '@blobbi-kit/core';
import { sendToRelay } from './publisher';

type Filter = Record<string, unknown>;

/** One relay connection (Nostrify's `NRelay1` by default; tests pass their own). */
export interface TravelConnection {
  query(filters: Filter[], opts: { signal: AbortSignal }): Promise<unknown[]>;
  req(filters: Filter[], opts: { signal: AbortSignal }): AsyncIterable<unknown>;
  close(): Promise<unknown> | void;
}

export interface PixelTravelRelaysOptions {
  urls?: readonly string[];
  /** Opens a connection (default: NRelay1, loaded on first use). */
  open?: (url: string) => Promise<TravelConnection>;
  /** Sends one event to one relay (default: `sendToRelay`). */
  send?: (url: string, event: NostrEvent, signal: AbortSignal) => Promise<void>;
  /** A stream (re)opened after the page showed again or a drop: the session should look again. */
  onReconnect?: () => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

export interface PixelTravelRelays extends WorldTravelRelays {
  /** Hidden: every stream closed. Visible: opened again. */
  setVisible(visible: boolean): void;
  /** How many relay streams are open now (tests, the boundaries check). */
  openStreams(): number;
}

const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

async function nrelay(url: string): Promise<TravelConnection> {
  const { NRelay1 } = await import('@nostrify/nostrify');
  return new NRelay1(url, { backoff: false, idleTimeout: false }) as unknown as TravelConnection;
}

export function pixelTravelRelays(o: PixelTravelRelaysOptions = {}): PixelTravelRelays {
  const urls = o.urls ?? BLOBBI_WORLD_TRAVEL_RELAYS;
  const open = o.open ?? nrelay;
  const send = o.send ?? ((url, event, signal) => sendToRelay(url, event, signal));
  const setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let visible = true;
  let streams = 0;
  /** The live subscription, while there is one (at most one: one session at a time). */
  let live: { filters: Filter[]; on: (e: unknown) => void; stops: (() => void)[] } | null = null;

  const follow = (url: string, sub: NonNullable<typeof live>): (() => void) => {
    let stopped = false;
    let timer: unknown = null;
    let conn: TravelConnection | null = null;
    let controller: AbortController | null = null;
    const run = async (attempt: number): Promise<void> => {
      if (stopped) return;
      controller = new AbortController();
      let got = false;
      try {
        conn = await open(url);
        if (stopped) return;
        streams++;
        try {
          for await (const msg of conn.req(sub.filters, { signal: controller.signal })) {
            if (stopped) break;
            if (!Array.isArray(msg)) continue;
            if (msg[0] === 'EVENT') sub.on(msg[2]);
            else if (msg[0] === 'EOSE') {
              got = true;
              if (attempt > 0) o.onReconnect?.();
            } else if (msg[0] === 'CLOSED') break;
          }
        } finally {
          streams--;
        }
      } catch {
        /* dropped or refused: opened again below */
      } finally {
        const c = conn;
        conn = null;
        if (c) void Promise.resolve(c.close()).catch(() => {});
      }
      if (stopped) return;
      const next = got ? 1 : attempt + 1;
      timer = setTimer(() => {
        timer = null;
        void run(next);
      }, BACKOFF_MS[Math.min(next - 1, BACKOFF_MS.length - 1)]);
    };
    void run(0);
    return () => {
      stopped = true;
      controller?.abort();
      if (timer !== null) clearTimer(timer);
    };
  };
  const start = (sub: NonNullable<typeof live>) => {
    sub.stops = urls.map((url) => follow(url, sub));
  };
  const stop = (sub: NonNullable<typeof live>) => {
    for (const s of sub.stops) s();
    sub.stops = [];
  };

  return {
    urls,
    async query(url, filter, signal) {
      const conn = await open(url);
      try {
        return (await conn.query([{ ...filter }], { signal })) as NostrEvent[];
      } finally {
        void Promise.resolve(conn.close()).catch(() => {});
      }
    },
    publish: (url, event, signal) => send(url, event as NostrEvent, signal),
    subscribe(filters, on) {
      if (live) stop(live);
      const sub = { filters: filters as Filter[], on, stops: [] as (() => void)[] };
      live = sub;
      if (visible) start(sub);
      return () => {
        stop(sub);
        if (live === sub) live = null;
      };
    },
    setVisible(v) {
      if (v === visible) return;
      visible = v;
      if (!live) return;
      if (!v) stop(live);
      else {
        start(live);
        o.onReconnect?.();
      }
    },
    openStreams: () => streams,
  };
}

/** The signature check world travel uses (an event is trusted for its signature, never for its relay). */
export const verifyTravelEvent = (e: unknown): boolean => {
  try {
    return verifyEvent(e as NostrEvent);
  } catch {
    return false;
  }
};

/** localStorage for the kit's last-known location and pending move (public data only), every access guarded. */
export function travelStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): WorldTravelStore | null {
  if (!storage) return null;
  return {
    get: (k) => {
      try {
        return storage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        storage.setItem(k, v);
      } catch {
        /* full or refused: the relays have it */
      }
    },
    remove: (k) => {
      try {
        storage.removeItem(k);
      } catch {
        /* nothing kept */
      }
    },
  };
}

/** One move per Blobbi across this browser's tabs (Web Locks), when the browser has them. */
export function webLock(): WorldTravelLock | undefined {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (!locks || typeof locks.request !== 'function') return undefined;
  return (name, fn) => locks.request(name, fn) as never;
}
