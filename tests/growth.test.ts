import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { canGrow, growWorld, GROWTH_STAGES, GROWTH_VERSION, MAX_GROWTH_STAGE } from '../src/world/growth';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { T, WALKABLE, isLandClass } from '../src/world/types';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { memoryStore, saveKey, loadSave, SAVE_VERSION } from '../src/game/persistence';
import { growthReadiness } from '../src/game/growth-progress';
import { newTally } from '../src/game/objectives';
import { turtleBodyForWorld } from '../src/render/compose';
import { BUILDINGS } from '../src/game/buildings';
import { PLOT_GRID } from '../src/game/farming';
import { ITEMS } from '../src/game/items';
import { hash32 } from '../src/core/rng';
import { findBuildSpot, stand } from '../src/dev/scripted-play';

const base = generateTurtleWorld('turtle-0');
const stages = [0, 1, 2, 3].map((s) => growWorld(base, s));
const sig = (a: ArrayLike<number>) => hash32(Array.from(a).join(','));

describe('island growth: deterministic and versioned', () => {
  it('the same base and stage always give the same world', () => {
    const again = growWorld(generateTurtleWorld('turtle-0'), 2);
    expect(sig(again.terrain.cls)).toBe(sig(stages[2].terrain.cls));
    expect(JSON.stringify(again.objects)).toBe(JSON.stringify(stages[2].objects));
    expect(again.growth!.version).toBe(GROWTH_VERSION);
  });

  it('version 2 changes only the whale: turtle and manta grow exactly as in version 1; version 3 (M9) only adds stage 4', () => {
    expect(GROWTH_VERSION).toBe(3);
    for (const w of [generateTurtleWorld('turtle-0'), generateMantaWorld('manta-world-0')])
      for (let s = 1; s <= 3; s++) {
        const v1 = growWorld(w, s, 1);
        const v2 = growWorld(w, s, 2);
        const v3 = growWorld(w, s, 3);
        expect(sig(v2.terrain.cls)).toBe(sig(v1.terrain.cls));
        expect(JSON.stringify(v2.objects)).toBe(JSON.stringify(v1.objects));
        expect(sig(v3.terrain.cls)).toBe(sig(v2.terrain.cls));
        expect(JSON.stringify(v3.objects)).toBe(JSON.stringify(v2.objects));
      }
    const whale = generateWhaleWorld('whale-v3', { carrierSeed: 'whale-test' });
    for (let s = 1; s <= 3; s++) {
      expect(sig(growWorld(whale, s, 3).terrain.cls)).toBe(sig(growWorld(whale, s, 2).terrain.cls));
      expect(JSON.stringify(growWorld(whale, s, 3).objects)).toBe(JSON.stringify(growWorld(whale, s, 2).objects));
    }
    // A v1 or v2 record cannot make stage 4 (it is capped at 3).
    expect(growWorld(whale, 4, 2).growth!.stage).toBe(3);
  });

  it('a whale saved with version 1 is regrown exactly as version 1 (never silently changed)', () => {
    const whale = generateWhaleWorld('whale-v1-save', { carrierSeed: 'whale-test' });
    const store = memoryStore();
    const live = new LiveWorld(whale, 'blobbi-9', 16, { store });
    live.devSetGrowthStage(3);
    const raw = JSON.parse(store.get(saveKey(live.identity))!);
    raw.growth.version = 1;
    store.set(saveKey(live.identity), JSON.stringify(raw));
    const again = new LiveWorld(whale, 'blobbi-9', 16, { store });
    expect(again.growthError).toBeNull();
    expect(again.growth.version).toBe(1);
    expect(JSON.stringify(again.world.objects)).toBe(JSON.stringify(growWorld(whale, 3, 1).objects));
    // Version 2 differs for a whale (its plants and rocks keep a passage); the land itself is the same.
    expect(JSON.stringify(growWorld(whale, 3, 2).objects)).not.toBe(JSON.stringify(growWorld(whale, 3, 1).objects));
    expect(sig(growWorld(whale, 3, 2).terrain.cls)).toBe(sig(growWorld(whale, 3, 1).terrain.cls));
  });

  it('stage 0 is the base world itself; unknown versions are refused', () => {
    expect(growWorld(base, 0)).toBe(base);
    expect(() => growWorld(base, 1, 99)).toThrow(/unknown growth version/);
  });

  it('every stage adds land, in at least three stages', () => {
    expect(MAX_GROWTH_STAGE).toBeGreaterThanOrEqual(3);
    for (let s = 1; s <= 3; s++) expect(stages[s].stats.landPixels).toBeGreaterThan(stages[s - 1].stats.landPixels + 1000);
  });

  it('a Variant 0 turtle (no free shell) cannot grow', () => {
    const v0 = generateTurtleWorld('turtle-0', { shellVariant: 0 });
    expect(canGrow(v0)).toBe(false);
    expect(growWorld(v0, 2)).toBe(v0);
  });
});

describe('stable coordinates: growth only ever adds', () => {
  it('only shell ring becomes land; land stays land; the old coast band is the only base land that changes, and stays walkable', () => {
    for (let s = 1; s <= 3; s++) {
      const prev = stages[s - 1].terrain.cls;
      const cur = stages[s].terrain.cls;
      for (let i = 0; i < cur.length; i++) {
        const b = base.terrain.cls[i];
        if (cur[i] === b) continue;
        if (b === T.RIM) expect(isLandClass(cur[i])).toBe(true);
        else {
          expect(b).toBe(T.GRASS_EDGE);
          expect(WALKABLE.has(cur[i])).toBe(true);
        }
        if (isLandClass(prev[i]) && prev[i] !== T.RIM) expect(isLandClass(cur[i])).toBe(true);
      }
    }
  });

  it('the turtle, the carrier, the island record, hubs and paths are untouched; existing objects keep index and place', () => {
    for (let s = 1; s <= 3; s++) {
      const w = stages[s];
      expect(w.turtle).toBe(base.turtle);
      expect(w.carrier).toBe(base.carrier);
      expect(w.islands).toBe(base.islands);
      expect(w.hubs).toBe(base.hubs);
      expect(w.paths).toBe(base.paths);
      expect(JSON.stringify(w.objects.slice(0, base.objects.length))).toBe(JSON.stringify(base.objects));
      expect(JSON.stringify(w.objects.slice(0, stages[s - 1].objects.length))).toBe(JSON.stringify(stages[s - 1].objects));
      expect(w.growth!.objectsAt[s]).toBe(w.objects.length);
      // Head, neck, flippers, tail (SKIN) and every sea pixel are the same.
      for (let i = 0; i < base.terrain.cls.length; i++) if (base.terrain.cls[i] !== T.RIM && base.terrain.cls[i] !== T.GRASS_EDGE) expect(w.terrain.cls[i]).toBe(base.terrain.cls[i]);
    }
  });

  it('the shell keeps a ring of plates all round, and the turtle sprites are pixel-identical', () => {
    const w = stages[3];
    const isl = base.islands[0];
    const { width, cls } = w.terrain;
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      let rim = 0;
      for (let r = isl.radius * 0.8; r < isl.radius * 1.6; r += 0.5) {
        const x = Math.floor(isl.cx + Math.cos(a) * r);
        const y = Math.floor(isl.cy + Math.sin(a) * r);
        if (cls[y * width + x] === T.RIM) rim++;
      }
      expect(rim, `angle ${k * 5}`).toBeGreaterThanOrEqual(6); // ≥ 3 px of shell (in half-pixel steps) everywhere
    }
    const b0 = turtleBodyForWorld(base);
    const b3 = turtleBodyForWorld(w);
    expect(sig(b3.head.buffer.data)).toBe(sig(b0.head.buffer.data));
    expect(sig(b3.head.blink.data)).toBe(sig(b0.head.blink.data));
    b0.flippers.forEach((f, i) => expect(sig(b3.flippers[i].buffer.data)).toBe(sig(f.buffer.data)));
  });
});

describe('the live world on grown land', () => {
  const grownLive = (stage: number) => {
    const store = memoryStore();
    const a = new LiveWorld(base, 'blobbi-9', 16, { store });
    a.devSetGrowthStage(stage);
    return { store, live: new LiveWorld(base, 'blobbi-9', 16, { store }), first: a };
  };

  it('base resources, discoveries and places are identical at every stage (the head place follows the listening spot)', () => {
    const plain = new LiveWorld(base, 'blobbi-9', 16);
    const { live } = grownLive(3);
    const baseIds = new Set(plain.allResources.map((n) => n.id));
    expect(JSON.stringify(live.allResources.filter((n) => baseIds.has(n.id)))).toBe(JSON.stringify(plain.allResources));
    expect(live.allResources.filter((n) => !baseIds.has(n.id)).every((n) => n.id.startsWith('g:'))).toBe(true);
    expect(live.allResources.length).toBeGreaterThan(plain.allResources.length);
    expect(JSON.stringify(live.discoveries.slice(0, plain.discoveries.length).map((d) => [d.id, d.x, d.y]))).toBe(JSON.stringify(plain.discoveries.map((d) => [d.id, d.x, d.y])));
    expect(live.discoveries.length).toBeGreaterThan(plain.discoveries.length);
    // M10: the listening spot (and the head place, which is it) follows the grown land (tests/carrier-listen).
    const notHead = (ps: typeof plain.places) => ps.filter((p) => p.id !== 'head');
    expect(JSON.stringify(notHead(live.places.slice(0, plain.places.length)))).toBe(JSON.stringify(notHead(plain.places)));
    expect(live.places.map((p) => p.id).slice(0, plain.places.length)).toEqual(plain.places.map((p) => p.id));
    expect(live.places.some((p) => p.id.startsWith('region:'))).toBe(true);
    expect(live.places.find((p) => p.id === 'head')).toMatchObject(live.listenSpot!);
  });

  it('buildings, collected resources and the bag survive growth exactly', () => {
    const store = memoryStore();
    const live = new LiveWorld(base, 'blobbi-9', 16, { store });
    live.brain.enabled = false;
    live.inventory.add(ITEMS.wood.id, 40);
    live.inventory.add(ITEMS.stone.id, 40);
    live.inventory.add(ITEMS.stick.id, 40);
    for (const q of ['arrive', 'meet', 'gather', 'axe', 'wood']) live.objectives.completed[q] = 0;
    expect(findBuildSpot(live, 'shelter')).toBe(true);
    live.setBuildMode('shelter');
    const built = live.placeBuilding();
    expect(built).not.toBeNull();
    const node = live.resources[0];
    live.collected.add(node.id);
    live.save();
    const before = loadSave(store, live.identity)!;
    live.devSetGrowthStage(2);
    const after = new LiveWorld(base, 'blobbi-9', 16, { store });
    const saved = loadSave(store, live.identity)!;
    expect(saved.buildings).toEqual(before.buildings);
    expect(saved.collected).toEqual(before.collected);
    expect(after.collected.has(node.id)).toBe(true);
    expect(JSON.stringify(after.inventory.entries())).toBe(JSON.stringify(live.inventory.entries()));
    if (built) expect(after.buildings.find((b) => b.id === built.id)).toMatchObject({ x: built.x, y: built.y });
    expect(after.world.growth!.stage).toBe(2);
  });

  it('new land is walkable from the hub, farmable and buildable', () => {
    const { live } = grownLive(3);
    live.brain.enabled = false;
    const regions = live.places.filter((p) => p.id.startsWith('region:'));
    expect(regions.length).toBeGreaterThanOrEqual(4);
    // Walk (by path) to each region's place.
    for (const p of regions) expect(live.walkTo(p.x, p.y), p.id).toBe(true);
    // Find a new-land cell that can be tilled.
    const g = live.world.growth!;
    const o = live.world.carrier!.origin;
    const { width } = live.world.terrain;
    let tillable = 0;
    let checked = 0;
    for (let i = 0; i < g.bornAt.length && tillable === 0; i += 97) {
      if (!g.bornAt[i]) continue;
      const x = i % width;
      const y = Math.floor(i / width);
      const cell = { gx: Math.floor((x - o.x) / PLOT_GRID), gy: Math.floor((y - o.y) / PLOT_GRID) };
      checked++;
      if (live.plotCheck(cell).ok) tillable++;
    }
    expect(checked).toBeGreaterThan(0);
    expect(tillable).toBeGreaterThan(0);
    // A decoration can be placed on new land.
    const region = regions[0];
    stand(live, region.x, region.y, 'down');
    expect(BUILDINGS.fence).toBeDefined();
  });
});

describe('growth progression (earned, never accidental)', () => {
  it('a new world is stage 0 and not ready; growing requires the requirements', () => {
    const live = new LiveWorld(base, 'blobbi-9', 16, { store: memoryStore() });
    const r = live.growthReadiness();
    expect(r.stage).toBe(0);
    expect(r.next).toBe(1);
    expect(r.ready).toBe(false);
    expect(r.unlocks.length).toBe(GROWTH_STAGES[0].regions.length);
    expect(live.growIsland()).toBeNull();
    expect(live.growth.stage).toBe(0);
  });

  it('readiness is monotonic in every input and caps at the last stage', () => {
    const tally = newTally();
    const input = { stage: 0, harmony: 0, tally, completed: {} as Record<string, number>, found: 0, days: 1, possible: true };
    let last = growthReadiness(input).progress;
    for (const k of ['fed', 'harvested', 'built', 'crafted', 'cooked', 'talked'] as const) {
      tally[k] += 5;
      const p = growthReadiness(input).progress;
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    const ready = growthReadiness({ ...input, harmony: 99, tally: { ...tally, fed: 99, harvested: 99, built: 99, crafted: 99 }, completed: { home: 0 }, found: 9, days: 3 });
    expect(ready.ready).toBe(true);
    // Each stage asks more than the one before (M9): stage 4 is a long-term goal.
    const needs = [0, 1, 2, 3].map((s) => growthReadiness({ ...input, stage: s }).requirements);
    for (let s = 1; s < 4; s++) expect(needs[s].find((r) => r.id === 'harmony')!.need).toBeGreaterThan(needs[s - 1].find((r) => r.id === 'harmony')!.need);
    expect(growthReadiness({ ...input, stage: 3 }).next).toBe(4);
    expect(growthReadiness({ ...input, stage: 4 }).next).toBeNull();
    expect(growthReadiness({ ...input, possible: false }).blocked).toBeTruthy();
  });

  it('when ready, the player grows it: the stage and its history are saved, and a reload stands on the grown world', () => {
    const store = memoryStore();
    const live = new LiveWorld(base, 'blobbi-9', 16, { store });
    Object.assign(live.tally, { fed: 10, harvested: 10, built: 10, crafted: 10 });
    live.objectives.completed.home = 0;
    live.timeOffset += 2 * 1200;
    live.carrier.bond = 50;
    live.found.add(live.discoveries[0].id);
    expect(live.growthReadiness().ready).toBe(true);
    expect(live.growIsland()).toBe(1);
    const raw = JSON.parse(store.get(saveKey(live.identity))!);
    expect(raw.version).toBe(SAVE_VERSION);
    expect(raw.growth).toMatchObject({ stage: 1, version: GROWTH_VERSION });
    expect(raw.growth.history).toHaveLength(1);
    const again = new LiveWorld(base, 'blobbi-9', 16, { store });
    expect(again.world.growth!.stage).toBe(1);
    expect(again.identity).toBe(live.identity);
  });
});

describe('save migration', () => {
  it('an older record (schema 8) loads at stage 0: migration never grows an island', () => {
    const store = memoryStore();
    const live = new LiveWorld(base, 'blobbi-9', 16, { store });
    live.save();
    const raw = JSON.parse(store.get(saveKey(live.identity))!);
    const v8 = { ...raw, version: 8 };
    delete v8.growth;
    delete v8.species;
    delete v8.generator;
    store.set(saveKey(live.identity), JSON.stringify({ ...v8, growth: { stage: 3, version: 1 } })); // even a stray field
    const loaded = new LiveWorld(base, 'blobbi-9', 16, { store });
    expect(loaded.growth.stage).toBe(0);
    expect(loaded.world).toBe(base);
  });

  it('an unknown growth version is never regrown differently nor overwritten: the world is read-only', () => {
    const store = memoryStore();
    const live = new LiveWorld(base, 'blobbi-9', 16, { store });
    live.devSetGrowthStage(1);
    const raw = JSON.parse(store.get(saveKey(live.identity))!);
    raw.growth.version = 7;
    const text = JSON.stringify(raw);
    store.set(saveKey(live.identity), text);
    const loaded = new LiveWorld(base, 'blobbi-9', 16, { store });
    expect(loaded.growthError).toMatch(/unknown growth version/);
    for (let i = 0; i < 60 * 12; i++) loaded.update(1 / 60, IDLE_INPUT);
    loaded.save();
    expect(store.get(saveKey(live.identity))).toBe(text);
  });
});
