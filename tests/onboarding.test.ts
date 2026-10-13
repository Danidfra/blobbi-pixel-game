/**
 * M8 onboarding: the first-time flow on the title (welcome, Carrier choice, island name, one creation request), the
 * schema-10 save fields (name, intro, tutorial) and the intro cinematic on a real new island, including skip and a
 * reload during the intro.
 */
import { describe, expect, it } from 'vitest';
import { TitleScreen, CARRIER_CARDS, type TitleActions } from '../src/ui/title';
import { MAX_NAME, displayName, sanitizeIslandName, suggestIslandName } from '../src/game/island-name';
import { listWorlds, parseIdentity, worldName, type WorldEntry } from '../src/game/worlds';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer } from '../src/render/live-render';
import { ViewRenderer } from '../src/render/view-renderer';
import { IntroCinematic, type IntroResult } from '../src/cinematic/intro';
import { loadSave, memoryStore, saveKey, SAVE_VERSION } from '../src/game/persistence';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { PixelBuffer } from '../src/core/pixel';
import type { CarrierKind } from '../src/game/carrier';

function titleFor(saved: WorldEntry[] = [], extra: Partial<TitleActions> = {}) {
  const calls: string[] = [];
  const actions: TitleActions = {
    worlds: () => saved,
    current: () => ({ identity: '', name: '', saved: false }),
    continueGame: () => calls.push('continue'),
    openWorld: (w) => calls.push(`open ${w.identity}`),
    settings: () => calls.push('settings'),
    preview: () => new PixelBuffer(92, 56),
    ...extra,
  };
  return { t: new TitleScreen(actions), calls };
}

const newWorld = (kind: CarrierKind, seed = 'island-test-0001') =>
  kind === 'manta' ? generateMantaWorld(seed, { carrierSeed: 'manta-x', generatedHouse: false }) : kind === 'whale' ? generateWhaleWorld(seed, { carrierSeed: 'whale-x', generatedHouse: false }) : generateTurtleWorld(seed, { turtleSeed: 'turtle-x', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });

describe('the first-time flow on the title', () => {
  it('welcomes a player with no saved island and walks through Carrier and name to one creation', () => {
    const { t } = titleFor();
    expect(t.page).toBe('welcome');
    expect(t.firstTime).toBe(true);
    t.key('Enter');
    expect(t.page).toBe('carrier');
    expect(t.carrier).toBe(0);
    t.key('ArrowRight');
    expect(t.carrier).toBe(1);
    t.key('Escape');
    expect(t.page).toBe('welcome'); // back goes to the welcome, not a menu they never saw
    t.key('Enter');
    expect(t.carrier).toBe(1); // the choice is remembered
    t.key('ArrowLeft');
    t.key('ArrowLeft'); // wraps to the whale
    expect(CARRIER_CARDS[t.carrier].kind).toBe('whale');
    t.key('Enter');
    expect(t.page).toBe('name');
    for (const ch of 'Kelp Harbour') t.key(ch === ' ' ? 'Space' : `Key${ch.toUpperCase()}`, ch);
    expect(t.name).toBe('Kelp Harbour');
    t.key('Backspace');
    expect(t.name).toBe('Kelp Harbou');
    t.key('KeyR', 'r');
    t.key('Enter');
    expect(t.page).toBe('creating');
    expect(t.takeCreate()).toEqual({ kind: 'whale', name: 'Kelp Harbour', companion: 'new' }) // M11D.3: a first adventure meets a new Blobbi;
  });

  it('every Carrier can be chosen, with the mouse or a tap: one tap selects, a second goes on', () => {
    for (const [i, c] of CARRIER_CARDS.entries()) {
      const { t } = titleFor();
      t.key('Enter');
      const screen = new PixelBuffer(640, 360);
      t.render(screen, 0);
      // The three cards are the three large hit regions, left to right.
      const cards = t.regions.filter((h) => h.h > 150).sort((a, b) => a.x - b.x);
      expect(cards.length).toBe(3);
      t.pointer(cards[i].x + 5, cards[i].y + 5);
      expect(t.carrier).toBe(i);
      expect(t.page).toBe(i === 0 ? 'name' : 'carrier'); // the turtle was already selected: a tap on it goes on
      if (t.page === 'carrier') {
        t.render(screen, 0.1);
        const again = t.regions.filter((h) => h.h > 150).sort((a, b) => a.x - b.x)[i];
        t.pointer(again.x + 5, again.y + 5);
      }
      expect(t.page).toBe('name');
      expect(CARRIER_CARDS[t.carrier].kind).toBe(c.kind);
    }
  });

  it('every Carrier card has a personality line and a picture', () => {
    expect(CARRIER_CARDS.map((c) => c.kind)).toEqual(['turtle', 'manta', 'whale']);
    for (const c of CARRIER_CARDS) expect(c.mood.length).toBeGreaterThan(20);
    const seen: string[] = [];
    const { t } = titleFor([], { preview: (k) => (seen.push(k), new PixelBuffer(92, 56)) });
    t.key('Enter');
    t.render(new PixelBuffer(640, 360), 1);
    expect(new Set(seen)).toEqual(new Set(['turtle', 'manta', 'whale']));
  });

  it('the name is optional, kept to what the font can draw, with suggestions and a touch keyboard', () => {
    const asked: string[] = [];
    const { t } = titleFor([], { requestTextInput: (v) => asked.push(v) });
    t.key('Enter');
    t.key('Enter');
    expect(t.page).toBe('name');
    t.key('Space', ' '); // a leading space is ignored
    expect(t.name).toBe('');
    t.key('ArrowDown');
    t.key('Enter'); // SURPRISE ME
    expect(t.name).toBe(suggestIslandName(0));
    t.key('ArrowDown');
    t.key('Enter'); // TYPE A NAME: the host opens a keyboard
    expect(asked).toEqual([suggestIslandName(0)]);
    t.setName('Café <Moon> Island of the Very Long Name');
    expect(t.name.length).toBeLessThanOrEqual(MAX_NAME);
    expect(t.name).not.toMatch(/[<>é]/);
    t.key('ArrowUp');
    t.key('ArrowUp');
    t.key('Enter');
    expect(t.takeCreate()?.name).toBe(sanitizeIslandName(t.name));
  });

  it('a failed creation says why and goes back to the Carrier page', () => {
    const { t } = titleFor();
    t.key('Enter');
    t.key('Enter');
    t.key('Enter');
    expect(t.takeCreate()).not.toBeNull();
    t.createFailed('storage is full');
    expect(t.page).toBe('error');
    t.render(new PixelBuffer(640, 360), 0);
    t.key('Enter');
    expect(t.page).toBe('carrier');
  });

  it('a returning player gets CONTINUE and (M11D.3) NEW ADVENTURE, which asks first and keeps the island', () => {
    const w: WorldEntry = { identity: 'seed=a|kind=whale|carrier=c|1280x768|scale=1.6|palette=cozy|density=1|islands=1', params: parseIdentity('seed=a|kind=whale|carrier=c|1280x768|scale=1.6|palette=cozy|density=1|islands=1')!, name: 'Kelp Harbour', day: 2, quests: 3, buildings: 1, lastPlayed: 5 };
    const { t, calls } = titleFor([w], { allowNewIsland: true });
    expect(t.page).toBe('main');
    t.render(new PixelBuffer(640, 360), 0);
    t.key('Enter');
    expect(calls).toEqual(['continue']);
    t.key('ArrowDown');
    t.key('Enter'); // NEW ADVENTURE
    expect(t.page).toBe('newConfirm'); // "A new adventure?": the island keeps waiting, nothing is deleted
    t.key('ArrowDown');
    t.key('Enter'); // BACK TO MY ISLAND
    expect(t.page).toBe('main');
    t.key('ArrowDown');
    t.key('Enter');
    t.key('Enter'); // START A NEW ADVENTURE
    expect(t.page).toBe('carrier');
    t.key('Escape');
    expect(t.page).toBe('main');
  });
});

describe('island names', () => {
  it('sanitises, trims and caps', () => {
    expect(sanitizeIslandName('  Kelp   Harbour  ')).toBe('Kelp Harbour');
    expect(sanitizeIslandName('<b>x</b>')).toBe('bxb');
    expect(sanitizeIslandName(42)).toBe('');
    expect(sanitizeIslandName('a'.repeat(40)).length).toBe(MAX_NAME);
  });
  it('an empty name falls back to the generated one', () => {
    expect(displayName('', 'id')).toBe(worldName('id'));
    expect(displayName(null, 'id')).toBe(worldName('id'));
    expect(displayName('Kelp', 'id')).toBe('Kelp');
  });
});

describe('schema 10: name, intro and tutorial', () => {
  it('a new island keeps its name and a pending intro across a reload', () => {
    const store = memoryStore();
    const live = new LiveWorld(newWorld('whale'), 'blobbi-9', 16, { store });
    live.islandName = 'Kelp Harbour';
    live.intro = { state: 'pending', at: 0 };
    live.save();
    const raw = JSON.parse(store.get(saveKey(live.identity))!);
    expect(raw.version).toBe(SAVE_VERSION);
    expect(raw.name).toBe('Kelp Harbour');
    const again = new LiveWorld(newWorld('whale'), 'blobbi-9', 16, { store });
    expect(again.islandName).toBe('Kelp Harbour');
    expect(again.intro.state).toBe('pending');
    expect(again.tutorial).toEqual({ done: [], skipped: false });
    const keys = [...store.data.keys()];
    expect(listWorlds(keys, store.get)[0].name).toBe('Kelp Harbour');
  });

  it('a world from before (schema 9) loads as under way: no name, intro seen, tips off', () => {
    const store = memoryStore();
    const live = new LiveWorld(newWorld('turtle'), 'blobbi-9', 16, { store });
    live.save();
    const raw = JSON.parse(store.get(saveKey(live.identity))!);
    raw.version = 9;
    delete raw.name;
    delete raw.intro;
    delete raw.tutorial;
    store.set(saveKey(live.identity), JSON.stringify(raw));
    const loaded = loadSave(store, live.identity)!;
    expect(loaded.name).toBeNull();
    expect(loaded.intro.state).toBe('done');
    expect(loaded.tutorial.skipped).toBe(true);
  });

  it('malformed schema-10 fields are repaired one by one', () => {
    const store = memoryStore();
    const live = new LiveWorld(newWorld('manta'), 'blobbi-9', 16, { store });
    live.save();
    const raw = JSON.parse(store.get(saveKey(live.identity))!);
    raw.name = '<script>';
    raw.intro = { state: 'exploded', at: -4 };
    raw.tutorial = { done: ['move', 3, 'move'], skipped: 'yes' };
    store.set(saveKey(live.identity), JSON.stringify(raw));
    const loaded = loadSave(store, live.identity)!;
    expect(loaded.name).toBe('script');
    expect(loaded.intro).toEqual({ state: 'done', at: 0 });
    expect(loaded.tutorial).toEqual({ done: ['move'], skipped: false });
  });
});

describe('the intro on a real new island', () => {
  const W = 320;
  const H = 180;
  function intro(kind: CarrierKind, store = memoryStore(), opts: { reducedMotion?: boolean } = {}) {
    const live = new LiveWorld(newWorld(kind), 'blobbi-9', 16, { store });
    live.intro = { state: 'pending', at: 0 };
    live.save();
    const renderer = new LiveRenderer(live);
    const view = new ViewRenderer(live, renderer);
    const results: IntroResult[] = [];
    const cine = new IntroCinematic({ live, renderer, view }, { reducedMotion: opts.reducedMotion ?? true, onComplete: (r) => results.push(r) });
    return { live, store, cine, results };
  }
  const simState = (live: LiveWorld) => JSON.stringify({ t: live.worldTime, step: live.clock.step, x: live.blobbi.x, y: live.blobbi.y, inv: live.inventory.entries(), b: live.buildings.length, tally: live.tally });

  for (const kind of ['turtle', 'manta', 'whale'] as const) {
    it(`${kind}: plays to the end on the real world, never steps or saves it, then play continues from the same state`, () => {
      const s = intro(kind);
      const before = simState(s.live);
      const saved = s.store.get(saveKey(s.live.identity));
      let n = 0;
      while (!s.cine.done && n++ < 2000) s.cine.frame(1 / 15, W, H);
      expect(s.cine.done).toBe(true);
      expect(s.results).toHaveLength(1);
      expect(s.results[0].skipped).toBe(false);
      expect(s.results[0].species).toBe(kind);
      expect(s.results[0].worldIdentity).toBe(s.live.identity);
      expect(simState(s.live)).toBe(before);
      expect(s.store.get(saveKey(s.live.identity))).toBe(saved); // the cinematic wrote nothing
      expect(s.live.getPresenceState()).toBe('present');
      // The host marks it seen: saved, and never replayed.
      s.live.setIntro('done');
      expect(loadSave(s.store, s.live.identity)!.intro.state).toBe('done');
    });
  }

  it('skip ends at once in a valid play state, marked skipped', () => {
    const s = intro('manta', memoryStore(), { reducedMotion: false });
    for (let i = 0; i < 20; i++) s.cine.frame(1 / 30, W, H);
    s.cine.skip();
    s.cine.skip(); // a second skip (another tap) does nothing more
    expect(s.results).toHaveLength(1);
    expect(s.results[0].skipped).toBe(true);
    expect(s.live.getPresenceState()).toBe('present');
    s.live.setIntro('skipped');
    expect(loadSave(s.store, s.live.identity)!.intro.state).toBe('skipped');
  });

  it('a reload during the intro keeps the island and plays the intro again', () => {
    const store = memoryStore();
    const s = intro('turtle', store);
    for (let i = 0; i < 30; i++) s.cine.frame(1 / 30, W, H);
    s.cine.dispose(); // the page went away mid-intro
    const reloaded = new LiveWorld(newWorld('turtle'), 'blobbi-9', 16, { store });
    expect(reloaded.intro.state).toBe('pending');
    expect(reloaded.identity).toBe(s.live.identity);
  });
});
