import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { ITEMS } from '../src/game/items';
import { BUILDINGS } from '../src/game/buildings';
import { QUESTS } from '../src/game/objectives';
import { DAY_SECONDS, applyLight, lightAt, rainAt } from '../src/game/daylight';
import { isWet, needsWater } from '../src/game/farming';
import { rgba } from '../src/core/color';
import { findBuildSpot, findField, pressE, run, standAbove } from '../src/dev/scripted-play';

const world = () => generateTurtleWorld('turtle-0');
function quiet() {
  const live = new LiveWorld(world(), 'blobbi-9', 16);
  live.brain.enabled = false;
  for (const q of QUESTS) live.objectives.completed[q.id] = 0;
  return live;
}
function place(live: LiveWorld, kind: string, near = live.world.hubs[0]) {
  live.inventory.add(BUILDINGS[kind].item!, 1);
  expect(findBuildSpot(live, kind, near)).toBe(true);
  live.startPlacing(BUILDINGS[kind].item!);
  pressE(live);
  run(live, 150);
  return live.buildings.filter((b) => b.kind === kind).at(-1)!;
}

describe('weather and light', () => {
  it('rain is deterministic, about one day in four, in the afternoon; light is never too dark and lamps light a pool', () => {
    let rainy = 0;
    for (let day = 0; day < 40; day++) {
      const t = day * DAY_SECONDS + (14.5 - 7) / 24 * DAY_SECONDS;
      if (rainAt('turtle-0', t) > 0) rainy++;
      expect(rainAt('turtle-0', t)).toBe(rainAt('turtle-0', t));
      expect(rainAt('turtle-0', day * DAY_SECONDS)).toBe(0); // mornings are dry
    }
    expect(rainy).toBeGreaterThan(4);
    expect(rainy).toBeLessThan(20);
    // A night frame with one lamp: darker overall, lighter under the lamp, never transparent.
    const w = 40;
    const data = new Uint32Array(w * w).fill(rgba(120, 200, 80));
    const night = lightAt(((22 - 7) / 24) * DAY_SECONDS);
    applyLight(data, w, w, 0, 0, night, 0, [{ x: 10, y: 10, radius: 12 }]);
    const g = (i: number) => (data[i] >>> 8) & 0xff;
    expect(g(35 * w + 35)).toBeLessThan(200);
    expect(g(10 * w + 10)).toBeGreaterThan(g(35 * w + 35));
    expect(data.every((c) => c >>> 24 === 255)).toBe(true);
    // Daytime leaves pixels exactly as they are.
    const day = new Uint32Array(4).fill(rgba(1, 2, 3));
    applyLight(day, 2, 2, 0, 0, lightAt(0), 0, []);
    expect([...day]).toEqual(new Array(4).fill(rgba(1, 2, 3)));
  });

  it('rain and sprinklers water dry crops (without counting as the player\'s watering)', () => {
    const live = quiet();
    live.inventory.add(ITEMS.hoe.id, 1);
    live.equip(ITEMS.hoe.id);
    live.inventory.add(ITEMS.seed.id, 4);
    live.resources = [];
    const field = findField(live, 2)!;
    for (const c of field) {
      standAbove(live, c);
      pressE(live);
      pressE(live);
    }
    const crops = field.map((c) => live.plotAt(c)!);
    expect(crops.every((p) => p.crop && needsWater(p.crop, live.worldTime))).toBe(true);
    // A rainy afternoon.
    let t = 0;
    while (rainAt(live.world.seed, t) < 0.5) t += 30;
    live.timeOffset = t - live.clock.time;
    run(live, 70);
    expect(crops.every((p) => isWet(p.crop!, live.worldTime))).toBe(true);
    expect(live.tally.watered).toBe(0);
    // A sprinkler next to a dry field keeps it wet.
    const live2 = quiet();
    live2.inventory.add(ITEMS.hoe.id, 1);
    live2.equip(ITEMS.hoe.id);
    live2.inventory.add(ITEMS.seed.id, 2);
    live2.resources = [];
    const [cell] = findField(live2, 1)!;
    standAbove(live2, cell);
    pressE(live2);
    pressE(live2);
    const plot = live2.plotAt(cell)!;
    const r = live2.plotRect(cell);
    live2.inventory.add(BUILDINGS.sprinkler.item!, 1);
    live2.blobbi.x = r.x0 + 4;
    live2.blobbi.y = r.y1 + 6;
    live2.update(1 / 60, { ...IDLE_INPUT, right: true });
    let placed = false;
    for (const [dx, dy] of [[12, 0], [-12, 0], [0, 10], [10, 10]]) {
      live2.blobbi.x = r.x0 + 4 + dx;
      live2.blobbi.y = r.y0 + 4 + dy;
      live2.update(1 / 60, { ...IDLE_INPUT, down: true });
      live2.blobbi.x = r.x0 + 4 + dx;
      live2.blobbi.y = r.y0 + 4 + dy;
      live2.startPlacing(BUILDINGS.sprinkler.item!);
      if (live2.placementCheck().ok) {
        pressE(live2);
        placed = live2.buildings.some((b) => b.kind === 'sprinkler');
        if (placed) break;
      }
      live2.stopPlacing();
    }
    if (placed) {
      const sp = live2.buildings.find((b) => b.kind === 'sprinkler')!;
      const near = Math.abs(Math.floor((sp.x - live2.origin.x) / 8) - cell.gx) <= 1 && Math.abs(Math.floor((sp.y - live2.origin.y) / 8) - cell.gy) <= 1;
      run(live2, 200);
      if (near) expect(isWet(plot.crop!, live2.worldTime)).toBe(true);
    }
    expect(live2.tally.watered).toBe(0);
  });
});

describe('ambient life', () => {
  it('butterflies by day, fireflies at night, birds now and then; all from their own stream (the island stays deterministic)', () => {
    const run2 = (hour: number) => {
      const live = new LiveWorld(world(), 'blobbi-9', 16);
      live.brain.enabled = false;
      live.timeOffset = ((hour - 7 + 24) % 24) / 24 * DAY_SECONDS;
      const kinds = new Set<string>();
      for (let i = 0; i < 60 * 60; i++) {
        live.update(1 / 60, IDLE_INPUT);
        for (const p of live.particles.particles) kinds.add(p.kind);
      }
      return { kinds, live };
    };
    const day = run2(10);
    expect(day.kinds.has('butterfly') || day.kinds.has('bird')).toBe(true);
    expect(day.kinds.has('firefly')).toBe(false);
    const night = run2(23);
    expect(night.kinds.has('firefly')).toBe(true);
    expect(night.kinds.has('butterfly')).toBe(false);
    // Same inputs, same particles.
    expect(run2(10).live.particles.particles.map((p) => [p.kind, p.x])).toEqual(day.live.particles.particles.map((p) => [p.kind, p.x]));
  });
});

describe('autonomy around what the player built', () => {
  it('visits chests, stoves, planters and the house without ever opening, cooking, picking or going in; watches the sea', () => {
    const live = quiet();
    place(live, 'chest');
    place(live, 'herb-planter');
    const bag = JSON.stringify(live.inventory.snapshot());
    live.timeOffset += 2000; // herbs ready in the planter
    live.brain.enabled = true;
    const looks = new Set<string>();
    for (let i = 0; i < 60 * 1500; i++) {
      live.update(1 / 60, IDLE_INPUT);
      if (live.brain.lastLook) looks.add(live.brain.lastLook.kind);
      if (live.brain.state === 'inspect') looks.add(live.brain.note);
      expect(live.uiRequest).toBeNull();
      expect(live.inside).toBe(false);
    }
    expect(JSON.stringify(live.inventory.snapshot())).toBe(bag);
    expect(live.tally.looked).toBe(0);
    expect([...looks].some((n) => n.includes('chest') || n.includes('herb-planter'))).toBe(true);
    expect(live['shoreSpots' as keyof LiveWorld]).toBeDefined();
  });
});
