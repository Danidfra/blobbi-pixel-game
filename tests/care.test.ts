import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { memoryStore } from '../src/game/persistence';
import { ITEMS, FOODS, foodValue } from '../src/game/items';
import { BUILDINGS } from '../src/game/buildings';
import { FULL, HUNGRY, JOY, NEW_CARE, PET_COOLDOWN, RATES, TIRED, careFromSave, eat, mood, newCare, speedFactor, stepCare } from '../src/game/care';
import { BlobbiAnimator } from '../src/blobbi/animation';
import { MIN_NAP } from '../src/sim/brain';
import { findBuildSpot, pressE, run } from '../src/dev/scripted-play';

const world = () => generateTurtleWorld('turtle-0');
const quiet = (store = memoryStore()) => {
  const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  return live;
};

describe('needs (pure)', () => {
  it('start comfortable, fall gently, recover by resting (twice as fast in a shelter), never leave 0..100', () => {
    const c = newCare();
    expect({ ...c }).toEqual({ ...NEW_CARE });
    stepCare(c, 60, { resting: false, sheltered: false, moving: false });
    expect(c.hunger).toBeCloseTo(100 - RATES.hunger * 60, 6);
    expect(c.energy).toBeCloseTo(100 - RATES.energyAwake * 60, 6);
    const walking = newCare();
    stepCare(walking, 60, { resting: false, sheltered: false, moving: true });
    expect(walking.energy).toBeLessThan(c.energy);
    const a = { ...newCare(), energy: 20 };
    const b = { ...newCare(), energy: 20 };
    stepCare(a, 10, { resting: true, sheltered: false, moving: false });
    stepCare(b, 10, { resting: true, sheltered: true, moving: false });
    expect(a.energy - 20).toBeCloseTo(RATES.energyResting * 10, 6);
    expect(b.energy - 20).toBeCloseTo(2 * (a.energy - 20), 6);
    const long = newCare();
    for (let i = 0; i < 10000; i++) stepCare(long, 1, { resting: false, sheltered: false, moving: true });
    expect(long.hunger).toBe(0);
    expect(long.energy).toBe(0);
    // Happiness drifts only down to a floor (lower when hungry or tired): sad, never punished further.
    expect(long.happiness).toBe(20);
    const fine = { ...newCare(), happiness: 90 };
    for (let i = 0; i < 100; i++) stepCare(fine, 1, { resting: true, sheltered: false, moving: false });
    expect(fine.happiness).toBeLessThan(90);
    expect(fine.happiness).toBeGreaterThanOrEqual(40);
  });

  it('eating restores hunger and joy (more when hungry); a full Blobbi refuses', () => {
    const c = { ...newCare(), hunger: 20, happiness: 50 };
    expect(eat(c, 25)).toBe(true);
    expect(c.hunger).toBe(45);
    expect(c.happiness).toBe(50 + JOY.feed + JOY.hungryFeed);
    const full = { ...newCare(), hunger: FULL };
    expect(eat(full, 25)).toBe(false);
    expect(full.hunger).toBe(FULL);
  });

  it('low needs only slow the walk a little and change the face', () => {
    expect(speedFactor(newCare())).toBe(1);
    expect(speedFactor({ ...newCare(), hunger: 10 })).toBe(0.85);
    expect(mood(newCare())).toBeNull(); // the approved neutral face for a comfortable Blobbi
    expect(mood({ ...newCare(), energy: 10 })).toBe('sleepy');
    expect(mood({ ...newCare(), hunger: 10 })).toBe('sad');
    expect(mood({ ...newCare(), happiness: 90 })).toBe('happy');
    const anim = new BlobbiAnimator('x');
    anim.state.mood = 'sad';
    expect(anim.pose(0).expression).toBe('sad');
    anim.react('excited', 0, 1, 0);
    expect(anim.pose(0.5).expression).toBe('excited'); // a reaction wins over the mood
    anim.state.sleeping = true;
    anim.state.reaction = null;
    expect(anim.pose(2).expression).toBe('sleepy');
  });

  it('a malformed care record falls back to a comfortable Blobbi', () => {
    expect(careFromSave(null)).toEqual(newCare());
    expect(careFromSave({ hunger: 'x', energy: 400, happiness: -3 })).toMatchObject({ hunger: 100, energy: 100, happiness: 0 });
  });
});

describe('feeding', () => {
  it('F gives one food (the smallest first): hunger up, a happy reaction, the bag one lighter; a full Blobbi keeps the food', () => {
    const live = quiet();
    live.inventory.add(ITEMS.turnip.id, 2);
    live.inventory.add(ITEMS.pumpkin.id, 1);
    expect(live.feed()).toBe(false); // full at the start: nothing eaten
    expect(live.inventory.count(ITEMS.turnip.id)).toBe(2);
    live.care.hunger = 40;
    // Of what is in the bag, the food with the smallest hunger value comes first.
    expect(live.foodToGive()).toBe(ITEMS.turnip.id);
    expect(FOODS.indexOf(ITEMS.turnip.id)).toBeLessThan(FOODS.indexOf(ITEMS.pumpkin.id));
    expect(live.feed()).toBe(true);
    expect(live.inventory.count(ITEMS.turnip.id)).toBe(1);
    expect(live.care.hunger).toBe(40 + foodValue(ITEMS.turnip.id));
    expect(live.blobbi.animator.state.reaction?.expression).toBe('excited');
    expect(live.tally.fed).toBe(1);
    expect(live.particles.particles.some((p) => p.kind === 'heart')).toBe(true);
    // No food at all: says so, nothing changes.
    live.inventory.remove(ITEMS.turnip.id, 9);
    live.inventory.remove(ITEMS.pumpkin.id, 9);
    live.care.hunger = 10;
    expect(live.feed()).toBe(false);
    expect(live.care.hunger).toBe(10);
  });

  it('the updated need persists', () => {
    const store = memoryStore();
    const live = quiet(store);
    live.inventory.add(ITEMS.carrot.id, 1);
    live.care.hunger = 30;
    live.feed();
    const b = quiet(store);
    expect(b.care.hunger).toBeCloseTo(65, 3);
    expect(b.inventory.count(ITEMS.carrot.id)).toBe(0);
  });

  it('autonomy never eats, even hungry with food in the bag', () => {
    const live = new LiveWorld(world(), 'blobbi-9', 16);
    live.inventory.add(ITEMS.turnip.id, 3);
    live.care.hunger = 10;
    run(live, 60 * 120);
    expect(live.inventory.count(ITEMS.turnip.id)).toBe(3);
    expect(live.tally.fed).toBe(0);
  });
});

describe('energy, rest and the shelter', () => {
  it('a tired Blobbi rests on its own and gets up rested; the rest restores energy and raises joy', () => {
    const live = new LiveWorld(world(), 'blobbi-9', 16);
    live.care.energy = TIRED - 5;
    live.care.happiness = 50;
    let rested = false;
    for (let i = 0; i < 60 * 90 && !rested; i++) {
      live.update(1 / 60, IDLE_INPUT);
      if (live.brain.state === 'rest') rested = true;
    }
    expect(rested).toBe(true);
    expect(live.blobbi.animator.state.sleeping).toBe(true);
    let woke = false;
    for (let i = 0; i < 60 * 120 && !woke; i++) {
      live.update(1 / 60, IDLE_INPUT);
      if (live.brain.state !== 'rest') woke = true;
    }
    expect(woke).toBe(true);
    expect(live.care.energy).toBeGreaterThan(94.9); // woke at RESTED (95), then one awake step
    expect(live.care.happiness).toBeGreaterThan(50);
  });

  it('with a shelter it walks to the doorway and sleeps there, recovering twice as fast; WASD wakes it at once', () => {
    const live = quiet();
    live.inventory.add(ITEMS.wood.id, 6);
    live.inventory.add(ITEMS.stone.id, 3);
    expect(findBuildSpot(live, 'shelter')).toBe(true);
    live.setBuildMode('shelter');
    pressE(live);
    run(live, Math.ceil(BUILDINGS.shelter.buildSeconds * 60) + 10);
    // Walk away a little, get tired.
    const shelter = live.buildings[0];
    live.blobbi.x = shelter.x + 40;
    live.blobbi.y = shelter.y + 30;
    if (!live.collision.canStand(live.blobbi.x, live.blobbi.y, live.blobbi.footRx, live.blobbi.footRy)) {
      const spot = live.collision.nearestFree(shelter.x + 40, shelter.y + 30, live.blobbi.footRx, live.blobbi.footRy)!;
      live.blobbi.x = spot.x;
      live.blobbi.y = spot.y;
    }
    live.care.energy = 20;
    live.rest(); // R
    expect(live.brain.state).toBe('to-shelter');
    for (let i = 0; i < 60 * 20 && live.brain.state !== 'rest'; i++) live.update(1 / 60, IDLE_INPUT);
    expect(live.brain.state).toBe('rest');
    expect(live.brain.restAtShelter).toBe(true);
    const door = live.shelterDoor()!;
    expect(Math.hypot(live.blobbi.x - door.x, live.blobbi.y - door.y)).toBeLessThan(6);
    const e0 = live.care.energy;
    run(live, 60);
    expect(live.care.energy - e0).toBeCloseTo(RATES.energyInShelter, 1);
    // The player's keys always win.
    live.update(1 / 60, { ...IDLE_INPUT, left: true });
    expect(live.brain.state).toBe('manual');
    expect(live.blobbi.animator.state.sleeping).toBe(false);
  });

  it('R rests where it stands without a shelter, and R again wakes', () => {
    const live = quiet();
    live.care.energy = 50;
    live.rest();
    expect(live.brain.state).toBe('rest');
    expect(live.brain.restAtShelter).toBe(false);
    run(live, 60);
    expect(live.care.energy).toBeCloseTo(50 + RATES.energyResting, 1);
    live.rest();
    expect(live.brain.state).toBe('idle');
  });

  it('a nap asked for when already rested still lasts a short while, then ends on its own', () => {
    const live = quiet();
    expect(live.care.energy).toBe(100);
    live.rest();
    run(live, 60 * 3);
    expect(live.brain.state).toBe('rest');
    expect(live.blobbi.animator.state.sleeping).toBe(true);
    run(live, 60 * (MIN_NAP - 2));
    expect(live.brain.state).toBe('idle');
  });
});

describe('happiness and reactions', () => {
  it('attention raises joy once per cooldown and always gets a reaction', () => {
    const live = quiet();
    live.care.happiness = 50;
    expect(live.pet()).toBe(true);
    expect(live.care.happiness).toBe(50 + JOY.pet);
    expect(live.pet()).toBe(false);
    expect(live.care.happiness).toBe(50 + JOY.pet);
    expect(live.blobbi.animator.state.reaction?.expression).toBe('happy');
    run(live, 60 * (PET_COOLDOWN + 1));
    expect(live.pet()).toBe(true);
    expect(live.tally.petted).toBe(3);
  });

  it('exploring (autonomous inspections) raises joy', () => {
    const live = new LiveWorld(world(), 'blobbi-9', 16);
    live.care.happiness = 50;
    const before = live.stats.interactions;
    run(live, 60 * 90);
    expect(live.stats.interactions).toBeGreaterThan(before);
    // Drift alone would have lowered it; the inspections lifted it.
    expect(live.care.happiness).toBeGreaterThan(50 - RATES.happinessDrift * 90);
  });

  it('a hungry Blobbi says so now and then, on its own, with a sad face', () => {
    const live = new LiveWorld(world(), 'blobbi-9', 16);
    live.care.hunger = HUNGRY - 10;
    let said = false;
    for (let i = 0; i < 60 * 30 && !said; i++) {
      live.update(1 / 60, IDLE_INPUT);
      if (live.bubble?.text.startsWith('hungry')) said = true;
    }
    expect(said).toBe(true);
    expect(live.blobbi.animator.state.reaction?.expression).toBe('sad');
  });

  it('needs are deterministic and persist', () => {
    const run2 = () => {
      const store = memoryStore();
      const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
      run(live, 60 * 60);
      live.save();
      return { care: { ...live.care }, store };
    };
    const a = run2();
    const b = run2();
    expect(a.care).toEqual(b.care);
    const reloaded = new LiveWorld(world(), 'blobbi-9', 16, { store: a.store });
    expect(reloaded.care.hunger).toBeCloseTo(a.care.hunger, 2);
    expect(reloaded.care.energy).toBeCloseTo(a.care.energy, 2);
    expect(reloaded.care.happiness).toBeCloseTo(a.care.happiness, 2);
  });
});
