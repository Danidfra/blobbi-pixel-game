import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { memoryStore, loadSave, saveKey, worldIdentity, SAVE_VERSION } from '../src/game/persistence';
import { ITEMS, stackLimit } from '../src/game/items';
import { BUILDINGS, BUILDING_KINDS, CRATE_BONUS, MAX_CRATES, buildingSprite, doorwayRect, type BuildingKind } from '../src/game/buildings';
import { M4_OBJECTIVE_IDS, QUESTS, advanceObjectives, currentObjective, newObjectives, newTally, unlockedKinds } from '../src/game/objectives';
import { Inventory } from '../src/game/inventory';
import { paletteFor } from '../src/world/generate';
import { findBuildSpot, playLoop, pressE, run } from '../src/dev/scripted-play';
import { armForHand, attachTool, toolSprite } from '../src/game/equipment';
import { REST_POSE } from '../src/blobbi/pose';
import { resolveBlobbi } from '../src/blobbi/source';

const world = () => generateTurtleWorld('turtle-0');
const palette = paletteFor('cozy');

describe('objectives', () => {
  it('complete in order from what was done, cascade over what is already true, and never twice', () => {
    const state = newObjectives();
    const tally = newTally();
    const inventory = new Inventory('w');
    const ctx = { tally, inventory, buildings: [], worldTime: 5 };
    expect(currentObjective(state)?.id).toBe('arrive');
    // An axe already in the bag does not skip gathering: the axe quest needs it first.
    inventory.add(ITEMS.axe.id, 1);
    expect(advanceObjectives(state, ctx)).toEqual([]);
    tally.collected = 5;
    tally.felled = 1;
    // Gather, then axe (in the bag), then wood (felled) cascade; the shelter stops that line.
    expect(advanceObjectives(state, ctx).map((o) => o.id)).toEqual(['gather', 'axe', 'wood']);
    expect(currentObjective(state)?.id).toBe('arrive'); // the story's first open quest is still 'look around'
    expect(advanceObjectives(state, ctx)).toEqual([]);
    expect(state.completed).toEqual({ gather: 5, axe: 5, wood: 5 });
  });

  it('unlocks decorations only through their goals', () => {
    const state = newObjectives();
    expect([...unlockedKinds(state)]).toEqual(['shelter']);
    for (const o of QUESTS) state.completed[o.id] = 0;
    expect([...unlockedKinds(state)].sort()).toEqual([...BUILDING_KINDS].sort());
    const live = new LiveWorld(world(), 'blobbi-9', 16);
    live.setBuildMode('lantern');
    expect(live.buildMode).toBeNull(); // locked
    live.setBuildMode('shelter');
    expect(live.buildMode).toBe('shelter');
    expect(live.cycleBuildMode()).toBeNull(); // only the shelter is unlocked: B goes back to none
  });

  it('looking at the goals or the prompt never counts', () => {
    const live = new LiveWorld(world(), 'blobbi-9', 16);
    const before = JSON.stringify([live.objectives, live.tally, live.inventory.snapshot()]);
    for (let i = 0; i < 50; i++) {
      currentObjective(live.objectives);
      live.prompt();
      live.farmAction();
      live.unlocked();
    }
    expect(JSON.stringify([live.objectives, live.tally, live.inventory.snapshot()])).toBe(before);
  });

  it('the whole loop, played: every goal completes from real actions, rewards arrive once and survive a reload', () => {
    const store = memoryStore();
    const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
    const seen: Record<string, string[]> = {};
    playLoop(live, (label) => (seen[label] = Object.keys(live.objectives.completed)));
    // Every M4 objective (now chapter-1 quests and a side quest) completes from the loop's real actions.
    for (const id of M4_OBJECTIVE_IDS) expect(Object.keys(live.objectives.completed)).toContain(id);
    expect(seen.GATHERED).toContain('gather');
    expect(seen.TILLED).toContain('plot');
    expect(seen.HARVESTED).toContain('harvest');
    expect(seen.FED).toContain('feed');
    // Rewards: carrot seeds (plot), pumpkin seeds (harvest) arrived exactly as listed; the carrot used one.
    expect(live.inventory.count(ITEMS.carrotSeed.id)).toBe(3 - 1);
    expect(live.inventory.count(ITEMS.pumpkinSeed.id)).toBe(2);
    expect([...live.unlocked()].sort()).toEqual([...BUILDING_KINDS].sort());
    expect(live.buildings.map((b) => b.kind)).toEqual(['shelter', 'lantern', 'bench']);
    live.save();
    const snapshot = live.inventory.snapshot();
    // A reload re-grants nothing.
    const b = new LiveWorld(world(), 'blobbi-9', 16, { store });
    run(b, 120);
    expect(b.inventory.snapshot().items).toEqual(snapshot.items);
    expect(b.objectives.completed).toEqual(live.objectives.completed);
    expect(b.notices).toHaveLength(0);
  });

  it('the loop is deterministic: two plays write the same save', () => {
    const play = () => {
      const store = memoryStore();
      const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
      playLoop(live);
      live.save();
      return store.get(saveKey(live.identity));
    };
    expect(play()).toBe(play());
  });
});

describe('save schema 6 and migration', () => {
  it('migrates a schema 5 record: no plots, comfortable needs, a tally seeded from the record, goals completing from it on the next step', () => {
    const store = memoryStore();
    const w = world();
    const identity = worldIdentity(w);
    const v5 = {
      version: 5,
      owner: 'local-world',
      world: identity,
      collected: ['stick:0', 'stick:1', 'stone:0', 'seed:0', 'stick:2'],
      inventory: { version: 1, context: identity, revision: 4, items: [{ item: ITEMS.axe.id, quantity: 1 }, { item: ITEMS.wood.id, quantity: 3 }] },
      equipped: ITEMS.axe.id,
      trees: { '3': { hits: 0, harvestedAt: 10 } },
      worldTime: 40,
      buildings: [],
      collectedAt: {},
      rocks: {},
    };
    store.set(saveKey(identity), JSON.stringify(v5));
    const loaded = loadSave(store, identity)!;
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.plots).toEqual([]);
    expect(loaded.care).toMatchObject({ hunger: 100, energy: 100, happiness: 70 });
    expect(loaded.tally).toMatchObject({ collected: 5, felled: 1 });
    expect(loaded.objectives.completed).toEqual({});
    const live = new LiveWorld(w, 'blobbi-9', 16, { store });
    expect(live.inventory.count(ITEMS.wood.id)).toBe(3);
    live.brain.enabled = false;
    run(live, 2);
    // Gather (5 collected), axe (in the bag), wood (a felled tree) complete from the old progress; the rewards land.
    expect(Object.keys(live.objectives.completed)).toEqual(['gather', 'axe', 'wood']);
    expect(live.inventory.count(ITEMS.seed.id)).toBe(2);
    expect(live.inventory.count(ITEMS.stone.id)).toBe(2);
    const written = JSON.parse(store.get(saveKey(identity))!);
    expect(written.version).toBe(SAVE_VERSION);
    expect(written.owner).toBe('local-world');
    expect(written.objectives.completed).toMatchObject({ gather: expect.any(Number), axe: expect.any(Number), wood: expect.any(Number) });
  });

  it('schema 6 keeps world ownership separate from the Blobbi: switching Blobbis keeps plots, needs and goals', () => {
    const store = memoryStore();
    const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
    live.care.hunger = 50;
    live.tally.collected = 7;
    live.save();
    const record = store.get(saveKey(live.identity))!;
    const v3 = resolveBlobbi({ seed: 'a'.repeat(64) });
    if (!v3.ok) throw new Error(v3.error);
    live.setBlobbi(v3.source);
    live.save();
    const after = JSON.parse(store.get(saveKey(live.identity))!);
    const before = JSON.parse(record);
    expect(after.care).toEqual(before.care);
    expect(after.tally).toEqual(before.tally);
    expect(JSON.stringify(after)).not.toContain('a'.repeat(64));
  });

  it('unknown building kinds and malformed sections are skipped, never half-read', () => {
    const store = memoryStore();
    const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
    live.save();
    const key = saveKey(live.identity);
    const record = JSON.parse(store.get(key)!);
    record.buildings.push({ id: 'castle:0', kind: 'castle', x: 10, y: 10, placedAt: 0, seed: 's' });
    record.tally = { collected: -3, fed: 2.5, harvested: 4, nonsense: 9 };
    record.objectives = { completed: { gather: 1, 'made-up': 2, axe: 'soon' } };
    store.set(key, JSON.stringify(record));
    const b = new LiveWorld(world(), 'blobbi-9', 16, { store });
    expect(b.buildings).toHaveLength(0);
    expect(b.tally).toEqual({ ...newTally(), harvested: 4 });
    expect(b.objectives.completed).toEqual({ gather: 1 });
  });
});

describe('decorations', () => {
  const unlockAll = (live: LiveWorld) => {
    for (const o of QUESTS) live.objectives.completed[o.id] = 0;
  };

  it('every kind has a cost, a footprint matching its sprite, a deterministic sprite that rises while built', () => {
    for (const kind of BUILDING_KINDS) {
      const def = BUILDINGS[kind];
      expect(def.cost.length).toBeGreaterThan(0);
      const b = { id: `${kind}:0`, kind, x: 0, y: 0, placedAt: 0, seed: `s/${kind}` };
      const s = buildingSprite(b, palette, 1);
      expect(s.footRx).toBe(def.footRx);
      expect(s.buffer.data).toEqual(buildingSprite({ ...b }, palette, 1).buffer.data);
      expect(buildingSprite(b, palette, 0.3).buffer.opaqueCount()).toBeLessThan(s.buffer.opaqueCount() + 1);
    }
    // The player's fence and lantern are the island's own.
    expect(BUILDINGS.fence.category).toBe('decoration');
    expect(BUILDINGS.shelter.category).toBe('building');
  });

  it('placement shows a preview, pays atomically, blocks collision and navigation, and persists', () => {
    const store = memoryStore();
    const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
    live.brain.enabled = false;
    unlockAll(live);
    const placed: BuildingKind[] = ['fence', 'flower-bed', 'lantern', 'bench', 'crate'];
    for (const kind of placed) for (const c of BUILDINGS[kind].cost) live.inventory.add(c.item, c.quantity);
    for (const kind of placed) {
      expect(findBuildSpot(live, kind)).toBe(true);
      live.setBuildMode(kind);
      const check = live.placementCheck();
      expect(check.ok).toBe(true);
      const free = live.nav.freeCount();
      pressE(live);
      const b = live.buildings[live.buildings.length - 1];
      expect(b.kind).toBe(kind);
      expect(live.collision.isBlocked(b.x + 0.5, b.y + 0.5)).toBe(true);
      expect(live.nav.freeCount()).toBeLessThanOrEqual(free);
    }
    for (const kind of placed) for (const c of BUILDINGS[kind].cost) expect(live.inventory.count(c.item)).toBe(0);
    expect(live.tally.decorations).toBe(5);
    // Not enough materials: nothing placed, nothing taken.
    expect(findBuildSpot(live, 'bench')).toBe(true);
    live.setBuildMode('bench');
    pressE(live);
    expect(live.buildings).toHaveLength(5);
    live.save();
    const b = new LiveWorld(world(), 'blobbi-9', 16, { store });
    expect(b.buildings.map((x) => [x.kind, x.x, x.y])).toEqual(live.buildings.map((x) => [x.kind, x.x, x.y]));
    for (const x of b.buildings) expect(b.collision.isBlocked(x.x + 0.5, x.y + 0.5)).toBe(true);
  });

  it('a finished storage crate adds stack room (up to two crates); tools stay one', () => {
    const live = new LiveWorld(world(), 'blobbi-9', 16);
    live.brain.enabled = false;
    unlockAll(live);
    const base = stackLimit(ITEMS.stick.id);
    expect(live.inventory.limit(ITEMS.stick.id)).toBe(base);
    for (let i = 0; i < 3; i++) {
      for (const c of BUILDINGS.crate.cost) live.inventory.add(c.item, c.quantity);
      expect(findBuildSpot(live, 'crate')).toBe(true);
      live.setBuildMode('crate');
      pressE(live);
    }
    expect(live.inventory.limit(ITEMS.stick.id)).toBe(base); // still being built
    run(live, 60 * (BUILDINGS.crate.buildSeconds + 1));
    expect(live.inventory.limit(ITEMS.stick.id)).toBe(base + MAX_CRATES * CRATE_BONUS);
    expect(live.inventory.limit(ITEMS.axe.id)).toBe(1);
  });

  it("a shelter's doorway stays open: needs walkable ground, and nothing may be built or tilled in it", () => {
    const live = new LiveWorld(world(), 'blobbi-9', 16);
    live.brain.enabled = false;
    unlockAll(live);
    live.inventory.add(ITEMS.wood.id, 6);
    live.inventory.add(ITEMS.stone.id, 3);
    expect(findBuildSpot(live, 'shelter')).toBe(true);
    live.setBuildMode('shelter');
    pressE(live);
    const shelter = live.buildings[0];
    const door = doorwayRect(shelter)!;
    expect(live.placementCheck('lantern', { x: Math.round((door.x0 + door.x1) / 2), y: door.y0 + 4 }).problem).toBe('doorway');
    for (let y = door.y0; y <= door.y1; y++) for (let x = door.x0; x <= door.x1; x++) expect(live.collision.isBlocked(x + 0.5, y + 0.5)).toBe(false);
  });

  it('the Blobbi visits finished decorations on its own (and only looks)', () => {
    const live = new LiveWorld(world(), 'blobbi-9', 16);
    unlockAll(live);
    live.inventory.add(ITEMS.wood.id, 1);
    live.inventory.add(ITEMS.seed.id, 2);
    live.brain.enabled = false;
    expect(findBuildSpot(live, 'flower-bed')).toBe(true);
    live.setBuildMode('flower-bed');
    pressE(live);
    run(live, 60 * 5);
    const bed = live.buildings[0];
    live.brain.enabled = true;
    const bag = JSON.stringify(live.inventory.snapshot());
    let visited = false;
    for (let i = 0; i < 60 * 900 && !visited; i++) {
      live.update(1 / 60, { up: false, down: false, left: false, right: false, interact: false, plant: false });
      if (live.brain.note === 'looked at the flower-bed') visited = true;
    }
    expect(visited).toBe(true);
    expect(JSON.stringify(live.inventory.snapshot())).toBe(bag);
    expect(Math.hypot(live.blobbi.x - bed.x, live.blobbi.y - bed.y)).toBeLessThan(24);
  });
});

describe('regressions', () => {
  it('the hoe is held like every tool: one sprite per orientation, in the anatomical left hand', () => {
    const shapes = new Set(['rest', 'carry', 'raised', 'strike', 'strike-down', 'strike-up'].map((o) => toolSprite(ITEMS.hoe.id, o as never, palette).buffer.data.join()));
    expect(shapes.size).toBe(6);
    expect(toolSprite(ITEMS.hoe.id, 'rest', palette).buffer.data).not.toEqual(toolSprite(ITEMS.axe.id, 'rest', palette).buffer.data);
    const live = new LiveWorld(world(), 'blobbi-9', 16);
    for (const pose of [REST_POSE, { ...REST_POSE, view: 'back' as const }, { ...REST_POSE, view: 'side' as const, facing: -1 as const }]) {
      const hoe = attachTool(ITEMS.hoe.id, pose, 'idle', live.rig, (p) => live.blobbiSprite(p), palette);
      const axe = attachTool(ITEMS.axe.id, pose, 'idle', live.rig, (p) => live.blobbiSprite(p), palette);
      expect(hoe.arm).toBe(armForHand(pose, 'left'));
      expect([hoe.dx, hoe.dy, hoe.behind]).toEqual([axe.dx, axe.dy, axe.behind]);
    }
  });

  it('a comfortable Blobbi keeps the approved neutral face', () => {
    const live = new LiveWorld(world(), 'blobbi-9', 16);
    live.brain.enabled = false;
    run(live, 60 * 30);
    expect(live.blobbi.animator.state.mood).toBeNull();
    expect(live.blobbi.animator.pose(live.clock.time).expression).toBe('neutral');
  });
});
