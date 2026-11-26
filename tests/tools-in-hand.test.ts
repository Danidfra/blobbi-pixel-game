/**
 * THE TOOL IN HAND AND THE LINE IN THE WATER stay true to what the Blobbi holds and does (playtest review,
 * 2026-11-26): a rest reels the line in; the line ends when the rod leaves the paw; a tool that leaves the bag
 * leaves the paw, and an upgraded tool in hand becomes the new one.
 */
import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld } from '../src/sim/live-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { memoryStore } from '../src/game/persistence';
import { run, stand } from '../src/dev/scripted-play';
import { recipeById } from '../src/game/crafting';

const ROD = 'blobbi-pixel:tool:fishing-rod';

/** A grown island, the rod in hand, the Blobbi standing where a cast reaches the sea. */
function fishing(): LiveWorld {
  const store = memoryStore();
  const make = () => generateTurtleWorld('island-m10', { turtleSeed: 'turtle-m10', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });
  const probe = new LiveWorld(make(), 'blobbi-9', 16, { store });
  probe.growth = { stage: 2, version: 3, history: [], regions: [] };
  probe.save();
  const live = new LiveWorld(make(), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  live.inventory.add(ROD, 1);
  live.equip(ROD);
  const { width, height } = live.world.terrain;
  for (let y = 10; y < height - 10; y += 3)
    for (let x = 10; x < width - 10; x += 3) {
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      stand(live, x, y, 'down');
      const t = live.fishTarget();
      if (t && Math.hypot(t.x - x, t.y - y) >= 18) return live;
    }
  throw new Error('no fishing spot');
}

describe('the line and the rest', () => {
  it('R with the line out reels it in and the Blobbi really rests', () => {
    const live = fishing();
    expect(live.fish()).toBe(true);
    expect(live.fishing).not.toBeNull();
    run(live, 30);
    live.rest();
    run(live, 2);
    expect(live.fishing).toBeNull();
    expect(live.brain.state).toBe('rest');
  });

  it('swapping the rod for another tool mid-cast ends the line: nothing can be landed after', () => {
    const live = fishing();
    live.inventory.add('blobbi-pixel:tool:simple-axe', 1);
    expect(live.fish()).toBe(true);
    live.equip('blobbi-pixel:tool:simple-axe');
    run(live, 2);
    expect(live.fishing).toBeNull();
    live.equip(ROD);
    run(live, 2);
    expect(live.fishing).toBeNull(); // the old line is gone for good: re-equipping does not bring back a bite to reel
  });

});

describe('the tool in hand follows the bag', () => {
  it('a tool stored in a chest leaves the paw and no longer works', () => {
    const live = fishing();
    const chest = { id: 'chest:test', kind: 'chest', x: 0, y: 0, placedAt: 0, seed: 's' } as const;
    expect(live.moveItems(chest, ROD, 1, true)).toBe(1);
    expect(live.inventory.count(ROD)).toBe(0);
    expect(live.equipped).toBeNull();
    expect(live.fish()).toBe(false);
  });

  it('crafting the upgrade of the tool in hand puts the new tool in hand', () => {
    const live = fishing();
    const AXE = 'blobbi-pixel:tool:simple-axe';
    const COPPER = 'blobbi-pixel:tool:copper-axe';
    live.inventory.add(AXE, 1);
    live.equip(AXE);
    live.inventory.add('blobbi-pixel:material:copper-ore', 3);
    live.inventory.add('blobbi-pixel:material:wood', 2);
    (live.objectives.completed as Record<string, number>)['side-miner'] = 1;
    (live as unknown as { nearStation: () => boolean }).nearStation = () => true;
    expect(live.craftRecipe(recipeById('blobbi-pixel:recipe:copper-axe')!)).toBe(true);
    expect(live.inventory.count(AXE)).toBe(0);
    expect(live.equipped).toBe(COPPER);
  });
});
