/**
 * THE TOOL IN HAND AND THE LINE IN THE WATER stay true to what the Blobbi holds and does (playtest review,
 * 2026-11-26): a rest reels the line in; the line ends when the rod leaves the paw; a tool that leaves the bag
 * leaves the paw, and an upgraded tool in hand becomes the new one.
 */
import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { memoryStore } from '../src/game/persistence';
import { run, stand } from '../src/dev/scripted-play';

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
});
