/**
 * M11D.3: the main menu (CONTINUE ADVENTURE, NEW ADVENTURE with its narrative confirmation, LOGIN WITH NOSTR,
 * SETTINGS), several islands, saves never overwritten (a zero-write "migration": the storage was already one record
 * per island), local Blobbis met in the game, the pixel egg and its rocking, cracks and hatch, the first birth
 * cinematic, first and repeat visit timing; nothing published, no key made, canonical identities untouched.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateGenome } from '@blobbi-kit/renderer/procedural';
import { getCanonicalBlobbiD } from '@blobbi-kit/core';
import { TitleScreen, type TitleAccount, type TitleActions } from '../src/ui/title';
import { ACTIVE_WORLD_KEY, activeWorld, listWorlds, newWorldSeeds, parseIdentity, WORLD_INDEX_KEY, type WorldEntry } from '../src/game/worlds';
import { memoryStore, saveKey } from '../src/game/persistence';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, QUICK_PACE } from '../src/sim/live-world';
import { LiveRenderer } from '../src/render/live-render';
import { ViewRenderer } from '../src/render/view-renderer';
import { IntroCinematic } from '../src/cinematic/intro';
import { introPreviewWorld } from '../src/cinematic/preview';
import { birthTiming, fullTiming, reducedTiming } from '../src/cinematic/script';
import { buildEggSprite, EGG_CRACK_LEVELS, eggHeightFor, eggPoseAt, eggSvg, EGG_HEIGHT_RATIO } from '../src/blobbi/egg';
import { svgSupportIssues } from '../src/blobbi/svg-raster';
import { createLocalBlobbi, forgetLocalBlobbi, isLocalBlobbiSeed, LOCAL_BLOBBIS_KEY, localBlobbi, markBorn, readLocalBlobbis } from '../src/game/local-blobbis';
import { ISLAND_VISITS_KEY, lastVisitor, recordVisit, visitedBefore } from '../src/game/island-visits';
import { effectiveSelection, loadSelectionRecord, SELECTION_KEY, storeLocalSelection, storeSelection } from '../src/game/blobbi-selection';
import { resolveBlobbi, sourceFromSeed } from '../src/blobbi/source';
import { ARRIVE, DEPART } from '../src/game/teleport';
import { PixelBuffer } from '../src/core/pixel';
import { en } from '../src/i18n/messages/en';
import { ptBR } from '../src/i18n/messages/pt-BR';
import { es } from '../src/i18n/messages/es';

const PK = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';
const LOCAL = 'local-blobbi-0123456789abcdef';
const entry = (seed: string, name: string, lastPlayed = 1): WorldEntry => {
  const identity = `seed=${seed}|kind=turtle|turtle=t-${seed}|variant=4|704x560|scale=1.6|palette=cozy|density=1|islands=1|house=none`;
  return { identity, params: parseIdentity(identity)!, name, day: 2, quests: 3, buildings: 1, lastPlayed };
};

function titleFor(saved: WorldEntry[] = [], extra: Partial<TitleActions> = {}) {
  const calls: string[] = [];
  const actions: TitleActions = {
    worlds: () => saved,
    current: () => ({ identity: '', name: '', saved: false }),
    continueGame: () => calls.push('continue'),
    openWorld: (w) => calls.push(`open ${w.name}`),
    settings: () => calls.push('settings'),
    deleteWorld: (w) => calls.push(`DELETE ${w.name}`),
    preview: () => new PixelBuffer(92, 56),
    ...extra,
  };
  const t = new TitleScreen(actions);
  const draw = () => t.render(new PixelBuffer(640, 360), 0);
  const labels = () => (t as unknown as { items(): { label: string }[] }).items().map((i) => i.label);
  const choose = (label: string) => {
    const i = labels().indexOf(label);
    if (i < 0) throw new Error(`no ${label} in ${labels().join(', ')}`);
    t.index = i;
    t.key('Enter');
  };
  return { t, calls, draw, labels, choose };
}

describe('the main menu', () => {
  it('a first-time player is welcomed with NEW ADVENTURE first; LOGIN WITH NOSTR is there but optional', () => {
    const acc: TitleAccount = { status: 'disconnected', name: null, signerAvailable: true };
    const { t, labels, draw } = titleFor([], { account: () => acc });
    expect(t.page).toBe('welcome');
    expect(labels().slice(0, 3)).toEqual(['NEW ADVENTURE', 'LOGIN WITH NOSTR', 'SETTINGS']);
    draw();
    t.key('Enter');
    expect(t.page).toBe('carrier'); // no confirmation: nothing to leave behind
  });

  it('one island: CONTINUE ADVENTURE plays it; several: CONTINUE ADVENTURE lets the player choose which', () => {
    const one = titleFor([entry('a', 'Mossy Cove')]);
    expect(one.labels()[0]).toBe('CONTINUE ADVENTURE');
    one.t.key('Enter');
    expect(one.calls).toEqual(['continue']);
    const many = titleFor([entry('a', 'Mossy Cove', 5), entry('b', 'Quiet Isle', 9)]);
    many.t.key('Enter');
    expect(many.t.page).toBe('islands');
    many.draw();
    many.choose('QUIET ISLE');
    expect(many.calls).toEqual(['open Quiet Isle']);
  });

  it('island cards show the Carrier, progress, when last played and who came last; one more line per island', () => {
    const { t, draw } = titleFor([entry('a', 'Mossy Cove'), entry('b', 'Quiet Isle')], { islandNote: (w) => (w.name === 'Mossy Cove' ? 'Played today  with Mochi' : 'Played 3 days ago') });
    t.key('Enter');
    draw();
    const items = (t as unknown as { items(): { label: string; detail?: string; detail2?: string }[] }).items();
    expect(items[0]).toMatchObject({ label: 'MOSSY COVE', detail2: 'PLAYED TODAY  WITH MOCHI' });
    expect(items[0].detail).toMatch(/TURTLE/);
  });

  it('NEW ADVENTURE with islands saved asks first ("A new adventure?"), never deletes, and BACK TO MY ISLAND changes nothing', () => {
    const { t, calls, choose, draw } = titleFor([entry('a', 'Mossy Cove')]);
    choose('NEW ADVENTURE');
    expect(t.page).toBe('newConfirm');
    draw();
    choose('BACK TO MY ISLAND');
    expect(t.page).toBe('main');
    choose('NEW ADVENTURE');
    choose('START A NEW ADVENTURE');
    expect(t.page).toBe('carrier');
    expect(calls.filter((c) => c.startsWith('DELETE'))).toEqual([]);
    // The confirmation in Portuguese is the briefed copy, and says nothing about deleting.
    expect(ptBR['title.newConfirm.title']).toBe('Uma nova aventura?');
    expect(ptBR['title.newConfirm.go']).toBe('Começar nova aventura');
    expect(ptBR['title.newConfirm.back']).toBe('Voltar para minha ilha');
    for (const cat of [en, ptBR, es] as Record<string, string>[]) expect(cat['title.newConfirm.body']).not.toMatch(/delet|apag|borr|perman/i);
  });

  it('the island list always offers a new adventure too (asking first), and Escape goes back safely', () => {
    const { t, labels, choose } = titleFor([entry('a', 'Mossy Cove'), entry('b', 'Quiet Isle')]);
    t.key('Enter');
    expect(labels()).toContain('NEW ADVENTURE');
    choose('NEW ADVENTURE');
    expect(t.page).toBe('newConfirm');
    t.key('Escape');
    expect(t.page).toBe('main');
  });

  it('who lives on the new island: asked only when the player has a Blobbi worth keeping', () => {
    const fresh = titleFor([]);
    fresh.t.key('Enter'); // NEW ADVENTURE → carrier
    fresh.t.key('Enter'); // the Carrier → name
    fresh.t.key('Enter'); // CREATE ISLAND
    expect(fresh.t.takeCreate()).toMatchObject({ companion: 'new' }); // a first adventure meets a new Blobbi
    const kept = titleFor([], { currentBlobbi: () => ({ name: 'Mochi' }) });
    kept.t.key('Enter');
    kept.t.key('Enter');
    kept.t.key('Enter');
    expect(kept.t.page).toBe('companion');
    kept.draw();
    kept.choose('CONTINUE WITH MOCHI');
    expect(kept.t.takeCreate()).toMatchObject({ companion: 'current' });
  });
});

describe('LOGIN WITH NOSTR (optional, the existing read-only connection)', () => {
  it('not connected: CONNECT uses the existing connection, PLAY AS A GUEST just goes back; nothing is required', () => {
    let acc: TitleAccount = { status: 'disconnected', name: null, signerAvailable: true };
    const calls: string[] = [];
    const { t, choose, draw } = titleFor([entry('a', 'Mossy Cove')], { account: () => acc, connect: () => calls.push('connect') });
    choose('LOGIN WITH NOSTR');
    expect(t.page).toBe('login');
    draw();
    choose('CONNECT');
    expect(calls).toEqual(['connect']);
    choose('PLAY AS A GUEST');
    expect(t.page).toBe('main');
    // No extension: said plainly, still optional.
    acc = { status: 'disconnected', name: null, signerAvailable: false };
    choose('LOGIN WITH NOSTR');
    draw();
  });

  it('connected: CONTINUE WITH ONE OF MY BLOBBIS opens MY BLOBBIS; MEET A NEW BLOBBI starts a new adventure with a new Blobbi', () => {
    const acc: TitleAccount = { status: 'connected', name: 'Ana', signerAvailable: true };
    const calls: string[] = [];
    const { t, choose, labels, draw } = titleFor([entry('a', 'Mossy Cove')], { account: () => acc, myBlobbis: () => calls.push('my blobbis'), currentBlobbi: () => ({ name: 'Mochi' }) });
    expect(labels()).toContain('YOUR NOSTR ACCOUNT');
    choose('YOUR NOSTR ACCOUNT');
    draw();
    expect(labels()).toEqual(['CONTINUE WITH ONE OF MY BLOBBIS', 'MEET A NEW BLOBBI', 'BACK']);
    choose('CONTINUE WITH ONE OF MY BLOBBIS');
    expect(calls).toEqual(['my blobbis']);
    choose('MEET A NEW BLOBBI');
    expect(t.page).toBe('newConfirm'); // the island is kept: asked first
    choose('START A NEW ADVENTURE');
    t.key('Enter'); // the Carrier
    t.key('Enter'); // CREATE ISLAND: no "who lives here" question, the new Blobbi was chosen
    expect(t.page).toBe('owner'); // M11D.4: connected, so whose it will be is asked (never decided silently)
    t.key('Enter'); // ON MY ACCOUNT
    expect(t.takeCreate()).toMatchObject({ companion: 'new', owner: 'account' });
  });

  it('the new copy exists in three languages, without an em dash, and never promises account saving for a new Blobbi', () => {
    const keys = Object.keys(en).filter((k) => /^title\.(newAdventure|continueAdventure|continueChoose|newConfirm|companion|meetNew|bringCurrent|login|played|withBlobbi)/.test(k) || k.startsWith('blobbi.local') || k === 'settings.mainMenu');
    expect(keys.length).toBeGreaterThan(30);
    for (const cat of [en, ptBR, es] as Record<string, unknown>[])
      for (const k of keys) {
        expect(cat[k], k).toBeTruthy();
        expect(JSON.stringify(cat[k]), k).not.toMatch(/—/);
      }
    expect(en['title.login.newDetail']).toMatch(/not on your account yet/);
  });
});

describe('several islands, never overwritten (the storage already holds one record per island)', () => {
  const world = (seed: string) => generateTurtleWorld(seed, { turtleSeed: `t-${seed}`, shellVariant: 4, generatedHouse: false });

  it('a browser from before M11D.3 (one island, the active key, the index) reads unchanged: nothing is written', () => {
    const store = memoryStore();
    const live = new LiveWorld(world('old'), 'blobbi-9', 16, { store });
    live.inventory.add('blobbi-pixel:material:wood', 7);
    live.islandName = 'Old Harbour';
    live.save();
    store.set(ACTIVE_WORLD_KEY, live.identity);
    store.set(WORLD_INDEX_KEY, JSON.stringify({ [live.identity]: 1000 }));
    const before = new Map([...store.data.keys()].map((k) => [k, store.get(k)]));
    const keys = [...store.data.keys()];
    const worlds = listWorlds(keys, (k) => store.get(k));
    expect(worlds.map((w) => w.name)).toEqual(['Old Harbour']);
    expect(activeWorld(worlds, (k) => store.get(k))?.identity).toBe(live.identity);
    // Reading (the title, CONTINUE, the island list) changes not one byte, however often (idempotent).
    listWorlds([...store.data.keys()], (k) => store.get(k));
    expect(new Map([...store.data.keys()].map((k) => [k, store.get(k)]))).toEqual(before);
  });

  it('a new adventure makes a second island with a new identity; the first save stays byte-identical', () => {
    const store = memoryStore();
    const a = new LiveWorld(world('first'), 'blobbi-9', 16, { store });
    a.inventory.add('blobbi-pixel:material:wood', 3);
    a.save();
    const first = store.get(saveKey(a.identity));
    // NEW ADVENTURE's seeds never name an island that has a save (here the first random pick would).
    let n = 0;
    const seeds = newWorldSeeds(() => (n++ === 0 ? 'first' : `x${n}`), (seed) => (seed === 'island-first' ? a.identity : seed), (id) => store.get(saveKey(id)) !== null);
    expect(seeds.seed).not.toBe('island-first');
    const b = new LiveWorld(world('second'), 'blobbi-9', 16, { store });
    b.save();
    expect(store.get(saveKey(a.identity))).toBe(first);
    expect(listWorlds([...store.data.keys()], (k) => store.get(k)).length).toBe(2);
  });

  it('an interrupted creation (storage refuses the new island) leaves every existing island exactly as it was', () => {
    const inner = memoryStore();
    const a = new LiveWorld(world('kept'), 'blobbi-9', 16, { store: inner });
    a.save();
    const first = inner.get(saveKey(a.identity));
    const failing = { ...inner, get: (k: string) => inner.get(k), set: () => { throw new Error('quota'); } };
    const b = new LiveWorld(world('new'), 'blobbi-9', 16, { store: failing });
    b.save();
    expect(b.saveProblem).toBe('write-failed');
    expect(inner.get(saveKey(a.identity))).toBe(first);
    expect(inner.get(saveKey(b.identity))).toBe(null);
  });

  it('continuing an island whose intro was seen never plays it again (it is saved as done)', () => {
    const store = memoryStore();
    const a = new LiveWorld(world('seen'), 'blobbi-9', 16, { store });
    a.intro = { state: 'pending', at: 0 };
    a.save();
    a.setIntro('done');
    const again = new LiveWorld(world('seen'), 'blobbi-9', 16, { store });
    expect(again.intro.state).toBe('done');
  });
});

describe('local Blobbis met in the game (no key, no address, no event)', () => {
  it('a new Blobbi is a local id (never a V3 seed), an egg until its birth is seen, born once', () => {
    const store = memoryStore();
    let k = 0;
    const b = createLocalBlobbi(store, 'island-x', 5, () => Uint8Array.from({ length: 8 }, () => k++));
    expect(b.id).toBe('local-blobbi-0001020304050607');
    expect(isLocalBlobbiSeed(b.id)).toBe(true);
    expect(sourceFromSeed(b.id).kind).toBe('demo'); // drawn from its seed; not a canonical identity
    expect(localBlobbi(store, b.id)).toMatchObject({ born: false, island: 'island-x' });
    markBorn(store, b.id, 9);
    markBorn(store, b.id, 99); // idempotent
    expect(localBlobbi(store, b.id)).toMatchObject({ born: true, bornAt: 9 });
    forgetLocalBlobbi(store, b.id); // a born Blobbi is never removed
    expect(readLocalBlobbis(store).length).toBe(1);
    const unborn = createLocalBlobbi(store, null, 1);
    forgetLocalBlobbi(store, unborn.id); // an egg whose island failed is forgotten
    expect(readLocalBlobbis(store).map((x) => x.id)).toEqual([b.id]);
    expect(store.get(LOCAL_BLOBBIS_KEY)).not.toMatch(/nsec|secret|private/i);
  });

  it('the selection keeps a local Baby without any account; connecting or switching accounts does not replace it', () => {
    const store = memoryStore();
    storeLocalSelection(store, sourceFromSeed(LOCAL), 'baby');
    const rec = loadSelectionRecord(store)!;
    expect(rec).toMatchObject({ source: { kind: 'demo', seed: LOCAL }, account: null, stage: 'baby' });
    expect(effectiveSelection(rec, null)).toBe(rec);
    expect(effectiveSelection(rec, PK)).toBe(rec); // a guest's own Blobbi stays when an account connects
    // A canonical Blobbi chosen with an account keeps the M11C rule (only with that account).
    const r = resolveBlobbi({ pubkey: PK, d: getCanonicalBlobbiD(PK, '0000000001') });
    if (!r.ok) throw new Error(r.error);
    storeSelection(store, r.source, { name: 'Mochi', account: PK, stage: 'baby' });
    expect(effectiveSelection(loadSelectionRecord(store)!, null)).toBe(null);
    // A non-local demo never takes a stage without an account.
    store.set(SELECTION_KEY, JSON.stringify({ version: 1, source: { kind: 'demo', seed: 'blobbi-9' }, stage: 'baby' }));
    expect(loadSelectionRecord(store)?.stage).toBe('adult');
  });
});

describe('the pixel egg', () => {
  const g = generateGenome('blobbi-9');

  it('is the kit egg of the genome, in the pixel dialect, for every crack level and rocking angle; no face, no limbs', () => {
    for (const crack of EGG_CRACK_LEVELS)
      for (const angle of [-11, 0, 7]) {
        const svg = eggSvg(g, { crack, angle });
        expect(svgSupportIssues(svg), `${crack} ${angle}`).toEqual([]);
        expect(svg).not.toMatch(/data-part="[^"]*(eye|mouth|arm|foot)/);
      }
  });

  it('is deterministic; colours and cracks differ by genome and level; it stands about 0.56 of its adult', () => {
    const a = buildEggSprite(g, { crack: 'none', angle: 0 }, 48);
    expect(buildEggSprite(g, { crack: 'none', angle: 0 }, 48).buffer.data).toEqual(a.buffer.data);
    expect(buildEggSprite(generateGenome('blobbi-17'), { crack: 'none', angle: 0 }, 48).buffer.data).not.toEqual(a.buffer.data);
    expect(buildEggSprite(g, { crack: 'heavy', angle: 0 }, 48).buffer.data).not.toEqual(a.buffer.data);
    expect(EGG_HEIGHT_RATIO).toBeGreaterThan(0.5);
    expect(EGG_HEIGHT_RATIO).toBeLessThan(0.62);
    expect(eggHeightFor(12)).toBe(9);
    for (const size of [12, 24, 48, 72]) expect(buildEggSprite(g, { crack: 'none', angle: 0 }, size).buffer.height).toBeGreaterThanOrEqual(eggHeightFor(size));
  });

  it('rocks (rotated before rasterizing, rolling a pixel on its base) and never turns; the sequence ends in a hatch', () => {
    const still = buildEggSprite(g, { crack: 'none', angle: 0 }, 48);
    const leaning = buildEggSprite(g, { crack: 'none', angle: 10 }, 48);
    expect(leaning.buffer.data).not.toEqual(still.buffer.data);
    expect(leaning.anchorX).toBeLessThan(still.anchorX + 1);
    const p = { rock: 1, strong: 3, cracks: [3, 4, 5] as const, hatch: 6 };
    expect(eggPoseAt(0.5, p)).toEqual({ crack: 'none', angle: 0 });
    const gentle = [1.1, 1.4, 1.8, 2.3].map((t) => eggPoseAt(t, p)!.angle);
    expect(Math.max(...gentle.map(Math.abs))).toBeLessThanOrEqual(4);
    expect(new Set(gentle).size).toBeGreaterThan(1);
    const strong = Array.from({ length: 30 }, (_, i) => eggPoseAt(3 + i * 0.1, p)?.angle ?? 0);
    expect(Math.max(...strong.map(Math.abs))).toBeGreaterThan(4);
    expect(Math.max(...strong.map(Math.abs))).toBeLessThanOrEqual(11);
    expect([3.1, 4.1, 5.1].map((t) => eggPoseAt(t, p)!.crack)).toEqual(['light', 'medium', 'heavy']);
    expect(eggPoseAt(6, p)).toBe(null);
    expect(eggPoseAt(2, p, true)!.angle).toBe(0); // reduced motion: no rocking
  });
});

describe('the first birth cinematic (a local presentation)', () => {
  function scene(opts: { birth?: boolean; reducedMotion?: boolean } = {}) {
    const live = new LiveWorld(introPreviewWorld('turtle'), LOCAL, 16, { stage: 'baby', store: null });
    const renderer = new LiveRenderer(live);
    const view = new ViewRenderer(live, renderer);
    const intro = new IntroCinematic({ live, renderer, view }, opts);
    const to = (t: number) => {
      while (intro.elapsed < t && !intro.done) intro.frame(1 / 30, 320, 180);
    };
    return { live, intro, to };
  }

  it('without a birth the intro is exactly as before (existing Blobbis are not reborn)', () => {
    expect(scene().intro.timing).toEqual(fullTiming('turtle'));
    expect(scene({ reducedMotion: true }).intro.timing).toEqual(reducedTiming());
  });

  it('the egg materialises by the arrival particles, rocks, cracks one by one, hatches; the Baby looks around, faces you, says hello', () => {
    const { live, intro, to } = scene({ birth: true });
    const tm = intro.timing;
    const e = tm.egg!;
    expect(tm).toEqual(birthTiming(fullTiming('turtle'), false));
    to(tm.arrival - 0.2);
    expect(live.egg).toBe(null);
    to(tm.arrival + 1);
    expect(live.egg).not.toBe(null);
    expect(live.teleport.state).toBe('arriving'); // the existing particles bring the egg
    to(e.rock + 0.4);
    expect(live.egg!.crack).toBe('none');
    to(e.cracks[0] + 0.05);
    expect(live.egg!.crack).toBe('light');
    to(e.cracks[2] + 0.05);
    expect(live.egg!.crack).toBe('heavy');
    to(e.hatch + 0.05);
    expect(live.egg).toBe(null); // hatched: the Baby is there
    expect(live.blobbi.identity.stage).toBe('baby');
    expect(live.blobbi.animator.pose(intro.worldTime()).view).toBe('front');
    to(tm.looks[0] + 0.1);
    const first = live.blobbi.animator.state.direction;
    to(tm.looks[1] + 0.1);
    const second = live.blobbi.animator.state.direction;
    expect([first, second].sort()).toEqual(['left', 'right']);
    to(tm.notices + 0.1);
    expect(live.blobbi.animator.state.direction).toBe('down');
    to(tm.happy + 0.3);
    expect(live.bubble?.text).toBe('hello!');
    to(tm.end + 1);
    expect(intro.done).toBe(true);
    expect(live.teleport.state).toBe('present');
    expect(live.egg).toBe(null);
  });

  it('skipping at any moment of the birth leaves the Baby simply present (never an egg left behind)', () => {
    for (const at of [0.5, 21, 24.5, 26.9]) {
      const { live, intro, to } = scene({ birth: true });
      to(at);
      intro.skip();
      expect(live.egg).toBe(null);
      expect(live.teleport.state).toBe('present');
    }
  });

  it('reduced motion: no rocking, the cracks and the hatch only, a shorter wait', () => {
    const { intro } = scene({ birth: true, reducedMotion: true });
    expect(intro.timing.egg!.hatch - intro.timing.arrival).toBeLessThan(5);
    expect(intro.duration).toBeLessThan(scene({ birth: true }).intro.duration);
  });
});

describe('visit timing: about 6 s the first time on an island, about 3 s after', () => {
  const world = generateTurtleWorld('turtle-0');
  const swapTime = (quick: boolean) => {
    const live = new LiveWorld(world, 'blobbi-9', 16);
    live.brain.enabled = false;
    live.swapBlobbi(LOCAL, 16, 'baby', { quick });
    let t = 0;
    while (live.swap && t < 20) {
      live.update(1 / 60, { up: false, down: false, left: false, right: false, interact: false, plant: false });
      t += 1 / 60;
    }
    return { t, live };
  };

  it('first visit ≈ the full departure and arrival; a repeat visit about half; the teleport pace resets after', () => {
    const first = swapTime(false);
    const repeat = swapTime(true);
    expect(first.t).toBeGreaterThan(DEPART.end + ARRIVE.end - 0.2);
    expect(first.t).toBeLessThan(6.6);
    expect(repeat.t).toBeGreaterThan(2.6);
    expect(repeat.t).toBeLessThan(3.6);
    expect(QUICK_PACE).toBe(0.5);
    expect(repeat.live.teleport.pace).toBe(1);
    expect(repeat.live.blobbi.seed).toBe(LOCAL);
  });

  it('first visits are remembered per island and Blobbi, locally (never published, never in a save)', () => {
    const store = memoryStore();
    expect(visitedBefore(store, 'island-a', LOCAL)).toBe(false);
    recordVisit(store, 'island-a', { seed: LOCAL, name: null, stage: 'baby' });
    recordVisit(store, 'island-a', { seed: LOCAL, name: null, stage: 'baby' });
    expect(visitedBefore(store, 'island-a', LOCAL)).toBe(true);
    expect(visitedBefore(store, 'island-b', LOCAL)).toBe(false); // the same Blobbi, another island: a first visit
    recordVisit(store, 'island-a', { seed: 'blobbi-9', name: 'Mochi', stage: 'adult' });
    expect(lastVisitor(store, 'island-a')).toEqual({ seed: 'blobbi-9', name: 'Mochi', stage: 'adult' });
    expect(JSON.parse(store.get(ISLAND_VISITS_KEY)!).islands['island-a'].seen).toEqual([LOCAL, 'blobbi-9']);
    store.set(ISLAND_VISITS_KEY, '{oops');
    expect(visitedBefore(store, 'island-a', LOCAL)).toBe(false); // damaged: just a first visit again
  });
});

describe('nothing published, no key made', () => {
  it('the M11D.3 code has no signing, publishing or key-making call', () => {
    for (const f of ['src/ui/title.ts', 'src/game/local-blobbis.ts', 'src/game/island-visits.ts', 'src/blobbi/egg.ts', 'src/cinematic/intro.ts', 'src/cinematic/script.ts', 'src/playground/main.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/signEvent|generateSecretKey|nsecEncode|finalizeEvent|\.publish\(|getSecretKey|privateKey|ncryptsec/);
    }
  });
});
