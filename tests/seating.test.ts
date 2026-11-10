/**
 * SEATING (Living Home, phase 2): E at a chair, the armchair, a stool, the bench, a log seat or a hay bale hops the
 * Blobbi into the seat, where it sits (feet behind the seat's front, a content face) until E, a key, R or the piece
 * being moved gets it up again, back where it came from and facing the seat. Every seat kind, indoors and out, beside
 * other things; autonomy waits for the player's sit and makes short ones of its own; the save knows nothing of it.
 */
import { describe, expect, it } from 'vitest';
import { CLIMB_SECONDS, IDLE_INPUT, LiveWorld } from '../src/sim/live-world';
import { IDLE_SIT_SECONDS, OCCUPANCY, occupantSpot } from '../src/game/furniture-use';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { loadSave, memoryStore } from '../src/game/persistence';
import { BUILDINGS, buildingSprite, type Building } from '../src/game/buildings';
import { CLEAN } from '../src/game/care';
import { paletteFor } from '../src/world/generate';
import { InteriorRenderer } from '../src/render/interior-render';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { ViewRenderer } from '../src/render/view-renderer';
import type { ViewRect } from '../src/render/view-camera';
import { findBuildSpot, pressE, run, stand } from '../src/dev/scripted-play';
import { ITEMS } from '../src/game/items';
import { t as lang } from '../src/i18n';
import { atDoor } from '../src/game/interior';
import { buildingNoun } from '../src/content/text';

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
  it('every seat (use: sit) can be occupied as a seat', () => {
    for (const kind of Object.keys(BUILDINGS)) if (BUILDINGS[kind].use === 'sit') expect(OCCUPANCY[kind]?.kind, kind).toBe('seat');
  });
});

describe('sitting on a chair in the room', () => {
  it('E hops it in; it sits with a content face; E hops it out to where it stood, facing the chair', () => {
    const live = room();
    const chair = place(live, 'chair', [{ x: 40, y: 70 }]);
    face(live, chair);
    const from = { x: live.blobbi.x, y: live.blobbi.y };
    expect(live.prompt()).toBe(`E  ${lang('use.sit', { ...nounOf('chair') })}`);
    step(live, 1, E);
    expect(live.occupation?.kind).toBe('seat');
    expect(live.occupation?.phase).toBe('enter');
    expect(live.prompt()).toBe(`E  ${lang('prompt.standUp')}`);
    // A hop, not a cut: never further than 2 px a frame.
    let last = { ...from };
    let jump = 0;
    for (let i = 0; i < 40 && live.occupation?.phase === 'enter'; i++) {
      step(live);
      jump = Math.max(jump, Math.hypot(live.blobbi.x - last.x, live.blobbi.y - last.y));
      last = { x: live.blobbi.x, y: live.blobbi.y };
    }
    expect(jump).toBeLessThan(2);
    expect(live.occupation?.phase).toBe('stay');
    expect({ x: live.blobbi.x, y: live.blobbi.y }).toEqual(occupantSpot(chair));
    expect(standable(live)).toBe(false); // inside the chair's own collision
    expect(live.blobbi.animator.state.relaxed).toBe(true);
    expect(live.blobbi.animator.state.direction).toBe('down');
    step(live, 90);
    const pose = live.blobbi.animator.pose(live.clock.time);
    expect(pose.expression).toBe('happy');
    expect(pose.lid).toBe(1);
    expect(live.tally.sat).toBe(1);
    expectLayered(live, chair);
    // Up again.
    step(live, 1, E);
    expect(live.occupation?.phase).toBe('leave');
    expect(live.prompt()).toBeNull();
    untilDone(live);
    expect(live.occupation).toBeNull();
    expect(Math.hypot(live.blobbi.x - from.x, live.blobbi.y - from.y)).toBeLessThan(1);
    expect(standable(live)).toBe(true);
    expect(live.blobbi.animator.state.relaxed).toBe(false);
    expect(live.blobbi.animator.state.direction).toBe('up');
    expect(live.prompt()).toBe(`E  ${lang('use.sit', { ...nounOf('chair') })}`);
  });

  it('a key gets it up first, then it walks; a key held since before the hop in is ignored until released', () => {
    const live = room();
    const chair = place(live, 'chair', [{ x: 40, y: 70 }]);
    face(live, chair);
    step(live, 1, E);
    untilPhase(live, 'stay');
    const x0 = live.blobbi.x;
    step(live, 1, { ...IDLE_INPUT, left: true });
    expect(live.occupation?.phase).toBe('leave');
    step(live, 60, { ...IDLE_INPUT, left: true });
    expect(live.occupation).toBeNull();
    expect(standable(live)).toBe(true);
    expect(x0 - live.blobbi.x).toBeGreaterThan(10);
    // Held through the press (a thumb still on the stick): no bounce.
    face(live, chair);
    step(live, 1, { ...E, up: true });
    step(live, 60, { ...IDLE_INPUT, up: true });
    expect(live.occupation?.phase).toBe('stay');
    step(live, 2); // released
    step(live, 1, { ...IDLE_INPUT, up: true });
    expect(live.occupation?.phase).toBe('leave');
    untilDone(live);
    expect(standable(live)).toBe(true);
  });

  it('R while seated gets it up and then rests; the save knows nothing of the sit; a reload starts standing', () => {
    const live = room();
    const chair = place(live, 'chair', [{ x: 40, y: 70 }]);
    const store = stores.get(live)!;
    const keys0 = Object.keys(loadSave(store, live.identity)!).sort();
    face(live, chair);
    step(live, 1, E);
    untilPhase(live, 'stay');
    live.save();
    expect(Object.keys(loadSave(store, live.identity)!).sort()).toEqual(keys0);
    live.rest();
    expect(live.occupation?.phase).toBe('leave');
    expect(live.brain.state).not.toBe('rest');
    untilDone(live);
    expect(standable(live)).toBe(true);
    expect(live.restPlan?.phase).toBe('bed'); // the rest went on by itself: to the room's bed
    const back = new LiveWorld(generateWhaleWorld('occupy-1', { carrierSeed: 'w', generatedHouse: false }), 'blobbi-9', 16, { store });
    expect(back.occupation).toBeNull();
    expect(back.collision.canStand(back.blobbi.x, back.blobbi.y, back.blobbi.footRx, back.blobbi.footRy)).toBe(true);
  });

  it('arranging things (M) gets it up; the chair moved from under it leaves it standing on free ground', () => {
    const live = room();
    const chair = place(live, 'chair', [{ x: 40, y: 70 }]);
    face(live, chair);
    step(live, 1, E);
    untilPhase(live, 'stay');
    expect(live.toggleManage()).toBe(true);
    step(live);
    expect(live.occupation?.phase).toBe('leave');
    untilDone(live);
    expect(standable(live)).toBe(true);
    live.toggleManage();
    face(live, chair);
    step(live, 1, E);
    untilPhase(live, 'stay');
    chair.x += 24; // (as a move would)
    step(live);
    expect(live.occupation).toBeNull();
    expect(standable(live)).toBe(true);
    expect(() => frame(live, chair)).not.toThrow();
  });

  it('leaving the house while seated simply ends it; a swapped-in Blobbi keeps the seat', () => {
    const live = room();
    const chair = place(live, 'chair', [{ x: 40, y: 70 }]);
    face(live, chair);
    step(live, 1, E);
    untilPhase(live, 'stay');
    live.setBlobbi('blobbi-3');
    expect(live.occupation?.phase).toBe('stay');
    expect(live.blobbi.animator.state.relaxed).toBe(true);
    step(live, 10);
    expect(() => frame(live, chair)).not.toThrow();
    live.exitInterior();
    expect(live.occupation).toBeNull();
    expect(live.inside).toBe(false);
    expect(standable(live)).toBe(true);
    step(live, 5);
  });
});


describe('every seat, indoors and out, and beside other things', () => {
  it('the chair, the armchair and the stool, side by side in the room; the tub against the wall', () => {
    const live = room();
    // Three seats a step apart, and the tub up against the back wall beside the starter chest.
    const pieces = [place(live, 'chair', [{ x: 24, y: 70 }]), place(live, 'armchair', [{ x: 40, y: 70 }]), place(live, 'stool', [{ x: 56, y: 70 }]), place(live, 'washing-tub', [{ x: 80, y: 40 }, { x: 80, y: 42 }, { x: 84, y: 44 }, { x: 76, y: 44 }])];
    const tub = pieces[3];
    expect(tub.y - BUILDINGS['washing-tub'].footRy).toBeLessThanOrEqual(live.roomLayout.floor.y0 + 2);
    for (const f of pieces) {
      face(live, f);
      const from = { x: live.blobbi.x, y: live.blobbi.y };
      if (f.kind === 'washing-tub') live.care.hygiene = 20;
      step(live, 1, E);
      expect(live.occupation?.id, f.kind).toBe(f.id);
      untilPhase(live, 'stay');
      expectLayered(live, f);
      if (f.kind === 'washing-tub') untilDone(live);
      else {
        step(live, 30);
        step(live, 1, E);
        untilDone(live);
      }
      expect(live.occupation, f.kind).toBeNull();
      expect(standable(live), f.kind).toBe(true);
      expect(live.inside).toBe(true);
      expect(atDoor(live.blobbi.x, live.blobbi.y, live.roomLayout)).toBe(false);
      expect(Math.hypot(live.blobbi.x - from.x, live.blobbi.y - from.y), f.kind).toBeLessThan(1);
    }
    expect(live.care.hygiene).toBeGreaterThan(CLEAN);
  });

  it('the bench, the log seat and the hay bale outside', () => {
    const live = island();
    for (const kind of ['bench', 'log-seat', 'hay-bale']) {
      const f = place(live, kind);
      face(live, f);
      step(live, 1, E);
      untilPhase(live, 'stay');
      expect(live.occupation?.phase, kind).toBe('stay');
      expectLayered(live, f);
      step(live, 1, E);
      untilDone(live);
      expect(standable(live), kind).toBe(true);
      expect(live.prompt(), kind).toBe(`E  ${lang('use.sit', { ...nounOf(kind) })}`);
    }
  });
});

/**
 * The Blobbi as the game draws it (the view's own-size sprite at the 2× exploration scale, smaller than the piece's
 * rows suggest): how much of its body the occupied piece hides, and whether the rows of its face are all in sight.
 */
function inSight(live: LiveWorld, f: Building): { hidden: number; faceRows: number; faceHidden: number } {
  live.bubble = null;
  live.particles.particles.length = 0;
  const view = new ViewRenderer(live, new LiveRenderer(live));
  const rect: ViewRect = { mode: 'exploration', scale: 2, originX: f.x - 40, originY: f.y - 30, screenW: 160, screenH: 120, transitioning: false };
  const screen = view.render(rect, 2, live.clock.time, DEFAULT_LIVE_OPTIONS, { hud: false, indicator: false, goals: false, prompt: false, lighting: false, uiScale: 2 });
  const b = view.lastBlobbi!;
  expect(b.ratio).toBe(1);
  const { buffer, anchorX, anchorY } = b.sprite;
  let top = buffer.height;
  let bottom = -1;
  for (let y = 0; y < buffer.height; y++) for (let x = 0; x < buffer.width; x++) if (buffer.get(x, y) >>> 24) (top = Math.min(top, y)), (bottom = Math.max(bottom, y));
  const faceRows = Math.ceil((bottom - top + 1) * 0.6); // the head and the face: the upper three fifths
  let all = 0;
  let hidden = 0;
  let faceHidden = 0;
  for (let y = top; y <= bottom; y++)
    for (let x = 0; x < buffer.width; x++) {
      const c = buffer.get(x, y);
      if (!(c >>> 24)) continue;
      all++;
      if (screen.get(b.x - anchorX + x, b.y - anchorY + y) === c) continue;
      hidden++;
      if (y < top + faceRows) faceHidden++;
    }
  return { hidden: hidden / all, faceRows, faceHidden };
}

describe('the body in sight (the seats hide the feet, never half the Blobbi)', () => {
  it('on every seat, indoors and out, at most a quarter of the body is behind the seat and the face is whole', () => {
    const live = room();
    const indoor = [place(live, 'chair', [{ x: 24, y: 70 }]), place(live, 'armchair', [{ x: 40, y: 70 }]), place(live, 'stool', [{ x: 56, y: 70 }])];
    for (const f of indoor) {
      face(live, f);
      step(live, 1, E);
      untilPhase(live, 'stay');
      step(live, 90);
      const s = inSight(live, f);
      expect(s.hidden, `${f.kind}: hidden ${(s.hidden * 100).toFixed(0)}%`).toBeLessThanOrEqual(0.25);
      expect(s.hidden, `${f.kind}: something of it behind the seat's front`).toBeGreaterThan(0);
      expect(s.faceHidden, `${f.kind}: the face`).toBe(0);
      step(live, 1, E);
      untilDone(live);
    }
    const out = island();
    for (const kind of ['bench', 'log-seat', 'hay-bale']) {
      const f = place(out, kind);
      face(out, f);
      step(out, 1, E);
      untilPhase(out, 'stay');
      step(out, 90);
      const s = inSight(out, f);
      expect(s.hidden, `${kind}: hidden ${(s.hidden * 100).toFixed(0)}%`).toBeLessThanOrEqual(0.25);
      expect(s.hidden, `${kind}: something of it behind the seat's front`).toBeGreaterThan(0);
      expect(s.faceHidden, `${kind}: the face`).toBe(0);
      step(out, 1, E);
      untilDone(out);
    }
  });

  it('in the tub it stands in the water to below the face: between a quarter and a half of it under', () => {
    const live = room();
    const tub = place(live, 'washing-tub', [{ x: 80, y: 40 }, { x: 80, y: 42 }, { x: 84, y: 44 }, { x: 76, y: 44 }]);
    face(live, tub);
    live.care.hygiene = 20;
    step(live, 1, E);
    untilPhase(live, 'stay');
    step(live, 20);
    const s = inSight(live, tub);
    expect(s.hidden).toBeGreaterThan(0.25);
    expect(s.hidden).toBeLessThan(0.5);
    expect(s.faceHidden).toBe(0);
  });
});

describe('autonomy', () => {
  it('waits while the player has it seated (no walk, no sleep for a minute and more); resumes after it stands', () => {
    const live = room();
    const chair = place(live, 'chair', [{ x: 40, y: 70 }]);
    live.brain.enabled = true;
    live.care.energy = 15; // tired: it would go to sleep on its own
    face(live, chair);
    step(live, 1, E);
    untilPhase(live, 'stay');
    step(live, 60 * 100);
    expect(live.occupation?.phase).toBe('stay');
    expect(live.brain.state).toBe('manual');
    expect(live.blobbi.animator.state.sleeping).toBe(false);
    step(live, 1, E);
    untilDone(live);
    expect(standable(live)).toBe(true);
    step(live, 60 * 70);
    expect(live.brain.state).not.toBe('manual');
  });

  it('on its own, it sits for a while and gets up again on free ground, the brain waiting for it', () => {
    const live = room();
    const chair = place(live, 'chair', [{ x: 40, y: 70 }]);
    live.brain.enabled = true;
    face(live, chair);
    step(live, 2);
    (live as unknown as { visitBuilding: (b: Building, p: boolean) => void }).visitBuilding(chair, false);
    expect(live.occupation?.own).toBe(true);
    untilPhase(live, 'stay');
    const t0 = live.clock.time;
    expect(live.brain.until).toBeGreaterThan(t0 + IDLE_SIT_SECONDS - CLIMB_SECONDS - 1);
    untilPhase(live, 'leave', 60 * 12);
    expect(live.clock.time - t0).toBeGreaterThan(IDLE_SIT_SECONDS - 1);
    untilDone(live);
    expect(standable(live)).toBe(true);
    expect(live.brain.state).not.toBe('manual');
  });
});


const nounOf = (kind: string) => buildingNoun(kind);
