/**
 * M10 phase B: terrain is permanent, natural resources occupy it only while they stand. Felling, breaking or clearing
 * frees the ground (walkable, buildable); a resource comes back later on its own spot only when that spot is free,
 * and waits otherwise; nothing ever moves. Wood never runs out (driftwood). A house that cannot grow says exactly
 * what to clear, or where there is room to move it.
 */
import { describe, expect, it } from 'vitest';
import { LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { loadSave, memoryStore, saveKey } from '../src/game/persistence';
import { findBuildSpot, pressE, run } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { REACH } from '../src/game/resources';
import { HITS_TO_FELL, STUMP_SECONDS, TREE_RETURN_SECONDS, treeCondition } from '../src/game/trees';
import { clearableKind, MIN_STANDING_TREES, RETURN_SECONDS } from '../src/game/clearing';
import { SWING } from '../src/sim/live-world';
import type { Placement } from '../src/world/types';

const island = (seed = 'clear-1') => generateTurtleWorld(seed, { turtleSeed: 't-' + seed, shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });

function quiet(world = island(), store = memoryStore()): LiveWorld {
  const live = new LiveWorld(world, 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  return live;
}

/** Stand in front of (below) object `index`, facing it; true if there was room. */
function face(live: LiveWorld, index: number): boolean {
  const o = live.world.objects[index];
  const s = live.spriteOf(o);
  for (const dy of [s.footRy + 4, s.footRy + 6, s.footRy + 8]) {
    if (!live.collision.canStand(o.x, o.y + dy, live.blobbi.footRx, live.blobbi.footRy)) continue;
    const x = o.x;
    const y = o.y + dy;
    live.blobbi.x = x;
    live.blobbi.y = y;
    run(live, 1, { up: true });
    live.blobbi.x = x;
    live.blobbi.y = y;
    // Sticks lie under trees and E collects before anything else: clear the ones in reach so E means the object.
    live.resources = live.resources.filter((n) => Math.hypot(n.x - x, (n.y - y) * 1.25) > REACH + 2);
    if (live.facingObject()?.index === index) return true;
  }
  return false;
}

/** The first object matching `pick` the Blobbi can face. */
function faceFirst(live: LiveWorld, pick: (p: Placement, i: number) => boolean): number {
  for (let i = 0; i < live.world.objects.length; i++) if (pick(live.world.objects[i], i) && face(live, i)) return i;
  throw new Error('nothing to face');
}

const swing = (live: LiveWorld) => {
  pressE(live);
  run(live, Math.ceil(SWING.end * 60) + 4);
};

function fell(live: LiveWorld, index: number): void {
  if (!live.inventory.count(ITEMS.axe.id)) live.inventory.add(ITEMS.axe.id, 1);
  live.equip(ITEMS.axe.id);
  face(live, index);
  for (let i = 0; i < HITS_TO_FELL; i++) swing(live);
}

const away = (live: LiveWorld) => {
  live.blobbi.x = live.world.hubs[0].x;
  live.blobbi.y = live.world.hubs[0].y;
};

describe('cleared ground', () => {
  it('a felled tree leaves a stump, then free ground: walkable, nothing drawn, nothing to face', () => {
    const live = quiet();
    const index = faceFirst(live, (p) => p.kind === 'tree');
    const t = live.world.objects[index];
    fell(live, index);
    expect(live.treeAt(index).phase).toBe('stump');
    expect(live.collision.isBlocked(t.x, t.y)).toBe(true);
    run(live, (STUMP_SECONDS + 2) * 60);
    expect(live.treeAt(index).phase).toBe('cleared');
    expect(live.absentObject(index)).toBe(true);
    expect(live.collision.isBlocked(t.x, t.y)).toBe(false);
    expect(live.collision.canStand(t.x, t.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(true);
    expect(live.facingObject()?.index).not.toBe(index);
    // The navigation grid knows: the cell is free now.
    const cell = live.nav.nearestFree(t.x, t.y, 0);
    expect(cell).not.toBeNull();
  });

  it('a building and a path can be placed where a tree stood', () => {
    const live = quiet();
    const index = faceFirst(live, (p) => p.kind === 'tree');
    const t = live.world.objects[index];
    fell(live, index);
    run(live, (STUMP_SECONDS + 2) * 60);
    // A bench from the bag whose footprint covers the tree's old spot.
    live.inventory.add('blobbi-pixel:furniture:bench', 1);
    let placed = false;
    for (let r = 0; r < 30 && !placed; r += 2)
      for (let k = 0; k < 16 && !placed; k++) {
        const x = Math.round(t.x + Math.cos((k / 16) * Math.PI * 2) * r);
        const y = Math.round(t.y + Math.sin((k / 16) * Math.PI * 2) * r);
        if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
        live.blobbi.x = x;
        live.blobbi.y = y;
        live.blobbi.animator.state.direction = 'up';
        const c = live.placementCheck('bench') as { ok: boolean; x0: number; y0: number; x1: number; y1: number };
        if (!c.ok || t.x < c.x0 || t.x > c.x1 || t.y < c.y0 || t.y > c.y1) continue;
        live.startPlacing('blobbi-pixel:furniture:bench');
        placed = !!live.placeFromBag();
      }
    expect(placed).toBe(true);
    // A path piece on another cleared spot (a second tree).
    const second = faceFirst(live, (p, i) => p.kind === 'tree' && i !== index);
    const t2 = live.world.objects[second];
    fell(live, second);
    run(live, (STUMP_SECONDS + 2) * 60);
    live.inventory.add('blobbi-pixel:furniture:stone-path', 1);
    let pathed = false;
    for (let r = 0; r < 24 && !pathed; r += 2)
      for (let k = 0; k < 16 && !pathed; k++) {
        const x = Math.round(t2.x + Math.cos((k / 16) * Math.PI * 2) * r);
        const y = Math.round(t2.y + Math.sin((k / 16) * Math.PI * 2) * r);
        if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
        live.blobbi.x = x;
        live.blobbi.y = y;
        live.blobbi.animator.state.direction = 'up';
        const c = live.placementCheck('stone-path') as { ok: boolean; x0: number; y0: number; x1: number; y1: number };
        if (!c.ok || t2.x < c.x0 || t2.x > c.x1 || t2.y < c.y0 || t2.y > c.y1) continue;
        live.startPlacing('blobbi-pixel:furniture:stone-path');
        pathed = !!live.placeFromBag();
      }
    expect(pathed).toBe(true);
  });
});

describe('coming back', () => {
  it('a felled tree comes back on its own spot when it is free, gradually (seedling first), and blocks again', () => {
    const live = quiet();
    const index = faceFirst(live, (p) => p.kind === 'tree');
    const t = live.world.objects[index];
    fell(live, index);
    away(live);
    run(live, (STUMP_SECONDS + TREE_RETURN_SECONDS + 8) * 60);
    expect(live.treeAt(index).phase).toBe('regrowing');
    expect(live.treeAt(index).growth).toBeLessThan(0.2);
    expect(live.collision.isBlocked(t.x, t.y)).toBe(true);
    expect(live.world.objects[index]).toEqual(t); // the very same tree, where it was
  });

  it('never over a building: it waits while the spot is taken, and comes back once it is free again', () => {
    const live = quiet();
    const index = faceFirst(live, (p) => p.kind === 'tree');
    const t = live.world.objects[index];
    fell(live, index);
    run(live, (STUMP_SECONDS + 2) * 60);
    // A crate right on the spot (placed as any building is recorded).
    live.buildings.push({ id: 'crate:test', kind: 'crate', x: t.x, y: t.y, placedAt: 0, seed: 'c' });
    away(live);
    run(live, (TREE_RETURN_SECONDS + 60) * 60);
    expect(live.treeAt(index).phase).toBe('cleared');
    expect(live.buildings.find((b) => b.id === 'crate:test')).toMatchObject({ x: t.x, y: t.y }); // never moved
    // Taken away: it comes back.
    live.buildings.splice(live.buildings.findIndex((b) => b.id === 'crate:test'), 1);
    run(live, 10 * 60);
    expect(live.treeAt(index).phase).toBe('regrowing');
  });

  it('never over a farm plot, nor under the Blobbi', () => {
    const live = quiet();
    const index = faceFirst(live, (p) => p.kind === 'tree');
    const t = live.world.objects[index];
    fell(live, index);
    run(live, (STUMP_SECONDS + 2) * 60);
    // The Blobbi stands right on it the whole time.
    live.blobbi.x = t.x;
    live.blobbi.y = t.y;
    run(live, (TREE_RETURN_SECONDS + 30) * 60);
    expect(live.treeAt(index).phase).toBe('cleared');
  });

  it('is deterministic: the same actions give the same states at the same world times', () => {
    const play = () => {
      const live = quiet();
      const index = faceFirst(live, (p) => p.kind === 'tree');
      fell(live, index);
      away(live);
      run(live, (STUMP_SECONDS + TREE_RETURN_SECONDS + 30) * 60);
      return JSON.stringify([...live.trees.entries()]);
    };
    expect(play()).toBe(play());
  });

  it('survives save and load, waiting or growing; a tree felled in an older save keeps its old timeline', () => {
    const store = memoryStore();
    const live = quiet(island(), store);
    const index = faceFirst(live, (p) => p.kind === 'tree');
    fell(live, index);
    run(live, (STUMP_SECONDS + 2) * 60);
    live.save();
    const again = quiet(island(), store);
    expect(again.treeAt(index).phase).toBe('cleared');
    expect(again.absentObject(index)).toBe(true);
    const t = again.world.objects[index];
    expect(again.collision.isBlocked(t.x, t.y)).toBe(false);
    // An M10 phase A (schema 10) record: the tree has no regrowAt and regrows right after its stump, as it did.
    const raw = JSON.parse(store.get(saveKey(live.identity))!);
    raw.version = 10;
    delete raw.trees[String(index)].regrowAt;
    delete raw.cleared;
    delete raw.boat;
    delete raw.caught;
    store.set(saveKey(live.identity), JSON.stringify(raw));
    expect(loadSave(store, live.identity)!.trees[String(index)].regrowAt).toBeUndefined();
    const old = quiet(island(), store);
    expect(old.treeAt(index).phase).toBe('regrowing');
    expect(treeCondition({ hits: 0, harvestedAt: 0 }, STUMP_SECONDS + 1).phase).toBe('regrowing');
  });
});

describe('clearing bushes, small rocks and natural stumps', () => {
  it('the axe clears a bush (a stick and fibre) and the pickaxe a small rock (a stone); both come back later if free', () => {
    const live = quiet();
    const bush = faceFirst(live, (p) => clearableKind(p) === 'bush');
    live.inventory.add(ITEMS.axe.id, 1);
    live.equip(ITEMS.axe.id);
    const sticks = live.inventory.count(ITEMS.stick.id);
    swing(live);
    expect(live.absentObject(bush)).toBe(true);
    expect(live.inventory.count(ITEMS.stick.id)).toBe(sticks + 1);
    const b = live.world.objects[bush];
    expect(live.collision.isBlocked(b.x, b.y)).toBe(false);
    const rock = faceFirst(live, (p) => clearableKind(p) === 'small-rock');
    live.inventory.add('blobbi-pixel:tool:simple-pickaxe', 1);
    live.equip('blobbi-pixel:tool:simple-pickaxe');
    const stones = live.inventory.count(ITEMS.stone.id);
    swing(live);
    expect(live.absentObject(rock)).toBe(true);
    expect(live.inventory.count(ITEMS.stone.id)).toBe(stones + 1);
    away(live);
    run(live, (Math.max(RETURN_SECONDS.bush!, RETURN_SECONDS['small-rock']!) + 10) * 60);
    expect(live.absentObject(bush)).toBe(false);
    expect(live.absentObject(rock)).toBe(false);
  });

  it('keeper pieces (sign, well, lantern, barrel, crate) are never clearable', () => {
    for (const kind of ['sign', 'well', 'lantern', 'barrel', 'crate'])
      expect(clearableKind({ kind: 'decor', layer: 'details', seed: 's', size: 8, x: 0, y: 0, island: 0, variation: { kind } } as Placement)).toBeNull();
    expect(clearableKind({ kind: 'decor', layer: 'details', seed: 's', size: 8, x: 0, y: 0, island: 0, variation: { kind: 'stump' } } as Placement)).toBe('stump');
  });
});

describe('never short of wood', () => {
  it('while fewer than MIN_STANDING_TREES trees stand, driftwood washes up on the shore; with enough trees, none', () => {
    const live = quiet();
    run(live, 120);
    expect(live.resources.some((n) => n.kind === 'driftwood')).toBe(false);
    // Fell (on paper) all but a few trees.
    let left = live.standingTrees();
    live.world.objects.forEach((o, i) => {
      if (o.kind !== 'tree' || left < MIN_STANDING_TREES) return;
      live.trees.set(i, { hits: 0, harvestedAt: live.worldTime, regrowAt: null });
      left--;
    });
    expect(live.standingTrees()).toBeLessThan(MIN_STANDING_TREES);
    run(live, 120);
    const drift = live.resources.filter((n) => n.kind === 'driftwood');
    expect(drift.length).toBeGreaterThan(0);
    // Picked up: wood.
    const d = drift[0];
    live.blobbi.x = d.x;
    live.blobbi.y = d.y + 2;
    const wood = live.inventory.count(ITEMS.wood.id);
    pressE(live);
    run(live, 2);
    expect(live.inventory.count(ITEMS.wood.id)).toBe(wood + 1);
  });
});

describe('room for a bigger house', () => {
  const ISLANDS: [string, (k: number) => ReturnType<typeof island>][] = [
    ['turtle', (k) => island(`up-${k}`)],
    ['manta', (k) => generateMantaWorld(`up-${k}`, { carrierSeed: 'm' + k, generatedHouse: false })],
    ['whale', (k) => generateWhaleWorld(`up-${k}`, { carrierSeed: 'w' + k, generatedHouse: false })],
  ];

  function housed(world: ReturnType<typeof island>) {
    const live = quiet(world);
    live.inventory.add(ITEMS.wood.id, 6);
    live.inventory.add(ITEMS.stone.id, 3);
    live.objectives.completed.materials = 0;
    if (!findBuildSpot(live, 'shelter')) throw new Error('no spot');
    live.setBuildMode('shelter');
    pressE(live);
    run(live, 60 * 26);
    for (const id of ['home', 'harvest']) live.objectives.completed[id] = 0;
    live.inventory.add(ITEMS.wood.id, 10);
    live.inventory.add(ITEMS.stone.id, 6);
    live.inventory.add('blobbi-pixel:material:cloth', 2);
    return live;
  }

  /** The first test island (any Carrier) whose upgrade answer matches. */
  function firstWhere(match: (blocked: string) => boolean) {
    for (const [, make] of ISLANDS)
      for (let k = 0; k < 6; k++) {
        const live = housed(make(k));
        const b = live.houseUpgrade().blocked;
        if (b && match(b)) return live;
      }
    throw new Error('no such island');
  }

  it('names what to clear and where (difficult seeds): "Clear the tree to the left of your house to make room (axe)."', () => {
    const live = firstWhere((b) => b.startsWith('Clear '));
    const check = live.houseUpgrade();
    expect(check.ready).toBe(false);
    expect(check.blocked).toMatch(/^Clear (the|the two|the three|the four) [a-z ,]+(behind|in front of|to the left of|to the right of) your house to make room \((axe|pickaxe)(, (axe|pickaxe))?\)\.$/);
    expect(live.upgradeObstacles.length).toBeGreaterThan(0);
    // The world marks them.
    expect(live.upgradeHintUntil).toBeGreaterThan(live.clock.time);
    // Cleared: the Cottage fits.
    for (const i of live.upgradeObstacles) {
      const o = live.world.objects[i];
      if (o.kind === 'tree') live.trees.set(i, { hits: 0, harvestedAt: live.worldTime - STUMP_SECONDS - 1, regrowAt: null });
      else if (clearableKind(o) === 'rock') live.rocks.set(i, { hits: 0, minedAt: live.worldTime - 30, reformAt: null });
      else live.cleared.set(i, { at: live.worldTime, returnedAt: null });
    }
    run(live, 70);
    expect(live.houseUpgrade().blocked).toBeNull();
    expect(live.upgradeHouse().ok).toBe(true);
  });

  it('when the land itself is in the way, says so and where a move would give room (never moving it)', () => {
    const live = firstWhere((b) => b.includes('does not fit'));
    const house = live.home()!;
    const at = { x: house.x, y: house.y };
    const check = live.houseUpgrade();
    expect(check.blocked).toMatch(/does not fit here: .*Move the house \(M\)(: there is room| to a roomier spot)/);
    expect(live.home()).toMatchObject(at);
  });

  for (const [name, make] of ISLANDS)
    it(`${name}: on every test island the first house can become a Cottage — at once, after clearing, or after a suggested move`, () => {
      for (let k = 0; k < 6; k++) {
        const live = housed(make(k));
        const check = live.houseUpgrade();
        if (!check.blocked) continue;
        if (check.blocked.startsWith('Clear ')) {
          // Clear everything named: then it fits.
          for (const i of live.upgradeObstacles) {
            const o = live.world.objects[i];
            if (o.kind === 'tree') live.trees.set(i, { hits: 0, harvestedAt: live.worldTime - STUMP_SECONDS - 1, regrowAt: null });
            else if (clearableKind(o) === 'rock') live.rocks.set(i, { hits: 0, minedAt: live.worldTime - 30, reformAt: null });
            else live.cleared.set(i, { at: live.worldTime, returnedAt: null });
          }
          run(live, 70);
          expect(live.houseUpgrade().blocked, `${name} up-${k}`).toBeNull();
        } else expect(check.blocked, `${name} up-${k}`).toMatch(/there is room/);
      }
    });
});
