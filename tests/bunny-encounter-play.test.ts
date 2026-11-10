/**
 * THE BUNNY ENCOUNTER, AS PLAYED (playtest fix): a player sees a bunny, walks straight at it with the keys, stops
 * when it looks near, and waits. Reported from play: "bunnies never approach". The rules now let that player have
 * the encounter: a brisk walk-up that stops short only keeps the bunny watching (haste frightens it within arm's
 * reach), it watches from farther, it needs less stillness (shy ones still more than bold ones), it stays longer,
 * it hops round what is in the way, and the prompt line says what to do. Deterministic: the same every run.
 */
import { describe, expect, it } from 'vitest';
import { LandLife, LAND_REACH, BUNNY_APPROACH_HOPS, BUNNY_BESIDE, BUNNY_HOP_LENGTH, patience, reach, type LandSighting } from '../src/game/land-life';
import { IDLE_INPUT, LiveWorld } from '../src/sim/live-world';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { memoryStore } from '../src/game/persistence';
import { DAY_SECONDS, START_HOUR, rainAt } from '../src/game/daylight';
import { stand } from '../src/dev/scripted-play';
import { t as lang } from '../src/i18n';

const at = (hour: number, day = 0) => day * DAY_SECONDS + (((hour - START_HOUR + 24) % 24) / 24) * DAY_SECONDS;
function grown(seed = 'play-test', stage = 2): LiveWorld {
  const store = memoryStore();
  const probe = new LiveWorld(generateTurtleWorld(seed, { turtleSeed: 'lt', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false }), 'blobbi-9', 16, { store });
  probe.growth = { stage, version: 3, history: [], regions: [] };
  probe.save();
  const live = new LiveWorld(generateTurtleWorld(seed, { turtleSeed: 'lt', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false }), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  live.weather = 'dry';
  live.resources = []; // (a stick in reach would take the prompt line from the hint)
  return live;
}
type Mood = { phase: string; still: number; approachHops: number };
const mood = (live: LiveWorld, id: string) => (live as unknown as { landMoods: Map<string, Mood> }).landMoods.get(id);
const view = (live: LiveWorld, id: string) => live.landViews.find((v) => v.id === id);
const clear = (live: LiveWorld) => (live as unknown as { landMoods: Map<string, Mood> }).landMoods.clear();

/** Every bunny appearance on clear days from `from`, young, in order; each once. */
function* bunnies(live: LiveWorld, from = at(9), days = 2): Generator<{ t: number; s: LandSighting }> {
  const seen = new Set<string>();
  for (let t = from; t < from + DAY_SECONDS * days; t += 2) {
    const h = ((START_HOUR + (t / DAY_SECONDS) * 24) % 24 + 24) % 24;
    if (h < 8 || h > 17 || rainAt(live.world.seed, t) > 0) continue;
    const s = live.land.at(t, 0, []).find((x) => x.kind === 'bunny' && x.age < 4 && !seen.has(x.id));
    if (!s) continue;
    seen.add(s.id);
    yield { t, s };
  }
}

/**
 * The naive player: notices the bunny `after` seconds in, from about 90 px off, walks straight at it with the keys
 * until it is `stopAt` px away (at most 12 s), then keeps still for `wait` seconds. What came of it, and how it went.
 */
function play(live: LiveWorld, t: number, s: LandSighting, stopAt = 40, wait = 25, after = 3): { outcome: 'beside' | 'gone' | 'never' | 'unreachable'; bolts: number; hints: number; walked: number } {
  live.timeOffset = t + after - live.clock.time;
  const { footRx: rx, footRy: ry } = live.blobbi;
  const spot = live.collision.nearestFree(Math.round(s.home.x + 90), Math.round(s.home.y + 10), rx, ry) ?? live.collision.nearestFree(Math.round(s.home.x - 90), Math.round(s.home.y - 10), rx, ry);
  if (!spot) return { outcome: 'unreachable', bolts: 0, hints: 0, walked: 0 };
  stand(live, spot.x, spot.y, 'left');
  clear(live);
  live.update(1 / 60, IDLE_INPUT);
  const phase = () => mood(live, s.id)?.phase ?? 'gone';
  let bolts = 0;
  let hints = 0;
  let last = phase();
  const note = () => {
    const p = phase();
    if (p === 'bolting' && last !== 'bolting') bolts++;
    last = p;
    if (live.prompt() === lang('prompt.bunnyWatching')) hints++;
  };
  let walked = 0;
  for (let i = 0; i < 60 * 12; i++) {
    const v = view(live, s.id);
    if (!v) break;
    const dx = v.x - live.blobbi.x;
    const dy = v.y - live.blobbi.y;
    if (Math.hypot(dx, dy) <= stopAt) break;
    const x0 = live.blobbi.x;
    const y0 = live.blobbi.y;
    live.update(1 / 60, { ...IDLE_INPUT, left: dx < -1, right: dx > 1, up: dy < -1, down: dy > 1 });
    walked += Math.hypot(live.blobbi.x - x0, live.blobbi.y - y0);
    note();
  }
  const v = view(live, s.id);
  if (v && Math.hypot(v.x - live.blobbi.x, v.y - live.blobbi.y) > stopAt + 8) return { outcome: 'unreachable', bolts, hints, walked };
  for (let i = 0; i < 60 * wait; i++) {
    live.update(1 / 60, IDLE_INPUT);
    note();
    if (phase() === 'beside') return { outcome: 'beside', bolts, hints, walked };
    if (!view(live, s.id)) return { outcome: 'gone', bolts, hints, walked };
  }
  return { outcome: 'never', bolts, hints, walked };
}

/** The first bunny `pick`ed that the scripted walker can reach, played. */
function first(live: LiveWorld, pick: (s: LandSighting) => boolean, stopAt = 40) {
  for (const b of bunnies(live)) {
    if (!pick(b.s)) continue;
    const r = play(live, b.t, b.s, stopAt);
    if (r.outcome !== 'unreachable') return { pick: b, r };
  }
  throw new Error('no reachable bunny');
}

describe('the bunny encounter, as played', () => {
  it('a bold bunny: walk straight at it, stop, wait a few seconds: it watches (the prompt says to keep still), comes over and sits beside the Blobbi', () => {
    const live = grown();
    const { pick, r } = first(live, (s) => s.traits.bold > 0.7);
    expect(r.outcome).toBe('beside');
    expect(r.bolts).toBe(0); // the walk-up stopped short of arm's reach: no fright
    expect(r.hints).toBeGreaterThan(60); // the hint showed for a second and more while it watched and came over
    expect(live.prompt()).not.toBe(lang('prompt.bunnyWatching')); // beside: nothing more to do
    const d = Math.hypot(view(live, pick.s.id)!.x - live.blobbi.x, view(live, pick.s.id)!.y - live.blobbi.y);
    expect(d).toBeLessThanOrEqual(BUNNY_BESIDE + 6);
  });

  it('a shy bunny: the same, with more patience; it still comes within the appearance', () => {
    const live = grown();
    const { pick, r } = first(live, (s) => s.traits.bold < 0.25, 48);
    expect(patience(pick.s.traits)).toBeGreaterThan(1.7);
    expect(r.outcome).toBe('beside');
    expect(r.hints).toBeGreaterThan(0);
  });

  it('over the first ten bunnies of two worlds, stopping near or far, at least two thirds come beside', () => {
    for (const seed of ['play-test', 'play-test-2']) {
      for (const stopAt of [30, 55]) {
        const live = grown(seed);
        let n = 0;
        let beside = 0;
        const log: string[] = [];
        for (const { t, s } of bunnies(live)) {
          const r = play(live, t, s, stopAt);
          if (r.outcome === 'unreachable') continue; // (the scripted walker has no path-finding)
          n++;
          if (r.outcome === 'beside') beside++;
          log.push(`${s.traits.bold.toFixed(2)}:${r.outcome}${r.bolts ? '/bolt' : ''}`);
          if (n >= 10) break;
        }
        expect(n, `${seed} @${stopAt}`).toBeGreaterThanOrEqual(8);
        expect(beside / n, `${seed} @${stopAt}: ${beside} of ${n} (${log.join(' ')})`).toBeGreaterThanOrEqual(2 / 3);
      }
    }
  }, 120000);

  it('the same every run: two worlds, the same player, the same outcomes to the frame', () => {
    const a = grown();
    const b = grown();
    const list = [...bunnies(a)].slice(0, 4);
    for (const { t, s } of list) {
      const ra = play(a, t, s);
      const rb = play(b, t, s);
      expect(rb).toEqual(ra);
      expect(b.clock.time).toBe(a.clock.time);
      expect(b.care.happiness).toBe(a.care.happiness);
    }
  });
});

describe('the way over', () => {
  it('hops round what stands in the way of a straight hop, and an approach never loops: at most a dozen hops', () => {
    // A wall of unstandable ground between the bunny and the Blobbi, with a way round above it.
    const live = grown();
    const land = new LandLife(live.world, (x, y) => !(x >= 110 && x <= 112 && y >= 90 && y <= 140) && live.collision.canStand(Math.round(x), Math.round(y), 2, 1));
    const meadow = land.meadow[0];
    expect(meadow).toBeDefined();
    // Somewhere flat: a straight hop is fine where nothing is in the way.
    const open = land.hopToward({ x: meadow.x, y: meadow.y }, { x: meadow.x + 30, y: meadow.y });
    const straight = land.hopAlong({ x: meadow.x, y: meadow.y }, { x: meadow.x + 30, y: meadow.y });
    if (straight) expect(open).toEqual(straight);
    // Through the wall: no straight hop, but a hop to the side, no longer than a hop.
    const blocked = { x: 104, y: 115 };
    const goal = { x: 120, y: 115 };
    if (land.canStand(blocked.x, blocked.y) && !land.wet(blocked.x, blocked.y)) {
      expect(land.hopAlong(blocked, goal)).toBeNull();
      const round = land.hopToward(blocked, goal);
      if (round) {
        expect(Math.hypot(round.x - blocked.x, round.y - blocked.y)).toBeLessThanOrEqual(BUNNY_HOP_LENGTH + 0.5);
        expect(land.canStand(round.x, round.y)).toBe(true);
      }
    }
    expect(BUNNY_APPROACH_HOPS).toBeLessThanOrEqual(12);
    expect(reach(LAND_REACH.bunnyWatch, { bold: 1, pace: 1 })).toBeGreaterThanOrEqual(40); // a bold one watches from forty pixels and more
  });
});
