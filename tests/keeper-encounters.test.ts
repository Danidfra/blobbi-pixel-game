/**
 * KEEPER ENCOUNTERS (Living Home, first batch): three small traces of the island's Keepers that its own life brings
 * to light, each a discovery found once (a keepsake, a journal note, nothing new in the save).
 * A. The cairn: a fixture of the base world, placed from the seed on reachable grass apart from everything, solid,
 *    one stone more per growth stage; E at it the first time is the discovery, after that a look.
 * B. The bunny's button: every other bunny that has settled beside the Blobbi leads it a few hops, digs, and sits by
 *    what it found, which can then be picked up while the bunny is about; never once it has been found.
 * C. The ribbon: one tame songbird in four comes to the feeder with a ribbon and leaves it at the feeder's foot when
 *    it sings; a shy bird never; never once it has been found.
 */
import { describe, expect, it } from 'vitest';
import { IDLE_INPUT, LiveWorld } from '../src/sim/live-world';
import { KEEPER_DISCOVERIES, ALL_DISCOVERIES } from '../src/content/discoveries';
import { loreById } from '../src/content/lore';
import { CAIRN_REACH, cairnStones, placeKeeperCairn } from '../src/game/keeper';
import { cairnSprite } from '../src/render/keeper-render';
import { LAND_REACH, BUNNY_APPROACH_AFTER, BUNNY_LEAD_AFTER, BUNNY_DIG, bunnyLeads, birdCarriesRibbon, patience, reach, type LandKind, type LandSighting } from '../src/game/land-life';
import { landSprite } from '../src/render/land-render';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { loadSave, memoryStore, saveKey } from '../src/game/persistence';
import { DAY_SECONDS, START_HOUR, rainAt } from '../src/game/daylight';
import { BUILDINGS } from '../src/game/buildings';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { paletteFor } from '../src/world/generate';
import { findBuildSpot, pressE, run, stand } from '../src/dev/scripted-play';
import { t as lang } from '../src/i18n';

const E = { ...IDLE_INPUT, interact: true };
const make = (seed = 'keeper-test') => generateTurtleWorld(seed, { turtleSeed: 'lt', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });
const at = (hour: number, day = 0) => day * DAY_SECONDS + (((hour - START_HOUR + 24) % 24) / 24) * DAY_SECONDS;
function grown(stage = 2, seed = 'keeper-test', store = memoryStore()): LiveWorld {
  const probe = new LiveWorld(make(seed), 'blobbi-9', 16, { store });
  probe.growth = { stage, version: 3, history: [], regions: [] };
  probe.save();
  const live = new LiveWorld(make(seed), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  live.weather = 'dry';
  return live;
}
function moment(live: LiveWorld, kind: LandKind, pick: (s: LandSighting) => boolean = () => true, from = at(10)): { t: number; s: LandSighting } {
  const perches = (live as unknown as { perches: () => { x: number; y: number }[] }).perches();
  for (let t = from; t < from + DAY_SECONDS * 6; t += 0.5) {
    const h = ((START_HOUR + (t / DAY_SECONDS) * 24) % 24 + 24) % 24;
    if (h < 8 || h > 17 || rainAt(live.world.seed, t) > 0) continue;
    const s = live.land.at(t, 0, perches).find((x) => x.kind === kind && x.age < 3 && pick(x));
    if (s) return { t, s };
  }
  throw new Error(`no ${kind}`);
}
function arrange(live: LiveWorld, t: number, p: { x: number; y: number }, d: number): void {
  live.timeOffset = t - live.clock.time;
  const { footRx: rx, footRy: ry } = live.blobbi;
  for (const a of [Math.PI, 0, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]) {
    const spot = live.collision.nearestFree(Math.round(p.x + Math.cos(a) * d), Math.round(p.y + Math.sin(a) * d), rx, ry);
    if (spot && Math.abs(Math.hypot(spot.x - p.x, spot.y - p.y) - d) < 6) {
      stand(live, spot.x, spot.y, 'down');
      return;
    }
  }
  throw new Error('no spot');
}
type Mood = { phase: string; dig: { x: number; y: number } | null; shown: boolean; drop: { x: number; y: number } | null; ribbon: boolean };
const mood = (live: LiveWorld, id: string) => (live as unknown as { landMoods: Map<string, Mood> }).landMoods.get(id);
const still = (live: LiveWorld, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) live.update(1 / 60, IDLE_INPUT);
};
const untilPhase = (live: LiveWorld, id: string, phase: string, seconds: number) => {
  for (let i = 0; i < seconds * 60 && mood(live, id)?.phase !== phase; i++) live.update(1 / 60, IDLE_INPUT);
  return mood(live, id)?.phase === phase;
};
/** A bold bunny brought beside the Blobbi (the phase-2 encounter), picked by `pick`. */
function beside(live: LiveWorld, pick: (s: LandSighting) => boolean = () => true): LandSighting {
  const { t, s } = moment(live, 'bunny', (x) => x.traits.bold > 0.6 && pick(x));
  arrange(live, t, s.home, 120);
  live.update(1 / 60, IDLE_INPUT);
  const v = live.landViews.find((x) => x.id === s.id)!;
  arrange(live, live.worldTime, v, reach(LAND_REACH.bunnyWatch, s.traits) - 5);
  expect(untilPhase(live, s.id, 'beside', BUNNY_APPROACH_AFTER * patience(s.traits) + 8)).toBe(true);
  return s;
}
/** Walk the Blobbi straight to a spot (no teleport: the key, step by step), at most `seconds`. */
function walkTo(live: LiveWorld, p: { x: number; y: number }, seconds = 6): void {
  for (let i = 0; i < seconds * 60; i++) {
    const dx = p.x - live.blobbi.x;
    const dy = p.y - live.blobbi.y;
    if (Math.hypot(dx, dy) < 6) return;
    live.update(1 / 60, { ...IDLE_INPUT, left: dx < -1, right: dx > 1, up: dy < -1, down: dy > 1 });
  }
}

describe('the content', () => {
  it('three Keeper discoveries, each with a keepsake and a note in the Keeper voice, in the catalogue of all discoveries', () => {
    expect(KEEPER_DISCOVERIES.map((d) => d.id)).toEqual(['keeper:cairn', 'keeper:button', 'keeper:ribbon']);
    for (const d of KEEPER_DISCOVERIES) {
      expect(ALL_DISCOVERIES).toContain(d);
      const note = loreById(d.lore)!;
      expect(note.text.length).toBeGreaterThan(60);
      expect(note.text.length).toBeLessThan(400);
      expect(/Keeper/.test(note.text)).toBe(true);
      expect(d.item.category).toBe('special');
    }
  });
});

describe('A. the growing cairn', () => {
  it('stands on reachable grass from the seed alone, apart from the hub and the discoveries, solid, the same every time, elsewhere on another world', () => {
    const live = grown();
    const c = live.cairn!;
    expect(c).toBeDefined();
    expect(new LiveWorld(make(), 'blobbi-9', 16, { store: memoryStore() }).cairn).toEqual(c);
    expect(grown(2, 'keeper-other').cairn).not.toEqual(c);
    const hub = live.world.hubs[0];
    expect(Math.hypot(c.x - hub.x, c.y - hub.y)).toBeGreaterThanOrEqual(30);
    for (const d of live.hiddenDiscoveries) expect(Math.hypot(c.x - d.x, c.y - d.y)).toBeGreaterThan(24);
    expect(live.collision.canStand(c.x, c.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(false);
    for (const [dx, dy] of [[-8, 0], [8, 0], [0, 6], [0, -6]]) expect(live.collision.canStand(c.x + dx, c.y + dy, live.blobbi.footRx, live.blobbi.footRy)).toBe(true);
    // A world with no ground for it has none (nothing throws).
    expect(placeKeeperCairn(live.world, () => false, () => true, [])).toBeNull();
    // Grown or not, the same spot (a fixture of the base world).
    expect(grown(0).cairn).toEqual(c);
    // Nothing is built over it.
    const bench = BUILDINGS.bench;
    live.inventory.add(bench.item!, 1);
    stand(live, c.x, c.y + 8, 'up');
    expect(live.placementCheck('bench').ok).toBe(false);
  });

  it('grows a stone per growth stage (three to six), moss from the second, a flower at the Sanctuary; drawn on the island', () => {
    expect([0, 1, 2, 3, 4, 7].map(cairnStones)).toEqual([3, 4, 5, 6, 6, 6]);
    const palette = paletteFor('summer');
    const heights = [0, 1, 2, 3, 4].map((st) => cairnSprite(palette, st).buffer.height);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(new Set(heights).size).toBe(5);
    expect(cairnSprite(palette, 2)).toBe(cairnSprite(palette, 2)); // cached
    const live = grown(0);
    const c = live.cairn!;
    const frame = (stage: number) => {
      live.growth.stage = stage;
      return new LiveRenderer(live).render(48, 40, c.x - 24, c.y - 28, live.clock.time, DEFAULT_LIVE_OPTIONS).clone();
    };
    const a = frame(0);
    const b = frame(3);
    expect(a.data).not.toEqual(b.data);
    // Its stones are there at the anchor.
    const s = cairnSprite(palette, 3);
    expect(b.get(24, 28 - 1)).toBe(s.buffer.get(s.anchorX, s.anchorY - 1));
  });

  it('E at it the first time: the discovery (pebble, note, a word); again: a look; a visitor gets only the look; the find survives a reload', () => {
    const store = memoryStore();
    const live = grown(2, 'keeper-test', store);
    const c = live.cairn!;
    stand(live, c.x, c.y + 8, 'up');
    expect(live.nearCairn()).toBe(true);
    expect(live.prompt()).toBe(`E  ${lang('prompt.cairn')}`);
    live.update(1 / 60, E);
    expect(live.found.has('keeper:cairn')).toBe(true);
    const d = KEEPER_DISCOVERIES[0];
    expect(live.inventory.count(d.item.id)).toBe(1);
    expect(live.objectives.lore).toContain('keeper-cairn');
    expect(live.bubble?.text).toBe(lang('discovery.found', { name: d.item.label }));
    expect(live.tally.discoveries).toBe(1);
    run(live, 150);
    live.update(1 / 60, E);
    expect(live.bubble?.text).toBe(lang('say.keeperCairn'));
    expect(live.inventory.count(d.item.id)).toBe(1);
    // Out of reach: nothing.
    stand(live, c.x, c.y + CAIRN_REACH + 12, 'up');
    expect(live.nearCairn()).toBe(false);
    // Saved as any discovery, loaded back.
    live.save();
    expect(loadSave(store, live.identity)!.found).toContain('keeper:cairn');
    const back = new LiveWorld(make(), 'blobbi-9', 16, { store });
    expect(back.found.has('keeper:cairn')).toBe(true);
    expect(JSON.parse(store.get(saveKey(live.identity))!)).not.toHaveProperty('cairn');
    // A visitor: a look, no keepsake.
    const guest = grown(2, 'keeper-guest');
    (guest as unknown as { visitor: boolean }).visitor = true;
    stand(guest, guest.cairn!.x, guest.cairn!.y + 8, 'up');
    guest.update(1 / 60, E);
    expect(guest.found.has('keeper:cairn')).toBe(false);
    expect(guest.bubble?.text).toBe(lang('say.keeperCairn'));
  });
});

describe('B. the bunny\'s discovery', () => {
  it('a bunny settled beside the Blobbi leads it a few hops, digs (puffs of soil), and sits by a button to find; walking over does not scare it; E picks it up', () => {
    const live = grown();
    const s = beside(live, (x) => bunnyLeads(x.seed));
    expect(untilPhase(live, s.id, 'leading', BUNNY_LEAD_AFTER + 1)).toBe(true);
    const m = mood(live, s.id)!;
    expect(m.dig).not.toBeNull();
    const goal = { ...m.dig! };
    expect(Math.hypot(goal.x - live.blobbi.x, goal.y - live.blobbi.y)).toBeGreaterThanOrEqual(14);
    expect(untilPhase(live, s.id, 'digging', 6)).toBe(true);
    live.particles.particles.length = 0;
    still(live, 1);
    expect(live.particles.particles.some((p) => p.kind === 'dust')).toBe(true);
    expect(live.hiddenDiscoveries.some((d) => d.id === 'keeper:button')).toBe(false); // not yet
    expect(untilPhase(live, s.id, 'showing', BUNNY_DIG + 1)).toBe(true);
    const spot = live.hiddenDiscoveries.find((d) => d.id === 'keeper:button')!;
    expect(spot).toBeDefined();
    expect(Math.hypot(spot.x - goal.x, spot.y - goal.y)).toBeLessThan(14);
    // The Blobbi walks over: the bunny stays (it asked it over).
    walkTo(live, spot);
    expect(['showing', 'leaving']).toContain(mood(live, s.id)?.phase);
    expect(live.nearestDiscovery()?.id).toBe('keeper:button');
    expect(live.prompt()).toBe(`E  ${lang('prompt.glinting')}`);
    live.update(1 / 60, E);
    expect(live.found.has('keeper:button')).toBe(true);
    expect(live.inventory.count(KEEPER_DISCOVERIES[1].item.id)).toBe(1);
    expect(live.objectives.lore).toContain('keeper-button');
    expect(live.hiddenDiscoveries.some((d) => d.id === 'keeper:button')).toBe(false);
  });

  it('every other appearance leads, never once the button is found; not picked up, the find goes with the bunny; the same every run', () => {
    expect([0, 1, 2, 3].map(bunnyLeads)).toEqual([true, false, true, false]);
    const plain = grown();
    const s1 = beside(plain, (x) => !bunnyLeads(x.seed));
    still(plain, BUNNY_LEAD_AFTER + 2);
    expect(['beside', 'leaving']).toContain(mood(plain, s1.id)?.phase);
    expect(mood(plain, s1.id)?.dig ?? null).toBeNull(); // (another bunny about may lead; this one does not)
    const found = grown();
    found.found.add('keeper:button');
    const s2 = beside(found, (x) => bunnyLeads(x.seed));
    still(found, BUNNY_LEAD_AFTER + 2);
    expect(['beside', 'leaving']).toContain(mood(found, s2.id)?.phase);
    // Shown but not taken: gone with the appearance.
    const live = grown();
    const s3 = beside(live, (x) => bunnyLeads(x.seed));
    expect(untilPhase(live, s3.id, 'showing', 12)).toBe(true);
    const dug = mood(live, s3.id)!.dig!;
    const shownHere = () => live.hiddenDiscoveries.some((d) => d.id === 'keeper:button' && d.x === dug.x && d.y === dug.y);
    expect(shownHere()).toBe(true);
    still(live, s3.span + 2);
    expect(mood(live, s3.id)).toBeUndefined();
    expect(shownHere()).toBe(false); // (another bunny about may be showing its own by now)
    expect(live.found.has('keeper:button')).toBe(false);
    // Determinism: the dig spot and the moments agree between two worlds.
    const a = grown();
    const b = grown();
    const sa = beside(a, (x) => bunnyLeads(x.seed));
    const sb = beside(b, (x) => bunnyLeads(x.seed));
    expect(sb.id).toBe(sa.id);
    expect(untilPhase(a, sa.id, 'showing', 12)).toBe(true);
    expect(untilPhase(b, sb.id, 'showing', 12)).toBe(true);
    expect(mood(b, sb.id)!.dig).toEqual(mood(a, sa.id)!.dig);
    expect(b.clock.time).toBeCloseTo(a.clock.time, 6);
  });
});

describe('C. the ribbon-bearing bird', () => {
  function feeder(live: LiveWorld) {
    live.inventory.add(BUILDINGS['bird-feeder'].item!, 1);
    expect(findBuildSpot(live, 'bird-feeder')).toBe(true);
    expect(live.startPlacing(BUILDINGS['bird-feeder'].item!)).toBe(true);
    pressE(live);
    run(live, 150);
    return live.buildings.find((b) => b.kind === 'bird-feeder')!;
  }

  it('one tame bird in four comes with a ribbon (drawn in its beak); when it sings it leaves it at the feeder\'s foot, where E finds it', () => {
    expect([0, 1, 2, 3, 4].map(birdCarriesRibbon)).toEqual([true, false, false, false, true]);
    const live = grown();
    const f = feeder(live);
    for (const d of live.hiddenDiscoveries) live.found.add(d.id); // (the island's own finds, out of the way: E takes the nearest)
    const { t, s } = moment(live, 'songbird', (x) => x.traits.bold > 0.35 && birdCarriesRibbon(x.seed));
    arrange(live, t, s.home, 30);
    live.update(1 / 60, IDLE_INPUT);
    expect(live.landViews.find((x) => x.id === s.id)?.ribbon).toBe(true);
    expect(landSprite('songbird', 'perch', 0, 1, true)).not.toBe(landSprite('songbird', 'perch', 0, 1));
    const withR = landSprite('songbird', 'perch', 0, 1, true).buffer;
    const plain = landSprite('songbird', 'perch', 0, 1).buffer;
    let extra = 0;
    for (let y = 0; y < withR.height; y++) for (let x = 0; x < withR.width; x++) if (withR.get(x, y) !== plain.get(x, y)) extra++;
    expect(extra).toBe(2);
    still(live, 5);
    expect(live.landViews.find((x) => x.id === s.id)?.pose).toBe('sing');
    const m = mood(live, s.id)!;
    expect(m.drop).not.toBeNull();
    expect(Math.hypot(m.drop!.x - f.x, m.drop!.y - f.y)).toBeLessThan(8);
    expect(live.landViews.find((x) => x.id === s.id)?.ribbon).toBeUndefined(); // left behind
    const spot = live.hiddenDiscoveries.find((d) => d.id === 'keeper:ribbon')!;
    expect(spot).toBeDefined();
    live.blobbi.x = spot.x;
    live.blobbi.y = spot.y + 3;
    live.update(1 / 60, IDLE_INPUT);
    expect(live.nearestDiscovery()?.id).toBe('keeper:ribbon');
    live.update(1 / 60, E);
    expect(live.found.has('keeper:ribbon')).toBe(true);
    expect(live.inventory.count(KEEPER_DISCOVERIES[2].item.id)).toBe(1);
    expect(live.objectives.lore).toContain('keeper-ribbon');
    expect(live.hiddenDiscoveries.some((d) => d.id === 'keeper:ribbon')).toBe(false);
  });

  it('a shy bird never carries one, nor any bird once it is found; a visitor sees none', () => {
    const live = grown();
    feeder(live);
    const shy = moment(live, 'songbird', (x) => x.traits.bold <= 0.35 && birdCarriesRibbon(x.seed));
    arrange(live, shy.t, shy.s.home, 60);
    live.update(1 / 60, IDLE_INPUT);
    expect(live.landViews.find((x) => x.id === shy.s.id)?.ribbon).toBeUndefined();
    const found = grown();
    feeder(found);
    found.found.add('keeper:ribbon');
    const tame = moment(found, 'songbird', (x) => x.traits.bold > 0.35 && birdCarriesRibbon(x.seed));
    arrange(found, tame.t, tame.s.home, 30);
    found.update(1 / 60, IDLE_INPUT);
    expect(found.landViews.find((x) => x.id === tame.s.id)?.ribbon).toBeUndefined();
    still(found, 5);
    expect(found.hiddenDiscoveries.some((d) => d.id === 'keeper:ribbon')).toBe(false);
    const guest = grown();
    feeder(guest);
    (guest as unknown as { visitor: boolean }).visitor = true;
    const g = moment(guest, 'songbird', (x) => x.traits.bold > 0.35 && birdCarriesRibbon(x.seed));
    arrange(guest, g.t, g.s.home, 30);
    guest.update(1 / 60, IDLE_INPUT);
    expect(guest.landViews.find((x) => x.id === g.s.id)?.ribbon).toBeUndefined();
  });
});

describe('other worlds', () => {
  it('a whale island has its cairn too, on its own ground', () => {
    const live = new LiveWorld(generateWhaleWorld('keeper-whale', { carrierSeed: 'w', generatedHouse: false }), 'blobbi-9', 16, { store: memoryStore() });
    const c = live.cairn!;
    expect(c).toBeDefined();
    expect(live.collision.canStand(c.x, c.y + 6, live.blobbi.footRx, live.blobbi.footRy)).toBe(true);
  });
});
