/**
 * M10 phase C: save reliability before any synchronisation exists. A record this version cannot read (damaged, or
 * from a newer version of the game) is never overwritten — it is copied aside and the world plays without saving;
 * a failed write (storage full) never stops the game and is said once; older records migrate; and a world full of
 * state round-trips byte for byte.
 */
import { describe, expect, it } from 'vitest';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { backupKey, loadSave, memoryStore, saveKey, saveStatus, SAVE_VERSION, worldIdentity } from '../src/game/persistence';
import { pressE, run, stand } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { CANOE_ITEM } from '../src/content/tools';
import { KEEP_CLEAR_KIND } from '../src/game/clearing';
import { GROWTH_VERSION } from '../src/world/growth';

const world = () => generateTurtleWorld('save-1', { turtleSeed: 't-save-1', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });

describe('a record that cannot be read is never overwritten', () => {
  it('damaged: kept as it is, copied aside, the world plays without saving and says why', () => {
    const store = memoryStore();
    const identity = worldIdentity(world());
    const damaged = '{"version":12,"world":"' + identity + '","collected":[ broken';
    store.set(saveKey(identity), damaged);
    expect(saveStatus(store, identity)).toBe('unreadable');
    const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
    expect(live.saveProblem).toBe('unreadable');
    live.inventory.add(ITEMS.stick.id, 3);
    live.save();
    run(live, 60 * 15); // past an autosave
    expect(store.get(saveKey(identity))).toBe(damaged);
    expect(store.get(backupKey(identity))).toBe(damaged);
  });

  it('from a newer version of the game: untouched (never "migrated" down), the player told', () => {
    const store = memoryStore();
    const first = new LiveWorld(world(), 'blobbi-9', 16, { store });
    first.inventory.add(ITEMS.wood.id, 4);
    first.save();
    const raw = JSON.parse(store.get(saveKey(first.identity))!);
    raw.version = SAVE_VERSION + 1;
    raw.somethingNew = { from: 'the future' };
    const future = JSON.stringify(raw);
    store.set(saveKey(first.identity), future);
    expect(saveStatus(store, first.identity)).toBe('newer');
    const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
    expect(live.saveProblem).toBe('newer');
    live.save();
    expect(store.get(saveKey(first.identity))).toBe(future);
    // A visitor never writes either way (and is not told about the host's storage).
    const visitor = new LiveWorld(world(), 'blobbi-9', 16, { store, visitor: true });
    expect(visitor.saveProblem).toBeNull();
  });

  it('a failed write (storage full) never stops play: said once, retried, cleared when it works again', () => {
    const map = new Map<string, string>();
    let full = false;
    const store = { get: (k: string) => map.get(k) ?? null, set: (k: string, v: string) => { if (full) throw new Error('QuotaExceededError'); map.set(k, v); }, remove: (k: string) => void map.delete(k) };
    const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
    full = true;
    expect(() => live.save()).not.toThrow();
    expect(live.saveProblem).toBe('write-failed');
    expect(live.notices.filter((n) => n.heading === 'Not saved')).toHaveLength(1);
    live.save();
    expect(live.notices.filter((n) => n.heading === 'Not saved')).toHaveLength(1);
    full = false;
    live.inventory.add(ITEMS.stone.id, 2);
    live.save();
    expect(live.saveProblem).toBeNull();
    expect(loadSave(store, live.identity)!.inventory.items.some((i) => i.item === ITEMS.stone.id)).toBe(true);
  });
});

describe('migration and round trips', () => {
  it('a schema-11 record (M10 phase B) loads with no planted trees and nothing pinned, and is written as schema 12', () => {
    const store = memoryStore();
    const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
    live.inventory.add(ITEMS.wood.id, 5);
    live.save();
    const raw = JSON.parse(store.get(saveKey(live.identity))!);
    raw.version = 11;
    delete raw.planted;
    delete raw.plantedSerial;
    delete raw.pinnedQuest;
    store.set(saveKey(live.identity), JSON.stringify(raw));
    const loaded = loadSave(store, live.identity)!;
    expect(loaded.planted).toEqual([]);
    expect(loaded.plantedSerial).toBe(0);
    expect(loaded.pinnedQuest).toBeNull();
    const again = new LiveWorld(world(), 'blobbi-9', 16, { store });
    expect(again.saveProblem).toBeNull();
    expect(again.inventory.count(ITEMS.wood.id)).toBe(5);
    again.save();
    expect(JSON.parse(store.get(saveKey(live.identity))!).version).toBe(SAVE_VERSION);
  });

  it('a world full of state — growth, a flag, planted trees, a pinned quest, the canoe aboard — round-trips byte for byte', () => {
    const store = memoryStore();
    const base = generateMantaWorld('save-2', { carrierSeed: 'm-save-2', generatedHouse: false });
    const probe = new LiveWorld(base, 'blobbi-9', 16, { store });
    probe.growth = { stage: 1, version: GROWTH_VERSION, history: [{ stage: 1, worldTime: 0, version: GROWTH_VERSION }], regions: [] };
    probe.save();
    const live = new LiveWorld(base, 'blobbi-9', 16, { store });
    live.brain.enabled = false;
    (live as unknown as { nearbyMarine: () => null }).nearbyMarine = () => null;
    live.islandName = 'Kelp Harbour';
    live.objectives.completed.gather = 1;
    live.objectives.completed.axe = 2;
    live.pinQuest('improve');
    live.buildings.push({ id: 'flag:1', kind: KEEP_CLEAR_KIND, x: live.world.hubs[0].x + 20, y: live.world.hubs[0].y, placedAt: 3, seed: 'f', variant: 2 });
    live.blobbi.x = live.world.hubs[0].x;
    live.blobbi.y = live.world.hubs[0].y + 10;
    live.plantTree();
    run(live, 60 * 3);
    // Out in the canoe, from the landing.
    const at = live.landingStand()!;
    live.inventory.add(CANOE_ITEM.id, 1);
    stand(live, at.x, at.y, at.heading);
    live.resources = [];
    for (const d of live.discoveries) if (Math.hypot(d.x - at.x, d.y - at.y) < 30) live.found.add(d.id);
    pressE(live);
    pressE(live);
    run(live, 40);
    for (let i = 0; i < 60; i++) live.update(1 / 60, { ...IDLE_INPUT, [at.heading]: true });
    run(live, 90);
    expect(live.boat!.aboard).toBe(true);
    live.save();
    const first = store.get(saveKey(live.identity))!;
    const again = new LiveWorld(base, 'blobbi-9', 16, { store });
    expect(again.islandName).toBe('Kelp Harbour');
    expect(again.pinnedQuest).toBe('improve');
    expect(again.planted).toHaveLength(1);
    expect(again.boat?.aboard).toBe(true);
    expect(again.blobbi.x).toBeCloseTo(again.boat!.x, 0);
    expect(again.buildings.find((b) => b.kind === KEEP_CLEAR_KIND)).toBeTruthy();
    expect(again.world.growth?.landing).toBeTruthy();
    expect(again.identity).toBe(live.identity);
    again.save();
    const second = store.get(saveKey(live.identity))!;
    // World time moved on a hair by loading? No: nothing was stepped. The records are identical.
    expect(second).toBe(first);
  });
});
