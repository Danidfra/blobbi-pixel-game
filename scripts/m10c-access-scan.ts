/**
 * M10 phase C: the ocean-access invariant over many seeds. For every Carrier and seed, at stage 0 (before growth)
 * and at stages 1 and 4: whether the island has a way to the sea by the general analysis (src/game/ocean-access.ts),
 * and whether its landing works by the game's own rules (stand, reach from the hub, launch, open sea beyond).
 *   npx tsx scripts/m10c-access-scan.ts [seeds=30] [carrier]
 */
import { LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { memoryStore } from '../src/game/persistence';
import { departs, findOceanAccess } from '../src/game/ocean-access';
import { worldBounds } from '../src/render/view-camera';
import { movingPartsMask } from '../src/cinematic/sea';
import { CANOE_ITEM } from '../src/content/tools';
import { stand } from '../src/dev/scripted-play';
import { GROWTH_VERSION } from '../src/world/growth';
import type { WorldDescription } from '../src/world/types';

const CARRIERS: [string, (seed: string) => WorldDescription][] = [
  ['turtle', (s) => generateTurtleWorld(s, { turtleSeed: 't-' + s, shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false })],
  ['manta', (s) => generateMantaWorld(s, { carrierSeed: 'm-' + s, generatedHouse: false })],
  ['whale', (s) => generateWhaleWorld(s, { carrierSeed: 'w-' + s, generatedHouse: false })],
];
const n = Number(process.argv[2] ?? 30);
const only = process.argv[3];
for (const [name, make] of CARRIERS) {
  if (only && only !== name) continue;
  const count: Record<string, number> = {};
  const fails: string[] = [];
  for (let i = 0; i < n; i++) {
    const seed = `scan-${i}`;
    const base = make(seed);
    const mask = movingPartsMask(base);
    for (const stage of [0, 1, 4]) {
      const store = memoryStore();
      if (stage) {
        const probe = new LiveWorld(base, 'blobbi-9', 16, { store });
        probe.growth = { stage, version: GROWTH_VERSION, history: [], regions: [] };
        probe.save();
      }
      const live = new LiveWorld(base, 'blobbi-9', 16, { store });
      const l = live as unknown as { reachability: (nav: unknown, hub: { x: number; y: number }) => (x: number, y: number) => boolean; islandNav: unknown };
      const reach = l.reachability(l.islandNav, live.world.hubs[0] ?? { x: live.world.islands[0].cx, y: live.world.islands[0].cy });
      const sub = worldBounds(live.world).subject!;
      const general = findOceanAccess({ width: live.world.terrain.width, height: live.world.terrain.height, canStand: (x, y) => live.islandCollision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy), reach, nav: live.seaNav(), subject: sub, anatomy: mask }).length > 0;
      let landing = false;
      const at = live.landingStand();
      if (at && live.collision.canStand(at.x, at.y, live.blobbi.footRx, live.blobbi.footRy) && reach(at.x, at.y)) {
        live.inventory.add(CANOE_ITEM.id, 1);
        stand(live, at.x, at.y, at.heading);
        const spot = live.launchSpot();
        landing = !!spot && departs(live.seaNav(), sub, spot.x, spot.y);
      }
      count[`s${stage} general`] = (count[`s${stage} general`] ?? 0) + (general ? 1 : 0);
      count[`s${stage} landing`] = (count[`s${stage} landing`] ?? 0) + (landing ? 1 : 0);
      if (stage && !(general && landing)) fails.push(`${seed} stage ${stage}${general ? '' : ' (no access)'}${landing ? '' : ' (landing fails)'}`);
    }
  }
  console.log(`${name} (${n} seeds): ${Object.entries(count).map(([k, v]) => `${k} ${v}/${n}`).join(', ')}`);
  for (const f of fails) console.log(`  FAIL ${f}`);
}
