/**
 * M8: a new world starts without the generated cottage, so the player builds the first home. Worlds made before keep
 * their cottage (their identity and generation are unchanged; the byte-for-byte pins live in turtle-start,
 * whale-world and shell-variants tests).
 */
import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { LiveWorld } from '../src/sim/live-world';
import { memoryStore, worldIdentity, saveKey } from '../src/game/persistence';
import { parseIdentity } from '../src/game/worlds';
import { findBuildSpot } from '../src/dev/scripted-play';
import { hash32 } from '../src/core/rng';
import type { WorldDescription, WorldOptions } from '../src/world/types';

type Species = 'turtle' | 'manta' | 'whale';
const make = (kind: Species, seed: string, extra: Partial<WorldOptions> = {}): WorldDescription =>
  kind === 'manta' ? generateMantaWorld(seed, { carrierSeed: `${seed}-c`, ...extra }) : kind === 'whale' ? generateWhaleWorld(seed, { carrierSeed: `${seed}-c`, ...extra }) : generateTurtleWorld(seed, { turtleSeed: `${seed}-c`, shellVariant: NEW_WORLD_SHELL_VARIANT, ...extra });
const h = (a: ArrayLike<number>) => hash32(Array.from(a, (v) => v.toString(36)).join(','));
const objectsHash = (w: WorldDescription) => hash32(w.objects.map((o) => `${o.kind}@${o.x},${o.y}`).join(';'));
const SEEDS = ['island-moss-0001', 'island-cove-2047', 'island-fern-0310', 'island-reef-9999'];

describe('new worlds start without a generated house', () => {
  for (const kind of ['turtle', 'manta', 'whale'] as const) {
    it(`${kind}: no cottage, and the option is part of the identity`, () => {
      for (const seed of SEEDS) {
        const w = make(kind, seed, { generatedHouse: false });
        expect(w.objects.filter((o) => o.kind === 'house')).toEqual([]);
        const id = worldIdentity(w);
        expect(id.endsWith('|house=none')).toBe(true);
        expect(parseIdentity(id)?.generatedHouse).toBe(false);
        expect(parseIdentity(id)?.kind).toBe(kind);
      }
    });

    it(`${kind}: worlds made before keep their cottage, identity and generation exactly`, () => {
      let houses = 0;
      for (const seed of SEEDS) {
        const before = make(kind, seed);
        const explicit = make(kind, seed, { generatedHouse: true });
        expect(worldIdentity(before)).not.toContain('house=');
        expect(parseIdentity(worldIdentity(before))?.generatedHouse).toBeUndefined();
        expect(worldIdentity(explicit)).toBe(worldIdentity(before));
        expect(h(explicit.terrain.cls)).toBe(h(before.terrain.cls));
        expect(objectsHash(explicit)).toBe(objectsHash(before));
        houses += before.objects.filter((o) => o.kind === 'house').length;
      }
      // The seeds above do grow cottages the old way, so the test above really removes one.
      expect(houses).toBeGreaterThan(0);
    });

    it(`${kind}: the start is still playable: resources to gather and room for the first shelter`, () => {
      for (const seed of SEEDS.slice(0, 2)) {
        const live = new LiveWorld(make(kind, seed, { generatedHouse: false }), 'blobbi-9', 16, { store: memoryStore() });
        const counts = { stick: 0, stone: 0 };
        for (const r of live.resources) if (r.kind === 'stick' || r.kind === 'stone') counts[r.kind]++;
        expect(counts.stick).toBeGreaterThanOrEqual(6);
        expect(counts.stone).toBeGreaterThanOrEqual(5);
        expect(live.world.objects.filter((o) => o.kind === 'tree').length).toBeGreaterThanOrEqual(4);
        expect(findBuildSpot(live, 'shelter')).toBe(true);
      }
    });
  }

  it('a new world never shares a save with the old world of the same seeds', () => {
    const store = memoryStore();
    const old = new LiveWorld(make('whale', 'island-moss-0001'), 'blobbi-9', 16, { store });
    old.save();
    const fresh = new LiveWorld(make('whale', 'island-moss-0001', { generatedHouse: false }), 'blobbi-9', 16, { store });
    expect(fresh.identity).not.toBe(old.identity);
    expect(store.get(saveKey(fresh.identity))).toBeNull();
  });
});
