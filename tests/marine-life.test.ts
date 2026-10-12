/**
 * M10 marine life: a sea that is alive but quiet — fish schools, jellyfish, now and then a dolphin, the curious
 * seal by the shore, a rare glowing ray at night — a pure function of the world and world time (deterministic,
 * nothing simulated or saved), cheap, never over land; the seal and the ray are met with E through the existing
 * discovery, journal and quest systems.
 */
import { describe, expect, it } from 'vitest';
import { MarineLife, MARINE_SCHEDULE, SEAL_REACH, type MarineKind } from '../src/game/marine-life';
import { LiveWorld } from '../src/sim/live-world';
import { LiveRenderer, DEFAULT_LIVE_OPTIONS } from '../src/render/live-render';
import { generateTurtleWorld } from '../src/world/turtle-world';
import { generateWhaleWorld } from '../src/carriers/whale-world';
import { NEW_WORLD_SHELL_VARIANT } from '../src/carrier/types';
import { loadSave, memoryStore, saveKey } from '../src/game/persistence';
import { lightAt, DAY_SECONDS } from '../src/game/daylight';
import { goalDone } from '../src/game/objectives';
import { QUEST_CONTENT } from '../src/content/quests';
import { SEA_DISCOVERIES } from '../src/content/discoveries';
import { pressE, run, stand } from '../src/dev/scripted-play';
import { T } from '../src/world/types';

const make = () => generateTurtleWorld('marine-test', { turtleSeed: 'mt', shellVariant: NEW_WORLD_SHELL_VARIANT, generatedHouse: false });

/** A live world grown to `stage` (the land reaching the water), as a save makes it. */
function grown(stage = 2, store = memoryStore()): LiveWorld {
  const probe = new LiveWorld(make(), 'blobbi-9', 16, { store });
  probe.growth = { stage, version: 3, history: [], regions: [] };
  probe.save();
  const live = new LiveWorld(make(), 'blobbi-9', 16, { store });
  live.brain.enabled = false;
  return live;
}

/** Move the world clock to the first moment at or after `from` that shows `kind` past its first seconds. */
function meet(live: LiveWorld, kind: MarineKind, from = 0) {
  for (let t = from; t < from + DAY_SECONDS * 6; t += 0.5) {
    const s = live.marine.at(t).find((x) => x.kind === kind && x.age > 2 && x.span - x.age > 6);
    if (s) {
      live.timeOffset += t - live.worldTime;
      return s;
    }
  }
  throw new Error(`no ${kind}`);
}

describe('the sea around the island', () => {
  const live = grown(2);
  const sea = live.marine;

  it('is a pure function of the world and the time (another instance, another day: the same; another seed: not)', () => {
    const again = new MarineLife(live.world, [], (x, y) => live.collision.canStand(x, y, live.blobbi.footRx, live.blobbi.footRy));
    for (const t of [0, 13.5, 400, 777.25, 2500]) expect(JSON.stringify(again.at(t))).toBe(JSON.stringify(sea.at(t)));
    const other = new MarineLife(generateWhaleWorld('another', { carrierSeed: 'w', generatedHouse: false }), []);
    let differ = 0;
    for (let t = 0; t < 600; t += 10) if (JSON.stringify(other.at(t).map((s) => s.kind)) !== JSON.stringify(sea.at(t).map((s) => s.kind))) differ++;
    expect(differ).toBeGreaterThan(5);
  });

  it('is quiet: a handful at once; dolphins now and then; the glowing ray rare and only at night', () => {
    const ids = new Map<MarineKind, Set<string>>();
    let most = 0;
    for (let t = 0; t < DAY_SECONDS * 5; t += 1) {
      const l = sea.at(t);
      most = Math.max(most, l.length);
      for (const s of l) {
        (ids.get(s.kind) ?? ids.set(s.kind, new Set()).get(s.kind)!).add(s.id);
        if (s.kind === 'glowray') expect(lightAt(t).night).toBe(true);
      }
    }
    const perDay = (k: MarineKind) => (ids.get(k)?.size ?? 0) / 5;
    expect(most).toBeLessThanOrEqual(Object.values(MARINE_SCHEDULE).reduce((n, s) => n + s.lanes, 0));
    expect(most).toBeLessThanOrEqual(10);
    expect(perDay('school')).toBeGreaterThan(50);
    expect(perDay('jelly')).toBeGreaterThan(10);
    expect(perDay('dolphin')).toBeGreaterThan(2);
    expect(perDay('dolphin')).toBeLessThan(15);
    expect(perDay('seal')).toBeGreaterThan(5);
    expect(perDay('glowray')).toBeGreaterThan(0.2);
    expect(perDay('glowray')).toBeLessThan(2);
  });

  it('never over land; fish in the shallows; the seal within a wave of ground the Blobbi can stand on', () => {
    const { width, cls } = live.world.terrain;
    for (let t = 0; t < DAY_SECONDS * 2; t += 7)
      for (const s of sea.at(t)) {
        expect(sea.wet(Math.round(s.x), Math.round(s.y)), `${s.kind} at ${s.x},${s.y}`).toBe(true);
        if (s.kind === 'seal') {
          expect(live.collision.canStand(s.shore!.x, s.shore!.y, live.blobbi.footRx, live.blobbi.footRy)).toBe(true);
          expect(Math.hypot(s.shore!.x - s.x, s.shore!.y - s.y)).toBeLessThan(SEAL_REACH);
        }
      }
    for (const p of sea.shallow) expect(cls[p.y * width + p.x]).toBe(T.SHALLOW);
  });

  it('is cheap: a day of moments in well under a second', () => {
    // This process's CPU time, not the wall clock (other test processes share the machine; see KI-34).
    const c0 = process.cpuUsage();
    for (let t = 0; t < DAY_SECONDS; t += 0.25) sea.at(t);
    const c = process.cpuUsage(c0);
    expect((c.user + c.system) / 1000).toBeLessThan(1000);
  });

  it('is drawn: the seal shows in the frame where it surfaces', () => {
    const s = meet(live, 'seal');
    const frame = new LiveRenderer(live).render(40, 30, Math.round(s.x) - 20, Math.round(s.y) - 15, live.clock.time, { ...DEFAULT_LIVE_OPTIONS, hud: false });
    const sealGrey = new Set([0xff60504e, 0xff90807d, 0xffb8aba9]);
    let n = 0;
    for (const c of frame.data) if (sealGrey.has(c)) n++;
    expect(n).toBeGreaterThan(4);
  });
});

describe('meeting the seal and the ray', () => {
  it('E waves to the seal: a discovery the first time (keepsake, journal), waves count, the quest completes', () => {
    const store = memoryStore();
    const live = grown(2, store);
    const s = meet(live, 'seal');
    live.resources = live.resources.filter((n) => Math.hypot(n.x - s.shore!.x, n.y - s.shore!.y) > 24);
    stand(live, s.shore!.x, s.shore!.y, 'down');
    expect(live.nearbyMarine()?.kind).toBe('seal');
    expect(live.prompt()).toBe('E  wave to the seal');
    pressE(live);
    run(live, 2);
    expect(live.tally.waved).toBe(1);
    expect(live.found.has('sea:seal')).toBe(true);
    expect(live.inventory.count(SEA_DISCOVERIES[0].item.id)).toBe(1);
    expect(live.noteFor(SEA_DISCOVERIES[0].item.id)).toBe('curious-seal');
    // Again (after the roll): a wave, not a second keepsake.
    run(live, 120);
    pressE(live);
    run(live, 120);
    pressE(live);
    run(live, 2);
    expect(live.tally.waved).toBe(3);
    expect(live.inventory.count(SEA_DISCOVERIES[0].item.id)).toBe(1);
    const quest = QUEST_CONTENT.find((q) => q.id === 'side-sea-friends')!;
    expect(goalDone(quest.goal, { tally: live.tally, inventory: live.inventory, buildings: live.buildings, worldTime: live.worldTime, found: live.found, friendship: 0 } as never)).toBe(true);
    // Saved and loaded: the meeting stays found, the waves counted; the sea itself is not in the save.
    live.save();
    const raw = store.get(saveKey(live.identity))!;
    expect(raw).not.toMatch(/sighting|dolphin|jelly|school|"seal"/);
    expect(loadSave(store, live.identity)!.found).toContain('sea:seal');
    const again = new LiveWorld(make(), 'blobbi-9', 16, { store });
    expect(again.found.has('sea:seal')).toBe(true);
    expect(again.tally.waved).toBe(3);
  });

  it('E by the glowing ray at night: a rare discovery', () => {
    const live = grown(4);
    const s = meet(live, 'glowray');
    expect(lightAt(live.worldTime).night).toBe(true);
    // Stand on the nearest ground within reach of it, if there is any; else meet it from where it passes.
    live.blobbi.x = s.x;
    live.blobbi.y = s.y - 20;
    expect(live.nearbyMarine()?.kind).toBe('glowray');
    expect(live.greetMarine()).toBe(true);
    expect(live.found.has('sea:glowray')).toBe(true);
  });

  it('a visitor can wave, but nothing is counted or found on the host\'s island', () => {
    const host = grown(2);
    const s = meet(host, 'seal');
    host.blobbi.x = s.shore!.x;
    host.blobbi.y = s.shore!.y;
    (host as unknown as { visitor: boolean }).visitor = true; // as a visit would load it
    expect(host.greetMarine()).toBe(true);
    expect(host.tally.waved).toBe(0);
    expect(host.found.has('sea:seal')).toBe(false);
  });
});
