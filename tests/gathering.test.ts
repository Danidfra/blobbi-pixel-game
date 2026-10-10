import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateWorld } from '../src/world/generate';
import { LiveWorld, IDLE_INPUT, type LiveInput } from '../src/sim/live-world';
import { generateResources, REACH, RESOURCE_ITEM, RESOURCE_STACK, resourceSprite } from '../src/game/resources';
import { Inventory } from '../src/game/inventory';
import { memoryStore, loadSave, saveKey, worldIdentity, SAVE_VERSION } from '../src/game/persistence';
import { T, WALKABLE } from '../src/world/types';
import { paletteFor } from '../src/world/generate';

const run = (live: LiveWorld, steps: number, input: Partial<LiveInput> = {}) => {
  for (let i = 0; i < steps; i++) live.update(1 / 60, { ...IDLE_INPUT, ...input, interact: i === 0 && !!input.interact, plant: false });
};

/** Put the Blobbi at a standable spot within `d` pixels of a node (or exactly `d` away, horizontally when possible). */
function standNear(live: LiveWorld, node: { x: number; y: number }, d: number): boolean {
  const b = live.blobbi;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const x = node.x + Math.cos(a) * d;
    const y = node.y + (Math.sin(a) * d) / 1.25;
    if (live.collision.canStand(x, y, b.footRx, b.footRy)) {
      b.x = x;
      b.y = y;
      return true;
    }
  }
  return false;
}

describe('resource placement', () => {
  it('is deterministic, on walkable ground off the paths, near its sources, and the same for the same world', () => {
    for (const seed of ['turtle-0', 'turtle-1', 'turtle-2']) {
      const world = generateTurtleWorld(seed);
      const a = new LiveWorld(world, 'blobbi-9', 16);
      const b = new LiveWorld(world, 'blobbi-9', 16);
      expect(a.allResources).toEqual(b.allResources);
      expect(generateResources(world, (x, y, rx, ry) => a.collision.canStand(x, y, rx, ry))).toEqual(a.allResources);
      const nodes = a.allResources;
      expect(nodes.length).toBeGreaterThan(15);
      const kinds = new Set(nodes.map((n) => n.kind));
      expect(kinds).toEqual(new Set(['stick', 'stone', 'seed']));
      const ids = new Set(nodes.map((n) => n.id));
      expect(ids.size).toBe(nodes.length);
      const { width, cls } = world.terrain;
      for (const n of nodes) {
        const c = cls[n.y * width + n.x];
        expect(WALKABLE.has(c)).toBe(true);
        expect(c).not.toBe(T.PATH);
        expect(a.collision.canStand(n.x, n.y, 2, 1)).toBe(true);
        if (n.source >= 0) {
          const o = world.objects[n.source];
          expect(Math.hypot(o.x - n.x, o.y - n.y)).toBeLessThan(16);
          expect(n.kind === 'stick' ? o.kind === 'tree' : n.kind === 'stone' ? o.kind === 'rock' : o.kind === 'bush' || o.kind === 'flower').toBe(true);
        }
      }
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) expect(Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y)).toBeGreaterThanOrEqual(6);
    }
    // Different worlds give different nodes.
    const w1 = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    const w2 = new LiveWorld(generateTurtleWorld('turtle-1'), 'blobbi-9', 16);
    expect(w1.allResources).not.toEqual(w2.allResources);
    // Each kind has three small sprites with an outline and a ground anchor.
    const palette = paletteFor('cozy');
    for (const kind of ['stick', 'stone', 'seed'] as const)
      for (let v = 0; v < 3; v++) {
        const s = resourceSprite(kind, v, palette);
        expect(s.buffer.opaqueCount()).toBeGreaterThan(6);
        expect(s.buffer.width).toBeLessThanOrEqual(9);
        expect(s.anchorY).toBe(s.buffer.height - 1);
      }
  });
});

describe('collecting', () => {
  it('needs the player within reach: far away nothing happens, in reach E collects exactly one', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    // A node with no other node within twice the reach, so "far from it" is far from everything.
    const node = live.resources.find((n) => live.resources.every((m) => m === n || Math.hypot(m.x - n.x, m.y - n.y) > REACH * 2 + 8))!;
    expect(node).toBeDefined();
    const before = live.resources.length;
    expect(standNear(live, node, REACH + 6)).toBe(true);
    expect(live.nearestResource()).toBeNull();
    run(live, 1, { interact: true });
    expect(live.resources.length).toBe(before);
    expect(live.inventory.total()).toBe(0);
    expect(live.stats.interactions).toBe(1); // the ordinary interaction ran instead
    expect(standNear(live, node, REACH - 3)).toBe(true);
    expect(live.nearestResource()).toBe(node);
    run(live, 1, { interact: true });
    expect(live.resources.length).toBe(before - 1);
    expect(live.resources.includes(node)).toBe(false);
    expect(live.collected.has(node.id)).toBe(true);
    expect(live.inventory.count(RESOURCE_ITEM[node.kind])).toBe(1);
    expect(live.stats.collected).toBe(1);
    expect(live.pickups.length).toBe(1);
    expect(live.bubble?.text.startsWith('+1')).toBe(true);
    // A second press with nothing else in reach falls through to the ordinary interaction.
    const far = live.nearestResource();
    if (!far) {
      run(live, 1, { interact: true });
      expect(live.inventory.total()).toBe(1);
    }
    // The pickup animation ends on its own.
    run(live, 60);
    expect(live.pickups.length).toBe(0);
  });

  it('respects collision: a node across blocked ground is out of reach', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-2'), 'blobbi-9', 16);
    // The reach is measured from the ground point, never through a sprite's footprint: standing on the far
    // side of a tree from its stick, the stick is further than REACH because the footprint keeps us away.
    const stick = live.allResources.find((n) => n.kind === 'stick' && n.source >= 0)!;
    const tree = live.world.objects[stick.source];
    const sprite = live.spriteOf(tree);
    const dx = tree.x - stick.x;
    const dy = tree.y - stick.y;
    const len = Math.hypot(dx, dy) || 1;
    const x = tree.x + (dx / len) * (sprite.footRx + 4);
    const y = tree.y + (dy / len) * (sprite.footRx + 4);
    live.blobbi.x = x;
    live.blobbi.y = y;
    const d = Math.hypot(stick.x - x, (stick.y - y) * 1.25);
    expect(d).toBeGreaterThan(REACH);
    expect(live.nearestResource()).not.toBe(stick);
    run(live, 1, { interact: true });
    expect(live.resources.includes(stick)).toBe(true);
  });

  it('stops at the stack limit with feedback, never drops the extra one on the ground', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    const stone = live.resources.find((n) => n.kind === 'stone')!;
    live.inventory.add(RESOURCE_ITEM.stone, RESOURCE_STACK.stone);
    expect(live.inventory.isFull(RESOURCE_ITEM.stone)).toBe(true);
    expect(standNear(live, stone, 4)).toBe(true);
    run(live, 1, { interact: true });
    expect(live.resources.includes(stone)).toBe(true);
    expect(live.inventory.count(RESOURCE_ITEM.stone)).toBe(RESOURCE_STACK.stone);
    expect(live.bubble?.text).toBe('stones full');
  });
});

describe('inventory', () => {
  it('adds, removes, counts, clamps to the stack limit and snapshots deterministically', () => {
    const inv = new Inventory('test', (item) => (item === 'x' ? 3 : 10));
    expect(inv.add('x', 2)).toBe(2);
    expect(inv.add('x', 5)).toBe(1);
    expect(inv.add('x', 1)).toBe(0);
    expect(inv.count('x')).toBe(3);
    expect(inv.isFull('x')).toBe(true);
    expect(inv.add('y', 0)).toBe(0);
    expect(inv.add('y', -2)).toBe(0);
    expect(inv.add('y', 1.5)).toBe(0);
    expect(inv.add('y', 4)).toBe(4);
    expect(inv.remove('y', 10)).toBe(4);
    expect(inv.count('y')).toBe(0);
    expect(inv.remove('y', 1)).toBe(0);
    expect(inv.entries()).toEqual([{ item: 'x', quantity: 3 }]);
    const r = inv.revision;
    expect(inv.add('x', 1)).toBe(0);
    expect(inv.revision).toBe(r); // nothing moved, no revision
    inv.add('a', 2);
    expect(inv.entries().map((e) => e.item)).toEqual(['a', 'x']);
    const snap = inv.snapshot();
    expect(snap).toEqual({ version: 1, context: 'test', revision: inv.revision, items: [{ item: 'a', quantity: 2 }, { item: 'x', quantity: 3 }] });
    const back = Inventory.fromSnapshot(snap, (item) => (item === 'x' ? 2 : 10));
    expect(back.count('x')).toBe(2); // clamped to the (smaller) limit
    expect(back.count('a')).toBe(2);
    expect(back.revision).toBe(inv.revision);
    expect(Inventory.fromSnapshot({ version: 1, context: 'c', revision: 0, items: [{ item: 'bad', quantity: -1 }, { item: 'ok', quantity: 1 }] }).entries()).toEqual([{ item: 'ok', quantity: 1 }]);
  });
});

describe('persistence', () => {
  it('survives a reload: collected nodes stay gone and the inventory comes back', () => {
    const store = memoryStore();
    const world = generateTurtleWorld('turtle-1');
    const live = new LiveWorld(world, 'blobbi-9', 16, { store });
    const nodes = live.resources.slice(0, 3);
    for (const n of nodes) {
      expect(standNear(live, n, 3)).toBe(true);
      run(live, 1, { interact: true });
    }
    expect(live.resources.length).toBe(live.allResources.length - 3);
    const snapshot = live.inventory.snapshot();
    expect(snapshot.items.reduce((s, e) => s + e.quantity, 0)).toBe(3);
    // "Reload": a new live world on the same store.
    const again = new LiveWorld(generateTurtleWorld('turtle-1'), 'blobbi-9', 16, { store });
    expect(again.resources.length).toBe(live.allResources.length - 3);
    for (const n of nodes) expect(again.resources.some((m) => m.id === n.id)).toBe(false);
    expect(again.inventory.snapshot()).toEqual(snapshot);
    expect(again.collected).toEqual(live.collected);
    // The record is versioned and keyed by the world identity.
    const key = saveKey(worldIdentity(world));
    expect(key).toContain('blobbi-pixel-lab:save:v1:'); // the key namespace; the record carries SAVE_VERSION
    expect(key).toContain('turtle-1');
    expect(key).toContain('variant=2');
    const raw = JSON.parse(store.get(key)!);
    expect(raw.version).toBe(SAVE_VERSION);
    // A record of another version is ignored, not half-read.
    store.set(key, JSON.stringify({ ...raw, version: 999 }));
    expect(loadSave(store, worldIdentity(world))).toBeNull();
    const fresh = new LiveWorld(generateTurtleWorld('turtle-1'), 'blobbi-9', 16, { store });
    expect(fresh.resources.length).toBe(fresh.allResources.length);
    expect(fresh.inventory.total()).toBe(0);
    // Garbage is ignored too.
    store.set(key, '{not json');
    expect(loadSave(store, worldIdentity(world))).toBeNull();
    // Reset forgets the progress.
    store.set(key, JSON.stringify(raw));
    const reset = new LiveWorld(generateTurtleWorld('turtle-1'), 'blobbi-9', 16, { store });
    expect(reset.inventory.total()).toBe(3);
    reset.resetProgress();
    expect(reset.inventory.total()).toBe(0);
    expect(reset.resources.length).toBe(reset.allResources.length);
    expect(store.get(key)).toBeNull();
  });

  it('keeps unrelated worlds apart: another seed, variant or Blobbi size shares nothing', () => {
    const store = memoryStore();
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store });
    expect(standNear(live, live.resources[0], 3)).toBe(true);
    run(live, 1, { interact: true });
    expect(live.inventory.total()).toBe(1);
    const otherSeed = new LiveWorld(generateTurtleWorld('turtle-3'), 'blobbi-9', 16, { store });
    expect(otherSeed.inventory.total()).toBe(0);
    expect(otherSeed.resources.length).toBe(otherSeed.allResources.length);
    const otherVariant = new LiveWorld(generateTurtleWorld('turtle-0', { shellVariant: 0 }), 'blobbi-9', 16, { store });
    expect(otherVariant.inventory.total()).toBe(0);
    expect(otherVariant.resources.length).toBe(otherVariant.allResources.length);
    const island = new LiveWorld(generateWorld('turtle-0', { width: 448, height: 288, scale: 1 }), 'blobbi-9', 16, { store });
    expect(island.inventory.total()).toBe(0);
    // The same world with another Blobbi shares the world's progress (the inventory belongs to the world).
    const sameWorld = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-19', 16, { store });
    expect(sameWorld.inventory.total()).toBe(1);
    expect(store.data.size).toBe(1);
    // Without a store nothing persists.
    const none = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    expect(standNear(none, none.resources[0], 3)).toBe(true);
    run(none, 1, { interact: true });
    expect(store.data.size).toBe(1);
  });
});

describe('autonomy and resources', () => {
  it('never collects on its own: two minutes of autonomy, nodes untouched, inventory empty, interactions still happen', () => {
    for (const seed of ['turtle-0', 'turtle-2']) {
      const store = memoryStore();
      const live = new LiveWorld(generateTurtleWorld(seed), 'blobbi-9', 16, { store });
      const count = live.resources.length;
      let nearSteps = 0;
      for (let i = 0; i < 60 * 120; i++) {
        live.update(1 / 60, IDLE_INPUT);
        if (live.nearestResource()) nearSteps++;
      }
      expect(live.resources.length).toBe(count);
      expect(live.inventory.total()).toBe(0);
      expect(live.stats.collected).toBe(0);
      // The autosave (world time) runs, but the record holds no collected node and an empty bag.
      const record = loadSave(store, live.identity);
      expect(record?.collected ?? []).toEqual([]);
      expect(record?.inventory.items ?? []).toEqual([]);
      expect(live.brain.state).not.toBe('manual');
      // It walked past resources (within reach at least once) and inspected things on its own.
      expect(nearSteps).toBeGreaterThan(0);
      expect(live.stats.interactions).toBeGreaterThan(0);
    }
  });

  it('manual input overrides autonomy at once and the keyboard still moves, slides and interacts as before', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    run(live, 60 * 3);
    const x0 = live.blobbi.x;
    run(live, 30, { right: true });
    expect(live.brain.state).toBe('manual');
    expect(live.blobbi.x).toBeGreaterThan(x0);
    expect(live.collision.canStand(live.blobbi.x, live.blobbi.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(true);
    // Walking into blocked ground slides or stops, never enters it.
    for (let i = 0; i < 60 * 6; i++) {
      live.update(1 / 60, { ...IDLE_INPUT, up: true, left: true });
      expect(live.collision.canStand(live.blobbi.x, live.blobbi.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(true);
    }
    // E with nothing in reach is the ordinary interaction.
    const before = live.stats.interactions;
    while (live.nearestResource()) live.resources = live.resources.filter((n) => n !== live.nearestResource());
    run(live, 1, { interact: true });
    expect(live.stats.interactions).toBe(before + 1);
    expect(live.inventory.total()).toBe(0);
  });
});
