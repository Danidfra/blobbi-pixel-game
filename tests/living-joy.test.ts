/**
 * JOY FROM THE LIVING WORLD (phase 2): a bunny settling beside the Blobbi (+3, once per appearance), a songbird's
 * song (+2, once per appearance), the music box or the wind chime (+2, twenty seconds apart), each on its own gate,
 * separate from the decorations' shared one; capped at 100; the same every run; nothing for a visitor.
 */
import { describe, expect, it } from 'vitest';
import { JOY, JOY_SOURCE_COOLDOWN } from '../src/game/care';
import { IDLE_INPUT, LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { memoryStore } from '../src/game/persistence';
import { BUILDINGS } from '../src/game/buildings';
import { DAY_SECONDS, START_HOUR, rainAt } from '../src/game/daylight';
import { LAND_REACH, BUNNY_APPROACH_AFTER, patience, reach, type LandKind, type LandSighting } from '../src/game/land-life';
import { findBuildSpot, pressE, run, stand } from '../src/dev/scripted-play';

const make = (seed = 'joy-test') => generateTurtleWorld(seed, { turtleSeed: 'lt', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });
const at = (hour: number, day = 0) => day * DAY_SECONDS + (((hour - START_HOUR + 24) % 24) / 24) * DAY_SECONDS;
function grown(stage = 2, seed = 'joy-test'): LiveWorld {
  const store = memoryStore();
  const probe = new LiveWorld(make(seed), 'blobbi-9', 16, { store });
  probe.growth = { stage, version: 3, history: [], regions: [] };
  probe.save();
  const live = new LiveWorld(make(seed), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  live.weather = 'dry';
  return live;
}
function moment(live: LiveWorld, kind: LandKind, pick: (s: LandSighting) => boolean = () => true, from = at(10)): { t: number; s: LandSighting } {
  const perches = (live as unknown as { perches: () => { x: number; y: number }[] }).perches();
  for (let t = from; t < from + DAY_SECONDS * 3; t += 0.5) {
    const h = ((START_HOUR + (t / DAY_SECONDS) * 24) % 24 + 24) % 24;
    if (h < 8 || h > 17 || rainAt(live.world.seed, t) > 0) continue;
    const s = live.land.at(t, 0, perches).find((x) => x.kind === kind && x.age < 3 && pick(x));
    if (s) return { t, s };
  }
  throw new Error(`no ${kind}`);
}
function arrange(live: LiveWorld, t: number, p: { x: number; y: number }, d: number): void {
  live.timeOffset = t - live.clock.time;
  const { footRx: rx, footRy: ry } = live.blobbi;
  for (const a of [Math.PI, 0, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]) {
    const spot = live.collision.nearestFree(Math.round(p.x + Math.cos(a) * d), Math.round(p.y + Math.sin(a) * d), rx, ry);
    if (spot && Math.abs(Math.hypot(spot.x - p.x, spot.y - p.y) - d) < 6) {
      stand(live, spot.x, spot.y, 'down');
      return;
    }
  }
  throw new Error('no spot');
}
const phase = (live: LiveWorld, id: string) => (live as unknown as { landMoods: Map<string, { phase: string }> }).landMoods.get(id)?.phase;
const still = (live: LiveWorld, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) live.update(1 / 60, IDLE_INPUT);
};

describe('joy from the living world', () => {
  it('a bunny settling beside the Blobbi: +3, once for that appearance, even if it comes back after a wary moment', () => {
    const live = grown();
    const { t, s } = moment(live, 'bunny', (x) => x.traits.bold > 0.6);
    arrange(live, t, s.home, 120);
    live.update(1 / 60, IDLE_INPUT);
    const v = live.landViews.find((x) => x.id === s.id)!;
    arrange(live, live.worldTime, v, reach(LAND_REACH.bunnyWatch, s.traits) - 5);
    live.care.happiness = 50;
    for (let i = 0; i < (BUNNY_APPROACH_AFTER * patience(s.traits) + 6) * 60 && phase(live, s.id) !== 'beside'; i++) live.update(1 / 60, IDLE_INPUT);
    expect(phase(live, s.id)).toBe('beside');
    expect(live.care.happiness).toBeCloseTo(50 + JOY.bunny, 0); // (the joy's slow drift over the encounter aside)
    // A gentle step makes it wary; stillness brings it back beside: no second gain from the same appearance.
    const beside = live.landViews.find((x) => x.id === s.id)!;
    const away = beside.x > live.blobbi.x ? 'left' : 'right';
    for (let i = 0; i < 3; i++) live.update(1 / 60, { ...IDLE_INPUT, [away]: true });
    expect(phase(live, s.id)).toBe('wary');
    const joy = live.care.happiness;
    for (let i = 0; i < 60 * 20 && phase(live, s.id) !== 'beside'; i++) live.update(1 / 60, IDLE_INPUT);
    expect(live.care.happiness).toBeLessThanOrEqual(joy);
  });

  it('a songbird\'s song: +2, once for that appearance; a shy bird that flies off gives nothing', () => {
    const live = grown();
    live.inventory.add(BUILDINGS['bird-feeder'].item!, 1);
    expect(findBuildSpot(live, 'bird-feeder')).toBe(true);
    expect(live.startPlacing(BUILDINGS['bird-feeder'].item!)).toBe(true);
    pressE(live);
    run(live, 150);
    const tame = moment(live, 'songbird', (x) => x.traits.bold > 0.35, at(10));
    arrange(live, tame.t, tame.s.home, 30);
    live.care.happiness = 50;
    still(live, 5);
    expect(live.landViews.find((x) => x.id === tame.s.id)?.pose).toBe('sing');
    expect(live.care.happiness).toBeCloseTo(50 + JOY.song, 0);
    still(live, 4); // more notes, no more joy
    expect(live.care.happiness).toBeCloseTo(50 + JOY.song, 0);
    const shy = moment(live, 'songbird', (x) => x.traits.bold < 0.35, live.worldTime + 60);
    arrange(live, shy.t, shy.s.home, 60);
    still(live, 2);
    live.care.happiness = 50;
    arrange(live, live.worldTime, shy.s.home, reach(LAND_REACH.birdStartle, shy.s.traits) - 3);
    still(live, 3);
    expect(live.care.happiness).toBeCloseTo(50, 0);
  });

  it('the music box: +2 per play, twenty seconds apart, on its own gate beside the decorations\', and never past 100', () => {
    const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store: memoryStore() });
    live.brain.enabled = false;
    live.resources = [];
    for (const c of BUILDINGS.shelter.cost) live.inventory.add(c.item, c.quantity);
    expect(findBuildSpot(live, 'shelter')).toBe(true);
    live.setBuildMode('shelter');
    pressE(live);
    run(live, 60 * (BUILDINGS.shelter.buildSeconds + 1));
    expect(live.enterInterior(live.home()!)).toBe(true);
    live.brain.enabled = false;
    run(live, 100);
    const box = BUILDINGS['music-box'];
    live.inventory.add(box.item!, 1);
    // Somewhere in the room it fits.
    let placed = live.interior!.state.furniture.find((f) => f.kind === 'music-box');
    for (const [x, y] of [[64, 70], [40, 60], [90, 60], [64, 56], [50, 76], [84, 76]] as const) {
      if (placed) break;
      if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
      stand(live, x, y, 'up');
      if (!live.placementCheck('music-box').ok) continue;
      expect(live.startPlacing(box.item!)).toBe(true);
      pressE(live);
      run(live, 30);
      placed = live.interior!.state.furniture.find((f) => f.kind === 'music-box');
    }
    expect(placed).toBeDefined();
    stand(live, placed!.x, placed!.y + box.footRy + live.blobbi.footRy + 2, 'up');
    expect(live.facingBuilding()?.id).toBe(placed!.id);
    live.care.happiness = 50;
    pressE(live);
    expect(live.care.happiness).toBeCloseTo(50 + JOY.music, 1);
    pressE(live); // too soon
    expect(live.care.happiness).toBeCloseTo(50 + JOY.music, 1);
    live.timeOffset += JOY_SOURCE_COOLDOWN + 1;
    pressE(live);
    expect(live.care.happiness).toBeCloseTo(50 + 2 * JOY.music, 1);
    // Its own gate: admiring a decoration a moment ago does not block it, nor the other way round.
    live.timeOffset += JOY_SOURCE_COOLDOWN + 1;
    (live as unknown as { lastDecorationJoy: number }).lastDecorationJoy = live.worldTime;
    pressE(live);
    expect(live.care.happiness).toBeCloseTo(50 + 3 * JOY.music, 1);
    live.care.happiness = 99.5;
    live.timeOffset += JOY_SOURCE_COOLDOWN + 1;
    pressE(live);
    expect(live.care.happiness).toBeGreaterThan(99.9); // capped at 100 (the drift of the swing's own moment aside)
  });

  it('is the same every run: two worlds, the same encounter, the same joy', () => {
    const a = grown();
    const b = grown();
    for (const live of [a, b]) {
      const { t, s } = moment(live, 'bunny', (x) => x.traits.bold > 0.6);
      arrange(live, t, s.home, 120);
      live.update(1 / 60, IDLE_INPUT);
      const v = live.landViews.find((x) => x.id === s.id)!;
      arrange(live, live.worldTime, v, reach(LAND_REACH.bunnyWatch, s.traits) - 5);
      live.care.happiness = 50;
      still(live, 14);
    }
    expect(a.care.happiness).toBe(b.care.happiness);
    expect(a.care.happiness).toBeGreaterThan(50);
  });
});
