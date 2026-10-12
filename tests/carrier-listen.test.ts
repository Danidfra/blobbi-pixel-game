/**
 * M10: the place to listen to the Carrier follows the island as it is now. At every growth stage (0–4) and on every
 * Carrier it is ground the Blobbi can stand on and walk to, right where the land meets the head, and listening
 * works there. A house or tree on the spot moves it to free ground nearby, not far inland.
 */
import { describe, expect, it } from 'vitest';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { LiveWorld } from '../src/sim/live-world';
import { memoryStore } from '../src/game/persistence';
import { pressE, run, stand } from '../src/dev/scripted-play';
import { WALKABLE, type WorldDescription } from '../src/world/types';

const CARRIERS: [string, () => WorldDescription][] = [
  ['turtle', () => generateTurtleWorld('island-listen', { turtleSeed: 't-listen', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false })],
  ['manta', () => generateMantaWorld('island-listen', { carrierSeed: 'm-listen', generatedHouse: false })],
  ['whale', () => generateWhaleWorld('island-listen', { carrierSeed: 'w-listen', generatedHouse: false })],
];

function atStage(base: WorldDescription, stage: number): LiveWorld {
  const store = memoryStore();
  if (stage) {
    const probe = new LiveWorld(base, 'blobbi-9', 16, { store });
    probe.growth = { stage, version: 3, history: [], regions: [] };
    probe.save();
  }
  const live = new LiveWorld(base, 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  return live;
}

/** Can the Blobbi walk from where it starts to (x, y)? A flood fill over the current navigation grid. */
function walkable(live: LiveWorld, x: number, y: number): boolean {
  const nav = live.nav;
  const from = nav.nearestFree(live.blobbi.x, live.blobbi.y, 6)!;
  const to = nav.nearestFree(x, y, 1);
  if (!to) return false;
  const seen = new Uint8Array(nav.cols * nav.rows);
  const q = [from.r * nav.cols + from.c];
  seen[q[0]] = 1;
  while (q.length) {
    const k = q.pop()!;
    if (k === to.r * nav.cols + to.c) return true;
    const c = k % nav.cols;
    const r = (k / nav.cols) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nk = (r + dr) * nav.cols + c + dc;
      if (!nav.isFree(c + dc, r + dr) || seen[nk]) continue;
      seen[nk] = 1;
      q.push(nk);
    }
  }
  return false;
}

/** Distance from the head to the first land on the line toward the island's centre (the shore in front of it). */
function shoreDistance(live: LiveWorld): number {
  const w = live.world;
  const head = (w.turtle?.head ?? w.creature?.head)!;
  const island = w.islands[0];
  for (let k = 0; k <= 1; k += 0.01) {
    const x = Math.round(head.cx + (island.cx - head.cx) * k);
    const y = Math.round(head.cy + (island.cy - head.cy) * k);
    if (WALKABLE.has(w.terrain.cls[y * w.terrain.width + x])) return Math.hypot(x - head.cx, y - head.cy);
  }
  return Infinity;
}

/** Facing the head from (x, y), as a player walking up to it would. */
function towardHead(live: LiveWorld, at: { x: number; y: number }): 'up' | 'down' | 'left' | 'right' {
  const head = (live.world.turtle?.head ?? live.world.creature?.head)!;
  const dx = head.cx - at.x;
  const dy = head.cy - at.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

for (const [name, make] of CARRIERS)
  describe(`listening to the ${name}`, () => {
    const base = make();
    const spots: { x: number; y: number }[] = [];

    for (const stage of [0, 1, 2, 3, 4])
      it(`stage ${stage}: the spot is free, reachable ground right where the land meets the head, and listening works`, () => {
        const live = atStage(base, stage);
        const s = live.listenSpot!;
        expect(s).not.toBeNull();
        spots[stage] = s;
        expect(live.collision.canStand(s.x, s.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(true);
        expect(walkable(live, s.x, s.y)).toBe(true);
        // On the land in front of the head: no further from the head than a short step past the current shore.
        const head = (live.world.turtle?.head ?? live.world.creature?.head)!;
        expect(Math.hypot(s.x - head.cx, s.y - head.cy)).toBeLessThan(shoreDistance(live) + 16);
        // The head place is at the spot (snapped to free ground when the spot never moved).
        const place = live.places.find((p) => p.id === 'head');
        if (place) expect(Math.hypot(place.x - s.x, place.y - s.y)).toBeLessThan(8);
        // Standing there, E listens (once whatever lies at its feet is picked up: as scripted play does).
        live.resources = live.resources.filter((n) => Math.hypot(n.x - s.x, n.y - s.y) > 20);
        stand(live, s.x, s.y, towardHead(live, s));
        expect(live.nearCarrier()).toBe(true);
        expect(String(live.prompt())).toMatch(/the Carrier/);
        const talked = live.tally.talked;
        pressE(live);
        run(live, 2);
        expect(live.tally.talked).toBe(talked + 1);
      });

    it('stage 0 keeps the spot an M9 island had (from the base world alone)', () => {
      const live = atStage(base, 0);
      expect(live.listenSpot).toEqual((live as unknown as { baseListenSpot: unknown }).baseListenSpot);
    });

    it('follows the land as it grows: never further from the head than before', () => {
      const head = (base.turtle?.head ?? base.creature?.head)!;
      const d = (s: { x: number; y: number }) => Math.hypot(s.x - head.cx, s.y - head.cy);
      for (let stage = 1; stage <= 4; stage++) if (spots[stage] && spots[stage - 1]) expect(d(spots[stage])).toBeLessThanOrEqual(d(spots[stage - 1]) + 0.5);
    });
  });

describe('something built on the listening spot', () => {
  it('moves the spot to free ground near the shore, still reachable, and listening still works', () => {
    const live = atStage(CARRIERS[0][1](), 0);
    const before = live.listenSpot!;
    // A bench from the bag (as the player places a crafted one).
    live.inventory.add('blobbi-pixel:furniture:bench', 1);
    // Build a bench over the spot: the first placement (in front of the Blobbi) that blocks it.
    let built = false;
    for (let r = 0; r < 40 && !built; r += 2)
      for (let k = 0; k < 16 && !built; k++) {
        const x = Math.round(before.x + Math.cos((k / 16) * Math.PI * 2) * r);
        const y = Math.round(before.y + Math.sin((k / 16) * Math.PI * 2) * r);
        if (!live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy)) continue;
        stand(live, x, y, 'down');
        const check = live.placementCheck('bench') as { ok: boolean; x0: number; y0: number; x1: number; y1: number };
        // Its footprint over the spot.
        if (!check.ok || before.x < check.x0 || before.x > check.x1 || before.y < check.y0 || before.y > check.y1) continue;
        live.startPlacing('blobbi-pixel:furniture:bench');
        built = !!live.placeFromBag();
      }
    expect(built).toBe(true);
    run(live, 60 * 6);
    expect(live.collision.canStand(before.x, before.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(false); // taken
    const after = live.listenSpot!;
    expect(live.collision.canStand(after.x, after.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(true);
    expect(walkable(live, after.x, after.y)).toBe(true);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(45);
    live.resources = live.resources.filter((n) => Math.hypot(n.x - after.x, n.y - after.y) > 20);
    stand(live, after.x, after.y, towardHead(live, after));
    expect(live.nearCarrier()).toBe(true);
    expect(String(live.prompt())).toMatch(/the Carrier/);
  });
});
