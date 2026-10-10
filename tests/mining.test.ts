import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT, SWING, type LiveInput } from '../src/sim/live-world';
import { LiveRenderer, Camera, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ITEMS, toolSupports } from '../src/game/items';
import { RECIPES, canCraft } from '../src/game/crafting';
import { attachTool, STEEL, toolSprite } from '../src/game/equipment';
import { HITS_TO_MINE, LARGE_ROCK_SIZE, RUBBLE_SECONDS, rockCondition, stoneYield } from '../src/game/rocks';
import { RESPAWN_SECONDS } from '../src/game/resources';
import { memoryStore, loadSave, saveKey, worldIdentity, SAVE_VERSION } from '../src/game/persistence';
import { REST_POSE } from '../src/blobbi/sprite';
import { paletteFor } from '../src/world/generate';
import { BUILDINGS } from '../src/game/buildings';

const palette = paletteFor('cozy');
const PICK = ITEMS.pickaxe.id;
const PICK_RECIPE = RECIPES.find((r) => r.output.item === PICK)!;
const run = (live: LiveWorld, steps: number, input: Partial<LiveInput> = {}) => {
  for (let i = 0; i < steps; i++) live.update(1 / 60, { ...IDLE_INPUT, ...input, interact: i === 0 && !!input.interact, plant: false });
};
const swingOnce = (live: LiveWorld) => {
  run(live, 1, { interact: true });
  run(live, Math.ceil(SWING.end * 60) + 4);
};
/** Stand south of a rock (large or small as asked), facing up at it, with nothing collectable in reach. */
function faceRock(live: LiveWorld, large = true): number {
  for (let i = 0; i < live.world.objects.length; i++) {
    const o = live.world.objects[i];
    if (o.kind !== 'rock' || (o.size >= LARGE_ROCK_SIZE) !== large) continue;
    const s = live.spriteOf(o);
    for (const dy of [s.footRy + 4, s.footRy + 6, s.footRy + 8]) {
      const x = o.x;
      const y = o.y + dy;
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      live.blobbi.x = x;
      live.blobbi.y = y;
      run(live, 1, { up: true });
      live.blobbi.x = x;
      live.blobbi.y = y;
      if (live.facingObject()?.index === i) {
        live.resources = live.resources.filter((n) => Math.hypot(n.x - x, (n.y - y) * 1.25) > 14);
        return i;
      }
    }
  }
  throw new Error('no rock to face');
}
const withPickaxe = (live: LiveWorld) => {
  live.inventory.add(PICK, 1);
  expect(live.equip(PICK)).toBe(true);
};

describe('the pickaxe', () => {
  it('is a tool that mines (not chops), crafted from 2 wood + 2 sticks + 3 stones, one at a time', () => {
    expect(PICK).toBe('blobbi-pixel:tool:simple-pickaxe');
    expect(toolSupports(PICK, 'mine')).toBe(true);
    expect(toolSupports(PICK, 'chop')).toBe(false);
    expect(toolSupports(ITEMS.axe.id, 'mine')).toBe(false);
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    expect(live.craftRecipe(PICK_RECIPE)).toBe(false);
    live.inventory.add(ITEMS.wood.id, 2);
    live.inventory.add(ITEMS.stick.id, 2);
    live.inventory.add(ITEMS.stone.id, 3);
    expect(canCraft(live.inventory, PICK_RECIPE).ok).toBe(true);
    expect(live.craftRecipe(PICK_RECIPE)).toBe(true);
    expect(live.inventory.entries()).toEqual([{ item: PICK, quantity: 1 }]);
    live.inventory.add(ITEMS.wood.id, 2);
    live.inventory.add(ITEMS.stick.id, 2);
    live.inventory.add(ITEMS.stone.id, 3);
    expect(live.craftRecipe(PICK_RECIPE)).toBe(false); // stack of one, nothing consumed
    expect(live.inventory.count(ITEMS.stone.id)).toBe(3);
  });

  it('is drawn procedurally with a wooden handle and a steel head, in the anatomical left hand like the axe', () => {
    for (const o of ['rest', 'carry', 'raised', 'strike', 'strike-down', 'strike-up'] as const) {
      const s = toolSprite(PICK, o, palette);
      let steel = 0;
      let wood = 0;
      for (const c of s.buffer.data) {
        if (c === STEEL.mid || c === STEEL.light || c === STEEL.dark) steel++;
        if (c === palette.wood.mid || c === palette.wood.light || c === palette.wood.dark) wood++;
      }
      expect(steel).toBeGreaterThanOrEqual(3);
      expect(wood).toBeGreaterThanOrEqual(3);
      expect(s.buffer.width).toBeLessThanOrEqual(9);
      expect(s.buffer.data).not.toEqual(toolSprite(ITEMS.axe.id, o, palette).buffer.data);
    }
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    const spriteOf = (p: typeof REST_POSE) => live.blobbiSprite(p);
    const front = attachTool(PICK, { ...REST_POSE }, 'idle', live.rig, spriteOf, palette);
    const right = attachTool(PICK, { ...REST_POSE, view: 'side', facing: 1 }, 'idle', live.rig, spriteOf, palette);
    expect(front.arm).toBe('right-arm');
    expect(front.dx).toBeGreaterThan(0);
    expect(right.visible).toBe(false);
  });
});

describe('mining large rocks', () => {
  it('four landed swings break a large rock into rubble and award stones; the footprint and navigation stay', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    const index = faceRock(live);
    const rock = live.world.objects[index];
    const blocked = live.collision.blocked.slice();
    const free = live.nav.freeCount();
    // Without the pickaxe: the ordinary interaction.
    run(live, 1, { interact: true });
    expect(live.rocks.size).toBe(0);
    withPickaxe(live);
    for (let hit = 1; hit < HITS_TO_MINE; hit++) {
      run(live, 1, { interact: true });
      expect(live.swing?.action).toBe('mine');
      expect(live.rocks.get(index)?.hits ?? 0).toBe(hit - 1); // nothing at the press
      run(live, Math.ceil(SWING.end * 60) + 4);
      expect(live.rocks.get(index)).toEqual({ hits: hit, minedAt: null });
      expect(live.rockAt(index).phase).toBe('mining');
      expect(live.inventory.count(ITEMS.stone.id)).toBe(0);
    }
    swingOnce(live);
    expect(live.rockAt(index).phase).toBe('rubble');
    expect(live.inventory.count(ITEMS.stone.id)).toBe(stoneYield(rock.seed, rock.size));
    expect(live.stats.mined).toBe(1);
    const rubble = live.objectSprite(index);
    expect(rubble).not.toBe(live.spriteOf(rock));
    expect(rubble.buffer.height).toBeLessThan(live.spriteOf(rock).buffer.height);
    expect(rubble.footRx).toBe(live.spriteOf(rock).footRx);
    expect(live.collision.blocked).toEqual(blocked);
    expect(live.nav.freeCount()).toBe(free);
    expect(live.world.objects[index]).toEqual(rock);
    // Rubble cannot be mined again.
    const stones = live.inventory.count(ITEMS.stone.id);
    swingOnce(live);
    expect(live.inventory.count(ITEMS.stone.id)).toBe(stones);
    expect(live.bubble?.text).toContain('rubble');
  });

  it('refuses small rocks, needs the pickaxe (the axe does not mine), and respects the stone stack limit', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    faceRock(live, false);
    withPickaxe(live);
    swingOnce(live);
    expect(live.rocks.size).toBe(0);
    expect(live.bubble?.text).toBe('too small to mine');
    const index = faceRock(live, true);
    live.inventory.add(ITEMS.axe.id, 1);
    live.equip(ITEMS.axe.id);
    swingOnce(live);
    expect(live.rocks.size).toBe(0);
    live.equip(PICK);
    live.inventory.add(ITEMS.stone.id, ITEMS.stone.stack);
    for (let i = 0; i < HITS_TO_MINE; i++) swingOnce(live);
    expect(live.rockAt(index).phase).toBe('rubble');
    expect(live.inventory.count(ITEMS.stone.id)).toBe(ITEMS.stone.stack);
    expect(live.bubble?.text).toBe('stones full');
  });

  it('becomes whole again after RUBBLE_SECONDS of world time and can be mined again', () => {
    expect(rockCondition({ hits: 0, minedAt: 10 }, 10 + RUBBLE_SECONDS - 1).phase).toBe('rubble');
    expect(rockCondition({ hits: 0, minedAt: 10 }, 10 + RUBBLE_SECONDS)).toEqual({ phase: 'whole', remaining: 0 });
    const live = new LiveWorld(generateTurtleWorld('turtle-1'), 'blobbi-9', 16);
    live.brain.enabled = false;
    const index = faceRock(live);
    const rock = live.world.objects[index];
    withPickaxe(live);
    for (let i = 0; i < HITS_TO_MINE; i++) swingOnce(live);
    expect(live.rockAt(index).phase).toBe('rubble');
    run(live, RUBBLE_SECONDS * 60 + 30);
    expect(live.rockAt(index).phase).toBe('whole');
    expect(live.objectSprite(index)).toBe(live.spriteOf(rock));
    const before = live.inventory.count(ITEMS.stone.id);
    live.resources = [];
    for (let i = 0; i < HITS_TO_MINE; i++) swingOnce(live);
    expect(live.inventory.count(ITEMS.stone.id)).toBe(Math.min(ITEMS.stone.stack, before + stoneYield(rock.seed, rock.size)));
    expect(live.stats.mined).toBe(2);
  });
});

describe('renewable resources', () => {
  it('a collected node grows back after its respawn time, in world time, in generation order', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    const node = live.resources.find((n) => n.kind === 'stick')!;
    live.blobbi.x = node.x + 4;
    live.blobbi.y = node.y;
    expect(live.collect()).toBe(node);
    expect(live.collectedAt.get(node.id)).toBeCloseTo(live.worldTime, 3);
    live.blobbi.x = node.x + 60; // out of the way
    run(live, (RESPAWN_SECONDS.stick - 2) * 60);
    expect(live.resources.some((n) => n.id === node.id)).toBe(false);
    run(live, 4 * 60);
    expect(live.resources.some((n) => n.id === node.id)).toBe(true);
    expect(live.collected.has(node.id)).toBe(false);
    expect(live.collectedAt.has(node.id)).toBe(false);
    expect(live.resources.map((n) => n.id)).toEqual(live.allResources.filter((n) => live.resources.includes(n)).map((n) => n.id));
    // The node can be collected again.
    live.blobbi.x = node.x + 4;
    expect(live.collect()?.id).toBe(node.id);
  });

  it('does not grow back under a building or under the Blobbi', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    const [a, b] = live.resources.filter((n) => n.kind === 'seed');
    for (const n of [a, b]) {
      live.blobbi.x = n.x + 3;
      live.blobbi.y = n.y;
      expect(live.collect()?.id).toBe(n.id);
    }
    // A building over a; the Blobbi standing on b.
    live.collision.blockEllipse(a.x, a.y, BUILDINGS.shelter.footRx, BUILDINGS.shelter.footRy, true);
    live.blobbi.x = b.x;
    live.blobbi.y = b.y;
    run(live, (RESPAWN_SECONDS.seed + 3) * 60);
    expect(live.collected.has(a.id)).toBe(true);
    expect(live.collected.has(b.id)).toBe(true);
    live.blobbi.x = b.x + 40;
    run(live, 90);
    expect(live.collected.has(b.id)).toBe(false);
    expect(live.collected.has(a.id)).toBe(true);
  });
});

describe('persistence (schema 4)', () => {
  it('keeps rock states and collection times across a reload, and migrates schema 3 records', () => {
    const store = memoryStore();
    let live = new LiveWorld(generateTurtleWorld('turtle-2'), 'blobbi-9', 16, { store });
    live.brain.enabled = false;
    const index = faceRock(live);
    withPickaxe(live);
    for (let i = 0; i < HITS_TO_MINE; i++) swingOnce(live);
    const node = live.allResources.find((n) => n.kind === 'stone' && live.resources.includes(n))!;
    live.blobbi.x = node.x + 3;
    live.blobbi.y = node.y;
    live.collect();
    live.save();
    const record = JSON.parse(store.get(saveKey(worldIdentity(live.world)))!);
    expect(record.version).toBe(SAVE_VERSION);
    expect(record.rocks[String(index)].minedAt).toBeCloseTo(live.rocks.get(index)!.minedAt!, 5);
    expect(record.collectedAt[node.id]).toBeCloseTo(live.collectedAt.get(node.id)!, 5);
    const minedAt = live.rocks.get(index)!.minedAt!;
    live = new LiveWorld(generateTurtleWorld('turtle-2'), 'blobbi-9', 16, { store });
    expect(live.rockAt(index).phase).toBe('rubble');
    expect(live.rocks.get(index)!.minedAt).toBeCloseTo(minedAt, 5);
    expect(live.equipped).toBe(PICK);
    expect(live.collected.has(node.id)).toBe(true);
    // A schema 3 record: collected nodes get the record's world time as their collection time; no rocks.
    const identity = worldIdentity(live.world);
    const v3 = { ...record, version: 3, worldTime: 500 };
    delete v3.rocks;
    delete v3.collectedAt;
    store.set(saveKey(identity), JSON.stringify(v3));
    const migrated = loadSave(store, identity)!;
    expect(migrated.rocks).toEqual({});
    for (const id of migrated.collected) expect(migrated.collectedAt[id]).toBe(500);
    expect(migrated.buildings).toEqual(record.buildings);
    store.set(saveKey(identity), JSON.stringify({ ...record, version: SAVE_VERSION + 1 }));
    expect(loadSave(store, identity)).toBeNull();
  });
});

describe('autonomy and mining', () => {
  it('never mines, crafts or switches tools on its own', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    withPickaxe(live);
    live.inventory.add(ITEMS.wood.id, 4);
    const snapshot = live.inventory.snapshot();
    run(live, 60 * 6);
    for (let i = 0; i < 60 * 90; i++) live.update(1 / 60, IDLE_INPUT);
    expect(live.rocks.size).toBe(0);
    expect(live.stats.mines).toBe(0);
    expect(live.inventory.snapshot()).toEqual(snapshot);
    expect(live.equipped).toBe(PICK);
  });

  it('draws the pickaxe in the frame when equipped and hides it facing right', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    withPickaxe(live);
    const renderer = new LiveRenderer(live);
    const steel = (dir: 'down' | 'right') => {
      run(live, 1, { [dir]: true });
      run(live, 8);
      live.resources = live.resources.filter((n) => Math.hypot(n.x - live.blobbi.x, n.y - live.blobbi.y) > 60);
      const camera = new Camera();
      camera.follow(live.blobbi.x, live.blobbi.y - 8, 96, 72, live.world.options.width, live.world.options.height, 0, true);
      const f = renderer.render(96, 72, camera.x, camera.y, live.clock.time, { ...DEFAULT_LIVE_OPTIONS, hud: false });
      return f.data.filter((c) => c === STEEL.mid || c === STEEL.light || c === STEEL.dark).length;
    };
    expect(steel('down')).toBeGreaterThanOrEqual(3);
    expect(steel('right')).toBe(0);
  });
});

describe('small rocks answer every press (M3.2 regression)', () => {
  /** Read through a call, so TypeScript does not narrow the bubble to the null we just assigned. */
  const bubbleText = (live: LiveWorld) => live.bubble?.text;
  /** A display frame shorter than the 1/60 s step: the clock runs no step on it. */
  const shortFrame = 1 / 120;

  it('a press on a frame with no simulation step is kept for the next step: "too small to mine"', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    faceRock(live, false);
    withPickaxe(live);
    live.bubble = null;
    expect(live.update(shortFrame, { ...IDLE_INPUT, interact: true })).toBe(0);
    expect(live.update(shortFrame, IDLE_INPUT)).toBe(1);
    expect(bubbleText(live)).toBe('too small to mine');
    expect(live.swing).toBeNull();
    expect(live.rocks.size).toBe(0);
    // Consumed once: the following steps do not repeat it.
    live.bubble = null;
    for (let i = 0; i < 6; i++) live.update(shortFrame, IDLE_INPUT);
    expect(live.bubble).toBeNull();
  });

  it('at 120 and 144 Hz every press on a small rock gets the feedback', () => {
    for (const hz of [120, 144]) {
      const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
      live.brain.enabled = false;
      faceRock(live, false);
      withPickaxe(live);
      for (let press = 0; press < 20; press++) {
        live.bubble = null;
        live.update(1 / hz, { ...IDLE_INPUT, interact: true });
        for (let f = 0; f < 3; f++) live.update(1 / hz, IDLE_INPUT);
        expect(bubbleText(live), `${hz} Hz press ${press}`).toBe('too small to mine');
        for (let f = 0; f < 120; f++) live.update(1 / hz, IDLE_INPUT);
      }
    }
  });

  it('walking into a small rock from any side and pressing E says it is too small, with dust and no swing', () => {
    let checked = 0;
    for (const seed of ['turtle-0', 'turtle-1', 'turtle-2']) {
      const base = generateTurtleWorld(seed);
      for (let i = 0; i < base.objects.length && checked < 12; i++) {
        const o = base.objects[i];
        if (o.kind !== 'rock' || o.size >= LARGE_ROCK_SIZE) continue;
        for (const [dir, ox, oy] of [['up', 0, 1], ['down', 0, -1], ['left', 1, 0], ['right', -1, 0]] as const) {
          const live = new LiveWorld(base, 'blobbi-9', 16);
          live.brain.enabled = false;
          withPickaxe(live);
          const sx = o.x + ox * 24;
          const sy = o.y + oy * 24;
          if (!live.collision.canStand(sx, sy, live.blobbi.footRx, live.blobbi.footRy)) continue;
          live.blobbi.x = sx;
          live.blobbi.y = sy;
          run(live, 60, { [dir]: true });
          if (live.facingObject()?.index !== i) continue; // walked past it or stopped by something else
          live.resources = [];
          const particles = live.particles.particles.length;
          live.bubble = null;
          run(live, 1, { interact: true });
          expect(bubbleText(live)).toBe('too small to mine');
          expect(live.swing).toBeNull();
          expect(live.particles.particles.length).toBeGreaterThan(particles);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it('keeps the E priority: a resource in reach is collected first, the next press answers for the rock', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    faceRock(live, false);
    withPickaxe(live);
    live.resources = [{ ...live.allResources.find((n) => n.kind === 'stone')!, x: live.blobbi.x + 2, y: live.blobbi.y }];
    run(live, 1, { interact: true });
    expect(live.inventory.count(ITEMS.stone.id)).toBe(1);
    run(live, 1, { interact: true });
    expect(bubbleText(live)).toBe('too small to mine');
  });

  it('large rocks are unchanged: still four landed swings at 120 Hz, one swing per press', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    const index = faceRock(live);
    withPickaxe(live);
    for (let hit = 1; hit <= HITS_TO_MINE; hit++) {
      live.update(1 / 120, { ...IDLE_INPUT, interact: true });
      for (let f = 0; f < Math.ceil(SWING.end * 120) + 8; f++) live.update(1 / 120, IDLE_INPUT);
      if (hit < HITS_TO_MINE) expect(live.rocks.get(index)).toEqual({ hits: hit, minedAt: null });
    }
    expect(live.rockAt(index).phase).toBe('rubble');
  });

  it('a press while paused is dropped, not replayed on resume', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    faceRock(live, false);
    withPickaxe(live);
    live.bubble = null;
    live.clock.paused = true;
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    live.clock.paused = false;
    live.update(1 / 60, IDLE_INPUT);
    expect(live.bubble).toBeNull();
  });
});
