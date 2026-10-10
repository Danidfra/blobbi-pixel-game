import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT, type LiveInput } from '../src/sim/live-world';
import { LiveRenderer, Camera, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { BUILDINGS, buildingProgress, checkPlacement, generateShelter, quantizeProgress } from '../src/game/buildings';
import { consumeIngredients } from '../src/game/crafting';
import { Inventory } from '../src/game/inventory';
import { ITEMS, stackLimit } from '../src/game/items';
import { memoryStore, loadSave, saveKey, worldIdentity, SAVE_VERSION } from '../src/game/persistence';
import { paletteFor } from '../src/world/generate';
import { T } from '../src/world/types';
import { alpha, hex } from '../src/core/color';

const palette = paletteFor('cozy');
const run = (live: LiveWorld, steps: number, input: Partial<LiveInput> = {}) => {
  for (let i = 0; i < steps; i++) live.update(1 / 60, { ...IDLE_INPUT, ...input, interact: i === 0 && !!input.interact, plant: false });
};
const stock = (live: LiveWorld) => {
  live.inventory.add(ITEMS.wood.id, 6);
  live.inventory.add(ITEMS.stone.id, 3);
};
/** Walk the Blobbi to a spot where the preview fits (facing down), trying the hub's surroundings. */
function findBuildableSpot(live: LiveWorld): boolean {
  const hub = live.world.hubs[0];
  for (let r = 0; r < 80; r += 4)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = Math.round(hub.x + Math.cos(a) * r);
      const y = Math.round(hub.y + Math.sin(a) * r * 0.7);
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      live.blobbi.x = x;
      live.blobbi.y = y;
      run(live, 1, { down: true });
      live.blobbi.x = x;
      live.blobbi.y = y;
      if (live.placementCheck('shelter').ok) return true;
    }
  return false;
}

describe('the shelter sprite', () => {
  it('is deterministic, has walls of wood and a thatched roof when finished, and grows through posts, walls and roof', () => {
    const a = generateShelter('s', 29, palette, 1);
    const b = generateShelter('s', 29, palette, 1);
    expect(a.buffer.data).toEqual(b.buffer.data);
    expect(a.footRx).toBe(BUILDINGS.shelter.footRx);
    expect(a.anchorY).toBe(a.buffer.height - 2);
    let wood = 0;
    for (const c of a.buffer.data) if (c === palette.wood.mid || c === palette.wood.light || c === palette.wood.dark) wood++;
    expect(wood).toBeGreaterThan(60);
    const counts = [0, 0.3, 0.6, 0.9, 1].map((p) => generateShelter('s', 29, palette, p).buffer.opaqueCount());
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    // Under construction the top of the sprite is empty; finished it is not.
    const early = generateShelter('s', 29, palette, 0.2);
    let topOpaque = 0;
    for (let y = 0; y < early.buffer.height / 2; y++) for (let x = 0; x < early.buffer.width; x++) if (alpha(early.buffer.get(x, y))) topOpaque++;
    expect(topOpaque).toBeLessThan(12);
    expect(generateShelter('other', 29, palette, 1).buffer.data).not.toEqual(a.buffer.data);
    expect(quantizeProgress(0.51)).toBe(0.5);
    expect(quantizeProgress(1.2)).toBe(1);
  });
});

describe('placement', () => {
  it('refuses water, blocked footprints, resources, the Blobbi and other buildings, and accepts flat free grass', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    const ctx = () => ({ world: live.world, isBlocked: (x: number, y: number) => live.collision.isBlocked(x + 0.5, y + 0.5), buildings: live.buildings, resources: live.resources, blobbi: live.blobbi });
    // Water: the sea corner.
    expect(checkPlacement('shelter', 6, 6, ctx())).toMatchObject({ ok: false, problem: 'edge' });
    expect(checkPlacement('shelter', 40, 40, ctx())).toMatchObject({ ok: false, problem: 'water' });
    expect(checkPlacement('shelter', 120, 120, ctx()).ok).toBe(false);
    const { width, cls } = live.world.terrain;
    const sea = (() => {
      for (let y = 60; y < 300; y++) for (let x = 60; x < 300; x++) if (cls[y * width + x] === T.WATER) return { x, y };
      throw new Error('no water');
    })();
    expect(checkPlacement('shelter', sea.x, sea.y, ctx()).problem).toBe('water');
    // A tree's footprint.
    const tree = live.world.objects.find((o) => o.kind === 'tree')!;
    expect(checkPlacement('shelter', tree.x, tree.y, ctx()).ok).toBe(false);
    // A valid spot.
    expect(findBuildableSpot(live)).toBe(true);
    const spot = live.placementSpot('shelter');
    const check = live.placementCheck('shelter');
    expect(check.ok).toBe(true);
    expect(check.x1 - check.x0).toBe(BUILDINGS.shelter.footRx * 2);
    // The Blobbi standing there.
    expect(checkPlacement('shelter', Math.round(live.blobbi.x), Math.round(live.blobbi.y), ctx()).problem).toBe('blobbi');
    // A resource there.
    live.resources.push({ id: 'test', kind: 'stone', x: spot.x, y: spot.y, variant: 0, source: -1 });
    expect(live.placementCheck('shelter').problem).toBe('resource');
    live.resources.pop();
    // Another building there.
    stock(live);
    live.setBuildMode('shelter');
    const placed = live.placeBuilding()!;
    expect(placed).not.toBeNull();
    expect(checkPlacement('shelter', placed.x, placed.y + 4, ctx()).problem).toBe('building');
    expect(checkPlacement('shelter', placed.x + 2, placed.y, ctx()).problem).toBe('building');
  });

  it('previews in front of the Blobbi, following its facing', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-1'), 'blobbi-9', 16);
    live.brain.enabled = false;
    const b = live.blobbi;
    run(live, 1, { right: true });
    const right = live.placementSpot('shelter');
    expect(right.x).toBeGreaterThan(b.x + BUILDINGS.shelter.footRx);
    run(live, 1, { left: true });
    run(live, 8);
    const left = live.placementSpot('shelter');
    expect(left.x).toBeLessThan(b.x - BUILDINGS.shelter.footRx);
    run(live, 1, { up: true });
    const up = live.placementSpot('shelter');
    expect(up.y).toBeLessThan(b.y - BUILDINGS.shelter.footRy);
    expect(right.x % 2).toBe(0);
    expect(up.y % 2).toBe(0);
  });
});

describe('building', () => {
  it('costs 6 wood and 3 stone atomically, blocks its footprint, keeps the Blobbi and the brain out, and finishes in world time', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    expect(findBuildableSpot(live)).toBe(true);
    const spot = live.placementSpot('shelter');
    // Without materials: nothing placed, a bubble.
    live.setBuildMode('shelter');
    expect(live.buildMode).toBe('shelter');
    run(live, 1, { interact: true });
    expect(live.buildings.length).toBe(0);
    expect(live.bubble?.text).toContain('need');
    // Short by one stone: nothing consumed.
    live.inventory.add(ITEMS.wood.id, 6);
    live.inventory.add(ITEMS.stone.id, 2);
    run(live, 1, { interact: true });
    expect(live.buildings.length).toBe(0);
    expect(live.inventory.count(ITEMS.wood.id)).toBe(6);
    expect(live.inventory.count(ITEMS.stone.id)).toBe(2);
    // Enough: placed, paid, build mode left.
    live.inventory.add(ITEMS.stone.id, 1);
    const freeBefore = live.nav.freeCount();
    run(live, 1, { interact: true });
    expect(live.buildings.length).toBe(1);
    const building = live.buildings[0];
    expect(building).toMatchObject({ id: 'shelter:0', kind: 'shelter', x: spot.x, y: spot.y });
    expect(building.seed).toBe(`${live.world.seed}/shelter/0`);
    expect(live.inventory.count(ITEMS.wood.id)).toBe(0);
    expect(live.inventory.count(ITEMS.stone.id)).toBe(0);
    expect(live.buildMode).toBeNull();
    expect(live.stats.built).toBe(1);
    expect(live.bubble?.text).toContain('building a');
    // Collision: the footprint is blocked, the nav grid lost cells, the Blobbi cannot walk in.
    const def = BUILDINGS.shelter;
    expect(live.collision.isBlocked(building.x, building.y)).toBe(true);
    expect(live.collision.isBlocked(building.x - def.footRx, building.y + def.footRy)).toBe(true);
    expect(live.collision.isBlocked(building.x, building.y + def.footRy + 3)).toBe(false);
    expect(live.nav.freeCount()).toBeLessThan(freeBefore);
    for (let i = 0; i < 60 * 3; i++) {
      live.update(1 / 60, { ...IDLE_INPUT, up: true });
      expect(live.collision.canStand(live.blobbi.x, live.blobbi.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(true);
    }
    expect(Math.abs(live.blobbi.y - building.y)).toBeGreaterThan(def.footRy);
    // Construction progresses with world time and completes.
    expect(live.buildingAt(building)).toBeLessThan(0.3);
    run(live, Math.ceil(def.buildSeconds * 60 * 0.5));
    expect(live.buildingAt(building)).toBeGreaterThan(0.4);
    expect(live.buildingAt(building)).toBeLessThan(0.7);
    while (live.buildingAt(building) < 1) live.update(1 / 60, IDLE_INPUT);
    live.update(1 / 60, IDLE_INPUT); // the site is checked at the start of a step, before the clock ticks
    expect(live.buildingAt(building)).toBe(1);
    expect(live.bubble?.text).toContain('finished');
    // A second one needs materials again and a fresh id.
    stock(live);
    live.blobbi.x = building.x;
    live.blobbi.y = building.y + def.footRy + 14;
    run(live, 1, { up: true });
    live.setBuildMode('shelter');
    expect(live.placementCheck('shelter').problem).toBe('building');
    run(live, 1, { interact: true });
    expect(live.buildings.length).toBe(1);
    expect(live.inventory.count(ITEMS.wood.id)).toBe(6); // nothing consumed on an invalid spot
  });

  it('consumes ingredients atomically', () => {
    const inv = new Inventory('t', stackLimit);
    inv.add(ITEMS.wood.id, 6);
    inv.add(ITEMS.stone.id, 2);
    expect(consumeIngredients(inv, BUILDINGS.shelter.cost)).toBe(false);
    expect(inv.count(ITEMS.wood.id)).toBe(6);
    inv.add(ITEMS.stone.id, 1);
    expect(consumeIngredients(inv, BUILDINGS.shelter.cost)).toBe(true);
    expect(inv.total()).toBe(0);
  });

  it('is drawn in the frame at its construction stage, and the preview shows green when valid and red when not', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16);
    live.brain.enabled = false;
    const renderer = new LiveRenderer(live);
    expect(findBuildableSpot(live)).toBe(true);
    const frame = (time = live.clock.time) => {
      const camera = new Camera();
      camera.follow(live.blobbi.x, live.blobbi.y, 96, 72, live.world.options.width, live.world.options.height, 0, true);
      return renderer.render(96, 72, camera.x, camera.y, time, { ...DEFAULT_LIVE_OPTIONS, hud: false, animateWater: false, animateWind: false }).clone();
    };
    const count = (f: ReturnType<typeof frame>, colour: number) => f.data.filter((c) => c === colour).length;
    const green = hex('#4dffb0');
    const red = hex('#ff3b5c');
    live.setBuildMode('shelter');
    const valid = frame();
    expect(count(valid, green)).toBeGreaterThan(40);
    expect(count(valid, red)).toBe(0);
    // Face a tree: red.
    const tree = live.world.objects.find((o) => o.kind === 'tree')!;
    live.blobbi.x = tree.x;
    live.blobbi.y = tree.y + live.spriteOf(tree).footRy + 8;
    run(live, 1, { up: true });
    const invalid = frame();
    expect(count(invalid, red)).toBeGreaterThan(40);
    expect(count(invalid, green)).toBe(0);
    live.setBuildMode(null);
    expect(count(frame(), red) + count(frame(), green)).toBe(0);
    // Place and watch it rise.
    expect(findBuildableSpot(live)).toBe(true);
    stock(live);
    live.setBuildMode('shelter');
    run(live, 1, { interact: true });
    const b = live.buildings[0];
    const early = frame();
    run(live, Math.ceil(BUILDINGS.shelter.buildSeconds * 60) + 10);
    const done = frame();
    expect(done.data).not.toEqual(early.data);
    expect(live.buildingAt(b)).toBe(1);
    // The finished shelter is a wood-walled, thatched thing in the frame: wood pixels appear where it stands.
    let wood = 0;
    for (const c of done.data) if (c === palette.wood.mid || c === palette.wood.light) wood++;
    expect(wood).toBeGreaterThan(40);
  });
});

describe('persistence', () => {
  it('keeps buildings across a reload in island-frame coordinates, construction continuing in world time, footprint blocked again', () => {
    const store = memoryStore();
    let live = new LiveWorld(generateTurtleWorld('turtle-2'), 'blobbi-9', 16, { store });
    live.brain.enabled = false;
    expect(findBuildableSpot(live)).toBe(true);
    stock(live);
    live.setBuildMode('shelter');
    run(live, 1, { interact: true });
    const placed = live.buildings[0];
    run(live, 60 * 11); // the autosave runs every ten seconds
    live.save();
    const origin = live.world.carrier!.origin;
    const record = JSON.parse(store.get(saveKey(worldIdentity(live.world)))!);
    expect(record.version).toBe(SAVE_VERSION);
    expect(record.buildings).toEqual([{ id: 'shelter:0', kind: 'shelter', x: placed.x - origin.x, y: placed.y - origin.y, placedAt: placed.placedAt, seed: placed.seed }]);
    expect(origin.y).toBeGreaterThan(0); // Variant B: the island frame really is offset
    const progressBefore = live.buildingAt(placed);
    live = new LiveWorld(generateTurtleWorld('turtle-2'), 'blobbi-9', 16, { store });
    expect(live.buildings).toEqual([placed]);
    expect(live.buildingAt(live.buildings[0])).toBeCloseTo(progressBefore, 2);
    expect(live.collision.isBlocked(placed.x, placed.y)).toBe(true);
    expect(live.inventory.total()).toBe(0);
    run(live, Math.ceil(BUILDINGS.shelter.buildSeconds * 60));
    expect(live.buildingAt(live.buildings[0])).toBe(1);
    // A version 2 record (M2.2) loads with no buildings; bad building entries are dropped.
    const identity = worldIdentity(live.world);
    const v2 = { ...record, version: 2 };
    delete v2.buildings;
    store.set(saveKey(identity), JSON.stringify(v2));
    expect(loadSave(store, identity)!.buildings).toEqual([]);
    store.set(saveKey(identity), JSON.stringify({ ...record, buildings: [{ id: 'x' }, { id: 'shelter:1', kind: 'shelter', x: 1.5, y: 2, placedAt: 0, seed: 's' }, { id: 'shelter:2', kind: 'shelter', x: 10, y: 20, placedAt: 3, seed: 's' }, { id: 'shelter:3', kind: 'castle', x: 10, y: 20, placedAt: 3, seed: 's' }] }));
    const loaded = loadSave(store, identity)!;
    expect(loaded.buildings.map((b) => b.id)).toEqual(['shelter:2', 'shelter:3']);
    const again = new LiveWorld(generateTurtleWorld('turtle-2'), 'blobbi-9', 16, { store });
    expect(again.buildings.map((b) => b.id)).toEqual(['shelter:2']); // unknown kinds are not placed
    expect(again.buildings[0].x).toBe(10 + origin.x);
    // Reset removes them and unblocks the ground.
    again.resetProgress();
    expect(again.buildings.length).toBe(0);
    expect(again.collision.isBlocked(10 + origin.x, 20 + origin.y)).toBe(live.world.terrain.cls[(20 + origin.y) * live.world.terrain.width + 10 + origin.x] < T.GRASS_EDGE);
  });

  it('uses stable island-frame coordinates: the same record places the building at the same island spot in another shell variant', () => {
    const store = memoryStore();
    const a = new LiveWorld(generateTurtleWorld('turtle-0', { shellVariant: 0 }), 'blobbi-9', 16, { store });
    a.brain.enabled = false;
    expect(findBuildableSpot(a)).toBe(true);
    stock(a);
    a.setBuildMode('shelter');
    run(a, 1, { interact: true });
    const placed = a.buildings[0];
    a.save();
    // Copy the record under Variant B's identity (another canvas, origin 0,48): the building must land at the
    // same island-frame spot, i.e. shifted by the origin in canvas coordinates.
    const recordA = store.get(saveKey(worldIdentity(a.world)))!;
    const worldB = generateTurtleWorld('turtle-0', { shellVariant: 2 });
    const idB = worldIdentity(worldB);
    store.set(saveKey(idB), recordA.replaceAll(worldIdentity(a.world), idB));
    const b = new LiveWorld(worldB, 'blobbi-9', 16, { store });
    expect(b.buildings[0].x).toBe(placed.x + worldB.carrier!.origin.x);
    expect(b.buildings[0].y).toBe(placed.y + worldB.carrier!.origin.y);
    expect(buildingProgress(b.buildings[0], b.worldTime)).toBeCloseTo(buildingProgress(placed, a.worldTime), 1);
  });
});

describe('autonomy and buildings', () => {
  it('never builds or enters build mode on its own, and walks around a placed shelter', () => {
    const store = memoryStore();
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store });
    live.brain.enabled = false;
    expect(findBuildableSpot(live)).toBe(true);
    stock(live);
    live.setBuildMode('shelter');
    run(live, 1, { interact: true });
    const building = live.buildings[0];
    stock(live);
    live.brain.enabled = true;
    run(live, 60 * 6);
    expect(live.brain.state).not.toBe('manual');
    const def = BUILDINGS.shelter;
    let inside = 0;
    for (let i = 0; i < 60 * 90; i++) {
      live.update(1 / 60, IDLE_INPUT);
      const bl = live.blobbi;
      if (Math.abs(bl.x - building.x) <= def.footRx && Math.abs(bl.y - building.y) <= def.footRy) inside++;
      expect(live.collision.canStand(bl.x, bl.y, bl.footRx, bl.footRy)).toBe(true);
    }
    expect(inside).toBe(0);
    expect(live.buildings.length).toBe(1);
    expect(live.buildMode).toBeNull();
    expect(live.inventory.count(ITEMS.wood.id)).toBe(6);
    expect(live.stats.built).toBe(1);
  });
});
