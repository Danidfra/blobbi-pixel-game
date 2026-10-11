import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { memoryStore, saveKey } from '../src/game/persistence';
import { ALL_ITEMS, ITEMS, itemById } from '../src/game/items';
import { BUILDINGS, BUILDING_KINDS } from '../src/game/buildings';
import { RECIPES, recipeById } from '../src/game/crafting';
import { QUESTS, activeQuests, advanceObjectives, finishRequest, newObjectives, newTally, requestProgress, startRequest } from '../src/game/objectives';
import { QUEST_CONTENT, REQUEST_POOL } from '../src/content/quests';
import { LORE, loreById } from '../src/content/lore';
import { DISCOVERY_CONTENT } from '../src/content/discoveries';
import { MEAL_CONTENT } from '../src/content/meals';
import { PLACEABLE_CONTENT } from '../src/content/placeables';
import { DAY_SECONDS, clockLabel, hourAt, lightAt, nextDawn } from '../src/game/daylight';
import { FRIEND_LEVELS, friendLevel, tastesFor } from '../src/game/friendship';
import { Inventory } from '../src/game/inventory';
import { findBuildSpot, playLoop, playStory, pressE, run, stand } from '../src/dev/scripted-play';
import { GameUI } from '../src/ui/game-ui';
import { JournalScreen } from '../src/ui/screens/journal';
import { CraftingScreen } from '../src/ui/screens/crafting';
import { paletteFor } from '../src/world/generate';

const world = () => generateTurtleWorld('turtle-0');
const quiet = (store = memoryStore()) => {
  const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  return live;
};
const ids = new Set(ALL_ITEMS.map((d) => d.id));

describe('the quest catalogue', () => {
  it('10+ main quests over two chapters, 10+ side quests, discovery quests; every reference resolves; no cycles', () => {
    const main = QUEST_CONTENT.filter((q) => q.type === 'main');
    expect(main.length).toBeGreaterThanOrEqual(10);
    expect(main.filter((q) => q.chapter === 1).length).toBeGreaterThanOrEqual(8);
    expect(main.filter((q) => q.chapter === 1).length).toBeLessThanOrEqual(12);
    expect(QUEST_CONTENT.filter((q) => q.type === 'side').length).toBeGreaterThanOrEqual(10);
    expect(QUEST_CONTENT.filter((q) => q.type === 'discovery').length).toBeGreaterThanOrEqual(3);
    expect(REQUEST_POOL.length).toBeGreaterThanOrEqual(6);
    const questIds = new Set(QUEST_CONTENT.map((q) => q.id));
    expect(questIds.size).toBe(QUEST_CONTENT.length);
    for (const q of QUEST_CONTENT) {
      for (const r of q.requires ?? []) expect(questIds.has(r), `${q.id} requires ${r}`).toBe(true);
      for (const i of q.reward.items ?? []) expect(ids.has(i.item), `${q.id} rewards ${i.item}`).toBe(true);
      for (const l of q.reward.lore ?? []) expect(loreById(l), `${q.id} lore ${l}`).toBeDefined();
      for (const u of q.reward.unlocks ?? []) expect(BUILDING_KINDS).toContain(u);
      expect(q.story.length + q.hint.length).toBeGreaterThan(20);
    }
    for (const r of REQUEST_POOL) for (const i of r.reward.items) expect(ids.has(i.item)).toBe(true);
    // Every recipe's unlock names a real quest.
    for (const r of RECIPES) if (r.unlock) expect(questIds.has(r.unlock), `${r.id} unlock ${r.unlock}`).toBe(true);
    for (const d of DISCOVERY_CONTENT) expect(loreById(d.lore)).toBeDefined();
    // No cycles: following prerequisites always ends.
    const depth = (id: string, seen = new Set<string>()): number => {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      const q = QUEST_CONTENT.find((x) => x.id === id)!;
      return 1 + Math.max(0, ...(q.requires ?? []).map((r) => depth(r, new Set(seen))));
    };
    for (const q of QUEST_CONTENT) expect(depth(q.id)).toBeGreaterThan(0);
    expect(LORE.length).toBeGreaterThanOrEqual(12);
  });

  it('quests run in parallel lines (the garden does not wait for the shelter) and complete once each', () => {
    const state = newObjectives();
    const tally = newTally();
    const ctx = { tally, inventory: new Inventory('w'), buildings: [], worldTime: 1 };
    tally.collected = 5;
    tally.axesCrafted = 1;
    tally.felled = 1;
    tally.plots = 1;
    advanceObjectives(state, ctx);
    expect(Object.keys(state.completed)).toEqual(expect.arrayContaining(['gather', 'axe', 'wood', 'plot']));
    expect('shelter' in state.completed).toBe(false);
    const active = activeQuests(state).map((q) => q.id);
    expect(active).toEqual(expect.arrayContaining(['arrive', 'meet', 'shelter', 'plant', 'improve', 'side-shells']));
    expect(advanceObjectives(state, ctx)).toEqual([]);
  });
});

describe('quests in the world', () => {
  it('looking at the journal never counts; finishing a quest grants its items, notes and friendship once, across reloads', () => {
    const store = memoryStore();
    const live = quiet(store);
    const ui = new GameUI(() => live, () => paletteFor('cozy'));
    const journal = new JournalScreen();
    ui.register(journal);
    const before = JSON.stringify([live.objectives, live.tally, live.inventory.snapshot()]);
    ui.handleKey('KeyJ');
    for (const tab of ['quests', 'notes', 'finds'] as const) {
      journal.tab = tab;
      journal.rows(ui);
    }
    ui.handleKey('Escape');
    expect(JSON.stringify([live.objectives, live.tally, live.inventory.snapshot()])).toBe(before);
    // Pet the Blobbi: 'meet' completes, its note arrives, friendship grows.
    live.pet();
    run(live, 2);
    expect('meet' in live.objectives.completed).toBe(true);
    expect(live.objectives.lore).toContain('blobbi');
    expect(live.companion.friendship).toBeGreaterThan(0);
    live.save();
    const b = quiet(store);
    run(b, 5);
    expect(b.objectives.completed.meet).toBe(live.objectives.completed.meet);
    expect(b.objectives.lore).toEqual(live.objectives.lore);
    expect(b.companion.friendship).toBe(live.companion.friendship);
  });

  it('island requests: start after the shelter, count from their start, reward once, the next at the following dawn, never expire', () => {
    const state = newObjectives();
    const tally = newTally();
    tally.collected = 50;
    expect(startRequest(state, tally, 10)).toBeNull(); // no shelter yet
    state.completed.shelter = 0;
    const r = startRequest(state, tally, 10)!;
    expect(r).toBeDefined();
    expect(requestProgress(state, tally)!.have).toBe(0); // what was done before does not count
    // A long break: still there, still at 0.
    expect(finishRequest(state, tally, nextDawn(1e6))).toBeNull();
    expect(state.request?.id).toBe(r.id);
    tally[r.goal.tally] += r.goal.n;
    const done = finishRequest(state, tally, nextDawn(20))!;
    expect(done.id).toBe(r.id);
    expect(finishRequest(state, tally, nextDawn(20))).toBeNull();
    expect(startRequest(state, tally, 20)).toBeNull(); // before dawn
    const next = startRequest(state, tally, state.nextRequestAt!)!;
    expect(next.id).not.toBe(r.id);
  });
});

describe('discoveries and the Carrier', () => {
  it('eight finds at stable, reachable spots; E picks one up with its item and note; nothing is built on them', () => {
    const a = quiet();
    const b = quiet();
    expect(a.discoveries.length).toBe(8);
    expect(a.discoveries.map((d) => [d.id, d.x, d.y])).toEqual(b.discoveries.map((d) => [d.id, d.x, d.y]));
    for (const d of a.discoveries) expect(a.collision.canStand(d.x, d.y, 3, 2)).toBe(true);
    const d = a.discoveries.find((x) => x.id === 'bottle')!;
    // Nothing may be built over it.
    expect(a.placementCheck('fence', { x: d.x, y: d.y }).ok).toBe(false);
    stand(a, d.x, d.y + 3, 'down');
    expect(a.prompt()).toBe('E  pick up something glinting');
    pressE(a);
    expect(a.found.has('bottle')).toBe(true);
    expect(a.inventory.count(d.content.item.id)).toBe(1);
    expect(a.objectives.lore).toContain('blobbis-and-carriers');
    expect(a.tally.discoveries).toBe(1);
    run(a, 2);
    expect('discover-bottle' in a.objectives.completed).toBe(true);
    expect(a.readable(d.content.item.id)).toBe(true);
    expect(a.noteFor(d.content.item.id)).toBe('blobbis-and-carriers');
    expect(a.hiddenDiscoveries.length).toBe(7);
  });

  it('listening to the Carrier at the shore: the turtle blinks and glances (its own animations), the island hums', () => {
    const live = quiet();
    expect(live.listenSpot).not.toBeNull();
    stand(live, live.listenSpot!.x, live.listenSpot!.y, 'down');
    expect(live.nearCarrier()).toBe(true);
    // (E picks up anything lying in reach first, as everywhere.)
    if (!live.facingObject() && !live.nearestResource() && !live.nearestDiscovery()) expect(live.prompt()).toBe('E  listen to the Carrier');
    live.listen();
    expect(live.tally.talked).toBe(1);
    expect(live.turtleAnim.blinkUntil).toBeGreaterThan(live.clock.time);
    expect(live.turtleAnim.glance).not.toBe(0);
    expect(live.bubble?.text).toContain('hum');
  });
});

describe('cooking', () => {
  it('15 meals, each made of registered ingredients, feeding hunger and (some) energy and joy', () => {
    expect(MEAL_CONTENT.length).toBeGreaterThanOrEqual(12);
    for (const m of MEAL_CONTENT) {
      for (const i of m.ingredients) expect(ids.has(i.item), `${m.id} needs ${i.item}`).toBe(true);
      expect(itemById(m.id)?.category).toBe('food');
    }
    expect(MEAL_CONTENT.filter((m) => m.food.energy).length).toBeGreaterThan(4);
    expect(MEAL_CONTENT.filter((m) => m.food.joy).length).toBeGreaterThan(8);
  });

  it('at a cooking station: ingredients in, a meal out, atomically; not without the station or the recipe; full stacks refuse', () => {
    const live = quiet();
    live.objectives.completed.harvest = 0; // the stove plans
    const stove = recipeById('blobbi-pixel:recipe:cooking-station')!;
    for (const i of stove.ingredients) live.inventory.add(i.item, i.quantity);
    expect(live.craftRecipe(stove)).toBe(true);
    const roast = recipeById('blobbi-pixel:recipe:roasted-turnip')!;
    live.inventory.add(ITEMS.turnip.id, 3);
    expect(live.craftRecipe(roast)).toBe(false); // no stove nearby
    expect(live.inventory.count(ITEMS.turnip.id)).toBe(3);
    live.inventory.add(BUILDINGS['cooking-station'].item!, 0);
    expect(findBuildSpot(live, 'cooking-station')).toBe(true);
    live.startPlacing(BUILDINGS['cooking-station'].item!);
    pressE(live);
    run(live, 150);
    const s = live.buildings.find((b) => b.kind === 'cooking-station')!;
    stand(live, s.x, s.y + BUILDINGS['cooking-station'].footRy + 4, 'up');
    expect(live.prompt()).toBe('E  cook');
    pressE(live);
    expect(live.uiRequest?.screen).toBe('cooking');
    expect(live.craftRecipe(roast)).toBe(true);
    expect(live.inventory.count(ITEMS.turnip.id)).toBe(2);
    expect(live.inventory.count('blobbi-pixel:meal:roasted-turnip')).toBe(1);
    expect(live.tally.cooked).toBe(1);
    // A recipe not learnt yet.
    const soup = recipeById('blobbi-pixel:recipe:carrot-soup')!;
    live.objectives.completed = { harvest: 0 };
    live.inventory.add(ITEMS.carrot.id, 2);
    live.inventory.add('blobbi-pixel:resource:herb', 1);
    expect(live.recipeKnown(soup)).toBe(false);
    expect(live.craftRecipe(soup)).toBe(false);
    // Full output stack: nothing is consumed.
    live.inventory.add('blobbi-pixel:meal:roasted-turnip', 99);
    const turnips = live.inventory.count(ITEMS.turnip.id);
    expect(live.craftRecipe(roast)).toBe(false);
    expect(live.inventory.count(ITEMS.turnip.id)).toBe(turnips);
    // The cooking screen lists only meals.
    const ui = new GameUI(() => live, () => paletteFor('cozy'));
    const cooking = new CraftingScreen('cooking');
    ui.register(cooking);
    ui.poll();
    expect(cooking.entries(ui).every((e) => e.recipe?.group === 'meals')).toBe(true);
  });

  it('a meal restores energy and joy as well as hunger; a cup of tea is accepted when full but tired', () => {
    const live = quiet();
    live.care.hunger = 40;
    live.care.energy = 30;
    live.care.happiness = 50;
    live.inventory.add('blobbi-pixel:meal:mushroom-soup', 1);
    expect(live.feed('blobbi-pixel:meal:mushroom-soup')).toBe(true);
    expect(live.care.hunger).toBe(90);
    expect(live.care.energy).toBe(45);
    expect(live.tally.mealsFed).toBe(1);
    live.care.hunger = 100;
    live.inventory.add('blobbi-pixel:meal:lavender-tea', 1);
    expect(live.feed('blobbi-pixel:meal:lavender-tea')).toBe(true);
    expect(live.care.energy).toBe(70);
    live.inventory.add(ITEMS.turnip.id, 1);
    expect(live.feed(ITEMS.turnip.id)).toBe(false); // full: no waste
  });
});

describe('friendship and tastes', () => {
  it('levels from points; tastes are the Blobbi\'s own (from its seed); favourites are a bigger treat; friendship only grows', () => {
    expect(friendLevel(0)).toBe(1);
    expect(friendLevel(FRIEND_LEVELS[2])).toBe(3);
    const foods = ALL_ITEMS.filter((d) => d.food).map((d) => d.id);
    expect(tastesFor('blobbi-9', foods, ['a', 'b'])).toEqual(tastesFor('blobbi-9', foods, ['a', 'b']));
    expect(tastesFor('blobbi-9', foods, ['a', 'b'])).not.toEqual(tastesFor('blobbi-7', foods, ['a', 'b']));
    const live = quiet();
    const fav = live.tastes.foods[0];
    const plain = ALL_ITEMS.find((d) => d.food && !live.tastes.foods.includes(d.id))!.id;
    live.care.hunger = 10;
    live.inventory.add(plain, 1);
    live.feed(plain);
    const afterPlain = live.companion.friendship;
    live.care.hunger = 10;
    live.inventory.add(fav, 1);
    live.feed(fav);
    expect(live.companion.friendship - afterPlain).toBeGreaterThan(afterPlain);
    expect(live.tally.favourites).toBe(1);
    expect(live.companion.tasted.has(fav)).toBe(true);
    // A long idle stretch: friendship stays.
    const f = live.companion.friendship;
    run(live, 60 * 60);
    expect(live.companion.friendship).toBe(f);
  });

  it('the save never names a Blobbi: companion state stays with the island (M3.4 rule)', () => {
    const store = memoryStore();
    const live = quiet(store);
    live.pet();
    live.save();
    const raw = store.get(saveKey(live.identity))!;
    expect(raw).not.toContain('blobbi-9');
    expect(JSON.parse(raw).companion.friendship).toBeGreaterThan(0);
  });
});

describe('day and night', () => {
  it('runs on world time, starts in the morning, dawns predictably, and is never too dark', () => {
    expect(hourAt(0)).toBe(7);
    expect(lightAt(0).dark).toBe(0);
    expect(clockLabel(0)).toBe('7:00 in the morning');
    let darkest = 0;
    for (let t = 0; t < DAY_SECONDS; t += 10) darkest = Math.max(darkest, lightAt(t).dark);
    expect(darkest).toBeLessThanOrEqual(0.45);
    expect(darkest).toBeGreaterThan(0.3);
    const d = nextDawn(100);
    expect(hourAt(d)).toBeCloseTo(6, 5);
    expect(d).toBeGreaterThan(100);
    expect(nextDawn(d)).toBeCloseTo(d + DAY_SECONDS, 5);
  });
});

describe('content sanity', () => {
  it('every placeable recipe and meal is reachable: its unlock quest exists and its ingredients can be obtained', () => {
    // Obtainable: a forage or crop or core item, a reward, or another recipe's output.
    const outputs = new Set(RECIPES.map((r) => r.output.item));
    const rewards = new Set(QUEST_CONTENT.flatMap((q) => (q.reward.items ?? []).map((i) => i.item)));
    for (const r of RECIPES)
      for (const i of r.ingredients) {
        const def = itemById(i.item)!;
        const natural = ['resource', 'material', 'food', 'seed'].includes(def.category);
        expect(natural || outputs.has(i.item) || rewards.has(i.item), `${r.id}: ${i.item}`).toBe(true);
      }
    expect(PLACEABLE_CONTENT.every((p) => !p.unlock || QUESTS.some((q) => q.id === p.unlock))).toBe(true);
    void IDLE_INPUT;
  });
});

describe('the whole story, played', () => {
  it('both chapters can be finished by real actions (gather, build, farm, furnish, cook, discover, listen, restore); a reload grants nothing again', () => {
    const store = memoryStore();
    const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
    playLoop(live);
    expect(playStory(live)).toEqual([]);
    expect(live.objectives.lore!.length).toBeGreaterThanOrEqual(6);
    expect(live.tally.cooked).toBeGreaterThan(0);
    expect(live.found.has('carrier-stone')).toBe(true);
    live.save();
    const bag = live.inventory.snapshot().items;
    const b = new LiveWorld(world(), 'blobbi-9', 16, { store });
    b.brain.enabled = false;
    run(b, 120);
    expect(b.inventory.snapshot().items).toEqual(bag);
    expect(Object.keys(b.objectives.completed).sort()).toEqual(Object.keys(live.objectives.completed).sort());
  });
});
