import { describe, expect, it } from 'vitest';
import { createPresenceHost, type PresenceHostDeps } from '../src/game/presence-host';
import { memoryLeaseStore, type ShownBlobbi } from '../src/game/presence-page';
import { HOME_APP, LEASE_MS, MIN_STAY_MS, PIXEL_APP, VISIBLE_GRACE_MS } from '../src/game/world-presence';

const PUBKEY = 'b'.repeat(64);
const TRUSTED = new WeakSet<Event>();

/** One clock, one timer queue, one window and document, one Blobbi on screen whose journeys take 2 s. */
function rig() {
  let t = 1_800_000_000_000;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | null = null;
      for (const e of timers) if (e[1].at <= end && (!next || e[1].at < next[1].at)) next = e;
      if (!next) break;
      timers.delete(next[0]);
      t = Math.max(t, next[1].at);
      next[1].fn();
    }
    t = end;
  };
  const setTimer = (fn: () => void, ms: number) => {
    const id = ++seq;
    timers.set(id, { at: t + ms, fn });
    return id;
  };
  const clearTimer = (h: unknown) => void timers.delete(h as number);
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState, hasFocus: () => true });
  let state: ReturnType<ShownBlobbi['state']> = 'present';
  const journeys: string[] = [];
  const blobbi: ShownBlobbi = {
    state: () => state,
    enter() {
      if (state === 'present' || state === 'arriving') return;
      state = 'arriving';
      journeys.push('enter');
      setTimer(() => void (state === 'arriving' && (state = 'present')), 2000);
    },
    leave() {
      if (state === 'absent' || state === 'departing') return;
      state = 'departing';
      journeys.push('leave');
      setTimer(() => void (state === 'departing' && (state = 'absent')), 2000);
    },
  };
  const store = memoryLeaseStore();
  const flags = { account: PUBKEY as string | null, busy: false, paused: false, inWorld: true };
  const notes: string[] = [];
  const deps: PresenceHostDeps = {
    account: () => flags.account,
    blobbi: () => (flags.inWorld ? blobbi : null),
    busy: () => flags.busy,
    paused: () => flags.paused,
    onJourney: (kind, place) => notes.push(`${kind}:${place}`),
    store: () => store,
    page: { tab: 'pixeltab', doc: doc as unknown as Document, win: win as unknown as Window, now: () => t, setTimer, clearTimer, trusted: (e) => TRUSTED.has(e) },
    sync: { now: () => t, setTimer, clearTimer },
  };
  const press = () => {
    const e = new Event('keydown');
    TRUSTED.add(e);
    win.dispatchEvent(e);
  };
  /** The Blobbi home takes it, as its page would. */
  const homeTakes = () => {
    store.lease = { app: HOME_APP, tab: 'hometab', at: t, exp: t + LEASE_MS };
  };
  return { host: createPresenceHost(deps), flags, store, press, homeTakes, advance, journeys, notes, now: () => t, get state() { return state; } };
}

describe('world presence in Pixel (the host)', () => {
  it('signed out, or a guest or local Blobbi walking: no presence at all, nothing written', () => {
    const r = rig();
    r.flags.account = null;
    r.host.update();
    r.press();
    r.advance(60_000);
    expect(r.store.lease).toBeNull();
    expect(r.host.here()).toBe(true);
    expect(r.host.place()).toBeNull();
  });

  it('a key pressed in Pixel claims the Blobbi for Pixel; the account\'s presence starts with update()', () => {
    const r = rig();
    r.host.update();
    expect(r.host.place()).toBe(HOME_APP);
    r.press();
    expect(r.store.lease?.app).toBe(PIXEL_APP);
    expect(r.host.here()).toBe(true);
  });

  it('the home taking it: Pixel plays its departure after the visible grace, and says where it went', () => {
    const r = rig();
    r.host.update();
    r.press();
    r.advance(MIN_STAY_MS + 1_000);
    r.homeTakes();
    r.advance(1_000 + VISIBLE_GRACE_MS);
    expect(r.journeys).toEqual(['leave']);
    expect(r.notes).toEqual([`leave:${HOME_APP}`]);
    r.advance(3_000);
    expect(r.state).toBe('absent');
  });

  it('never interrupts the game: a departure waits while it is busy, and while it drives the teleport itself', () => {
    const r = rig();
    r.host.update();
    r.press();
    r.advance(MIN_STAY_MS + 1_000);
    r.flags.busy = true;
    r.homeTakes();
    r.advance(10_000);
    expect(r.journeys).toEqual([]);
    r.flags.busy = false;
    r.flags.paused = true;
    r.advance(10_000);
    expect(r.journeys).toEqual([]);
    r.flags.paused = false;
    r.advance(400);
    expect(r.journeys).toEqual(['leave']);
  });

  it('a key pressed while it is away calls it back: the lease is Pixel\'s and the arrival plays', () => {
    const r = rig();
    r.host.update();
    r.press();
    r.advance(MIN_STAY_MS + 1_000);
    r.homeTakes();
    r.advance(6_000);
    expect(r.state).toBe('absent');
    r.press();
    expect(r.store.lease?.app).toBe(PIXEL_APP);
    expect(r.journeys).toEqual(['leave', 'enter']);
    expect(r.notes.at(-1)).toBe(`enter:${PIXEL_APP}`);
  });

  it('a change of account stops the old page: its keys no longer write for anyone', () => {
    const r = rig();
    r.host.update();
    r.flags.account = null;
    r.host.update();
    r.press();
    expect(r.store.lease).toBeNull();
    r.host.dispose();
  });
});
