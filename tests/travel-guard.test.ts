/**
 * P1.2B, WORLD TRAVEL FOR LOGGED-IN PLAYERS: a guest's WORLDS button shows a lock and its menu never opens (the
 * button, the Y key, any caller); a VISIT is refused by the menu, by the host and by the departure itself; a trip
 * under way is cancelled when the player logs out before the page leaves; logging in unlocks at once.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { LiveWorld } from '../src/sim/live-world';
import { memoryStore } from '../src/game/persistence';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { GameUI } from '../src/ui/game-ui';
import { TravelScreen, type TravelHooks } from '../src/ui/screens/travel';
import { paletteFor } from '../src/world/generate';
import { PixelBuffer } from '../src/core/pixel';
import { blobbiWorlds, type BlobbiWorld } from '../src/game/blobbi-worlds';
import { createDeparture, type DepartureState } from '../src/game/travel-departure';
import { WorldIcons } from '../src/ui/world-icons';

const LOCKED = 'Log in to explore other worlds.';

/** A game UI with the World Travel menu, and a login the test switches. */
function setup(o: { loggedIn?: boolean; touch?: boolean } = {}) {
  const l = new LiveWorld(generateWhaleWorld('island-travel-1', { carrierSeed: 'w', generatedHouse: false }), 'blobbi-9', 16, { store: memoryStore() });
  l.brain.enabled = false;
  const ui = new GameUI(() => l, () => paletteFor('cozy'));
  const screen = new TravelScreen();
  ui.register(screen);
  ui.touchMode = !!o.touch;
  let loggedIn = !!o.loggedIn;
  const notices: string[] = [];
  const gone: BlobbiWorld[] = [];
  const icons = new WorldIcons(() => Promise.reject(new Error('no page')));
  // As the playground does: one rule (the account), asked by the menu bar, the screen and the host's VISIT.
  const locked = () => !loggedIn;
  ui.locked = (id) => (id === 'travel' && locked() ? LOCKED : null);
  ui.onLocked = (_id, why) => void notices.push(why);
  const go = vi.fn((w: BlobbiWorld): ReturnType<TravelHooks['go']> => {
    if (locked()) return 'locked';
    gone.push(w);
    return 'started';
  });
  screen.hooks = { worlds: () => blobbiWorlds(), name: () => 'Dotado', companion: () => 'stays', go, departing: () => false, icon: (w, size) => icons.get(w.icon, size), locked };
  const render = () => ui.render(new PixelBuffer(1280, 720), 0);
  const menuW = () => (ui as unknown as { menuBox: { w: number } }).menuBox.w;
  const hits = () => (ui as unknown as { hits: { x: number; y: number; w: number; h: number; action: () => void }[] }).hits;
  return { ui, screen, notices, gone, go, render, hits, menuW, login: (v: boolean) => (loggedIn = v) };
}

describe('P1.2B: the WORLDS button and menu', () => {
  it('a guest: the button is drawn with a lock (wider), and no press on the bar opens World Travel', () => {
    const guest = setup();
    guest.render();
    const lockedW = guest.menuW();
    const member = setup({ loggedIn: true });
    member.render();
    expect(lockedW).toBeGreaterThan(member.menuW());
    // Every button on the bar: none opens World Travel for a guest; the WORLDS one says why.
    for (const h of guest.hits()) {
      h.action();
      expect(guest.ui.openId).not.toBe('travel');
      guest.ui.close();
    }
    expect(guest.notices).toContain(LOCKED);
  });

  it('a guest: Y (and any caller) leaves it shut, the key is still taken by the UI, a short notice says why', () => {
    const { ui, notices } = setup();
    expect(ui.handleKey('KeyY')).toBe(true);
    expect(ui.openId).toBe(null);
    expect(ui.open('travel')).toBe(false);
    expect(ui.openId).toBe(null);
    expect(notices).toEqual([LOCKED, LOCKED]);
  });

  it('only World Travel is locked: a guest keeps every other menu, the islands in this browser and settings', () => {
    const { ui } = setup();
    for (const id of ['inventory', 'crafting', 'journal', 'care', 'map', 'home', 'guide', 'settings', 'worlds', 'identity'] as const) expect(ui.locked!(id)).toBe(null);
  });

  it('a logged-in player opens the menu and travels as before', () => {
    const { ui, gone, notices } = setup({ loggedIn: true });
    expect(ui.handleKey('KeyY')).toBe(true);
    expect(ui.openId).toBe('travel');
    ui.render(new PixelBuffer(1280, 720), 0);
    ui.handleKey('Enter');
    expect(gone.map((w) => w.id)).toEqual(['home']);
    expect(notices).toEqual([]);
  });

  it('logging in unlocks the button without a reload', () => {
    const s = setup();
    s.render();
    const before = s.menuW();
    s.login(true);
    s.render();
    expect(s.menuW()).toBeLessThan(before);
    expect(s.ui.handleKey('KeyY')).toBe(true);
    expect(s.ui.openId).toBe('travel');
  });

  it('a guest cannot pick a destination: the menu, if open when the player logged out, shows none and VISIT closes it', () => {
    const s = setup({ loggedIn: true });
    s.ui.open('travel');
    s.render();
    const visits = s.hits().length;
    s.login(false);
    s.render();
    // No cards, no VISIT, no islands button: only the panel's own (close) hits are left.
    expect(s.hits().length).toBeLessThan(visits);
    s.ui.handleKey('Enter');
    expect(s.go).not.toHaveBeenCalled();
    expect(s.gone).toEqual([]);
    expect(s.ui.openId).toBe(null);
  });

  it('a host that refuses a VISIT (locked) closes the menu without starting anything', () => {
    const s = setup({ loggedIn: true });
    s.ui.open('travel');
    s.render();
    // The screen's own check passes (still logged in) but the host refuses: logged out in between.
    s.screen.hooks!.locked = () => false;
    s.login(false);
    s.ui.handleKey('Enter');
    expect(s.go).toHaveBeenCalledTimes(1);
    expect(s.gone).toEqual([]);
    expect(s.ui.openId).toBe(null);
  });
});

describe('P1.2B: the departure itself', () => {
  const world = blobbiWorlds()[0];
  function trip(o: { allowed: () => boolean; depart?: () => Promise<'moved'> | null }) {
    let now = 0;
    const navigated: string[] = [];
    const states: DepartureState[] = [];
    let saved = 0;
    let left = 0;
    let cameBack = 0;
    let gone = false;
    const dep = createDeparture({
      depart: o.depart ?? (() => null),
      leave: () => (left++, true),
      gone: () => gone,
      comeBack: () => void cameBack++,
      save: () => void saved++,
      navigate: (url) => void navigated.push(url),
      onChange: (st) => void states.push(st),
      allowed: o.allowed,
      now: () => now,
      setTimer: () => 0,
      clearTimer: () => {},
    });
    return { dep, navigated, states, counts: () => ({ saved, left, cameBack }), finish: () => ((gone = true), (now += 10)) };
  }

  it('a guest never starts a trip: nothing saved, no teleport, no move, no page change', () => {
    const depart = vi.fn(() => null);
    const t = trip({ allowed: () => false, depart });
    expect(t.dep.go(world)).toBe('locked');
    t.dep.update();
    expect(t.counts()).toEqual({ saved: 0, left: 0, cameBack: 0 });
    expect(depart).not.toHaveBeenCalled();
    expect(t.navigated).toEqual([]);
    expect(t.dep.state().phase).toBe('idle');
  });

  it('a logged-in player travels as before', () => {
    const t = trip({ allowed: () => true });
    expect(t.dep.go(world)).toBe('started');
    t.finish();
    t.dep.update();
    expect(t.navigated).toEqual([world.url]);
  });

  it('logging out while the trip is under way cancels it before the page leaves; the Blobbi comes back', async () => {
    let allowed = true;
    let settle: (v: 'moved') => void = () => {};
    const t = trip({ allowed: () => allowed, depart: () => new Promise((r) => (settle = r)) });
    expect(t.dep.go(world)).toBe('started');
    allowed = false;
    settle('moved');
    await Promise.resolve();
    t.finish();
    t.dep.update();
    expect(t.navigated).toEqual([]);
    expect(t.dep.state().phase).toBe('cancelled');
    expect(t.counts().cameBack).toBe(1);
    // A late answer of the cancelled trip changes nothing; reset makes it ready again.
    t.dep.reset();
    expect(t.dep.state().phase).toBe('idle');
  });

  it('cancel() (the account changed) stops a trip at once, and never after the page was asked to leave', () => {
    const t = trip({ allowed: () => true });
    t.dep.go(world);
    t.dep.cancel();
    expect(t.dep.state().phase).toBe('cancelled');
    t.finish();
    t.dep.update();
    expect(t.navigated).toEqual([]);
    t.dep.reset();
    const u = trip({ allowed: () => true });
    u.dep.go(world);
    u.finish();
    u.dep.update();
    u.dep.cancel();
    expect(u.navigated).toEqual([world.url]);
    expect(u.dep.state().phase).toBe('leaving');
    expect(u.counts().cameBack).toBe(0);
  });
});

describe('P1.2B: the playground wiring', () => {
  const main = readFileSync(new URL('../src/playground/main.ts', import.meta.url), 'utf8');
  it('one rule, the account: a connected Nostr account travels; a guest (an unregistered local identity) never', () => {
    expect(main).toMatch(/const travelLocked = \(\): boolean => account\.snapshot\(\)\.status !== 'connected';/);
  });
  it('is asked by the menu bar, the menu, the host VISIT and the departure', () => {
    expect(main).toMatch(/gameUI\.locked = \(id\) => \(id === 'travel' && travelLocked\(\)/);
    expect(main).toMatch(/locked: travelLocked,/);
    expect(main).toMatch(/go: \(world: BlobbiWorld\) => \{\s*if \(travelLocked\(\)\)/);
    expect(main).toMatch(/allowed: \(\) => !travelLocked\(\)/);
  });
  it('a guest still manages islands: MAIN MENU (the title: the islands, a new adventure) never asks for an account', () => {
    expect(main).toMatch(/settingsScreen\.mainMenuAvailable = \(\) => !!live && !title\.active && !intro;/);
  });
  it('a logout closes an open menu and cancels a trip not yet gone', () => {
    expect(main).toMatch(/account\.onChange\(\(\) => \{\s*if \(!travelLocked\(\)\) return;\s*if \(gameUI\.openId === 'travel'\) gameUI\.close\(\);\s*departure\.cancel\(\);/);
  });
});
