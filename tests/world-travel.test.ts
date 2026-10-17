/**
 * M16, world travel in Blobbi Pixel: the travel host (src/game/travel-host.ts) over the kit's real session, with
 * real keys and signatures, several in-memory relays, and a pretend page (trusted and untrusted inputs, visibility).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent, type NostrEvent } from 'nostr-tools/pure';
import { WORLD_HOME, WORLD_PIXEL, buildWorldLocationTemplate, createWorldTravel, parseWorldLocation, type ShownBlobbi, type ShownState, type TravelOutcome, type WorldTravelRelays, type WorldTravelSigner, type WorldTravelSnapshot } from '@blobbi-kit/core';
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
}
function setup(o: Setup = {}) {
  const net = o.net ?? network();
  const sign = o.sign ?? signer('silent');
  const p = page();
  const w = walker(o.shown);
  const state = { busy: false, paused: false, playing: true };
  const outcomes: TravelOutcome[] = [];
  const counted: number[] = [];
  const journeys: string[] = [];
  // As the playground's guarded localStorage (the kit keeps a signed move there for its resend)
  const kept = o.store ?? new Map<string, string>();
  const store = { get: (k: string) => kept.get(k) ?? null, set: (k: string, v: string) => void kept.set(k, v), remove: (k: string) => void kept.delete(k) };
  const host = createTravelHost({
    account: o.account ?? (() => ({ owner: OWNER, d: D })),
    session: (owner, d, hooks) => ({
      session: createWorldTravel({ owner, d, world: WORLD_PIXEL, relays: net.port(), verify: verifyEvent as never, signer: () => sign, store, presenceEnabled: o.presence, isActive: hooks.isActive, arrivalLeadMs: o.lead }),
    }),
    blobbi: () => w.b,
    busy: () => state.busy,
    paused: () => state.paused,
    playing: () => state.playing,
    onJourney: (k, place) => journeys.push(`${k}:${place}`),
    onOutcome: (out: TravelOutcome, _s: WorldTravelSnapshot) => outcomes.push(out),
    onCounted: (snap) => counted.push(snap.follow.count),
    doc: p.doc,
    win: p.win,
  });
  host.update();
  hosts.push(host);
  return { net, sign, p, w, state, host, outcomes, journeys, counted, kept };
}
let hosts: ReturnType<typeof createTravelHost>[] = [];
const flush = (ms = 20) => vi.advanceTimersByTimeAsync(ms);
/** The kit's gesture gap is 1 s: presses further apart than that are distinct interactions. */
const GAP = 1_100;
/** `n` distinct interactions (presses `GAP` apart), the last one followed by a short wait. */
async function interactions(p: ReturnType<typeof page>, n: number, after = 20) {
  for (let i = 0; i < n; i++) {
    p.press();
    await flush(i < n - 1 ? GAP : after);
  }
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

describe('world travel in Pixel: three interactions call it over (M16.1)', () => {
  it('the first and second interactions move nothing; the third publishes exactly one World Location', async () => {
    const { p, w, net, sign, host, outcomes, counted } = setup();
    await flush();
    await interactions(p, 2, GAP);
    expect(sign.asked).toEqual([]);
    expect(outcomes).toEqual([]);
    expect(counted).toEqual([1, 2]);
    expect(host.snapshot()!.follow).toMatchObject({ count: 2, needed: 3, suspended: false });
    p.press();
    await flush(ARRIVAL);
    expect(outcomes).toEqual(['moved']);
    const moves = sent(net, 31126);
    expect(moves).toHaveLength(1);
    expect(parseWorldLocation(moves[0], { verify: verifyEvent as never })).toMatchObject({ world: WORLD_PIXEL, from: WORLD_HOME });
    expect(host.here()).toBe(true);
    expect(w.log).toEqual(['settle-absent', 'enter']);
    // Here: more interactions publish nothing, and the count is over
    await interactions(p, 6, 10_000);
    expect(sent(net, 31126)).toHaveLength(1);
    expect(sign.asked).toEqual([31126]);
    expect(host.snapshot()!.follow.count).toBe(0);
  });

  it('the window rolls: two interactions, then a pause of more than 20 s, start the count over', async () => {
    const { p, sign, host } = setup();
    await flush();
    await interactions(p, 2);
    await flush(21_000);
    expect(host.snapshot()!.follow.count).toBe(0);
    await interactions(p, 2, GAP);
    expect(host.snapshot()!.follow.count).toBe(2);
    expect(sign.asked).toEqual([]);
    p.press();
    await flush();
    expect(sign.asked).toEqual([31126]);
  });

  it('Call {name} here (Settings > Account) is explicit and immediate: no interaction needed', async () => {
    const { sign, host, net } = setup();
    await flush();
    expect(await host.callHere()).toBe('moved');
    expect(sign.asked).toEqual([31126]);
    expect(sent(net, 31126)).toHaveLength(1);
  });

  it('a held key’s auto-repeat is never counted: walking with a held key for half a minute moves nothing', async () => {
    const { p, sign, host } = setup();
    await flush();
    p.key(false); // the key going down: one interaction
    for (let i = 0; i < 900; i++) {
      p.key(true); // the browser's repeats, ~30 a second
      host.update(); // and the frames
      await flush(33);
    }
    expect(host.snapshot()!.follow.count).toBeLessThanOrEqual(1);
    expect(sign.asked).toEqual([]);
  });

  it('continuous movement by fast taps is one gesture per second: no instant transfer', async () => {
    const { p, sign, host } = setup();
    await flush();
    // Tapping an arrow key five times a second for 1.5 s: at most two distinct interactions
    for (let i = 0; i < 8; i++) {
      p.key(false);
      host.update();
      await flush(200);
    }
    expect(host.snapshot()!.follow.count).toBeLessThanOrEqual(2);
    expect(sign.asked).toEqual([]);
  });

  it('never counts a script’s event, a hidden page, focus, visibility, frames, or presses before play started', async () => {
    const { p, sign, state, host } = setup();
    await flush();
    for (let i = 0; i < 5; i++) {
      p.press(false);
      p.key(false, false);
      await flush(GAP);
    }
    p.visibility = 'hidden';
    await interactions(p, 3);
    p.visibility = 'visible';
    state.playing = false;
    await interactions(p, 3);
    state.playing = true;
    for (let i = 0; i < 5; i++) {
      p.fire('focus');
      p.hide();
      p.show();
      for (let f = 0; f < 60; f++) host.update();
      await flush(GAP);
    }
    // A press long before play began does not count either (only the press that began it does)
    await flush(10_000);
    expect(host.snapshot()!.follow.count).toBe(0);
    expect(sign.asked).toEqual([]);
  });

  it('the press that starts play (NEW ADVENTURE, CONTINUE) counts as ONE interaction, never a move by itself', async () => {
    const { p, sign, state, host, net } = setup();
    state.playing = false;
    host.update();
    await flush();
    p.press(); // the title's ENTER, before play
    state.playing = true;
    state.paused = true; // the intro cinematic brings the Blobbi in itself
    host.update();
    await flush();
    for (let f = 0; f < 120; f++) host.update(); // the frames after
    expect(host.snapshot()!.follow.count).toBe(1);
    expect(sign.asked).toEqual([]);
    state.paused = false;
    await flush(GAP);
    await interactions(p, 2);
    expect(sign.asked).toEqual([31126]);
    expect(sent(net, 31126)).toHaveLength(1);
  });

  it('the press that starts play on a fresh device is counted once the place is known, not lost to the first look', async () => {
    const net = network();
    for (const r of net.relays) r.delayMs = 3_000;
    const { p, sign, state, host } = setup({ net });
    state.playing = false;
    host.update();
    p.press();
    state.playing = true;
    host.update();
    expect(host.snapshot()!.resolution).toBe('pending');
    await flush(3_100);
    host.update();
    await flush();
    expect(host.snapshot()!.resolution).toBe('confirmed');
    expect(host.snapshot()!.follow.count).toBe(1);
    for (let f = 0; f < 60; f++) host.update();
    expect(host.snapshot()!.follow.count).toBe(1);
    expect(sign.asked).toEqual([]);
  });

  it('play starting with no press (a startup straight into an island) never counts, nor a press long before', async () => {
    const { p, sign, state, host } = setup();
    state.playing = false;
    host.update();
    await flush(60_000);
    state.playing = true;
    host.update();
    await flush(10_000);
    expect(host.snapshot()!.follow.count).toBe(0);
    state.playing = false;
    host.update();
    p.press();
    await flush(5_000);
    state.playing = true;
    host.update();
    await flush(10_000);
    expect(host.snapshot()!.follow.count).toBe(0);
    expect(sign.asked).toEqual([]);
  });

  it('presses while the game drives the teleport (an intro, a visit) are activity only; after it, three call it over', async () => {
    const { p, sign, state, host } = setup();
    await flush();
    state.paused = true;
    await interactions(p, 4);
    expect(host.snapshot()!.follow.count).toBe(0);
    expect(sign.asked).toEqual([]);
    state.paused = false;
    await interactions(p, 3);
    expect(sign.asked).toEqual([31126]);
  });

  it('the extension refusing: nothing sent, casual following suspended (more interactions ask nothing); Call here may, and resumes it', async () => {
    const s = signer('prompt', { refuse: true });
    const { p, net, outcomes, host } = setup({ sign: s });
    await flush();
    await interactions(p, 3);
    expect(outcomes).toEqual(['declined']);
    expect(host.snapshot()!.follow.suspended).toBe(true);
    await interactions(p, 12, 30_000);
    expect(s.asked).toHaveLength(1);
    expect(sent(net, 31126)).toEqual([]);
    s.refuse = false;
    expect(await host.callHere()).toBe('moved');
    expect(s.asked).toHaveLength(2);
    expect(host.snapshot()!.follow.suspended).toBe(false);
  });

  it('the vault signs silently: the third interaction brings it here', async () => {
    const s = signer('silent');
    const { p, host } = setup({ sign: s });
    await flush();
    await interactions(p, 3, ARRIVAL);
    expect(host.here()).toBe(true);
  });

  it('no relay accepting: the same signed move is resent once by itself, with no new signature', async () => {
    const net = network();
    const { p, sign, host, outcomes } = setup({ net });
    await flush();
    for (const r of net.relays) r.refuse = true;
    await interactions(p, 3);
    expect(outcomes).toEqual(['unreachable']);
    expect(host.here()).toBe(false);
    for (const r of net.relays) r.refuse = false;
    await flush(5_100 + ARRIVAL);
    expect(host.here()).toBe(true);
    expect(sign.asked).toEqual([31126]);
    expect(sent(net, 31126)).toHaveLength(1);
  });

  it('another Blobbi or another account starts the count over (a new session)', async () => {
    let who = { owner: OWNER, d: D };
    const { p, sign, host } = setup({ account: () => who });
    await flush();
    await interactions(p, 2);
    expect(host.snapshot()!.follow.count).toBe(2);
    who = { owner: OWNER, d: `${D}-other` };
    host.update();
    await flush();
    expect(host.snapshot()!.d).toBe(`${D}-other`);
    expect(host.snapshot()!.follow.count).toBe(0);
    p.press();
    await flush();
    expect(host.snapshot()!.follow.count).toBe(1);
    const other = getPublicKey(generateSecretKey());
    who = { owner: other, d: D };
    host.update();
    await flush();
    expect(host.snapshot()!.owner).toBe(other);
    expect(host.snapshot()!.follow.count).toBe(0);
    expect(sign.asked).toEqual([]);
  });

  it('anti ping-pong: three interactions here within moments of a move elsewhere are contended and sign nothing', async () => {
    const { p, net, sign, host, outcomes, w } = setup();
    await flush();
    await interactions(p, 3, ARRIVAL);
    expect(host.here()).toBe(true);
    moveElsewhere(net, WORLD_HOME, Date.now(), host.snapshot()!.location);
    // The player keeps playing here as it leaves: the third interaction lands within the kit's 5 s stay
    await interactions(p, 3);
    expect(outcomes).toEqual(['moved', 'contended']);
    await flush(3_000);
    expect(w.log.at(-1)).toBe('leave');
    expect(sign.asked).toEqual([31126]);
    expect(sent(net, 31126)).toHaveLength(1); // only ours (the move in Blobbi Home went to the relays directly)
  });

  it('the arrival lead (Pixel’s teleport, 1.9 s) overlaps the wait: the arrival starts at once with no departure window', async () => {
    const lead = setup({ lead: 1_900 });
    await flush();
    await interactions(lead.p, 3);
    expect(lead.outcomes).toEqual(['moved']);
    expect(lead.host.here()).toBe(true);
    // Without a lead, the kit's minimum (1.5 s from the act) holds the arrival back
    const none = setup();
    await flush();
    await interactions(none.p, 3);
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
    expect(travelCueFor({ absent: true, looking: true, view: 'looking', follow: null })).toEqual({ kind: 'looking' });
    await interactions(p, 3, 1_000);
    expect(host.snapshot()!.follow.count).toBe(0); // nothing counts while the place is not known
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
    expect(host.view()!.kind).toBe('away');
    expect(entryDecision({ unknown: placeUnknown({ candidate: true, view: host.view()!.kind }), here: host.here(), heldFor: 2_100 })).toBe('skip');
    state.paused = false;
    host.check();
    await flush(2_000);
    expect(w.log).toEqual([]); // it stays absent: no arrival, no departure, nothing to settle
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
    const first = setup({ net, store: kept });
    await flush();
    await interactions(first.p, 3, ARRIVAL);
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
    const first = setup({ net, store: kept });
    await flush();
    await interactions(first.p, 3, ARRIVAL);
    first.host.dispose();
    for (const r of net.relays) r.hang = true;
    const { host } = setup({ net, store: kept });
    await flush(4_100);
    expect(host.snapshot()!.resolution).toBe('unreachable');
    expect(host.view()).toEqual({ kind: 'here', unreachable: true });
  });
});

describe('world travel’s cues at the empty spot (M16.2)', () => {
  const follow = (count: number, suspended = false) => ({ count, needed: 3, suspended });
  it('looking, noticed, calling, or nothing; never while the Blobbi shows', () => {
    expect(travelCueFor({ absent: false, looking: true, view: 'looking', follow: null })).toBeNull();
    expect(travelCueFor({ absent: true, looking: true, view: null, follow: null })).toEqual({ kind: 'looking' });
    expect(travelCueFor({ absent: true, looking: false, view: 'coming', follow: follow(0) })).toEqual({ kind: 'calling' });
    expect(travelCueFor({ absent: true, looking: false, view: 'away', follow: follow(0) })).toBeNull();
    expect(travelCueFor({ absent: true, looking: false, view: 'away', follow: follow(2) })).toEqual({ kind: 'noticed', amount: 2 / 3 });
    expect(travelCueFor({ absent: true, looking: false, view: 'away', follow: follow(2, true) })).toBeNull();
    expect(travelCueFor({ absent: true, looking: false, view: 'here', follow: follow(0) })).toBeNull();
  });

  it('the motes are a pure function of time, small, and drawn in the teleport’s pixels', () => {
    expect(travelCueMotes('looking', 1.234, 16, 7)).toEqual(travelCueMotes('looking', 1.234, 16, 7));
    expect(travelCueMotes('looking', 0, 16, 7).length).toBeLessThanOrEqual(3);
    expect(travelCueMotes('noticed', 0, 16, 7, 1 / 3)).toHaveLength(1);
    expect(travelCueMotes('noticed', 0, 16, 7, 2 / 3)).toHaveLength(2);
    expect(travelCueMotes('calling', 0, 16, 7)).toHaveLength(8);
    expect(travelCueMotes('calling', 0, 16, 7, 1, true)).toHaveLength(4);
    for (const m of travelCueMotes('calling', 0.7, 16, 7)) expect(m.z).toBeLessThanOrEqual(16 * 1.3);
    const screen = new PixelBuffer(80, 80);
    const drawn = drawTravelCue(screen, 'calling', 0.4, 40, 60, 2, 16, 7);
    expect(drawn).toBeGreaterThan(0);
    expect([...screen.data].some((c) => c !== 0)).toBe(true);
  });
});

describe('world travel in Pixel: a move made elsewhere', () => {
  it('departs live, waits for the game’s moment (a timed action), and names where it went', async () => {
    const { p, w, net, state, journeys, host } = setup();
    await flush();
    await interactions(p, 3, 6_000);
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
    await interactions(p, 3, 6_000);
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
    await interactions(p, 3, 10 * 60_000);
    expect(sign.asked).toEqual([31126]);
  });

  it('on: a 21124 only while played here (a recent press), never while idle or after the Blobbi left', async () => {
    const net = network();
    const { p, sign, host } = setup({ net, presence: true });
    await flush(60_000);
    expect(sign.asked).toEqual([]); // not here yet: nothing for a World that does not hold the Blobbi
    await interactions(p, 3, ARRIVAL);
    expect(sign.asked).toEqual([31126, 21124]);
    await flush(10 * 60_000); // no press: idle after two minutes
    const afterIdle = sign.asked.filter((k) => k === 21124).length;
    expect(afterIdle).toBeLessThanOrEqual(3);
    moveElsewhere(net, WORLD_HOME, Date.now(), host.snapshot()!.location);
    await interactions(p, 3); // interactions away: a casual call back, contended right after the move (nothing signed)
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

  it('play’s entry no longer shows a Blobbi whose place is still loading; Pixel passes its teleport’s arrival lead', () => {
    const main = readFileSync('src/playground/main.ts', 'utf8');
    expect(main).not.toMatch(/status === 'loading' \|\| travelling\.here\) live\.enterBlobbi\(\)/);
    expect(main).toMatch(/const decision = entryDecision\(\{ unknown: travelPlaceUnknown\(\), here: worldTravel\?\.here\(\) \?\? true, heldFor: 0 \}\);\n\s+if \(decision === 'wait'\) entryHold = /);
    expect(main).toMatch(/arrivalLeadMs: Math\.round\(ARRIVE\.rebuildStart \* 1000/);
    // The held entry pauses the sync (nothing settled or replayed behind the game's back)
    expect(main).toMatch(/!!live\.swap \|\| !!entryHold;/);
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
