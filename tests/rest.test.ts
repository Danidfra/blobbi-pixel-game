/**
 * M9 rest: R sends the Blobbi to bed — home through its door when outside, to the nearest bed it can reach inside,
 * a little climb in, tucked under the blanket, a climb out when it wakes or is called away. No home or no bed: a nap
 * where it stands. Nothing teleports: every move is a walk, the door transition or a short climb.
 */
import { describe, expect, it } from 'vitest';
import { LiveWorld, CLIMB_SECONDS } from '../src/sim/live-world';
import { loadSave, memoryStore } from '../src/game/persistence';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateMantaWorld } from '../src/carriers/manta-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { findBuildSpot, pressE, run } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { doorSpot, type Building } from '../src/game/buildings';
import { LiveRenderer } from '../src/render/live-render';
import { InteriorRenderer } from '../src/render/interior-render';
import { DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { hash32 } from '../src/core/rng';
import type { CarrierKind } from '../src/game/carrier';

const island = (kind: CarrierKind, seed = 'island-rest-1') =>
  kind === 'manta' ? generateMantaWorld(seed, { carrierSeed: 'm', generatedHouse: false }) : kind === 'whale' ? generateWhaleWorld(seed, { carrierSeed: 'w', generatedHouse: false }) : generateTurtleWorld(seed, { turtleSeed: 't', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });

function withHome(kind: CarrierKind, store = memoryStore()) {
  const live = new LiveWorld(island(kind), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  live.inventory.add(ITEMS.wood.id, 6);
  live.inventory.add(ITEMS.stone.id, 3);
  live.objectives.completed.materials = 0;
  if (!findBuildSpot(live, 'shelter')) throw new Error('no spot');
  live.setBuildMode('shelter');
  pressE(live);
  run(live, 60 * 26);
  const home = live.home()!;
  return { live, home, store };
}

/** Walk a few steps away from the door so the Blobbi has a way to go home. */
function stepAway(live: LiveWorld, home: Building): void {
  const d = doorSpot(home, live.blobbi.footRy);
  for (const [dx, dy] of [[0, 30], [30, 20], [-30, 20], [0, 20]]) {
    if (live.collision.canStand(d.x + dx, d.y + dy, live.blobbi.footRx, live.blobbi.footRy)) {
      live.blobbi.x = d.x + dx;
      live.blobbi.y = d.y + dy;
      return;
    }
  }
}

/** Run until `done` or `max` frames; returns whether it happened. Records the largest single-frame jump. */
function until(live: LiveWorld, done: () => boolean, max = 60 * 40): { ok: boolean; jump: number } {
  let jump = 0;
  for (let i = 0; i < max; i++) {
    if (done()) return { ok: true, jump };
    const was = { x: live.blobbi.x, y: live.blobbi.y, inside: live.inside };
    run(live, 1);
    if (was.inside === live.inside) jump = Math.max(jump, Math.hypot(live.blobbi.x - was.x, live.blobbi.y - was.y));
  }
  return { ok: done(), jump };
}

describe('resting in bed', () => {
  for (const kind of ['turtle', 'manta', 'whale'] as const)
    it(`${kind}: R outside walks home, goes in by the door, climbs into bed and sleeps there`, () => {
      const { live, home } = withHome(kind);
      stepAway(live, home);
      const energy = (live.care.energy = 30);
      live.rest();
      expect(live.restPlan?.phase).toBe('home');
      const r = until(live, () => live.restPlan?.phase === 'in-bed');
      expect(r.ok).toBe(true);
      expect(r.jump).toBeLessThan(3); // walked and climbed, never a jump cut
      expect(live.inside).toBe(true);
      const bed = live.inBed()!.bed;
      expect(bed.kind).toBe('bed');
      expect(live.inBed()!.tucked).toBe(true);
      expect(Math.hypot(live.blobbi.x - bed.x, live.blobbi.y - bed.y)).toBeLessThan(4); // ON the bed, not below it
      expect(live.blobbi.animator.state.sleeping).toBe(true);
      expect(live.brain.restAtShelter).toBe(true);
      run(live, 60 * 10);
      expect(live.care.energy).toBeGreaterThan(energy); // the existing needs system: a sheltered rest
      expect(live.restPlan?.phase).toBe('in-bed');
    });

  it('R inside goes to the bed, not below it; R again climbs out to stand in front of it', () => {
    const { live, home } = withHome('whale');
    live.enterInterior(home);
    run(live, 2);
    live.rest();
    expect(until(live, () => live.restPlan?.phase === 'in-bed').ok).toBe(true);
    const bed = live.inBed()!.bed;
    live.rest(); // wake
    expect(until(live, () => live.restPlan === null, 120).ok).toBe(true);
    const at = live.bedApproach(bed);
    expect(Math.hypot(live.blobbi.x - at.x, live.blobbi.y - at.y)).toBeLessThan(4);
    expect(live.collision.canStand(live.blobbi.x, live.blobbi.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(true);
    expect(live.blobbi.animator.state.sleeping).toBe(false);
  });

  it('the climb in takes a short moment (a hop, not a cut)', () => {
    const { live, home } = withHome('turtle');
    live.enterInterior(home);
    run(live, 2);
    live.rest();
    until(live, () => live.restPlan?.phase === 'climb-in');
    const frames = until(live, () => live.restPlan?.phase === 'in-bed', 120);
    expect(frames.ok).toBe(true);
    expect(frames.jump).toBeLessThan(2);
    void CLIMB_SECONDS;
  });

  it('chooses the nearest reachable bed (a Blobbi cushion counts); re-plans when the bed is moved on the way', () => {
    const { live, home } = withHome('manta');
    const st = live.interiorOf(home);
    live.enterInterior(home);
    run(live, 2);
    // A cushion right by the door.
    st.furniture.push({ id: 'pet-bed:0', kind: 'pet-bed', x: live.blobbi.x + 18, y: live.blobbi.y - 14, placedAt: 0, seed: 's' });
    live.rest();
    expect(live.restPlan?.bedId).toBe('pet-bed:0');
    // Moved while it walks: it goes to the new place.
    run(live, 10);
    const cushion = st.furniture.find((f) => f.id === 'pet-bed:0')!;
    cushion.x -= 30;
    expect(until(live, () => live.restPlan?.phase === 'in-bed').ok).toBe(true);
    expect(live.inBed()!.bed.id).toBe('pet-bed:0');
    expect(Math.abs(live.blobbi.x - cushion.x)).toBeLessThan(3);
  });

  it('no home: a nap where it stands; no bed: a nap on the floor', () => {
    const live = new LiveWorld(island('turtle'), 'blobbi-9', 16, { store: memoryStore() });
    live.brain.enabled = false;
    const at = { x: live.blobbi.x, y: live.blobbi.y };
    live.rest();
    expect(live.brain.state).toBe('rest');
    expect(live.restPlan).toBeNull();
    run(live, 30);
    expect(Math.hypot(live.blobbi.x - at.x, live.blobbi.y - at.y)).toBeLessThan(1);
    const { live: l2, home } = withHome('whale');
    l2.interiorOf(home).furniture = l2.interiorOf(home).furniture.filter((f) => f.kind !== 'bed');
    l2.enterInterior(home);
    run(l2, 2);
    l2.rest();
    expect(l2.restPlan).toBeNull();
    expect(l2.brain.state).toBe('rest');
  });

  it('a key on the way home ends the plan (no surprise trip indoors later)', () => {
    const { live, home } = withHome('turtle');
    stepAway(live, home);
    live.rest();
    run(live, 10);
    live.update(1 / 60, { up: false, down: true, left: false, right: false, interact: false, plant: false });
    run(live, 60 * 8);
    expect(live.restPlan).toBeNull();
    expect(live.inside).toBe(false);
  });

  it('a key in bed: it climbs out first, then walks', () => {
    const { live, home } = withHome('whale');
    live.enterInterior(home);
    run(live, 2);
    live.rest();
    until(live, () => live.restPlan?.phase === 'in-bed');
    live.update(1 / 60, { up: false, down: true, left: false, right: false, interact: false, plant: false });
    expect(['climb-out', null]).toContain(live.restPlan?.phase ?? null);
    expect(until(live, () => live.restPlan === null, 120).ok).toBe(true);
  });

  it('saving in bed and reloading: the rest is not kept (the Blobbi starts awake outside); its needs are', () => {
    const store = memoryStore();
    const { live, home } = withHome('turtle', store);
    live.enterInterior(home);
    run(live, 2);
    live.rest();
    until(live, () => live.restPlan?.phase === 'in-bed');
    live.care.energy = 55;
    live.save();
    expect(loadSave(store, live.identity)!.care.energy).toBe(55);
    const again = new LiveWorld(island('turtle'), 'blobbi-9', 16, { store });
    expect(again.inside).toBe(false);
    expect(again.restPlan).toBeNull();
    expect(again.collision.canStand(again.blobbi.x, again.blobbi.y, again.blobbi.footRx, again.blobbi.footRy)).toBe(true);
  });

  it('tucked in: the blanket is drawn over the Blobbi', () => {
    const { live, home } = withHome('turtle');
    live.enterInterior(home);
    run(live, 2);
    live.rest();
    until(live, () => live.restPlan?.phase === 'in-bed');
    const r = new InteriorRenderer(live);
    void LiveRenderer;
    const tucked = r.render(160, 120, 0, 0, live.clock.time, DEFAULT_LIVE_OPTIONS).clone();
    const plan = live.restPlan!;
    plan.phase = 'climb-out'; // the same spot, not tucked
    plan.t0 = live.clock.time;
    const sitting = r.render(160, 120, 0, 0, live.clock.time, DEFAULT_LIVE_OPTIONS).clone();
    const h = (b: { data: Uint32Array }) => hash32(Array.from(b.data, (v) => v.toString(36)).join(','));
    expect(h(tucked)).not.toBe(h(sitting));
  });
});

describe('the prompt in bed', () => {
  it('says how to wake up', () => {
    const { live, home } = withHome('turtle');
    live.enterInterior(home);
    run(live, 2);
    live.rest();
    until(live, () => live.restPlan?.phase === 'in-bed');
    expect(live.prompt()).toBe('R  wake up');
  });
});
