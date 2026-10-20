/**
 * M16, world travel in Blobbi Pixel: the travel host (src/game/travel-host.ts) over the kit's real session, with
 * real keys and signatures, several in-memory relays, and a pretend page (trusted and untrusted inputs, visibility).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent, type NostrEvent } from 'nostr-tools/pure';
import { WORLD_HOME, WORLD_PIXEL, buildWorldLocationTemplate, createWorldTravel, parseWorldLocation, type ShownBlobbi, type ShownState, type TravelOutcome, type WorldTravelRelays, type WorldTravelSigner, type WorldTravelSnapshot } from '@blobbi-kit/core';
import { ARRIVAL_INTENT_TTL_MS, boundedSigner } from '../src/game/world-travel-departure';
import { ENTRY_HOLD_MAX_MS, createTravelHost, entryDecision, placeUnknown, travelCueFor, worldTravelMode, type TravelHostDeps } from '../src/game/travel-host';
import { drawTravelCue, travelCueMotes } from '../src/render/teleport-render';
import { PixelBuffer } from '../src/core/pixel';
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
  /** Answers reads this late (ms): a slow first look. */
  delayMs: number;
  /** Never answers a read (the kit's timeout ends it). */
  hang: boolean;
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
  const relays: MemRelay[] = urls.map((url) => ({ url, stored: [], refuse: false, down: false, delayMs: 0, hang: false, subs: new Set(), published: [] }));
  const relay = (u: string) => relays.find((r) => r.url === u)!;
  const port = (): WorldTravelRelays => ({
    urls,
    async query(url, filter, signal) {
      const r = relay(url);
      if (r.hang) await new Promise((_, no) => signal.addEventListener('abort', () => no(new Error('timeout'))));
      if (r.delayMs) await new Promise((ok) => setTimeout(ok, r.delayMs));
      if (r.down) throw new Error('down');
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
    fire(type: string, trusted = true, init: Record<string, unknown> = {}) {
      for (const fn of listeners.get(type) ?? []) fn({ type, isTrusted: trusted, ...init } as unknown as Event);
    },
    press(trusted = true) {
      p.fire('pointerdown', trusted);
    },
    /** A key: `repeat` is the browser's auto-repeat of a held key. */
    key(repeat = false, trusted = true) {
      p.fire('keydown', trusted, { repeat, key: 'ArrowRight' });
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
function walker(initial: ShownState = 'present') {
  const log: string[] = [];
  let state: ShownState = initial;
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
  /** The world's arrival lead (Pixel passes its teleport's 1.9 s). */
  lead?: number;
  /** The walking Blobbi's state when the world opens (play's entry held: absent). */
  shown?: ShownState;
  store?: Map<string, string>;
  /** Whether a signature can be asked for now (the page's extension check); absent: always. */
  signerReady?: () => boolean;
  /** Play has started when the host is made (default true); false: the title is up, play begins later. */
  playing?: boolean;
  /** A page opened hidden (a background tab). */
  hidden?: boolean;
  /** How long ago this page's navigation started (ms); default 0 (a page just opened). */
  pageAge?: () => number;
  /**
   * Share one lock across hosts (two tabs of one browser). Absent: a lock of this host's own. Never the kit's default
   * (a module-level in-page lock): a test that ends mid-move would leave every later session queued behind it.
   */
  lock?: Parameters<typeof createWorldTravel>[0]['lock'];
}
function setup(o: Setup = {}) {
  const net = o.net ?? network();
  const sign = o.sign ?? signer('silent');
  const p = page();
  const w = walker(o.shown);
  const state = { busy: false, paused: false, playing: o.playing ?? true };
  if (o.hidden) p.visibility = 'hidden';
  const outcomes: TravelOutcome[] = [];
  const journeys: string[] = [];
  const noSigner: string[] = [];
  // As the playground's guarded localStorage (the kit keeps a signed move there for its resend)
  const kept = o.store ?? new Map<string, string>();
  const store = { get: (k: string) => kept.get(k) ?? null, set: (k: string, v: string) => void kept.set(k, v), remove: (k: string) => void kept.delete(k) };
  const host = createTravelHost({
    account: o.account ?? (() => ({ owner: OWNER, d: D })),
    session: (owner, d, hooks) => ({
      session: createWorldTravel({ owner, d, world: WORLD_PIXEL, relays: net.port(), verify: verifyEvent as never, signer: () => sign, store, presenceEnabled: o.presence, isActive: hooks.isActive, arrivalLeadMs: o.lead, lock: o.lock ?? sharedLock() }),
    }),
    blobbi: () => w.b,
    busy: () => state.busy,
    paused: () => state.paused,
    playing: () => state.playing,
    onJourney: (k, place) => journeys.push(`${k}:${place}`),
    onOutcome: (out: TravelOutcome, _s: WorldTravelSnapshot) => outcomes.push(out),
    signerReady: o.signerReady,
    onNoSigner: (k) => noSigner.push(k),
    pageAge: o.pageAge ?? (() => 0),
    doc: p.doc,
    win: p.win,
  });
  host.update();
  hosts.push(host);
  return { net, sign, p, w, state, host, outcomes, journeys, kept, noSigner };
}
let hosts: ReturnType<typeof createTravelHost>[] = [];
const flush = (ms = 20) => vi.advanceTimersByTimeAsync(ms);
/** `n` presses in play a second apart (activity only: no press moves the Blobbi), the last followed by a wait. */
async function presses(p: ReturnType<typeof page>, n: number, after = 20) {
  for (let i = 0; i < n; i++) {
    p.press();
    await flush(i < n - 1 ? 1_100 : after);
  }
}
/** A lock two hosts share, as two tabs of one browser share Web Locks (one move per Blobbi at a time). */
function sharedLock(): NonNullable<Parameters<typeof createWorldTravel>[0]['lock']> {
  const queues = new Map<string, Promise<unknown>>();
  return (name, fn) => {
    const prev = queues.get(name) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    queues.set(name, run.catch(() => {}));
    return run;
  };
}
/** Long enough for a move's arrival (the kit's 1.5 s minimum from the act to the Blobbi forming). */
const ARRIVAL = 2_000;

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
    const { w, sign, host, journeys } = setup({ net, playing: false });
    await flush(2_000);
    expect(w.log).toEqual(['settle-absent']);
    expect(journeys).toEqual([]);
    expect(host.here()).toBe(false);
    expect(sign.asked).toEqual([]);
  });

  it('no World Location at all is Blobbi Home: away here too, and while play has not started nothing is published', async () => {
    const { w, net, sign } = setup({ playing: false });
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

describe('world travel in Pixel: opening the game brings the Blobbi here (revised 2026-10-19)', () => {
  it('an away Blobbi: once the place is confirmed, exactly one World Location is signed and published, and the arrival plays', async () => {
    const net = network();
    moveElsewhere(net, WORLD_HOME, Date.now() - 60_000);
    const { w, sign, host, outcomes, journeys } = setup({ net, shown: 'absent' });
    await flush(ARRIVAL);
    expect(outcomes).toEqual(['moved']);
    expect(sign.asked).toEqual([31126]);
    const moves = sent(net, 31126);
    expect(moves).toHaveLength(1);
    const loc = parseWorldLocation(moves[0], { verify: verifyEvent as never })!;
    expect(loc).toMatchObject({ world: WORLD_PIXEL, from: WORLD_HOME, owner: OWNER, d: D });
    expect(loc.prev).toBe(host.snapshot()!.location!.prev ?? loc.prev);
    expect(host.here()).toBe(true);
    expect(w.log).toContain('enter');
    expect(journeys).toContain(`enter:${WORLD_PIXEL}`);
  });

  it('the move names the latest canonical location as `prev` (the relays\' newest, merged by NIP-01)', async () => {
    const net = network();
    const older = moveElsewhere(net, WORLD_HOME, Date.now() - 600_000);
    const newer = finalizeEvent(buildWorldLocationTemplate({ owner: OWNER, d: D, world: WORLD_HOME, latest: parseWorldLocation(older, { verify: verifyEvent as never }), now: Date.now() - 60_000 }), sk);
    // Relay disagreement: only the second relay holds the newer location
    accept(net.relays[1], structuredClone(newer));
    const { host } = setup({ net, shown: 'absent' });
    await flush(ARRIVAL);
    const mine = sent(net, 31126).find((e) => e.pubkey === OWNER && e.id !== older.id && e.id !== newer.id)!;
    expect(parseWorldLocation(mine, { verify: verifyEvent as never })!.prev).toBe(newer.id);
    expect(host.here()).toBe(true);
  });

  it('a Blobbi already here: nothing is signed or published, the Blobbi simply shows', async () => {
    const net = network();
    moveElsewhere(net, WORLD_PIXEL, Date.now() - 60_000);
    const { w, sign, host } = setup({ net });
    await flush(ARRIVAL);
    expect(sign.asked).toEqual([]);
    expect(sent(net, 31126)).toHaveLength(0); // nothing of ours; the location there stands
    expect(host.here()).toBe(true);
    expect(w.log).toEqual([]); // present already: nothing to settle, no journey
  });

  it('once per page: re-renders, refreshes, relay updates, focus and visibility changes never publish a second event', async () => {
    const { p, net, sign, host } = setup({ shown: 'absent' });
    await flush(ARRIVAL);
    expect(sent(net, 31126)).toHaveLength(1);
    for (let i = 0; i < 20; i++) host.update();
    await host.snapshot()!; // a snapshot read
    await flush(10_000);
    p.hide();
    await flush(5_000);
    p.show();
    await flush(5_000);
    p.focus = false;
    p.focus = true;
    await presses(p, 5, 60_000);
    host.check();
    await flush(10 * 60_000); // refreshes of the relays
    expect(sent(net, 31126)).toHaveLength(1);
    expect(sign.asked).toEqual([31126]);
  });

  it('presses move nothing by themselves: a Blobbi taken away while the page plays on stays away until the player asks', async () => {
    const { p, net, sign, host, w } = setup({ shown: 'absent' });
    await flush(ARRIVAL);
    expect(host.here()).toBe(true);
    moveElsewhere(net, WORLD_HOME, Date.now(), host.snapshot()!.location);
    await flush(3_000);
    expect(w.log.at(-1)).toBe('leave');
    await presses(p, 10, 30_000);
    expect(sign.asked).toEqual([31126]);
    expect(host.here()).toBe(false);
    // Call here (Settings > Account) is the explicit retry: one more move
    expect(await host.callHere()).toBe('moved');
    expect(sign.asked).toEqual([31126, 31126]);
  });

  it('two open tabs: each tab decides once when opened; refocusing a tab never takes the Blobbi back (no ping-pong)', async () => {
    const net = network();
    const lock = sharedLock();
    moveElsewhere(net, WORLD_HOME, Date.now() - 60_000);
    const a = setup({ net, lock, shown: 'absent' });
    await flush(ARRIVAL);
    expect(a.host.here()).toBe(true);
    expect(sent(net, 31126)).toHaveLength(1);
    // A second tab of another World would move it away; here a second Pixel tab finds it here: nothing to do
    const b = setup({ net, lock, shown: 'absent' });
    await flush(ARRIVAL);
    expect(sent(net, 31126)).toHaveLength(1);
    expect(b.sign.asked).toEqual([]);
    // Another World takes it (Blobbi Home opened): both tabs see it leave
    moveElsewhere(net, WORLD_HOME, Date.now(), a.host.snapshot()!.location);
    await flush(3_000);
    expect(a.w.log.at(-1)).toBe('leave');
    expect(b.w.log.at(-1)).toBe('leave');
    // Refocusing either tab, however often, publishes nothing
    for (const t of [a, b]) {
      t.p.hide();
      await flush(1_000);
      t.p.show();
      await flush(5_000);
    }
    expect(sent(net, 31126)).toHaveLength(1);
    expect(a.sign.asked).toEqual([31126]);
    expect(b.sign.asked).toEqual([]);
  });

  it('a reload is a new page: it may move the Blobbi again', async () => {
    const net = network();
    const first = setup({ net, shown: 'absent' });
    await flush(ARRIVAL);
    expect(first.host.here()).toBe(true);
    moveElsewhere(net, WORLD_HOME, Date.now(), first.host.snapshot()!.location);
    await flush(3_000);
    first.host.dispose();
    // The reload: a fresh host over the same relays and store
    const again = setup({ net, shown: 'absent', store: first.kept });
    await flush(ARRIVAL);
    expect(again.host.here()).toBe(true);
    expect(again.sign.asked).toEqual([31126]);
  });

  it('an old background tab shown again is not an opening: nothing moves by itself, however long it sits; Call here still works', async () => {
    // Opened in the background an hour ago (its navigation start is that old), shown now
    const { p, sign, host } = setup({ hidden: true, shown: 'absent', pageAge: () => 60 * 60_000 });
    await flush(5_000);
    p.show();
    await flush(ARRIVAL);
    expect(sign.asked).toEqual([]);
    expect(host.here()).toBe(false);
    p.hide();
    await flush(1_000);
    p.show();
    await flush(ARRIVAL);
    expect(sign.asked).toEqual([]);
    expect(await host.callHere()).toBe('moved');
    expect(sign.asked).toEqual([31126]);
  });

  it('a page left signing in for longer than the intent lasts decides nothing when the place finally confirms', async () => {
    const net = network();
    for (const r of net.relays) r.delayMs = 1_000;
    let age = ARRIVAL_INTENT_TTL_MS - 500;
    const { sign, host } = setup({ net, shown: 'absent', pageAge: () => age });
    age = ARRIVAL_INTENT_TTL_MS + 1;
    await flush(ARRIVAL);
    expect(host.snapshot()!.resolution).toBe('confirmed');
    expect(sign.asked).toEqual([]);
  });

  it('a tab opened hidden acts the first time it is seen, not before', async () => {
    const { p, sign, host } = setup({ hidden: true, shown: 'absent' });
    await flush(5_000);
    expect(sign.asked).toEqual([]);
    expect(host.here()).toBe(false);
    p.show();
    await flush(ARRIVAL);
    expect(sign.asked).toEqual([31126]);
    expect(host.here()).toBe(true);
  });

  it('play beginning later (the title first) brings it over then, once', async () => {
    const { state, sign, host } = setup({ playing: false, shown: 'absent' });
    await flush(5_000);
    expect(sign.asked).toEqual([]);
    state.playing = true;
    host.update();
    await flush(ARRIVAL);
    expect(sign.asked).toEqual([31126]);
    expect(host.here()).toBe(true);
    state.playing = false;
    host.update();
    state.playing = true;
    host.update();
    await flush(ARRIVAL);
    expect(sign.asked).toEqual([31126]);
  });

  it('the extension refusing: nothing sent, the Blobbi stays away, the player is told; Call here is the retry', async () => {
    const s = signer('prompt', { refuse: true });
    const { p, net, outcomes, host } = setup({ sign: s, shown: 'absent' });
    await flush(ARRIVAL);
    expect(outcomes).toEqual(['declined']);
    expect(sent(net, 31126)).toEqual([]);
    expect(host.here()).toBe(false);
    // Nothing asks again by itself
    await presses(p, 6, 60_000);
    expect(s.asked).toHaveLength(1);
    s.refuse = false;
    expect(await host.callHere()).toBe('moved');
    expect(s.asked).toHaveLength(2);
  });

  it('a signer that never answers: the kit waits for it; nothing else is signed meanwhile', async () => {
    const s = signer('prompt', { delayMs: 60_000 });
    const { net, host } = setup({ sign: s, shown: 'absent' });
    await flush(30_000);
    expect(s.asked).toHaveLength(1);
    expect(sent(net, 31126)).toEqual([]);
    expect(host.snapshot()!.travel.phase).toBe('signing');
    await flush(30_000 + ARRIVAL);
    expect(sent(net, 31126)).toHaveLength(1);
    expect(host.here()).toBe(true);
  });

  it('with the page\'s bounded signer: a prompt left open a minute ends the move as declined; a late approval is dropped, never published; Call here signs anew, once', async () => {
    let answer: ((e: NostrEvent) => void) | null = null;
    let asked = 0;
    const raw: WorldTravelSigner = { mode: 'prompt', sign: (t) => new Promise((r) => (asked++, asked === 1 ? (answer = r) : r(finalizeEvent(t, sk)))) };
    const bounded = boundedSigner(raw);
    const s = { ...bounded, asked: [] as number[], refuse: false, mode: 'prompt' as const, sign: (t: Parameters<WorldTravelSigner['sign']>[0]) => (s.asked.push(t.kind), bounded.sign(t)) };
    const { net, host, outcomes } = setup({ sign: s as never, shown: 'absent' });
    await flush(30_000);
    expect(host.snapshot()!.travel.phase).toBe('signing');
    await flush(31_000);
    expect(outcomes).toEqual(['declined']);
    expect(sent(net, 31126)).toEqual([]);
    expect(host.snapshot()!.travel).toMatchObject({ phase: 'failed', reason: 'declined' });
    // The person approves the stale prompt now: dropped
    answer!(finalizeEvent({ kind: 31126, created_at: Math.floor(Date.now() / 1000), tags: [], content: '' }, sk));
    await flush(5_000);
    expect(sent(net, 31126)).toEqual([]);
    expect(host.here()).toBe(false);
    // The retry: a new signature, exactly one event, one arrival
    expect(await host.callHere()).toBe('moved');
    await flush(ARRIVAL);
    expect(sent(net, 31126)).toHaveLength(1);
    expect(s.asked).toEqual([31126, 31126]);
    expect(host.here()).toBe(true);
  });

  it('the vault signs silently: the Blobbi is here within the arrival time, no prompt', async () => {
    const { host, sign } = setup({ sign: signer('silent'), shown: 'absent' });
    await flush(ARRIVAL);
    expect(sign.asked).toEqual([31126]);
    expect(host.here()).toBe(true);
  });

  it('no relay accepting: unreachable, told once; the same signed move is resent once by itself, no new signature', async () => {
    const net = network();
    for (const r of net.relays) r.refuse = true;
    const { sign, host, outcomes } = setup({ net, shown: 'absent' });
    await flush(ARRIVAL);
    expect(outcomes).toEqual(['unreachable']);
    expect(host.here()).toBe(false);
    for (const r of net.relays) r.refuse = false;
    await flush(5_100 + ARRIVAL);
    expect(host.here()).toBe(true);
    expect(sign.asked).toEqual([31126]);
    expect(sent(net, 31126)).toHaveLength(1);
  });

  it('no relay answering the first look: nothing is signed (the place is not known); Call here later works', async () => {
    const net = network();
    for (const r of net.relays) r.down = true;
    const { sign, host, w } = setup({ net, shown: 'absent' });
    await flush(20_000);
    expect(sign.asked).toEqual([]);
    expect(host.snapshot()!.resolution).toBe('unreachable');
    expect(w.log).toEqual([]); // it was absent (the entry skipped it) and stays so
    for (const r of net.relays) r.down = false;
    expect(await host.callHere()).toBe('moved');
    await flush(ARRIVAL);
    expect(host.here()).toBe(true);
  });

  it('another Blobbi of the account is a new session with its own one decision', async () => {
    const OTHER_D = `blobbi-${OWNER.slice(0, 12)}-9876543210`;
    const net = network();
    let who = { owner: OWNER, d: D };
    const { sign, host } = setup({ net, account: () => who, shown: 'absent' });
    await flush(ARRIVAL);
    expect(sign.asked).toEqual([31126]);
    who = { owner: OWNER, d: OTHER_D };
    host.update();
    await flush(ARRIVAL);
    expect(host.snapshot()!.d).toBe(OTHER_D);
    expect(sign.asked).toEqual([31126, 31126]);
    expect(sent(net, 31126)).toHaveLength(2);
    // Back to the first: this page decided for it already; nothing more
    who = { owner: OWNER, d: D };
    host.update();
    await flush(ARRIVAL);
    expect(sign.asked).toEqual([31126, 31126]);
  });

  it('the arrival lead (Pixel\'s teleport, 1.9 s) overlaps the wait: the arrival starts at once with no departure window', async () => {
    const lead = setup({ lead: 1_900, shown: 'absent' });
    await flush(100);
    expect(lead.outcomes).toEqual(['moved']);
    expect(lead.host.here()).toBe(true);
    // Without a lead, the kit's minimum (1.5 s from the act) holds the arrival back
    const none = setup({ shown: 'absent' });
    await flush(100);
    expect(none.host.here()).toBe(false);
    expect(none.host.view()!.kind).toBe('coming');
    expect(none.host.snapshot()!.travel).toMatchObject({ phase: 'arriving' });
    await flush(ARRIVAL);
    expect(none.host.here()).toBe(true);
  });
});

describe('world travel in Pixel: the place not known yet (M16.2)', () => {
  it('a fresh device: while the first look is pending the Blobbi is never entered nor shown, nothing signs; then it settles', async () => {
    const net = network();
    moveElsewhere(net, WORLD_PIXEL, Date.now() - 3_600_000); // it was last played here, on another device
    for (const r of net.relays) r.delayMs = 3_000;
    // Play's entry held (main.ts): the Blobbi absent, the sync paused while the entry waits
    const { w, host, p, sign, state } = setup({ net, shown: 'absent' });
    const held = () => entryDecision({ unknown: placeUnknown({ candidate: true, view: host.view()?.kind ?? null }), here: host.here(), heldFor: 0 });
    state.paused = true;
    expect(host.snapshot()!.resolution).toBe('pending');
    expect(host.view()!.kind).toBe('looking');
    expect(held()).toBe('wait');
    expect(travelCueFor({ absent: true, looking: true, view: 'looking' })).toEqual({ kind: 'looking' });
    await presses(p, 3, 1_000);
    expect(w.log).toEqual([]);
    expect(sign.asked).toEqual([]);
    await flush(1_000);
    expect(host.view()!.kind).toBe('here');
    expect(held()).toBe('enter');
    // main.ts then plays the entry arrival itself and releases the sync: no settle, no second journey
    w.b.enter();
    state.paused = false;
    host.check();
    await flush(2_000);
    expect(w.log).toEqual(['enter']);
    expect(sign.asked).toEqual([]);
  });

  it('a fresh device whose Blobbi is elsewhere: the entry is skipped once known, never shown then taken away', async () => {
    const net = network();
    moveElsewhere(net, WORLD_HOME, Date.now() - 3_600_000);
    for (const r of net.relays) r.delayMs = 2_000;
    const { w, host, state } = setup({ net, shown: 'absent' });
    state.paused = true;
    await flush(100);
    expect(entryDecision({ unknown: placeUnknown({ candidate: true, view: host.view()!.kind }), here: host.here(), heldFor: 100 })).toBe('wait');
    await flush(2_000);
    // Known and elsewhere: the entry skips it, and the opening's own move is already under way
    expect(host.view()!.kind).toBe('coming');
    expect(entryDecision({ unknown: placeUnknown({ candidate: true, view: host.view()!.kind }), here: host.here(), heldFor: 2_100 })).toBe('skip');
    expect(w.log).toEqual([]); // never shown then taken away
    state.paused = false;
    host.check();
    await flush(ARRIVAL);
    expect(w.log).toEqual(['enter']); // it arrives by the teleport, once
  });

  it('without the paused hold, the first answer is settled as history (never a journey)', async () => {
    const net = network();
    moveElsewhere(net, WORLD_HOME, Date.now() - 3_600_000);
    for (const r of net.relays) r.delayMs = 2_000;
    const { w, journeys } = setup({ net });
    await flush(1_000);
    expect(w.log).toEqual([]);
    await flush(1_500);
    expect(w.log).toEqual(['settle-absent']);
    expect(journeys).toEqual([]);
  });

  it('no relay answering: the first look ends within the relay timeout as unreachable, never an endless loading', async () => {
    const net = network();
    for (const r of net.relays) r.hang = true;
    const { host, sign } = setup({ net, shown: 'absent' });
    expect(host.view()!.kind).toBe('looking');
    await flush(4_100);
    expect(host.snapshot()!.resolution).toBe('unreachable');
    expect(host.view()).toEqual({ kind: 'away', unreachable: true }); // the protocol's default place, Blobbi Home
    expect(entryDecision({ unknown: placeUnknown({ candidate: true, view: host.view()!.kind }), here: host.here(), heldFor: 4_100 })).toBe('skip');
    expect(sign.asked).toEqual([]);
  });

  it('the entry never waits longer than ENTRY_HOLD_MAX_MS (no session could start: it walks freely)', () => {
    expect(entryDecision({ unknown: placeUnknown({ candidate: true, view: null }), here: true, heldFor: 0 })).toBe('wait');
    expect(entryDecision({ unknown: true, here: true, heldFor: ENTRY_HOLD_MAX_MS })).toBe('enter');
    expect(ENTRY_HOLD_MAX_MS).toBeLessThanOrEqual(6_000);
    // A guest or a local Blobbi: nothing to look for
    expect(placeUnknown({ candidate: false, view: null })).toBe(false);
    expect(entryDecision({ unknown: false, here: true, heldFor: 0 })).toBe('enter');
  });

  it('a reload: the location this device kept is shown at once (cached), the entry need not wait, nothing signs on load', async () => {
    const net = network();
    const kept = new Map<string, string>();
    const first = setup({ net, store: kept, shown: 'absent' });
    await flush(ARRIVAL);
    expect(first.host.here()).toBe(true);
    first.host.dispose();
    for (const r of net.relays) r.delayMs = 3_000;
    const sign = signer('silent');
    const { host, w } = setup({ net, store: kept, sign, shown: 'absent' });
    expect(host.snapshot()!.resolution).toBe('cached');
    expect(host.view()!.kind).toBe('here');
    expect(entryDecision({ unknown: placeUnknown({ candidate: true, view: host.view()!.kind }), here: host.here(), heldFor: 0 })).toBe('enter');
    await flush(10_000);
    expect(host.snapshot()!.resolution).toBe('confirmed');
    expect(sign.asked).toEqual([]);
    expect(w.log).toEqual(['settle-present']);
  });

  it('a kept location that the relays cannot confirm stays shown (unreachable, honestly said)', async () => {
    const net = network();
    const kept = new Map<string, string>();
    const first = setup({ net, store: kept, shown: 'absent' });
    await flush(ARRIVAL);
    first.host.dispose();
    for (const r of net.relays) r.hang = true;
    const { host } = setup({ net, store: kept });
    await flush(4_100);
    expect(host.snapshot()!.resolution).toBe('unreachable');
    expect(host.view()).toEqual({ kind: 'here', unreachable: true });
  });
});

describe('world travel’s cues at the empty spot (M16.2)', () => {
  it('looking, calling, or nothing; never while the Blobbi shows', () => {
    expect(travelCueFor({ absent: false, looking: true, view: 'looking' })).toBeNull();
    expect(travelCueFor({ absent: true, looking: true, view: null })).toEqual({ kind: 'looking' });
    expect(travelCueFor({ absent: true, looking: false, view: 'coming' })).toEqual({ kind: 'calling' });
    expect(travelCueFor({ absent: true, looking: false, view: 'away' })).toBeNull();
    expect(travelCueFor({ absent: true, looking: false, view: 'here' })).toBeNull();
  });

  it('the motes are a pure function of time, small, and drawn in the teleport’s pixels', () => {
    expect(travelCueMotes('looking', 1.234, 16, 7)).toEqual(travelCueMotes('looking', 1.234, 16, 7));
    expect(travelCueMotes('looking', 0, 16, 7).length).toBeLessThanOrEqual(3);
    expect(travelCueMotes('calling', 0, 16, 7)).toHaveLength(8);
    expect(travelCueMotes('calling', 0, 16, 7, true)).toHaveLength(4);
    for (const m of travelCueMotes('calling', 0.7, 16, 7)) expect(m.z).toBeLessThanOrEqual(16 * 1.3);
    const screen = new PixelBuffer(80, 80);
    const drawn = drawTravelCue(screen, 'calling', 0.4, 40, 60, 2, 16, 7);
    expect(drawn).toBeGreaterThan(0);
    expect([...screen.data].some((c) => c !== 0)).toBe(true);
  });
});

describe('world travel in Pixel: a move made elsewhere', () => {
  it('departs live, waits for the game’s moment (a timed action), and names where it went', async () => {
    const { w, net, state, journeys, host } = setup({ shown: 'absent' });
    await flush(ARRIVAL);
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
    const { p, w, net, host } = setup({ shown: 'absent' });
    await flush(ARRIVAL);
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
    const { p, sign } = setup({ shown: 'absent' });
    await flush(ARRIVAL);
    await presses(p, 3, 10 * 60_000);
    expect(sign.asked).toEqual([31126]);
  });

  it('on: a 21124 only while played here (a recent press), never while idle or after the Blobbi left', async () => {
    const net = network();
    const { p, sign, host } = setup({ net, presence: true, shown: 'absent' });
    await flush(ARRIVAL);
    expect(sign.asked).toEqual([31126]); // the opening's move; no presence before a press
    await presses(p, 3, 1_000);
    expect(sign.asked).toEqual([31126, 21124]);
    await flush(10 * 60_000); // no press: idle after two minutes
    const afterIdle = sign.asked.filter((k) => k === 21124).length;
    expect(afterIdle).toBeLessThanOrEqual(3);
    moveElsewhere(net, WORLD_HOME, Date.now(), host.snapshot()!.location);
    await presses(p, 3); // presses while it is away: activity only, nothing signed
    await flush(10 * 60_000);
    expect(sign.asked.filter((k) => k === 21124).length).toBe(afterIdle);
    expect(sign.asked.filter((k) => k === 31126).length).toBe(1);
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
    // M16.2: a production build travels only when it also publishes live (a rehearsal build never writes 31126/21124)
    expect(worldTravelMode({ buildMode: 'nostr', dev: false, hash: none, stored: null })).toBe('off');
    expect(worldTravelMode({ buildMode: 'nostr', dev: false, hash: none, stored: null, publishLive: false })).toBe('off');
    expect(worldTravelMode({ buildMode: 'nostr', dev: false, hash: none, stored: null, publishLive: true })).toBe('nostr');
    expect(worldTravelMode({ buildMode: 'nostr', dev: true, hash: none, stored: null })).toBe('nostr');
    expect(worldTravelMode({ dev: true, hash: flag, stored: null })).toBe('nostr');
    expect(worldTravelMode({ dev: true, hash: none, stored: 'nostr' })).toBe('nostr');
    expect(worldTravelMode({ dev: true, hash: none, stored: 'on' })).toBe('off');
  });

  it('Nostr is the only model of where the Blobbi is: no cookie anywhere in the game, and travel off loads no network', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.ts$/.test(e.name) ? [join(dir, e.name)] : []));
    for (const f of files('src')) expect(readFileSync(f, 'utf8'), f).not.toMatch(/document\.cookie|cookieStore/);
    const main = readFileSync('src/playground/main.ts', 'utf8');
    expect(main).not.toMatch(/presence-host|presence-page|world-presence'/);
    // The network half is loaded only when world travel is on
    const loads = main.split('\n').filter((l) => l.includes("void import('../nostr/world-travel')") || l.includes("await import('../nostr/world-travel')"));
    expect(loads).toEqual(["if (travelMode === 'nostr') void import('../nostr/world-travel').then((m) => (travelNet = m));"]);
    // Travel off: no host at all, and play's entry always has the Blobbi here (normal play, nothing signed or sent)
    expect(main).toMatch(/const worldTravel: TravelHost \| null =\n\s+travelMode === 'nostr'\n\s+\? createTravelHost\(/);
    expect(main).toMatch(/function entryHere\(\): boolean \{\n\s+if \(!worldTravel \|\| !travelCandidate\(\)\) return true;/);
  });

  it('the browser-check aid exists only behind import.meta.env.DEV', () => {
    const main = readFileSync('src/playground/main.ts', 'utf8');
    const lines = main.split('\n').filter((l) => l.includes('__blobbiWorldTravel'));
    expect(lines).toHaveLength(1);
    expect(main).toMatch(/if \(import\.meta\.env\.DEV\) \{\n\s+\(window as unknown as \{ __blobbiWorldTravel\?: unknown \}\)\.__blobbiWorldTravel = \{/);
  });

  it('play’s entry no longer shows a Blobbi whose place is still loading; Pixel passes its teleport’s arrival lead', () => {
    const main = readFileSync('src/playground/main.ts', 'utf8');
    expect(main).not.toMatch(/status === 'loading' \|\| travelling\.here\) live\.enterBlobbi\(\)/);
    expect(main).toMatch(/const decision = entryDecision\(\{ unknown: travelPlaceUnknown\(\), here: entryHere\(\), heldFor: 0 \}\);\n\s+if \(decision === 'wait'\) entryHold = /);
    expect(main).toMatch(/arrivalLeadMs: \(\) => Math\.round\(ARRIVE\.rebuildStart \* 1000/);
    // M16.2: an account's Blobbi with no session yet is never assumed here by play's entry
    expect(main).toMatch(/function entryHere\(\): boolean \{\n  if \(!worldTravel \|\| !travelCandidate\(\)\) return true;\n  return worldTravel\.snapshot\(\)\?\.here \?\? false;/);
    expect(main).not.toMatch(/entryDecision\(\{ unknown: travelPlaceUnknown\(\), here: worldTravel\?\.here\(\) \?\? true/);
    // The held entry pauses the sync (nothing settled or replayed behind the game's back)
    expect(main).toMatch(/!!live\.swap \|\| !!entryHold \|\| departure\.state\(\)\.phase === 'leaving';/);
  });

  it('the dev aid reports the UI-only states a browser check needs', () => {
    const main = readFileSync('src/playground/main.ts', 'utf8');
    for (const k of ['mode:', 'snapshot:', 'shown:', 'callHere:', 'looking:', 'coming:', 'held:', 'cue:']) expect(main).toContain(`    ${k}`);
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

describe('world travel in Pixel: the extension has not confirmed the account yet (2026-10-18)', () => {
  it('the opening\'s move is never dropped in silence: the page is asked to reconnect, nothing signed; once ready, Call here moves it once', async () => {
    let ready = false;
    const { sign, noSigner, net, host } = setup({ signerReady: () => ready, shown: 'absent' });
    await flush(2_000);
    expect(host.here()).toBe(false); // no World Location: Blobbi Home
    expect(noSigner).toEqual(['explicit']);
    expect(sign.asked).toEqual([]);
    expect(sent(net, 31126)).toEqual([]);
    // Nothing asks again by itself (the page's own extension check carries the request)
    await flush(60_000);
    expect(noSigner).toEqual(['explicit']);
    // Confirmed (the person approved the extension's prompt): the page's deferred Call here moves it, one move
    ready = true;
    expect(await host.callHere()).toBe('moved');
    await flush(ARRIVAL);
    expect(sign.asked).toEqual([31126]);
    expect(host.here()).toBe(true);
  });

  it('Call here without a confirmed account asks to reconnect (explicit), signs nothing; once ready it moves once', async () => {
    let ready = false;
    const { sign, noSigner, host } = setup({ signerReady: () => ready, shown: 'absent' });
    await flush(2_000);
    expect(await host.callHere()).toBeNull();
    expect(noSigner).toEqual(['explicit', 'explicit']);
    expect(sign.asked).toEqual([]);
    ready = true;
    expect(await host.callHere()).toBe('moved');
    await flush(ARRIVAL);
    expect(sign.asked).toEqual([31126]);
  });

  it('nothing is asked while the Blobbi is here or its place is not known yet (no reconnect word on load)', async () => {
    const net = network();
    moveElsewhere(net, WORLD_PIXEL, Date.now() - 60_000);
    const { p, noSigner, sign } = setup({ net, signerReady: () => false });
    await flush(2_000);
    await presses(p, 3, 500);
    expect(noSigner).toEqual([]);
    expect(sign.asked).toEqual([]);
  });

  it('the page wires it: signer readiness, a reconnect that never signs, and the deferred Call here and choice', () => {
    const main = readFileSync('src/playground/main.ts', 'utf8');
    expect(main).toMatch(/signerReady,\s*\n\s*onNoSigner: \(kind\) => askSignerAgain\(kind\)/);
    expect(main).toMatch(/void account\.verifyExtension\(SIGNER_CHECK_MS\)/);
    expect(main).toMatch(/if \(w\.call\) void worldTravel\?\.callHere\(\)/);
    expect(main).not.toMatch(/void companion\.chosen\(\);\n\s*\}\,\n\s*\}\);\n\s*case 'bring'/); // the keep path shares through shareChoice
    expect(main.match(/shareChoice\(\)/g)!.length).toBeGreaterThanOrEqual(3);
  });
});
