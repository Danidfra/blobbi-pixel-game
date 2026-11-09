/**
 * WILD SEEDS (Living World, phase 2): a seed picked up from the ground is one crop's seed by weight, revealed at
 * once; which one is a pure function of the world, the node and its pickup generation, so reloads and second looks
 * never reroll; item ids, stacks, quests and old saves are as they were.
 */
import { describe, expect, it } from 'vitest';
import { WILD_SEED_ORDER, WILD_SEED_WEIGHTS, wildSeedItem, wildSeedKind } from '../src/game/wild-seeds';
import { CROPS, type CropKind } from '../src/game/farming';
import { LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { loadSave, memoryStore, saveKey } from '../src/game/persistence';
import { ITEMS } from '../src/game/items';
import { RESPAWN_SECONDS } from '../src/game/resources';
import { goalDone } from '../src/game/objectives';
import { QUEST_CONTENT } from '../src/content/quests';
import { run, stand } from '../src/dev/scripted-play';

const seedId = (kind: CropKind) => CROPS[kind].seed;
const world = () => generateTurtleWorld('turtle-0');
function fresh(store = memoryStore()) {
  const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  return { live, store };
}
/** Stand by the nearest seed node still on the ground and pick it up; returns the node and what the bag gained. */
function pickSeed(live: LiveWorld) {
  const hub = live.world.hubs[0];
  const nodes = live.resources.filter((n) => n.kind === 'seed').sort((a, b) => Math.hypot(a.x - hub.x, a.y - hub.y) - Math.hypot(b.x - hub.x, b.y - hub.y));
  for (const node of nodes) {
    const spot = [[0, 3], [0, -3], [4, 0], [-4, 0], [0, 6], [6, 2], [-6, 2]].map(([dx, dy]) => ({ x: node.x + dx, y: node.y + dy })).find((p) => live.collision.canStand(p.x, p.y, live.blobbi.footRx, live.blobbi.footRy));
    if (!spot) continue;
    stand(live, spot.x, spot.y, 'down');
    if (live.nearestResource() !== node) continue;
    const before = new Map(WILD_SEED_ORDER.map((k) => [k, live.inventory.count(seedId(k))]));
    const got = live.collect();
    if (!got) continue;
    const gained = WILD_SEED_ORDER.filter((k) => live.inventory.count(seedId(k)) > before.get(k)!);
    return { node, gained };
  }
  throw new Error('no seed node in reach');
}

describe('wild seeds: the roll', () => {
  it('weights add up to 100 and the rolls follow them (twenty thousand pickups, within a point and a half)', () => {
    expect(Object.values(WILD_SEED_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    const counts: Record<string, number> = {};
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const k = wildSeedKind('a-world', `seed:${i % 97}`, Math.floor(i / 97));
      counts[k] = (counts[k] ?? 0) + 1;
    }
    for (const kind of WILD_SEED_ORDER) expect(Math.abs(((counts[kind] ?? 0) / N) * 100 - WILD_SEED_WEIGHTS[kind]), kind).toBeLessThan(1.5);
  });

  it('is a pure function of the world, the node and the generation; another generation or world rolls afresh', () => {
    expect(wildSeedKind('w', 'seed:3', 0)).toBe(wildSeedKind('w', 'seed:3', 0));
    const a = [...Array(40).keys()].map((g) => wildSeedKind('w', 'seed:3', g));
    const b = [...Array(40).keys()].map((g) => wildSeedKind('w', 'seed:4', g));
    const c = [...Array(40).keys()].map((g) => wildSeedKind('w2', 'seed:3', g));
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
    expect(new Set(a).size).toBeGreaterThan(2);
    // The item is the crop's own seed; the turnip's is the wild seed item, untouched.
    expect(seedId('turnip')).toBe(ITEMS.seed.id);
    for (const kind of WILD_SEED_ORDER) expect(wildSeedItem('w', `seed:${kind}`, 0)).toMatch(/^blobbi-pixel:(resource|seed):/);
  });
});

describe('wild seeds: on the island', () => {
  it('a pickup puts the rolled crop\'s seed in the bag, says so, and counts as a pickup for the quests', () => {
    const { live } = fresh();
    const { node, gained } = pickSeed(live);
    expect(gained).toHaveLength(1);
    expect(gained[0]).toBe(wildSeedKind(live.world.seed, node.id, 0));
    expect(live.tally.collected).toBe(1);
    expect(live.tally.foraged).toBe(0);
    // Five pickups of anything finish "Gather supplies", as before.
    for (let i = 0; i < 4; i++) pickSeed(live);
    expect(goalDone(QUEST_CONTENT.find((q) => q.id === 'gather')!.goal, live)).toBe(true);
  });

  it('the same node rolls again only after it has been picked and has grown back; the roll is written before the pickup, so a reload never rerolls', () => {
    const store = memoryStore();
    const { live } = fresh(store);
    const first = pickSeed(live);
    const g0 = wildSeedKind(live.world.seed, first.node.id, 0);
    expect(first.gained[0]).toBe(g0);
    // Step off it (a node never grows back under the Blobbi's feet), let it grow back, pick again: generation 1.
    const hub = live.world.hubs[0];
    const off = live.collision.nearestFree(hub.x, hub.y, live.blobbi.footRx, live.blobbi.footRy)!;
    stand(live, off.x, off.y, 'down');
    live.timeOffset += RESPAWN_SECONDS.seed + 5;
    run(live, 120);
    expect(live.resources.some((n) => n.id === first.node.id)).toBe(true);
    const g1 = wildSeedKind(live.world.seed, first.node.id, 1);
    const again = (() => {
      const node = live.resources.find((n) => n.id === first.node.id)!;
      const spot = [[0, 3], [0, -3], [4, 0], [-4, 0], [0, 6]].map(([dx, dy]) => ({ x: node.x + dx, y: node.y + dy })).find((p) => live.collision.canStand(p.x, p.y, live.blobbi.footRx, live.blobbi.footRy))!;
      stand(live, spot.x, spot.y, 'down');
      const before = new Map(WILD_SEED_ORDER.map((k) => [k, live.inventory.count(seedId(k))]));
      expect(live.collect()?.id).toBe(node.id);
      return WILD_SEED_ORDER.filter((k) => live.inventory.count(seedId(k)) > before.get(k)!)[0];
    })();
    expect(again).toBe(g1);
    expect(live.pickupCounts.get(first.node.id)).toBe(2);
    // Reload: the counts come back, and the next pickup of that node (generation 2) is the same with or without the reload.
    live.save();
    const back = new LiveWorld(world(), 'blobbi-9', 16, { store });
    expect(back.pickupCounts.get(first.node.id)).toBe(2);
    expect(loadSave(store, live.identity)!.pickups[first.node.id]).toBe(2);
    // A world that reloads before its first pickup gets what the unreloaded one got.
    const s2 = memoryStore();
    const w2 = fresh(s2).live;
    w2.save();
    const w2b = new LiveWorld(world(), 'blobbi-9', 16, { store: s2 });
    w2b.brain.enabled = false;
    expect(pickSeed(w2b).gained[0]).toBe(g0 === first.gained[0] ? wildSeedKind(w2b.world.seed, first.node.id, 0) : g0);
  });

  it('a full stack refuses the pickup without spending the roll; stacks keep their limits', () => {
    const { live } = fresh();
    // Find what the nearest node will roll, fill that stack, and try.
    const hub = live.world.hubs[0];
    const node = live.resources.filter((n) => n.kind === 'seed').sort((a, b) => Math.hypot(a.x - hub.x, a.y - hub.y) - Math.hypot(b.x - hub.x, b.y - hub.y))[0];
    const item = wildSeedItem(live.world.seed, node.id, 0);
    live.inventory.add(item, live.inventory.limit(item));
    expect(live.inventory.count(item)).toBe(live.inventory.limit(item));
    const spot = [[0, 3], [0, -3], [4, 0], [-4, 0], [0, 6]].map(([dx, dy]) => ({ x: node.x + dx, y: node.y + dy })).find((p) => live.collision.canStand(p.x, p.y, live.blobbi.footRx, live.blobbi.footRy))!;
    stand(live, spot.x, spot.y, 'down');
    expect(live.nearestResource()).toBe(node);
    expect(live.collect()).toBeNull();
    expect(live.pickupCounts.get(node.id) ?? 0).toBe(0);
    expect(live.resources).toContain(node);
    expect(live.inventory.count(item)).toBe(live.inventory.limit(item));
  });

  it('an old save without pickup counts loads with none; sticks and stones are untouched; quest seed rewards are what they were', () => {
    const store = memoryStore();
    const { live } = fresh(store);
    pickSeed(live);
    live.save();
    expect(loadSave(store, live.identity)!.pickups).toEqual(Object.fromEntries(live.pickupCounts));
    // The same record with the field removed, as a save from before would be: it loads, with no counts.
    const key = saveKey(live.identity);
    const raw = JSON.parse(store.get(key)!) as Record<string, unknown>;
    delete raw.pickups;
    store.set(key, JSON.stringify(raw));
    const older = new LiveWorld(world(), 'blobbi-9', 16, { store });
    expect(older.pickupCounts.size).toBe(0);
    expect(older.collected.size).toBe(1);
    // Sticks and stones are plain pickups.
    const stick = live.resources.find((n) => n.kind === 'stick')!;
    const spot = [[0, 3], [0, -3], [4, 0], [-4, 0], [0, 6]].map(([dx, dy]) => ({ x: stick.x + dx, y: stick.y + dy })).find((p) => live.collision.canStand(p.x, p.y, live.blobbi.footRx, live.blobbi.footRy))!;
    stand(live, spot.x, spot.y, 'down');
    if (live.nearestResource() === stick) {
      live.collect();
      expect(live.inventory.count(ITEMS.stick.id)).toBe(1);
      expect(live.pickupCounts.has(stick.id)).toBe(false);
    }
    // The guaranteed seed sources are untouched: "Gather supplies" still gives two wild seeds, "Prepare a farm plot" three carrot seeds.
    expect(QUEST_CONTENT.find((q) => q.id === 'gather')!.reward.items).toEqual([{ item: ITEMS.seed.id, quantity: 2 }]);
    expect(QUEST_CONTENT.find((q) => q.id === 'plot')!.reward.items).toEqual([{ item: seedId('carrot'), quantity: 3 }]);
  });
});
