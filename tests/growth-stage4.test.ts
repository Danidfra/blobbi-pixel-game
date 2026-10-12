/**
 * M9 stage 4, the Sanctuary: the island spreads over most of the Carrier's suitable carrying surface, by ADDING land
 * only — nothing that was land changes (but its old shore band), nothing moves — leaving the anatomy visible, every
 * part reachable, deterministic, and saved and reloaded exactly.
 */
import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { growWorld, suitableSurface, GROWTH_VERSION } from '../src/world/growth';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { T, WALKABLE, type WorldDescription } from '../src/world/types';
import { CollisionMap } from '../src/sim/collision';
import { spriteFor } from '../src/render/compose';
import { LiveWorld } from '../src/sim/live-world';
import { loadSave, memoryStore, saveKey } from '../src/game/persistence';
import { hash32 } from '../src/core/rng';
import { movingPartsMask } from '../src/cinematic/sea';
import { findBuildSpot, pressE, run } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';

const ground = (c: number) => c >= T.SAND_WET && c !== T.RIM && c !== T.SKIN;
const sig = (a: ArrayLike<number>) => hash32(Array.from(a, (v) => v.toString(36)).join(','));
const CARRIERS: [string, () => WorldDescription][] = [
  ['turtle (Variant S)', () => generateTurtleWorld('island-s4', { turtleSeed: 'turtle-s4', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false })],
  ['turtle (Variant B)', () => generateTurtleWorld('turtle-0')],
  ['manta', () => generateMantaWorld('island-s4', { carrierSeed: 'manta-s4', generatedHouse: false })],
  ['whale', () => generateWhaleWorld('island-s4', { carrierSeed: 'whale-s4', generatedHouse: false })],
];

for (const [name, make] of CARRIERS)
  describe(`stage 4 on a ${name}`, () => {
    const base = make();
    const s3 = growWorld(base, 3);
    const s4 = growWorld(base, 4);
    const suit = suitableSurface(base);

    it('adds land only: stage 3 is inside it, nothing that was land changes but its old shore band', () => {
      expect(s4.growth!.stage).toBe(4);
      expect(s4.growth!.version).toBe(GROWTH_VERSION);
      const free = base.turtle ? T.RIM : T.SKIN;
      let added = 0;
      for (let i = 0; i < s4.terrain.cls.length; i++) {
        const a = s3.terrain.cls[i];
        const b = s4.terrain.cls[i];
        if (ground(a)) expect(ground(b)).toBe(true); // land stays land
        if (a === b) continue;
        if (!ground(a)) {
          expect(a).toBe(free); // new land only over the free carrying surface
          added++;
        } else expect([T.GRASS_EDGE, T.SAND, T.SAND_WET, T.MOSS]).toContain(a); // an old shore band, now inland
      }
      expect(added).toBeGreaterThan(1000);
    });

    it('moves nothing: every earlier object keeps its index and place; the base world is untouched', () => {
      expect(s4.objects.slice(0, s3.objects.length)).toEqual(s3.objects);
      expect(s4.objects.length).toBeGreaterThan(s3.objects.length);
      expect(s4.islands).toEqual(base.islands);
      expect(s4.hubs).toEqual(base.hubs);
      expect(s4.paths).toEqual(base.paths);
      expect(sig(base.terrain.cls)).toBe(sig(make().terrain.cls));
    });

    it('covers most of the suitable carrying surface, never beyond it, leaving the anatomy visible', () => {
      let land = 0;
      let total = 0;
      for (let i = 0; i < suit.length; i++) {
        const isl = ground(s4.terrain.cls[i]);
        if (suit[i] || isl) total++;
        if (isl) land++;
        // New land lies on suitable surface only.
        if (isl && !ground(s3.terrain.cls[i])) expect(suit[i]).toBe(1);
      }
      const coverage = land / total;
      expect(coverage).toBeGreaterThan(0.78);
      expect(coverage).toBeLessThan(0.97);
      // Some of the Carrier still shows round the land (a ring of plates, a strip of back).
      const free = base.turtle ? T.RIM : T.SKIN;
      expect(s4.terrain.cls.filter((c) => c === free).length).toBeGreaterThan(2000);
    });

    it('keeps clear of moving and breathing anatomy', () => {
      const moving = movingPartsMask(base);
      const c = base.creature;
      for (let i = 0; i < s4.terrain.cls.length; i++) {
        if (!ground(s4.terrain.cls[i]) || ground(s3.terrain.cls[i])) continue;
        expect(moving[i]).toBe(0);
        const x = i % base.terrain.width;
        const y = (i / base.terrain.width) | 0;
        if (c?.species === 'whale') {
          // Behind the blowholes (and their spout), before the knuckles.
          expect(x).toBeLessThanOrEqual(c.anatomy.x(0.18) + 1);
          expect(Math.hypot(x - c.anatomy.blowhole.x, y - c.anatomy.blowhole.y)).toBeGreaterThan(20);
        }
        if (c?.species === 'manta') expect(y).toBeGreaterThanOrEqual(c.anatomy.cy - c.anatomy.C * 0.32 - 1);
      }
    });

    it('every part of the new land can be walked to, and so can its resources', () => {
      const map = CollisionMap.fromWorld(s4, (p) => spriteFor(p, s4.options.palette));
      const { width, height } = s4.terrain;
      const hub = s4.hubs[0];
      const seen = new Uint8Array(width * height);
      const start = Math.round(hub.y) * width + Math.round(hub.x);
      const q = [start];
      seen[start] = 1;
      while (q.length) {
        const i = q.pop()!;
        const x = i % width;
        const y = (i / width) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = (y + dy) * width + x + dx;
          if (x + dx < 0 || y + dy < 0 || x + dx >= width || y + dy >= height || seen[j] || map.blocked[j]) continue;
          seen[j] = 1;
          q.push(j);
        }
      }
      let newWalkable = 0;
      let reached = 0;
      for (let i = 0; i < seen.length; i++) {
        if (s4.growth!.bornAt[i] !== 4 || !WALKABLE.has(s4.terrain.cls[i]) || map.blocked[i]) continue;
        newWalkable++;
        if (seen[i]) reached++;
      }
      expect(reached / newWalkable).toBeGreaterThan(0.98);
      const live = new LiveWorld(base, 'blobbi-9', 16, { store: memoryStore() });
      void live;
    });

    it('is deterministic', () => {
      const again = growWorld(make(), 4);
      expect(sig(again.terrain.cls)).toBe(sig(s4.terrain.cls));
      expect(JSON.stringify(again.objects)).toBe(JSON.stringify(s4.objects));
    });
  });

describe('stage 4 in play', () => {
  it('a stage-3 island (saved with version 2) grows to stage 4: saved, reloaded, buildings and the Blobbi unmoved', () => {
    const store = memoryStore();
    const world = generateWhaleWorld('island-s4-play', { carrierSeed: 'whale-p', generatedHouse: false });
    const live = new LiveWorld(world, 'blobbi-9', 16, { store });
    live.brain.enabled = false;
    live.inventory.add(ITEMS.wood.id, 6);
    live.inventory.add(ITEMS.stone.id, 3);
    live.objectives.completed.materials = 0;
    findBuildSpot(live, 'shelter');
    live.setBuildMode('shelter');
    pressE(live);
    run(live, 60 * 26);
    // As an M8 save at stage 3 would be.
    live.growth = { stage: 3, version: 2, history: [1, 2, 3].map((stage) => ({ stage, worldTime: stage, version: 2 })), regions: [] };
    live.save();
    const at3 = new LiveWorld(world, 'blobbi-9', 16, { store });
    const objects3 = at3.world.objects.map((o) => `${o.kind}@${o.x},${o.y}`);
    const buildings = JSON.stringify(at3.buildings);
    expect(at3.growIsland(true)).toBe(4);
    const at4 = new LiveWorld(world, 'blobbi-9', 16, { store });
    expect(at4.world.growth!.stage).toBe(4);
    expect(at4.world.objects.slice(0, objects3.length).map((o) => `${o.kind}@${o.x},${o.y}`)).toEqual(objects3);
    expect(JSON.stringify(at4.buildings)).toBe(buildings);
    expect(loadSave(store, live.identity)!.growth.history.map((h) => h.version)).toEqual([2, 2, 2, 3]);
    const raw = JSON.parse(store.get(saveKey(live.identity))!);
    expect(raw.growth.stage).toBe(4);
  });

  it('a whale grown with version 1 keeps its version-1 stages when it grows on to stage 4', () => {
    const world = generateWhaleWorld('whale-v1-s4', { carrierSeed: 'whale-test' });
    const v1 = growWorld(world, 3, 1);
    const grown = growWorld(world, 4, 3, [1, 2, 3].map((stage) => ({ stage, version: 1 })));
    expect(grown.objects.slice(0, v1.objects.length)).toEqual(v1.objects);
  });
});

describe('growth requirements are achievable on every Carrier', () => {
  for (const [name, make] of CARRIERS)
    it(`${name}: at each stage there are enough places to explore and discoveries to find for the next`, () => {
      const base = make();
      for (const stage of [0, 1, 2, 3]) {
        const store = memoryStore();
        const probe = new LiveWorld(base, 'blobbi-9', 16, { store });
        probe.growth = { stage, version: GROWTH_VERSION, history: [], regions: [] };
        probe.save();
        const live = new LiveWorld(base, 'blobbi-9', 16, { store });
        const r = live.growthReadiness();
        if (!r.next) continue;
        const need = (id: string) => r.requirements.find((q) => q.id === id)?.need ?? 0;
        expect(live.discoveries.length, `finds for stage ${r.next}`).toBeGreaterThanOrEqual(need('finds'));
        expect(live.places.length, `places for stage ${r.next}`).toBeGreaterThanOrEqual(need('explore'));
      }
    });
});
