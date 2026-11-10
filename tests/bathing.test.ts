/**
 * BATHING (Living Home, phase 1), and the furniture-occupation mechanism it is built on: E at the washing tub hops
 * the Blobbi into the water (a hop, never a cut), where it soaks with splashes and a slow bob, its lower body behind
 * the tub's water line; the wash lands at the end, with its joy, a word and a shake-dry hop out to where it stood or
 * the nearest free ground. A key, E, R, a menu that arranges things, or the tub moved from under it get it out
 * again, unwashed and never stuck; indoors and out, in the room renderer and the multi-scale view; a reload starts
 * standing; the same every run.
 */
import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, LiveWorld } from '../src/sim/live-world';
import { BATH_SECONDS, OCCUPANCY, occupantSpot } from '../src/game/furniture-use';
import { frontOf } from '../src/render/occupant-render';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { memoryStore } from '../src/game/persistence';
import { ALL_PLACEABLE_KINDS, BUILDINGS, BUILDING_KINDS, buildingSprite, type Building } from '../src/game/buildings';
import { CLEAN, JOY } from '../src/game/care';
import { paletteFor } from '../src/world/generate';
import { InteriorRenderer } from '../src/render/interior-render';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer } from '../src/render/view-renderer';
import { findBuildSpot, pressE, run, stand } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { t as lang } from '../src/i18n';

const E = { ...IDLE_INPUT, interact: true };
const step = (live: LiveWorld, n = 1, input = IDLE_INPUT) => {
  for (let i = 0; i < n; i++) live.update(1 / 60, input);
};
const untilDone = (live: LiveWorld, max = 60 * 8) => {
  for (let i = 0; i < max && live.occupation; i++) live.update(1 / 60, IDLE_INPUT);
};
const untilPhase = (live: LiveWorld, phase: string, max = 60 * 8) => {
  for (let i = 0; i < max && live.occupation?.phase !== phase; i++) live.update(1 / 60, IDLE_INPUT);
};
const standable = (live: LiveWorld) => live.collision.canStand(live.blobbi.x, live.blobbi.y, live.blobbi.footRx, live.blobbi.footRy);
const approach = (live: LiveWorld, f: Building) => ({ x: f.x, y: f.y + BUILDINGS[f.kind].footRy + live.blobbi.footRy + 2 });
const face = (live: LiveWorld, f: Building) => {
  const at = approach(live, f);
  stand(live, at.x, at.y, 'up');
  expect(live.facingBuilding()?.id).toBe(f.id);
  live.bubble = null;
};

/** A quiet island with a finished shelter; the Blobbi outside its door. */
const stores = new WeakMap<LiveWorld, ReturnType<typeof memoryStore>>();
function island(seed = 'occupy-1') {
  const store = memoryStore();
  const live = new LiveWorld(generateWhaleWorld(seed, { carrierSeed: 'w', generatedHouse: false }), 'blobbi-9', 16, { store });
  stores.set(live, store);
  live.brain.enabled = false;
  live.weather = 'dry';
  live.resources = [];
  live.inventory.add(ITEMS.wood.id, 6);
  live.inventory.add(ITEMS.stone.id, 3);
  live.objectives.completed.materials = 0;
  expect(findBuildSpot(live, 'shelter')).toBe(true);
  live.setBuildMode('shelter');
  pressE(live);
  run(live, 60 * 26);
  live.bubble = null;
  return live;
}
/** The same, inside its room. */
function room(seed = 'occupy-1') {
  const live = island(seed);
  expect(live.enterInterior(live.home()!)).toBe(true);
  live.brain.enabled = false;
  run(live, 100);
  live.bubble = null;
  return live;
}
/** Place a piece from the bag: indoors just above the first of the spots given where it fits, outdoors away from the house. */
function place(live: LiveWorld, kind: string, spots?: readonly { x: number; y: number }[]): Building {
  const def = BUILDINGS[kind];
  live.inventory.add(def.item!, 1);
  if (spots) {
    const at = spots.find((p) => {
      if (!live.collision.canStand(p.x, p.y, live.blobbi.footRx, live.blobbi.footRy)) return false;
      stand(live, p.x, p.y, 'up');
      return live.placementCheck(kind).ok;
    });
    expect(at, `a spot for the ${kind}`).toBeDefined();
  } else {
    const home = live.home()!;
    const n = live.buildings.length;
    expect(findBuildSpot(live, kind, { x: home.x + 70 + n * 50, y: home.y + 60 }, 160)).toBe(true);
  }
  expect(live.startPlacing(def.item!)).toBe(true);
  pressE(live);
  run(live, 60 * (def.buildSeconds + 1));
  const placed = live.placedHere.filter((b) => b.kind === kind).pop();
  expect(placed, `${kind} placed`).toBeDefined();
  live.bubble = null;
  return placed!;
}
/** A piece's sprite and the first opaque pixel of its back (not in the front mask) and of its front, near the centre column. */
function pixels(live: LiveWorld, f: Building) {
  const s = buildingSprite(f, paletteFor(live.world.options.palette), 1, live.world.options.scale);
  const o = OCCUPANCY[f.kind];
  const w = s.buffer.width;
  const h = s.buffer.height;
  const find = (inMask: boolean) => {
    for (let y = 0; y < h; y++)
      for (let d = 0; d <= 3; d++)
        for (const x of [s.anchorX - d, s.anchorX + d]) {
          if (x < 0 || x >= w || !(s.buffer.get(x, y) >>> 24) || o.front(x, y, w, h) !== inMask) continue;
          return { x: f.x - s.anchorX + x, y: f.y - s.anchorY + y, color: s.buffer.get(x, y) };
        }
    throw new Error(`no ${inMask ? 'front' : 'back'} pixel for ${f.kind}`);
  };
  return { back: find(false), front: find(true) };
}
const frame = (live: LiveWorld, f: Building) =>
  live.inside ? new InteriorRenderer(live).render(128, 96, 0, 0, live.clock.time, DEFAULT_LIVE_OPTIONS).clone() : new LiveRenderer(live).render(64, 48, f.x - 32, f.y - 24, live.clock.time, DEFAULT_LIVE_OPTIONS).clone();
const at = (live: LiveWorld, f: Building, p: { x: number; y: number }) => (live.inside ? frame(live, f).get(p.x, p.y) : frame(live, f).get(p.x - (f.x - 32), p.y - (f.y - 24)));

/** Seated (or in the water): the piece's back is hidden by the Blobbi, its front is over the Blobbi. */
function expectLayered(live: LiveWorld, f: Building): void {
  const { back, front } = pixels(live, f);
  expect(at(live, f, front), `${f.kind} at ${f.x},${f.y}: its front (${front.x},${front.y}) over the Blobbi at ${live.blobbi.x},${live.blobbi.y}`).toBe(front.color);
  expect(at(live, f, back), `${f.kind}: its back (${back.x},${back.y}) behind the Blobbi`).not.toBe(back.color);
  // (The pixel is the piece's own: with the Blobbi elsewhere, the back shows.)
  const o = live.occupation;
  const x0 = live.blobbi.x;
  live.occupation = null;
  live.blobbi.x += 40;
  expect(at(live, f, back)).toBe(back.color);
  live.blobbi.x = x0;
  live.occupation = o;
}

describe('the catalogue', () => {
  it('the tub can be occupied (a bath), nothing without a sit or wash use can; each front mask is a proper part of the sprite', () => {
    const palette = paletteFor('summer');
    for (const kind of [...ALL_PLACEABLE_KINDS, ...BUILDING_KINDS]) {
      const def = BUILDINGS[kind];
      const o = OCCUPANCY[kind];
      if (def.use === 'wash') expect(o?.kind, kind).toBe('bath');
      else if (def.use !== 'sit') expect(o, kind).toBeUndefined();
      if (!o) continue;
      const f: Building = { id: `${kind}:0`, kind, x: 40, y: 40, placedAt: 0, seed: 's' };
      const s = buildingSprite(f, palette, 1, 1.6);
      const front = frontOf(s, kind);
      let whole = 0;
      let part = 0;
      for (let y = 0; y < s.buffer.height; y++) for (let x = 0; x < s.buffer.width; x++) {
        if (s.buffer.get(x, y) >>> 24) whole++;
        if (front.buffer.get(x, y) >>> 24) part++;
      }
      expect(part, kind).toBeGreaterThan(0);
      expect(part, kind).toBeLessThan(whole);
      expect(frontOf(s, kind)).toBe(front); // cached
      // The spot it sits in lies inside the piece's footprint (the seat holds it), never beside it.
      const spot = occupantSpot(f);
      expect(Math.abs(spot.x - f.x)).toBeLessThanOrEqual(def.footRx);
      expect(Math.abs(spot.y - f.y)).toBeLessThanOrEqual(def.footRy + 1);
    }
  });
});


describe('the washing tub', () => {
  it('a hop in, a soak with splashes and a bob, the wash at the end with its joy, a shake-dry hop out to free ground', () => {
    const live = island();
    const tub = place(live, 'washing-tub');
    face(live, tub);
    live.care.hygiene = 20;
    const joy0 = live.care.happiness;
    live.particles.particles.length = 0;
    step(live, 1, E);
    expect(live.occupation?.kind).toBe('bath');
    untilPhase(live, 'stay');
    const t0 = live.clock.time;
    expect({ x: live.blobbi.x, y: live.blobbi.y }).toEqual(occupantSpot(tub));
    const lifts = new Set<number>();
    let drops = 0;
    for (let i = 0; i < 60; i++) {
      step(live);
      lifts.add(live.occupantLift(live.clock.time));
      drops += live.particles.particles.filter((p) => p.kind === 'drop').length;
    }
    expect(drops).toBeGreaterThan(30);
    // Standing tall in the water (the tub's lift) with a slow bob of a pixel.
    const lift = OCCUPANCY['washing-tub'].lift;
    expect([...lifts].every((l) => l <= -lift && l >= -lift - 1)).toBe(true);
    expect(lifts.size).toBe(2); // the bob
    expect(live.care.hygiene).toBeCloseTo(20, 0); // not yet
    untilPhase(live, 'leave');
    expect(live.clock.time - t0).toBeGreaterThanOrEqual(BATH_SECONDS - 0.05);
    expect(live.care.hygiene).toBeGreaterThan(CLEAN);
    expect(live.care.happiness).toBeCloseTo(joy0 + JOY.wash, 0);
    expect(live.bubble?.text).toBe(lang('say.allClean'));
    expect(live.blobbi.animator.state.reaction?.expression).toBe('excited');
    untilDone(live);
    expect(standable(live)).toBe(true);
    expect(live.prompt()).toBe(`E  ${lang('use.wash')}`);
    // Clean enough: no bath.
    step(live, 1, E);
    expect(live.occupation).toBeNull();
    expect(live.bubble?.text).toBe(lang('say.alreadyClean'));
  });

  it('interrupted by a key (mid-soak, or mid-hop-in): out again, not washed, never stuck', () => {
    const live = island();
    const tub = place(live, 'washing-tub');
    face(live, tub);
    live.care.hygiene = 20;
    step(live, 1, E);
    untilPhase(live, 'stay');
    step(live, 30);
    step(live, 1, { ...IDLE_INPUT, down: true });
    expect(live.occupation?.phase).toBe('leave');
    step(live, 60, { ...IDLE_INPUT, down: true });
    expect(live.occupation).toBeNull();
    expect(live.care.hygiene).toBeCloseTo(20, 0);
    expect(live.bubble?.text ?? null).not.toBe(lang('say.allClean'));
    expect(standable(live)).toBe(true);
    face(live, tub);
    step(live, 1, E);
    step(live, 8);
    expect(live.occupation?.phase).toBe('enter');
    step(live, 1, E);
    expect(live.occupation?.phase).toBe('leave');
    untilDone(live);
    expect(standable(live)).toBe(true);
    expect(live.care.hygiene).toBeCloseTo(20, 0);
  });

  it('indoors, in the multi-scale view as well: the water is drawn over the Blobbi', () => {
    const live = room();
    const tub = place(live, 'washing-tub', [{ x: 64, y: 72 }]);
    face(live, tub);
    live.care.hygiene = 20;
    step(live, 1, E);
    untilPhase(live, 'stay');
    expectLayered(live, tub);
    const view = new ViewRenderer(live, new LiveRenderer(live));
    const { front } = pixels(live, tub);
    const rect = { mode: 'exploration' as const, scale: 2, originX: 0, originY: 0, screenW: 256, screenH: 192, transitioning: false };
    const v = view.render(rect, 2, live.clock.time, DEFAULT_LIVE_OPTIONS, { hud: false, indicator: false, goals: false, prompt: false, lighting: false, uiScale: 2 });
    expect(v.get(front.x * 2, front.y * 2)).toBe(front.color);
    untilDone(live);
    expect(standable(live)).toBe(true);
    expect(live.care.hygiene).toBeGreaterThan(CLEAN);
  });
});


describe('the same every run', () => {
  it('two worlds, the same bath: the same positions, lifts and splashes, frame for frame', () => {
    const trace = () => {
      const live = island('occupy-det');
      const tub = place(live, 'washing-tub');
      face(live, tub);
      live.care.hygiene = 20;
      const out: string[] = [];
      step(live, 1, E);
      for (let i = 0; i < 60 * 4; i++) {
        step(live);
        out.push(`${live.blobbi.x.toFixed(2)},${live.blobbi.y.toFixed(2)},${live.occupantLift(live.clock.time)},${live.particles.particles.filter((p) => p.kind === 'drop').map((p) => `${p.x.toFixed(1)}:${p.y.toFixed(1)}`).join('/')}`);
      }
      return out;
    };
    expect(trace()).toEqual(trace());
  });
});

