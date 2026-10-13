/**
 * M10 phase C: THE OCEAN-ACCESS INVARIANT. From its first growth (stage `OCEAN_ACCESS_STAGE`) every Carrier's island
 * — turtle, manta, whale, any seed — has a way to the sea: a shore spot connected on foot to the hub, open water in
 * front within the launch reach, room for the canoe clear of the Carrier's moving parts, a way out to open sea, and
 * a way back ashore. Guaranteed by the growth generator (the landing, world/landing.ts), never by a lucky seed, and
 * never over protected anatomy.
 */
import { describe, expect, it } from 'vitest';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { memoryStore } from '../src/game/persistence';
import { growWorld, suitableSurface, GROWTH_VERSION } from '../src/world/growth';
import { OCEAN_ACCESS_STAGE, protectedAnatomy } from '../src/world/landing';
import { ANATOMY_MARGIN, departs, findOceanAccess } from '../src/game/ocean-access';
import { CANOE, SeaNav, seaRegion } from '../src/game/canoe';
import { CANOE_ITEM } from '../src/content/tools';
import { movingPartsMask } from '../src/cinematic/sea';
import { worldBounds } from '../src/render/view-camera';
import { pressE, run, stand } from '../src/dev/scripted-play';
import { T, type WorldDescription } from '../src/world/types';

const CARRIERS: [string, (seed: string) => WorldDescription][] = [
  ['turtle', (s) => generateTurtleWorld(s, { turtleSeed: 't-' + s, shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false })],
  ['manta', (s) => generateMantaWorld(s, { carrierSeed: 'm-' + s, generatedHouse: false })],
  ['whale', (s) => generateWhaleWorld(s, { carrierSeed: 'w-' + s, generatedHouse: false })],
];
const SEEDS = ['access-a', 'access-b', 'access-c', 'access-d', 'access-e', 'access-f'];

function atStage(base: WorldDescription, stage: number): LiveWorld {
  const store = memoryStore();
  if (stage) {
    const probe = new LiveWorld(base, 'blobbi-9', 16, { store });
    probe.growth = { stage, version: GROWTH_VERSION, history: [], regions: [] };
    probe.save();
  }
  const live = new LiveWorld(base, 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  (live as unknown as { nearbyMarine: () => null }).nearbyMarine = () => null;
  return live;
}

const reachOf = (live: LiveWorld) => {
  const l = live as unknown as { reachability: (nav: unknown, hub: { x: number; y: number }) => (x: number, y: number) => boolean; islandNav: unknown };
  return l.reachability(l.islandNav, live.world.hubs[0] ?? { x: live.world.islands[0].cx, y: live.world.islands[0].cy });
};

describe('the ocean-access invariant', () => {
  for (const [name, make] of CARRIERS)
    it(`${name}: every seed has its landing from the first growth: on foot from the hub, launchable, clear of the anatomy, out to sea and back`, () => {
      for (const seed of SEEDS) {
        const base = make(seed);
        const mask = movingPartsMask(base);
        const guarded = protectedAnatomy(base);
        const sub = worldBounds(base).subject!;
        const nav = new SeaNav(base, seaRegion(sub), mask);
        const { width } = base.terrain;
        const v3 = growWorld(base, OCEAN_ACCESS_STAGE, 3);
        for (const stage of [OCEAN_ACCESS_STAGE, 4]) {
          const live = atStage(base, stage);
          const where = `${name} ${seed} stage ${stage}`;
          const landing = live.world.growth?.landing;
          expect(landing, where).toBeTruthy();
          // 1, 2: a standable shore spot, connected on foot to the hub.
          const at = live.landingStand()!;
          expect(live.collision.canStand(at.x, at.y, live.blobbi.footRx, live.blobbi.footRy), where).toBe(true);
          expect(reachOf(live)(at.x, at.y), where).toBe(true);
          // 3, 4: facing the water there, the canoe launches (the game's own rule), and its hull fits, clear of moving
          // parts by the margin.
          live.inventory.add(CANOE_ITEM.id, 1);
          stand(live, at.x, at.y, at.heading);
          const spot = live.launchSpot();
          expect(spot, where).not.toBeNull();
          expect(nav.canFloat(spot!.x, spot!.y, spot!.heading)).toBe(true);
          const along = spot!.heading === 'left' || spot!.heading === 'right';
          const hx = (along ? CANOE.halfLength : CANOE.halfBeam) + ANATOMY_MARGIN;
          const hy = (along ? CANOE.halfBeam : CANOE.halfLength) + ANATOMY_MARGIN;
          for (let dy = -hy; dy <= hy; dy++)
            for (let dx = -hx; dx <= hx; dx++) {
              const px = spot!.x + dx;
              const py = spot!.y + dy;
              if (px >= 0 && py >= 0 && px < width && py < base.terrain.height) expect(mask[py * width + px], where).toBe(0);
            }
          // 5: a way out past the Carrier's outline into open sea.
          expect(departs(nav, sub, spot!.x, spot!.y), where).toBe(true);
          // 6: launched, boarded, and straight back ashore onto reachable ground.
          live.resources = [];
          for (const d of live.discoveries) if (Math.hypot(d.x - at.x, d.y - at.y) < 30) live.found.add(d.id);
          pressE(live);
          expect(live.boat, where).not.toBeNull();
          pressE(live);
          run(live, 40);
          expect(live.boat!.aboard, where).toBe(true);
          expect(live.landingSpot(), where).not.toBeNull();
          live.update(1 / 60, { ...IDLE_INPUT, interact: true });
          run(live, 40);
          expect(live.boat!.aboard, where).toBe(false);
          expect(reachOf(live)(live.blobbi.x, live.blobbi.y), where).toBe(true);
          // 7: the landing never lies on protected anatomy or a moving part, and only on the carrying surface.
          if (stage === OCEAN_ACCESS_STAGE) {
            const free = base.turtle ? T.RIM : T.SKIN;
            let added = 0;
            for (let i = 0; i < v3.terrain.cls.length; i++) {
              if (v3.terrain.cls[i] === live.world.terrain.cls[i] || v3.terrain.cls[i] !== free) continue;
              added++;
              expect(mask[i], where).toBe(0);
              expect(guarded(i % width, Math.floor(i / width)), where).toBe(false);
            }
            expect(added, where).toBeGreaterThan(0);
          }
          // The general analysis agrees (it knows nothing of the landing).
          const { footRx, footRy } = live.blobbi;
          expect(findOceanAccess({ width, height: base.terrain.height, canStand: (x, y) => live.islandCollision.canStand(x, y, footRx, footRy), reach: reachOf(live), nav: live.seaNav(), subject: sub, anatomy: mask }).length, where).toBe(1);
        }
      }
    }, 300_000);

  it('a young island (stage 0) may not reach the sea yet; the landing is planned only from the first growth', () => {
    const base = CARRIERS[1][1]('access-a');
    expect(growWorld(base, 0).growth).toBeUndefined();
    expect(growWorld(base, 1).growth!.landing).toBeTruthy();
    // Deterministic: the same seed, the same landing.
    expect(JSON.stringify(growWorld(base, 1).growth!.landing)).toBe(JSON.stringify(growWorld(base, 3).growth!.landing));
  });

  it('a manta landing keeps to its flanks: never on its head-to-tail axis or its beating wings', () => {
    for (const seed of SEEDS) {
      const base = CARRIERS[1][1](seed);
      const m = base.creature!.species === 'manta' ? base.creature!.anatomy : null;
      const l = growWorld(base, 1).growth!.landing!;
      expect(Math.abs(l.tip.x + 0.5 - m!.cx)).toBeGreaterThanOrEqual(m!.S * 0.3);
      const suit = suitableSurface(base);
      void suit;
    }
  });

  it('a whale landing is between its blowholes and its knuckles (never at the head or the tail)', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const base = CARRIERS[2][1](seed);
      const l = growWorld(base, 1).growth!.landing!;
      const range = base.creature!.species === 'whale' ? base.creature!.growRange : null;
      expect(l.tip.x).toBeGreaterThanOrEqual(range!.x0);
      expect(l.tip.x).toBeLessThanOrEqual(range!.x1);
    }
  });
});
