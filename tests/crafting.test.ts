import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT, SWING, type LiveInput } from '../src/sim/live-world';
import { Inventory } from '../src/game/inventory';
import { ITEMS, isTool, toolSupports, stackLimit } from '../src/game/items';
import { RECIPES, canCraft, craft } from '../src/game/crafting';
import { HITS_TO_FELL, REGROW_SECONDS, STUMP_SECONDS, treeCondition, woodYield } from '../src/game/trees';
import { memoryStore, loadSave, saveKey, worldIdentity, SAVE_VERSION } from '../src/game/persistence';
import { REACH } from '../src/game/resources';

const AXE = RECIPES[0];
const run = (live: LiveWorld, steps: number, input: Partial<LiveInput> = {}) => {
  for (let i = 0; i < steps; i++) live.update(1 / 60, { ...IDLE_INPUT, ...input, interact: i === 0 && !!input.interact, plant: false });
};
/** One full axe swing: the press, then past the swing's end (the hit lands part-way through). */
const chopOnce = (live: LiveWorld) => {
  run(live, 1, { interact: true });
  run(live, 25);
};
const stocked = (live: LiveWorld) => {
  live.inventory.add(ITEMS.stick.id, 3);
  live.inventory.add(ITEMS.stone.id, 2);
};
/** Stand just south of a grown world tree, facing up at it. Returns the tree's index. */
function faceTree(live: LiveWorld, skip = 0): number {
  const objects = live.world.objects;
  let seen = 0;
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];
    if (o.kind !== 'tree' || live.treeAt(i).phase !== 'grown') continue;
    const s = live.spriteOf(o);
    for (const dy of [s.footRy + 4, s.footRy + 6, s.footRy + 8]) {
      const x = o.x;
      const y = o.y + dy;
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      if (seen++ < skip) break;
      live.blobbi.x = x;
      live.blobbi.y = y;
      run(live, 1, { up: true });
      live.blobbi.x = x;
      live.blobbi.y = y;
      const f = live.facingObject();
      if (f && f.index === i) {
        // Sticks lie under trees and E collects before it chops: clear the ones in reach so E means the tree.
        live.resources = live.resources.filter((n) => Math.hypot(n.x - x, (n.y - y) * 1.25) > REACH + 2);
        return i;
      }
      break;
    }
  }
  throw new Error('no tree to face');
}

describe('items and recipes', () => {
  it('has stable ids, tool interactions and stack limits', () => {
    expect(ITEMS.axe.id).toBe('blobbi-pixel:tool:simple-axe');
    expect(ITEMS.wood.id).toBe('blobbi-pixel:material:wood');
    expect(isTool(ITEMS.axe.id)).toBe(true);
    expect(isTool(ITEMS.stick.id)).toBe(false);
    expect(toolSupports(ITEMS.axe.id, 'chop')).toBe(true);
    expect(toolSupports(ITEMS.wood.id, 'chop')).toBe(false);
    expect(stackLimit(ITEMS.axe.id)).toBe(1);
    expect(stackLimit(ITEMS.wood.id)).toBe(40);
    expect(AXE.ingredients).toEqual([{ item: ITEMS.stick.id, quantity: 3 }, { item: ITEMS.stone.id, quantity: 2 }]);
    expect(AXE.output).toEqual({ item: ITEMS.axe.id, quantity: 1 });
  });

  it('validates a recipe against the inventory and reports what is missing', () => {
    const inv = new Inventory('t', stackLimit);
    expect(canCraft(inv, AXE)).toEqual({ ok: false, missing: [{ item: ITEMS.stick.id, need: 3, have: 0 }, { item: ITEMS.stone.id, need: 2, have: 0 }], outputFull: false });
    inv.add(ITEMS.stick.id, 3);
    inv.add(ITEMS.stone.id, 1);
    expect(canCraft(inv, AXE).missing).toEqual([{ item: ITEMS.stone.id, need: 2, have: 1 }]);
    inv.add(ITEMS.stone.id, 1);
    expect(canCraft(inv, AXE).ok).toBe(true);
    inv.add(ITEMS.axe.id, 1);
    expect(canCraft(inv, AXE)).toMatchObject({ ok: false, outputFull: true, missing: [] });
  });

  it('consumes ingredients atomically: all or nothing, exact amounts, no duplication', () => {
    const inv = new Inventory('t', stackLimit);
    inv.add(ITEMS.stick.id, 3);
    inv.add(ITEMS.stone.id, 1);
    expect(craft(inv, AXE)).toBe(false);
    expect(inv.entries()).toEqual([{ item: ITEMS.stick.id, quantity: 3 }, { item: ITEMS.stone.id, quantity: 1 }]);
    inv.add(ITEMS.stone.id, 4);
    inv.add(ITEMS.stick.id, 2);
    const rev = inv.revision;
    expect(craft(inv, AXE)).toBe(true);
    expect(inv.count(ITEMS.stick.id)).toBe(2);
    expect(inv.count(ITEMS.stone.id)).toBe(3);
    expect(inv.count(ITEMS.axe.id)).toBe(1);
    expect(inv.revision).toBeGreaterThan(rev);
    // A second axe does not fit (stack 1): nothing is consumed.
    inv.add(ITEMS.stick.id, 1);
    expect(craft(inv, AXE)).toBe(false);
    expect(inv.count(ITEMS.stick.id)).toBe(3);
    expect(inv.count(ITEMS.stone.id)).toBe(3);
    expect(inv.count(ITEMS.axe.id)).toBe(1);
  });
});

describe('crafting and equipping in the world', () => {
  it('crafts with feedback and persists; equips only a tool that is in the bag', () => {
    const store = memoryStore();
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store });
    expect(live.craftRecipe(AXE)).toBe(false);
    expect(live.bubble?.text).toContain('need 3 stick');
    expect(live.equip(ITEMS.axe.id)).toBe(false);
    expect(live.equipped).toBeNull();
    stocked(live);
    expect(live.craftRecipe(AXE)).toBe(true);
    expect(live.bubble?.text).toBe('crafted a simple axe!');
    expect(live.stats.crafted).toBe(1);
    expect(live.inventory.count(ITEMS.axe.id)).toBe(1);
    expect(live.inventory.count(ITEMS.stick.id)).toBe(0);
    expect(live.brain.state).toBe('manual');
    expect(live.equip(ITEMS.wood.id)).toBe(false);
    expect(live.equip(ITEMS.axe.id)).toBe(true);
    expect(live.equipped).toBe(ITEMS.axe.id);
    const saved = loadSave(store, live.identity)!;
    expect(saved.equipped).toBe(ITEMS.axe.id);
    expect(saved.inventory.items).toContainEqual({ item: ITEMS.axe.id, quantity: 1 });
    live.unequip();
    expect(live.equipped).toBeNull();
    expect(loadSave(store, live.identity)!.equipped).toBeNull();
    // Crafting again: no second axe, nothing consumed.
    stocked(live);
    expect(live.craftRecipe(AXE)).toBe(false);
    expect(live.inventory.count(ITEMS.stick.id)).toBe(3);
    expect(live.bubble?.text).toContain('already have');
  });
});

describe('chopping trees', () => {
  it('needs the axe equipped; three hits fell the tree, award wood, leave a stump that cannot be harvested again', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    const index = faceTree(live);
    const tree = live.world.objects[index];
    // Without an axe, E is the ordinary tree interaction: leaves, no hits, no wood.
    run(live, 1, { interact: true });
    expect(live.trees.has(index)).toBe(false);
    expect(live.stats.interactions).toBe(1);
    expect(live.inventory.count(ITEMS.wood.id)).toBe(0);
    stocked(live);
    live.craftRecipe(AXE);
    expect(live.equip(ITEMS.axe.id)).toBe(true);
    for (let hit = 1; hit < HITS_TO_FELL; hit++) {
      run(live, 1, { interact: true });
      expect(live.swing).not.toBeNull();
      expect(live.trees.get(index)?.hits ?? 0).toBe(hit - 1); // nothing lands at the press itself
      run(live, Math.ceil(SWING.hit * 60) + 1);
      expect(live.trees.get(index)).toEqual({ hits: hit, harvestedAt: null });
      expect(live.treeAt(index).phase).toBe('chopping');
      expect(live.bubble?.text).toBe(`chop ${hit}/${HITS_TO_FELL}`);
      expect(live.impulses.has(index)).toBe(true);
      expect(live.objectSprite(index)).toBe(live.spriteOf(tree)); // still the whole tree
      run(live, 20);
    }
    chopOnce(live);
    const state = live.trees.get(index)!;
    expect(state.hits).toBe(0);
    expect(live.worldTime - state.harvestedAt!).toBeGreaterThan(0);
    expect(live.worldTime - state.harvestedAt!).toBeLessThan(0.5); // felled at the hit, part-way through the swing
    expect(live.treeAt(index).phase).toBe('stump');
    const wood = woodYield(tree.seed, tree.size);
    expect(wood).toBeGreaterThanOrEqual(2);
    expect(live.inventory.count(ITEMS.wood.id)).toBe(wood);
    expect(live.stats.felled).toBe(1);
    expect(live.stats.interactions).toBe(1); // chops are not ordinary interactions
    const stump = live.objectSprite(index);
    expect(stump).not.toBe(live.spriteOf(tree));
    expect(stump.buffer.height).toBeLessThan(live.spriteOf(tree).buffer.height / 2);
    expect(stump.footRx).toBe(live.spriteOf(tree).footRx);
    expect(stump.swayRow).toBeUndefined();
    // The same tree again: nothing, a notice.
    run(live, 20);
    chopOnce(live);
    expect(live.inventory.count(ITEMS.wood.id)).toBe(wood);
    expect(live.trees.get(index)!.hits).toBe(0);
    expect(live.bubble?.text).toContain('stump');
    // The tree's identity never changes: its seed and placement are untouched.
    expect(live.world.objects[index]).toEqual(tree);
  });

  it('respects the wood stack limit', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-1'), 'blobbi-9', 16);
    faceTree(live);
    stocked(live);
    live.craftRecipe(AXE);
    live.equip(ITEMS.axe.id);
    live.inventory.add(ITEMS.wood.id, ITEMS.wood.stack);
    for (let i = 0; i < HITS_TO_FELL; i++) {
      chopOnce(live);
    }
    expect(live.inventory.count(ITEMS.wood.id)).toBe(ITEMS.wood.stack);
    expect(live.bubble?.text).toBe('wood full');
  });
});

describe('regeneration', () => {
  it('goes stump → seedling → sapling → grown in world time, through the existing growth stages, then is harvestable again', () => {
    const state = { hits: 0, harvestedAt: 100 };
    expect(treeCondition(undefined, 500)).toEqual({ phase: 'grown', growth: 1, remaining: 0 });
    expect(treeCondition({ hits: 2, harvestedAt: null }, 500).phase).toBe('chopping');
    expect(treeCondition(state, 100 + STUMP_SECONDS - 1)).toMatchObject({ phase: 'stump', growth: 1 });
    const early = treeCondition(state, 100 + STUMP_SECONDS + 1);
    expect(early.phase).toBe('regrowing');
    expect(early.growth).toBeGreaterThan(0);
    expect(early.growth).toBeLessThan(0.1);
    const mid = treeCondition(state, 100 + STUMP_SECONDS + REGROW_SECONDS / 2);
    expect(mid.growth).toBeCloseTo(0.5, 1);
    expect(mid.remaining).toBeCloseTo(REGROW_SECONDS / 2, 0);
    expect(treeCondition(state, 100 + STUMP_SECONDS + REGROW_SECONDS)).toEqual({ phase: 'grown', growth: 1, remaining: 0 });

    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false; // minutes pass here; the Blobbi must stay in front of the tree
    const index = faceTree(live);
    const tree = live.world.objects[index];
    stocked(live);
    live.craftRecipe(AXE);
    live.equip(ITEMS.axe.id);
    for (let i = 0; i < HITS_TO_FELL; i++) {
      chopOnce(live);
    }
    const felledAt = live.worldTime;
    // Advance world time by running the clock (the stump phase, then regrowth).
    run(live, Math.ceil(STUMP_SECONDS * 60) + 60);
    expect(live.treeAt(index).phase).toBe('regrowing');
    const seedling = live.objectSprite(index);
    expect(seedling.buffer.height).toBeLessThan(10); // the seedling form
    run(live, Math.ceil(REGROW_SECONDS * 60 * 0.5));
    const sapling = live.objectSprite(index);
    expect(sapling.buffer.height).toBeGreaterThan(seedling.buffer.height);
    expect(sapling.buffer.height).toBeLessThan(live.spriteOf(tree).buffer.height);
    expect(sapling).toBe(live.spriteOf(tree, live.treeAt(index).growth)); // the existing growth system
    run(live, Math.ceil(REGROW_SECONDS * 60 * 0.5) + 120);
    expect(live.worldTime - felledAt).toBeGreaterThan(STUMP_SECONDS + REGROW_SECONDS);
    expect(live.treeAt(index).phase).toBe('grown');
    expect(live.objectSprite(index)).toBe(live.spriteOf(tree));
    // Harvestable again: the next three hits fell it once more.
    const wood = live.inventory.count(ITEMS.wood.id);
    for (let i = 0; i < HITS_TO_FELL; i++) {
      chopOnce(live);
    }
    expect(live.inventory.count(ITEMS.wood.id)).toBe(wood + woodYield(tree.seed, tree.size));
    expect(live.stats.felled).toBe(2);
  });
});

describe('persistence and reloads', () => {
  it('keeps the axe, the equipped state, stumps and world time across a reload; regrowth continues where it was', () => {
    const store = memoryStore();
    let live = new LiveWorld(generateTurtleWorld('turtle-2'), 'blobbi-9', 16, { store });
    const index = faceTree(live);
    stocked(live);
    live.craftRecipe(AXE);
    live.equip(ITEMS.axe.id);
    for (let i = 0; i < HITS_TO_FELL; i++) {
      chopOnce(live);
    }
    const wood = live.inventory.count(ITEMS.wood.id);
    const harvestedAt = live.trees.get(index)!.harvestedAt!;
    // Partly through the stump phase; the autosave runs every ten simulated seconds.
    run(live, 60 * 12);
    const timeBefore = live.worldTime;
    live.save();
    const record = JSON.parse(store.get(saveKey(worldIdentity(live.world)))!);
    expect(record.version).toBe(SAVE_VERSION);
    expect(record.trees[String(index)]).toEqual({ hits: 0, harvestedAt });
    expect(record.worldTime).toBeCloseTo(timeBefore, 3);
    // Reload.
    live = new LiveWorld(generateTurtleWorld('turtle-2'), 'blobbi-9', 16, { store });
    expect(live.equipped).toBe(ITEMS.axe.id);
    expect(live.inventory.count(ITEMS.axe.id)).toBe(1);
    expect(live.inventory.count(ITEMS.wood.id)).toBe(wood);
    expect(live.worldTime).toBeCloseTo(timeBefore, 3);
    expect(live.trees.get(index)).toEqual({ hits: 0, harvestedAt });
    expect(live.treeAt(index).phase).toBe('stump');
    expect(live.treeAt(index).remaining).toBeCloseTo(STUMP_SECONDS + REGROW_SECONDS - (timeBefore - harvestedAt), 1);
    // Time keeps counting from there.
    run(live, 60 * 10);
    expect(live.worldTime).toBeCloseTo(timeBefore + 10, 2);
    expect(live.treeAt(index).phase).toBe('regrowing');
    // Chop hits in progress survive too.
    const other = faceTree(live);
    chopOnce(live);
    expect(live.trees.get(other)).toEqual({ hits: 1, harvestedAt: null });
    live.save();
    const again = new LiveWorld(generateTurtleWorld('turtle-2'), 'blobbi-9', 16, { store });
    expect(again.trees.get(other)).toEqual({ hits: 1, harvestedAt: null });
    // Reset forgets everything, including the equipped tool and the stumps.
    again.resetProgress();
    expect(again.equipped).toBeNull();
    expect(again.trees.size).toBe(0);
    expect(again.treeAt(index).phase).toBe('grown');
  });

  it('migrates a version 1 record (M2.1) and ignores unknown versions and bad tree entries', () => {
    const store = memoryStore();
    const world = generateTurtleWorld('turtle-0');
    const identity = worldIdentity(world);
    store.set(saveKey(identity), JSON.stringify({ version: 1, world: identity, collected: ['stick:0'], inventory: { version: 1, context: identity, revision: 3, items: [{ item: ITEMS.stick.id, quantity: 2 }] } }));
    const v1 = loadSave(store, identity)!;
    expect(v1).toEqual({ version: SAVE_VERSION, world: identity, collected: ['stick:0'], inventory: { version: 1, context: identity, revision: 3, items: [{ item: ITEMS.stick.id, quantity: 2 }] }, equipped: null, trees: {}, worldTime: 0, buildings: [] });
    const live = new LiveWorld(world, 'blobbi-9', 16, { store });
    expect(live.collected.has('stick:0')).toBe(true);
    expect(live.inventory.count(ITEMS.stick.id)).toBe(2);
    store.set(saveKey(identity), JSON.stringify({ ...v1, version: SAVE_VERSION + 1 }));
    expect(loadSave(store, identity)).toBeNull();
    store.set(saveKey(identity), JSON.stringify({ ...v1, version: 2, equipped: ITEMS.axe.id, trees: { '5': { hits: 1, harvestedAt: null }, x: { hits: 1 }, '7': { hits: -2, harvestedAt: 'soon' }, '9': { hits: 0, harvestedAt: 12.5 } }, worldTime: -4 }));
    const loaded = loadSave(store, identity)!;
    expect(loaded.trees).toEqual({ '5': { hits: 1, harvestedAt: null }, '9': { hits: 0, harvestedAt: 12.5 } });
    expect(loaded.worldTime).toBe(0);
    // An equipped tool that is not in the bag is not equipped.
    const noAxe = new LiveWorld(world, 'blobbi-9', 16, { store });
    expect(noAxe.equipped).toBeNull();
  });
});

describe('autonomy isolation', () => {
  it('never crafts, chops, consumes or equips: two minutes with an equipped axe and a full recipe in the bag change nothing', () => {
    const store = memoryStore();
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store });
    stocked(live);
    live.inventory.add(ITEMS.axe.id, 1);
    live.equip(ITEMS.axe.id);
    const snapshot = live.inventory.snapshot();
    run(live, 60 * 6); // past the manual timeout from equipping
    expect(live.brain.state).not.toBe('manual');
    let inspected = 0;
    for (let i = 0; i < 60 * 120; i++) {
      live.update(1 / 60, IDLE_INPUT);
      if (live.brain.state === 'inspect') inspected++;
    }
    expect(inspected).toBeGreaterThan(0);
    expect(live.inventory.snapshot()).toEqual(snapshot);
    expect(live.trees.size).toBe(0);
    expect(live.stats.chops).toBe(0);
    expect(live.stats.crafted).toBe(0);
    expect(live.equipped).toBe(ITEMS.axe.id);
    expect(live.stats.interactions).toBeGreaterThan(0); // it still looks at things
  });
});
