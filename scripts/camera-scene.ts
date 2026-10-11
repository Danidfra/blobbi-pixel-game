/**
 * The scene the M3.3 camera screenshots and tests share: turtle world, Blobbi `blobbi-9`, a finished shelter
 * beside it, the pickaxe in hand, facing the viewer. Deterministic.
 */
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT, type LiveInput } from '../src/sim/live-world';
import { ITEMS } from '../src/game/items';
import { BUILDINGS } from '../src/game/buildings';

/** The scene every shot shares: a finished shelter beside the Blobbi, the pickaxe in hand, facing the viewer. */
export function cameraScene(worldSeed: string): LiveWorld {
  const live = new LiveWorld(generateTurtleWorld(worldSeed), 'blobbi-9', 16);
  live.brain.enabled = false;
  const run = (n: number, input: Partial<LiveInput> = {}) => {
    for (let i = 0; i < n; i++) live.update(1 / 60, { ...IDLE_INPUT, ...input, interact: false, plant: false });
  };
  for (const c of BUILDINGS.shelter.cost) live.inventory.add(c.item, c.quantity);
  live.setBuildMode('shelter');
  // The nearest spot (rings around the start) where a shelter fits below the Blobbi.
  const home = { x: live.blobbi.x, y: live.blobbi.y };
  search: for (let r = 0; r <= 120; r += 4)
    for (let a = 0; a < 16; a++) {
      const x = Math.round(home.x + Math.cos((a / 16) * Math.PI * 2) * r);
      const y = Math.round(home.y + Math.sin((a / 16) * Math.PI * 2) * r);
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      live.blobbi.x = x;
      live.blobbi.y = y;
      run(1, { down: true });
      live.blobbi.x = x;
      live.blobbi.y = y;
      if (live.placementCheck().ok) break search;
    }
  if (!live.placeBuilding()) throw new Error('no spot for the shelter');
  live.setBuildMode(null);
  run(60 * 30); // the shelter finishes building
  live.inventory.add(ITEMS.pickaxe.id, 1);
  live.equip(ITEMS.pickaxe.id);
  // Step aside to the west of the shelter and turn to the viewer.
  run(40, { left: true });
  run(4, { down: true });
  run(90);
  return live;
}

