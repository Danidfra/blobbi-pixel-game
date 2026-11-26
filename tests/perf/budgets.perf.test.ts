/**
 * PERFORMANCE BUDGETS, run on their own (`npm run test:perf`: one file at a time, one worker) so that a budget measures
 * the code and not the machine. In the parallel correctness suite, nine test processes share four performance cores
 * and six efficiency cores (the development Mac): a file scheduled on an efficiency core takes 2–3 times as long, CPU
 * time included, and a budget there says nothing (KI-34, KI-61). The budgets and what they time are unchanged from
 * when they lived in world.test.ts and land-life.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../src/world/generate';
import { renderWorld } from '../../src/render/compose';
import { LiveWorld } from '../../src/sim/live-world';
import { generateTurtleWorld } from '../../src/world/turtle-world';
import { NEW_WORLD_SHELL_VARIANT } from '../../src/carrier/types';
import { memoryStore } from '../../src/game/persistence';
import { DAY_SECONDS } from '../../src/game/daylight';

describe('performance budgets', () => {
  // KI-34: this process's own CPU, the fastest of three runs (a real slowdown makes every run slow, interference only
  // some).
  it('generates and draws a default world in under 1.5 s of CPU', () => {
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const c0 = process.cpuUsage();
      const w = generateWorld('perf');
      renderWorld(w);
      const c = process.cpuUsage(c0);
      best = Math.min(best, (c.user + c.system) / 1000);
    }
    expect(best).toBeLessThan(1500);
  });

  it('answers what lives on the island, every half second of a whole day, with each routine, in under 2.5 s', () => {
    const store = memoryStore();
    const make = () => generateTurtleWorld('land-test', { turtleSeed: 'lt', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });
    const probe = new LiveWorld(make(), 'blobbi-9', 16, { store });
    probe.growth = { stage: 2, version: 3, history: [], regions: [] };
    probe.save();
    const land = new LiveWorld(make(), 'blobbi-9', 16, { store }).land;
    const perch = [{ x: 300, y: 200 }];
    const t0 = performance.now();
    let seen = 0;
    for (let t = 0; t < DAY_SECONDS; t += 0.5)
      for (const s of land.at(t, 0, perch)) {
        if (s.kind !== 'songbird') land.routine(s, s.age);
        seen++;
      }
    expect(seen).toBeGreaterThan(0);
    expect(performance.now() - t0).toBeLessThan(2500);
  });
});
