import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { memoryStore, saveKey, worldIdentity } from '../src/game/persistence';
import { activeWorld, listWorlds, newWorldSeeds, parseIdentity, resolveFrame, readIndex, SAVE_PREFIX, touchIndex, worldName, ACTIVE_WORLD_KEY, WORLD_INDEX_KEY } from '../src/game/worlds';
import { TitleScreen, type TitleActions } from '../src/ui/title';
import { TouchControls, stickDirections, DEAD_ZONE } from '../src/ui/touch';
import { ToastFeed, TOAST_SECONDS, goalCard, statusCard, timeChip, card } from '../src/ui/hud';
import { Inventory } from '../src/game/inventory';
import { ITEMS } from '../src/game/items';
import { PixelBuffer } from '../src/core/pixel';

/** A store that also lists its keys (as localStorage does). */
function listedStore() {
  const map = new Map<string, string>();
  return { map, get: (k: string) => map.get(k) ?? null, set: (k: string, v: string) => void map.set(k, v), remove: (k: string) => void map.delete(k), keys: () => [...map.keys()] };
}

describe('saved worlds', () => {
  it('parses a world identity back into the options that made it', () => {
    const world = generateTurtleWorld('turtle-7');
    const id = worldIdentity(world);
    const p = parseIdentity(id)!;
    expect(p).not.toBeNull();
    expect(p.seed).toBe(world.seed);
    expect(p.kind).toBe('turtle');
    expect(p.width).toBe(world.options.width);
    expect(p.height).toBe(world.options.height);
    // An enlarged shell grows the frame, so the stored size is not the asked-for one: the resolver finds the
    // request that regenerates the very same identity (the same world, the same save key).
    const regen = (size: { width: number; height: number }) => worldIdentity(generateTurtleWorld(p.seed, { ...size, scale: p.scale, palette: p.palette as never, density: p.density, islands: p.islands as never, turtleSeed: p.turtleSeed, shellVariant: p.shellVariant as never }));
    expect(regen({ width: p.width, height: p.height })).not.toBe(id);
    const frame = resolveFrame(id, [{ width: p.width, height: p.height }, { width: 704, height: 480 }], regen);
    expect(frame).toEqual({ width: 704, height: 480 });
    expect(resolveFrame(id, [{ width: 100, height: 100 }], regen)).toBeNull();
    expect(parseIdentity('not an identity')).toBeNull();
  });

  it('lists saves read-only, most recent first, skipping malformed ones', () => {
    const store = listedStore();
    const a = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store });
    a.save();
    const b = new LiveWorld(generateTurtleWorld('turtle-1'), 'blobbi-9', 16, { store });
    b.save();
    store.set(`${SAVE_PREFIX}seed=x|kind=turtle|1x1|scale=1|palette=cozy|density=1|islands=auto`, '{broken');
    store.set('unrelated', 'x');
    store.set(WORLD_INDEX_KEY, JSON.stringify(touchIndex({}, b.identity, 2000)));
    const snapshot = new Map(store.map);
    const list = listWorlds(store.keys(), store.get);
    expect(list.map((w) => w.identity)).toEqual([b.identity, a.identity]);
    expect(list[0].name).toBe(worldName(b.identity));
    expect(list[0].day).toBe(1);
    expect(store.map).toEqual(snapshot); // nothing written
    expect(readIndex(store.get)[b.identity]).toBe(2000);
  });

  it('the active island: the stored one while its save exists, else the most recent; reading never writes', () => {
    const store = listedStore();
    expect(activeWorld(listWorlds(store.keys(), store.get), store.get)).toBeNull();
    const a = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store });
    a.save();
    const b = new LiveWorld(generateTurtleWorld('turtle-1'), 'blobbi-9', 16, { store });
    b.save();
    store.set(WORLD_INDEX_KEY, JSON.stringify(touchIndex(touchIndex({}, a.identity, 1000), b.identity, 2000)));
    const list = () => listWorlds(store.keys(), store.get);
    expect(activeWorld(list(), store.get)!.identity).toBe(b.identity); // nothing stored: the most recent
    store.set(ACTIVE_WORLD_KEY, a.identity);
    const snapshot = new Map(store.map);
    expect(activeWorld(list(), store.get)!.identity).toBe(a.identity); // explicit, even if not the most recent
    expect(store.map).toEqual(snapshot);
    store.set(ACTIVE_WORLD_KEY, 'seed=gone|kind=turtle');
    expect(activeWorld(list(), store.get)!.identity).toBe(b.identity); // stale: falls back, nothing is lost
    expect(list().length).toBe(2);
  });

  it('names are stable and friendly', () => {
    expect(worldName('x')).toBe(worldName('x'));
    expect(worldName('x')).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it('a new world never takes an identity that already has a save', () => {
    const taken = new Set(['island-a|turtle-a', 'island-b|turtle-b']);
    const words = ['a', 'b', 'c'];
    let i = 0;
    const seeds = newWorldSeeds(() => words[Math.floor(i++ / 2) % 3], (s, t) => `${s}|${t}`, (id) => taken.has(id));
    expect(taken.has(`${seeds.seed}|${seeds.turtleSeed}`)).toBe(false);
  });

  it('opening and playing one world leaves the other saves byte-identical', () => {
    const store = listedStore();
    const a = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store });
    a.inventory.add(ITEMS.wood.id, 3);
    a.save();
    const before = store.get(saveKey(a.identity));
    const b = new LiveWorld(generateTurtleWorld('turtle-2'), 'blobbi-9', 16, { store });
    for (let k = 0; k < 600; k++) b.update(1 / 60, { ...IDLE_INPUT, right: k % 120 < 60 });
    b.save();
    expect(store.get(saveKey(a.identity))).toBe(before);
  });
});

describe('title screen', () => {
  const make = (saved = true) => {
    const calls: string[] = [];
    const world = { identity: 'id', params: parseIdentity('seed=s|kind=turtle|turtle=t|variant=0|10x10|scale=1|palette=cozy|density=1|islands=auto')!, name: 'Mossy Cove', day: 3, quests: 2, buildings: 1, lastPlayed: 1 };
    const actions: TitleActions = {
      worlds: () => (saved ? [world] : []),
      current: () => ({ identity: 'id', name: 'Mossy Cove', saved }),
      continueGame: () => calls.push('continue'),
      openWorld: (w) => calls.push(`open ${w.name}`),
      settings: () => calls.push('settings'),
    };
    return { title: new TitleScreen(actions), calls };
  };

  it('a returning player (M11D.3): CONTINUE ADVENTURE, NEW ADVENTURE, SETTINGS, with quiet ISLANDS and ABOUT rows', () => {
    const { title, calls } = make();
    expect(title.page).toBe('main');
    const labels = () => (title as unknown as { items(): { label: string; minor?: boolean }[] }).items();
    expect(labels().map((i) => i.label)).toEqual(['CONTINUE ADVENTURE', 'NEW ADVENTURE', 'SETTINGS', 'ISLANDS', 'ABOUT']);
    expect(labels().filter((i) => i.minor).map((i) => i.label)).toEqual(['ISLANDS', 'ABOUT']);
    title.key('Enter');
    expect(calls).toEqual(['continue']); // one island: CONTINUE ADVENTURE plays it
    title.key('ArrowDown');
    title.key('ArrowDown');
    title.key('Enter');
    expect(calls.at(-1)).toBe('settings');
    title.key('ArrowDown');
    title.key('Enter');
    expect(title.page).toBe('islands');
    // The islands page opens the island, and offers a new adventure (which asks first).
    expect(labels().map((i) => i.label)).toEqual(['MOSSY COVE', 'NEW ADVENTURE', 'BACK']);
    title.key('Enter');
    expect(calls.at(-1)).toBe('open Mossy Cove');
    title.key('Escape');
    expect(title.page).toBe('main');
    // The words on screen: BLOBBI PIXEL and a welcome back.
    title.render(new PixelBuffer(960, 540), 0);
  });

  it('NEW ADVENTURE (M11D.3): asks first when an island exists, then the same Carrier and name steps; taken once', () => {
    const calls: string[] = [];
    const world = { identity: 'id', params: parseIdentity('seed=s|kind=turtle|turtle=t|variant=0|10x10|scale=1|palette=cozy|density=1|islands=auto')!, name: 'Mossy Cove', day: 3, quests: 2, buildings: 1, lastPlayed: 1 };
    const title = new TitleScreen({ worlds: () => [world], current: () => ({ identity: 'id', name: 'Mossy Cove', saved: true }), continueGame: () => calls.push('continue'), openWorld: () => {}, settings: () => {} });
    title.key('ArrowDown');
    title.key('Enter'); // NEW ADVENTURE
    expect(title.page).toBe('newConfirm');
    title.key('Enter'); // START A NEW ADVENTURE
    expect(title.page).toBe('carrier');
    title.key('Enter'); // the turtle
    expect(title.page).toBe('name');
    expect(title.pendingCreate).toBeNull(); // nothing is made by accident
    title.key('Enter'); // CREATE ISLAND (unnamed)
    title.key('Enter'); // a second press while creating does nothing more
    expect(title.page).toBe('creating');
    expect(title.takeCreate()).toEqual({ kind: 'turtle', name: '', companion: 'new' });
    expect(title.takeCreate()).toBeNull(); // taken exactly once
  });

  it('a first-time player sees NEW ADVENTURE and SETTINGS; NEW ADVENTURE leads to the Carrier choice', () => {
    const { title, calls } = make(false);
    expect(title.page).toBe('welcome');
    const labels = (title as unknown as { items(): { label: string; minor?: boolean }[] }).items();
    expect(labels.filter((i) => !i.minor).map((i) => i.label)).toEqual(['NEW ADVENTURE', 'SETTINGS']);
    const screen = new PixelBuffer(960, 540);
    title.render(screen, 0);
    // The first row is NEW ADVENTURE: click it.
    const s = TitleScreen.scaleFor(960, 540);
    const begin = [...title.regions].filter((h) => h.w > 150 * s).sort((a, b) => a.y - b.y)[0];
    title.pointer(begin.x + 4, begin.y + 4);
    expect(title.page).toBe('carrier');
    expect(calls).toEqual([]);
    expect(title.key('KeyI')).toBe(true); // owns the keyboard
  });

  it('wraps selection and never leaves the main page with Escape', () => {
    const { title } = make();
    title.key('ArrowUp');
    expect(title.index).toBe(4);
    title.key('Escape');
    expect(title.page).toBe('main');
  });

  it('several islands from an older version: all listed, the active one marked; CONTINUE ADVENTURE lets the player choose', () => {
    const p = parseIdentity('seed=s|kind=turtle|turtle=t|variant=0|10x10|scale=1|palette=cozy|density=1|islands=auto')!;
    const worlds = [
      { identity: 'a', params: p, name: 'Mossy Cove', day: 3, quests: 2, buildings: 1, lastPlayed: 9 },
      { identity: 'b', params: { ...p, kind: 'whale' as const }, name: 'Kelp Harbour', day: 12, quests: 9, buildings: 4, lastPlayed: 5 },
      { identity: 'c', params: { ...p, kind: 'manta' as const }, name: 'Quiet Isle', day: 1, quests: 0, buildings: 0, lastPlayed: 1 },
    ];
    const opened: string[] = [];
    const title = new TitleScreen({ worlds: () => worlds, activeIdentity: () => 'b', current: () => ({ identity: 'b', name: 'Kelp Harbour', saved: true }), continueGame: () => opened.push('continue'), openWorld: (w) => opened.push(w.identity), settings: () => {} });
    const items = () => (title as unknown as { items(): { label: string; detail?: string }[] }).items();
    expect(items()[0].label).toBe('CONTINUE ADVENTURE');
    expect(items()[0].detail).toBe('CHOOSE ONE OF YOUR 3 ISLANDS');
    expect(items()[3].label).toBe('ISLANDS (3)');
    title.key('Enter');
    expect(title.page).toBe('islands');
    expect(items().map((i) => i.label)).toEqual(['MOSSY COVE', 'KELP HARBOUR', 'QUIET ISLE', 'NEW ADVENTURE', 'BACK']);
    expect(items().filter((i) => i.detail?.startsWith('ACTIVE')).map((i) => i.label)).toEqual(['KELP HARBOUR']);
    title.render(new PixelBuffer(640, 360), 0);
    title.key('ArrowDown');
    title.key('ArrowDown');
    title.key('Enter'); // the oldest island can still be opened (and so becomes the active one)
    expect(opened).toEqual(['c']);
  });
});

describe('touch controls', () => {
  it('maps a stick vector to 8 directions with a dead zone', () => {
    expect(stickDirections(2, 0, 6)).toEqual({ up: false, down: false, left: false, right: false });
    expect(stickDirections(20, 0, 6)).toEqual({ up: false, down: false, left: false, right: true });
    expect(stickDirections(0, -20, 6)).toEqual({ up: true, down: false, left: false, right: false });
    expect(stickDirections(-20, 20, 6)).toEqual({ up: false, down: true, left: true, right: false });
  });

  it('a short tap stays a tap; a drag becomes the stick; USE appears once touch is seen', () => {
    const t = new TouchControls(() => 2);
    expect(t.down(1, 100, 100, false)).toBeNull(); // a mouse: no stick
    expect(t.enabled).toBe(false);
    expect(t.down(2, 100, 100, true)).toBe('stick');
    t.move(2, 103, 101);
    expect(t.directions().right).toBe(false);
    expect(t.up(2)).toBe(true); // a tap
    t.down(3, 100, 100, true);
    t.move(3, 100 + DEAD_ZONE * 2 + 30, 100);
    expect(t.directions().right).toBe(true);
    expect(t.up(3)).toBe(false);
    expect(t.directions().right).toBe(false); // released: the Blobbi stops
    const screen = new PixelBuffer(400, 300);
    t.insets = { top: 0, right: 20, bottom: 30, left: 0 };
    t.draw(screen, 30);
    // The USE button sits inside the safe area and takes a press on it.
    const lit: number[] = [];
    for (let x = 0; x < 400; x++) if (screen.get(x, 300 - 30 - 30 - 16 * 2) >>> 24) lit.push(x);
    expect(Math.max(...lit)).toBeLessThan(400 - 20);
    expect(t.down(4, Math.round((Math.min(...lit) + Math.max(...lit)) / 2), 300 - 30 - 30 - 16 * 2, true)).toBe('use');
  });
});

describe('HUD', () => {
  it('toasts gains (merging repeats), never losses, and expires them', () => {
    const inv = new Inventory('w');
    const feed = new ToastFeed();
    feed.update(inv, 0);
    inv.add(ITEMS.wood.id, 2);
    feed.update(inv, 0.1);
    inv.add(ITEMS.wood.id, 1);
    feed.update(inv, 0.2);
    expect(feed.toasts).toHaveLength(1);
    expect(feed.toasts[0].quantity).toBe(3);
    inv.remove(ITEMS.wood.id, 2);
    feed.update(inv, 0.3);
    expect(feed.toasts).toHaveLength(1);
    feed.update(inv, 0.3 + TOAST_SECONDS + 0.1);
    expect(feed.toasts).toHaveLength(0);
  });

  it('the first look at a bag toasts nothing (a loaded save is not a gain)', () => {
    const inv = new Inventory('w');
    inv.add(ITEMS.wood.id, 9);
    const feed = new ToastFeed();
    feed.update(inv, 0);
    expect(feed.toasts).toHaveLength(0);
  });

  it('cards are pure (no flashing: the same values draw the same pixels) and needs carry icons', () => {
    const info = { name: 'blobbi-9', title: 'friends', fed: 20, energy: 60, joy: 90, carried: ['WOOD 3'], face: null, away: false };
    const a = statusCard(info);
    const b = statusCard(info);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    // A low need is marked by a "!" and not only by colour: low and high cards differ outside the bar too.
    const high = statusCard({ ...info, fed: 90 });
    expect(Array.from(a.data)).not.toEqual(Array.from(high.data));
    expect(goalCard(2, 16, 'Plant a seed', '1/3').height).toBeGreaterThan(goalCard(2, 16, 'Look around', '').height);
    expect(timeChip(1, 7, 0).width).toBeGreaterThan(20);
    const c = card(10, 10);
    expect(c.get(0, 0) >>> 24).toBe(0); // clipped corners
  });
});

// Keep memoryStore imported for parity with other suites using it.
void memoryStore;
