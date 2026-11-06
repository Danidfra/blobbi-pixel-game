/**
 * LIVING WORLD, batch 1: small land creatures — a crab at the island's edge, a bunny in the meadow, a songbird at
 * a feeder — a pure function of the world, the time, the weather and the feeders (deterministic, nothing saved),
 * bounded, on standable ground, each with its own character and a reaction to the Blobbi; and the Blobbi notices
 * them. Nothing draws from the island's random streams.
 */
import { describe, expect, it } from 'vitest';
import { LandLife, LAND_REACH, LAND_SCHEDULE, MAX_LAND_CREATURES, isEdge, reach, type LandKind, type LandSighting } from '../src/game/land-life';
import { IDLE_INPUT, LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { landSprite } from '../src/render/land-render';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { memoryStore } from '../src/game/persistence';
import { DAY_SECONDS, START_HOUR, dayAt } from '../src/game/daylight';
import { BUILDINGS } from '../src/game/buildings';
import { findBuildSpot, pressE, run, stand } from '../src/dev/scripted-play';
import { T } from '../src/world/types';
import { t as lang } from '../src/i18n';
import { hex } from '../src/core/color';

const make = (seed = 'land-test') => generateTurtleWorld(seed, { turtleSeed: 'lt', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });
const at = (hour: number, day = 0) => day * DAY_SECONDS + (((hour - START_HOUR + 24) % 24) / 24) * DAY_SECONDS;

/** A live world grown to `stage` (the land reaching the water), as a save makes it; autonomy off. */
function grown(stage = 2, seed = 'land-test'): LiveWorld {
  const store = memoryStore();
  const probe = new LiveWorld(make(seed), 'blobbi-9', 16, { store });
  probe.growth = { stage, version: 3, history: [], regions: [] };
  probe.save();
  const live = new LiveWorld(make(seed), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  return live;
}
const PERCH = [{ x: 300, y: 200 }];
const foot = (live: LiveWorld) => ({ rx: live.blobbi.footRx, ry: live.blobbi.footRy });

/** The first moment on a clear day when a creature of `kind` is `pick`ed, with its age under `young` seconds. */
function moment(live: LiveWorld, kind: LandKind, pick: (s: LandSighting) => boolean = () => true, young = 3, from = at(10)): { t: number; s: LandSighting } {
  const perches = (live as unknown as { perches: () => { x: number; y: number }[] }).perches();
  for (let t = from; t < from + DAY_SECONDS * 3; t += 0.5) {
    const h = ((START_HOUR + (t / DAY_SECONDS) * 24) % 24 + 24) % 24;
    if (h < 8 || h > 17) continue;
    const s = live.land.at(t, live.weather === 'natural' ? 0 : 0, perches).find((x) => x.kind === kind && x.age < young && pick(x));
    if (s) return { t, s };
  }
  throw new Error(`no ${kind}`);
}
/** Put the world at world time `t` and the Blobbi on standable ground `d` pixels from `p` (towards +x, or wherever fits). */
function arrange(live: LiveWorld, t: number, p: { x: number; y: number }, d: number): void {
  live.weather = 'dry';
  live.timeOffset = t - live.clock.time;
  const { rx, ry } = foot(live);
  for (const a of [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]) {
    const spot = live.collision.nearestFree(Math.round(p.x + Math.cos(a) * d), Math.round(p.y + Math.sin(a) * d), rx, ry);
    if (spot && Math.abs(Math.hypot(spot.x - p.x, spot.y - p.y) - d) < 6) {
      stand(live, spot.x, spot.y, 'down');
      return;
    }
  }
  throw new Error('no spot');
}
const view = (live: LiveWorld, id: string) => live.landViews.find((v) => v.id === id);

describe('land life: what is about', () => {
  it('is a pure function of the world, the time, the rain and the feeders (another instance: the same; another seed: not)', () => {
    const live = grown();
    const a = live.land;
    const b = new LandLife(live.world, (x, y) => live.islandCollision.canStand(x, y, 2, 1));
    let seen = 0;
    for (let t = 0; t < DAY_SECONDS; t += 7) {
      const la = a.at(t, 0, PERCH);
      expect(la).toEqual(b.at(t, 0, PERCH));
      seen += la.length;
      for (const s of la) expect(a.routine(s, s.age)).toEqual(b.routine(s, s.age));
    }
    expect(seen).toBeGreaterThan(50);
    const other = grown(2, 'land-test-2');
    const diff = [...Array(40).keys()].some((i) => JSON.stringify(a.at(i * 13, 0, PERCH)) !== JSON.stringify(other.land.at(i * 13, 0, PERCH)));
    expect(diff).toBe(true);
  });

  it('keeps to its places: the crab at the island\'s edge, the bunny in the meadow, the bird only at a feeder; all on standable ground', () => {
    const live = grown();
    const land = live.land;
    const { width, cls } = live.world.terrain;
    expect(land.shore.length).toBeGreaterThan(5);
    expect(land.meadow.length).toBeGreaterThan(5);
    for (const p of [...land.shore, ...land.meadow]) expect(land.canStand(p.x, p.y)).toBe(true);
    for (const p of land.shore) {
      let edge = false;
      for (let dy = -5; dy <= 5; dy += 5) for (let dx = -5; dx <= 5; dx += 5) if (isEdge(cls[(p.y + dy) * width + p.x + dx])) edge = true;
      expect(edge).toBe(true);
    }
    const flowers = live.world.objects.filter((o) => o.kind === 'flower');
    for (const p of land.meadow) {
      const c = cls[p.y * width + p.x];
      expect(([T.MEADOW, T.CLOVER, T.GRASS_PATCH] as number[]).includes(c) || flowers.some((f) => Math.abs(f.x - p.x) < 10 && Math.abs(f.y - p.y) < 10)).toBe(true);
    }
    const kinds = new Set<string>();
    for (let t = at(9); t < at(9) + 600; t += 2) {
      for (const s of land.at(t, 0, [])) {
        kinds.add(s.kind);
        expect(s.kind).not.toBe('songbird');
        expect(land.canStand(s.home.x, s.home.y)).toBe(true);
      }
      for (const s of land.at(t, 0, PERCH)) if (s.kind === 'songbird') kinds.add('songbird'), expect(s.home).toEqual(PERCH[0]);
    }
    expect([...kinds].sort()).toEqual(['bunny', 'crab', 'songbird']);
  });

  it('follows the day and the weather: no bunny or bird at night or in rain; the crab is out in any weather', () => {
    const land = grown().land;
    // An hour's worth of moments at the same time of day, over several days (a day is 1200 s: an hour is 50).
    const count = (hour: number, rain: number) => {
      const c: Record<string, number> = { crab: 0, bunny: 0, songbird: 0 };
      for (let day = 0; day < 6; day++) for (let dt = 0; dt < 50; dt += 1) for (const s of land.at(at(hour, day) + dt, rain, PERCH)) c[s.kind]++;
      return c;
    };
    const day = count(10, 0);
    expect(day.bunny).toBeGreaterThan(0);
    expect(day.songbird).toBeGreaterThan(0);
    expect(day.crab).toBeGreaterThan(0);
    const night = count(23, 0);
    expect(night.bunny).toBe(0);
    expect(night.songbird).toBe(0);
    expect(night.crab).toBeGreaterThan(0);
    const wet = count(14, 1);
    expect(wet.bunny).toBe(0);
    expect(wet.songbird).toBe(0);
    expect(wet.crab).toBeGreaterThan(0);
  });

  it('is bounded and cheap, and every routine step stands on dry ground', () => {
    const land = grown().land;
    const t0 = performance.now();
    let most = 0;
    for (let t = 0; t < DAY_SECONDS; t += 0.5) {
      const list = land.at(t, 0, PERCH);
      most = Math.max(most, list.length);
      for (const s of list) {
        if (s.kind === 'songbird') continue;
        const r = land.routine(s, s.age);
        // Paused on a spot it chose: standable, dry. (Mid-hop it is between two such spots, over checked ground.)
        if (r.moving) continue;
        expect(land.canStand(Math.round(r.x), Math.round(r.y)), s.id).toBe(true);
        expect(land.wet(r.x, r.y), s.id).toBe(false);
      }
    }
    expect(most).toBeLessThanOrEqual(MAX_LAND_CREATURES);
    expect(MAX_LAND_CREATURES).toBe(Object.values(LAND_SCHEDULE).reduce((n, s) => n + s.lanes, 0));
    expect(performance.now() - t0).toBeLessThan(2500);
  });

  it('has a character: boldness and pace vary between appearances and shrink the reaction reach', () => {
    const land = grown().land;
    const bold = new Set<number>();
    for (let t = 0; t < DAY_SECONDS * 2; t += 5) for (const s of land.at(t, 0, PERCH)) bold.add(s.traits.bold);
    expect(bold.size).toBeGreaterThan(4);
    expect(reach(LAND_REACH.bunnyFlee, { bold: 1, pace: 1 })).toBeLessThan(reach(LAND_REACH.bunnyFlee, { bold: 0, pace: 1 }));
  });
});

describe('land life: meeting the Blobbi', () => {
  it('the crab watches, then hides when the Blobbi comes close, and comes out again once it has gone', () => {
    const live = grown();
    const { t, s } = moment(live, 'crab');
    arrange(live, t, s.home, 90);
    live.update(1 / 60, IDLE_INPUT);
    expect(['walk', 'idle']).toContain(view(live, s.id)?.pose);
    arrange(live, live.worldTime, view(live, s.id)!, reach(LAND_REACH.crabWatch, s.traits) - 4);
    live.update(1 / 60, IDLE_INPUT);
    expect(view(live, s.id)?.pose).toBe('watch');
    const before = { x: view(live, s.id)!.x, y: view(live, s.id)!.y };
    arrange(live, live.worldTime, before, reach(LAND_REACH.crabHide, s.traits) - 3);
    live.update(1 / 60, IDLE_INPUT);
    expect(view(live, s.id)?.pose).toBe('hide');
    expect(view(live, s.id)).toMatchObject({ x: before.x, y: before.y }); // it stays put while hidden
    arrange(live, live.worldTime, before, 90);
    for (let i = 0; i < 60 * 3.5; i++) live.update(1 / 60, IDLE_INPUT);
    expect(['walk', 'idle']).toContain(view(live, s.id)?.pose);
  });

  it('the bunny sits up to watch, bolts away to standable ground when the Blobbi gets too close, then rests and watches', () => {
    const live = grown();
    const { t, s } = moment(live, 'bunny');
    arrange(live, t, s.home, 100);
    live.update(1 / 60, IDLE_INPUT);
    expect(['hop', 'nibble', 'idle']).toContain(view(live, s.id)?.pose);
    const v0 = view(live, s.id)!;
    arrange(live, live.worldTime, v0, reach(LAND_REACH.bunnyWatch, s.traits) - 4);
    live.update(1 / 60, IDLE_INPUT);
    const v1 = view(live, s.id)!;
    expect(v1.pose).toBe('sit');
    expect(v1.dir).toBe(live.blobbi.x >= v1.x ? 1 : -1); // facing the Blobbi
    arrange(live, live.worldTime, v1, reach(LAND_REACH.bunnyFlee, s.traits) - 3);
    const near = Math.hypot(v1.x - live.blobbi.x, v1.y - live.blobbi.y);
    live.update(1 / 60, IDLE_INPUT);
    expect(view(live, s.id)?.pose).toBe('hop');
    for (let i = 0; i < 60; i++) live.update(1 / 60, IDLE_INPUT);
    const v2 = view(live, s.id)!;
    expect(Math.hypot(v2.x - live.blobbi.x, v2.y - live.blobbi.y)).toBeGreaterThan(near + 10);
    expect(live.land.canStand(Math.round(v2.x), Math.round(v2.y))).toBe(true);
    expect(live.land.wet(v2.x, v2.y)).toBe(false);
    expect(['sit', 'idle']).toContain(v2.pose);
  });

  it('the songbird comes to a feeder: a shy one flies off when the Blobbi nears, a tame one sings when it keeps still', () => {
    const live = grown();
    live.inventory.add(BUILDINGS['bird-feeder'].item!, 1);
    expect(findBuildSpot(live, 'bird-feeder')).toBe(true);
    expect(live.startPlacing(BUILDINGS['bird-feeder'].item!)).toBe(true);
    pressE(live);
    run(live, 150);
    const feeder = live.buildings.find((b) => b.kind === 'bird-feeder')!;
    expect(feeder).toBeDefined();
    // Shy: within a wingbeat it is gone, and stays gone for this appearance.
    const shy = moment(live, 'songbird', (s) => s.traits.bold < 0.35, 4);
    arrange(live, shy.t, shy.s.home, 60);
    for (let i = 0; i < 60 * 2; i++) live.update(1 / 60, IDLE_INPUT); // its flight in ends
    expect(['perch', 'peck']).toContain(view(live, shy.s.id)?.pose);
    expect(view(live, shy.s.id)).toMatchObject({ x: shy.s.home.x });
    arrange(live, live.worldTime, shy.s.home, reach(LAND_REACH.birdStartle, shy.s.traits) - 3);
    live.update(1 / 60, IDLE_INPUT);
    expect(view(live, shy.s.id)?.pose).toBe('fly');
    for (let i = 0; i < 60 * 2; i++) live.update(1 / 60, IDLE_INPUT);
    expect(view(live, shy.s.id)).toBeUndefined();
    // Tame: a Blobbi that stands still nearby gets a song, and notes rise from the feeder.
    const tame = moment(live, 'songbird', (s) => s.traits.bold > 0.35, 4);
    arrange(live, tame.t, tame.s.home, 30);
    live.particles.particles.length = 0;
    for (let i = 0; i < 60 * 4; i++) live.update(1 / 60, IDLE_INPUT);
    expect(view(live, tame.s.id)?.pose).toBe('sing');
    expect(live.particles.particles.some((p) => p.kind === 'note')).toBe(true);
  });

  it('the Blobbi remarks on a creature once per kind per world day, never while it hides, and nothing is saved', () => {
    const live = grown();
    const bubble = () => live.bubble as { text: string } | null;
    /** Come upon a creature: far first, then within noticing distance; what the Blobbi says, if anything. */
    const meet = (m: { t: number; s: LandSighting }) => {
      arrange(live, m.t, m.s.home, 120);
      live.update(1 / 60, IDLE_INPUT);
      live.bubble = null;
      arrange(live, live.worldTime, view(live, m.s.id) ?? m.s.home, LAND_REACH.notice - 6); // (standing there runs one step)
      live.update(1 / 60, IDLE_INPUT);
      return bubble()?.text ?? null;
    };
    const first = moment(live, 'bunny');
    arrange(live, first.t, first.s.home, 120);
    live.update(1 / 60, IDLE_INPUT);
    expect(bubble()).toBeNull(); // nothing from afar
    expect(meet(first)).toBe(lang('idle.seeBunny'));
    live.bubble = null;
    for (let i = 0; i < 30; i++) live.update(1 / 60, IDLE_INPUT);
    expect(bubble()).toBeNull(); // not again for this one
    const D = dayAt(live.worldTime);
    // Another bunny the same day: no remark. A crab the same day: its own remark. A bunny the next day: again.
    const second = moment(live, 'bunny', (x) => x.id !== first.s.id, 3, live.worldTime);
    expect(dayAt(second.t)).toBe(D);
    expect(meet(second)).toBeNull();
    const crab = moment(live, 'crab', () => true, 3, live.worldTime);
    expect(dayAt(crab.t)).toBe(D);
    expect(meet(crab)).toBe(lang('idle.seeCrab'));
    const next = moment(live, 'bunny', () => true, 3, at(10, D));
    expect(dayAt(next.t)).toBe(D + 1);
    expect(meet(next)).toBe(lang('idle.seeBunny'));
  });

  it('never draws from the island\'s streams: leaves, sparkles, butterflies and birds fall the same with or without it', () => {
    const a = grown();
    const b = grown();
    (b as unknown as { stepLandLife: () => void }).stepLandLife = () => {};
    const { t, s } = moment(a, 'bunny');
    arrange(a, t, s.home, 30);
    arrange(b, t, s.home, 30);
    const ambient = (live: LiveWorld) => live.particles.particles.filter((p) => p.kind !== 'note').map((p) => `${p.kind} ${p.x.toFixed(3)} ${p.y.toFixed(3)} ${p.age.toFixed(3)}`).sort();
    let creatures = 0;
    for (let i = 0; i < 60 * 20; i++) {
      a.update(1 / 60, IDLE_INPUT);
      b.update(1 / 60, IDLE_INPUT);
      expect(ambient(a)).toEqual(ambient(b));
      creatures = Math.max(creatures, a.landViews.length);
    }
    expect(creatures).toBeGreaterThan(0);
    expect(b.landViews.length).toBe(0);
  });

  it('is drawn where it stands, as a tiny sprite with the creature\'s own colours', () => {
    const live = grown();
    const { t, s } = moment(live, 'crab');
    arrange(live, t, s.home, 60);
    live.update(1 / 60, IDLE_INPUT);
    const v = view(live, s.id)!;
    const frame = new LiveRenderer(live).render(160, 120, Math.round(v.x) - 80, Math.round(v.y) - 60, live.clock.time, { ...DEFAULT_LIVE_OPTIONS, hud: false });
    let shell = 0;
    for (let y = -4; y <= 2; y++) for (let x = -5; x <= 5; x++) if (frame.get(80 + x, 60 + y) === hex('#d8683a')) shell++;
    expect(shell).toBeGreaterThan(3);
    // Sprites: every kind and pose has art, facing both ways, with its feet on the anchor row.
    for (const kind of ['crab', 'bunny', 'songbird'] as const)
      for (const pose of ['walk', 'idle', 'watch', 'hide', 'hop', 'sit', 'nibble', 'perch', 'peck', 'sing', 'fly'] as const) {
        const r = landSprite(kind, pose, 0, 1);
        const l = landSprite(kind, pose, 0, -1);
        expect(r.buffer.width).toBe(l.buffer.width);
        expect(r.anchorY).toBe(r.buffer.height - 1);
        let opaque = 0;
        for (const c of r.buffer.data) if (c >>> 24) opaque++;
        expect(opaque).toBeGreaterThan(3);
      }
  });
});
