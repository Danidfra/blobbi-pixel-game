/**
 * M10 phase C: shaping the island. Natural things can be removed at every stage of their regrowth (never an
 * indestructible obstacle), for less than they give grown (so clearing early never pays more than waiting); ground
 * the player keeps clear with a clearing flag stays clear; trees the player planted are saved, keep growing in world
 * time, and can be dug up.
 */
import { describe, expect, it } from 'vitest';
import { LiveWorld, SWING } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { loadSave, memoryStore, saveKey } from '../src/game/persistence';
import { pressE, run } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { REACH } from '../src/game/resources';
import { EARLY_WOOD, HITS_TO_FELL, REGROW_SECONDS, SEEDLING_UNTIL, STUMP_SECONDS, TREE_RETURN_SECONDS, woodYield } from '../src/game/trees';
import { EARLY_STONES, HITS_TO_MINE, ROCK_FORM_SECONDS, ROCK_RETURN_SECONDS, RUBBLE_CLEAR_SECONDS, isLargeRock, stoneYield } from '../src/game/rocks';
import { KEEP_CLEAR_KIND, KEEP_CLEAR_RADIUS } from '../src/game/clearing';
import { BUILDINGS } from '../src/game/buildings';
import { recipeById } from '../src/game/crafting';
import { growWorld } from '../src/world/growth';
import type { Placement } from '../src/world/types';

const island = (seed = 'stages-1') => generateTurtleWorld(seed, { turtleSeed: 't-' + seed, shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });

function quiet(world = island(), store = memoryStore()): LiveWorld {
  const live = new LiveWorld(world, 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  return live;
}

/** Stand below object `index`, facing it (sticks in reach cleared away so E means the object). */
function face(live: LiveWorld, index: number): boolean {
  const o = live.world.objects[index];
  const s = live.spriteOf(o);
  for (const dy of [s.footRy + 4, s.footRy + 6, s.footRy + 8]) {
    if (!live.collision.canStand(o.x, o.y + dy, live.blobbi.footRx, live.blobbi.footRy)) continue;
    live.blobbi.x = o.x;
    live.blobbi.y = o.y + dy;
    run(live, 1, { up: true });
    live.blobbi.x = o.x;
    live.blobbi.y = o.y + dy;
    live.resources = live.resources.filter((n) => Math.hypot(n.x - o.x, (n.y - o.y - dy) * 1.25) > REACH + 2);
    if (live.facingObject()?.index === index) return true;
  }
  return false;
}
const faceFirst = (live: LiveWorld, pick: (p: Placement) => boolean): number => {
  for (let i = 0; i < live.world.objects.length; i++) if (pick(live.world.objects[i]) && face(live, i)) return i;
  throw new Error('nothing to face');
};
const swing = (live: LiveWorld) => {
  pressE(live);
  run(live, Math.ceil(SWING.end * 60) + 4);
};
const away = (live: LiveWorld) => {
  live.blobbi.x = live.world.hubs[0].x;
  live.blobbi.y = live.world.hubs[0].y;
};
const withTool = (live: LiveWorld, item: string) => {
  live.inventory.add(item, 1);
  live.equip(item);
};

describe('trees: every stage can be removed, for what that stage is worth', () => {
  it('a stump is dug out, a seedling pulled up (no wood), a young tree cleared (one log), a grown tree felled (2-4)', () => {
    const live = quiet();
    withTool(live, ITEMS.axe.id);
    const index = faceFirst(live, (p) => p.kind === 'tree');
    const tree = live.world.objects[index];
    for (let i = 0; i < HITS_TO_FELL; i++) swing(live);
    expect(live.treeAt(index).phase).toBe('stump');
    // The stump: one swing, no wood, the ground is clear at once (it no longer blocks for 20 s).
    expect(live.prompt()).toBe('E  dig out the stump');
    let wood = live.inventory.count(ITEMS.wood.id);
    face(live, index);
    swing(live);
    expect(live.treeAt(index).phase).toBe('cleared');
    expect(live.inventory.count(ITEMS.wood.id)).toBe(wood);
    expect(live.collision.isBlocked(tree.x, tree.y)).toBe(false);
    // It comes back as a seedling (stepped over), pulled up for nothing: its full wait starts again.
    away(live);
    run(live, (TREE_RETURN_SECONDS + 8) * 60);
    expect(live.treeAt(index).phase).toBe('regrowing');
    expect(live.treeAt(index).growth).toBeLessThan(SEEDLING_UNTIL);
    expect(live.collision.isBlocked(tree.x, tree.y)).toBe(false);
    expect(face(live, index)).toBe(true);
    expect(live.prompt()).toBe('E  pull up the seedling');
    swing(live);
    expect(live.treeAt(index).phase).toBe('cleared');
    expect(live.inventory.count(ITEMS.wood.id)).toBe(wood + EARLY_WOOD.seedling);
    expect(live.bubble?.text).toBe('seedling pulled up');
    // Back again, grown into a young tree (it blocks): cleared for a single log.
    away(live);
    run(live, (TREE_RETURN_SECONDS + 8 + REGROW_SECONDS * 0.5) * 60);
    expect(live.treeAt(index).phase).toBe('regrowing');
    expect(live.treeAt(index).growth).toBeGreaterThanOrEqual(SEEDLING_UNTIL);
    expect(live.collision.isBlocked(tree.x, tree.y)).toBe(true);
    expect(face(live, index)).toBe(true);
    expect(live.prompt()).toBe('E  clear the young tree');
    wood = live.inventory.count(ITEMS.wood.id);
    swing(live);
    expect(live.inventory.count(ITEMS.wood.id)).toBe(wood + EARLY_WOOD.young);
    expect(live.treeAt(index).phase).toBe('cleared');
    // Never more than felling it grown, and not quicker: early clearing never out-earns waiting.
    expect(EARLY_WOOD.young).toBeLessThan(woodYield(tree.seed, tree.size));
    expect(live.tally.felled).toBe(1); // only the real felling counts for quests
  });
});

describe('never built over what is growing back', () => {
  it('a seedling can be stepped over, but nothing is placed or tilled on it until it is pulled up', () => {
    const live = quiet();
    withTool(live, ITEMS.axe.id);
    const index = faceFirst(live, (p) => p.kind === 'tree');
    const tree = live.world.objects[index];
    for (let i = 0; i < HITS_TO_FELL; i++) swing(live);
    away(live);
    run(live, (STUMP_SECONDS + TREE_RETURN_SECONDS + 8) * 60);
    expect(live.treeAt(index).phase).toBe('regrowing');
    expect(live.collision.isBlocked(tree.x, tree.y)).toBe(false); // stepped over
    // A bench right on it: refused, and the player is told why.
    const check = live.placementCheck('bench', { x: tree.x, y: tree.y });
    expect(check.ok).toBe(false);
    expect(check.problem).toBe('growing');
    expect(live.growingIn({ x0: tree.x - 1, y0: tree.y - 1, x1: tree.x + 1, y1: tree.y + 1 })).toBe(true);
    // Pulled up: the ground is free for the bench (if nothing else is in the way).
    expect(face(live, index)).toBe(true);
    swing(live);
    expect(live.treeAt(index).phase).toBe('cleared');
    expect(live.placementCheck('bench', { x: tree.x, y: tree.y }).problem).not.toBe('growing');
  });
});

describe('rocks: rubble and forming rocks can be cleared', () => {
  it('rubble is cleared away; a returning rock forms (deposit, growing, whole); each forming stage clears for fewer stones', () => {
    const live = quiet(island('stages-2'));
    withTool(live, ITEMS.pickaxe.id);
    const index = faceFirst(live, (p) => p.kind === 'rock' && isLargeRock(p.size));
    const rock = live.world.objects[index];
    for (let i = 0; i < HITS_TO_MINE; i++) swing(live);
    expect(live.rockAt(index).phase).toBe('rubble');
    expect(live.prompt()).toBe('E  clear the rubble');
    let stones = live.inventory.count(ITEMS.stone.id);
    swing(live);
    expect(live.rockAt(index).phase).toBe('cleared');
    expect(live.inventory.count(ITEMS.stone.id)).toBe(stones);
    // It surfaces as a small deposit (smaller sprite and footprint), clearable for one stone.
    away(live);
    run(live, (ROCK_RETURN_SECONDS + 8) * 60);
    expect(live.rockAt(index).phase).toBe('forming');
    expect(live.rockAt(index).stage).toBe('deposit');
    expect(live.objectSprite(index).buffer.width).toBeLessThan(live.spriteOf(rock).buffer.width);
    expect(face(live, index)).toBe(true);
    expect(live.prompt()).toBe('E  clear the small deposit');
    stones = live.inventory.count(ITEMS.stone.id);
    swing(live);
    expect(live.inventory.count(ITEMS.stone.id)).toBe(stones + EARLY_STONES.deposit);
    expect(live.rockAt(index).phase).toBe('cleared');
    // Again, past the deposit: a growing rock, two stones.
    away(live);
    run(live, (ROCK_RETURN_SECONDS + 8 + ROCK_FORM_SECONDS * 0.6) * 60);
    expect(live.rockAt(index).stage).toBe('growing');
    expect(face(live, index)).toBe(true);
    expect(live.prompt()).toBe('E  clear the young rock');
    stones = live.inventory.count(ITEMS.stone.id);
    swing(live);
    expect(live.inventory.count(ITEMS.stone.id)).toBe(stones + EARLY_STONES.growing);
    expect(EARLY_STONES.growing).toBeLessThan(stoneYield(rock.seed, rock.size));
    expect(live.tally.mined).toBe(1);
    void RUBBLE_CLEAR_SECONDS;
  });
});

describe('prepared land: a clearing flag keeps its ground clear', () => {
  it('nothing wild comes back within its circle; picked up, things may return; saved like any placeable', () => {
    const store = memoryStore();
    const live = quiet(island(), store);
    withTool(live, ITEMS.axe.id);
    const index = faceFirst(live, (p) => p.kind === 'tree');
    const tree = live.world.objects[index];
    for (let i = 0; i < HITS_TO_FELL; i++) swing(live);
    run(live, (STUMP_SECONDS + 2) * 60);
    // The flag is a hand recipe known from the start: 2 sticks and a fibre.
    const recipe = recipeById(`blobbi-pixel:recipe:${KEEP_CLEAR_KIND}`)!;
    expect(recipe.station).toBe('hand');
    expect(recipe.unlock).toBeUndefined();
    expect(BUILDINGS[KEEP_CLEAR_KIND].layer).not.toBe('solid'); // never in the way
    live.buildings.push({ id: 'flag:test', kind: KEEP_CLEAR_KIND, x: tree.x + 12, y: tree.y + 6, placedAt: live.worldTime, seed: 'f' });
    expect(Math.hypot(12, 6)).toBeLessThan(KEEP_CLEAR_RADIUS);
    away(live);
    run(live, (TREE_RETURN_SECONDS + 30) * 60);
    expect(live.treeAt(index).phase).toBe('cleared'); // kept clear
    expect(live.keepClearRings().length).toBe(0); // the Blobbi is far: no circle drawn
    live.blobbi.x = tree.x;
    live.blobbi.y = tree.y + 20;
    expect(live.keepClearRings().length).toBe(1); // near it, its circle shows
    live.save();
    const again = quiet(island(), store);
    expect(again.buildings.some((b) => b.kind === KEEP_CLEAR_KIND)).toBe(true);
    away(again);
    run(again, 60 * 10);
    expect(again.treeAt(index).phase).toBe('cleared');
    // Picked up: the tree may return (its time has long come).
    again.buildings.splice(again.buildings.findIndex((b) => b.kind === KEEP_CLEAR_KIND), 1);
    run(again, 60 * 12);
    expect(again.treeAt(index).phase).toBe('regrowing');
  });

  it('sticks and stones do not come back inside the circle either', () => {
    const live = quiet();
    const node = live.resources.find((n) => n.kind === 'stick')!;
    live.blobbi.x = node.x;
    live.blobbi.y = node.y + 2;
    live.collect();
    expect(live.collected.has(node.id)).toBe(true);
    live.buildings.push({ id: 'flag:test', kind: KEEP_CLEAR_KIND, x: node.x, y: node.y + 3, placedAt: 0, seed: 'f' });
    away(live);
    run(live, 60 * 200);
    expect(live.collected.has(node.id)).toBe(true);
  });
});

describe('planted trees (KI-49): saved, growing in world time, removable', () => {
  it('survive a reload at every stage of their growth, in the island frame, and keep growing where they were', () => {
    const store = memoryStore();
    const live = quiet(island(), store);
    away(live);
    live.blobbi.y += 12;
    expect(live.plantTree()).toBe(true);
    const planted = { ...live.planted[0].placement };
    // A reload mid-growth: the same tree, the same growth.
    run(live, 60 * 10);
    const mid = live.growthOf(live.planted[0]);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    live.save();
    const again = quiet(island(), store);
    expect(again.planted).toHaveLength(1);
    expect(again.planted[0].placement).toMatchObject({ x: planted.x, y: planted.y, seed: planted.seed, size: planted.size });
    expect(again.growthOf(again.planted[0])).toBeCloseTo(mid, 1);
    run(again, 60 * 60);
    expect(again.growthOf(again.planted[0])).toBe(1);
    expect(again.islandCollision.isBlocked(planted.x, planted.y)).toBe(true);
    again.save();
    const raw = JSON.parse(store.get(saveKey(again.identity))!);
    expect(raw.planted).toHaveLength(1);
    expect(raw.planted[0].x).toBe(planted.x - again.origin.x);
    // A second tree never shares the first one's seed, even after the first is gone.
    expect(loadSave(store, again.identity)!.plantedSerial).toBe(1);
  });

  it('stays put when the island grows (island frame), and can be dug up with the axe (no wood)', () => {
    const store = memoryStore();
    const base = island();
    const live = quiet(base, store);
    away(live);
    live.blobbi.y += 12;
    live.plantTree();
    run(live, 60 * 50);
    const at = { x: live.planted[0].placement.x, y: live.planted[0].placement.y };
    live.growth = { stage: 1, version: 4, history: [{ stage: 1, worldTime: live.worldTime, version: 4 }], regions: [] };
    live.save();
    const grown = quiet(base, store);
    expect(grown.world.growth?.stage).toBe(1);
    expect(grown.planted[0].placement).toMatchObject(at);
    expect(growWorld(base, 1).objects.length).toBeGreaterThan(base.objects.length);
    // Dig it up: face it with the axe.
    withTool(grown, ITEMS.axe.id);
    grown.blobbi.x = at.x;
    grown.blobbi.y = at.y + 8;
    run(grown, 1, { up: true });
    grown.blobbi.x = at.x;
    grown.blobbi.y = at.y + 8;
    grown.resources = grown.resources.filter((n) => Math.hypot(n.x - at.x, n.y - at.y - 8) > REACH + 2);
    expect(grown.prompt()).toBe('E  dig up the tree you planted');
    const wood = grown.inventory.count(ITEMS.wood.id);
    swing(grown);
    expect(grown.planted).toHaveLength(0);
    expect(grown.inventory.count(ITEMS.wood.id)).toBe(wood);
    expect(grown.islandCollision.isBlocked(at.x, at.y)).toBe(false);
  });
});
