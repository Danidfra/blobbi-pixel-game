/**
 * Leaving for another Blobbi world from the World Travel menu (src/game/travel-departure.ts): the move is started at
 * the door (the shared `departTo`: signed and published here); the page goes to the plain address once the departure
 * has played and the move is settled; a refusal, a timeout or unreachable relays still go (the destination asks
 * again when it opens); one trip at a time; a page that stays after navigating is a failed trip and the Blobbi comes
 * back. Plus the registry of worlds (src/game/blobbi-worlds.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import { WORLD_HOME, WORLD_PIXEL } from '@blobbi-kit/core';
import { DEPARTURE_FAIL_MS, DEPARTURE_MAX_WAIT_MS, createDeparture, type DepartureDeps, type DepartureState } from '../src/game/travel-departure';
import type { DepartureOutcome } from '../src/game/world-travel-departure';
import { WORLD_ISLAND, blobbiWorlds, isTravelUrl, worldByTravelId, worldUrlEnvName, worldUrlOverrides } from '../src/game/blobbi-worlds';

/** A pretend page and teleport, with a fake clock. */
function harness(o: { depart?: DepartureDeps['depart']; present?: boolean } = {}) {
  let now = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let ids = 0;
  let presence: 'present' | 'departing' | 'absent' = o.present === false ? 'absent' : 'present';
  const navigated: string[] = [];
  const states: DepartureState[] = [];
  let saved = 0;
  let cameBack = 0;
  const dep = createDeparture({
    depart: o.depart ?? (() => null),
    leave: () => {
      if (presence !== 'present') return false;
      presence = 'departing';
      return true;
    },
    gone: () => presence === 'absent',
    comeBack: () => {
      cameBack++;
      presence = 'present';
    },
    save: () => void saved++,
    navigate: (url) => void navigated.push(url),
    onChange: (st) => void states.push(st),
    now: () => now,
    setTimer: (fn, ms) => {
      const id = ++ids;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimer: (h) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  const tick = async (ms: number) => {
    now += ms;
    // Enough microtask turns for a signature's chain (signHandoff awaits several times)
    for (let i = 0; i < 25; i++) await Promise.resolve();
    for (const t of [...timers].filter((t) => t.at <= now)) {
      timers.splice(timers.indexOf(t), 1);
      t.fn();
    }
    dep.update();
  };
  return { dep, tick, navigated, states, get presence() { return presence; }, set presence(p) { presence = p; }, get saved() { return saved; }, get cameBack() { return cameBack; } };
}
const island = () => blobbiWorlds().find((w) => w.id === 'island')!;
const home = () => blobbiWorlds().find((w) => w.id === 'home')!;

describe('the worlds a trip can go to', () => {
  it('lists Blobbi Home and Blobbi Island, each with its World Travel id, a checked https address and an icon on this origin', () => {
    expect(blobbiWorlds().map((w) => [w.id, w.travelId, w.url, w.icon])).toEqual([
      ['home', WORLD_HOME, 'https://blobbi.pet/', '/icons/worlds/blobbi-home.png'],
      ['island', WORLD_ISLAND, 'https://island.blobbi.pet/', '/icons/worlds/blobbi-island.png'],
    ]);
    for (const w of blobbiWorlds()) expect(isTravelUrl(w.url), w.url).toBe(true);
    expect(worldByTravelId(WORLD_ISLAND)?.id).toBe('island');
    expect(worldByTravelId(WORLD_PIXEL)).toBeUndefined();
  });

  it('a travel address is https (or http on this machine) with nothing carried in it', () => {
    expect(isTravelUrl('https://island.blobbi.pet/')).toBe(true);
    expect(isTravelUrl('http://localhost:5173/')).toBe(true);
    expect(isTravelUrl('http://127.0.0.1:8080/')).toBe(true);
    for (const bad of [null, '', 'http://island.blobbi.pet/', 'https://u:p@island.blobbi.pet/', 'https://island.blobbi.pet/?x=1', 'https://island.blobbi.pet/#f', 'javascript:alert(1)', '/relative', 'wss://relay.ditto.pub']) {
      expect(isTravelUrl(bad), String(bad)).toBe(false);
    }
  });

  it('a build may point a world at a staging address; an override that is not a travel address is ignored', () => {
    expect(worldUrlEnvName('island')).toBe('VITE_BLOBBI_WORLD_URL_ISLAND');
    const o = worldUrlOverrides({ VITE_BLOBBI_WORLD_URL_ISLAND: ' http://localhost:5174/ ', VITE_BLOBBI_WORLD_URL_HOME: 'javascript:alert(1)', DEV: true });
    expect(o).toEqual({ island: 'http://localhost:5174/' });
    expect(blobbiWorlds(o).map((w) => w.url)).toEqual(['https://blobbi.pet/', 'http://localhost:5174/']);
  });
});

describe('leaving for another world', () => {
  it('saves, plays the departure, starts the move meanwhile, and goes to the plain address once both are over', async () => {
    const moved = vi.fn(async (_destination: string): Promise<DepartureOutcome> => 'moved');
    const h = harness({ depart: moved });
    expect(h.dep.go(island())).toBe('started');
    expect(h.saved).toBe(1);
    expect(h.presence).toBe('departing');
    expect(h.dep.state()).toMatchObject({ phase: 'leaving', move: 'moving', navigated: false });
    await h.tick(100);
    // Moved, but the Blobbi is still dissolving: the page stays
    expect(h.dep.state().move).toBe('moved');
    expect(h.navigated).toEqual([]);
    h.presence = 'absent';
    await h.tick(100);
    expect(h.navigated).toEqual(['https://island.blobbi.pet/']);
    expect(moved).toHaveBeenCalledTimes(1);
    expect(moved).toHaveBeenCalledWith(WORLD_ISLAND);
  });

  it('already there, declined, stale or unreachable: the trip still goes, to the same plain address, and the state says which', async () => {
    for (const outcome of ['already-there', 'declined', 'stale', 'unreachable', 'read-only', 'wrong-account'] as const) {
      const h = harness({ depart: () => Promise.resolve(outcome) });
      h.dep.go(home());
      h.presence = 'absent';
      await h.tick(50);
      expect(h.dep.state().move).toBe(outcome);
      expect(h.navigated).toEqual(['https://blobbi.pet/']);
    }
  });

  it('a move that throws is unreachable, and the trip still goes', async () => {
    const h = harness({ depart: () => Promise.reject(new Error('no')) });
    h.dep.go(home());
    h.presence = 'absent';
    await h.tick(50);
    expect(h.dep.state().move).toBe('unreachable');
    expect(h.navigated).toEqual(['https://blobbi.pet/']);
  });

  it('the page waits for the move to settle (a signer prompt open), the departure long played', async () => {
    let settle: ((o: DepartureOutcome) => void) | null = null;
    const h = harness({ depart: () => new Promise<DepartureOutcome>((r) => (settle = r)) });
    h.dep.go(island());
    h.presence = 'absent';
    await h.tick(DEPARTURE_MAX_WAIT_MS + 1_000);
    expect(h.navigated).toEqual([]);
    settle!('moved');
    await h.tick(1);
    expect(h.navigated).toEqual(['https://island.blobbi.pet/']);
  });

  it('with no move to be made (no account, travel off, the place not confirmed) the trip goes as soon as the departure played', async () => {
    const h = harness();
    h.dep.go(island());
    expect(h.dep.state().move).toBe('none');
    await h.tick(10);
    expect(h.navigated).toEqual([]);
    h.presence = 'absent';
    await h.tick(10);
    expect(h.navigated).toEqual(['https://island.blobbi.pet/']);
  });

  it('with nothing to play (the Blobbi is absent) the trip goes at once', async () => {
    const h = harness({ present: false });
    h.dep.go(island());
    await h.tick(1);
    expect(h.navigated).toEqual(['https://island.blobbi.pet/']);
  });

  it('a departure that never ends (a paused game) holds the trip only so long', async () => {
    const h = harness();
    h.dep.go(island());
    await h.tick(DEPARTURE_MAX_WAIT_MS - 1);
    expect(h.navigated).toEqual([]);
    await h.tick(2);
    expect(h.navigated).toHaveLength(1);
  });

  it('one trip at a time: a second press while leaving does nothing, starts no second move and never navigates twice', async () => {
    const moved = vi.fn(async (): Promise<DepartureOutcome> => 'moved');
    const h = harness({ depart: moved });
    expect(h.dep.go(island())).toBe('started');
    expect(h.dep.go(home())).toBe('busy');
    expect(h.dep.go(island())).toBe('busy');
    h.presence = 'absent';
    await h.tick(10);
    h.dep.update();
    h.dep.update();
    expect(moved).toHaveBeenCalledTimes(1);
    expect(h.navigated).toHaveLength(1);
    expect(h.saved).toBe(1);
    // Still leaving (the page is going): another press is still refused
    expect(h.dep.go(home())).toBe('busy');
  });

  it('a page still here after navigating is a failed trip: the Blobbi comes back, and a new trip may start', async () => {
    const h = harness();
    h.dep.go(island());
    h.presence = 'absent';
    await h.tick(10);
    expect(h.navigated).toHaveLength(1);
    await h.tick(DEPARTURE_FAIL_MS);
    expect(h.dep.state().phase).toBe('failed');
    expect(h.cameBack).toBe(1);
    h.dep.reset();
    expect(h.dep.state()).toMatchObject({ phase: 'idle', world: null, move: 'none' });
    expect(h.dep.go(home())).toBe('started');
  });

  it('a page that is leaving (pagehide) drops the failure timer: nothing calls the Blobbi back', async () => {
    const h = harness();
    h.dep.go(island());
    h.presence = 'absent';
    await h.tick(10);
    h.dep.left();
    await h.tick(DEPARTURE_FAIL_MS + 1);
    expect(h.dep.state().phase).toBe('leaving');
    expect(h.cameBack).toBe(0);
  });
});
