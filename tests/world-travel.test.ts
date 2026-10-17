/**
 * M16, world travel in Blobbi Pixel: the travel host (src/game/travel-host.ts) over the kit's real session, with
 * real keys and signatures, several in-memory relays, and a pretend page (trusted and untrusted inputs, visibility).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent, type NostrEvent } from 'nostr-tools/pure';
import { WORLD_HOME, WORLD_PIXEL, buildWorldLocationTemplate, createWorldTravel, parseWorldLocation, type ShownBlobbi, type ShownState, type TravelOutcome, type WorldTravelRelays, type WorldTravelSigner, type WorldTravelSnapshot } from '@blobbi-kit/core';
import { createTravelHost, worldTravelMode, type TravelHostDeps } from '../src/game/travel-host';
import { pixelTravelRelays, type TravelConnection } from '../src/nostr/world-travel';
import { TeleportController } from '../src/game/teleport';
import { SettingsScreen } from '../src/ui/screens/settings';

const sk = generateSecretKey();
const OWNER = getPublicKey(sk);
const D = `blobbi-${OWNER.slice(0, 12)}-0123456789`;

// ─── An in-memory relay network (NIP-01 storage: addressable newest per address, ephemeral never stored) ───

interface MemRelay {
  url: string;
  stored: NostrEvent[];
  refuse: boolean;
  down: boolean;
  subs: Set<{ filters: Record<string, unknown>[]; on: (e: unknown) => void }>;
  published: NostrEvent[];
}
const matches = (e: NostrEvent, f: Record<string, unknown>) => {
  if (Array.isArray(f.kinds) && !f.kinds.includes(e.kind)) return false;
  if (Array.isArray(f.authors) && !f.authors.includes(e.pubkey)) return false;
  for (const [k, v] of Object.entries(f)) if (k.startsWith('#') && Array.isArray(v) && !e.tags.some((t) => t[0] === k.slice(1) && v.includes(t[1]))) return false;
  return true;
};
function accept(r: MemRelay, e: NostrEvent) {
  if (e.kind >= 30000 && e.kind < 40000) {
    const key = (x: NostrEvent) => `${x.kind}:${x.pubkey}:${x.tags.find((t) => t[0] === 'd')?.[1]}`;
    const i = r.stored.findIndex((x) => key(x) === key(e));
    if (i >= 0 && !(r.stored[i].created_at < e.created_at || (r.stored[i].created_at === e.created_at && e.id < r.stored[i].id))) return;
    if (i >= 0) r.stored[i] = e;
    else r.stored.push(e);
  }
  for (const s of r.subs) if (s.filters.some((f) => matches(e, f))) s.on(structuredClone(e));
}
function network(urls = ['wss://relay.ditto.pub', 'wss://relay.primal.net']) {
  const relays: MemRelay[] = urls.map((url) => ({ url, stored: [], refuse: false, down: false, subs: new Set(), published: [] }));
  const relay = (u: string) => relays.find((r) => r.url === u)!;
  const port = (): WorldTravelRelays => ({
    urls,
    async query(url, filter) {
      if (relay(url).down) throw new Error('down');
      return relay(url).stored.filter((e) => matches(e, filter as never)).map((e) => structuredClone(e));
    },
    async publish(url, e) {
      const r = relay(url);
      if (r.down) throw new Error('down');
      r.published.push(e as NostrEvent);
      if (r.refuse) throw new Error('blocked: no');
      accept(r, structuredClone(e as NostrEvent));
    },
    subscribe(filters, on) {
      const s = { filters: filters as never, on };
      for (const r of relays) r.subs.add(s);
      return () => relays.forEach((r) => r.subs.delete(s));
    },
  });
  return { relays, port, relay };
}
const sent = (net: ReturnType<typeof network>, kind: number) => [...new Map(net.relays.flatMap((r) => r.published).filter((e) => e.kind === kind).map((e) => [e.id, e])).values()];
function moveElsewhere(net: ReturnType<typeof network>, world: string, atMs: number, latest: ReturnType<typeof parseWorldLocation> = null) {
  const e = finalizeEvent(buildWorldLocationTemplate({ owner: OWNER, d: D, world, latest, now: atMs }), sk);
  for (const r of net.relays) accept(r, structuredClone(e));
  return e;
}

// ─── A pretend page ───

function page() {
  const listeners = new Map<string, Set<(e: Event) => void>>();
  const add = (type: string, fn: (e: Event) => void) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(fn);
  };
  const remove = (type: string, fn: (e: Event) => void) => listeners.get(type)?.delete(fn);
  const p = {
    visibility: 'visible' as DocumentVisibilityState,
    focus: true,
    doc: {
      get visibilityState() {
        return p.visibility;
      },
      hasFocus: () => p.focus,
      addEventListener: add,
      removeEventListener: remove,
    } as unknown as Document,
    win: { addEventListener: add, removeEventListener: remove } as unknown as Window,
    fire(type: string, trusted = true) {
      for (const fn of listeners.get(type) ?? []) fn({ type, isTrusted: trusted } as Event);
    },
    press(trusted = true) {
      p.fire('pointerdown', trusted);
    },
    hide() {
      p.visibility = 'hidden';
      p.fire('visibilitychange');
    },
    show() {
      p.visibility = 'visible';
      p.fire('visibilitychange');
    },
  };
  return p;
}

/** The walking Blobbi's teleport, as LiveWorld drives it (instant journeys: the log is what matters). */
function walker() {
  const log: string[] = [];
  let state: ShownState = 'present';
  const b: ShownBlobbi = {
    state: () => state,
    enter: () => (log.push('enter'), (state = 'present')),
    leave: () => (log.push('leave'), (state = 'absent')),
    settle: (s) => (log.push(`settle-${s}`), (state = s)),
  };
  return { b, log };
}

function signer(mode: 'silent' | 'prompt', o: { refuse?: boolean; delayMs?: number } = {}) {
  const asked: number[] = [];
  const s = {
    asked,
    refuse: !!o.refuse,
    mode,
    async sign(t: Parameters<WorldTravelSigner['sign']>[0]) {
      asked.push(t.kind);
      if (o.delayMs) await new Promise((r) => setTimeout(r, o.delayMs));
      if (s.refuse) throw new Error('rejected');
      return finalizeEvent(t, sk);
    },
  };
  return s as typeof s & WorldTravelSigner;
}

interface Setup {
  net?: ReturnType<typeof network>;
  sign?: ReturnType<typeof signer>;
  account?: TravelHostDeps['account'];
  presence?: boolean;
}
function setup(o: Setup = {}) {
  const net = o.net ?? network();
  const sign = o.sign ?? signer('silent');
  const p = page();
  const w = walker();
  const state = { busy: false, paused: false, playing: true };
  const outcomes: TravelOutcome[] = [];
  const journeys: string[] = [];
  // As the playground's guarded localStorage (the kit keeps a signed move there for its resend)
  const kept = new Map<string, string>();
  const store = { get: (k: string) => kept.get(k) ?? null, set: (k: string, v: string) => void kept.set(k, v), remove: (k: string) => void kept.delete(k) };
  const host = createTravelHost({
    account: o.account ?? (() => ({ owner: OWNER, d: D })),
    session: (owner, d, hooks) => ({
      session: createWorldTravel({ owner, d, world: WORLD_PIXEL, relays: net.port(), verify: verifyEvent as never, signer: () => sign, store, presenceEnabled: o.presence, isActive: hooks.isActive }),
    }),
    blobbi: () => w.b,
    busy: () => state.busy,
    paused: () => state.paused,
    playing: () => state.playing,
    onJourney: (k, place) => journeys.push(`${k}:${place}`),
    onOutcome: (out: TravelOutcome, _s: WorldTravelSnapshot) => outcomes.push(out),
    doc: p.doc,
    win: p.win,
  });
  host.update();
  hosts.push(host);
  return { net, sign, p, w, state, host, outcomes, journeys };
}
let hosts: ReturnType<typeof createTravelHost>[] = [];
const flush = (ms = 20) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2027, 2, 1, 10));
});
afterEach(() => {
  for (const h of hosts) h.dispose();
  hosts = [];
  vi.useRealTimers();
});

describe('world travel in Pixel: loading', () => {
  it('the Blobbi in Blobbi Home when the world opens is simply away: settled, no departure, nothing signed', async () => {
    const net = network();
    moveElsewhere(net, WORLD_HOME, Date.now() - 3_600_000);
    const { w, sign, host, journeys } = setup({ net });
    await flush(2_000);
    expect(w.log).toEqual(['settle-absent']);
    expect(journeys).toEqual([]);
    expect(host.here()).toBe(false);
    expect(sign.asked).toEqual([]);
  });

  it('no World Location at all is Blobbi Home: away here too, and nothing is published until the player plays', async () => {
    const { w, net, sign } = setup();
    await flush(5 * 60_000);
    expect(w.log).toEqual(['settle-absent']);
    expect(sign.asked).toEqual([]);
    expect(sent(net, 31126)).toEqual([]);
  });

  it('a guest or a local Blobbi has no session: it walks freely, nothing is read or signed', async () => {
    const { w, host, sign } = setup({ account: () => null });
    await flush(60_000);
    expect(host.snapshot()).toBeNull();
    expect(host.here()).toBe(true);
    expect(w.log).toEqual([]);
    expect(sign.asked).toEqual([]);
  });
});

describe('world travel in Pixel: the player’s press', () => {
  it('the first press in play calls it over with exactly one World Location; the next presses publish nothing', async () => {
    const { p, w, net, sign, host, outcomes } = setup();
    await flush();
    p.press();
    await flush();
    expect(outcomes).toEqual(['moved']);
    const moves = sent(net, 31126);
    expect(moves).toHaveLength(1);
    expect(parseWorldLocation(moves[0], { verify: verifyEvent as never })).toMatchObject({ world: WORLD_PIXEL, from: WORLD_HOME });
    expect(host.here()).toBe(true);
    expect(w.log).toEqual(['settle-absent', 'enter']);
    for (let i = 0; i < 5; i++) p.press();
    await flush(10_000);
    expect(sent(net, 31126)).toHaveLength(1);
    expect(sign.asked).toEqual([31126]);
  });

  it('never travels for a script’s event, a hidden page, an unfocused one, or before play started (the title, a menu)', async () => {
    const { p, sign, state } = setup();
    await flush();
    p.press(false);
    p.visibility = 'hidden';
    p.press();
    p.visibility = 'visible';
    state.playing = false;
    p.press();
    p.fire('keydown');
    p.fire('focus');
    p.show();
    await flush(10_000);
    expect(sign.asked).toEqual([]);
  });

  it('the press that starts play (NEW ADVENTURE, CONTINUE) calls it over, even into an intro the game drives', async () => {
    const { p, sign, state, host, net } = setup();
    state.playing = false;
    host.update();
    await flush();
    p.press(); // the title's ENTER, before play
    state.playing = true;
    state.paused = true; // the intro cinematic brings the Blobbi in itself
    host.update();
    await flush();
    expect(sign.asked).toEqual([31126]);
    expect(sent(net, 31126)).toHaveLength(1);
    expect(host.here()).toBe(true);
  });

  it('play starting with no press (a startup that goes straight into an island) never travels, nor a press long before', async () => {
    const { p, sign, state, host } = setup();
    state.playing = false;
    host.update();
    await flush(60_000);
    state.playing = true;
    host.update();
    await flush(10_000);
    expect(sign.asked).toEqual([]);
    state.playing = false;
    host.update();
    p.press();
    await flush(5_000);
    state.playing = true;
    host.update();
    await flush(10_000);
    expect(sign.asked).toEqual([]);
  });

  it('a press while the game drives the teleport (an intro, a visit) waits; the next press after it travels', async () => {
    const { p, sign, state } = setup();
    await flush();
    state.paused = true;
    p.press();
    await flush();
    expect(sign.asked).toEqual([]);
    state.paused = false;
    p.press();
    await flush();
    expect(sign.asked).toEqual([31126]);
  });

  it('the extension refusing: nothing sent, and presses right after ask nothing again; Call here (explicit) may', async () => {
    const s = signer('prompt', { refuse: true });
    const { p, net, outcomes, host } = setup({ sign: s });
    await flush();
    p.press();
    await flush();
    expect(outcomes).toEqual(['declined']);
    for (let i = 0; i < 10; i++) p.press();
    await flush(30_000);
    expect(s.asked).toHaveLength(1);
    expect(sent(net, 31126)).toEqual([]);
    s.refuse = false;
    expect(await host.callHere()).toBe('moved');
    expect(s.asked).toHaveLength(2);
  });

  it('the vault signs silently: the press travels at once', async () => {
    const s = signer('silent');
    const { p, host } = setup({ sign: s });
    await flush();
    p.press();
    await flush();
    expect(host.here()).toBe(true);
  });

  it('no relay accepting: the same signed move is resent once by itself, with no new signature', async () => {
    const net = network();
    const { p, sign, host, outcomes } = setup({ net });
    await flush();
    for (const r of net.relays) r.refuse = true;
    p.press();
    await flush();
    expect(outcomes).toEqual(['unreachable']);
    expect(host.here()).toBe(false);
    for (const r of net.relays) r.refuse = false;
    await flush(5_100);
    expect(host.here()).toBe(true);
    expect(sign.asked).toEqual([31126]);
    expect(sent(net, 31126)).toHaveLength(1);
  });
});

describe('world travel in Pixel: a move made elsewhere', () => {
  it('departs live, waits for the game’s moment (a timed action), and names where it went', async () => {
    const { p, w, net, state, journeys, host } = setup();
    await flush();
    p.press();
    await flush(6_000);
    expect(host.here()).toBe(true);
    state.busy = true;
    moveElsewhere(net, WORLD_HOME, Date.now(), host.snapshot()!.location);
    await flush(5_000);
    expect(w.log.at(-1)).toBe('enter');
    state.busy = false;
    await flush(400);
    expect(w.log.at(-1)).toBe('leave');
    expect(journeys).toEqual([`enter:${WORLD_PIXEL}`, `leave:${WORLD_HOME}`]);
    // It does not take the Blobbi back by itself
    await flush(30 * 60_000);
    expect(sent(net, 31126)).toHaveLength(1);
  });

  it('a hidden page plays the departure when it is seen again', async () => {
    const { p, w, net, host } = setup();
    await flush();
    p.press();
    await flush(6_000);
    p.hide();
    moveElsewhere(net, WORLD_HOME, Date.now(), host.snapshot()!.location);
    await flush(60_000);
    expect(w.log.at(-1)).toBe('enter');
    p.show();
    await flush(2_000);
    expect(w.log.at(-1)).toBe('leave');
  });
});

describe('Active Presence in Pixel', () => {
  it('is off by default: only the one World Location is ever signed', async () => {
    const { p, sign } = setup();
    await flush();
    p.press();
    await flush(10 * 60_000);
    expect(sign.asked).toEqual([31126]);
  });

  it('on: a 21124 only while played here (a recent press), never while idle or after the Blobbi left', async () => {
    const net = network();
    const { p, sign, host } = setup({ net, presence: true });
    await flush(60_000);
    expect(sign.asked).toEqual([]); // not here yet: nothing for a World that does not hold the Blobbi
    p.press();
    await flush(100);
    expect(sign.asked).toEqual([31126, 21124]);
    await flush(10 * 60_000); // no press: idle after two minutes
    const afterIdle = sign.asked.filter((k) => k === 21124).length;
    expect(afterIdle).toBeLessThanOrEqual(3);
    moveElsewhere(net, WORLD_HOME, Date.now(), host.snapshot()!.location);
    p.press(); // a press away: a casual call back, contended right after the move (nothing signed)
    await flush(10 * 60_000);
    expect(sign.asked.filter((k) => k === 21124).length).toBe(afterIdle);
  });

  it('with the extension: never from a timer; the first one waits for a press', async () => {
    const net = network();
    moveElsewhere(net, WORLD_PIXEL, Date.now() - 60_000);
    const s = signer('prompt');
    const { p } = setup({ net, sign: s, presence: true });
    await flush(10 * 60_000);
    expect(s.asked).toEqual([]);
    p.press();
    await flush(100);
    expect(s.asked).toEqual([21124]);
  });

  it('the setting turns it on and off for the session', async () => {
    const net = network();
    moveElsewhere(net, WORLD_PIXEL, Date.now() - 60_000);
    const { p, sign, host } = setup({ net });
    await flush();
    p.press();
    await flush(100);
    expect(sign.asked).toEqual([]);
    host.setPresenceEnabled(true);
    await flush(100);
    expect(sign.asked).toEqual([21124]);
    expect(host.snapshot()?.presence.status).toBe('on');
    host.setPresenceEnabled(false);
    p.press();
    await flush(10 * 60_000);
    expect(sign.asked).toEqual([21124]);
  });
});

describe('the switch, the settings rows and the dev aid', () => {
  it('off by default; a production build ignores the page flags; the build or a dev page turns it on', () => {
    const none = new URLSearchParams('');
    const flag = new URLSearchParams('world-travel=nostr');
    expect(worldTravelMode({ dev: false, hash: none, stored: null })).toBe('off');
    expect(worldTravelMode({ dev: false, hash: flag, stored: 'nostr' })).toBe('off');
    expect(worldTravelMode({ buildMode: 'nostr', dev: false, hash: none, stored: null })).toBe('nostr');
    expect(worldTravelMode({ dev: true, hash: flag, stored: null })).toBe('nostr');
    expect(worldTravelMode({ dev: true, hash: none, stored: 'nostr' })).toBe('nostr');
    expect(worldTravelMode({ dev: true, hash: none, stored: 'on' })).toBe('off');
  });

  it('the v1 cookie lease is not used while world travel is on (its account() answers nobody)', () => {
    const main = readFileSync('src/playground/main.ts', 'utf8');
    expect(main).toMatch(/if \(travelMode === 'nostr'\) return null;\n\s+if \(storeGetSafe\(PRESENCE_OFF_KEY\)/);
  });

  it('the browser-check aid exists only behind import.meta.env.DEV', () => {
    const main = readFileSync('src/playground/main.ts', 'utf8');
    const lines = main.split('\n').filter((l) => l.includes('__blobbiWorldTravel'));
    expect(lines).toHaveLength(1);
    expect(main).toMatch(/if \(import\.meta\.env\.DEV\) \{\n\s+\(window as unknown as \{ __blobbiWorldTravel\?: unknown \}\)\.__blobbiWorldTravel = \{/);
  });

  it('ACCOUNT shows CALL <NAME> HERE only while it is elsewhere, and the presence choice with its status', () => {
    const screen = new SettingsScreen();
    const ui = { settings: {}, close: vi.fn(), say: vi.fn() } as never;
    const rows = (st: { here: boolean; presence: string } | null) => {
      screen.travel = st === undefined ? null : { name: () => 'Bambu', state: () => st, callHere: vi.fn(), setPresence: vi.fn() };
      return (screen as unknown as { travelRows: (u: unknown) => { label: string }[] }).travelRows(ui).map((r) => r.label);
    };
    expect(rows(null)).toEqual([]);
    const away = rows({ here: false, presence: 'off' });
    expect(away[0]).toMatch(/Bambu/);
    expect(away).toHaveLength(2);
    expect(rows({ here: true, presence: 'on' })).toHaveLength(1);
    expect(rows({ here: true, presence: 'paused-prompting' })[0]).not.toEqual(rows({ here: true, presence: 'on' })[0]);
  });
});

describe('the teleport settles at once (a historical change is never replayed)', () => {
  it('present or absent, with no transition and nothing half drawn', () => {
    const tp = new TeleportController('seed');
    tp.settle('absent');
    expect(tp.state).toBe('absent');
    expect(tp.visible(0)).toBe(0);
    expect(tp.step(100)).toEqual([]);
    tp.settle('present');
    expect(tp.visible(0)).toBe(1);
  });
});

describe('Pixel’s travel relays (src/nostr/world-travel.ts)', () => {
  function conns() {
    const opened: string[] = [];
    let closed = 0;
    const live = new Set<{ end: () => void }>();
    const open = async (url: string): Promise<TravelConnection> => {
      opened.push(url);
      return {
        async query() {
          return [];
        },
        req(_f, { signal }) {
          let end!: () => void;
          const done = new Promise<void>((r) => (end = r));
          const entry = { end };
          live.add(entry);
          signal.addEventListener('abort', () => end());
          return {
            async *[Symbol.asyncIterator]() {
              yield ['EOSE', 's'];
              await done;
              live.delete(entry);
            },
          };
        },
        close: () => void closed++,
      };
    };
    return { open, opened, closed: () => closed, drop: () => [...live].forEach((l) => l.end()) };
  }

  it('reads one relay per request and closes it; writes go through the publisher’s one-relay send', async () => {
    const c = conns();
    const send = vi.fn(async () => {});
    const r = pixelTravelRelays({ open: c.open, send });
    await r.query('wss://relay.ditto.pub', { kinds: [31126] }, new AbortController().signal);
    expect(c.opened).toEqual(['wss://relay.ditto.pub']);
    expect(c.closed()).toBe(1);
    await r.publish('wss://relay.primal.net', { id: 'x' } as never, new AbortController().signal);
    expect(send).toHaveBeenCalledTimes(1);
    expect(r.urls).toEqual(['wss://relay.ditto.pub', 'wss://relay.primal.net']);
  });

  it('the live stream is open only while visible; hidden closes it; shown reopens and asks for a look; a drop reconnects', async () => {
    const c = conns();
    const reconnect = vi.fn();
    const r = pixelTravelRelays({ open: c.open, onReconnect: reconnect });
    const stop = r.subscribe!([{ kinds: [31126] }], () => {});
    await flush();
    expect(r.openStreams()).toBe(2);
    r.setVisible(false);
    await flush();
    expect(r.openStreams()).toBe(0);
    await flush(10 * 60_000);
    expect(r.openStreams()).toBe(0);
    r.setVisible(true);
    await flush();
    expect(r.openStreams()).toBe(2);
    expect(reconnect).toHaveBeenCalledTimes(1);
    c.drop();
    await flush(2_100);
    expect(r.openStreams()).toBe(2);
    expect(reconnect).toHaveBeenCalledTimes(3);
    stop();
    await flush();
    expect(r.openStreams()).toBe(0);
    await flush(10 * 60_000);
    expect(r.openStreams()).toBe(0);
  });
});

describe('signing a move as the account (IdentityService.signAsAccount)', () => {
  it('the extension must answer for the very account; no vault key means no silent signature', async () => {
    vi.useRealTimers();
    const { IdentityService } = await import('../src/nostr/identity');
    const { KeyVault, memoryVaultBackend } = await import('../src/nostr/keystore');
    const { memoryRelay } = await import('../src/nostr/publisher');
    const { memoryStore } = await import('../src/game/persistence');
    const other = generateSecretKey();
    const tpl = buildWorldLocationTemplate({ owner: OWNER, d: D, world: WORLD_PIXEL, latest: null, now: Date.now() });
    const make = (signAs: Uint8Array) => new IdentityService({ store: memoryStore(), vault: new KeyVault(memoryVaultBackend()), publisher: memoryRelay(), accountSigner: async (t) => finalizeEvent(t, signAs) });
    expect((await make(sk).signAsAccount(OWNER, 'nip07', tpl)).pubkey).toBe(OWNER);
    await expect(make(other).signAsAccount(OWNER, 'nip07', tpl)).rejects.toThrow();
    await expect(make(sk).signAsAccount(OWNER, 'vault', tpl)).rejects.toThrow();
  });
});
