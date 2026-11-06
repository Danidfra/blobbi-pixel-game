/**
 * WALKING DUST: a pixel of dust kicked up behind the feet every few pixels walked on dry ground outdoors, coloured
 * for the ground; none standing still, asleep, indoors, afloat or over water. Its own seeded stream: identical
 * worlds and inputs raise identical dust, and nothing else on the island changes.
 */
import { describe, expect, it } from 'vitest';
import { DUST_STRIDE, dustColourFor, IDLE_INPUT, LiveWorld, type LiveInput } from '../src/sim/live-world';
import { memoryStore } from '../src/game/persistence';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { T } from '../src/world/types';
import { paletteFor } from '../src/world/generate';
import { findBuildSpot, pressE, run } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';

const RIGHT: LiveInput = { ...IDLE_INPUT, right: true };
const palette = paletteFor('island');

/** A whale island: it has a sandy shore and grass from the start (a new turtle shell has no sand yet). */
const fresh = () => {
  const live = new LiveWorld(generateWhaleWorld('dust-island', { carrierSeed: 'dust-whale', generatedHouse: false }), 'blobbi-9', 16, { store: memoryStore() });
  live.brain.enabled = false;
  return live;
};
const dust = (live: LiveWorld) => live.particles.particles.filter((p) => p.kind === 'dust');

/** A standable spot of a terrain class with room to walk right for `reach` pixels on the same class. */
function spotOn(live: LiveWorld, classes: number[], reach = 40): { x: number; y: number } | null {
  const { width, height } = live.world.terrain;
  const b = live.blobbi;
  for (let y = 10; y < height - 10; y += 1)
    for (let x = 10; x < width - reach - 10; x += 1) {
      let ok = true;
      for (let dx = 0; dx <= reach && ok; dx += 4) ok = classes.includes(live.terrainClassAt(x + dx, y)) && live.collision.canStand(x + dx, y, b.footRx, b.footRy);
      if (ok) return { x, y };
    }
  return null;
}
function standAt(live: LiveWorld, at: { x: number; y: number }): void {
  live.blobbi.x = at.x;
  live.blobbi.y = at.y;
  run(live, 60); // any dust from before has gone (it lives under half a second)
  expect(dust(live).length).toBe(0);
}

describe('walking dust', () => {
  it('rises behind the feet while walking on grass and on a path, in the ground\'s own colours, and settles when standing still', () => {
    const live = fresh();
    for (const [name, classes, colours] of [
      ['grass', [T.GRASS, T.GRASS_EDGE, T.GRASS_PATCH, T.GRASS_DARK, T.MEADOW, T.MOSS, T.CLOVER], [palette.grass.light, palette.grass.highlight]],
      ['path', [T.PATH, T.GRAVEL], [palette.path.light, palette.stone.light]],
    ] as const) {
      const at = spotOn(live, [...classes], 36) ?? spotOn(live, [...classes], 24) ?? spotOn(live, [...classes], 14);
      expect(at, name).not.toBeNull();
      standAt(live, at!);
      const trail: { x: number; y: number }[] = [];
      let most = 0;
      let spawned = 0;
      for (let i = 0; i < 60; i++) {
        live.update(1 / 60, RIGHT);
        trail.push({ x: live.blobbi.x, y: live.blobbi.y });
        const now = dust(live);
        spawned += now.filter((p) => p.age <= 1 / 60 + 1e-9).length; // born this step
        most = Math.max(most, now.length);
      }
      const walked = live.blobbi.x - at!.x;
      expect(walked, name).toBeGreaterThan(DUST_STRIDE * 2);
      // About one puff per stride walked, never a cloud.
      expect(spawned, name).toBeGreaterThanOrEqual(Math.floor(walked / DUST_STRIDE) - 1);
      expect(spawned, name).toBeLessThanOrEqual(Math.ceil(walked / DUST_STRIDE) + 1);
      expect(most, name).toBeLessThanOrEqual(6);
      for (const p of dust(live)) {
        expect(colours as readonly number[], name).toContain(p.color);
        expect(p.front).toBe(false);
        // Near the ground the feet touched: within a stride of the trail, not above the body.
        expect(trail.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 14), name).toBe(true);
      }
      // Standing still: the dust settles and no more comes.
      run(live, 40);
      expect(dust(live).length, name).toBe(0);
      run(live, 60);
      expect(dust(live).length, name).toBe(0);
    }
  });

  it('raises none over water, foam or wet sand, and none on a rock face or the Carrier', () => {
    for (const cls of [T.DEEP, T.WATER, T.SHALLOW, T.FOAM, T.SAND_WET, T.CLIFF_FACE, T.RIM, T.SKIN, T.POND]) expect(dustColourFor(cls, palette), String(cls)).toBeNull();
    for (const cls of [T.SAND, T.PATH, T.GRAVEL, T.GRASS, T.MEADOW, T.MOSS, T.CLOVER]) expect(dustColourFor(cls, palette), String(cls)).not.toBeNull();
    expect(dustColourFor(T.SAND, palette, false)).not.toBe(dustColourFor(T.SAND, palette, true));
  });

  it('raises none indoors', () => {
    const world = generateWhaleWorld('dust-house', { carrierSeed: 'dust-whale', generatedHouse: false });
    const live = new LiveWorld(world, 'blobbi-9', 16, { store: memoryStore() });
    live.brain.enabled = false;
    live.inventory.add(ITEMS.wood.id, 6);
    live.inventory.add(ITEMS.stone.id, 3);
    live.objectives.completed.materials = 0;
    findBuildSpot(live, 'shelter');
    live.setBuildMode('shelter');
    pressE(live);
    run(live, 60 * 26);
    expect(live.enterInterior(live.home()!)).toBe(true);
    live.brain.enabled = false;
    run(live, 60);
    for (let i = 0; i < 90; i++) live.update(1 / 60, i < 45 ? { ...IDLE_INPUT, up: true } : { ...IDLE_INPUT, left: true });
    expect(dust(live).length).toBe(0);
  });

  it('is the same on every run and leaves the island\'s other ambient life untouched', () => {
    const a = fresh();
    const b = fresh();
    const at = spotOn(a, [T.GRASS, T.GRASS_EDGE, T.GRASS_PATCH, T.MEADOW])!;
    standAt(a, at);
    standAt(b, at);
    const snap = (live: LiveWorld) => live.particles.particles.map((p) => [p.kind, p.x, p.y, p.vx, p.vy, p.age, p.color]);
    for (let i = 0; i < 90; i++) {
      a.update(1 / 60, RIGHT);
      b.update(1 / 60, RIGHT);
      expect(snap(a)).toEqual(snap(b));
    }
    expect(dust(a).length).toBeGreaterThan(0);
    // The island's own leaves, petals and sparkles (which never depend on where the Blobbi is) fall the same in a
    // world that walks and raises dust as in one that stands still: the dust draws from its own stream.
    const c = fresh();
    const d = fresh();
    standAt(c, at);
    standAt(d, at);
    // (Sorted: a particle that dies is replaced by the list's last one, so the order depends on what else is alive.)
    const ambientOf = (live: LiveWorld) => live.particles.particles.filter((p) => p.kind === 'leaf' || p.kind === 'sparkle' || p.kind === 'petal').map((p) => `${p.kind} ${p.x} ${p.y} ${p.age}`).sort();
    let leaves = 0;
    let puffs = 0;
    for (let i = 0; i < 60 * 8; i++) {
      c.update(1 / 60, i % 120 < 60 ? RIGHT : { ...IDLE_INPUT, left: true }); // back and forth: never stuck at a wall
      d.update(1 / 60, IDLE_INPUT);
      expect(ambientOf(c)).toEqual(ambientOf(d));
      leaves = Math.max(leaves, ambientOf(c).length);
      puffs = Math.max(puffs, dust(c).length);
    }
    expect(puffs).toBeGreaterThan(0);
    expect(dust(d).length).toBe(0);
    expect(leaves).toBeGreaterThan(0);
  });
});
