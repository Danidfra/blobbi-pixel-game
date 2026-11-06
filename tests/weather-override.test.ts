/**
 * THE DEV WEATHER OVERRIDE: `LiveWorld.weather` forces rain or dry for this world only (the dev tools set it;
 * nothing in production does). It reaches every reader of the rain: the sky outdoors, the crops, the ambient step,
 * the audio's rain and the room's windows. It is never saved, and a fresh world starts natural.
 */
import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, LiveWorld } from '../src/sim/live-world';
import { loadSave, memoryStore } from '../src/game/persistence';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { DAY_SECONDS, START_HOUR, rainAt, roomLightAt } from '../src/game/daylight';
import { findBuildSpot, pressE, run } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { LAYOUTS } from '../src/game/interior';
import { InteriorRenderer } from '../src/render/interior-render';
import { DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { hash32 } from '../src/core/rng';

const at = (hour: number, day = 0) => day * DAY_SECONDS + (((hour - START_HOUR + 24) % 24) / 24) * DAY_SECONDS;

function homeWorld() {
  const store = memoryStore();
  const world = generateWhaleWorld('weather-island', { carrierSeed: 'weather-whale', generatedHouse: false });
  const live = new LiveWorld(world, 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  live.inventory.add(ITEMS.wood.id, 6);
  live.inventory.add(ITEMS.stone.id, 3);
  live.objectives.completed.materials = 0;
  findBuildSpot(live, 'shelter');
  live.setBuildMode('shelter');
  pressE(live);
  run(live, 60 * 26);
  return { live, store, world };
}
const dryAfternoon = (seed: string) => {
  for (let d = 0; d < 40; d++) if (rainAt(seed, at(14.5, d)) === 0) return at(14.5, d);
  throw new Error('no dry day');
};
const wetAfternoon = (seed: string) => {
  for (let d = 0; d < 40; d++) if (rainAt(seed, at(14.5, d)) >= 0.99) return at(14.5, d);
  throw new Error('no wet day');
};

describe('the dev weather override', () => {
  it('starts natural and follows the world\'s own rain', () => {
    const { live, world } = homeWorld();
    expect(live.weather).toBe('natural');
    live.timeOffset = wetAfternoon(world.seed) - live.clock.time;
    expect(live.rainOutside()).toBeGreaterThan(0.9);
    expect(live.rainNow()).toBe(live.rainOutside());
    live.timeOffset = dryAfternoon(world.seed) - live.clock.time;
    expect(live.rainOutside()).toBe(0);
  });

  it('forces rain on a dry afternoon: outdoors (sky, drops, crops) and in the room\'s windows; forces dry on a wet one', () => {
    const { live, world } = homeWorld();
    live.timeOffset = dryAfternoon(world.seed) - live.clock.time;
    live.weather = 'rain';
    expect(live.rainOutside()).toBe(1);
    expect(live.rainNow()).toBe(1);
    for (let i = 0; i < 60; i++) live.update(1 / 60, IDLE_INPUT);
    expect(live.particles.particles.some((p) => p.kind === 'rain')).toBe(true);
    // Indoors: the room reads the same rain (greyed glass, no motes), and the window shows streaks.
    expect(live.enterInterior(live.home()!)).toBe(true);
    live.brain.enabled = false;
    expect(live.rainNow()).toBe(0); // indoors the sky's rain never tints the room itself
    expect(live.rainOutside()).toBe(1);
    const light = roomLightAt(world.seed, live.worldTime, live.rainOutside());
    expect(light.rain).toBe(1);
    expect(roomLightAt(world.seed, live.worldTime).rain).toBe(0); // the sky alone would be dry
    const room = new InteriorRenderer(live);
    const w = LAYOUTS[1].w;
    const h = LAYOUTS[1].h;
    const wet = hash32(Array.from(room.render(w, h, 0, 0, live.clock.time, DEFAULT_LIVE_OPTIONS).data, (c) => c.toString(36)).join(','));
    live.weather = 'dry';
    const dry = hash32(Array.from(room.render(w, h, 0, 0, live.clock.time, DEFAULT_LIVE_OPTIONS).data, (c) => c.toString(36)).join(','));
    expect(wet).not.toBe(dry);
    // Forced dry at 14:30 is full daylight: the motes come back (the override reaches the room's atmosphere too).
    for (let i = 0; i < 60 * 15; i++) live.update(1 / 60, IDLE_INPUT);
    expect(live.particles.count('mote')).toBeGreaterThan(0);
    live.exitInterior();
    // Force dry on a wet afternoon: no rain anywhere.
    live.timeOffset = wetAfternoon(world.seed) - live.clock.time;
    expect(rainAt(world.seed, live.worldTime)).toBeGreaterThan(0.9);
    live.weather = 'dry';
    expect(live.rainOutside()).toBe(0);
    expect(live.rainNow()).toBe(0);
    live.particles.particles.length = 0;
    for (let i = 0; i < 60; i++) live.update(1 / 60, IDLE_INPUT);
    expect(live.particles.particles.some((p) => p.kind === 'rain')).toBe(false);
    live.weather = 'natural';
    expect(live.rainOutside()).toBeGreaterThan(0.9);
  });

  it('is never saved: a reload, and a fresh world, start natural', () => {
    const { live, store, world } = homeWorld();
    live.weather = 'rain';
    live.save();
    const raw = JSON.stringify(loadSave(store, live.identity) ?? {});
    expect(raw).not.toContain('"weather"');
    expect(raw).not.toContain('"rain"');
    const again = new LiveWorld(world, 'blobbi-9', 16, { store });
    expect(again.weather).toBe('natural');
  });
});
