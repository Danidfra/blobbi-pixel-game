import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { memoryStore, loadSave, saveKey } from '../src/game/persistence';
import { ITEMS } from '../src/game/items';
import { CROPS, CROP_KINDS, PLOT_GRID, afterHarvest, cellAt, cropForSeed, cropGrowth, cropSprite, cropStage, harvestFor, isMature, isWet, needsWater, plantCrop, plotSprite, waterCrop, type CropStage } from '../src/game/farming';
import { itemById, isFood } from '../src/game/items';
import { findField, findBuildSpot, pressE, pressUntil, run, standAbove } from '../src/dev/scripted-play';
import { T } from '../src/world/types';
import { BUILDINGS } from '../src/game/buildings';

const world = () => generateTurtleWorld('turtle-0');
/** A world with a hoe in hand and some seeds, autonomy off. */
function farmer(store = memoryStore()) {
  const live = new LiveWorld(world(), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  live.inventory.add(ITEMS.hoe.id, 1);
  live.equip(ITEMS.hoe.id);
  live.inventory.add(ITEMS.seed.id, 5);
  live.inventory.add(ITEMS.carrotSeed.id, 2);
  live.resources = []; // no pickups in the way of E in these tests (collecting first is tested elsewhere)
  return { live, store };
}
/** Till and plant one cell; returns it. */
function plantedPlot(live: LiveWorld, kind: 'turnip' | 'carrot' = 'turnip') {
  const [cell] = findField(live, 1)!;
  standAbove(live, cell);
  pressE(live);
  live.selectedCrop = kind;
  pressE(live);
  return { cell, plot: live.plotAt(cell)! };
}

describe('crop growth (pure, in world time)', () => {
  it('grows only while wet, in five stages, needing growSeconds / waterSeconds waterings', () => {
    for (const kind of CROP_KINDS) {
      const def = CROPS[kind];
      let crop = plantCrop(kind, 100);
      expect(cropStage(crop, 100)).toBe(0);
      // Dry: nothing happens however long it waits.
      expect(cropGrowth(crop, 100000)).toBe(0);
      expect(needsWater(crop, 100)).toBe(true);
      let t = 100;
      let waterings = 0;
      const stages = new Set<number>();
      while (!isMature(crop, t)) {
        expect(needsWater(crop, t)).toBe(true);
        crop = waterCrop(crop, t)!;
        waterings++;
        expect(isWet(crop, t)).toBe(true);
        // Watering a wet crop does nothing.
        expect(waterCrop(crop, t + 1)).toBeNull();
        for (let k = 0; k <= def.waterSeconds; k += 5) stages.add(cropStage(crop, t + k));
        t += def.waterSeconds + 30; // the player comes back a while after it dried
        expect(cropGrowth(crop, t)).toBe(cropGrowth(crop, t - 29)); // paused while dry
      }
      expect(waterings).toBe(Math.ceil(def.growSeconds / def.waterSeconds));
      expect([...stages].sort()).toEqual([0, 1, 2, 3, 4]);
      expect(cropGrowth(crop, t)).toBe(def.growSeconds);
      expect(needsWater(crop, t)).toBe(false); // mature: no more water
      expect(waterCrop(crop, t)).toBeNull();
    }
  });

  it('the crop catalogue: 8 food or ingredient crops and 3 flowers, each with its own seed, produce, timing and sprites', () => {
    expect(CROP_KINDS.length).toBe(11);
    expect(CROP_KINDS.filter((k) => CROPS[k].flower)).toEqual(['sunflower', 'tulip', 'lavender']);
    const seeds = CROP_KINDS.map((k) => CROPS[k].seed);
    expect(new Set(seeds).size).toBe(CROP_KINDS.length);
    expect(new Set(CROP_KINDS.map((k) => CROPS[k].produce)).size).toBe(CROP_KINDS.length);
    expect(CROPS.turnip.seed).toBe(ITEMS.seed.id);
    expect(new Set(CROP_KINDS.map((k) => CROPS[k].growSeconds)).size).toBeGreaterThanOrEqual(7);
    expect(new Set(CROP_KINDS.map((k) => CROPS[k].yield)).size).toBeGreaterThanOrEqual(3);
    expect(CROP_KINDS.filter((k) => CROPS[k].harvests > 1)).toEqual(['tomato', 'strawberry']);
    for (const k of CROP_KINDS) {
      const def = CROPS[k];
      // Seeds and produce are registered items with descriptions and icons.
      for (const id of [def.seed, def.produce]) expect(itemById(id)?.description.length).toBeGreaterThan(10);
      expect(itemById(def.produce)?.icon).toBeDefined();
      expect(cropForSeed(def.seed)).toBe(k);
      // Flowers are not food; the rest except wheat are.
      expect(isFood(def.produce)).toBe(!def.flower && k !== 'wheat');
      const sizes = [0, 1, 2, 3, 4].map((s) => cropSprite(k, s as CropStage, 'x').buffer.opaqueCount());
      expect(sizes[4]).toBeGreaterThan(sizes[1]);
      expect(cropSprite(k, 3, 'seed-a').buffer.data).toEqual(cropSprite(k, 3, 'seed-a').buffer.data);
    }
    const mature = CROP_KINDS.map((k) => cropSprite(k, 4, 'x').buffer.data.join());
    expect(new Set(mature).size).toBe(CROP_KINDS.length);
    expect(plotSprite(true).data).not.toEqual(plotSprite(false).data);
  });

  it('multi-harvest crops are picked several times, need water between pickings, and return seeds on the last', () => {
    for (const kind of ['tomato', 'strawberry']) {
      const def = CROPS[kind];
      let crop = { ...plantCrop(kind, 0), grown: def.growSeconds };
      for (let pick = 1; pick <= def.harvests; pick++) {
        expect(isMature(crop, 0)).toBe(true);
        const got = harvestFor(crop);
        expect(got[0]).toEqual({ item: def.produce, quantity: def.yield });
        expect(got.length).toBe(pick === def.harvests ? 2 : 1);
        const next = afterHarvest(crop);
        if (pick === def.harvests) {
          expect(next).toBeNull();
          break;
        }
        expect(next!.picks).toBe(pick);
        expect(cropStage(next!, 0)).toBe(3);
        expect(needsWater(next!, 0)).toBe(true);
        crop = { ...next!, grown: def.growSeconds };
      }
    }
    expect(afterHarvest({ ...plantCrop('turnip', 0), grown: 90 })).toBeNull();
  });
});

describe('preparing plots', () => {
  it('the hoe tills the grid cell in front: grid-aligned, in the island frame, walkable, and E without a hoe does not till', () => {
    const { live } = farmer();
    const [cell] = findField(live, 1)!;
    // Empty hands: no farm action on bare grass.
    live.unequip();
    standAbove(live, cell);
    expect(live.farmAction()).toBeNull();
    pressE(live);
    expect(live.plots.length).toBe(0);
    live.equip(ITEMS.hoe.id);
    standAbove(live, cell);
    expect(live.farmAction()?.kind).toBe('till');
    expect(live.prompt()).toBe('E  till the soil');
    pressE(live);
    expect(live.plots).toHaveLength(1);
    const plot = live.plots[0];
    expect({ gx: plot.gx, gy: plot.gy }).toEqual(cell);
    const r = live.plotRect(plot);
    const o = live.origin;
    expect((r.x0 - o.x) % PLOT_GRID).toBe(0);
    expect((r.y0 - o.y) % PLOT_GRID).toBe(0);
    expect(r.x1 - r.x0 + 1).toBe(PLOT_GRID);
    // Walkable: the plot never blocks collision or navigation.
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) expect(live.collision.isBlocked(x + 0.5, y + 0.5)).toBe(false);
    expect(live.tally.plots).toBe(1);
  });

  it('refuses water, objects, buildings, existing plots, the map edge and resource nodes', () => {
    const { live } = farmer();
    const o = live.origin;
    const t = live.world.terrain;
    // Water.
    let water: { gx: number; gy: number } | null = null;
    for (let y = 8; y < t.height - 8 && !water; y += 8) for (let x = 8; x < t.width - 8 && !water; x += 8) if (t.cls[y * t.width + x] <= T.FOAM) water = cellAt(x, y, o);
    expect(live.plotCheck(water!).problem).toBe('water');
    // Under a tree.
    const tree = live.world.objects.find((p) => p.kind === 'tree')!;
    expect(['blocked', 'ground', 'resource']).toContain(live.plotCheck(cellAt(tree.x, tree.y, o)).problem);
    // The edge of the map.
    expect(live.plotCheck({ gx: -1 - Math.floor(o.x / PLOT_GRID), gy: 0 }).problem).toBe('edge');
    // An existing plot.
    const [cell] = findField(live, 1)!;
    standAbove(live, cell);
    pressE(live);
    expect(live.plotCheck(cell).problem).toBe('plot');
    // A resource node lying on the cell.
    const [free] = findField(live, 1, [cell])!;
    const r = live.plotRect(free);
    live.resources = [{ id: 'stick:test', kind: 'stick', x: r.x0 + 3, y: r.y0 + 3, variant: 0, source: -1 }];
    expect(live.plotCheck(free).problem).toBe('resource');
    live.resources = [];
    // A building's footprint (and its clearance).
    live.inventory.add(ITEMS.wood.id, 6);
    live.inventory.add(ITEMS.stone.id, 3);
    expect(findBuildSpot(live, 'shelter')).toBe(true);
    live.setBuildMode('shelter');
    pressE(live);
    const shelter = live.buildings[0];
    expect(live.plotCheck(cellAt(shelter.x, shelter.y, o)).problem).toBe('building');
    // The hoe aimed at an invalid open cell says why and makes nothing.
    live.blobbi.x = shelter.x;
    live.blobbi.y = shelter.y - BUILDINGS.shelter.footRy - 1;
    const r0 = live.plots.length;
    live.update(1 / 60, { ...IDLE_INPUT, down: true });
    live.blobbi.x = shelter.x;
    live.blobbi.y = shelter.y - BUILDINGS.shelter.footRy - 1;
    expect(live.farmAction()?.kind).toBe('cannot-till');
    live.tend();
    expect(live.plots.length).toBe(r0);
  });

  it('a building cannot be placed on a field', () => {
    const { live } = farmer();
    const [cell] = findField(live, 1)!;
    standAbove(live, cell);
    pressE(live);
    const c = live.plotRect(cell);
    const check = live.placementCheck('lantern', { x: c.x0 + 4, y: c.y0 + 4 });
    expect(check.ok).toBe(false);
  });
});

describe('planting, watering, growth and harvest', () => {
  it('planting consumes exactly one seed of the chosen crop; no seeds, no planting', () => {
    const { live } = farmer();
    const seeds = live.inventory.count(ITEMS.seed.id);
    const { plot } = plantedPlot(live, 'turnip');
    expect(plot.crop?.kind).toBe('turnip');
    expect(live.inventory.count(ITEMS.seed.id)).toBe(seeds - 1);
    expect(live.tally.planted).toBe(1);
    // Carrot from the carrot seed.
    const [cell2] = findField(live, 1, [{ gx: plot.gx, gy: plot.gy }])!;
    standAbove(live, cell2);
    pressE(live);
    live.selectedCrop = 'carrot';
    pressE(live);
    expect(live.plotAt(cell2)!.crop?.kind).toBe('carrot');
    expect(live.inventory.count(ITEMS.carrotSeed.id)).toBe(1);
    // Empty the bag of seeds: an empty plot says so and takes nothing.
    const [cell3] = findField(live, 1, [{ gx: plot.gx, gy: plot.gy }, cell2])!;
    standAbove(live, cell3);
    pressE(live);
    live.inventory.remove(ITEMS.seed.id, 99);
    live.inventory.remove(ITEMS.carrotSeed.id, 99);
    expect(live.farmAction()?.kind).toBe('no-seeds');
    pressE(live);
    expect(live.plotAt(cell3)!.crop).toBeNull();
  });

  it('T cycles the seed among crops in the bag; E falls back to a crop that has seeds', () => {
    const { live } = farmer();
    expect(live.cycleCrop()).toBe('carrot');
    expect(live.cycleCrop()).toBe('turnip');
    live.inventory.remove(ITEMS.carrotSeed.id, 99);
    live.selectedCrop = 'carrot';
    expect(live.cropToPlant()).toBe('turnip');
  });

  it('a dry crop waits; watering makes it grow in world time (not frames) to a harvest of food, then the plot replants', () => {
    const { live } = farmer();
    const { cell, plot } = plantedPlot(live, 'turnip');
    const def = CROPS.turnip;
    expect(live.farmAction()?.kind).toBe('water');
    expect(live.prompt()).toBe('E  water the turnip');
    run(live, 60 * 10);
    expect(cropGrowth(plot.crop!, live.worldTime)).toBe(0); // dry: no growth
    pressE(live);
    expect(live.tally.watered).toBe(1);
    expect(isWet(plot.crop!, live.worldTime)).toBe(true);
    // A second press while wet does not water again.
    pressE(live);
    expect(live.tally.watered).toBe(1);
    // World time, not frames: big real-time frames run the same fixed steps; skipping world time grows it too.
    const g0 = cropGrowth(plot.crop!, live.worldTime);
    live.update(0.2, IDLE_INPUT);
    expect(cropGrowth(plot.crop!, live.worldTime)).toBeCloseTo(g0 + live.clock.dt * 6, 6); // the clock caps a frame at 6 steps
    live.timeOffset += def.waterSeconds;
    expect(needsWater(plot.crop!, live.worldTime)).toBe(true);
    standAbove(live, cell);
    pressE(live);
    live.timeOffset += def.waterSeconds;
    expect(isMature(plot.crop!, live.worldTime)).toBe(true);
    expect(live.farmAction()?.kind).toBe('harvest');
    const food = live.inventory.count(ITEMS.turnip.id);
    pressE(live);
    expect(live.inventory.count(ITEMS.turnip.id)).toBe(food + 2);
    expect(plot.crop).toBeNull();
    expect(plot.harvests).toBe(1);
    expect(live.tally.harvested).toBe(1);
    expect(live.harvestPops).toHaveLength(1);
    // No duplicate reward: the harvest is gone, a direct call does nothing.
    expect(live.harvest(plot)).toBe(false);
    expect(live.inventory.count(ITEMS.turnip.id)).toBe(food + 2);
    // Replant the same plot.
    expect(live.farmAction()?.kind).toBe('plant');
    pressE(live);
    expect(plot.crop?.kind).toBe('turnip');
  });

  it('a harvest that does not fit waits; nothing is lost', () => {
    const { live } = farmer();
    const { plot } = plantedPlot(live, 'turnip');
    plot.crop = { ...plot.crop!, grown: CROPS.turnip.growSeconds };
    live.inventory.add(ITEMS.turnip.id, live.inventory.limit(ITEMS.turnip.id));
    expect(live.harvest(plot)).toBe(false);
    expect(plot.crop).not.toBeNull();
    expect(plot.harvests).toBe(0);
    live.inventory.remove(ITEMS.turnip.id, 5);
    expect(live.harvest(plot)).toBe(true);
  });

  it('E picks up a resource in reach first (as always), then tends the plot', () => {
    const { live } = farmer();
    const { plot } = plantedPlot(live, 'turnip');
    live.resources = [{ id: 'seed:near', kind: 'seed', x: Math.round(live.blobbi.x) + 2, y: Math.round(live.blobbi.y) + 1, variant: 0, source: -1 }];
    expect(live.prompt()).toBe('E  pick up the seed');
    expect(pressUntil(live, () => isWet(plot.crop!, live.worldTime))).toBe(true);
    expect(live.tally.collected).toBe(1);
  });

  it('autonomy never tills, plants, waters or harvests', () => {
    const live = new LiveWorld(world(), 'blobbi-9', 16);
    live.inventory.add(ITEMS.hoe.id, 1);
    live.equip(ITEMS.hoe.id);
    live.inventory.add(ITEMS.seed.id, 3);
    const { plot } = plantedPlot(live, 'turnip');
    plot.crop = { ...plot.crop!, grown: CROPS.turnip.growSeconds }; // ripe
    const other = live.plots.length;
    live.brain.enabled = true;
    run(live, 60 * 120);
    expect(plot.crop).not.toBeNull();
    expect(live.plots.length).toBe(other);
    expect(live.inventory.count(ITEMS.turnip.id)).toBe(0);
    expect(live.inventory.count(ITEMS.seed.id)).toBe(2);
    expect(live.tally.harvested + live.tally.watered).toBe(0);
  });
});

describe('farm persistence', () => {
  it('plots, crops, wet windows and harvest history survive a reload; growth continues from world time', () => {
    const { live, store } = farmer();
    const { cell, plot } = plantedPlot(live, 'carrot');
    pressE(live); // water
    run(live, 60 * 20);
    const [cell2] = findField(live, 1, [cell])!;
    standAbove(live, cell2);
    pressE(live);
    live.save();
    const growth = cropGrowth(plot.crop!, live.worldTime);
    const record = JSON.parse(store.get(saveKey(live.identity))!);
    expect(record.plots).toHaveLength(2);
    expect(record.plots[0]).toMatchObject({ id: 'plot:0', gx: cell.gx, gy: cell.gy, harvests: 0, crop: { kind: 'carrot' } });
    const b = new LiveWorld(world(), 'blobbi-9', 16, { store });
    expect(b.plots.map((p) => [p.id, p.gx, p.gy, p.crop?.kind ?? null])).toEqual(live.plots.map((p) => [p.id, p.gx, p.gy, p.crop?.kind ?? null]));
    expect(b.plotAt(cell)!.crop).toEqual(plot.crop);
    expect(cropGrowth(b.plotAt(cell)!.crop!, b.worldTime)).toBeCloseTo(growth, 6);
    run(b, 60 * 10);
    expect(cropGrowth(b.plotAt(cell)!.crop!, b.worldTime)).toBeGreaterThan(growth);
    // A harvest, saved, is not harvested again after a reload.
    b.plotAt(cell)!.crop = { ...b.plotAt(cell)!.crop!, grown: CROPS.carrot.growSeconds };
    expect(b.harvest(b.plotAt(cell)!)).toBe(true);
    const carrots = b.inventory.count(ITEMS.carrot.id);
    const c = new LiveWorld(world(), 'blobbi-9', 16, { store });
    expect(c.plotAt(cell)!.crop).toBeNull();
    expect(c.plotAt(cell)!.harvests).toBe(1);
    expect(c.inventory.count(ITEMS.carrot.id)).toBe(carrots);
  });

  it('a malformed plot record is dropped, never half-read; one plot per cell', () => {
    const { live, store } = farmer();
    plantedPlot(live);
    live.save();
    const key = saveKey(live.identity);
    const record = JSON.parse(store.get(key)!);
    record.plots.push({ id: 'bad', gx: 1.5, gy: 2, preparedAt: 0 }, { ...record.plots[0], id: 'dup' }, { id: 'x', gx: 3, gy: 4, preparedAt: 1, harvests: 0, crop: { kind: 'cabbage', plantedAt: 0, grown: 0 } });
    store.set(key, JSON.stringify(record));
    const loaded = loadSave(store, live.identity)!;
    expect(loaded.plots.map((p) => p.id)).toEqual(['plot:0', 'x']);
    expect(loaded.plots[1].crop).toBeNull();
  });

  it('resources never grow back onto a field', () => {
    const { live } = farmer();
    live.resources = [...live.allResources];
    // Till a cell that holds a collected node's spot: pick a node, collect it, till its cell.
    const node = live.allResources.find((n) => {
      const c = cellAt(n.x, n.y, live.origin);
      live.collected.add(n.id);
      live.resources = live.allResources.filter((m) => !live.collected.has(m.id));
      const ok = live.plotCheck(c).ok;
      live.collected.delete(n.id);
      return ok;
    })!;
    expect(node).toBeTruthy();
    live.collected.add(node.id);
    live.collectedAt.set(node.id, live.worldTime);
    live.resources = live.allResources.filter((m) => !live.collected.has(m.id));
    const cell = cellAt(node.x, node.y, live.origin);
    standAbove(live, cell);
    pressUntil(live, () => !!live.plotAt(cell));
    expect(live.plotAt(cell)).not.toBeNull();
    live.timeOffset += 10000;
    run(live, 120);
    expect(live.collected.has(node.id)).toBe(true);
  });
});
