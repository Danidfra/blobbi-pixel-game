/**
 * SCRIPTED PLAY for tests and screenshot scripts: put the Blobbi somewhere, face a way, press keys, let time pass.
 * Every action goes through the live world's public input and methods, the same as a player's. Never imported by
 * the game.
 */
import { LiveWorld, IDLE_INPUT, SWING, type LiveInput } from '../sim/live-world';
import type { Direction } from '../blobbi/animation';
import { PLOT_GRID, type Cell, type CropKind } from '../game/farming';
import { ITEMS } from '../game/items';
import { recipeById } from '../game/crafting';
import { BUILDINGS, footOf, type BuildingKind } from '../game/buildings';
import type { ResourceKind } from '../game/resources';
import { MAIN_QUESTS } from '../game/objectives';
import { DAY_SECONDS } from '../game/daylight';

const QUESTS_MAIN_IDS = MAIN_QUESTS.map((q) => q.id);

export function run(live: LiveWorld, n: number, input: Partial<LiveInput> = {}): void {
  for (let i = 0; i < n; i++) live.update(1 / 60, { ...IDLE_INPUT, ...input, interact: false, plant: false });
}

/** Stand at (x, y) facing `dir` (one step with the key, then back on the spot). */
export function stand(live: LiveWorld, x: number, y: number, dir: Direction): void {
  live.blobbi.x = x;
  live.blobbi.y = y;
  live.update(1 / 60, { ...IDLE_INPUT, [dir]: true });
  live.blobbi.x = x;
  live.blobbi.y = y;
}

/** Press E once and let any swing finish. */
export function pressE(live: LiveWorld): void {
  live.update(1 / 60, { ...IDLE_INPUT, interact: true });
  run(live, Math.ceil(SWING.end * 60) + 2);
}

/** Press E until `done` (E picks up a resource in reach before anything else), at most `max` times. */
export function pressUntil(live: LiveWorld, done: () => boolean, max = 4): boolean {
  for (let i = 0; i < max && !done(); i++) pressE(live);
  return done();
}

/** Where to stand to face a cell from above (facing down: the target cell is just below the feet). */
/**
 * Aboard: paddle the canoe to (x, y) the way a player steers — along a path over water the hull fits (a
 * breadth-first search on a 4 px grid of `SeaNav.canFloat` positions), holding the keys toward each waypoint.
 * `each` runs after every frame. Returns whether the canoe got within 6 px.
 */
export function sailTo(live: LiveWorld, x: number, y: number, each?: () => void, maxFrames = 60 * 90): boolean {
  const boat = live.boat;
  if (!boat?.aboard) return false;
  const nav = live.seaNav();
  const r = nav.region;
  const g = 4;
  const cols = Math.ceil((r.x1 - r.x0) / g);
  const rows = Math.ceil((r.y1 - r.y0) / g);
  const cell = (px: number, py: number) => Math.round((py - r.y0) / g) * cols + Math.round((px - r.x0) / g);
  const fits = (k: number) => {
    const px = r.x0 + (k % cols) * g;
    const py = r.y0 + Math.floor(k / cols) * g;
    return nav.canFloat(px, py, 'right') || nav.canFloat(px, py, 'down') || nav.canFloat(px, py, 'left') || nav.canFloat(px, py, 'up');
  };
  const start = cell(boat.x, boat.y);
  const goal = cell(x, y);
  const from = new Int32Array(cols * rows).fill(-2);
  from[start] = -1;
  const queue = [start];
  for (let q = 0; q < queue.length && from[goal] === -2; q++) {
    const k = queue[q];
    const c = k % cols;
    const rr = Math.floor(k / cols);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = rr + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const nk = nr * cols + nc;
      if (from[nk] !== -2 || (nk !== goal && !fits(nk))) continue;
      from[nk] = k;
      queue.push(nk);
    }
  }
  if (from[goal] === -2) return false;
  const path: { x: number; y: number }[] = [];
  for (let k = goal; k >= 0; k = from[k]) path.unshift({ x: r.x0 + (k % cols) * g, y: r.y0 + Math.floor(k / cols) * g });
  path[path.length - 1] = { x, y };
  let i = 0;
  for (let f = 0; f < maxFrames; f++) {
    while (i < path.length - 1 && Math.hypot(path[i].x - boat.x, path[i].y - boat.y) < 5) i++;
    const t = path[i];
    const dx = t.x - boat.x;
    const dy = t.y - boat.y;
    if (i === path.length - 1 && Math.hypot(dx, dy) < 6) {
      // Arrived: let go and drift to a stop, as a player does.
      for (let k = 0; k < 120 && Math.hypot(boat.vx, boat.vy) > 0.5; k++) {
        live.update(1 / 60, IDLE_INPUT);
        each?.();
      }
      return true;
    }
    live.update(1 / 60, { ...IDLE_INPUT, right: dx > 2, left: dx < -2, down: dy > 2, up: dy < -2 });
    each?.();
  }
  return Math.hypot(x - boat.x, y - boat.y) < 6;
}

/** Aboard by the shore: nudge toward (x, y) until "go ashore" is offered (at most `frames`). */
export function paddleAshore(live: LiveWorld, x: number, y: number, each?: () => void, frames = 60 * 4): boolean {
  const boat = live.boat;
  if (!boat?.aboard) return false;
  for (let f = 0; f < frames && !live.landingSpot(); f++) {
    const dx = x - boat.x;
    const dy = y - boat.y;
    live.update(1 / 60, { ...IDLE_INPUT, right: dx > 2, left: dx < -2, down: dy > 2, up: dy < -2 });
    each?.();
  }
  return !!live.landingSpot();
}

export function standAbove(live: LiveWorld, cell: Cell): void {
  const o = live.world.carrier?.origin ?? { x: 0, y: 0 };
  stand(live, cell.gx * PLOT_GRID + PLOT_GRID / 2 + o.x, cell.gy * PLOT_GRID - 2 + o.y, 'down');
}

/** A row of `n` tillable cells near the first hub, or null. Searches outward in rings. */
export function findField(live: LiveWorld, n: number, avoid: readonly Cell[] = []): Cell[] | null {
  const o = live.world.carrier?.origin ?? { x: 0, y: 0 };
  const hub = live.world.hubs[0];
  const c0 = { gx: Math.floor((hub.x - o.x) / PLOT_GRID), gy: Math.floor((hub.y - o.y) / PLOT_GRID) };
  const near = (c: Cell) => avoid.some((a) => Math.abs(a.gx - c.gx) <= n + 2 && Math.abs(a.gy - c.gy) <= 3);
  for (let r = 1; r < 16; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const row = Array.from({ length: n }, (_, i) => ({ gx: c0.gx + dx + i, gy: c0.gy + dy }));
        if (row.some(near)) continue;
        if (row.every((c) => live.plotCheck(c).ok) && row.every((c) => standable(live, c))) return row;
      }
  return null;
}

/** Can the Blobbi stand above a cell to face it? */
function standable(live: LiveWorld, c: Cell): boolean {
  const o = live.world.carrier?.origin ?? { x: 0, y: 0 };
  return live.collision.canStand(c.gx * PLOT_GRID + PLOT_GRID / 2 + o.x, c.gy * PLOT_GRID - 2 + o.y, live.blobbi.footRx, live.blobbi.footRy);
}

/** Find a spot near the hub where a building of `kind` fits in front of the Blobbi (facing down); leaves it there. */
export function findBuildSpot(live: LiveWorld, kind: BuildingKind, from: { x: number; y: number } = live.world.hubs[0], reach = 120, roomFor?: number): boolean {
  for (let r = 0; r < reach; r += 4)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = Math.round(from.x + Math.cos(a) * r);
      const y = Math.round(from.y + Math.sin(a) * r * 0.7);
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      stand(live, x, y, 'down');
      // `roomFor`: a house with room to grow to that level where it stands.
      if (live.placementCheck(kind).ok && (!roomFor || live.placementCheck(kind, live.placementSpot(kind), roomFor).ok)) return true;
    }
  return false;
}

// ─── The whole loop, as a player would play it ─────────────────────────────────

/** Pick up resource nodes of the given kinds, nearest the hub first, until `want` says enough. */
export function gather(live: LiveWorld, kinds: readonly ResourceKind[], want: () => boolean, maxTries = 200): void {
  const hub = live.world.hubs[0];
  for (let tries = 0; tries < maxTries && !want(); tries++) {
    const node = [...live.resources].filter((n) => kinds.includes(n.kind)).sort((a, b) => Math.hypot(a.x - hub.x, a.y - hub.y) - Math.hypot(b.x - hub.x, b.y - hub.y))[0];
    if (!node) return;
    const spot = [[0, 3], [0, -3], [4, 0], [-4, 0], [0, 6], [6, 2], [-6, 2]].map(([dx, dy]) => ({ x: node.x + dx, y: node.y + dy })).find((p) => live.collision.canStand(p.x, p.y, live.blobbi.footRx, live.blobbi.footRy));
    if (!spot) {
      live.resources = live.resources.filter((n) => n !== node); // unreachable for this script; skip it
      continue;
    }
    stand(live, spot.x, spot.y, 'down');
    if (live.nearestResource() !== node) {
      live.resources = live.resources.filter((n) => n !== node);
      continue;
    }
    pressE(live);
  }
}

/** Fell grown trees (the axe must be equipped) until `want` says enough. */
export function fellTrees(live: LiveWorld, want: () => boolean): void {
  const hub = live.world.hubs[0];
  const trees = live.world.objects.map((o, index) => ({ o, index })).filter(({ o }) => o.kind === 'tree').sort((a, b) => Math.hypot(a.o.x - hub.x, a.o.y - hub.y) - Math.hypot(b.o.x - hub.x, b.o.y - hub.y));
  for (const { o, index } of trees) {
    if (want()) return;
    if (live.treeAt(index).phase !== 'grown') continue;
    const s = live.spriteOf(o);
    const x = o.x;
    const y = o.y + s.footRy + live.blobbi.footRy + 2;
    if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
    stand(live, x, y, 'up');
    if (live.facingObject()?.index !== index) continue;
    // E picks up anything lying in reach first, so press until the tree is down.
    pressUntil(live, () => live.treeAt(index).phase === 'stump', 8);
  }
}

export interface LoopShots {
  (label: string): void;
}

/**
 * The M4 loop from an empty bag: gather, craft an axe, fell a tree, build the shelter, craft a hoe, till a field of
 * three, plant, water until ripe, harvest, feed the Blobbi, place two decorations. Returns the field. Every
 * objective is completed by these actions; nothing is granted.
 */
export function playLoop(live: LiveWorld, shot: LoopShots = () => {}): { field: Cell[] } {
  const inv = live.inventory;
  const has = (item: string, n: number) => () => inv.count(item) >= n;
  live.brain.enabled = false;
  // 1. Gather: sticks and stones for the axe (and a few more for later).
  gather(live, ['stick'], has(ITEMS.stick.id, 3));
  gather(live, ['stone'], has(ITEMS.stone.id, 2));
  gather(live, ['stick', 'stone', 'seed'], () => live.tally.collected >= 5);
  shot('GATHERED');
  // 2. The axe.
  live.craftRecipe(recipeById('blobbi-pixel:recipe:simple-axe')!);
  live.equip(ITEMS.axe.id);
  // 3. Wood: enough for the shelter and the hoe, plus decorations.
  fellTrees(live, has(ITEMS.wood.id, 12));
  shot('WOOD');
  // 4. The shelter (stones from the ground and the wood objective's reward).
  gather(live, ['stone'], has(ITEMS.stone.id, 3));
  if (!findBuildSpot(live, 'shelter')) throw new Error('no spot for the shelter');
  live.setBuildMode('shelter');
  pressE(live);
  run(live, Math.ceil(BUILDINGS.shelter.buildSeconds * 60) + 30);
  shot('SHELTER');
  // 5. The hoe and a field of three plots.
  gather(live, ['stick'], has(ITEMS.stick.id, 2));
  gather(live, ['stone'], has(ITEMS.stone.id, 1));
  live.craftRecipe(recipeById('blobbi-pixel:recipe:simple-hoe')!);
  live.equip(ITEMS.hoe.id);
  const shelter = live.buildings[0];
  const o = live.origin;
  const field = findField(live, 3, [{ gx: Math.floor((shelter.x - o.x) / PLOT_GRID), gy: Math.floor((shelter.y - o.y) / PLOT_GRID) }]);
  if (!field) throw new Error('no field');
  for (const cell of field) {
    standAbove(live, cell);
    pressUntil(live, () => !!live.plotAt(cell));
  }
  shot('TILLED');
  // 6. Plant: turnip, carrot (the plot objective's reward), turnip.
  gather(live, ['seed'], has(ITEMS.seed.id, 2));
  const plan = ['turnip', 'carrot', 'turnip'] as const;
  field.forEach((cell, i) => {
    live.selectedCrop = plan[i];
    standAbove(live, cell);
    pressUntil(live, () => !!live.plotAt(cell)?.crop);
  });
  shot('PLANTED');
  // 7. Water whenever dry until the turnips are ripe (world time passes for real).
  const turnips = [field[0], field[2]];
  for (let round = 0; round < 6 && !turnips.every((c) => live.plotAt(c)?.crop && live.cropStageOf(live.plotAt(c)!) === 4); round++) {
    for (const cell of field) {
      standAbove(live, cell);
      if (live.farmAction()?.kind === 'water') pressUntil(live, () => live.farmAction()?.kind !== 'water');
    }
    if (round === 0) shot('WATERED');
    run(live, 60 * 46);
  }
  shot('RIPE');
  // 8. Harvest the turnips, feed one to the Blobbi.
  for (const cell of turnips) {
    standAbove(live, cell);
    pressUntil(live, () => !live.plotAt(cell)?.crop);
  }
  shot('HARVESTED');
  // After a day's work the Blobbi is peckish (needs fall in world time), so it eats.
  live.feed();
  run(live, 20);
  shot('FED');
  // 9. Decorate: a lantern and a bench near the shelter (2 sticks and 2 stones from the ground).
  gather(live, ['stick'], has(ITEMS.stick.id, 2));
  gather(live, ['stone'], has(ITEMS.stone.id, 2));
  for (const kind of ['lantern', 'bench'] as BuildingKind[]) {
    if (!findBuildSpot(live, kind, { x: shelter.x, y: shelter.y + 10 }, 80)) throw new Error(`no spot for the ${kind}`);
    live.setBuildMode(kind);
    pressE(live);
  }
  run(live, 60 * 6);
  shot('DECORATED');
  return { field };
}

// ─── The rest of the story, as a player would play it ──────────────────────────

/** Collect stones until `n` are in the bag: from the ground first, then by mining large rocks with a pickaxe. */
function stonesUntil(live: LiveWorld, n: number): void {
  const has = () => live.inventory.count(ITEMS.stone.id) >= n;
  gather(live, ['stone'], has);
  if (has()) return;
  if (!live.inventory.count(ITEMS.pickaxe.id)) {
    gather(live, ['stick'], () => live.inventory.count(ITEMS.stick.id) >= 2);
    fellTrees(live, () => live.inventory.count(ITEMS.wood.id) >= 2);
    if (live.inventory.count(ITEMS.stone.id) < 3) run(live, 60 * 190), gather(live, ['stone'], () => live.inventory.count(ITEMS.stone.id) >= 3);
    live.craftRecipe(recipeById('blobbi-pixel:recipe:simple-pickaxe')!);
  }
  const before = live.equipped;
  live.equip(ITEMS.pickaxe.id);
  const rocks = live.world.objects.map((o, index) => ({ o, index })).filter(({ o }) => o.kind === 'rock' && o.size >= 14);
  for (const { o, index } of rocks) {
    if (has()) break;
    if (live.rockAt(index).phase === 'rubble') continue;
    const y = o.y + live.spriteOf(o).footRy + live.blobbi.footRy + 2;
    if (!live.collision.canStand(o.x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
    stand(live, o.x, y, 'up');
    if (live.facingObject()?.index !== index) continue;
    for (let i = 0; i < 4; i++) pressE(live);
  }
  if (before) live.equip(before);
}

/** Place one item from the bag somewhere near a point (outside), trying spots around it. */
function placeNear(live: LiveWorld, kind: BuildingKind, near: { x: number; y: number }): boolean {
  const item = BUILDINGS[kind].item!;
  if (!live.inventory.count(item) || !findBuildSpot(live, kind, near, 100)) return false;
  live.startPlacing(item);
  pressE(live);
  live.stopPlacing();
  run(live, 150);
  return true;
}

/**
 * Chapter 1's last quest and all of chapter 2, after `playLoop`: furnish the house, cook, find the Carrier Stone,
 * listen to the Carrier, grow flowers and decorate. Returns the quests still open (none, if the story can be
 * finished by playing).
 */
/**
 * The island's next growth, the way a player gets there: care for the Blobbi (petting), let the days pass (world
 * time only passes while playing: here it is waited out), then grow it. Anything else still missing (harvests,
 * crafting, finds) is left to the caller's play. Returns the new stage, or null when it is not ready.
 */
export function helpIslandGrow(live: LiveWorld): number | null {
  const shelter = live.buildings.find((b) => b.kind === 'shelter');
  for (let k = 0; k < 60; k++) {
    const r = live.growthReadiness();
    if (r.ready || !r.next) break;
    const unmet = (id: string) => r.requirements.find((q) => q.id === id && q.have < q.need);
    const days = unmet('days');
    if (unmet('care')) {
      live.pet();
      run(live, 60 * 2);
    } else if (unmet('farm') && shelter) farmField(live, shelter, 'turnip');
    else if (days) live.timeOffset += (days.need - days.have) * DAY_SECONDS;
    else break;
  }
  return live.growIsland();
}

/** Till three plots near the house, plant `crop` in each, and water them until they are harvested. */
function farmField(live: LiveWorld, shelter: { x: number; y: number }, crop: CropKind): void {
  live.equip(ITEMS.hoe.id);
  const o = live.origin;
  const field = findField(live, 3, [{ gx: Math.floor((shelter.x - o.x) / PLOT_GRID), gy: Math.floor((shelter.y - o.y) / PLOT_GRID) }, ...live.plots]);
  if (!field) return;
  for (const cell of field) {
    standAbove(live, cell);
    pressUntil(live, () => !!live.plotAt(cell));
    live.selectedCrop = crop;
    pressUntil(live, () => !!live.plotAt(cell)?.crop);
  }
  for (let round = 0; round < 6 && field.some((c) => live.plotAt(c)?.crop); round++) {
    for (const cell of field) {
      standAbove(live, cell);
      const a = live.farmAction()?.kind;
      if (a === 'water' || a === 'harvest') pressUntil(live, () => live.farmAction()?.kind !== a);
    }
    run(live, 60 * 52);
  }
}

export function playStory(live: LiveWorld, shot: LoopShots = () => {}): string[] {
  const inv = live.inventory;
  live.pet(); // say hello
  const shelter = live.buildings.find((b) => b.kind === 'shelter')!;
  live.equip(ITEMS.axe.id);
  // A workbench beside the house.
  fellTrees(live, () => inv.count(ITEMS.wood.id) >= 20);
  gather(live, ['stick'], () => inv.count(ITEMS.stick.id) >= 6);
  stonesUntil(live, 2);
  live.craftRecipe(recipeById('blobbi-pixel:recipe:workbench')!);
  placeNear(live, 'workbench', { x: shelter.x + 30, y: shelter.y + 20 });
  const bench = live.buildings.find((b) => b.kind === 'workbench')!;
  stand(live, bench.x, bench.y + BUILDINGS.workbench.footRy + live.blobbi.footRy + 2, 'up');
  // Furniture: a chair and a stool, made at the bench, placed inside.
  live.craftRecipe(recipeById('blobbi-pixel:recipe:chair')!);
  live.craftRecipe(recipeById('blobbi-pixel:recipe:stool')!);
  stand(live, shelter.x, shelter.y + BUILDINGS.shelter.footRy + live.blobbi.footRy + 3, 'up');
  pressUntil(live, () => live.inside);
  for (const [kind, x, y] of [['chair', 40, 70], ['stool', 90, 70]] as const) {
    stand(live, x, y, 'down');
    live.startPlacing(BUILDINGS[kind].item!);
    pressE(live);
    live.stopPlacing();
  }
  live.exitInterior();
  run(live, 2);
  shot('HOME');
  // A cooking station (stones from the ground and the rocks) and a meal of toasted seeds.
  stonesUntil(live, 8);
  gather(live, ['stick'], () => inv.count(ITEMS.stick.id) >= 2);
  live.craftRecipe(recipeById('blobbi-pixel:recipe:cooking-station')!);
  placeNear(live, 'cooking-station', { x: shelter.x - 30, y: shelter.y + 24 });
  const stove = live.buildings.find((b) => b.kind === 'cooking-station')!;
  stand(live, stove.x, stove.y + BUILDINGS['cooking-station'].footRy + live.blobbi.footRy + 2, 'up');
  gather(live, ['seed'], () => inv.count(ITEMS.seed.id) >= 3);
  live.craftRecipe(recipeById('blobbi-pixel:recipe:toasted-seeds')!);
  run(live, 2);
  shot('COOKED');
  // The Carrier Stone.
  const stone = live.discoveries.find((d) => d.id === 'carrier-stone')!;
  stand(live, stone.x, stone.y + 3, 'down');
  pressUntil(live, () => live.found.has('carrier-stone'));
  run(live, 2);
  // Help the island grow (M10 phase C): its first growth comes before the Carrier speaks.
  helpIslandGrow(live);
  run(live, 2);
  shot('GROWN');
  // Listen to the Carrier.
  if (live.listenSpot) {
    live.resources = live.resources.filter((n) => Math.hypot(n.x - live.listenSpot!.x, n.y - live.listenSpot!.y) > 20);
    stand(live, live.listenSpot.x, live.listenSpot.y, 'down');
    live.listen();
  }
  run(live, 2);
  shot('LISTENED');
  // Restore: three sunflowers grown in the garden (their seeds are the Carrier's gift), three decorations outside.
  farmField(live, shelter, 'sunflower');
  fellTrees(live, () => inv.count(ITEMS.wood.id) >= 12);
  for (const kind of ['fence', 'fence', 'fence'] as BuildingKind[]) {
    live.setBuildMode(kind);
    if (findBuildSpot(live, kind, { x: shelter.x, y: shelter.y + 40 }, 110)) pressE(live);
    live.setBuildMode(null);
  }
  run(live, 60 * 3);
  shot('RESTORED');
  growHome(live, shot);
  return QUESTS_MAIN_IDS.filter((id) => !(id in live.objectives.completed));
}

/** Pick the house up in management mode and put it down where its next level has room (same id: same rooms). */
export function moveHouseForRoom(live: LiveWorld, level: number): boolean {
  const house = live.home();
  if (!house) return false;
  stand(live, house.x, house.y + footOfRecord(house) + live.blobbi.footRy + 3, 'up');
  if (!live.manage) live.toggleManage();
  if (!live.pickUpToMove()) return false;
  if (!findBuildSpot(live, 'shelter', live.world.hubs[0], 200, level)) {
    live.cancelMove();
    return false;
  }
  const ok = live.placeMoved();
  if (live.manage) live.toggleManage();
  return ok;
}
const footOfRecord = (b: { kind: string; level?: number }) => footOf(b).footRy;

/**
 * Chapter 4 (M8), as a player would: gather what the next house level costs (wood from trees, stones from the ground
 * and the rocks, cloth woven at the workbench from wild fibre), find discoveries until there are enough, and upgrade
 * the home at the HOME panel's rules (`LiveWorld.upgradeHouse`), twice.
 */
export function growHome(live: LiveWorld, shot: LoopShots = () => {}): void {
  const inv = live.inventory;
  for (let step = 0; step < 2; step++) {
    const check = live.houseUpgrade();
    if (!check.next) return;
    const need = (item: string) => check.next!.cost.find((c) => c.item === item)?.quantity ?? 0;
    live.equip(ITEMS.axe.id);
    fellTrees(live, () => inv.count(ITEMS.wood.id) >= need(ITEMS.wood.id) + 2);
    stonesUntil(live, need(ITEMS.stone.id));
    const cloth = 'blobbi-pixel:material:cloth';
    if (inv.count(cloth) < need(cloth)) {
      gather(live, ['fibre'], () => inv.count('blobbi-pixel:resource:fibre') >= (need(cloth) - inv.count(cloth)) * 2, 400);
      const bench = live.buildings.find((b) => b.kind === 'workbench');
      if (bench) stand(live, bench.x, bench.y + BUILDINGS.workbench.footRy + live.blobbi.footRy + 2, 'up');
      while (inv.count(cloth) < need(cloth) && live.craftRecipe(recipeById('blobbi-pixel:recipe:cloth')!)) run(live, 1);
    }
    // Discoveries for the Dream Home (finds, and the wonder they add to the island's harmony).
    const enough = () => (check.next!.finds ?? 0) <= live.found.size && (check.next!.harmony ?? 0) <= live.harmony().value;
    for (const d of live.discoveries) {
      if (enough()) break;
      if (live.found.has(d.id) || !live.collision.canStand(d.x, d.y + 3, live.blobbi.footRx, live.blobbi.footRy)) continue;
      stand(live, d.x, d.y + 3, 'down');
      pressUntil(live, () => live.found.has(d.id));
    }
    run(live, 2);
    // No room to grow where it stands: move the house (management mode) to a spot with room, as a player would.
    if (live.houseUpgrade().blocked?.includes('does not fit')) moveHouseForRoom(live, check.next.level);
    if (!live.upgradeHouse().ok) return;
    run(live, 60 * (check.next.buildSeconds + 2));
    shot(check.next.level === 2 ? 'COTTAGE' : 'DREAM HOME');
  }
}
