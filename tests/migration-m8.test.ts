/**
 * M8 save compatibility: records of every schema the code knows (1-9) load into schema 10 with their world, Carrier,
 * buildings, furniture, bag, quests and progress intact; they never replay the intro, never lose their house, keep
 * their generated cottage, and start with tips off.
 */
import { describe, expect, it } from 'vitest';
import { LiveWorld } from '../src/sim/live-world';
import { loadSave, memoryStore, saveKey, SAVE_VERSION } from '../src/game/persistence';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { houseLevel } from '../src/game/buildings';
import { ITEMS } from '../src/game/items';
import { findBuildSpot, pressE, pressUntil, run, stand } from '../src/dev/scripted-play';
import { BUILDINGS } from '../src/game/buildings';

/** Strip a schema-10 record down to what schema `v` had (the fields each schema added are removed). */
function downgrade(raw: Record<string, unknown>, v: number): Record<string, unknown> {
  const r: Record<string, unknown> = { ...raw, version: v };
  const drop = (since: number, keys: string[]) => v < since && keys.forEach((k) => delete r[k]);
  drop(10, ['name', 'intro', 'tutorial']);
  drop(9, ['growth', 'species', 'generator']);
  drop(8, ['carrier', 'places']);
  drop(7, ['companion', 'found', 'interiors', 'containers', 'producers']);
  drop(6, ['plots', 'care', 'tally', 'objectives']);
  drop(5, ['owner']);
  drop(4, ['collectedAt', 'rocks']);
  drop(3, ['buildings']);
  drop(2, ['equipped', 'trees', 'worldTime']);
  if (r.buildings) r.buildings = (r.buildings as Record<string, unknown>[]).map((b) => {
    const c = { ...b };
    delete c.level;
    delete c.look;
    delete c.upgradedAt;
    return c;
  });
  return r;
}

for (const [kind, make] of [
  ['turtle (Variant B, with its cottage)', () => generateTurtleWorld('turtle-0')],
  ['manta', () => generateMantaWorld('island-mig-1', { carrierSeed: 'mm' })],
  ['whale', () => generateWhaleWorld('island-mig-2', { carrierSeed: 'ww' })],
] as const)
  describe(`migrating a ${kind} world`, () => {
    const store = memoryStore();
    const world = make();
    const live = new LiveWorld(world, 'blobbi-9', 16, { store });
    live.brain.enabled = false;
    live.inventory.add(ITEMS.wood.id, 12);
    live.inventory.add(ITEMS.stone.id, 6);
    live.objectives.completed.materials = 0;
    findBuildSpot(live, 'shelter');
    live.setBuildMode('shelter');
    pressE(live);
    run(live, 60 * 26);
    const house = live.home()!;
    stand(live, house.x, house.y + BUILDINGS.shelter.footRy + live.blobbi.footRy + 3, 'up');
    pressUntil(live, () => live.inside);
    live.exitInterior();
    run(live, 2);
    live.save();
    const full = JSON.parse(store.get(saveKey(live.identity))!);
    const cottages = world.objects.filter((o) => o.kind === 'house').length;

    for (let v = 1; v <= 9; v++)
      it(`schema ${v} → ${SAVE_VERSION}`, () => {
        const s = memoryStore({ [saveKey(live.identity)]: JSON.stringify(downgrade(full, v)) });
        const loaded = loadSave(s, live.identity);
        expect(loaded, `schema ${v}`).not.toBeNull();
        expect(loaded!.version).toBe(SAVE_VERSION);
        expect(loaded!.intro.state).toBe('done');
        expect(loaded!.tutorial.skipped).toBe(true);
        expect(loaded!.name).toBeNull();
        const again = new LiveWorld(make(), 'blobbi-9', 16, { store: s });
        expect(again.identity).toBe(live.identity);
        expect(again.inventory.count(ITEMS.wood.id)).toBe(live.inventory.count(ITEMS.wood.id));
        expect(again.world.objects.filter((o) => o.kind === 'house').length).toBe(cottages); // the generated cottage stays
        if (v >= 3) {
          expect(again.buildings.map((b) => b.id)).toEqual(live.buildings.map((b) => b.id));
          expect(houseLevel(again.home()!)).toBe(1);
        }
        if (v >= 7) expect(again.interiors.get(house.id)!.furniture).toEqual(live.interiors.get(house.id)!.furniture);
        if (v >= 6) for (const id of Object.keys(live.objectives.completed)) expect(again.objectives.completed).toHaveProperty(id);
        if (v >= 9) expect(again.species).toBe(live.species);
        // Played for a moment and saved: schema 10, still no intro, nothing lost.
        run(again, 30);
        again.save();
        const written = JSON.parse(s.get(saveKey(live.identity))!);
        expect(written.version).toBe(SAVE_VERSION);
        expect(written.intro.state).toBe('done');
      });
  });
