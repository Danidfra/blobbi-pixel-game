/**
 * THE HERB PLANTER: one herb per HERB_SECONDS of world time, up to HERB_MAX waiting. A planter left alone a long while
 * holds HERB_MAX, not the whole time's worth: emptying it starts it growing afresh. (Regression: the time beyond the
 * cap was banked, so a planter left for 20 herbs' time paid out 3 per press until all 20 were taken.)
 */
import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, HERB_MAX, HERB_SECONDS } from '../src/sim/live-world';
import { BUILDINGS, type Building } from '../src/game/buildings';
import { QUESTS } from '../src/game/objectives';
import { memoryStore } from '../src/game/persistence';
import { findBuildSpot, pressE, run } from '../src/dev/scripted-play';

const HERB = 'blobbi-pixel:resource:herb';
type Visit = { visitBuilding: (b: Building, fromPlayer: boolean) => void };

function withPlanter() {
  const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store: memoryStore() });
  live.brain.enabled = false;
  for (const q of QUESTS) live.objectives.completed[q.id] = 0;
  live.inventory.add(BUILDINGS['herb-planter'].item!, 1);
  findBuildSpot(live, 'herb-planter', live.world.hubs[0]);
  live.startPlacing(BUILDINGS['herb-planter'].item!);
  pressE(live);
  run(live, 150);
  const planter = live.buildings.find((b) => b.kind === 'herb-planter')!;
  expect(planter).toBeTruthy();
  const pick = () => (live as unknown as Visit).visitBuilding(planter, true);
  return { live, planter, pick };
}

describe('herb planter', () => {
  it('holds at most HERB_MAX however long it is left, and starts afresh once emptied', () => {
    const { live, planter, pick } = withPlanter();
    const before = live.inventory.count(HERB);
    live.timeOffset += HERB_SECONDS * 20;
    expect(live.herbsReady(planter)).toBe(HERB_MAX);
    pick();
    expect(live.inventory.count(HERB) - before).toBe(HERB_MAX);
    expect(live.herbsReady(planter)).toBe(0);
    for (let i = 0; i < 5; i++) pick();
    expect(live.inventory.count(HERB) - before).toBe(HERB_MAX);
  });

  it('after emptying, the next herb comes one HERB_SECONDS later', () => {
    const { live, planter, pick } = withPlanter();
    live.timeOffset += HERB_SECONDS * HERB_MAX;
    expect(live.herbsReady(planter)).toBe(HERB_MAX);
    pick();
    live.timeOffset += HERB_SECONDS;
    expect(live.herbsReady(planter)).toBe(1);
  });
});
