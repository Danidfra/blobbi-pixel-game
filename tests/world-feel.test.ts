/**
 * M9 world feel: a grown home's chimney smokes, its windows glow at night and its light reaches further, and the
 * island says when a growth requirement is met (once, never on loading).
 */
import { describe, expect, it } from 'vitest';
import { LiveWorld } from '../src/sim/live-world';
import { memoryStore } from '../src/game/persistence';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { findBuildSpot, pressE, run } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { buildingSprite, houseChimney } from '../src/game/buildings';
import { paletteFor } from '../src/world/generate';
import { hash32 } from '../src/core/rng';

function withHome() {
  const live = new LiveWorld(generateWhaleWorld('island-feel', { carrierSeed: 'w', generatedHouse: false }), 'blobbi-9', 16, { store: memoryStore() });
  live.brain.enabled = false;
  live.inventory.add(ITEMS.wood.id, 6);
  live.inventory.add(ITEMS.stone.id, 3);
  live.objectives.completed.materials = 0;
  findBuildSpot(live, 'shelter', live.world.hubs[0], 160, 3);
  live.setBuildMode('shelter');
  pressE(live);
  run(live, 60 * 26);
  return { live, home: live.home()! };
}
const h = (b: { data: Uint32Array }) => hash32(Array.from(b.data, (v) => v.toString(36)).join(','));

describe('a home that lives', () => {
  it('a Cottage and a Dream Home have a smoking chimney; the shelter has none', () => {
    const { home } = withHome();
    const palette = paletteFor('cozy');
    expect(houseChimney(home, palette)).toBeNull();
    for (const level of [2, 3]) {
      const c = houseChimney({ ...home, level }, palette)!;
      expect(c).not.toBeNull();
      expect(c.y).toBeLessThan(home.y - 20); // up on the roof
      expect(houseChimney({ ...home, level }, palette)).toBe(c); // cached
    }
  });

  it('smoke rises from a Cottage', () => {
    const { live, home } = withHome();
    home.level = 2;
    const before = (live as unknown as { islandParticles: { particles: { kind: string }[] } }).islandParticles.particles.filter((p) => p.kind === 'smoke').length;
    let seen = 0;
    for (let i = 0; i < 60 * 6; i++) {
      run(live, 1);
      seen = Math.max(seen, (live as unknown as { islandParticles: { particles: { kind: string }[] } }).islandParticles.particles.filter((p) => p.kind === 'smoke').length);
    }
    expect(seen).toBeGreaterThan(before);
  });

  it('at night the windows glow, and a bigger home lights more ground', () => {
    const { live, home } = withHome();
    const palette = paletteFor('cozy');
    for (const level of [1, 2, 3]) {
      const b = { ...home, level };
      expect(h(buildingSprite(b, palette, 1, 1.6, true).buffer)).not.toBe(h(buildingSprite(b, palette, 1, 1.6, false).buffer));
    }
    const radius = () => live.lightSources().find((l) => Math.abs(l.y - home.y) < 4)!.radius;
    const r1 = radius();
    home.level = 3;
    expect(radius()).toBeGreaterThan(r1);
    // Not a house: the flag changes nothing.
    const fence = { id: 'fence:0', kind: 'fence', x: 0, y: 0, placedAt: 0, seed: 'f' };
    expect(buildingSprite(fence, palette, 1, 1.6, true)).toBe(buildingSprite(fence, palette, 1, 1.6, false));
  });

  it('each growth requirement says so when it is met, once', () => {
    const { live } = withHome();
    const seen = new Set<string>();
    const watch = (frames: number) => {
      for (let i = 0; i < frames; i++) {
        run(live, 1);
        for (const x of live.notices) if (x.heading === 'Island growth') seen.add(`${x.title}|${x.until}`);
      }
    };
    watch(60 * 4); // the first check: nothing announced for what was already met
    expect(seen.size).toBe(0);
    live.tally.crafted = 8;
    watch(60 * 8);
    expect([...seen]).toHaveLength(1);
    expect([...seen][0]).toMatch(/Craft things: done/);
  });
});
