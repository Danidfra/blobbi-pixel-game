/**
 * M10 phase B: fishing access is a reward of growth, never forced. A young island may have no shore within the
 * line's reach (the rod's reach is not extended); every Carrier's grown island does; and a cast at a sea that is
 * too far says so, and that the island will grow closer to it.
 */
import { describe, expect, it } from 'vitest';
import { LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { memoryStore } from '../src/game/persistence';
import { pressE, stand } from '../src/dev/scripted-play';
import type { WorldDescription } from '../src/world/types';

const CARRIERS: [string, (seed: string) => WorldDescription][] = [
  ['turtle', (s) => generateTurtleWorld(s, { turtleSeed: 't-' + s, shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false })],
  ['manta', (s) => generateMantaWorld(s, { carrierSeed: 'm-' + s, generatedHouse: false })],
  ['whale', (s) => generateWhaleWorld(s, { carrierSeed: 'w-' + s, generatedHouse: false })],
];

function atStage(make: (s: string) => WorldDescription, seed: string, stage: number): LiveWorld {
  const store = memoryStore();
  if (stage) {
    const probe = new LiveWorld(make(seed), 'blobbi-9', 16, { store });
    probe.growth = { stage, version: 3, history: [], regions: [] };
    probe.save();
  }
  const live = new LiveWorld(make(seed), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  live.inventory.add('blobbi-pixel:tool:fishing-rod', 1);
  live.equip('blobbi-pixel:tool:fishing-rod');
  return live;
}

/** How many standing spots and directions cast at the sea. */
function seaCasts(live: LiveWorld): number {
  const { width, height } = live.world.terrain;
  let n = 0;
  for (let y = 6; y < height - 6; y += 5)
    for (let x = 6; x < width - 6; x += 5) {
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      for (const d of ['up', 'down', 'left', 'right'] as const) {
        stand(live, x, y, d);
        if (live.fishTarget()?.water === 'sea') n++;
      }
    }
  return n;
}

describe('fishing access grows with the island', () => {
  for (const [name, make] of CARRIERS)
    it(`${name}: the grown island (stage 4) always has shore within the line's reach of the sea; growth never takes it away`, () => {
      for (const seed of ['fa-1', 'fa-2']) {
        let last = 0;
        for (const stage of [2, 3, 4]) {
          const n = seaCasts(atStage(make, seed, stage));
          expect(n, `${name} ${seed} stage ${stage}`).toBeGreaterThanOrEqual(last);
          last = n;
        }
        expect(last, `${name} ${seed} stage 4`).toBeGreaterThan(0);
      }
    }, 240_000);

  it('a cast at a sea too far away explains itself and points to growth', () => {
    // A young Variant S turtle: the sea lies beyond the shell's rim, out of reach.
    const live = atStage(CARRIERS[0][1], 'fa-1', 0);
    expect(seaCasts(live)).toBe(0);
    const { width, height } = live.world.terrain;
    let found = false;
    for (let y = 6; y < height - 6 && !found; y += 3)
      for (let x = 6; x < width - 6 && !found; x += 3) {
        if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
        for (const d of ['up', 'down', 'left', 'right'] as const) {
          stand(live, x, y, d);
          if (!live.seaAheadOutOfReach()) continue;
          live.resources = [];
          pressE(live);
          expect(live.fishing).toBeNull();
          expect(live.bubble?.text).toBe('too far to cast. the island will grow closer to the sea');
          found = true;
          break;
        }
      }
    expect(found).toBe(true);
  });
});
