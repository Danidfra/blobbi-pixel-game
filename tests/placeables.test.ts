import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { memoryStore, saveKey } from '../src/game/persistence';
import { ALL_ITEMS, ITEMS, itemById } from '../src/game/items';
import { ALL_PLACEABLE_KINDS, BUILDINGS, buildingSprite, kindForItem } from '../src/game/buildings';
import { RECIPES, recipeById } from '../src/game/crafting';
import { Inventory } from '../src/game/inventory';
import { newContainer, roomFor, transfer } from '../src/game/containers';
import { DOOR, FLOOR, ROOM_H, SPAWN, WALL_ANCHOR_Y, checkInterior } from '../src/game/interior';
import { PLACEABLE_CONTENT } from '../src/content/placeables';
import { ART } from '../src/game/furniture-art';
import { paletteFor } from '../src/world/generate';
import { findBuildSpot, pressE, run, stand } from '../src/dev/scripted-play';
import { GameUI } from '../src/ui/game-ui';
import { StorageScreen } from '../src/ui/screens/storage';
import { CraftingScreen } from '../src/ui/screens/crafting';

const palette = paletteFor('cozy');
const world = () => generateTurtleWorld('turtle-0');
const item = (kind: string) => BUILDINGS[kind].item!;
/** A quiet world with every quest that unlocks a recipe already done (the recipes' unlocks are tested elsewhere). */
function quiet(store = memoryStore()) {
  const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  for (const r of RECIPES) if (r.unlock) live.objectives.completed[r.unlock] = 0;
  return live;
}
/** Place an item from the bag at the first spot near the hub where it fits. */
function placeOutside(live: LiveWorld, kind: string) {
  live.inventory.add(item(kind), 1);
  expect(findBuildSpot(live, kind)).toBe(true);
  expect(live.startPlacing(item(kind))).toBe(true);
  pressE(live);
  run(live, 150); // outdoor pieces take a couple of seconds to set up
  return live.buildings.find((b) => b.kind === kind && !live.buildings.slice(live.buildings.indexOf(b) + 1).some((x) => x.kind === kind))!;
}
/** A finished shelter, and the Blobbi inside it. */
function home(live: LiveWorld) {
  for (const c of BUILDINGS.shelter.cost) live.inventory.add(c.item, c.quantity);
  expect(findBuildSpot(live, 'shelter')).toBe(true);
  live.setBuildMode('shelter');
  pressE(live);
  run(live, 60 * (BUILDINGS.shelter.buildSeconds + 1));
  const s = live.buildings.find((b) => b.kind === 'shelter')!;
  stand(live, s.x, s.y + BUILDINGS.shelter.footRy + live.blobbi.footRy + 3, 'up');
  pressE(live);
  return s;
}

describe('the placeable catalogue', () => {
  it('has 20+ indoor pieces and 15+ outdoor decorations, each with art, a footprint, a bag item and a recipe of real items', () => {
    const indoor = ALL_PLACEABLE_KINDS.filter((k) => BUILDINGS[k].where !== 'outdoor');
    const outdoor = ALL_PLACEABLE_KINDS.filter((k) => k !== 'shelter' && BUILDINGS[k].where !== 'indoor');
    expect(indoor.length).toBeGreaterThanOrEqual(20);
    expect(outdoor.length).toBeGreaterThanOrEqual(15);
    const ids = new Set(ALL_ITEMS.map((d) => d.id));
    for (const p of PLACEABLE_CONTENT) {
      expect(ART[p.art], p.kind).toBeDefined();
      const s = buildingSprite({ id: 'x', kind: p.kind, x: 0, y: 0, placedAt: -1e9, seed: 's', variant: 1 }, palette, 1);
      expect(s.buffer.opaqueCount()).toBeGreaterThan(10);
      // The footprint fits the drawing (within a pixel each side).
      expect(p.footRx * 2 + 1).toBeLessThanOrEqual(s.buffer.width + 2);
      expect(kindForItem(item(p.kind))).toBe(p.kind);
      expect(itemById(item(p.kind))?.category).toBe('furniture');
      const recipe = recipeById(`blobbi-pixel:recipe:${p.kind}`)!;
      for (const ing of recipe.ingredients) expect(ids.has(ing.item), `${p.kind} needs ${ing.item}`).toBe(true);
      // Variants look different.
      if ((p.variants ?? 1) > 1) expect(ART[p.art]({ seed: 's', palette, variant: 0 }).data).not.toEqual(ART[p.art]({ seed: 's', palette, variant: 1 }).data);
    }
    // The M4 decorations can be picked up into items too.
    for (const k of ['fence', 'flower-bed', 'lantern', 'bench', 'crate']) expect(itemById(item(k))).toBeDefined();
    expect(BUILDINGS.shelter.item).toBeNull();
  });
});

describe('containers (pure)', () => {
  it('transfers atomically and partially, never creating or losing items, within capacity and stack limits', () => {
    const bag = new Inventory('bag');
    const chest = newContainer('c', 2);
    bag.add(ITEMS.stone.id, 20);
    bag.add(ITEMS.stick.id, 5);
    bag.add(ITEMS.wood.id, 3);
    const total = () => bag.total() + chest.inventory.total();
    const t0 = total();
    expect(transfer(bag, chest.inventory, ITEMS.stone.id, 7, chest.capacity)).toBe(7);
    expect(transfer(bag, chest.inventory, ITEMS.stick.id, 99, chest.capacity)).toBe(5); // all there is
    // Capacity: two stacks; a third kind does not fit, more of a kind it holds does.
    expect(roomFor(chest.inventory, ITEMS.wood.id, chest.capacity)).toBe(0);
    expect(transfer(bag, chest.inventory, ITEMS.wood.id, 1, chest.capacity)).toBe(0);
    expect(transfer(bag, chest.inventory, ITEMS.stone.id, 99, chest.capacity)).toBe(13);
    expect(chest.inventory.count(ITEMS.stone.id)).toBe(20);
    expect(transfer(chest.inventory, bag, ITEMS.stone.id, 5)).toBe(5);
    expect(total()).toBe(t0);
    expect(transfer(bag, bag, ITEMS.stone.id, 1)).toBe(0);
    expect(transfer(bag, chest.inventory, ITEMS.stone.id, -1)).toBe(0);
    expect(transfer(bag, chest.inventory, ITEMS.stone.id, 1.5)).toBe(0);
  });
});

describe('crafting and placing furniture', () => {
  it('basic pieces are made in the hand; furniture needs a workbench nearby and its recipe unlocked', () => {
    const live = new LiveWorld(world(), 'blobbi-9', 16);
    live.brain.enabled = false;
    const chair = recipeById('blobbi-pixel:recipe:chair')!;
    for (const i of chair.ingredients) live.inventory.add(i.item, i.quantity);
    expect(live.recipeKnown(chair)).toBe(false); // the shelter quest teaches it
    expect(live.craftRecipe(chair)).toBe(false);
    live.objectives.completed.shelter = 0;
    expect(live.recipeKnown(chair)).toBe(true);
    expect(live.craftRecipe(chair)).toBe(false); // no workbench
    expect(live.bubble?.text).toBe('needs a workbench nearby');
    const bench = recipeById('blobbi-pixel:recipe:workbench')!;
    for (const i of bench.ingredients) live.inventory.add(i.item, i.quantity);
    expect(live.craftRecipe(bench)).toBe(true);
    const wb = placeOutside(live, 'workbench');
    stand(live, wb.x, wb.y + BUILDINGS.workbench.footRy + 4, 'up');
    expect(live.nearStation('workbench')).toBe(true);
    expect(live.craftRecipe(chair)).toBe(true);
    expect(live.inventory.count(item('chair'))).toBe(1);
    // Two path tiles per recipe.
    const path = recipeById('blobbi-pixel:recipe:stone-path')!;
    live.inventory.add(ITEMS.stone.id, 2);
    expect(live.craftRecipe(path)).toBe(true);
    expect(live.inventory.count(item('stone-path'))).toBe(2);
  });

  it('placing from the bag: one item per placement, blocks collision and navigation when solid, walkable when floor, persists with its style', () => {
    const store = memoryStore();
    const live = quiet(store);
    const freeBefore = live.nav.freeCount();
    const chest = placeOutside(live, 'chest');
    expect(live.inventory.count(item('chest'))).toBe(0);
    expect(live.collision.isBlocked(chest.x + 0.5, chest.y + 0.5)).toBe(true);
    expect(live.nav.freeCount()).toBeLessThan(freeBefore);
    // A path tile is walked over.
    live.inventory.add(item('stone-path'), 3);
    expect(findBuildSpot(live, 'stone-path', live.world.hubs[0], 120)).toBe(true);
    live.startPlacing(item('stone-path'));
    pressE(live);
    const path = live.buildings.find((b) => b.kind === 'stone-path')!;
    expect(live.collision.isBlocked(path.x + 0.5, path.y + 0.5)).toBe(false);
    expect(live.placing).toBe(item('stone-path')); // still placing: two left
    live.stopPlacing();
    // Indoor furniture refuses the outdoors.
    live.inventory.add(item('bed'), 1);
    expect(live.startPlacing(item('bed'))).toBe(false);
    expect(live.bubble?.text).toBe('that goes inside the house');
    // Style: T cycles the colourway of a scarecrow while placing it.
    live.inventory.add(item('scarecrow'), 1);
    expect(findBuildSpot(live, 'scarecrow')).toBe(true);
    live.startPlacing(item('scarecrow'));
    expect(live.cycleVariant()).toBe(1);
    pressE(live);
    const sc = live.buildings.find((b) => b.kind === 'scarecrow')!;
    expect(sc.variant).toBe(1);
    live.save();
    const b = quiet(store);
    expect(b.buildings.map((x) => [x.id, x.kind, x.x, x.y, x.variant ?? 0])).toEqual(live.buildings.map((x) => [x.id, x.kind, x.x, x.y, x.variant ?? 0]));
    expect(b.collision.isBlocked(chest.x + 0.5, chest.y + 0.5)).toBe(true);
    expect(b.collision.isBlocked(path.x + 0.5, path.y + 0.5)).toBe(false);
  });
});

describe('storage chests', () => {
  it('E on a chest opens storage; transfers survive reloads; several chests are independent; nothing duplicates', () => {
    const store = memoryStore();
    const live = quiet(store);
    const a = placeOutside(live, 'chest');
    const b = placeOutside(live, 'chest');
    expect(a.id).not.toBe(b.id);
    live.inventory.add(ITEMS.stone.id, 10);
    live.inventory.add(ITEMS.wood.id, 4);
    stand(live, a.x, a.y + BUILDINGS.chest.footRy + 4, 'up');
    expect(live.prompt()).toBe('E  open the wooden chest');
    pressE(live);
    expect(live.uiRequest).toMatchObject({ screen: 'storage', target: a });
    // Through the screen: Enter stores the whole stack, Space one, H half.
    const ui = new GameUI(() => live, () => palette);
    const screen = new StorageScreen();
    ui.register(screen);
    ui.poll();
    expect(ui.screen?.id).toBe('storage');
    expect(screen.target).toBe(a);
    const before = live.inventory.total() + live.containerFor(a)!.inventory.total() + live.containerFor(b)!.inventory.total();
    ui.handleKey('Enter'); // first stack of the bag (stone, a material)
    expect(live.containerFor(a)!.inventory.count(ITEMS.stone.id)).toBe(10);
    ui.handleKey('Space'); // one wood
    expect(live.containerFor(a)!.inventory.count(ITEMS.wood.id)).toBe(1);
    ui.handleKey('Tab'); // the chest side
    ui.handleKey('KeyH'); // half of the first chest stack back
    expect(live.inventory.count(ITEMS.stone.id) + live.inventory.count(ITEMS.wood.id)).toBe(3 + 5);
    expect(live.containerFor(b)!.inventory.total()).toBe(0);
    const after = live.inventory.total() + live.containerFor(a)!.inventory.total() + live.containerFor(b)!.inventory.total();
    expect(after).toBe(before);
    expect(live.tally.stored).toBe(11);
    live.save();
    const raw = JSON.parse(store.get(saveKey(live.identity))!);
    expect(Object.keys(raw.containers)).toEqual([`island/${a.id}`]);
    const re = quiet(store);
    const ra = re.buildings.find((x) => x.id === a.id)!;
    expect(re.containerFor(ra)!.inventory.entries()).toEqual(live.containerFor(a)!.inventory.entries());
    expect(re.inventory.entries()).toEqual(live.inventory.entries());
  });

  it('a chest holding items cannot be picked up; moved, it keeps its contents; empty, it goes back to the bag', () => {
    const live = quiet();
    const chest = placeOutside(live, 'chest');
    live.inventory.add(ITEMS.stone.id, 3);
    live.moveItems(chest, ITEMS.stone.id, 3, true);
    stand(live, chest.x, chest.y + BUILDINGS.chest.footRy + 4, 'up');
    live.toggleManage();
    expect(live.selectedPlaced()).toBe(chest);
    expect(live.removeSelected()).toBe(false);
    expect(live.bubble?.text).toBe('empty it first');
    expect(live.buildings).toContain(chest);
    // Move it: same record, same contents, the old spot free, the new one blocked.
    const from = { x: chest.x, y: chest.y };
    expect(live.pickUpToMove()).toBe(true);
    expect(live.collision.isBlocked(from.x + 0.5, from.y + 0.5)).toBe(false);
    let moved = false;
    for (const [dx, dy] of [[0, 30], [30, 0], [-30, 0], [0, 40], [40, 20]]) {
      stand(live, from.x + dx, from.y + dy, 'down');
      if (live.placementCheck().ok && live.placeMoved()) {
        moved = true;
        break;
      }
    }
    expect(moved).toBe(true);
    expect(chest.x !== from.x || chest.y !== from.y).toBe(true);
    expect(live.collision.isBlocked(chest.x + 0.5, chest.y + 0.5)).toBe(true);
    expect(live.containerFor(chest)!.inventory.count(ITEMS.stone.id)).toBe(3);
    // Empty it and pick it up.
    live.moveItems(chest, ITEMS.stone.id, 3, false);
    stand(live, chest.x, chest.y + BUILDINGS.chest.footRy + 4, 'up');
    expect(live.removeSelected()).toBe(true);
    expect(live.buildings).not.toContain(chest);
    expect(live.inventory.count(item('chest'))).toBe(1);
    expect(live.inventory.count(ITEMS.stone.id)).toBe(3);
    expect(live.collision.isBlocked(chest.x + 0.5, chest.y + 0.5)).toBe(false);
  });
});

describe('building management', () => {
  it('moving can be cancelled (back where it was); a shelter moves but is never picked up; restyle cycles the colourway', () => {
    const live = quiet();
    const sc = placeOutside(live, 'scarecrow');
    stand(live, sc.x, sc.y + BUILDINGS.scarecrow.footRy + 4, 'up');
    live.toggleManage();
    expect(live.restyleSelected()).toBe(true);
    expect(sc.variant).toBe(1);
    const from = { x: sc.x, y: sc.y };
    live.pickUpToMove();
    expect(live.buildings).not.toContain(sc);
    expect(live.previewKind).toBe('scarecrow');
    live.cancelMove();
    expect(live.buildings).toContain(sc);
    expect({ x: sc.x, y: sc.y }).toEqual(from);
    expect(live.collision.isBlocked(sc.x + 0.5, sc.y + 0.5)).toBe(true);
    // The shelter.
    live.toggleManage();
    for (const c of BUILDINGS.shelter.cost) live.inventory.add(c.item, c.quantity);
    expect(findBuildSpot(live, 'shelter')).toBe(true);
    live.setBuildMode('shelter');
    pressE(live);
    const shelter = live.buildings.find((b) => b.kind === 'shelter')!;
    stand(live, shelter.x, shelter.y + BUILDINGS.shelter.footRy + 4, 'up');
    live.toggleManage();
    expect(live.selectedPlaced()).toBe(shelter);
    expect(live.removalProblem(shelter)).toBe('a home stays. move it instead');
    expect(live.removeSelected()).toBe(false);
  });

  it('nothing is placed on the Blobbi, and a solid piece may not cut the way to the bed or the door', () => {
    const live = quiet();
    home(live);
    expect(live.inside).toBe(true);
    const furniture = live.interior!.state.furniture;
    // On the Blobbi.
    expect(checkInterior('table', Math.round(live.blobbi.x), Math.round(live.blobbi.y) - 3, furniture, live.blobbi).ok).toBe(false);
    // A wall of furniture across the whole room would cut the bed off from the Blobbi by the door.
    stand(live, SPAWN.x, SPAWN.y - 4, 'up');
    expect(live.cutsOffPath({ x0: FLOOR.x0, y0: 52, x1: FLOOR.x1, y1: 58 })).toBe(true);
    expect(live.cutsOffPath({ x0: 70, y0: 52, x1: 80, y1: 58 })).toBe(false);
  });
});

describe('the house interior', () => {
  it('E at the shelter door goes in: the room scene, starter furniture, the room camera bounds; walking out of the door leaves at the doorway', () => {
    const live = quiet();
    const shelter = home(live);
    expect(live.inside).toBe(true);
    expect(live.sceneBounds()).toEqual({ width: 128, height: 96 });
    expect(live.blobbi.x).toBe(SPAWN.x);
    expect(live.interior!.state.furniture.map((f) => f.kind).sort()).toEqual(['bed', 'chest', 'rug', 'table', 'wall-lantern']);
    // Island systems are untouched: no resources, farm or objects indoors.
    expect(live.nearestResource()).toBeNull();
    expect(live.facingObject()).toBeNull();
    expect(live.farmAction()).toBeNull();
    // Walk out through the door gap.
    live.blobbi.x = (DOOR.x0 + DOOR.x1) / 2;
    live.blobbi.y = ROOM_H - 10;
    for (let i = 0; i < 60 && live.inside; i++) live.update(1 / 60, { ...IDLE_INPUT, down: true });
    expect(live.inside).toBe(false);
    expect(Math.abs(live.blobbi.x - shelter.x)).toBeLessThan(8);
    expect(live.blobbi.y).toBeGreaterThan(shelter.y);
    expect(live.collision).toBe(live.islandCollision);
  });

  it('furniture placed inside (on the floor and on the wall) persists with the shelter, and survives the shelter moving', () => {
    const store = memoryStore();
    const live = quiet(store);
    const shelter = home(live);
    live.inventory.add(item('chair'), 1);
    live.inventory.add(item('painting'), 1);
    stand(live, 40, 70, 'down');
    expect(live.startPlacing(item('chair'))).toBe(true);
    pressE(live);
    const chair = live.interior!.state.furniture.find((f) => f.kind === 'chair')!;
    expect(chair).toBeDefined();
    expect(live.collision.isBlocked(chair.x + 0.5, chair.y + 0.5)).toBe(true);
    stand(live, 60, 40, 'up');
    live.startPlacing(item('painting'));
    pressE(live);
    const painting = live.interior!.state.furniture.find((f) => f.kind === 'painting')!;
    expect(painting.y).toBe(WALL_ANCHOR_Y);
    // Outdoor pieces stay outside.
    live.inventory.add(item('scarecrow'), 1);
    expect(live.startPlacing(item('scarecrow'))).toBe(false);
    live.exitInterior();
    live.save();
    const b = quiet(store);
    expect(b.interiors.get(shelter.id)!.furniture.map((f) => [f.kind, f.x, f.y])).toEqual(live.interiors.get(shelter.id)!.furniture.map((f) => [f.kind, f.x, f.y]));
    // Move the shelter: same id, same interior.
    const s2 = b.buildings.find((x) => x.id === shelter.id)!;
    stand(b, s2.x, s2.y + BUILDINGS.shelter.footRy + 4, 'up');
    b.toggleManage();
    b.pickUpToMove();
    let moved = false;
    for (const [dx, dy] of [[0, 50], [50, 20], [-50, 20], [0, -50], [60, 40], [-60, 40]]) {
      stand(b, shelter.x + dx, shelter.y + dy, 'down');
      if (b.placementCheck().ok && b.placeMoved()) {
        moved = true;
        break;
      }
    }
    if (!moved) b.cancelMove();
    const s3 = b.buildings.find((x) => x.id === shelter.id)!;
    stand(b, s3.x, s3.y + BUILDINGS.shelter.footRy + b.blobbi.footRy + 3, 'up');
    b.toggleManage();
    pressE(b);
    expect(b.inside).toBe(true);
    expect(b.interior!.state.furniture.some((f) => f.kind === 'painting')).toBe(true);
  });

  it('a tired Blobbi indoors walks to its bed and sleeps there (twice as fast)', () => {
    const live = quiet();
    home(live);
    live.care.energy = 20;
    live.rest();
    for (let i = 0; i < 60 * 20 && live.brain.state !== 'rest'; i++) live.update(1 / 60, IDLE_INPUT);
    expect(live.brain.state).toBe('rest');
    expect(live.brain.restAtShelter).toBe(true);
    const bed = live.interior!.state.furniture.find((f) => f.kind === 'bed')!;
    expect(Math.hypot(live.blobbi.x - bed.x, live.blobbi.y - bed.y)).toBeLessThan(16);
  });
});

describe('the crafting screen', () => {
  it('lists only known recipes (telling how many are left), crafts with Enter, and the Build tab enters build mode', () => {
    const live = new LiveWorld(world(), 'blobbi-9', 16);
    live.brain.enabled = false;
    const ui = new GameUI(() => live, () => palette);
    const screen = new CraftingScreen();
    ui.register(screen);
    ui.handleKey('KeyK');
    expect(ui.screen?.id).toBe('crafting');
    // The known ones, then (M10 phase C) the ones an open quest is about to teach, shown LOCKED with how to unlock
    // them ("Deeper stone" is open from the start and teaches the copper tools).
    expect(screen.entries(ui).filter((e) => !e.locked).map((e) => e.label)).toEqual(['Simple axe', 'Simple pickaxe', 'Simple hoe']);
    expect(screen.entries(ui).filter((e) => e.locked).every((e) => e.locked === 'Complete "Deeper stone" to unlock.')).toBe(true);
    for (const i of recipeById('blobbi-pixel:recipe:simple-axe')!.ingredients) live.inventory.add(i.item, i.quantity);
    ui.handleKey('Enter');
    expect(live.inventory.count(ITEMS.axe.id)).toBe(1);
    screen.tab = 'furniture';
    expect(screen.hidden(ui, 'furniture')).toBeGreaterThan(5);
    screen.tab = 'build';
    screen.index = 0;
    ui.handleKey('Enter');
    expect(live.buildMode).toBe('shelter');
    expect(ui.capturing).toBe(false);
  });
});
