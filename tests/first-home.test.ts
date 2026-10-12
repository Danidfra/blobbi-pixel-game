/**
 * M8: the first home is earned. On a new island (no generated cottage) of every Carrier, chapter 1 — meet the Blobbi,
 * explore, gather, make a tool, prepare materials, build, step inside, place a first piece of furniture — completes
 * from real actions only, with the resources the island itself offers.
 */
import { describe, expect, it } from 'vitest';
import { LiveWorld } from '../src/sim/live-world';
import { memoryStore } from '../src/game/persistence';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { fellTrees, findBuildSpot, gather, pressE, pressUntil, run, stand } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { recipeById } from '../src/game/crafting';
import { BUILDINGS } from '../src/game/buildings';
import { currentObjective, MAIN_QUESTS } from '../src/game/objectives';
import type { CarrierKind } from '../src/game/carrier';

const CHAPTER_1 = ['meet', 'arrive', 'gather', 'axe', 'wood', 'materials', 'shelter', 'enter-home', 'first-furniture'];

const newIsland = (kind: CarrierKind, seed: string) =>
  kind === 'manta' ? generateMantaWorld(seed, { carrierSeed: `${seed}-m`, generatedHouse: false }) : kind === 'whale' ? generateWhaleWorld(seed, { carrierSeed: `${seed}-w`, generatedHouse: false }) : generateTurtleWorld(seed, { turtleSeed: `${seed}-t`, shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });

/** Look at things (E facing a tree, rock or flower with nothing to pick up in reach) until `n` looks are counted. */
function lookAround(live: LiveWorld, n: number): void {
  for (const o of live.world.objects) {
    if (live.tally.looked >= n) return;
    if (o.kind !== 'tree' && o.kind !== 'rock' && o.kind !== 'flower' && o.kind !== 'bush') continue;
    const y = o.y + live.spriteOf(o).footRy + live.blobbi.footRy + 2;
    if (!live.collision.canStand(o.x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
    stand(live, o.x, y, 'up');
    if (live.facingObject()?.placement !== o) continue;
    const before = live.tally.looked;
    pressUntil(live, () => live.tally.looked > before, 4);
  }
}

function playChapter1(live: LiveWorld): void {
  const inv = live.inventory;
  const has = (item: string, n: number) => () => inv.count(item) >= n;
  live.brain.enabled = false;
  live.pet();
  lookAround(live, 3);
  gather(live, ['stick'], has(ITEMS.stick.id, 3));
  gather(live, ['stone'], has(ITEMS.stone.id, 2));
  gather(live, ['stick', 'stone', 'seed'], () => live.tally.collected >= 5);
  live.craftRecipe(recipeById('blobbi-pixel:recipe:simple-axe')!);
  live.equip(ITEMS.axe.id);
  fellTrees(live, has(ITEMS.wood.id, 6));
  gather(live, ['stone'], has(ITEMS.stone.id, 3));
  run(live, 2);
  if (!findBuildSpot(live, 'shelter')) throw new Error('no spot for the shelter');
  live.setBuildMode('shelter');
  pressE(live);
  run(live, Math.ceil(BUILDINGS.shelter.buildSeconds * 60) + 30);
  const shelter = live.buildings.find((b) => b.kind === 'shelter')!;
  stand(live, shelter.x, shelter.y + BUILDINGS.shelter.footRy + live.blobbi.footRy + 3, 'up');
  pressUntil(live, () => live.inside);
  run(live, 2);
  // The housewarming gift, placed inside.
  stand(live, 40, 70, 'down');
  live.startPlacing('blobbi-pixel:furniture:potted-plant');
  pressE(live);
  live.stopPlacing();
  run(live, 2);
}

describe('the first home quest', () => {
  it('starts with meeting the Blobbi, then exploring', () => {
    const live = new LiveWorld(newIsland('whale', 'island-home-0'), 'blobbi-9', 16, { store: memoryStore() });
    expect(currentObjective(live.objectives)?.id).toBe('meet');
    expect(MAIN_QUESTS.slice(0, CHAPTER_1.length).map((q) => q.id)).toEqual(CHAPTER_1);
  });

  for (const kind of ['turtle', 'manta', 'whale'] as const)
    it(`${kind}: chapter 1 completes from real actions on a new island`, () => {
      const live = new LiveWorld(newIsland(kind, 'island-home-1'), 'blobbi-9', 16, { store: memoryStore() });
      expect(live.buildings).toEqual([]);
      expect(live.world.objects.some((o) => o.kind === 'house')).toBe(false);
      playChapter1(live);
      for (const id of CHAPTER_1) expect(Object.keys(live.objectives.completed), id).toContain(id);
      // The gift went into the room, not lost.
      expect(live.interiors.get(live.buildings.find((b) => b.kind === 'shelter')!.id)!.furniture.some((f) => f.kind === 'potted-plant')).toBe(true);
    });

  it('a world from before, already past its shelter, completes the new steps from what it did (once)', () => {
    const store = memoryStore();
    const live = new LiveWorld(newIsland('turtle', 'island-home-2'), 'blobbi-9', 16, { store });
    playChapter1(live);
    // Pretend the new steps did not exist when it was played: forget them and reload.
    for (const id of ['materials', 'enter-home', 'first-furniture']) delete live.objectives.completed[id];
    live.save();
    const again = new LiveWorld(newIsland('turtle', 'island-home-2'), 'blobbi-9', 16, { store });
    const plants = again.inventory.count('blobbi-pixel:furniture:potted-plant');
    run(again, 3);
    for (const id of ['materials', 'enter-home', 'first-furniture']) expect(again.objectives.completed).toHaveProperty(id);
    expect(again.inventory.count('blobbi-pixel:furniture:potted-plant')).toBe(plants + 1); // the gift, once
    run(again, 3);
    expect(again.inventory.count('blobbi-pixel:furniture:potted-plant')).toBe(plants + 1);
  });
});
