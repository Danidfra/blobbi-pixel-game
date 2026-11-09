/**
 * CONDITION, VISIBLY (Living World, phase 2, animation only): a tired Blobbi idles slower (breaths and glances at a
 * lower tempo; walking untouched) and yawns now and then; a glad one smiles on its own now and then; a wash ends in a
 * cheerful shake. From the world time slot and a hash, never a stream; never over a reaction, a sleep, a walk or a
 * word. Nothing saved.
 */
import { describe, expect, it } from 'vitest';
import { GLAD, TIRED, TIRED_TEMPO } from '../src/game/care';
import { BlobbiAnimator, BREATH_PERIOD } from '../src/blobbi/animation';
import { IDLE_INPUT, LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { memoryStore } from '../src/game/persistence';
import { BUILDINGS } from '../src/game/buildings';
import { findBuildSpot, pressE, run, stand } from '../src/dev/scripted-play';

const quiet = () => {
  const live = new LiveWorld(generateTurtleWorld('turtle-0'), 'blobbi-9', 16, { store: memoryStore() });
  live.brain.enabled = false;
  live.resources = [];
  return live;
};
/** Reactions seen over `seconds` of idling, by expression. */
function reactions(live: LiveWorld, seconds: number): Record<string, number> {
  const seen: Record<string, number> = {};
  let last: string | null = null;
  for (let i = 0; i < seconds * 60; i++) {
    live.update(1 / 60, IDLE_INPUT);
    const r = live.blobbi.animator.state.reaction;
    const key = r ? `${r.expression}@${r.start}` : null;
    if (key && key !== last) seen[r!.expression] = (seen[r!.expression] ?? 0) + 1;
    last = key;
  }
  return seen;
}

describe('the animator\'s tempo', () => {
  it('slows the breath and the glances, never the walk', () => {
    const a = new BlobbiAnimator('tempo-test');
    const b = new BlobbiAnimator('tempo-test');
    b.state.tempo = TIRED_TEMPO;
    for (let i = 0; i < 60; i++) {
      a.step(1 / 60, i / 60, { moving: false, direction: 'down' });
      b.step(1 / 60, i / 60, { moving: false, direction: 'down' });
    }
    expect(a.state.breathPhase).toBeCloseTo(1 / BREATH_PERIOD, 6);
    expect(b.state.breathPhase).toBeCloseTo(TIRED_TEMPO / BREATH_PERIOD, 6);
    const c = new BlobbiAnimator('tempo-test');
    const d = new BlobbiAnimator('tempo-test');
    d.state.tempo = TIRED_TEMPO;
    for (let i = 0; i < 60; i++) {
      c.step(1 / 60, i / 60, { moving: true, direction: 'right' });
      d.step(1 / 60, i / 60, { moving: true, direction: 'right' });
    }
    expect(c.state.walkPhase).toBe(d.state.walkPhase);
  });
});

describe('condition cues', () => {
  it('a tired Blobbi idles at the slow tempo and yawns now and then; a rested one idles as ever and never yawns on its own', () => {
    const live = quiet();
    live.care.energy = TIRED - 5;
    live.care.happiness = 50;
    const tired = reactions(live, 120);
    expect(live.blobbi.animator.state.tempo).toBe(TIRED_TEMPO);
    expect(tired.sleepy ?? 0).toBeGreaterThan(0);
    expect(tired.happy ?? 0).toBe(0);
    const rested = quiet();
    rested.care.energy = 60;
    rested.care.happiness = 50;
    const calm = reactions(rested, 120);
    expect(rested.blobbi.animator.state.tempo).toBe(1);
    expect(calm.sleepy ?? 0).toBe(0);
    expect(calm.happy ?? 0).toBe(0);
  });

  it('a glad Blobbi smiles on its own now and then, not while hungry, and never while walking', () => {
    const live = quiet();
    live.care.happiness = GLAD + 5;
    expect((reactions(live, 120).happy ?? 0)).toBeGreaterThan(0);
    const hungry = quiet();
    hungry.care.happiness = GLAD + 5;
    hungry.care.hunger = 10;
    expect(reactions(hungry, 120).happy ?? 0).toBe(0);
    const walking = quiet();
    walking.care.happiness = GLAD + 5;
    let smiles = 0;
    for (let i = 0; i < 120 * 60; i++) {
      walking.update(1 / 60, { ...IDLE_INPUT, [i % 240 < 120 ? 'left' : 'right']: true });
      if (walking.blobbi.animator.state.reaction?.expression === 'happy') smiles++;
    }
    expect(smiles).toBe(0);
  });

  it('cues are the same every run, and a wash ends in a cheerful shake', () => {
    const a = quiet();
    const b = quiet();
    a.care.happiness = b.care.happiness = GLAD + 5;
    const ra = reactions(a, 90);
    const rb = reactions(b, 90);
    expect(ra).toEqual(rb);
    const live = quiet();
    const tub = BUILDINGS['washing-tub'];
    live.inventory.add(tub.item!, 1);
    expect(findBuildSpot(live, 'washing-tub')).toBe(true);
    expect(live.startPlacing(tub.item!)).toBe(true);
    pressE(live);
    run(live, 150);
    const placed = live.buildings.find((x) => x.kind === 'washing-tub')!;
    stand(live, placed.x, placed.y + tub.footRy + live.blobbi.footRy + 2, 'up');
    live.care.hygiene = 20;
    live.update(1 / 60, { ...IDLE_INPUT, interact: true });
    expect(live.blobbi.animator.state.reaction?.expression).toBe('excited');
    expect(live.blobbi.animator.state.reaction?.hop).toBeGreaterThan(0);
  });
});
