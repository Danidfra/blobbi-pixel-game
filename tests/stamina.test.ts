/**
 * EXPLORATION STAMINA (Living World, phase 2): work costs a little of the Blobbi's existing energy (a landed axe or
 * pickaxe hit, a tilled cell, a watering, a cast); when it is exhausted the axe, the pickaxe and the hoe wait with a
 * word while the lighter chores, walking, feeding, petting and rest go on; rest brings it back. Deterministic, and
 * nothing new in the save.
 */
import { describe, expect, it } from 'vitest';
import { DRIFT_FLOOR, EXHAUSTED, RATES, STAMINA, TIRED, careFromSave, careToSave, isExhausted, isTired, newCare, spendEnergy, stepCare } from '../src/game/care';
import { IDLE_INPUT, LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { memoryStore } from '../src/game/persistence';
import { ITEMS } from '../src/game/items';
import { HITS_TO_MINE, isLargeRock } from '../src/game/rocks';
import { findBuildSpot, findField, pressE, pressUntil, run, stand, standAbove } from '../src/dev/scripted-play';
import { BUILDINGS } from '../src/game/buildings';
import { t as lang } from '../src/i18n';

const world = () => generateTurtleWorld('turtle-0');
/** A quiet world with the simple tools and some seeds, autonomy off, nothing lying about to pick up. */
function worker(store = memoryStore()) {
  const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  for (const tool of [ITEMS.axe, ITEMS.pickaxe, ITEMS.hoe]) live.inventory.add(tool.id, 1);
  live.inventory.add(ITEMS.seed.id, 5);
  live.resources = [];
  return { live, store };
}
/** Stand below the nearest grown tree (or large rock), facing it; returns its index. */
function face(live: LiveWorld, kind: 'tree' | 'rock'): number {
  const hub = live.world.hubs[0];
  const candidates = live.world.objects
    .map((o, index) => ({ o, index }))
    .filter(({ o }) => o.kind === kind && (kind === 'tree' || isLargeRock(o.size)))
    .sort((a, b) => Math.hypot(a.o.x - hub.x, a.o.y - hub.y) - Math.hypot(b.o.x - hub.x, b.o.y - hub.y));
  for (const { o, index } of candidates) {
    if (kind === 'tree' && live.treeAt(index).phase !== 'grown') continue;
    const s = live.spriteOf(o);
    const x = o.x;
    const y = o.y + s.footRy + live.blobbi.footRy + 2;
    if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
    stand(live, x, y, 'up');
    if (live.facingObject()?.index === index) return index;
  }
  throw new Error(`no ${kind} to face`);
}
/** The passive drift over the world time that passed between two readings, so costs can be told from it. */
const drift = (t0: number, t1: number) => RATES.energyAwake * (t1 - t0);
const bubble = (live: LiveWorld) => (live.bubble as { text: string } | null)?.text ?? null;

describe('exploration stamina: work costs a little energy', () => {
  it('felling a tree costs one point per landed hit (three), the swing in the air nothing', () => {
    const { live } = worker();
    live.equip(ITEMS.axe.id);
    const index = face(live, 'tree');
    const e0 = live.care.energy;
    const t0 = live.worldTime;
    pressUntil(live, () => live.treeAt(index).phase === 'stump', 6);
    expect(live.treeAt(index).phase).toBe('stump');
    const cost = e0 - live.care.energy - drift(t0, live.worldTime);
    expect(cost).toBeCloseTo(3 * STAMINA.chop, 1);
  });

  it('mining a large rock costs one point per landed hit (four)', () => {
    const { live } = worker();
    live.equip(ITEMS.pickaxe.id);
    const index = face(live, 'rock');
    const e0 = live.care.energy;
    const t0 = live.worldTime;
    pressUntil(live, () => live.rockAt(index).phase === 'rubble', HITS_TO_MINE + 2);
    expect(live.rockAt(index).phase).toBe('rubble');
    expect(e0 - live.care.energy - drift(t0, live.worldTime)).toBeCloseTo(HITS_TO_MINE * STAMINA.mine, 1);
  });

  it('tilling costs a point and watering half; planting is free', () => {
    const { live } = worker();
    live.equip(ITEMS.hoe.id);
    const [cell] = findField(live, 1)!;
    standAbove(live, cell);
    let e0 = live.care.energy;
    let t0 = live.worldTime;
    pressE(live); // till
    expect(live.plotAt(cell)).toBeTruthy();
    expect(e0 - live.care.energy - drift(t0, live.worldTime)).toBeCloseTo(STAMINA.till, 1);
    e0 = live.care.energy;
    t0 = live.worldTime;
    live.selectedCrop = 'turnip';
    pressE(live); // plant
    expect(live.plotAt(cell)!.crop).toBeTruthy();
    expect(e0 - live.care.energy - drift(t0, live.worldTime)).toBeCloseTo(0, 1);
    e0 = live.care.energy;
    t0 = live.worldTime;
    pressE(live); // water
    expect(live.tally.watered).toBe(1);
    expect(e0 - live.care.energy - drift(t0, live.worldTime)).toBeCloseTo(STAMINA.water, 1);
  });

  it('exhausted, the axe, the pickaxe and the hoe wait with a word; walking, the lighter chores, petting and rest go on, and rest brings the work back', () => {
    const { live } = worker();
    live.care.energy = EXHAUSTED - 3;
    expect(isExhausted(live.care)).toBe(true);
    // The axe.
    live.equip(ITEMS.axe.id);
    const tree = face(live, 'tree');
    pressE(live);
    expect(live.treeAt(tree).phase).toBe('grown');
    expect(bubble(live)).toBe(lang('care.tooTired'));
    // The pickaxe.
    live.bubble = null;
    live.equip(ITEMS.pickaxe.id);
    const rock = face(live, 'rock');
    pressE(live);
    expect(live.rockAt(rock).phase).toBe('whole');
    expect(bubble(live)).toBe(lang('care.tooTired'));
    // The hoe.
    live.bubble = null;
    live.equip(ITEMS.hoe.id);
    const [cell] = findField(live, 1)!;
    standAbove(live, cell);
    pressE(live);
    expect(live.plotAt(cell)).toBeNull();
    expect(bubble(live)).toBe(lang('care.tooTired'));
    // Walking still works, as does attention.
    const x0 = live.blobbi.x;
    for (let i = 0; i < 30; i++) live.update(1 / 60, { ...IDLE_INPUT, left: true });
    expect(live.blobbi.x).not.toBe(x0);
    expect(live.pet()).toBe(true);
    // A nap on the spot restores it, and the hoe works again.
    live.rest();
    run(live, 60 * 8);
    expect(live.care.energy).toBeGreaterThan(EXHAUSTED);
    live.rest(); // wake
    run(live, 10);
    standAbove(live, cell);
    live.bubble = null;
    pressE(live);
    expect(live.plotAt(cell)).toBeTruthy();
  });

  it('says it is getting tired once, when work takes it over the line, and never again while it stays tired', () => {
    const { live } = worker();
    live.equip(ITEMS.axe.id);
    const index = face(live, 'tree');
    live.care.energy = TIRED + 0.4;
    live.bubble = null;
    pressE(live); // the first landed hit crosses the line
    expect(isTired(live.care)).toBe(true);
    expect(bubble(live)).toBe(lang('care.gettingTired'));
    run(live, 60 * 2.5); // the word fades
    live.bubble = null;
    pressUntil(live, () => live.treeAt(index).phase === 'stump', 6);
    expect(bubble(live)).not.toBe(lang('care.gettingTired'));
  });

  it('is fair: the passive rates, the save record and an old save are exactly as before', () => {
    expect(RATES).toEqual({ hunger: 0.06, energyAwake: 0.08, energyWalking: 0.11, energyResting: 1.5, energyInShelter: 3, happinessDrift: 0.02 });
    expect(Object.keys(careToSave(newCare())).sort()).toEqual(['energy', 'happiness', 'hunger', 'lastPet']);
    const old = careFromSave({ hunger: 40, energy: 12, happiness: 55, lastPet: 3 });
    expect(old).toEqual({ hunger: 40, energy: 12, happiness: 55, lastPet: 3 });
    expect(EXHAUSTED).toBeLessThan(TIRED);
    // Spending never goes below zero, and reports the crossing into tired exactly once.
    const c = newCare();
    c.energy = TIRED + 0.5;
    expect(spendEnergy(c, 1)).toBe(true);
    expect(spendEnergy(c, 1)).toBe(false);
    c.energy = 0.3;
    spendEnergy(c, 5);
    expect(c.energy).toBe(0);
  });

  it('never exhausts an idle or exploring Blobbi: the passive drift stops at the floor, only work goes below, rest climbs back', () => {
    const idle = { ...newCare(), energy: 30 };
    for (let i = 0; i < 60 * 600; i++) stepCare(idle, 1 / 60, { resting: false, sheltered: false, moving: i % 2 === 0 });
    expect(idle.energy).toBe(DRIFT_FLOOR);
    expect(isExhausted(idle)).toBe(false);
    const worked = { ...newCare(), energy: EXHAUSTED - 2 };
    for (let i = 0; i < 60 * 60; i++) stepCare(worked, 1 / 60, { resting: false, sheltered: false, moving: true });
    expect(worked.energy).toBe(EXHAUSTED - 2); // no further drift below the floor, and no free recovery either
    for (let i = 0; i < 60 * 10; i++) stepCare(worked, 1 / 60, { resting: true, sheltered: false, moving: false });
    expect(worked.energy).toBeGreaterThan(EXHAUSTED);
    expect(DRIFT_FLOOR).toBeGreaterThan(EXHAUSTED);
  });

  it('never softlocks: exhausted far from home, R walks home and rests there; with no home at all, a nap on the spot; both bring the work back', () => {
    // With a home: the Blobbi is sent far from it, exhausted, and asked to rest.
    const { live } = worker();
    for (const c of BUILDINGS.shelter.cost) live.inventory.add(c.item, c.quantity);
    expect(findBuildSpot(live, 'shelter')).toBe(true);
    live.setBuildMode('shelter');
    pressE(live);
    run(live, 60 * (BUILDINGS.shelter.buildSeconds + 1));
    const home = live.home()!;
    expect(home).toBeDefined();
    let far: { x: number; y: number } | null = null;
    for (let r = 200; r > 60 && !far; r -= 10) for (let k = 0; k < 16 && !far; k++) {
      const a = (k / 16) * Math.PI * 2;
      const p = live.collision.nearestFree(Math.round(home.x + Math.cos(a) * r), Math.round(home.y + Math.sin(a) * r * 0.7), live.blobbi.footRx, live.blobbi.footRy);
      if (p && Math.hypot(p.x - home.x, p.y - home.y) > 60) far = p;
    }
    expect(far).not.toBeNull();
    stand(live, far!.x, far!.y, 'down');
    live.care.energy = 2;
    live.rest();
    for (let i = 0; i < 60 * 120 && live.care.energy < 40; i++) live.update(1 / 60, IDLE_INPUT);
    expect(live.care.energy).toBeGreaterThanOrEqual(40);
    // Without a home: a nap right here.
    const lone = worker().live;
    lone.care.energy = 2;
    lone.rest();
    run(lone, 60 * 30);
    expect(lone.care.energy).toBeGreaterThan(EXHAUSTED + 20);
    lone.rest(); // wake
    run(lone, 10);
    lone.equip(ITEMS.axe.id);
    const index = face(lone, 'tree');
    pressUntil(lone, () => lone.treeAt(index).phase === 'stump', 6);
    expect(lone.treeAt(index).phase).toBe('stump');
  });

  it('costs the same every time: two worlds, the same work, the same energy', () => {
    const a = worker().live;
    const b = worker().live;
    for (const live of [a, b]) {
      live.equip(ITEMS.axe.id);
      const index = face(live, 'tree');
      pressUntil(live, () => live.treeAt(index).phase === 'stump', 6);
      live.equip(ITEMS.hoe.id);
      const [cell] = findField(live, 1)!;
      standAbove(live, cell);
      pressE(live);
    }
    expect(a.care.energy).toBe(b.care.energy);
    expect(a.care.energy).toBeLessThan(100 - 3 * STAMINA.chop - STAMINA.till + 0.001);
  });
});
