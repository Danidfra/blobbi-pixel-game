import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { memoryStore, saveKey, loadSave } from '../src/game/persistence';
import { BOND, GROWTH_STAGES, OBSERVATIONS, carrierFavourites, carrierFromSave, growthStage, harmony, newCarrier, nextObservation } from '../src/game/carrier';
import { DAY_SECONDS } from '../src/game/daylight';
import { ALL_ITEMS, ITEMS } from '../src/game/items';
import { GameUI } from '../src/ui/game-ui';
import { CarrierScreen } from '../src/ui/screens/carrier';
import { Gfx } from '../src/ui/gfx';
import { paletteFor } from '../src/world/generate';
import { hash32 } from '../src/core/rng';
import { stand } from '../src/dev/scripted-play';

const world = generateTurtleWorld('turtle-0');
const atCarrier = (store = memoryStore()) => {
  const live = new LiveWorld(world, 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  // Nothing to pick up at the spot (picking up comes first on E, by design).
  live.resources = live.resources.filter((n) => Math.hypot(n.x - live.listenSpot!.x, n.y - live.listenSpot!.y) > 20);
  stand(live, live.listenSpot!.x, live.listenSpot!.y, 'down');
  return live;
};
const nextDay = (live: LiveWorld) => (live.timeOffset += DAY_SECONDS);

describe('the Carrier as a companion', () => {
  it('greeting counts once a day, and is always welcome', () => {
    const live = atCarrier();
    expect(live.greetCarrier()).toBe(true);
    expect(live.carrier.bond).toBe(BOND.greet);
    expect(live.greetCarrier()).toBe(false); // the same day: a hello, no more bond
    expect(live.carrier.bond).toBe(BOND.greet);
    expect(live.turtleAnim.blinkUntil).toBeGreaterThan(0); // its own blink answers
    nextDay(live);
    expect(live.greetCarrier()).toBe(true);
    expect(live.carrier.bond).toBe(2 * BOND.greet);
  });

  it('observations come one at a time, are kept, and respect day and night', () => {
    const c = newCarrier();
    const day = nextObservation(c, false)!;
    expect(day.when).not.toBe('night');
    const all = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const o = nextObservation(c, i % 2 === 0);
      if (!o) continue;
      c.observations.push(o.id);
      all.add(o.id);
    }
    expect(all.size).toBe(OBSERVATIONS.length);
    const live = atCarrier();
    const id = live.observeCarrier();
    expect(id).toBe(OBSERVATIONS[0].id);
    expect(live.carrier.observations).toEqual([id]);
    expect(live.carrier.bond).toBe(BOND.observe);
  });

  it('offering takes one item; a favourite counts more and is remembered; non-food is refused', () => {
    const live = atCarrier();
    const likes = live.carrierLikes;
    expect(likes.length).toBeGreaterThan(0);
    expect(live.carrierLikes).toEqual(likes); // stable
    live.inventory.add(likes[0], 2);
    expect(live.offerToCarrier(likes[0])).toBe(true);
    expect(live.inventory.count(likes[0])).toBe(1);
    expect(live.carrier.bond).toBe(BOND.favourite);
    expect(live.carrier.likesFound).toEqual([likes[0]]);
    live.inventory.add(ITEMS.stone.id, 1);
    expect(live.offerToCarrier(ITEMS.stone.id)).toBe(false);
    expect(live.inventory.count(ITEMS.stone.id)).toBe(1);
    const food = ALL_ITEMS.find((d) => d.food && !likes.includes(d.id))!;
    live.inventory.add(food.id, 1);
    expect(live.offerToCarrier(food.id)).toBe(true); // same day: taken kindly, no extra bond
    expect(live.carrier.bond).toBe(BOND.favourite);
  });

  it('favourites come from the Carrier\'s own seed', () => {
    const c = ['a', 'b', 'c', 'd', 'e'];
    expect(carrierFavourites('t1', c)).toEqual(carrierFavourites('t1', c));
    const many = new Set(Array.from({ length: 20 }, (_, i) => carrierFavourites(`t${i}`, c).join()));
    expect(many.size).toBeGreaterThan(3);
  });

  it('resting by the head and standing still there (the island breathes) count once a day', () => {
    const live = atCarrier();
    expect(live.restByCarrier()).toBe(true);
    expect(live.carrier.bond).toBe(BOND.rest);
    expect(live.brain.state === 'rest' || live.brain.state === 'to-shelter').toBe(true);
    const still = atCarrier();
    for (let i = 0; i < 60 * 7; i++) still.update(1 / 60, IDLE_INPUT);
    expect(still.carrier.counts.breathe).toBe(1);
    expect(still.carrier.bond).toBe(BOND.breathe);
    expect(still.carrier.observations).toContain('breath');
  });

  it('E listens the first time (the quest), and opens the Carrier panel once it is known', () => {
    const live = atCarrier();
    live.interact(true);
    expect(live.tally.talked).toBe(1);
    expect(live.uiRequest).toBeNull();
    live.objectives.completed.carrier = live.worldTime;
    expect(live.prompt()).toBe('E  the Carrier');
    live.interact(true);
    expect(live.uiRequest?.screen).toBe('carrier');
  });
});

describe('harmony (non-punitive)', () => {
  const base = { bond: 0, tally: { decorations: 0, flowers: 0, planted: 0, harvested: 0, built: 0 }, found: 0, days: 1 };
  it('starts quiet and grows with bond, care, wonder and time, capped at 100', () => {
    expect(harmony(base).value).toBe(0);
    expect(harmony(base).name).toBe('quiet');
    expect(harmony({ ...base, bond: 20 }).value).toBeGreaterThan(0);
    expect(harmony({ bond: 999, tally: { decorations: 99, flowers: 99, planted: 99, harvested: 99, built: 99 }, found: 99, days: 999 }).value).toBe(100);
  });

  it('never falls: every input is a lifetime count, so removing things cannot lower it', () => {
    const live = atCarrier();
    live.greetCarrier();
    live.tally.decorations = 4;
    const before = live.harmony().value;
    // Pull every building out of the world: the tallies (and harmony) stay.
    live.buildings.length = 0;
    expect(live.harmony().value).toBe(before);
    // Neglect: days pass, needs drop; harmony does not.
    live.care.hunger = 0;
    live.care.happiness = 0;
    nextDay(live);
    expect(live.harmony().value).toBeGreaterThanOrEqual(before);
    // Random monotone sequences never decrease it.
    let last = 0;
    const h = { ...base, tally: { ...base.tally } };
    for (let i = 0; i < 200; i++) {
      const k = hash32(`step${i}`) % 5;
      if (k === 0) h.bond += 1;
      if (k === 1) h.tally.decorations += 1;
      if (k === 2) h.found += 1;
      if (k === 3) h.days += 1;
      if (k === 4) h.tally.planted += 1;
      const v = harmony(h).value;
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
});

describe('growth (designed, not applied)', () => {
  it('computes stages from harmony and days, and never changes the world', () => {
    expect(growthStage(0, 1).stage.stage).toBe('young');
    expect(growthStage(100, 100).stage.stage).toBe('ancient');
    expect(growthStage(100, 1).stage.stage).toBe('young'); // age is needed too
    expect(growthStage(40, 6).planned.map((e) => e.id)).toEqual(['rim-meadow']);
    expect(growthStage(100, 100).applied).toBe(false);
    expect(GROWTH_STAGES.map((g) => g.harmony)).toEqual([...GROWTH_STAGES.map((g) => g.harmony)].sort((a, b) => a - b));
    // A long, happy life with the Carrier: the turtle, the terrain and every placement are byte-identical.
    const fresh = generateTurtleWorld('turtle-0');
    const sig = (w: typeof fresh) => hash32(JSON.stringify({ turtle: w.turtle?.head, carrier: w.carrier?.seed, objects: w.objects.map((o) => [o.kind, o.x, o.y]), cls: Array.from(w.terrain.cls.slice(0, 5000)) }));
    const live = atCarrier();
    for (let d = 0; d < 5; d++) {
      live.greetCarrier();
      live.observeCarrier();
      nextDay(live);
    }
    live.tally.decorations = 50;
    expect(live.carrierGrowth().stage.stage).not.toBe('ancient');
    expect(sig(live.world)).toBe(sig(fresh));
  });
});

describe('carrier save (schema 8)', () => {
  it('round-trips the bond, and a schema 7 record migrates with a fresh one', () => {
    const store = memoryStore();
    const live = atCarrier(store);
    live.greetCarrier();
    live.observeCarrier();
    live.save();
    const again = new LiveWorld(world, 'blobbi-9', 16, { store });
    expect(again.carrier.bond).toBe(live.carrier.bond);
    expect(again.carrier.observations).toEqual(live.carrier.observations);
    const raw = JSON.parse(store.get(saveKey(live.identity))!);
    expect(raw.version).toBe(11);
    const v7 = { ...raw, version: 7 };
    delete v7.carrier;
    store.set(saveKey(live.identity), JSON.stringify(v7));
    const migrated = loadSave(store, live.identity)!;
    expect(migrated.carrier).toEqual(newCarrier());
    expect(carrierFromSave({ bond: -5, observations: ['eye', 'nope', 3] }).observations).toEqual(['eye']);
    expect(carrierFromSave({ bond: -5 }).bond).toBe(0);
  });
});

describe('carrier panel', () => {
  it('runs the interactions by keyboard, offers through a picker, and draws', () => {
    const live = atCarrier();
    live.objectives.completed.carrier = 0;
    const ui = new GameUI(() => live, () => paletteFor('cozy'));
    const screen = new CarrierScreen();
    ui.register(screen);
    ui.open('carrier');
    ui.handleKey('ArrowDown');
    ui.handleKey('Enter'); // greet
    expect(live.carrier.counts.greet).toBe(1);
    const food = live.carrierLikes[0];
    live.inventory.add(food, 1);
    ui.handleKey('ArrowDown');
    ui.handleKey('ArrowDown');
    ui.handleKey('Enter'); // offer → picker
    expect(screen.offering).toBe(true);
    ui.handleKey('Enter');
    expect(live.carrier.counts.offer).toBe(1);
    expect(screen.offering).toBe(false);
    const g = new Gfx(304, 184);
    screen.draw(g, ui, 4, 15, 296, 157);
    expect(g.hits.length).toBeGreaterThan(4);
  });
});
