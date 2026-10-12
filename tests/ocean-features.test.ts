/**
 * M10 phase B: a few light things out on the sea — a bottle adrift (a new spot each day until it is found), the kelp
 * garden (seaweed, back in a day), the silver shoal (dawn and dusk) — on water the canoe can reach, deterministic,
 * never missable; and fishing variety: coastal and open-water fish, by day and by night, and a fish log.
 */
import { describe, expect, it } from 'vitest';
import { LiveWorld, IDLE_INPUT } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { memoryStore } from '../src/game/persistence';
import { DAY_SECONDS, hourAt } from '../src/game/daylight';
import { FEATURE_REACH, KELP_REGROW_SECONDS, OceanFeatures } from '../src/game/ocean-features';
import { FISH_CONTENT, SEAWEED_ITEM } from '../src/content/tools';
import { CANOE } from '../src/game/canoe';
import { worldBounds } from '../src/render/view-camera';
import type { WorldDescription } from '../src/world/types';

const CARRIERS: [string, (seed: string) => WorldDescription][] = [
  ['turtle', (s) => generateTurtleWorld(s, { turtleSeed: 't-' + s, shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false })],
  ['manta', (s) => generateMantaWorld(s, { carrierSeed: 'm-' + s, generatedHouse: false })],
  ['whale', (s) => generateWhaleWorld(s, { carrierSeed: 'w-' + s, generatedHouse: false })],
];

const quiet = (world: WorldDescription, store = memoryStore()) => {
  const live = new LiveWorld(world, 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  (live as unknown as { nearbyMarine: () => null }).nearbyMarine = () => null;
  return live;
};

/** Put the Blobbi, in its canoe, right by (x, y) (a test shortcut for a long paddle). */
function afloatAt(live: LiveWorld, x: number, y: number) {
  live.boat = { x, y: y + 6, heading: 'right', vx: 0, vy: 0, aboard: true };
  live.blobbi.x = x;
  live.blobbi.y = y + 6 + 4;
}

describe('ocean features', () => {
  for (const [name, make] of CARRIERS)
    it(`${name}: on canoe water away from the island and the edge, deterministic, the bottle somewhere new each day`, () => {
      const live = quiet(make('of-1'));
      const nav = live.seaNav();
      const sub = worldBounds(live.world).subject!;
      const spots = new Set<string>();
      for (let day = 0; day < 6; day++) {
        const fs = live.ocean().at(day * DAY_SECONDS + 300, false);
        const bottle = fs.find((f) => f.kind === 'bottle');
        const kelp = fs.find((f) => f.kind === 'kelp');
        expect(kelp, `${name} day ${day}`).toBeTruthy();
        if (bottle) spots.add(`${Math.round(bottle.x / 20)},${Math.round(bottle.y / 20)}`);
        for (const f of fs) {
          expect(nav.water(f.x, f.y)).toBe(true);
          expect(nav.edge(f.x, f.y)).toBe(0);
          expect(f.x < sub.x0 - 20 || f.x > sub.x1 + 20 || f.y < sub.y0 - 20 || f.y > sub.y1 + 20).toBe(true);
        }
      }
      expect(spots.size).toBeGreaterThan(2);
      // The same world, the same sea.
      const again = new OceanFeatures(live.world.seed, nav, sub);
      expect(JSON.stringify(again.at(4321, false))).toBe(JSON.stringify(live.ocean().at(4321, false)));
    });

  it('the shoal gathers only at dawn and dusk', () => {
    const live = quiet(CARRIERS[0][1]('of-2'));
    for (let t = 0; t < DAY_SECONDS * 2; t += 15) {
      const shoal = live.ocean().at(t, false).some((f) => f.kind === 'shoal');
      const h = hourAt(t);
      expect(shoal).toBe((h >= 5 && h < 7.5) || (h >= 17.5 && h < 20));
    }
  });

  it('from the canoe: the bottle is fished out (a discovery, then gone); the kelp gives seaweed and grows back in a day', () => {
    const live = quiet(CARRIERS[1][1]('of-3'));
    const fs = live.oceanNow();
    const bottle = fs.find((f) => f.kind === 'bottle')!;
    afloatAt(live, bottle.x, bottle.y);
    expect(live.nearbyFeature()?.kind).toBe('bottle');
    expect(live.prompt()).toBe('E  fish out the bottle');
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    expect(live.found.has('sea:bottle-adrift')).toBe(true);
    expect(live.oceanNow().some((f) => f.kind === 'bottle')).toBe(false);
    const kelp = live.oceanNow().find((f) => f.kind === 'kelp')!;
    afloatAt(live, kelp.x, kelp.y);
    expect(live.prompt()).toBe('E  gather seaweed');
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    expect(live.inventory.count(SEAWEED_ITEM.id)).toBe(3);
    expect(live.found.has('sea:kelp-garden')).toBe(true);
    expect(live.kelpReady()).toBe(false);
    expect(live.prompt()).toBe('the kelp is growing back');
    live.timeOffset += KELP_REGROW_SECONDS;
    expect(live.kelpReady()).toBe(true);
    // Too far: nothing to reach.
    afloatAt(live, kelp.x + FEATURE_REACH * 3, kelp.y);
    expect(live.nearbyFeature()?.kind ?? null).not.toBe('kelp');
  });

  it('what was found and gathered is saved; the sea itself is not', () => {
    const store = memoryStore();
    const live = quiet(CARRIERS[2][1]('of-4'), store);
    const bottle = live.oceanNow().find((f) => f.kind === 'bottle')!;
    afloatAt(live, bottle.x, bottle.y);
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    live.save();
    const again = quiet(CARRIERS[2][1]('of-4'), store);
    expect(again.found.has('sea:bottle-adrift')).toBe(true);
    expect(again.oceanNow().some((f) => f.kind === 'bottle')).toBe(false);
    void CANOE;
  });
});

describe('fishing variety', () => {
  it('a small set: coastal by day, open water any time, a rare night fish; ponds keep theirs', () => {
    expect(FISH_CONTENT.length).toBe(7);
    const by = (id: string) => FISH_CONTENT.find((f) => f.item.id === `blobbi-pixel:food:${id}`)!;
    expect(by('flounder')).toMatchObject({ region: 'coast', time: 'day' });
    expect(by('mackerel')).toMatchObject({ region: 'open' });
    expect(by('moonfish')).toMatchObject({ region: 'open', time: 'night' });
    expect(by('pond-perch').water).toBe('pond');
  });

  it('what bites depends on where and when; the fish log records each new kind', () => {
    const live = quiet(CARRIERS[0][1]('fv-1'));
    live.inventory.add('blobbi-pixel:tool:fishing-rod', 1);
    live.equip('blobbi-pixel:tool:fishing-rod');
    const caught = new Set<string>();
    let logged = false;
    // Many casts from the canoe in open water, at noon and at midnight.
    const r = live.seaNav().region;
    afloatAt(live, r.x0 + CANOE.band + 30, r.y0 + CANOE.band + 30);
    for (const [label, hour] of [['day', 12], ['night', 0]] as const) {
      live.timeOffset = (((hour - 7 + 24) % 24) / 24) * DAY_SECONDS + DAY_SECONDS * 3;
      for (let i = 0; i < 40; i++) {
        live.blobbi.animator.state.direction = 'down';
        live.fishing = null;
        live.update(1 / 60, { ...IDLE_INPUT, interact: true });
        // (Read through a cast: TypeScript narrowed it to the null assigned above.)
        const f = live.fishing as LiveWorld['fishing'];
        if (!f) continue;
        expect(live.seaRegionAt(f.x, f.y)).toBe('open');
        (live.clock as { time: number }).time = f.biteAt + 0.1;
        live.update(1 / 60, { ...IDLE_INPUT, interact: true });
        for (const id of live.caught) caught.add(`${label}:${id.split(':').pop()}`);
        logged ||= live.notices.some((n) => n.heading === 'Fish log');
      }
    }
    // Open water: never the coastal flounder or the pond perch; the moonfish only at night.
    expect([...caught].some((c) => c.endsWith('flounder'))).toBe(false);
    expect([...caught].some((c) => c.endsWith('pond-perch'))).toBe(false);
    expect(caught.has('day:moonfish')).toBe(false);
    expect([...caught].some((c) => c.endsWith('mackerel'))).toBe(true);
    expect(live.caught.size).toBeGreaterThanOrEqual(2);
    expect(logged).toBe(true);
  });
});
